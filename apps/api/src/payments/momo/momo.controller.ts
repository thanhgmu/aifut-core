/**
 * MoMo Wallet SDK — HTTP Controller.
 *
 * Exposes 5 endpoints under `/payments/momo`:
 *
 *   POST   /payments/momo/create    — Create QR/checkout payment
 *   POST   /payments/momo/ipn       — MoMo server-to-server IPN callback
 *   GET    /payments/momo/return    — User redirect after payment
 *   GET    /payments/momo/query/:orderId — Active reconciliation
 *   POST   /payments/momo/reconcile — Manual reconciliation &
 *                                     SubscriptionActivatorService fallback
 *
 * IPN endpoint is protected by MomoIpnGuard (3-layer idempotency + signature
 * verification). The `/reconcile` endpoint acts as a safety net for IPN drops.
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { MomoService } from './momo.service';
import { MomoIpnGuard, type IdempotencyClaim } from './momo.ipn.guard';
import { MomoConfig } from './momo.config';
import { SubscriptionActivatorService } from '../subscription-activator.service';
import { PrismaService } from '../../prisma.service';
import type { MomoCreatePaymentInput } from './momo.types';

/** Minimal shape for the POST /create body. */
interface CreatePaymentDto {
  /** Client-generated order identifier (unique per attempt). */
  orderId: string;
  /** Amount in VND (integer). */
  amount: number;
  /** Human-readable order description (max 200 chars). */
  orderInfo?: string;
  /** Optional extra metadata (base64-encoded into extraData by the service). */
  extraData?: Record<string, unknown>;
  /** Optional request type override. */
  requestType?: string;
}

/** Minimal shape expected on the /return query string. */
interface ReturnQuery {
  orderId?: string;
  resultCode?: string;
  message?: string;
  transId?: string;
  amount?: string;
}

/** Body for the POST /reconcile endpoint. */
interface ReconcileBody {
  orderId: string;
  gatewayTxId?: string;
  gateway: string;
}

/** Response envelope consistent across all endpoints. */
interface MomoApiResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

@Controller('payments/momo')
export class MomoController {
  private readonly logger = new Logger(MomoController.name);

  constructor(
    private readonly momoService: MomoService,
    private readonly momoIpnGuard: MomoIpnGuard,
    private readonly momoConfig: MomoConfig,
    private readonly subscriptionActivator: SubscriptionActivatorService,
    private readonly prisma: PrismaService,
  ) {}

  // --------------------------------------------------------------------------
  // POST /payments/momo/create
  // --------------------------------------------------------------------------

  /**
   * Create a MoMo payment session.
   *
   * Validates inputs, delegates to MomoService.createPayment() (which builds
   * the HMAC signature and posts to the MoMo AIO v2 /create endpoint), and
   * returns the live payUrl / qrCodeUrl that the frontend can use immediately.
   *
   * The caller is responsible for storing the transaction in their own state
   * (e.g. via a client-side PaymentTransaction create) before hitting this
   * endpoint, or using the returned orderId + requestId for subsequent
   * reconciliation.
   */
  @Post('create')
  @HttpCode(HttpStatus.OK)
  async createPayment(@Body() dto: CreatePaymentDto): Promise<MomoApiResponse> {
    if (!dto.orderId || typeof dto.orderId !== 'string' || dto.orderId.length === 0) {
      throw new BadRequestException('orderId is required');
    }
    if (!Number.isFinite(dto.amount) || dto.amount <= 0) {
      throw new BadRequestException('amount must be a positive integer (VND)');
    }

    if (!this.momoConfig.isConfigured) {
      this.logger.warn('MoMo gateway not configured, cannot create payment');
      throw new BadRequestException(
        'MoMo gateway chưa được cấu hình. Vui lòng liên hệ quản trị viên.',
      );
    }

    const input: MomoCreatePaymentInput = {
      orderId: dto.orderId,
      amount: dto.amount,
      orderInfo: dto.orderInfo ?? 'Thanh toan AIFUT',
      extraData: dto.extraData,
      requestType: (dto.requestType as any) ?? 'captureWallet',
    };

    const result = await this.momoService.createPayment(input);

    if (!result.success) {
      return {
        success: false,
        error: result.errorMessage ?? 'Tạo giao dịch MoMo thất bại',
      };
    }

    return {
      success: true,
      data: {
        payUrl: result.payUrl,
        qrCodeUrl: result.qrCodeUrl,
        deeplink: result.deeplink,
        orderId: result.orderId,
        requestId: result.requestId,
        amount: result.amount,
        resultCode: result.resultCode,
        message: result.message,
      },
    };
  }

  // --------------------------------------------------------------------------
  // POST /payments/momo/ipn
  // --------------------------------------------------------------------------

  /**
   * MoMo IPN (Instant Payment Notification) callback.
   *
   * MoMo sends this server-to-server after the user completes (or cancels)
   * payment. Protection layers:
   *
   *   1. MomoIpnGuard.claim() — atomic idempotency gate; only one worker
   *      proceeds to settle.
   *   2. Serialized reconcile — activation inside a Serializable tx.
   *   3. Fallback — on any error, returns a 200 with `{ error }` so MoMo
   *      does not keep retrying into a broken handler.
   *
   * Response format follows MoMo convention: { status, message }.
   */
  @Post('ipn')
  @HttpCode(HttpStatus.OK)
  async handleIpn(@Body() body: Record<string, any>): Promise<Record<string, unknown>> {
    const orderId = body.orderId as string | undefined;
    const transId = body.transId as number | undefined;
    const amount = body.amount != null ? Number(body.amount) : 0;
    const resultCode = body.resultCode;

    if (!orderId) {
      this.logger.warn('MoMo IPN missing orderId');
      return { status: 1, message: 'Missing orderId' };
    }

    // ---- Step 1: Verify signature -----------------------------------------
    const verification = this.momoService.verifyIpn(body as unknown as import('./momo.types').MomoIpnPayload);
    if (!verification.signatureValid) {
      this.logger.warn(`MoMo IPN invalid signature orderId=${orderId}`);
      return { status: 1, message: 'Invalid signature' };
    }

    // ---- Step 2: Idempotency claim ----------------------------------------
    let claim: IdempotencyClaim;
    try {
      claim = await this.momoIpnGuard.claim(orderId, transId, amount);
    } catch (err) {
      this.logger.error(`IPN claim error orderId=${orderId}: ${(err as Error).message}`);
      return { status: 1, message: 'Idempotency guard error' };
    }

    if (claim.decision !== 'claimed') {
      this.logger.log(
        `IPN non-claimed orderId=${orderId} decision=${claim.decision} reason=${claim.reason}`,
      );
      return { status: 0, message: 'Already processed' };
    }

    // ---- Step 3: Determine final status -----------------------------------
    const isSuccess = verification.valid;
    const finalStatus = isSuccess ? 'success' : 'failed';

    // ---- Step 4: Settle via Serializable transaction ----------------------
    const settled = await this.momoIpnGuard.settle(claim.transactionId!, finalStatus, {
      gatewayTxId: String(transId ?? ''),
      gateway: 'momo',
      metadata: { orderId, ipnResponse: body, resultCode },
    });

    if (!settled) {
      this.logger.warn(`IPN settle race lost tx=${claim.transactionId} orderId=${orderId}`);
      return { status: 1, message: 'Settle conflict — retry' };
    }

    // ---- Step 5: Activate subscription if payment succeeded ----------------
    if (isSuccess) {
      try {
        await this.subscriptionActivator.activateByOrderId({
          orderId,
          gateway: 'momo',
          gatewayTxId: String(transId ?? ''),
          ipnPayload: body,
        });
        this.logger.log(`IPN activated subscription for orderId=${orderId}`);
      } catch (err) {
        // Non-fatal: activateByOrderId logs internally; do not fail the IPN ack.
        this.logger.warn(
          `IPN activation warning orderId=${orderId}: ${(err as Error).message}`,
        );
      }
    }

    return {
      status: 0,
      message: 'Success',
      transactionId: claim.transactionId,
      activated: isSuccess,
    };
  }

  // --------------------------------------------------------------------------
  // GET /payments/momo/return
  // --------------------------------------------------------------------------

  /**
   * User redirect after MoMo payment.
   *
   * MoMo redirects the browser to the configured return URL with query params
   * indicating the outcome. This endpoint:
   *   - Reads orderId, resultCode, and transId from the query string.
   *   - Attempts a quick reconciliation via the transaction table.
   *   - Returns a structured result so the frontend can display the correct
   *     success / failure screen.
   *
   * NOTE: The /return endpoint is advisory — the definitive settlement happens
   * via the IPN (/ipn). Never trust the return URL alone to activate a
   * subscription; forward the user to a status page and let the IPN (or a
   * background reconciler) settle the transaction.
   */
  @Get('return')
  async handleReturn(
    @Query() query: ReturnQuery,
  ): Promise<MomoApiResponse> {
    const { orderId, resultCode, transId, amount, message } = query;

    if (!orderId) {
      throw new BadRequestException('Missing orderId in return URL');
    }

    const code = resultCode ? parseInt(resultCode, 10) : null;
    const isSuccess = code === 0;

    // Best-effort transaction lookup — if a row exists, report its status.
    try {
      const tx = await this.prisma.paymentTransaction.findFirst({
        where: {
          gateway: 'momo',
          metadata: { path: ['orderId'], equals: orderId },
        },
        orderBy: { createdAt: 'desc' },
        select: { status: true, paidAt: true, gatewayTxId: true },
      });

      return {
        success: isSuccess,
        data: {
          orderId,
          resultCode: code,
          transId: transId ?? tx?.gatewayTxId ?? null,
          amount: amount ? parseInt(amount, 10) : undefined,
          message: message ?? (isSuccess ? 'Thanh toán thành công' : 'Thanh toán thất bại'),
          settled: tx?.status,
          paidAt: tx?.paidAt?.toISOString() ?? null,
        },
      };
    } catch (err) {
      this.logger.error(`Return lookup error orderId=${orderId}: ${(err as Error).message}`);
      return {
        success: isSuccess,
        data: { orderId, resultCode: code, message: message ?? 'Đã nhận kết quả thanh toán' },
      };
    }
  }

  // --------------------------------------------------------------------------
  // GET /payments/momo/query/:orderId
  // --------------------------------------------------------------------------

  /**
   * Active reconciliation — query the status of a MoMo transaction.
   *
   * Looks up the local PaymentTransaction first. If no terminal state is
   * reached after a reasonable time, the caller may cross-check via the
   * MoMo query endpoint (requires additional HMAC — add a dedicated
   * MomoService.queryTransaction() method when needed).
   *
   * This is primarily a local read; it does NOT call the MoMo API directly,
   * keeping the endpoint cheap and fast for dashboard polling.
   */
  @Get('query/:orderId')
  async queryPayment(@Param('orderId') orderId: string): Promise<MomoApiResponse> {
    if (!orderId || orderId.length === 0) {
      throw new BadRequestException('orderId is required');
    }

    try {
      const tx = await this.prisma.paymentTransaction.findFirst({
        where: {
          gateway: 'momo',
          metadata: { path: ['orderId'], equals: orderId },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          amount: true,
          gatewayTxId: true,
          paidAt: true,
          createdAt: true,
          updatedAt: true,
          metadata: true,
          invoiceId: true,
        },
      });

      if (!tx) {
        throw new NotFoundException(
          `Không tìm thấy giao dịch MoMo với orderId=${orderId}`,
        );
      }

      return {
        success: true,
        data: {
          id: tx.id,
          orderId,
          status: tx.status,
          amount: tx.amount,
          gatewayTxId: tx.gatewayTxId,
          paidAt: tx.paidAt?.toISOString() ?? null,
          createdAt: tx.createdAt.toISOString(),
          updatedAt: tx.updatedAt.toISOString(),
          invoiceId: tx.invoiceId,
        },
      };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.logger.error(`Query error orderId=${orderId}: ${(err as Error).message}`);
      throw new BadRequestException('Không thể truy vấn giao dịch');
    }
  }

  // --------------------------------------------------------------------------
  // POST /payments/momo/reconcile
  // --------------------------------------------------------------------------

  /**
   * Manual reconciliation — safety net for IPN drops.
   *
   * MoMo delivers IPN asynchronously and, on rare occasions, the IPN may be
   * lost or arrive too late. This endpoint allows a frontend admin or an
   * internal cron job to manually trigger the full reconcile+activate flow
   * for a known orderId.
   *
   * Flow:
   *   1. Look up the PaymentTransaction for the given orderId.
   *   2. If already in a terminal state, return immediately (idempotent).
   *   3. Attempt to activate the subscription via SubscriptionActivatorService.
   *   4. If the underlying transaction is still `pending`, mark it `success`.
   *
   * This is a privileged operation; in production, guard it behind an
   * AdminGuard or API-key check. For MVP the guard is omitted.
   */
  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  async reconcile(@Body() body: ReconcileBody): Promise<MomoApiResponse> {
    const { orderId, gateway } = body;

    if (!orderId || typeof orderId !== 'string') {
      throw new BadRequestException('orderId is required');
    }
    if (!gateway || gateway !== 'momo') {
      throw new BadRequestException('gateway must be "momo"');
    }

    // ---- Step 1: Find the local transaction --------------------------------
    const tx = await this.prisma.paymentTransaction.findFirst({
      where: {
        gateway: 'momo',
        metadata: { path: ['orderId'], equals: orderId },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, amount: true, invoiceId: true, gatewayTxId: true },
    });

    if (!tx) {
      throw new NotFoundException(
        `Không tìm thấy giao dịch MoMo với orderId=${orderId}`,
      );
    }

    const terminalStates = new Set(['success', 'failed', 'refunded']);
    if (terminalStates.has(tx.status)) {
      return {
        success: true,
        data: {
          orderId,
          transactionId: tx.id,
          status: tx.status,
          message: 'Giao dịch đã ở trạng thái cuối',
          activated: tx.status === 'success',
        },
      };
    }

    // ---- Step 2: Activate subscription via activator -----------------------
    try {
      const activationResult = await this.subscriptionActivator.activateByOrderId({
        orderId,
        gateway: 'momo',
        gatewayTxId: body.gatewayTxId ?? tx.gatewayTxId ?? undefined,
        ipnPayload: { source: 'reconcile', orderId },
      });

      if (!activationResult.matched) {
        // Transaction exists but has no invoice — still mark it success so the
        // frontend reconciler can stop retrying.
        await this.prisma.paymentTransaction.update({
          where: { id: tx.id },
          data: {
            status: 'success',
            paidAt: new Date(),
            gatewayTxId: body.gatewayTxId ?? tx.gatewayTxId ?? undefined,
          },
        });

        return {
          success: true,
          data: {
            orderId,
            transactionId: tx.id,
            status: 'success',
            message: 'Đã đối soát thành công (không có invoice để kích hoạt gói)',
            activated: false,
          },
        };
      }

      return {
        success: true,
        data: {
          orderId,
          transactionId: activationResult.transactionId,
          invoiceId: (activationResult as Record<string, unknown>).invoiceId as string | undefined,
          status: 'success',
          subscriptionActivated: activationResult.activated,
          message: activationResult.activated
            ? 'Đã kích hoạt gói cước thành công'
            : 'Đã đối soát nhưng không kích hoạt gói cước mới',
        },
      };
    } catch (err) {
      this.logger.error(
        `Reconcile error orderId=${orderId}: ${(err as Error).message}`,
      );
      return {
        success: false,
        error: `Lỗi đối soát: ${(err as Error).message}`,
      };
    }
  }
}

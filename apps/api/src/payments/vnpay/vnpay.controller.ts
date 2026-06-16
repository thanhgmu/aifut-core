/**
 * VNPay SDK — HTTP Controller.
 *
 * Exposes 5 endpoints under `/payments/vnpay`:
 *
 *   GET    /payments/vnpay/create-url   — Build signed VNPay checkout URL
 *   GET    /payments/vnpay/ipn          — VNPay server-to-server IPN callback
 *   GET    /payments/vnpay/return       — User redirect after payment
 *   GET    /payments/vnpay/query/:orderId — Active reconciliation
 *   POST   /payments/vnpay/reconcile    — Manual reconcile + subscription
 *                                         activation fallback for IPN drops
 *
 * IPN endpoint is protected by VnpayIpnGuard (3-layer idempotency + signature
 * verification). The `/reconcile` endpoint acts as a safety net when VNPay's
 * IPN is lost or arrives too late.
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { VnpayService } from './vnpay.service';
import { VnpayIpnGuard } from './vnpay.ipn.guard';
import { VnpayConfig } from './vnpay.config';
import { SubscriptionActivatorService } from '../subscription-activator.service';
import { PrismaService } from '../../prisma.service';
import type { VnpayCreatePaymentInput, VnpayCallbackParams } from './vnpay.types';

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

/** Query params for GET /create-url. */
interface CreateUrlQuery {
  orderId?: string;
  amount?: string;
  orderInfo?: string;
  ipAddress?: string;
  bankCode?: string;
  locale?: string;
  expireMinutes?: string;
  orderType?: string;
}

/** Query params for GET /ipn (full VNPay IPN payload). */
type IpnQuery = VnpayCallbackParams;

/** Query params for GET /return. */
interface ReturnQuery {
  vnp_TxnRef?: string;
  vnp_ResponseCode?: string;
  vnp_TransactionNo?: string;
  vnp_Amount?: string;
  vnp_OrderInfo?: string;
  vnp_PayDate?: string;
  vnp_BankCode?: string;
  vnp_BankTranNo?: string;
  vnp_CardType?: string;
  vnp_SecureHash?: string;
}

/** Body for POST /reconcile. */
interface ReconcileBody {
  orderId: string;
  gatewayTxId?: string;
  gateway: string;
}

/** Generic API response envelope. */
interface VnpayApiResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

@Controller('payments/vnpay')
export class VnpayController {
  private readonly logger = new Logger(VnpayController.name);

  constructor(
    private readonly vnpayService: VnpayService,
    private readonly vnpayIpnGuard: VnpayIpnGuard,
    private readonly vnpayConfig: VnpayConfig,
    private readonly subscriptionActivator: SubscriptionActivatorService,
    private readonly prisma: PrismaService,
  ) {}

  // --------------------------------------------------------------------------
  // GET /payments/vnpay/create-url
  // --------------------------------------------------------------------------

  /**
   * Build a signed VNPay payment URL.
   *
   * Validates required query params, delegates to VnpayService.createPaymentUrl(),
   * and returns the fully-signed payUrl that the frontend or backend can use to
   * redirect the user to the VNPay hosted payment page.
   *
   * VNPay convention: the payment URL is built by the merchant server (this
   * endpoint), and the client simply opens `payUrl` in the browser.
   */
  @Get('create-url')
  async createUrl(@Query() query: CreateUrlQuery): Promise<VnpayApiResponse> {
    const { orderId, amount, orderInfo, ipAddress, bankCode, locale, expireMinutes, orderType } = query;

    if (!orderId || typeof orderId !== 'string' || orderId.length === 0) {
      throw new BadRequestException('orderId is required');
    }
    const amountNum = amount ? parseInt(amount, 10) : NaN;
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      throw new BadRequestException('amount must be a positive integer (VND)');
    }
    if (!orderInfo || orderInfo.length === 0) {
      throw new BadRequestException('orderInfo is required');
    }

    if (!this.vnpayConfig.isConfigured) {
      this.logger.warn('VNPay gateway not configured, cannot create payment URL');
      throw new BadRequestException(
        'Cổng VNPay chưa được cấu hình. Vui lòng liên hệ quản trị viên.',
      );
    }

    const input: VnpayCreatePaymentInput = {
      orderId,
      amount: amountNum,
      orderInfo: orderInfo ?? 'Thanh toan AIFUT',
      ipAddress: ipAddress ?? '127.0.0.1',
      bankCode: bankCode ?? undefined,
      locale: (locale as 'vn' | 'en') ?? undefined,
      expireMinutes: expireMinutes ? parseInt(expireMinutes, 10) : undefined,
      orderType: orderType ?? undefined,
    };

    const result = this.vnpayService.createPaymentUrl(input);

    if (!result.success) {
      return {
        success: false,
        error: result.errorMessage ?? 'Tạo URL thanh toán VNPay thất bại',
      };
    }

    return {
      success: true,
      data: {
        payUrl: result.payUrl,
        orderId: result.orderId,
        amount: result.amount,
        createDate: result.createDate,
      },
    };
  }

  // --------------------------------------------------------------------------
  // GET /payments/vnpay/ipn
  // --------------------------------------------------------------------------

  /**
   * VNPay IPN (Instant Payment Notification) callback.
   *
   * VNPay sends this as a GET request with query parameters after the user
   * completes (or cancels) payment. Protection layers:
   *
   *   1. VnpayService.verifyCallback() — HMAC-SHA512 signature validation.
   *   2. VnpayIpnGuard.claim() — atomic idempotency gate; only one worker
   *      proceeds to settle.
   *   3. Serializable transaction — finalize settlement inside a Serializable
   *      transaction (Layer 3 of the idempotency guard).
   *   4. Fallback — on any error, return `{ RspCode: '99', Message: '...' }`
   *      so VNPay does keep retrying (which is the correct behaviour for a
   *      transient failure).
   *
   * Response follows VNPay IPN acknowledgement format: { RspCode, Message }.
   */
  @Get('ipn')
  @HttpCode(HttpStatus.OK)
  async handleIpn(@Query() query: IpnQuery): Promise<Record<string, string>> {
    const orderId = query.vnp_TxnRef;
    const transactionNo = query.vnp_TransactionNo;
    const amountRaw = query.vnp_Amount ? parseInt(query.vnp_Amount, 10) / 100 : 0;
    const responseCode = query.vnp_ResponseCode;

    if (!orderId) {
      this.logger.warn('VNPay IPN missing vnp_TxnRef');
      return { RspCode: '01', Message: 'Missing orderId' };
    }

    // ---- Step 1: Verify signature -----------------------------------------
    const verification = this.vnpayService.verifyCallback(query);

    if (!verification.signatureValid) {
      this.logger.warn(`VNPay IPN invalid signature orderId=${orderId}`);
      // Return '97' (invalid signature per VNPay spec) to signal checksum fail.
      return { RspCode: '97', Message: 'Invalid signature' };
    }

    // ---- Step 2: Idempotency claim ----------------------------------------
    let claim: Awaited<ReturnType<VnpayIpnGuard['claim']>>;
    try {
      claim = await this.vnpayIpnGuard.claim(orderId, transactionNo, amountRaw);
    } catch (err) {
      this.logger.error(`IPN claim error orderId=${orderId}: ${(err as Error).message}`);
      return { RspCode: '99', Message: 'Idempotency guard error' };
    }

    if (claim.decision !== 'claimed') {
      this.logger.log(
        `IPN non-claimed orderId=${orderId} decision=${claim.decision} reason=${claim.reason}`,
      );
      // Acknowledge success so VNPay stops retrying (already processed).
      return { RspCode: '00', Message: 'Already processed' };
    }

    // ---- Step 3: Determine final status -----------------------------------
    const isSuccess = responseCode === '00';
    const finalStatus = isSuccess ? 'success' : 'failed';

    // ---- Step 4: Settle via Serializable transaction ----------------------
    const settled = await this.vnpayIpnGuard.settle(claim.transactionId!, finalStatus, {
      gatewayTxId: transactionNo ?? claim.transactionId,
      gateway: 'vnpay',
      metadata: {
        vnp_TxnRef: orderId,
        vnp_TransactionNo: transactionNo,
        vnp_ResponseCode: responseCode,
        vnp_PayDate: query.vnp_PayDate,
        vnp_BankCode: query.vnp_BankCode,
        vnp_BankTranNo: query.vnp_BankTranNo,
        vnp_CardType: query.vnp_CardType,
        ipnRaw: query,
      },
    });

    if (!settled) {
      this.logger.warn(`IPN settle race lost tx=${claim.transactionId} orderId=${orderId}`);
      // Return '99' so VNPay retries.
      return { RspCode: '99', Message: 'Settle conflict — retry' };
    }

    // ---- Step 5: Activate subscription if payment succeeded ----------------
    if (isSuccess) {
      try {
        await this.subscriptionActivator.activateByOrderId({
          orderId,
          gateway: 'vnpay',
          gatewayTxId: transactionNo ?? undefined,
          ipnPayload: query as unknown as Record<string, unknown>,
        });
        this.logger.log(`IPN activated subscription for orderId=${orderId}`);
      } catch (err) {
        // Non-fatal: activateByOrderId logs internally; do not fail the IPN ack.
        // The reconcile endpoint (/reconcile) can recover if activation failed here.
        this.logger.warn(
          `IPN activation warning orderId=${orderId}: ${(err as Error).message}`,
        );
      }
    }

    return {
      RspCode: '00',
      Message: 'Confirm Success',
    };
  }

  // --------------------------------------------------------------------------
  // GET /payments/vnpay/return
  // --------------------------------------------------------------------------

  /**
   * User redirect after VNPay payment.
   *
   * VNPay redirects the user's browser to the configured return URL with query
   * params (the full `vnp_*` set). This endpoint:
   *   - Verifies the HMAC signature via VnpayService.verifyCallback().
   *   - Looks up the local PaymentTransaction by vnp_TxnRef.
   *   - Returns a structured result so the frontend can display the correct
   *     success / failure / pending screen.
   *
   * NOTE: The /return endpoint is advisory — the definitive settlement happens
   * via the IPN (/ipn). Never trust the return URL alone to activate a
   * subscription; forward the user to a status page and let the IPN (or a
   * background reconciler) settle the transaction.
   */
  @Get('return')
  async handleReturn(@Query() query: ReturnQuery): Promise<VnpayApiResponse> {
    const orderId = query.vnp_TxnRef;
    const responseCode = query.vnp_ResponseCode;
    const transactionNo = query.vnp_TransactionNo;
    const amountRaw = query.vnp_Amount ? parseInt(query.vnp_Amount, 10) / 100 : undefined;

    if (!orderId) {
      throw new BadRequestException('Missing vnp_TxnRef in return URL');
    }

    // Best-effort signature verification (failure is non-fatal for the return
    // page — the definitive check is on the IPN).
    let verification: ReturnType<VnpayService['verifyCallback']> | null = null;
    try {
      verification = this.vnpayService.verifyCallback(query as unknown as VnpayCallbackParams);
    } catch {
      // Swallow; return page is informational.
    }

    const isSuccess =
      verification?.signatureValid === true && responseCode === '00';
    const isPending =
      verification?.signatureValid === true &&
      responseCode !== '00' &&
      responseCode !== '24'; // 24 = cancelled by user

    // Best-effort transaction lookup.
    try {
      const tx = await this.prisma.paymentTransaction.findFirst({
        where: {
          gateway: 'vnpay',
          metadata: { path: ['vnp_TxnRef'], equals: orderId },
        },
        orderBy: { createdAt: 'desc' },
        select: { status: true, paidAt: true, gatewayTxId: true },
      });

      return {
        success: isSuccess,
        data: {
          orderId,
          vnp_ResponseCode: responseCode,
          vnp_TransactionNo: transactionNo ?? tx?.gatewayTxId ?? null,
          amount: amountRaw,
          vnp_PayDate: query.vnp_PayDate ?? null,
          message: isSuccess
            ? 'Thanh toán VNPay thành công'
            : isPending
              ? 'Giao dịch VNPay đang chờ xử lý'
              : 'Thanh toán VNPay thất bại hoặc đã bị hủy',
          settled: tx?.status,
          paidAt: tx?.paidAt?.toISOString() ?? null,
        },
      };
    } catch (err) {
      this.logger.error(`Return lookup error orderId=${orderId}: ${(err as Error).message}`);
      return {
        success: isSuccess,
        data: {
          orderId,
          vnp_ResponseCode: responseCode,
          vnp_TransactionNo: transactionNo,
          message: isSuccess ? 'Thanh toán thành công' : 'Đã nhận kết quả thanh toán VNPay',
        },
      };
    }
  }

  // --------------------------------------------------------------------------
  // GET /payments/vnpay/query/:orderId
  // --------------------------------------------------------------------------

  /**
   * Active reconciliation — query the status of a VNPay transaction.
   *
   * Looks up the local PaymentTransaction by the stored VNPay vnp_TxnRef.
   * Provides enough context for a dashboard or background cron to determine
   * whether the transaction needs manual intervention.
   *
   * This is primarily a local read; it does NOT call the VNPay query API
   * directly (VnPay's merchant API requires a separate SOAP/XML call),
   * keeping the endpoint cheap and fast for dashboard polling.
   */
  @Get('query/:orderId')
  async queryPayment(@Param('orderId') orderId: string): Promise<VnpayApiResponse> {
    if (!orderId || orderId.length === 0) {
      throw new BadRequestException('orderId is required');
    }

    try {
      const tx = await this.prisma.paymentTransaction.findFirst({
        where: {
          gateway: 'vnpay',
          metadata: { path: ['vnp_TxnRef'], equals: orderId },
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
          `Không tìm thấy giao dịch VNPay với orderId=${orderId}`,
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
      throw new BadRequestException('Không thể truy vấn giao dịch VNPay');
    }
  }

  // --------------------------------------------------------------------------
  // POST /payments/vnpay/reconcile
  // --------------------------------------------------------------------------

  /**
   * Manual reconciliation — safety net for IPN drops.
   *
   * VNPay delivers IPN asynchronously and, on rare occasions, the IPN may be
   * lost or arrive too late. This endpoint allows a frontend admin or an
   * internal cron job to manually trigger the full reconcile+activate flow
   * for a known orderId (vnp_TxnRef).
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
  async reconcile(@Body() body: ReconcileBody): Promise<VnpayApiResponse> {
    const { orderId, gateway } = body;

    if (!orderId || typeof orderId !== 'string') {
      throw new BadRequestException('orderId is required');
    }
    if (!gateway || gateway !== 'vnpay') {
      throw new BadRequestException('gateway must be "vnpay"');
    }

    // ---- Step 1: Find the local transaction --------------------------------
    const tx = await this.prisma.paymentTransaction.findFirst({
      where: {
        gateway: 'vnpay',
        metadata: { path: ['vnp_TxnRef'], equals: orderId },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, amount: true, invoiceId: true, gatewayTxId: true },
    });

    if (!tx) {
      throw new NotFoundException(
        `Không tìm thấy giao dịch VNPay với orderId=${orderId}`,
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
        gateway: 'vnpay',
        gatewayTxId: body.gatewayTxId ?? tx.gatewayTxId ?? undefined,
        ipnPayload: { source: 'reconcile', orderId, gateway: 'vnpay' },
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

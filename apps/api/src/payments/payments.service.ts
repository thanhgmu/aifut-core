import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { VnpayService } from './vnpay/vnpay.service';
import { VnpayConfig } from './vnpay/vnpay.config';
import { MomoService } from './momo/momo.service';
import { MomoConfig } from './momo/momo.config';
import { SubscriptionActivatorService } from './subscription-activator.service';
import {
  PaymentRequest,
  PaymentResponse,
  IpnPayload,
  IpnResult,
  PaymentCapabilities,
} from './payments.types';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vnpayService: VnpayService,
    private readonly vnpayConfig: VnpayConfig,
    private readonly momoService: MomoService,
    private readonly momoConfig: MomoConfig,
    private readonly activator: SubscriptionActivatorService,
  ) {}

  /**
   * Get list of configured payment gateways and their capabilities.
   */
  getCapabilities(): PaymentCapabilities[] {
    const gateways: PaymentCapabilities[] = [];
    if (this.vnpayConfig.isConfigured)
      gateways.push({
        gateway: 'vnpay',
        name: 'VNPay',
        supportedCurrencies: ['VND'],
        paymentMethods: ['qr', 'card', 'bank', 'wallet'],
      });
    if (this.momoConfig.isConfigured) {
      gateways.push({
        gateway: 'momo',
        name: 'MoMo',
        supportedCurrencies: ['VND'],
        paymentMethods: ['qr', 'wallet', 'atm'],
      });
    }
    return gateways;
  }

  /**
   * Create a payment for an invoice.
   * Returns the payment URL for redirect.
   *
   * Note: Gateway-specific endpoints (GET /payments/vnpay/create-url,
   * POST /payments/momo/create) are the canonical flow. This generic
   * endpoint is kept as a convenience bridge for the original controller.
   */
  async createPayment(input: {
    invoiceId?: string;
    tenantId: string;
    accountId: string;
    amount: number;
    currency: string;
    description: string;
    gateway?: string;
    returnUrl: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<PaymentResponse> {
    const orderId = `AIFUT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const gateway = input.gateway || 'vnpay';
    let result: PaymentResponse;

    if (gateway === 'momo') {
      const momoResult = await this.momoService.createPayment({
        orderId,
        amount: input.amount,
        orderInfo: input.description.slice(0, 200),
        requestType: 'captureWallet',
      });
      result = {
        success: momoResult.success,
        paymentUrl: momoResult.payUrl,
        transactionId: momoResult.requestId,
        gateway: 'momo',
        errorMessage: momoResult.errorMessage,
      };
    } else if (gateway === 'vnpay') {
      if (!this.vnpayConfig.isConfigured) {
        return {
          success: false,
          gateway: 'vnpay',
          errorMessage: 'Cổng VNPay chưa được cấu hình.',
        };
      }

      const vnpayResult = this.vnpayService.createPaymentUrl({
        orderId,
        amount: input.amount,
        orderInfo: input.description.slice(0, 200),
        ipAddress: input.ipAddress || '127.0.0.1',
      });

      result = {
        success: vnpayResult.success,
        paymentUrl: vnpayResult.payUrl,
        transactionId: vnpayResult.orderId,
        gateway: 'vnpay',
        errorMessage: vnpayResult.errorMessage,
      };
    } else {
      throw new BadRequestException(`Unsupported payment gateway: ${gateway}`);
    }

    // Save transaction record so async confirmations can resolve it.
    if (result.success) {
      await this.prisma.paymentTransaction.create({
        data: {
          invoiceId: input.invoiceId,
          accountId: input.accountId,
          tenantId: input.tenantId,
          gateway,
          gatewayTxId: result.transactionId,
          amount: input.amount,
          currency: input.currency,
          status: 'pending',
          paymentUrl: result.paymentUrl,
          metadata: { orderId },
        },
      });
    }

    return result;
  }

  /**
   * Handle VNPay IPN callback (legacy path — the dedicated
   * GET /payments/vnpay/ipn endpoint with full idempotency guard
   * is the canonical VNPay IPN handler).
   */
  async handleVnpayIpn(rawPayload: Record<string, any>): Promise<IpnResult> {
    const verification = this.vnpayService.verifyCallback(
      rawPayload as import('./vnpay/vnpay.types').VnpayCallbackParams,
    );

    if (!verification.signatureValid) {
      return {
        success: false,
        status: 'failed',
        errorMessage: verification.reason ?? verification.message,
      };
    }

    const orderId = verification.orderId || (rawPayload['vnp_TxnRef'] as string);
    const transactionNo = verification.transactionNo;
    const isSuccess = verification.valid;
    const amount = verification.amount ?? 0;

    if (isSuccess) {
      await this.prisma.paymentTransaction.updateMany({
        where: { gateway: 'vnpay', gatewayTxId: orderId },
        data: {
          status: 'success',
          paidAt: new Date(),
          gatewayTxId: transactionNo ?? orderId,
          metadata: { ipnResponse: rawPayload },
        },
      });

      const tx = await this.prisma.paymentTransaction.findFirst({
        where: { gateway: 'vnpay', gatewayTxId: orderId },
      });
      if (tx?.invoiceId) {
        await this.activator.activateFromInvoice(tx.invoiceId, new Date());
      }
    }

    return {
      success: isSuccess,
      status: isSuccess ? 'success' : 'failed',
      gatewayTxId: transactionNo ?? orderId,
      amount,
      errorMessage: isSuccess ? undefined : verification.message,
    };
  }

  /**
   * Handle MoMo IPN callback.
   * Delegates signature verification to MomoService.verifyIpn(),
   * quota activation to SubscriptionActivatorService.
   */
  async handleMomoIpn(rawPayload: Record<string, any>): Promise<IpnResult> {
    const verification = this.momoService.verifyIpn(rawPayload as any);

    if (!verification.signatureValid || !verification.valid) {
      return {
        success: false,
        status: 'failed',
        gatewayTxId: String(verification.transId ?? ''),
        amount: verification.amount,
        errorMessage: verification.reason ?? verification.message,
      };
    }

    const orderId = verification.orderId || (rawPayload['orderId'] as string);
    const transId = String(verification.transId ?? rawPayload['transId'] ?? '');

    await this.prisma.paymentTransaction.updateMany({
      where: { gatewayTxId: orderId, gateway: 'momo' },
      data: {
        status: 'success',
        paidAt: new Date(),
        gatewayTxId: transId,
        metadata: { ipnResponse: rawPayload },
      },
    });

    const tx = await this.prisma.paymentTransaction.findFirst({
      where: { gatewayTxId: orderId, gateway: 'momo' },
    });
    if (tx?.invoiceId) {
      await this.activator.activateFromInvoice(tx.invoiceId, new Date());
    }

    return {
      success: true,
      gatewayTxId: transId,
      amount: verification.amount,
      status: 'success',
    };
  }

  /**
   * Get payment history for a tenant.
   */
  async getPaymentHistory(tenantId: string, limit = 20, offset = 0) {
    const [transactions, total] = await Promise.all([
      this.prisma.paymentTransaction.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: { invoice: { select: { number: true, description: true } } },
      }),
      this.prisma.paymentTransaction.count({ where: { tenantId } }),
    ]);
    return { transactions, total, limit, offset };
  }
}

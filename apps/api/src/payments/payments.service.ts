import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { VnpayGateway } from './vnpay.gateway';
import { MomoService } from './momo/momo.service';
import { MomoConfig } from './momo/momo.config';
import { SubscriptionActivatorService } from './subscription-activator.service';
import { PaymentRequest, PaymentResponse, IpnPayload, IpnResult, PaymentCapabilities } from './payments.types';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vnpay: VnpayGateway,
    private readonly momoService: MomoService,
    private readonly momoConfig: MomoConfig,
    private readonly activator: SubscriptionActivatorService,
  ) {}

  /**
   * Get list of configured payment gateways and their capabilities.
   */
  getCapabilities(): PaymentCapabilities[] {
    const gateways: PaymentCapabilities[] = [];
    if (this.vnpay.isConfigured) gateways.push(this.vnpay.capabilities);
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

    const paymentReq: PaymentRequest = {
      amount: input.amount,
      currency: input.currency,
      description: input.description.slice(0, 100),
      orderId,
      returnUrl: input.returnUrl,
      ipnUrl: `${input.returnUrl.split('?')[0]}/api/payments/vnpay/ipn`,
      invoiceId: input.invoiceId,
      metadata: {
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    };

    const gateway = input.gateway || 'vnpay';
    let result: PaymentResponse;

    // Route to appropriate gateway
    if (gateway === 'momo') {
      const momoResult = await this.momoService.createPayment({
        orderId: paymentReq.orderId,
        amount: paymentReq.amount,
        orderInfo: paymentReq.description,
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
      result = await this.vnpay.createPayment(paymentReq);
    } else {
      throw new BadRequestException(`Unsupported payment gateway: ${input.gateway}`);
    }

    // Save transaction record (orderId persisted so async confirmations can resolve it)
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
   * Handle VNPay IPN callback.
   * Quota activation is delegated to SubscriptionActivatorService so the
   * subscription expiry follows the plan interval instead of a fixed window.
   */
  async handleVnpayIpn(rawPayload: Record<string, any>): Promise<IpnResult> {
    const payload: IpnPayload = { raw: rawPayload, gateway: 'vnpay' };
    const result = await this.vnpay.handleIpn(payload);

    if (result.success) {
      const orderId = rawPayload['vnp_TxnRef'] as string;

      // Update transaction status
      await this.prisma.paymentTransaction.updateMany({
        where: { gatewayTxId: orderId, gateway: 'vnpay' },
        data: {
          status: 'success',
          paidAt: new Date(),
          metadata: { ipnResponse: rawPayload },
        },
      });

      // Mark invoice paid + activate the workspace subscription (plan-aware expiry)
      const tx = await this.prisma.paymentTransaction.findFirst({
        where: { gatewayTxId: orderId, gateway: 'vnpay' },
      });
      if (tx?.invoiceId) {
        await this.activator.activateFromInvoice(tx.invoiceId, new Date());
      }
    }

    return result;
  }

  /**
   * Handle MoMo IPN callback.
   * Quota activation is delegated to SubscriptionActivatorService.
   * Uses MomoService.verifyIpn() for signature verification.
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

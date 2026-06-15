import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { VnpayGateway } from './vnpay.gateway';
import { PaymentRequest, PaymentResponse, IpnPayload, IpnResult, PaymentCapabilities } from './payments.types';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vnpay: VnpayGateway,
  ) {}

  /**
   * Get list of configured payment gateways and their capabilities.
   */
  getCapabilities(): PaymentCapabilities[] {
    const gateways: PaymentCapabilities[] = [];
    if (this.vnpay.isConfigured) gateways.push(this.vnpay.capabilities);
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

    let result: PaymentResponse;

    // Route to appropriate gateway
    if (input.gateway === 'vnpay' || !input.gateway) {
      result = await this.vnpay.createPayment(paymentReq);
    } else {
      throw new BadRequestException(`Unsupported payment gateway: ${input.gateway}`);
    }

    // Save transaction record
    if (result.success) {
      await this.prisma.paymentTransaction.create({
        data: {
          invoiceId: input.invoiceId,
          accountId: input.accountId,
          tenantId: input.tenantId,
          gateway: 'vnpay',
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
   */
  async handleVnpayIpn(rawPayload: Record<string, any>): Promise<IpnResult> {
    const payload: IpnPayload = { raw: rawPayload, gateway: 'vnpay' };
    const result = await this.vnpay.handleIpn(payload);

    if (result.success) {
      // Update transaction status
      await this.prisma.paymentTransaction.updateMany({
        where: { gatewayTxId: rawPayload['vnp_TxnRef'] as string, gateway: 'vnpay' },
        data: {
          status: 'success',
          gatewayTxId: result.gatewayTxId,
          paidAt: new Date(),
          metadata: { ipnResponse: rawPayload },
        },
      });

      // Update invoice status
      const tx = await this.prisma.paymentTransaction.findFirst({
        where: { gatewayTxId: rawPayload['vnp_TxnRef'] as string, gateway: 'vnpay' },
        include: { invoice: true },
      });
      if (tx?.invoiceId) {
        await this.prisma.invoice.update({
          where: { id: tx.invoiceId },
          data: { status: 'paid', paidAt: new Date() },
        });

        // Update subscription if this was a subscription invoice
        if (tx.invoice?.subscriptionId) {
          await this.prisma.subscription.update({
            where: { id: tx.invoice.subscriptionId },
            data: { status: 'active', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
          });
        }
      }
    }

    return result;
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

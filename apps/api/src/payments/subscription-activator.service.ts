import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * SubscriptionActivatorService
 *
 * Single source of truth for activating / extending a Workspace (tenant)
 * subscription quota after a payment is confirmed successful — regardless of
 * which gateway delivered the confirmation (VNPay return/IPN, MoMo IPN, or
 * Stripe webhook).
 *
 * Responsibilities:
 *  - Mark the related invoice as paid.
 *  - Activate the subscription and compute a plan-aware expiry
 *    (MONTHLY → +1 month, YEARLY → +12 months, ONE_TIME → no expiry).
 *  - Support renewal: extend from the current expiry when the subscription is
 *    still in the future, otherwise extend from now.
 *
 * Keeping all quota-activation logic here avoids the previous "+30 days hard
 * coded" drift scattered across each gateway handler.
 */
@Injectable()
export class SubscriptionActivatorService {
  private readonly logger = new Logger(SubscriptionActivatorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute the next expiry date for a plan interval, starting from `base`.
   * Returns null for ONE_TIME plans (no recurring expiry).
   */
  computeExpiry(interval: string, base: Date): Date | null {
    const next = new Date(base);
    switch ((interval || '').toUpperCase()) {
      case 'YEARLY':
        next.setMonth(next.getMonth() + 12);
        return next;
      case 'ONE_TIME':
        return null;
      case 'MONTHLY':
      default:
        next.setMonth(next.getMonth() + 1);
        return next;
    }
  }

  /**
   * Activate (or renew) a subscription by its id, computing a plan-aware expiry.
   * Renewal-safe: if the subscription is still valid in the future, the new
   * period is stacked on top of the existing expiry.
   */
  async activateBySubscriptionId(subscriptionId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!sub) throw new NotFoundException(`Subscription '${subscriptionId}' not found`);

    const now = new Date();
    const interval = sub.plan?.interval ?? 'MONTHLY';

    // Stack onto remaining time when renewing an active subscription.
    const base = sub.expiresAt && sub.expiresAt.getTime() > now.getTime() ? sub.expiresAt : now;
    const expiresAt = this.computeExpiry(interval, base);

    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'active',
        startedAt: sub.startedAt ?? now,
        expiresAt,
        cancelledAt: null,
        autoRenew: true,
      },
    });

    this.logger.log(
      `Activated subscription ${sub.id} (plan=${sub.planKey}, interval=${interval}, expiresAt=${expiresAt?.toISOString() ?? 'never'})`,
    );
    return updated;
  }

  /**
   * Activate a subscription off the back of a paid invoice.
   * Marks the invoice paid and activates the linked subscription (if any).
   */
  async activateFromInvoice(invoiceId: string, paidAt: Date = new Date()) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException(`Invoice '${invoiceId}' not found`);

    if (invoice.status !== 'paid') {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'paid', paidAt },
      });
    }

    if (invoice.subscriptionId) {
      const sub = await this.activateBySubscriptionId(invoice.subscriptionId);
      return { invoiceId: invoice.id, subscription: sub, activated: true };
    }

    this.logger.warn(`Invoice ${invoice.id} paid but has no subscriptionId — nothing to activate`);
    return { invoiceId: invoice.id, subscription: null, activated: false };
  }

  /**
   * Resolve a successful payment by its order/transaction reference, mark the
   * payment transaction successful, then activate the related invoice's
   * subscription. `orderId` matches the `metadata.orderId` saved on creation,
   * with a fallback to `gatewayTxId`.
   */
  async activateByOrderId(input: {
    orderId: string;
    gateway: string;
    gatewayTxId?: string;
    paidAt?: Date;
    ipnPayload?: Record<string, any>;
  }) {
    const paidAt = input.paidAt ?? new Date();

    // Find by stored orderId (JSON metadata) first, then by gatewayTxId.
    let tx = await this.prisma.paymentTransaction.findFirst({
      where: { gateway: input.gateway, metadata: { path: ['orderId'], equals: input.orderId } },
      orderBy: { createdAt: 'desc' },
    });
    if (!tx && input.gatewayTxId) {
      tx = await this.prisma.paymentTransaction.findFirst({
        where: { gateway: input.gateway, gatewayTxId: input.gatewayTxId },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!tx) {
      this.logger.warn(`No payment transaction found for order ${input.orderId} (gateway=${input.gateway})`);
      return { matched: false, activated: false };
    }

    await this.prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: {
        status: 'success',
        gatewayTxId: input.gatewayTxId ?? tx.gatewayTxId,
        paidAt,
        metadata: { ...(tx.metadata as any), ipnResponse: input.ipnPayload ?? null },
      },
    });

    if (tx.invoiceId) {
      const result = await this.activateFromInvoice(tx.invoiceId, paidAt);
      return { matched: true, transactionId: tx.id, ...result };
    }

    this.logger.warn(`Payment transaction ${tx.id} has no invoiceId — quota not activated`);
    return { matched: true, transactionId: tx.id, activated: false };
  }
}

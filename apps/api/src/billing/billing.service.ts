import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SUPPORTED_CURRENCIES, Currency, EXCHANGE_RATES, CURRENCY_SYMBOLS } from './billing.constants';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Account ────────────────────────────────────────────────────────────────

  async getOrCreateAccount(tenantId: string, preferredCurrency?: Currency) {
    let acct = await this.prisma.billingAccount.findUnique({ where: { tenantId } });
    if (!acct) {
      acct = await this.prisma.billingAccount.create({
        data: { tenantId, currency: preferredCurrency ?? 'VND', billingPeriod: 'monthly' },
      });
    } else if (preferredCurrency && acct.currency !== preferredCurrency) {
      acct = await this.prisma.billingAccount.update({
        where: { id: acct.id },
        data: { currency: preferredCurrency },
      });
    }
    return acct;
  }

  // ── Plans ──────────────────────────────────────────────────────────────────

  async seedDefaultPlans() {
    const plans = [
      {
        key: 'free',
        name: 'Miễn phí',
        price: 0,
        interval: 'MONTHLY' as const,
        maxUsers: 1,
        maxWorkflows: 3,
        aiCallsMonthly: 500,
        storageGB: 1,
        features: { localOnly: true },
      },
      {
        key: 'starter',
        name: 'Cơ bản',
        price: 99000,
        interval: 'MONTHLY' as const,
        maxUsers: 1,
        maxWorkflows: 10,
        aiCallsMonthly: 1000,
        storageGB: 5,
        features: { cloudBackup: true },
      },
      {
        key: 'pro',
        name: 'Chuyên nghiệp',
        price: 490000,
        interval: 'MONTHLY' as const,
        maxUsers: 3,
        maxWorkflows: -1,
        aiCallsMonthly: 5000,
        storageGB: 50,
        features: { cloudBackup: true, multiDevice: true, marketplace: true },
      },
      {
        key: 'team',
        name: 'Doanh nghiệp',
        price: 990000,
        interval: 'MONTHLY' as const,
        maxUsers: 10,
        maxWorkflows: -1,
        aiCallsMonthly: 20000,
        storageGB: 200,
        features: { cloudBackup: true, multiDevice: true, marketplace: true, api: true, analytics: true },
      },
    ];

    for (const plan of plans) {
      const exists = await this.prisma.subscriptionPlan.findUnique({ where: { key: plan.key } });
      if (!exists) {
        await this.prisma.subscriptionPlan.create({ data: plan });
      }
    }
    return this.prisma.subscriptionPlan.findMany({ orderBy: { price: 'asc' } });
  }

  /** Convert VND price to target currency */
  convertPrice(vndPrice: number, targetCurrency: Currency): number {
    if (targetCurrency === 'VND') return vndPrice;
    const usdPrice = vndPrice / EXCHANGE_RATES.VND;
    const rate = EXCHANGE_RATES[targetCurrency] ?? 1;
    return Math.round(usdPrice * rate);
  }

  /** Format price with currency symbol */
  formatPrice(amount: number, currency: Currency): string {
    const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
    if (currency === 'VND') return `${amount.toLocaleString('vi-VN')}${symbol}`;
    return `${symbol}${amount.toFixed(2)}`;
  }

  async listPlans(targetCurrency?: Currency) {
    const plans = await this.prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { price: 'asc' } });
    if (!targetCurrency) return plans;
    return plans.map((p) => ({
      ...p,
      priceDisplay: this.formatPrice(this.convertPrice(p.price, targetCurrency), targetCurrency),
      priceInCurrency: this.convertPrice(p.price, targetCurrency),
      prices: Object.fromEntries(
        SUPPORTED_CURRENCIES.map((c) => [c, { amount: this.convertPrice(p.price, c), display: this.formatPrice(p.price, c) }]),
      ),
    }));
  }

  async getPlan(key: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { key } });
    if (!plan) throw new NotFoundException(`Plan '${key}' not found`);
    return plan;
  }

  // ── Subscription ───────────────────────────────────────────────────────────

  async subscribe(tenantId: string, planKey: string, trialDays = 0) {
    const plan = await this.getPlan(planKey);
    const account = await this.getOrCreateAccount(tenantId);

    // Deactivate existing active subscriptions
    await this.prisma.subscription.updateMany({
      where: { accountId: account.id, status: 'active' },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });

    const now = new Date();
    let expiresAt: Date | null = null;
    let trialEndsAt: Date | null = null;

    if (plan.interval !== 'ONE_TIME') {
      const months = plan.interval === 'YEARLY' ? 12 : 1;
      expiresAt = new Date(now);
      expiresAt.setMonth(expiresAt.getMonth() + months);
    }

    if (trialDays > 0) {
      trialEndsAt = new Date(now);
      trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
    }

    const sub = await this.prisma.subscription.create({
      data: {
        accountId: account.id,
        planKey,
        tenantId,
        status: trialDays > 0 ? 'trialing' : 'active',
        startedAt: now,
        expiresAt,
        trialEndsAt,
      },
    });

    return sub;
  }

  /**
   * Subscribe and immediately create an invoice + pending payment transaction
   * for paid plans (no trial). Returns payment info so the frontend can redirect
   * the user to the payment gateway.
   *
   * Free / trialing plans just call through to the regular subscribe path.
   */
  async subscribeAndPay(tenantId: string, planKey: string, gateway = 'vnpay') {
    const plan = await this.getPlan(planKey);
    const account = await this.getOrCreateAccount(tenantId);

    // Free / trial plans → no invoice needed
    if (plan.price === 0) {
      return { sub: await this.subscribe(tenantId, planKey), invoice: null, payment: null, requiresPayment: false };
    }

    // Deactivate existing
    await this.prisma.subscription.updateMany({
      where: { accountId: account.id, status: 'active' },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });

    const now = new Date();
    const months = plan.interval === 'YEARLY' ? 12 : 1;
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + months);

    // Create subscription in 'payment_pending' — only activated after payment confirmed
    const sub = await this.prisma.subscription.create({
      data: {
        accountId: account.id,
        planKey,
        tenantId,
        status: 'payment_pending',
        startedAt: now,
        expiresAt,
      },
    });

    // Create invoice
    const invoiceNumber = `INV-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
    const invoice = await this.prisma.invoice.create({
      data: {
        accountId: account.id,
        tenantId,
        subscriptionId: sub.id,
        number: invoiceNumber,
        description: `${plan.name} — ${plan.interval === 'YEARLY' ? 'Yearly' : 'Monthly'} Subscription`,
        amount: plan.price,
        currency: account.currency,
        status: 'pending',
        dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 day grace
      },
    });

    // Create payment transaction (pending, will be activated by webhook/IPN)
    const orderId = `AIFUT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const paymentTx = await this.prisma.paymentTransaction.create({
      data: {
        invoiceId: invoice.id,
        accountId: account.id,
        tenantId,
        gateway,
        gatewayTxId: orderId,
        amount: plan.price,
        currency: account.currency,
        status: 'pending',
        metadata: { orderId, type: 'subscription_purchase' },
      },
    });

    return {
      sub,
      invoice,
      paymentTx,
      requiresPayment: true,
      orderId,
      invoiceId: invoice.id,
    };
  }

  async getCurrentSubscription(tenantId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['active', 'trialing', 'payment_pending'] } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });
    return sub ?? { status: 'none', tenantId, description: 'No active subscription' };
  }

  async cancelSubscription(subscriptionId: string) {
    return this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'cancelled', cancelledAt: new Date(), autoRenew: false },
    });
  }

  // ── Usage ──────────────────────────────────────────────────────────────────

  async recordUsage(input: {
    tenantId: string; category: string; metric: string; value: number; metadata?: any;
  }) {
    const account = await this.getOrCreateAccount(input.tenantId);
    return this.prisma.usageRecord.create({
      data: {
        accountId: account.id,
        tenantId: input.tenantId,
        category: input.category,
        metric: input.metric,
        value: input.value,
        recordedAt: new Date(),
        metadata: input.metadata ?? {},
      },
    });
  }

  async getUsage(tenantId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return this.prisma.usageRecord.findMany({
      where: { tenantId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'desc' },
      take: 1000,
    });
  }

  // ── Invoices & Transactions (real data for dashboard) ───────────────────────

  /**
   * Return the tenant's invoices joined with their related payment transactions,
   * mapped into the dashboard-friendly InvoiceRow shape. Uses an interactive
   * Prisma transaction so account resolution + invoice fetch stay consistent.
   */
  async getInvoices(tenantId: string, take = 50) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.billingAccount.findUnique({ where: { tenantId } });
      if (!account) return [];

      const invoices = await tx.invoice.findMany({
        where: { tenantId, accountId: account.id },
        orderBy: { createdAt: 'desc' },
        take,
        include: {
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      return invoices.map((inv) => {
        const lastPayment = (inv as any).payments?.[0] ?? null;
        return {
          id: inv.id,
          number: inv.number,
          date: (inv.createdAt ?? new Date()).toISOString(),
          description: inv.description ?? '',
          amount: inv.amount,
          amountDisplay: this.formatPrice(inv.amount, (inv.currency as Currency) ?? 'VND'),
          status: inv.status,
          method: lastPayment?.gateway ?? '—',
          downloadUrl: null,
        };
      });
    });
  }

  /**
   * Return the tenant's payment transactions mapped into the dashboard-friendly
   * TransactionRow shape. Wrapped in a Prisma transaction for a consistent read.
   */
  async getTransactions(tenantId: string, take = 50) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.billingAccount.findUnique({ where: { tenantId } });
      if (!account) return [];

      const transactions = await tx.paymentTransaction.findMany({
        where: { tenantId, accountId: account.id },
        orderBy: { createdAt: 'desc' },
        take,
        include: {
          invoice: { select: { number: true, description: true } },
        },
      });

      return transactions.map((t) => {
        const meta = (t.metadata as any) ?? {};
        const isRefund = t.status === 'refunded' || meta?.type === 'refund';
        const desc =
          (t as any).invoice?.description ??
          (meta?.type ? String(meta.type).replace(/_/g, ' ') : `Payment via ${t.gateway}`);
        return {
          id: t.id,
          date: (t.createdAt ?? new Date()).toISOString(),
          kind: isRefund ? 'refund' : 'charge',
          description: desc,
          amountDisplay: this.formatPrice(t.amount, (t.currency as Currency) ?? 'VND'),
          status: t.status,
        };
      });
    });
  }
}

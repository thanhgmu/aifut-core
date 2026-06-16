import { Controller, Get, Post, Put, Headers, Param, Body, NotFoundException, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BillingService } from './billing.service';
import { BILLING_ROADMAP } from './billing.constants';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveTenantId(slug: string) {
    const t = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!t) throw new NotFoundException(`Tenant '${slug}' not found`);
    return t.id;
  }

  @Post('seed-plans')
  async seed() {
    return this.billing.seedDefaultPlans();
  }

  @Get('plans')
  async listPlans(@Query('currency') currency?: string) {
    return this.billing.listPlans(currency as any);
  }

  @Get('plans/:key')
  async getPlan(@Param('key') key: string) {
    return this.billing.getPlan(key);
  }

  @Post('subscribe')
  async subscribe(
    @Headers('x-tenant-slug') slug: string,
    @Body() body: { planKey: string; trialDays?: number },
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.billing.subscribe(tenantId, body.planKey, body.trialDays ?? 0);
  }

  /**
   * Subscribe and pay — creates subscription (pending payment), generates
   * an invoice, and pre-creates a PaymentTransaction. The frontend should
   * redirect the user to the payment gateway with the returned invoiceId
   * or orderId.
   *
   * POST /billing/subscribe-and-pay
   * Headers: x-tenant-slug
   * Body: { planKey, gateway?: "vnpay" | "momo" }
   */
  @Post('subscribe-and-pay')
  async subscribeAndPay(
    @Headers('x-tenant-slug') slug: string,
    @Body() body: { planKey: string; gateway?: string; returnUrl?: string },
  ) {
    const tenantId = await this.resolveTenantId(slug);
    const gateway = body.gateway || 'vnpay';
    const result = await this.billing.subscribeAndPay(tenantId, body.planKey, gateway);

    // For free/trial plans, no payment needed.
    if (!result.requiresPayment) {
      return {
        requiresPayment: false,
        subscription: result.sub,
        message: 'Subscribed successfully (free plan)',
      };
    }

    const returnUrl = body.returnUrl || 'http://localhost:3000/payment';

    // Build the payment URL for the gateway
    let paymentUrl: string;
    if (gateway === 'momo') {
      paymentUrl = `${returnUrl}?orderId=${result.orderId}&gateway=momo`;
    } else {
      // VNPay — frontend will POST to /payments/create for a real redirect
      paymentUrl = `/payments/create?invoiceId=${result.invoiceId}&returnUrl=${encodeURIComponent(returnUrl)}`;
    }

    return {
      requiresPayment: true,
      orderId: result.orderId,
      invoiceId: result.invoiceId,
      subscriptionId: result.sub.id,
      invoiceNumber: result.invoice?.number,
      amount: result.invoice?.amount,
      currency: result.invoice?.currency,
      gateway,
      paymentUrl,
    };
  }

  @Get('subscription')
  async currentSubscription(@Headers('x-tenant-slug') slug: string) {
    const tenantId = await this.resolveTenantId(slug);
    return this.billing.getCurrentSubscription(tenantId);
  }

  @Post('subscription/:id/cancel')
  async cancelSubscription(@Param('id') id: string) {
    return this.billing.cancelSubscription(id);
  }

  @Get('account')
  async getAccount(@Headers('x-tenant-slug') slug: string) {
    const tenantId = await this.resolveTenantId(slug);
    return this.billing.getOrCreateAccount(tenantId);
  }

  @Put('account/currency')
  async setCurrency(
    @Headers('x-tenant-slug') slug: string,
    @Body() body: { currency: string },
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.billing.getOrCreateAccount(tenantId, body.currency as any);
  }

  @Post('usage')
  async recordUsage(
    @Headers('x-tenant-slug') slug: string,
    @Body() body: { category: string; metric: string; value: number; metadata?: any },
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.billing.recordUsage({ tenantId, ...body });
  }

  @Get('usage')
  async getUsage(
    @Headers('x-tenant-slug') slug: string,
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.billing.getUsage(tenantId);
  }

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'billing',
      status: 'foundation',
      supports: { plans: true, subscriptions: true, usageMetering: true, invoicing: true },
      next: BILLING_ROADMAP,
    };
  }

  /**
   * Real invoice history for the tenant's billing dashboard.
   * GET /billing/invoices
   * Headers: x-tenant-slug
   */
  @Get('invoices')
  async getInvoices(
    @Headers('x-tenant-slug') slug: string,
    @Query('take') take?: string,
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.billing.getInvoices(tenantId, take ? Number(take) : 50);
  }

  /**
   * Real payment transaction history for the tenant's billing dashboard.
   * GET /billing/transactions
   * Headers: x-tenant-slug
   */
  @Get('transactions')
  async getTransactions(
    @Headers('x-tenant-slug') slug: string,
    @Query('take') take?: string,
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.billing.getTransactions(tenantId, take ? Number(take) : 50);
  }

  @Get('roadmap')
  roadmap() {
    return { capability: 'billing', roadmap: BILLING_ROADMAP };
  }
}

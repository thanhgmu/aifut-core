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
      supports: { plans: true, subscriptions: true, usageMetering: true, invoicing: false },
      next: BILLING_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return { capability: 'billing', roadmap: BILLING_ROADMAP };
  }
}

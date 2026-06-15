import { Controller, Get, Headers, NotFoundException, Param } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from './prisma.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('summary')
  async summary() {
    return this.analytics.getPlatformSummary();
  }

  @Get('revenue')
  async revenue() {
    const [
      totalRevenue,
      activeSubscriptions,
      monthlyRevenue,
      totalInvoices,
      paidInvoices,
      pendingInvoices,
    ] = await Promise.all([
      this.prisma.invoice.aggregate({ _sum: { amount: true }, where: { status: 'paid' } }),
      this.prisma.subscription.count({ where: { status: 'active' } }),
      this.prisma.invoice.aggregate({
        _sum: { amount: true },
        where: {
          status: 'paid',
          paidAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.invoice.count(),
      this.prisma.invoice.count({ where: { status: 'paid' } }),
      this.prisma.invoice.count({ where: { status: 'pending' } }),
    ]);

    return {
      totalRevenue: Number(totalRevenue._sum?.amount ?? 0),
      monthlyRevenue: Number(monthlyRevenue._sum?.amount ?? 0),
      activeSubscriptions,
      invoices: {
        total: totalInvoices,
        paid: paidInvoices,
        pending: pendingInvoices,
      },
      currency: 'VND',
      generatedAt: new Date().toISOString(),
    };
  }

  @Get('tenant')
  async tenantAnalytics(@Headers('x-tenant-slug') slug: string) {
    if (!slug) throw new NotFoundException('x-tenant-slug header required');
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException(`Tenant '${slug}' not found`);
    return this.analytics.getTenantAnalytics(tenant.id);
  }

  @Get('industries')
  async industries() {
    return this.analytics.getIndustryAdoption();
  }

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'analytics',
      status: 'active',
      supports: {
        platformSummary: true,
        revenueSummary: true,
        tenantAnalytics: true,
        industryAdoption: true,
        timeSeries: false,
        benchmarks: false,
      },
    };
  }
}

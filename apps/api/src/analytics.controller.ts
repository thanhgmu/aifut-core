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
        tenantAnalytics: true,
        industryAdoption: true,
        timeSeries: false,   // coming in Phase 2
        benchmarks: false,   // coming in Phase 3
      },
    };
  }
}

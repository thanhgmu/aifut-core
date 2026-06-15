import { Controller, Get, Headers, NotFoundException, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AiBillingMeterService } from '../ai-billing-meter.service';

@Controller('billing-meter')
export class BillingMeterController {
  constructor(
    private readonly meter: AiBillingMeterService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveTenantId(slug: string) {
    const t = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!t) throw new NotFoundException(`Tenant '${slug}' not found`);
    return t.id;
  }

  /**
   * Get comprehensive billing summary for a tenant.
   * Shows usage vs plan limits for AI, storage, workflows.
   */
  @Get('summary')
  async getSummary(@Headers('x-tenant-slug') slug: string) {
    const tenantId = await this.resolveTenantId(slug);
    return this.meter.getBillingSummary(tenantId);
  }

  /**
   * Check if a specific feature is accessible given the tenant's plan.
   * Used by frontend for feature gating.
   */
  @Get('feature-access')
  async checkFeature(
    @Headers('x-tenant-slug') slug: string,
    @Query('feature') feature: string,
  ) {
    if (!feature) {
      return { allowed: false, reason: 'Feature parameter is required' };
    }
    const tenantId = await this.resolveTenantId(slug);
    return this.meter.checkFeatureAccess(tenantId, feature);
  }

  /**
   * Check multiple features at once.
   */
  @Get('feature-access-batch')
  async checkFeatures(
    @Headers('x-tenant-slug') slug: string,
    @Query('features') features: string,
  ) {
    const featureList = features.split(',').map((f) => f.trim()).filter(Boolean);
    if (featureList.length === 0) {
      return { results: [] };
    }
    const tenantId = await this.resolveTenantId(slug);
    const results = await Promise.all(
      featureList.map((feature) => this.meter.checkFeatureAccess(tenantId, feature)),
    );
    return {
      features: Object.fromEntries(featureList.map((f, i) => [f, results[i]])),
    };
  }

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'billing-meter',
      status: 'active',
      supports: {
        aiUsageMetering: true,
        storageTracking: true,
        featureGating: true,
        usageAlerts: false,
      },
    };
  }
}

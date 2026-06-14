import { Controller, Get, Post, Body, Headers, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ResellerService } from './reseller.service';
import { RESELLER_ROADMAP } from './reseller.constants';

@Controller('reseller')
export class ResellerController {
  constructor(
    private readonly reseller: ResellerService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveTenantId(slug: string) {
    const t = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!t) throw new NotFoundException(`Tenant '${slug}' not found`);
    return t.id;
  }

  @Post('register')
  async register(
    @Headers('x-tenant-slug') slug: string,
    @Body() body: { commissionRate?: number; discountRate?: number },
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.reseller.registerReseller(tenantId, body.commissionRate, body.discountRate);
  }

  @Get('profile')
  async profile(@Headers('x-tenant-slug') slug: string) {
    const tenantId = await this.resolveTenantId(slug);
    return this.reseller.getReseller(tenantId);
  }

  @Post('sub-tenants')
  async onboardSub(
    @Headers('x-tenant-slug') slug: string,
    @Body() body: { slug: string; name: string; subscriptionKey?: string },
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.reseller.onboardSubTenant(tenantId, body);
  }

  @Get('sub-tenants')
  async listSubs(@Headers('x-tenant-slug') slug: string) {
    const tenantId = await this.resolveTenantId(slug);
    return this.reseller.listSubTenants(tenantId);
  }

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'reseller',
      status: 'foundation',
      supports: { registration: true, subTenantOnboarding: true, commissionTracking: false, portals: false },
      next: RESELLER_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return { capability: 'reseller', roadmap: RESELLER_ROADMAP };
  }
}

import { Controller, Get, Post, Delete, Headers, Param, Body, NotFoundException, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MarketplaceService } from './marketplace.service';
import { MARKETPLACE_ROADMAP } from './marketplace.constants';

@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveTenantId(slug: string) {
    const t = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!t) throw new NotFoundException(`Tenant '${slug}' not found`);
    return t.id;
  }

  @Post('listings')
  async create(@Body() body: any) {
    return this.marketplace.createListing(body);
  }

  @Get('listings')
  async list(
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('industry') industry?: string,
  ) {
    return this.marketplace.listListings(type, category, industry);
  }

  @Get('listings/:key')
  async get(@Param('key') key: string) {
    return this.marketplace.getListing(key);
  }

  @Delete('listings/:key')
  async delete(@Param('key') key: string) {
    return this.marketplace.deleteListing(key);
  }

  @Post('listings/:key/install')
  async install(
    @Headers('x-tenant-slug') slug: string,
    @Param('key') key: string,
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.marketplace.installListing(tenantId, key);
  }

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'marketplace',
      status: 'foundation',
      supports: { browsing: true, installTemplate: true, publishConnector: false, revenueSharing: false },
      next: MARKETPLACE_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return { capability: 'marketplace', roadmap: MARKETPLACE_ROADMAP };
  }
}

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Headers,
  Param,
  Body,
  NotFoundException,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MarketplaceService } from './marketplace.service';
import { MARKETPLACE_ROADMAP } from './marketplace.constants';

/**
 * Marketplace Controller v2 — Community Connector & Template Marketplace.
 *
 * Endpoints:
 *   ├── GET    /marketplace/stats              — platform-wide stats
 *   ├── GET    /marketplace/listings           — browse (paginated, filtered, sorted)
 *   ├── GET    /marketplace/listings/:key      — single listing detail
 *   ├── POST   /marketplace/listings           — submit a new listing (community)
 *   ├── PUT    /marketplace/listings/:key      — update listing metadata
 *   ├── DELETE /marketplace/listings/:key      — delete listing
 *   ├── POST   /marketplace/listings/:key/install  — install for a tenant
 *   ├── POST   /marketplace/listings/:key/approve  — admin: publish
 *   ├── POST   /marketplace/listings/:key/reject   — admin: reject & delete
 *   ├── POST   /marketplace/listings/:key/rate     — submit/update rating
 *   ├── GET    /marketplace/listings/:key/ratings  — paginated reviews
 *   ├── GET    /marketplace/pending             — admin: pending queue
 *   ├── GET    /marketplace/capabilities        — capability introspection
 *   └── GET    /marketplace/roadmap             — roadmap status
 */
@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Tenant resolution helper ──────────────────────────────────────

  private async resolveTenantId(slug: string): Promise<string> {
    const t = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!t) throw new NotFoundException(`Tenant '${slug}' not found`);
    return t.id;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SECTION 1 — STATS / DISCOVER
  // ═══════════════════════════════════════════════════════════════════

  /** Platform-wide marketplace statistics */
  @Get('stats')
  async stats() {
    return this.marketplace.getPlatformStats();
  }

  /**
   * Browse published marketplace listings with full control over:
   *   - Filter: type, category, industry
   *   - Search: full-text on name, description, tags
   *   - Sort: newest | popular | rating | price_asc | price_desc
   *   - Pagination: page, pageSize
   */
  @Get('listings')
  async list(
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('industry') industry?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize?: number,
  ) {
    return this.marketplace.listListings({
      type,
      category,
      industry,
      search,
      sort: (sort as any) ?? 'newest',
      publishedOnly: true,
      page: Math.max(1, page ?? 1),
      pageSize: Math.max(1, Math.min(100, pageSize ?? 20)),
    });
  }

  /** Get a single listing by key */
  @Get('listings/:key')
  async get(@Param('key') key: string) {
    return this.marketplace.getListing(key);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SECTION 2 — SUBMIT / COMMUNITY CONTRIBUTION
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Submit a new community listing.
   * Defaults to unpublished — requires admin approval to go live.
   */
  @Post('listings')
  async create(@Body() body: any) {
    return this.marketplace.submitListing({
      tenantId: body.tenantId ?? null,
      type: body.type,
      key: body.key,
      name: body.name,
      description: body.description,
      category: body.category,
      industry: body.industry,
      price: body.price ?? 0,
      currency: body.currency ?? 'VND',
      authorName: body.authorName,
      authorEmail: body.authorEmail,
      config: body.config,
      tags: body.tags,
    });
  }

  /** Update listing metadata */
  @Put('listings/:key')
  async update(@Param('key') key: string, @Body() body: any) {
    return this.marketplace.updateListing(key, {
      name: body.name,
      description: body.description,
      category: body.category,
      industry: body.industry,
      price: body.price,
      currency: body.currency,
      version: body.version,
      tags: body.tags,
      config: body.config,
    });
  }

  /** Delete a listing */
  @Delete('listings/:key')
  async delete(@Param('key') key: string) {
    return this.marketplace.deleteListing(key);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SECTION 3 — INSTALL
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Install a listing for a tenant.
   * Requires x-tenant-slug header for tenant resolution.
   */
  @Post('listings/:key/install')
  async install(
    @Headers('x-tenant-slug') slug: string,
    @Param('key') key: string,
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.marketplace.installListing(tenantId, key);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SECTION 4 — ADMIN: APPROVE / REJECT / PENDING
  // ═══════════════════════════════════════════════════════════════════

  /** Admin: approve a pending submission → publish it */
  @Post('listings/:key/approve')
  async approve(@Param('key') key: string) {
    return this.marketplace.approveListing(key);
  }

  /** Admin: reject & delete a pending submission */
  @Post('listings/:key/reject')
  async reject(@Param('key') key: string) {
    return this.marketplace.rejectListing(key);
  }

  /** Admin: get all pending (unpublished) submissions */
  @Get('pending')
  async pending() {
    return this.marketplace.getPendingSubmissions();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SECTION 5 — RATINGS & REVIEWS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Rate a marketplace listing (1-5 stars).
   * Each tenant can submit one rating; subsequent calls update it.
   */
  @Post('listings/:key/rate')
  async rate(
    @Param('key') key: string,
    @Body() body: { tenantId: string; rating: number; review?: string },
  ) {
    return this.marketplace.rateListing({
      tenantId: body.tenantId,
      listingKey: key,
      rating: body.rating,
      review: body.review,
    });
  }

  /** Get paginated ratings/reviews for a listing */
  @Get('listings/:key/ratings')
  async ratings(
    @Param('key') key: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize?: number,
  ) {
    return this.marketplace.getRatings(key, page, pageSize);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SECTION 6 — CAPABILITY INTROSPECTION
  // ═══════════════════════════════════════════════════════════════════

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'marketplace',
      status: 'community',
      supports: {
        browsing: true,
        search: true,
        pagination: true,
        sort: true,
        installTemplate: true,
        installConnector: true,
        publishConnector: true,
        ratings: true,
        reviews: true,
        adminApproval: true,
        pendingQueue: true,
        revenueSharing: false,
      },
      next: MARKETPLACE_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return { capability: 'marketplace', roadmap: MARKETPLACE_ROADMAP };
  }
}

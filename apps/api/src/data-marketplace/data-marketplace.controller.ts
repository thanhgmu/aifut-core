// ═══════════════════════════════════════════════════════════════════════════
// data-marketplace.controller.ts — Data Marketplace REST API
// ═══════════════════════════════════════════════════════════════════════════
// Route gốc: /v1/data-marketplace
// Products, purchases, consent management.
// ═══════════════════════════════════════════════════════════════════════════

import {
  Controller, Get, Post, Patch, Delete,
  Headers, Query, Param, Body,
  BadRequestException, NotFoundException,
} from '@nestjs/common';
import { DataMarketplaceService } from './data-marketplace.service';

@Controller('v1/data-marketplace')
export class DataMarketplaceController {
  constructor(private readonly dm: DataMarketplaceService) {}

  // ── Products ──────────────────────────────────────────────────────
  @Get('products')
  async listProducts(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.dm.listPublishedProducts({
      category,
      search,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      limit: parseInt(limit ?? '20', 10) || 20,
      offset: parseInt(offset ?? '0', 10) || 0,
    });
  }

  @Get('products/:id')
  async getProduct(@Param('id') id: string) {
    const product = await this.dm.getProductById(id);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  @Get('mine/products')
  async getMyProducts(@Headers('x-tenant-id') tenantId: string) {
    if (!tenantId) throw new BadRequestException('x-tenant-id required');
    return this.dm.getMyProducts(tenantId);
  }

  @Post('mine/products')
  async createProduct(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: {
      name: string;
      description?: string;
      category?: string;
      tags?: string[];
      format?: string;
      price?: number;
      currency?: string;
      sampleData?: any;
      schema?: any;
      rowCount?: number;
      sizeBytes?: number;
    },
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id required');
    if (!body.name) throw new BadRequestException('name is required');
    return this.dm.createProduct(tenantId, body);
  }

  @Patch('mine/products/:id')
  async updateProduct(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: any,
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id required');
    return this.dm.updateProduct(id, tenantId, body);
  }

  @Post('mine/products/:id/publish')
  async publish(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id required');
    return this.dm.publishProduct(id, tenantId);
  }

  @Post('mine/products/:id/unpublish')
  async unpublish(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id required');
    return this.dm.unpublishProduct(id, tenantId);
  }

  @Delete('mine/products/:id')
  async deleteProduct(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id required');
    return this.dm.deleteProduct(id, tenantId);
  }

  // ── Purchase ──────────────────────────────────────────────────────
  @Post('products/:id/purchase')
  async purchase(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id required');
    return this.dm.purchaseProduct(id, tenantId);
  }

  @Get('purchases')
  async getMyPurchases(@Headers('x-tenant-id') tenantId: string) {
    if (!tenantId) throw new BadRequestException('x-tenant-id required');
    return this.dm.getMyPurchases(tenantId);
  }

  // ── Consent ───────────────────────────────────────────────────────
  @Get('consents')
  async getConsents(@Headers('x-tenant-id') tenantId: string) {
    if (!tenantId) throw new BadRequestException('x-tenant-id required');
    return this.dm.getConsents(tenantId);
  }

  @Post('consents')
  async setConsent(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: {
      purpose: string;
      scope: string;
      isActive?: boolean;
      expiresAt?: string;
    },
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id required');
    if (!body.purpose || !body.scope) {
      throw new BadRequestException('purpose and scope are required');
    }
    return this.dm.setConsent(
      tenantId,
      body.purpose,
      body.scope,
      body.isActive ?? true,
      body.expiresAt ? new Date(body.expiresAt) : undefined,
    );
  }

  @Delete('consents/:id')
  async revokeConsent(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id required');
    return this.dm.revokeConsent(id, tenantId);
  }
}

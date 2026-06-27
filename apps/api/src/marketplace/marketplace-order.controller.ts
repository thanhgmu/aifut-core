// ═══════════════════════════════════════════════════════════════════════════
// marketplace-order.controller.ts — Marketplace Purchase REST API
// ═══════════════════════════════════════════════════════════════════════════
// Route gốc: /v1/marketplace/orders
// Tenant isolation qua x-tenant-id header.

import {
  Controller,
  Get,
  Post,
  Headers,
  Param,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { MarketplaceOrderService } from './marketplace-order.service';

@Controller('v1/marketplace/orders')
export class MarketplaceOrderController {
  constructor(private readonly orderService: MarketplaceOrderService) {}

  /**
   * POST /v1/marketplace/orders/purchase
   * Mua một listing trên marketplace.
   */
  @Post('purchase')
  async purchase(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { listingKey: string; metadata?: Record<string, unknown> },
  ) {
    this.requireTenantId(tenantId);
    if (!body.listingKey) {
      throw new BadRequestException('listingKey is required.');
    }
    return this.orderService.purchase({
      listingKey: body.listingKey,
      buyerTenantId: tenantId,
      metadata: body.metadata,
    });
  }

  /**
   * GET /v1/marketplace/orders
   * Lấy danh sách order của tenant hiện tại.
   */
  @Get()
  async listOrders(
    @Headers('x-tenant-id') tenantId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.requireTenantId(tenantId);
    return this.orderService.listOrders(tenantId, {
      status,
      page: parseInt(page ?? '1', 10) || 1,
      pageSize: parseInt(pageSize ?? '20', 10) || 20,
    });
  }

  /**
   * GET /v1/marketplace/orders/sales
   * Báo cáo doanh thu cho developer.
   */
  @Get('sales')
  async salesReport(
    @Headers('x-tenant-id') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.requireTenantId(tenantId);
    return this.orderService.getSalesReport(tenantId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: parseInt(page ?? '1', 10) || 1,
      pageSize: parseInt(pageSize ?? '20', 10) || 20,
    });
  }

  private requireTenantId(tenantId?: string): asserts tenantId is string {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header is required.');
    }
  }
}

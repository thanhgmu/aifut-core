// ═══════════════════════════════════════════════════════════════════════════
// payout.controller.ts — Developer Payout REST API
// ═══════════════════════════════════════════════════════════════════════════
// Route gốc: /v1/developer/payout
// Quản lý rút tiền và lịch sử giao dịch cho developer marketplace.

import {
  Controller,
  Get,
  Post,
  Headers,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { PayoutService } from './payout.service';

@Controller('v1/developer/payout')
export class PayoutController {
  constructor(private readonly payout: PayoutService) {}

  /**
   * GET /v1/developer/payout/balance
   * Số dư khả dụng của developer.
   */
  @Get('balance')
  async getBalance(@Headers('x-tenant-id') tenantId: string) {
    this.requireTenant(tenantId);
    return this.payout.getBalance(tenantId);
  }

  /**
   * POST /v1/developer/payout/request
   * Yêu cầu rút tiền.
   */
  @Post('request')
  async requestPayout(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: {
      amount: string;
      currency?: string;
      method?: string;
      accountInfo?: Record<string, string>;
      notes?: string;
    },
  ) {
    this.requireTenant(tenantId);
    return this.payout.requestPayout(tenantId, body);
  }

  /**
   * GET /v1/developer/payout/history
   * Lịch sử payout.
   */
  @Get('history')
  async getPayoutHistory(
    @Headers('x-tenant-id') tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.requireTenant(tenantId);
    return this.payout.getPayoutHistory(tenantId, {
      page: parseInt(page ?? '1', 10) || 1,
      pageSize: parseInt(pageSize ?? '20', 10) || 20,
    });
  }

  /**
   * GET /v1/developer/payout/transactions
   * Lịch sử toàn bộ giao dịch.
   */
  @Get('transactions')
  async getTransactions(
    @Headers('x-tenant-id') tenantId: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.requireTenant(tenantId);
    return this.payout.getTransactions(tenantId, {
      type,
      page: parseInt(page ?? '1', 10) || 1,
      pageSize: parseInt(pageSize ?? '20', 10) || 20,
    });
  }

  private requireTenant(tenantId?: string): asserts tenantId is string {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header is required.');
    }
  }
}

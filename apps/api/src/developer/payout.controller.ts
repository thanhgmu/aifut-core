// ═══════════════════════════════════════════════════════════════════════════
// payout.controller.ts — Developer Payout REST API
// ═══════════════════════════════════════════════════════════════════════════
// Route gốc: /v1/developer/payout
// Phase 3: Ecosystem Economy — Payout Approval Workflow + Admin Dashboard
//
// Developer endpoints:
//   GET  /balance          — Số dư khả dụng
//   POST /request          — Yêu cầu rút tiền
//   GET  /requests         — Danh sách payout request của developer
//   POST /requests/:id/cancel — Hủy request (chỉ PENDING)
//   GET  /history          — Lịch sử payout đã xử lý
//   GET  /transactions     — Toàn bộ giao dịch
//
// Admin endpoints:
//   GET  /admin/requests        — Tất cả payout requests (có filter)
//   POST /admin/requests/:id/approve — Duyệt payout
//   POST /admin/requests/:id/process — Đánh dấu đã xử lý
//   POST /admin/requests/:id/reject  — Từ chối
//   GET  /admin/commission       — Platform commission dashboard
//   GET  /admin/pending-summary  — Tóm tắt pending payouts
// ═══════════════════════════════════════════════════════════════════════════

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
import { PayoutService } from './payout.service';

@Controller('v1/developer/payout')
export class PayoutController {
  constructor(private readonly payout: PayoutService) {}

  // ═════════════════════════════════════════════════════════════════════
  //  DEVELOPER ENDPOINTS
  // ═════════════════════════════════════════════════════════════════════

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
   * Yêu cầu rút tiền → tạo PENDING request.
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
   * GET /v1/developer/payout/requests
   * Danh sách payout request của developer.
   */
  @Get('requests')
  async listMyRequests(
    @Headers('x-tenant-id') tenantId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.requireTenant(tenantId);
    return this.payout.listPayoutRequests({
      tenantId,
      status,
      page: parseInt(page ?? '1', 10) || 1,
      pageSize: parseInt(pageSize ?? '20', 10) || 20,
    });
  }

  /**
   * POST /v1/developer/payout/requests/:id/cancel
   * Developer tự hủy payout request (chỉ khi PENDING).
   */
  @Post('requests/:id/cancel')
  async cancelPayout(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(tenantId);
    return this.payout.cancelPayout(id, tenantId);
  }

  /**
   * GET /v1/developer/payout/history
   * Lịch sử payout đã xử lý.
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

  // ═════════════════════════════════════════════════════════════════════
  //  ADMIN ENDPOINTS (x-admin-key or platform-level access)
  // ═════════════════════════════════════════════════════════════════════
  // Note: Trong production, cần thêm AccessPolicyGuard hoặc Roles guard.
  //       Hiện tại dùng x-admin-tenant-id header làm đơn giản.

  /**
   * GET /v1/developer/payout/admin/requests
   * Admin: tất cả payout requests (có filter theo status/date range).
   */
  @Get('admin/requests')
  async listAllRequests(
    @Headers('x-admin-tenant-id') _adminTenantId: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.requireTenant(_adminTenantId);
    return this.payout.listPayoutRequests({
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: parseInt(page ?? '1', 10) || 1,
      pageSize: parseInt(pageSize ?? '20', 10) || 20,
    });
  }

  /**
   * POST /v1/developer/payout/admin/requests/:id/approve
   * Admin duyệt payout request.
   */
  @Post('admin/requests/:id/approve')
  async approvePayout(
    @Headers('x-admin-tenant-id') adminTenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(adminTenantId);
    return this.payout.approvePayout(id, adminTenantId);
  }

  /**
   * POST /v1/developer/payout/admin/requests/:id/process
   * Admin đánh dấu payout đã xử lý (chuyển tiền thực tế).
   */
  @Post('admin/requests/:id/process')
  async processPayout(
    @Headers('x-admin-tenant-id') _adminTenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(_adminTenantId);
    return this.payout.processPayout(id);
  }

  /**
   * POST /v1/developer/payout/admin/requests/:id/reject
   * Admin từ chối payout request.
   */
  @Post('admin/requests/:id/reject')
  async rejectPayout(
    @Headers('x-admin-tenant-id') adminTenantId: string,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    this.requireTenant(adminTenantId);
    return this.payout.rejectPayout(id, adminTenantId, body?.reason);
  }

  /**
   * GET /v1/developer/payout/admin/commission
   * Admin: platform commission dashboard.
   */
  @Get('admin/commission')
  async getPlatformCommission(
    @Headers('x-admin-tenant-id') _adminTenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.requireTenant(_adminTenantId);
    return this.payout.getPlatformCommissionSummary({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  /**
   * GET /v1/developer/payout/admin/pending-summary
   * Admin: tóm tắt pending/approved payout requests.
   */
  @Get('admin/pending-summary')
  async getPendingSummary(
    @Headers('x-admin-tenant-id') _adminTenantId: string,
  ) {
    this.requireTenant(_adminTenantId);
    return this.payout.getPendingPayoutSummary();
  }

  private requireTenant(tenantId?: string): asserts tenantId is string {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id or x-admin-tenant-id header is required.');
    }
  }
}

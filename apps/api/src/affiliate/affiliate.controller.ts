import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Headers,
} from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import { AccessPolicyGuard } from '../access-policy.guard';

@Controller('affiliate')
export class AffiliateController {
  constructor(private readonly svc: AffiliateService) {}

  // ── Account ──────────────────────────────────────────────────────────

  @UseGuards(AccessPolicyGuard)
  @Post('account')
  createAccount(
    @Body() body: { commissionRate?: number; commissionType?: string; payoutMethod?: string; payoutDetails?: string; cookieDays?: number; autoApprove?: boolean; notes?: string },
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.svc.createAccount(tenantId, body as any);
  }

  @UseGuards(AccessPolicyGuard)
  @Get('account')
  getAccount(@Headers('x-tenant-id') tenantId: string) {
    return this.svc.getAccount(tenantId);
  }

  @UseGuards(AccessPolicyGuard)
  @Patch('account')
  updateAccount(
    @Body() body: Partial<{ status: string; commissionRate: number; commissionType: string; payoutMethod: string; payoutDetails: string; cookieDays: number; autoApprove: boolean; notes: string }>,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.svc.updateAccount(tenantId, body as any);
  }

  // ── Links ────────────────────────────────────────────────────────────

  @UseGuards(AccessPolicyGuard)
  @Post('links')
  createLink(
    @Body() body: { key?: string; label: string; targetUrl: string; destination?: string; campaign?: string; metadata?: Record<string, any> },
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.svc.createLink(tenantId, body);
  }

  @UseGuards(AccessPolicyGuard)
  @Get('links')
  getLinks(@Headers('x-tenant-id') tenantId: string) {
    return this.svc.getLinks(tenantId);
  }

  @UseGuards(AccessPolicyGuard)
  @Patch('links/:key')
  updateLink(
    @Param('key') key: string,
    @Body() body: Partial<{ label: string; targetUrl: string; destination: string; campaign: string; isActive: boolean; metadata: Record<string, any> }>,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.svc.updateLink(tenantId, key, body as any);
  }

  // ── Click tracking (public, no auth) ──────────────────────────────────

  @Get('click/:key')
  trackClick(@Param('key') key: string, @Headers('user-agent') ua?: string) {
    return this.svc.recordClick(key, { userAgent: ua });
  }

  // ── Conversions ──────────────────────────────────────────────────────

  @UseGuards(AccessPolicyGuard)
  @Get('conversions')
  getConversions(
    @Query('status') status: string | undefined,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.svc.getConversions(tenantId, status);
  }

  @UseGuards(AccessPolicyGuard)
  @Patch('conversions/:id/status')
  updateConversionStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.svc.updateConversionStatus(tenantId, id, status as any);
  }

  // ── Payouts ──────────────────────────────────────────────────────────

  @UseGuards(AccessPolicyGuard)
  @Post('payouts')
  createPayout(
    @Body() body: { amount: number; currency?: string; notes?: string },
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.svc.createPayout(tenantId, body);
  }

  @UseGuards(AccessPolicyGuard)
  @Get('payouts')
  getPayouts(@Headers('x-tenant-id') tenantId: string) {
    return this.svc.getPayouts(tenantId);
  }

  // ── Public info (no auth) ────────────────────────────────────────────

  @Get('public/:referralCode')
  getPublicInfo(@Param('referralCode') code: string) {
    return this.svc.getPublicAccountInfo(code);
  }

  // ── Dashboard ────────────────────────────────────────────────────────

  @UseGuards(AccessPolicyGuard)
  @Get('dashboard')
  getDashboard(@Headers('x-tenant-id') tenantId: string) {
    return this.svc.getDashboard(tenantId);
  }

  // ── Admin ────────────────────────────────────────────────────────────

  @UseGuards(AccessPolicyGuard)
  @Get('admin/list')
  listAll() {
    return this.svc.listAll();
  }
}

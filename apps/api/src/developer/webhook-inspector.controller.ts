// ============================================================================
// Webhook Inspector — Bộ điều hướng API thanh tra Webhook
// ============================================================================
// Endpoint phân trang tra cứu nhật ký thanh tra gói tin Webhook.
// Yêu cầu bảo mật IDOR: tenantId được trích xuất TUYỆT ĐỐI từ
// HTTP Header 'x-tenant-id', không bao giờ lấy từ query string.
//
// Module: apps/api/src/developer/
// Prefix: v1/developer
// ============================================================================

import {
  Controller,
  Get,
  Headers,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { WebhookInspectorService } from './webhook-inspector.service';
import type { WebhookDirection, WebhookQueryFilterDto } from './webhook-inspector.types';

// ── Hằng số clamping ranh giới ────────────────────────────────────────
// Không cho phép client yêu cầu trang <= 0 hoặc pageSize quá lớn,
// tránh gây áp lực lên database (SQLite/Postgres).
const MIN_PAGE = 1;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PAGE = 1;

@Controller('v1/developer')
export class WebhookInspectorController {
  constructor(
    private readonly webhookInspector: WebhookInspectorService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────
  // GET /v1/developer/webhook-logs
  // ──────────────────────────────────────────────────────────────────────
  // Tra cứu danh sách nhật ký thanh tra webhook phân trang.
  // IDOR PROTECTION: tenantId từ header 'x-tenant-id', KHÔNG từ query.
  // Fixtures cho phép: page, pageSize, direction (INBOUND|OUTBOUND),
  // method (HTTP verb), status (mã phản hồi HTTP).
  // ──────────────────────────────────────────────────────────────────────
  @Get('webhook-logs')
  async getWebhookLogs(
    @Headers('x-tenant-id') tenantId: string,
    @Query('page') rawPage?: string,
    @Query('pageSize') rawPageSize?: string,
    @Query('direction') direction?: WebhookDirection,
    @Query('method') method?: string,
    @Query('status') rawStatus?: string,
  ) {
    // ── IDOR Guard: tenantId bắt buộc từ header ─────────────────────
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException(
        'Missing or empty X-Tenant-Id header — authentication required',
      );
    }

    const sanitizedTenantId = tenantId.trim();

    // ── Ép kiểu số nguyên an toàn cho phân trang ─────────────────────
    const page = this.toSafePositiveInt(rawPage, DEFAULT_PAGE);
    const pageSize = this.clampPageSize(
      this.toSafePositiveInt(rawPageSize, DEFAULT_PAGE_SIZE),
    );

    // ── Ép kiểu status (tuỳ chọn) ───────────────────────────────────
    let status: number | undefined;
    if (rawStatus !== undefined && rawStatus !== null && rawStatus !== '') {
      const parsed = Number(rawStatus);
      if (!Number.isFinite(parsed) || parsed < 100 || parsed > 599 || !Number.isInteger(parsed)) {
        throw new BadRequestException(
          `Invalid status code: "${rawStatus}" — must be an integer between 100 and 599`,
        );
      }
      status = parsed;
    }

    // ── Validate direction nếu có ────────────────────────────────────
    if (direction && direction !== 'INBOUND' && direction !== 'OUTBOUND') {
      throw new BadRequestException(
        `Invalid direction: "${direction}" — must be "INBOUND" or "OUTBOUND"`,
      );
    }

    // ── Xây dựng filter DTO và gọi service ──────────────────────────
    const filter: WebhookQueryFilterDto = {
      page,
      pageSize,
      direction,
      method: method?.trim() || undefined,
      status,
    };

    return this.webhookInspector.getTenantLogs(sanitizedTenantId, filter);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Helpers nội bộ
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Chuyển đổi an toàn giá trị chuỗi sang số nguyên dương.
   * - null/undefined/empty → fallback
   * - NaN, vô cực, <=0 → BadRequest
   */
  private toSafePositiveInt(
    raw: string | undefined | null,
    fallback: number,
  ): number {
    if (raw === undefined || raw === null || raw.trim() === '') {
      return fallback;
    }
    const parsed = Number(raw);
    if (
      !Number.isFinite(parsed) ||
      !Number.isInteger(parsed) ||
      parsed < MIN_PAGE
    ) {
      throw new BadRequestException(
        `Invalid integer value: "${raw}" — must be a positive integer`,
      );
    }
    return parsed;
  }

  /**
   * Clamp pageSize trong khoảng [1, MAX_PAGE_SIZE].
   */
  private clampPageSize(pageSize: number): number {
    if (pageSize > MAX_PAGE_SIZE) {
      return MAX_PAGE_SIZE;
    }
    return pageSize;
  }
}

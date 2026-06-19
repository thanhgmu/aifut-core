// ============================================================================
// Webhook Inspector — Dịch vụ thanh tra gói tin Webhook
// ============================================================================
// Ghi nhận và tra cứu nhật ký viễn trắc mạng (Telemetry) cho toàn bộ
// traffic webhook INBOUND/OUTBOUND của từng tenant.
//
// Module: apps/api/src/developer/
// Model:  WebhookInspectionLog (schema.prisma)
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type {
  CreateWebhookLogDto,
  WebhookQueryFilterDto,
} from './webhook-inspector.types';

// ── Hằng số phân trang ─────────────────────────────────────────────────
// Clamp cứng để bảo vệ SQLite/Postgres khỏi query quá tải.
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable()
export class WebhookInspectorService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────────────────────────────
  // 1. logTraffic — Ghi nhận một bản ghi nhật ký mạng mới
  // ──────────────────────────────────────────────────────────────────────
  // Dùng Prisma tạo bản ghi vào table `webhookInspectionLog`.
  // `headers` và `payload` được xử lý an toàn dưới dạng Json.
  // ──────────────────────────────────────────────────────────────────────
  async logTraffic(dto: CreateWebhookLogDto) {
    return this.prisma.webhookInspectionLog.create({
      data: {
        tenantId: dto.tenantId,
        endpointId: dto.endpointId ?? null,
        method: dto.method,
        headers: dto.headers as any, // Prisma Json field — bypass strict TS2322
        payload: dto.payload as any, // Prisma Json field — bypass strict TS2322
        responseStatus: dto.responseStatus ?? null,
        responseBody: dto.responseBody ?? null,
        durationMs: dto.durationMs,
        direction: dto.direction,
      },
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // 2. getTenantLogs — Tra cứu nhật ký thanh tra của tenant
  // ──────────────────────────────────────────────────────────────────────
  // Phân trang cứng (hard clamp) + sort createdAt DESC.
  // Hỗ trợ lọc theo direction, method, responseStatus.
  // ──────────────────────────────────────────────────────────────────────
  async getTenantLogs(
    tenantId: string,
    filter: WebhookQueryFilterDto,
  ): Promise<PaginatedResult<unknown>> {
    // Hard clamp phân trang — bảo vệ database
    const page = Math.max(1, Math.floor(filter.page) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(filter.pageSize) || DEFAULT_PAGE_SIZE),
    );
    const skip = (page - 1) * pageSize;

    // Xây dựng bộ lọc WHERE động
    const where: Record<string, unknown> = { tenantId };

    if (filter.direction) {
      where.direction = filter.direction;
    }
    if (filter.method) {
      where.method = filter.method;
    }
    if (filter.status !== undefined && filter.status !== null) {
      where.responseStatus = filter.status;
    }

    // Chạy song song count + findMany
    const [data, total] = await Promise.all([
      this.prisma.webhookInspectionLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.webhookInspectionLog.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}

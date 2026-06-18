/**
 * audit.controller.ts — REST controller cho phân hệ Nhật ký kiểm toán.
 *
 * Endpoint: GET /audit-logs
 *
 * Bám sát mục IV.3 của MULTI-TENANT-AUDIT-TRAIL-DESIGN.md:
 *  - Bộ lọc động (dynamic filter) qua query params.
 *  - Cursor pagination (cursor-based) thay vì offset cho khả năng scale
 *    lớn với bảng append-only (AuditEvent không có updatedAt).
 *  - IDOR protection nghiêm ngặt: tenantId LUÔN được bóc từ header context
 *    (x-tenant-slug), KHÔNG BAO GIỜ từ URL params hay body.
 *  - Chỉ expose các trường an toàn, không leak raw Prisma model.
 */

import {
  Controller,
  Get,
  Headers,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { AuditSeverity } from './audit.types';

// ── Response types ──────────────────────────────────────────────────

export interface AuditLogResponseItem {
  id: string;
  action: string;
  actorType: string;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  severity: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

export interface AuditLogPaginatedResponse {
  data: AuditLogResponseItem[];
  pagination: {
    /** Cursor cho trang tiếp theo — null nếu đã hết dữ liệu. */
    nextCursor: string | null;
    /** Số bản ghi thực tế trả về trong trang này. */
    count: number;
    /** Limit đã dùng. */
    limit: number;
    /** Tổng số bản ghi khớp bộ lọc (nếu estimateOnly=false) hoặc null. */
    total: number | null;
  };
  meta: {
    tenantSlug: string;
    filters: Record<string, string | undefined>;
  };
}

// ── Constants ───────────────────────────────────────────────────────

/** Số bản ghi tối đa cho một trang. */
const MAX_PAGE_LIMIT = 200;
const DEFAULT_PAGE_LIMIT = 50;

/** Các trường cho phép sort (cursor chỉ hỗ trợ sort theo createdAt xuôi/ngược). */
const ALLOWED_SORT_FIELDS = ['createdAt'] as const;
type SortField = (typeof ALLOWED_SORT_FIELDS)[number];

@Controller('audit-logs')
export class AuditLogsController {
  private readonly logger = new Logger(AuditLogsController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /audit-logs
   *
   * Truy vấn nhật ký kiểm toán với bộ lọc động + cursor pagination.
   *
   * Bảo mật:
   *  - x-tenant-slug bắt buộc (IDOR protection) — không cho phép query tenant
   *    khác slug từ header.
   *  - Không có body param nào nhận tenantId từ client.
   *
   * Query params hỗ trợ:
   *  - cursor?    : ID của bản ghi cuối cùng ở trang trước (cursor pagination).
   *  - limit?     : Số bản ghi mỗi trang (mặc định 50, tối đa 200).
   *  - action?    : Lọc theo action (LIKE, ví dụ: "member.invite").
   *  - targetType?: Lọc theo loại resource (ví dụ: "Member").
   *  - targetId?  : Lọc theo ID resource cụ thể.
   *  - severity?  : Lọc theo mức nghiêm trọng: INFO | WARN | CRITICAL.
   *  - actorEmail?: Lọc theo email người thực hiện.
   *  - actorType? : Lọc theo loại actor: USER | SYSTEM | SERVICE.
   *  - fromDate?  : ISO date string — chỉ lấy bản ghi >= thời điểm này.
   *  - toDate?    : ISO date string — chỉ lấy bản ghi <= thời điểm này.
   *  - sortOrder? : "asc" | "desc" (mặc định desc — mới nhất trước).
   */
  @Get()
  async list(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitParam?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('severity') severity?: string,
    @Query('actorEmail') actorEmail?: string,
    @Query('actorType') actorType?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ): Promise<AuditLogPaginatedResponse> {
    // ── Bước 1: Validate input ──────────────────────────────────────

    // IDOR protection: tenantId bắt buộc từ header, không từ query/body
    if (!tenantSlugHeader || !tenantSlugHeader.trim()) {
      throw new BadRequestException(
        'Missing required header: x-tenant-slug. Tenant context is required for audit query.',
      );
    }

    const tenantSlug = tenantSlugHeader.trim().toLowerCase();
    const limit = this.normalizeLimit(limitParam);
    const order: 'asc' | 'desc' =
      sortOrder === 'asc' ? 'asc' : 'desc';

    // Validate severity nếu có
    const VALID_SEVERITIES = ['INFO', 'WARN', 'CRITICAL'];
    if (severity && !VALID_SEVERITIES.includes(severity.toUpperCase())) {
      throw new BadRequestException(
        `Invalid severity: "${severity}". Must be one of: ${VALID_SEVERITIES.join(', ')}`,
      );
    }

    // Validate actorType nếu có
    const VALID_ACTOR_TYPES = ['USER', 'SYSTEM', 'SERVICE'];
    if (actorType && !VALID_ACTOR_TYPES.includes(actorType.toUpperCase())) {
      throw new BadRequestException(
        `Invalid actorType: "${actorType}". Must be one of: ${VALID_ACTOR_TYPES.join(', ')}`,
      );
    }

    // ── Bước 2: Xây where clause động ───────────────────────────────

    const where: Record<string, unknown> = {
      tenant: { slug: tenantSlug },
    };

    // action LIKE filter (prefix match)
    if (action?.trim()) {
      where.action = { contains: action.trim().toLowerCase() };
    }

    // targetType exact match
    if (targetType?.trim()) {
      where.targetType = targetType.trim();
    }

    // targetId exact match
    if (targetId?.trim()) {
      where.targetId = targetId.trim();
    }

    // severity exact match (uppercase)
    if (severity?.trim()) {
      where.severity = severity.trim().toUpperCase();
    }

    // actorEmail exact match (lowercase)
    if (actorEmail?.trim()) {
      where.actorEmail = actorEmail.trim().toLowerCase();
    }

    // actorType exact match (uppercase)
    if (actorType?.trim()) {
      where.actorType = actorType.trim().toUpperCase();
    }

    // Date range filter
    const dateFilters: Record<string, Date> = {};
    if (fromDate?.trim()) {
      const parsed = new Date(fromDate.trim());
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException(
          `Invalid fromDate: "${fromDate}". Use ISO 8601 format.`,
        );
      }
      dateFilters.gte = parsed;
    }
    if (toDate?.trim()) {
      const parsed = new Date(toDate.trim());
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException(
          `Invalid toDate: "${toDate}". Use ISO 8601 format.`,
        );
      }
      dateFilters.lte = parsed;
    }
    if (Object.keys(dateFilters).length > 0) {
      where.createdAt = dateFilters;
    }

    // ── Bước 3: Cursor pagination ───────────────────────────────────

    const take = limit + 1; // Lấy dư 1 để biết còn trang tiếp không

    const findManyArgs: Record<string, unknown> = {
      where,
      orderBy: { createdAt: order },
      take: order === 'desc' ? take : take,
      select: {
        id: true,
        action: true,
        actorType: true,
        actorEmail: true,
        targetType: true,
        targetId: true,
        ipAddress: true,
        userAgent: true,
        sessionId: true,
        severity: true,
        metadata: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    };

    // Áp dụng cursor nếu có
    if (cursor?.trim()) {
      findManyArgs.cursor = { id: cursor.trim() };
      findManyArgs.skip = 1; // Bỏ qua bản ghi chính là cursor (đã return ở trang trước)
    }

    // ── Bước 4: Query ───────────────────────────────────────────────

    try {
      const events = await this.prisma.auditEvent.findMany(
        findManyArgs as Parameters<typeof this.prisma.auditEvent.findMany>[0],
      );

      // Kiểm tra còn trang tiếp hay không
      const hasMore = events.length > limit;
      const items = hasMore ? events.slice(0, limit) : events;

      // nextCursor = id của item cuối cùng trong trang (nếu còn)
      const nextCursor =
        hasMore && items.length > 0 ? items[items.length - 1].id : null;

      // ── Bước 5: Map response an toàn ──────────────────────────────

      const data: AuditLogResponseItem[] = items.map((event) => ({
        id: event.id,
        action: event.action,
        actorType: event.actorType,
        actorEmail: event.actorEmail,
        targetType: event.targetType,
        targetId: event.targetId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        sessionId: event.sessionId,
        severity: event.severity,
        metadata: event.metadata as Record<string, unknown> | null,
        createdAt: (event.createdAt as Date).toISOString(),
user: (event as any).user
  ? {
      id: (event as any).user.id,
email: (event as any).user?.email || event.actorEmail,
name: (event as any).user?.name || 'System',
            }
          : null,
      }));

      return {
        data,
        pagination: {
          nextCursor,
          count: data.length,
          limit,
          total: null, // không count tổng để tối ưu trên bảng lớn
        },
        meta: {
          tenantSlug,
          filters: {
            action,
            targetType,
            targetId,
            severity,
            actorEmail,
            actorType,
            fromDate,
            toDate,
          },
        },
      };
    } catch (err) {
      this.logger.error(
        `AuditLogsController.list: query failed — ${(err as Error).message} ` +
          `(tenantSlug=${tenantSlug})`,
      );
      throw err;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  /**
   * Chuẩn hoá limit: mặc định 50, tối đa 200, tối thiểu 1.
   */
  private normalizeLimit(raw?: string): number {
    if (!raw) {
      return DEFAULT_PAGE_LIMIT;
    }

    const parsed = Number(raw);
    if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < 1) {
      return DEFAULT_PAGE_LIMIT;
    }

    return Math.min(parsed, MAX_PAGE_LIMIT);
  }
}

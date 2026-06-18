import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  AuditLogInput,
  AuditLogPayload,
  AuditLogResult,
  AuditJsonPayload,
  AuditJsonValue,
  AuditSeverity,
  DEFAULT_AUDIT_ACTOR_TYPE,
  DEFAULT_AUDIT_SEVERITY,
  inferSeverityFromAction,
  isAuditSeverity,
} from './audit.types';

/**
 * AuditService — Hạ tầng ghi vết kiểm toán bất biến (append-only).
 *
 * Bám sát mục IV.1 của MULTI-TENANT-AUDIT-TRAIL-DESIGN.md:
 *  - logActivity() ghi một bản ghi AuditEvent qua PrismaService.
 *  - Chế độ fire-and-forget an toàn: lỗi ghi KHÔNG throw ra ngoài,
 *    chỉ log warning để không bao giờ block / crash request gốc.
 *
 * Lưu ý kiến trúc:
 *  - Append-only: KHÔNG có update/delete trong service này.
 *  - Multi-tenant: tenantId bắt buộc, bọc chặt mọi bản ghi.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * logActivity — Ghi một bản ghi audit append-only.
   *
   * Fire-and-forget safe: nếu ghi DB lỗi, hàm KHÔNG throw mà trả về null
   * sau khi log warning. Phù hợp cho interceptor không block response.
   *
   * @returns AuditLogResult khi ghi thành công, hoặc null nếu ghi thất bại
   *          (đã nuốt lỗi an toàn) / input không hợp lệ.
   */
  async logActivity(input: AuditLogInput): Promise<AuditLogResult | null> {
    let payload: AuditLogPayload;

    // ── Bước 1: Validate + chuẩn hoá input (không throw ra ngoài) ──────
    try {
      payload = this.normalizeInput(input);
    } catch (err) {
      this.logger.warn(
        `Audit logActivity: invalid input — ${(err as Error).message} (action=${input?.action ?? 'n/a'})`,
      );
      return null;
    }

    // ── Bước 2: Ghi append-only qua Prisma (fire-and-forget safe) ──────
    try {
      const event = await this.prisma.auditEvent.create({
        data: this.toCreateInput(payload),
        select: {
          id: true,
          tenantId: true,
          action: true,
          createdAt: true,
        },
      });

      return {
        id: event.id,
        tenantId: event.tenantId,
        action: event.action,
        createdAt: event.createdAt,
      };
    } catch (err) {
      // Nuốt lỗi an toàn — audit không bao giờ làm gãy luồng nghiệp vụ.
      this.logger.warn(
        `Audit logActivity: write failed — ${(err as Error).message} ` +
          `(tenantId=${payload.tenantId}, action=${payload.action})`,
      );
      return null;
    }
  }

  /**
   * logActivityFireAndForget — Bọc logActivity ở dạng "bắn rồi quên".
   *
   * KHÔNG await. Promise chạy nền, lỗi đã được logActivity nuốt nội bộ;
   * lớp catch ở đây chỉ là chốt an toàn cuối cùng cho unhandled rejection.
   */
  logActivityFireAndForget(input: AuditLogInput): void {
    void this.logActivity(input).catch((err) => {
      this.logger.warn(
        `Audit logActivityFireAndForget: unexpected rejection — ${(err as Error).message}`,
      );
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Chuẩn hoá + validate input thành AuditLogPayload.
   * Ném lỗi nếu thiếu trường bắt buộc (tenantId, action).
   */
  private normalizeInput(input: AuditLogInput): AuditLogPayload {
    if (!input || typeof input !== 'object') {
      throw new Error('Audit input must be an object.');
    }

    const tenantId = (input.tenantId ?? '').trim();
    if (!tenantId) {
      throw new Error('Missing required field: tenantId.');
    }

    const action = this.normalizeAction(input.action);
    if (!action) {
      throw new Error('Missing required field: action.');
    }

    const severity = this.resolveSeverity(input.severity, action);

    return {
      tenantId,
      userId: this.nullableString(input.userId),
      actorEmail: this.normalizeEmail(input.actorEmail),
      actorType: input.actorType ?? DEFAULT_AUDIT_ACTOR_TYPE,
      action,
      targetType: this.nullableString(input.resource),
      targetId: this.nullableString(input.resourceId),
      ipAddress: this.nullableString(input.ipAddress),
      userAgent: this.nullableString(input.userAgent),
      sessionId: this.nullableString(input.sessionId),
      oldValue: this.nullableJson(input.oldValue),
      newValue: this.nullableJson(input.newValue),
      metadata: this.nullableMetadata(input.metadata),
      severity,
    };
  }

  /** Map payload đã chuẩn hoá sang Prisma create input. */
  private toCreateInput(payload: AuditLogPayload): Prisma.AuditEventCreateInput {
    return {
      tenant: { connect: { id: payload.tenantId } },
      ...(payload.userId ? { user: { connect: { id: payload.userId } } } : {}),
      actorType: payload.actorType,
      actorEmail: payload.actorEmail,
      action: payload.action,
      targetType: payload.targetType,
      targetId: payload.targetId,
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
      sessionId: payload.sessionId,
      oldValue: this.asPrismaJson(payload.oldValue),
      newValue: this.asPrismaJson(payload.newValue),
      metadata: this.asPrismaJson(payload.metadata as AuditJsonPayload | null),
      severity: payload.severity,
    };
  }

  /** Chuẩn hoá action về dạng lowercase.dot.notation, bỏ khoảng trắng dư. */
  private normalizeAction(action: string | undefined | null): string {
    if (!action || typeof action !== 'string') {
      return '';
    }
    return action
      .trim()
      .replace(/\s+/g, '.')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .toLowerCase();
  }

  /** Quyết định severity: ưu tiên giá trị hợp lệ từ caller, nếu không suy luận. */
  private resolveSeverity(
    severity: AuditSeverity | undefined,
    action: string,
  ): AuditSeverity {
    if (isAuditSeverity(severity)) {
      return severity;
    }
    // Suy luận nhẹ theo action; fallback DEFAULT_AUDIT_SEVERITY (INFO).
    const inferred = inferSeverityFromAction(action);
    return inferred ?? DEFAULT_AUDIT_SEVERITY;
  }

  private normalizeEmail(value: string | undefined | null): string | null {
    const s = this.nullableString(value);
    return s ? s.toLowerCase() : null;
  }

  private nullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private nullableJson(value: AuditJsonPayload | null | undefined): AuditJsonPayload | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== 'object') {
      return null;
    }
    return value;
  }

  private nullableMetadata(
    value: Record<string, AuditJsonValue> | null | undefined,
  ): Record<string, AuditJsonValue> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return Object.keys(value).length > 0 ? value : null;
  }

  /** Map giá trị JSON nội bộ sang kiểu Prisma JSON (hoặc bỏ qua nếu null). */
  private asPrismaJson(
    value: AuditJsonPayload | Record<string, AuditJsonValue> | null,
  ): Prisma.InputJsonValue | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    return value as unknown as Prisma.InputJsonValue;
  }
}

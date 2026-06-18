/**
 * audit.types.ts — Type definitions cho hệ thống Nhật ký kiểm toán (Audit Trail).
 *
 * Bám sát mục III & V.5 của bản thiết kế MULTI-TENANT-AUDIT-TRAIL-DESIGN.md.
 * Toàn bộ ghi vết là append-only, multi-tenant, fire-and-forget safe.
 */

// ── Re-export enum đồng bộ với Prisma schema (AuditActorType, AuditSeverity) ──
// Khai báo lại dưới dạng const-union để tránh phụ thuộc cứng vào @prisma/client
// tại tầng type (Prisma enum vẫn là nguồn sự thật ở tầng DB).

export type AuditActorType = 'USER' | 'SYSTEM' | 'SERVICE';

export type AuditSeverity = 'INFO' | 'WARN' | 'CRITICAL';

export const AUDIT_ACTOR_TYPES: readonly AuditActorType[] = ['USER', 'SYSTEM', 'SERVICE'] as const;

export const AUDIT_SEVERITIES: readonly AuditSeverity[] = ['INFO', 'WARN', 'CRITICAL'] as const;

/** Giá trị mặc định khi caller không chỉ định. */
export const DEFAULT_AUDIT_ACTOR_TYPE: AuditActorType = 'USER';
export const DEFAULT_AUDIT_SEVERITY: AuditSeverity = 'INFO';

/**
 * Payload JSON tuỳ ý ghi kèm bản ghi audit (oldValue / newValue / metadata).
 * Cho phép object lồng nhau, mảng, hoặc giá trị nguyên thuỷ JSON-serializable.
 */
export type AuditJsonValue =
  | string
  | number
  | boolean
  | null
  | AuditJsonValue[]
  | { [key: string]: AuditJsonValue };

export type AuditJsonPayload = Record<string, AuditJsonValue> | AuditJsonValue[];

/**
 * AuditLogInput — Input chuẩn hoá để ghi một bản ghi audit (logActivity).
 *
 * Mục III/IV.1: tenantId/actorEmail/action là tối thiểu cần thiết để trace.
 * Các trường context (ip/userAgent/sessionId) và diff (old/new) đều optional.
 */
export interface AuditLogInput {
  /** Tenant sở hữu bản ghi — bắt buộc, bọc chặt multi-tenant isolation. */
  tenantId: string;

  /** User thực hiện hành động (null nếu actor là SYSTEM/SERVICE). */
  userId?: string | null;

  /** Snapshot email tại thời điểm ghi — immutable kể cả khi user bị xoá. */
  actorEmail?: string | null;

  /** Loại actor — mặc định USER. */
  actorType?: AuditActorType;

  /** Action chuẩn hoá dạng dot-notation: "member.invite", "apiKey.create". */
  action: string;

  /** Loại resource bị tác động (targetType): "Member", "ApiKey", ... */
  resource?: string | null;

  /** ID cụ thể của resource (targetId). */
  resourceId?: string | null;

  /** Client IP từ request (x-forwarded-for / req.ip). */
  ipAddress?: string | null;

  /** User-Agent header. */
  userAgent?: string | null;

  /** Session ID nếu có (x-session-id). */
  sessionId?: string | null;

  /** Dữ liệu trước khi thay đổi (diff payload). */
  oldValue?: AuditJsonPayload | null;

  /** Dữ liệu sau khi thay đổi (diff payload). */
  newValue?: AuditJsonPayload | null;

  /** Metadata mở rộng (workspaceSlug, hostname, membershipRole...). */
  metadata?: any;

  /** Mức nghiêm trọng — mặc định INFO. */
  severity?: AuditSeverity;
}

/**
 * AuditLogPayload — Hình dạng dữ liệu đã chuẩn hoá, sẵn sàng map sang
 * Prisma.AuditEventCreateInput. Đây là kết quả sau bước validate/normalize.
 */
export interface AuditLogPayload {
  tenantId: string;
  userId: string | null;
  actorEmail: string | null;
  actorType: AuditActorType;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  oldValue: AuditJsonPayload | null;
  newValue: AuditJsonPayload | null;
  metadata: Record<string, AuditJsonValue> | null;
  severity: AuditSeverity;
}

/**
 * AuditLogResult — Kết quả trả về sau khi ghi thành công.
 * Fire-and-forget mode: result có thể là null nếu ghi thất bại (đã nuốt lỗi).
 */
export interface AuditLogResult {
  id: string;
  tenantId: string;
  action: string;
  createdAt: Date;
}

// ── Phân loại / map mức nghiêm trọng ────────────────────────────────────

/** Mức ưu tiên dạng số để so sánh / lọc / sắp xếp severity. */
export const AUDIT_SEVERITY_RANK: Record<AuditSeverity, number> = {
  INFO: 0,
  WARN: 1,
  CRITICAL: 2,
};

/** Severity mặc định suy ra theo loại action (heuristic nhẹ). */
export function inferSeverityFromAction(action: string): AuditSeverity {
  const normalized = action.toLowerCase();
  if (
    normalized.includes('delete') ||
    normalized.includes('revoke') ||
    normalized.includes('disable') ||
    normalized.includes('suspend') ||
    normalized.includes('freeze')
  ) {
    return 'WARN';
  }
  if (
    normalized.includes('breach') ||
    normalized.includes('fraud') ||
    normalized.includes('compromise') ||
    normalized.includes('escalate')
  ) {
    return 'CRITICAL';
  }
  return DEFAULT_AUDIT_SEVERITY;
}

/** Type-guard: kiểm tra một chuỗi có phải severity hợp lệ. */
export function isAuditSeverity(value: unknown): value is AuditSeverity {
  return typeof value === 'string' && (AUDIT_SEVERITIES as readonly string[]).includes(value);
}

/** Type-guard: kiểm tra một chuỗi có phải actorType hợp lệ. */
export function isAuditActorType(value: unknown): value is AuditActorType {
  return typeof value === 'string' && (AUDIT_ACTOR_TYPES as readonly string[]).includes(value);
}

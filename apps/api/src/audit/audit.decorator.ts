/**
 * audit.decorator.ts — @AuditEvent() custom decorator.
 *
 * Gắn metadata cấu hình Verb (action) và Resource cho một route handler.
 * AuditInterceptor đọc metadata này và tự động ghi vết sang AuditService
 * dạng fire-and-forget sau khi response hoàn thành.
 *
 * Bám sát mục IV.2 của MULTI-TENANT-AUDIT-TRAIL-DESIGN.md:
 *  - Action verb dạng dot-notation: "member.invite", "apiKey.create"
 *  - Resource là loại đối tượng bị tác động: "Member", "ApiKey"
 *  - Severity có thể ghi đè tại runtime qua AuditLogInput.severity
 */

import { SetMetadata } from '@nestjs/common';

/** Metadata key để AuditInterceptor tra cứu. */
export const AUDIT_EVENT_METADATA_KEY = 'audit:event';

export interface AuditEventOptions {
  /**
   * Action verb chuẩn hoá dạng dot-notation.
   * Ví dụ: "member.invite", "apiKey.create", "settings.billing.update"
   */
  action: string;

  /**
   * Loại resource bị tác động (targetType).
   * Ví dụ: "Member", "ApiKey", "Settings", "Workflow", "Connector"
   */
  resource?: string;

  /**
   * Mức nghiêm trọng mặc định cho hành động này.
   * Có thể ghi đè tại runtime nếu AuditLogInput cung cấp severity khác.
   */
  severity?: 'INFO' | 'WARN' | 'CRITICAL';
}

/**
 * @AuditEvent({ action, resource?, severity? })
 *
 * Custom decorator gắn metadata kiểm toán cho một route handler.
 * AuditInterceptor đọc metadata này và tự động gọi AuditService.logActivityFireAndForget
 * để ghi vết bất đồng bộ — không block request gốc.
 *
 * @example
 * ```typescript
 * @AuditEvent({ action: 'member.invite', resource: 'Member', severity: 'WARN' })
 * async inviteMember(@Body() dto: InviteDto) { ... }
 * ```
 */
export const AuditEvent = (options: AuditEventOptions) =>
  SetMetadata(AUDIT_EVENT_METADATA_KEY, options);

/**
 * audit.interceptor.ts — NestJS Interceptor tự động bóc tách audit context.
 *
 * Bám sát mục IV.2 của MULTI-TENANT-AUDIT-TRAIL-DESIGN.md:
 *  1. Đọc @AuditEvent() metadata từ route handler qua Reflector.
 *  2. Bóc tách request context: ipAddress (x-forwarded-for / req.ip),
 *     userAgent, sessionId (x-session-id), tenantSlug (x-tenant-slug).
 *  3. Gọi AuditService.logActivityFireAndForget dạng fire-and-forget
 *     sau khi response hoàn thành (không block response gốc).
 *
 * Fire-and-forget là bắt buộc: audit KHÔNG BAO GIỜ được làm gãy
 * request gốc dù DB có lỗi (đã được AuditService.logActivity nuốt trong).
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';
import {
  AUDIT_EVENT_METADATA_KEY,
  AuditEventOptions,
} from './audit.decorator';

/**
 * AuditInterceptor — Tự động bóc tách request context và ghi audit.
 *
 * Hoạt động:
 *  - Chỉ kích hoạt khi route handler có @AuditEvent() decorator.
 *  - Ghi vết SAU KHI response đã gửi (on response next/error).
 *  - Luôn fire-and-forget: tuyệt đối không await ghi audit.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auditOptions = this.reflector.get<AuditEventOptions | undefined>(
      AUDIT_EVENT_METADATA_KEY,
      context.getHandler(),
    );

    // Không có @AuditEvent() decorator → bỏ qua interceptor
    if (!auditOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // ── Bóc tách request context ──────────────────────────────────────
    const tenantSlug =
      request.headers['x-tenant-slug'] ??
      request.query?.tenantSlug ??
      null;

    const userId =
      request.headers['x-user-id'] ??
      request.user?.id ??
      null;

    const actorEmail =
      request.headers['x-user-email'] ??
      request.query?.userEmail ??
      request.user?.email ??
      null;

    // X-Forwarded-For có thể có nhiều hop; lấy IP client đầu tiên
    const ipAddress: string | null =
      typeof request.headers['x-forwarded-for'] === 'string'
        ? request.headers['x-forwarded-for'].split(',')[0]?.trim()
        : request.ip ?? null;

    const userAgent: string | null =
      request.headers['user-agent'] ?? null;

    const sessionId: string | null =
      request.headers['x-session-id'] ?? null;

    const requestPath = request.route?.path ?? request.url ?? 'unknown';
    const httpMethod = request.method ?? 'UNKNOWN';

    // Snapshot response status sau khi handler chạy xong
    let statusCode = 200;

    return next.handle().pipe(
      tap({
        next: () => {
          statusCode = response.statusCode ?? 200;
          this.recordAudit({
            tenantSlug,
            userId,
            actorEmail,
            ipAddress,
            userAgent,
            sessionId,
            auditOptions,
            statusCode,
            httpMethod,
            requestPath,
            // Thành công — không có old/new diff mặc định
            isError: false,
          });
        },
        error: (error: Error) => {
          statusCode = response.statusCode ?? 500;
          this.recordAudit({
            tenantSlug,
            userId,
            actorEmail,
            ipAddress,
            userAgent,
            sessionId,
            auditOptions,
            statusCode,
            httpMethod,
            requestPath,
            isError: true,
            errorMessage: error.message,
          });
        },
      }),
    );
  }

  /**
   * recordAudit — Ghi vết audit dạng fire-and-forget.
   *
   * Luôn gọi logActivityFireAndForget (không await) để không block.
   * AuditService.logActivity đã nuốt lỗi nội bộ nên rejection là cực kỳ hiếm.
   */
  private recordAudit(params: {
    tenantSlug: string | null;
    userId: string | null;
    actorEmail: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    sessionId: string | null;
    auditOptions: AuditEventOptions;
    statusCode: number;
    httpMethod: string;
    requestPath: string;
    isError: boolean;
    errorMessage?: string;
  }): void {
    const {
      tenantSlug,
      userId,
      actorEmail,
      ipAddress,
      userAgent,
      sessionId,
      auditOptions,
      statusCode,
      httpMethod,
      requestPath,
      isError,
      errorMessage,
    } = params;

    // Không có tenant context → bỏ qua (không thể ghi audit multi-tenant)
    if (!tenantSlug) {
      this.logger.debug(
        `AuditInterceptor: skip — no tenant context (path=${requestPath})`,
      );
      return;
    }

    // Xây metadata mở rộng
    const metadata: Record<string, unknown> = {
      httpMethod,
      statusCode,
      requestPath,
      interceptedBy: 'AuditInterceptor',
      interceptedAt: new Date().toISOString(),
    };

    if (isError) {
      metadata.error = true;
      if (errorMessage) {
        metadata.errorMessage = errorMessage;
      }
    }

    // Fire-and-forget — tuyệt đối không await
    this.auditService.logActivityFireAndForget({
      tenantId: tenantSlug,
      userId: userId ?? undefined,
      actorEmail: actorEmail ?? undefined,
      action: auditOptions.action,
      resource: auditOptions.resource,
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
      sessionId: sessionId ?? undefined,
      severity: auditOptions.severity,
      metadata,
    });
  }
}

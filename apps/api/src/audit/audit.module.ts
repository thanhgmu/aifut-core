/**
 * audit.module.ts — Module đóng gói phân hệ Kiểm toán Bảo mật (Audit Trail).
 *
 * Bám sát mục V.5 của MULTI-TENANT-AUDIT-TRAIL-DESIGN.md:
 *  - AuditService: ghi vết append-only, fire-and-forget.
 *  - AuditEventsService: ghi vết với context + access policy (kế thừa).
 *  - AuditLogsController: GET /audit-logs với cursor pagination + IDOR protection.
 *  - AuditInterceptor (APP_INTERCEPTOR toàn cục): tự động bóc tách request
 *    context và ghi audit cho route có @AuditEvent() decorator.
 *
 * Module này thay thế audit.module.ts gốc và mở rộng với:
 *  - Interceptor auto-audit toàn cục (chỉ kích hoạt khi có decorator).
 *  - Controller mới dùng Prisma cursor pagination cho scale lớn.
 *  - Export AuditService + AuditEventsService cho các module khác dùng.
 */

import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditController as AuditRootController } from '../audit.controller';
import { AuditEventsService } from '../audit-events.service';
import { TenancyModule } from '../tenancy.module';
import { PrismaService } from '../prisma.service';
import { AuditService } from './audit.service';
import { AuditLogsController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';

@Module({
  imports: [TenancyModule],
  controllers: [
    // Giữ controller cũ cho backward compatibility (POST/GET /audit/events)
    AuditRootController,
    // Controller mới: GET /audit-logs với cursor pagination + bộ lọc động
    AuditLogsController,
  ],
  providers: [
    // ── Audit services ──────────────────────────────────────────────
    AuditService,
    AuditEventsService,
    PrismaService,

    // ── APP_INTERCEPTOR toàn cục ────────────────────────────────────
    // Chỉ kích hoạt khi route handler có @AuditEvent() decorator.
    // AuditInterceptor tự động bóc tách request context (ip, userAgent,
    // sessionId, tenantSlug) và gọi AuditService.logActivityFireAndForget.
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [
    AuditService,
    AuditEventsService,
  ],
})
export class AuditModule {}

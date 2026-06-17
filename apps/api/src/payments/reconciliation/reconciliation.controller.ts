// ============================================================
// reconciliation.controller.ts — 12 REST Endpoints
// ============================================================
// API routes cho Financial Reconciliation Engine.
// Tất cả endpoint đều check quyền OWNER/ADMIN (trừ discrepancies
// cho phép OPERATOR read-only).
//
// Bảo mật:
//   - IDOR protection: mọi request kiểm tra tenantId khớp với
//     authenticated user's tenant
//   - Stream download: file được serve từ disk, không load memory
//
// Endpoints:
//   GET    /billing/reconciliation/status                  → Tổng quan
//   POST   /billing/reconciliation/run                     → Audit thủ công
//   GET    /billing/reconciliation/runs                    → Lịch sử run
//   GET    /billing/reconciliation/runs/:runId             → Chi tiết run
//   GET    /billing/reconciliation/discrepancies           → Danh sách discrepancies
//   PATCH  /billing/reconciliation/discrepancies/:id/resolve → Resolve
//   POST   /billing/reconciliation/freeze                  → Freeze thủ công
//   POST   /billing/reconciliation/unfreeze               → Unfreeze
//   POST   /billing/reconciliation/export                  → Tạo job export
//   GET    /billing/reconciliation/export/:jobId/status    → Poll tiến độ
//   GET    /billing/reconciliation/export/:jobId/download  → Download file
//   GET    /billing/reconciliation/export/jobs             → Danh sách export jobs
// ============================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Headers,
  Res,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReconciliationService } from './reconciliation.service';
import { DiscrepancyResolverService } from './discrepancy-resolver.service';
import { FinancialReportExporterService } from './financial-report-exporter.service';
import { PrismaService } from '../../prisma.service';
import * as path from 'node:path';

/**
 * Interface cho authenticated request context.
 * Trong thực tế sẽ thay bằng AuthGuard + User decorator.
 * Tạm thời extract từ header X-Authenticated-User (JSON) hoặc
 * từ mock cho development.
 */
interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  role: 'OWNER' | 'ADMIN' | 'OPERATOR' | 'MEMBER';
}

@Controller('billing/reconciliation')
export class ReconciliationController {
  private readonly logger = new Logger(ReconciliationController.name);

  constructor(
    private readonly reconciliationService: ReconciliationService,
    private readonly discrepancyResolver: DiscrepancyResolverService,
    private readonly reportExporter: FinancialReportExporterService,
    private readonly prisma: PrismaService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  [1] GET /billing/reconciliation/status
  //  Trạng thái tổng quan: lần chạy gần nhất, số discrepancy, freeze
  // ═══════════════════════════════════════════════════════════════

  @Get('status')
  async getStatus(@Headers() headers: Record<string, string>) {
    const user = this.requireRole(headers, ['OWNER', 'ADMIN', 'OPERATOR']);

    const [lastRun, openDiscrepancies, frozenWallets] = await Promise.all([
      this.prisma.reconciliationRun
        .findFirst({
          where: { tenantId: user.tenantId },
          orderBy: { startedAt: 'desc' },
        })
        .catch(() => null),
      this.prisma.discrepancyRecord
        .count({
          where: { tenantId: user.tenantId, status: { not: 'DISMISSED' } },
        })
        .catch(() => 0),
      this.prisma.discrepancyRecord
        .count({
          where: { tenantId: user.tenantId, walletFrozen: true },
        })
        .catch(() => 0),
    ]);

    return {
      tenantId: user.tenantId,
      lastRun: lastRun
        ? {
            id: lastRun.id,
            status: lastRun.status,
            startedAt: lastRun.startedAt.toISOString(),
            discrepancyCount: lastRun.discrepancyCount,
          }
        : null,
      openDiscrepancies,
      frozenWallets,
      timestamp: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  [2] POST /billing/reconciliation/run
  //  Kích hoạt audit loop thủ công
  // ═══════════════════════════════════════════════════════════════

  @Post('run')
  async triggerRun(
    @Headers() headers: Record<string, string>,
    @Body() body?: { note?: string },
  ) {
    const user = this.requireRole(headers, ['OWNER', 'ADMIN']);
    this.logger.log(
      `[triggerRun] tenant=${user.tenantId} by=${user.userId}`,
    );

    const results = await this.reconciliationService.runFinancialAuditLoop(
      user.tenantId,
    );

    return {
      triggered: true,
      requestedBy: user.userId,
      note: body?.note ?? null,
      tenantId: user.tenantId,
      runs: results,
      timestamp: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  [3] GET /billing/reconciliation/runs
  //  Lịch sử các lần chạy (phân trang)
  // ═══════════════════════════════════════════════════════════════

  @Get('runs')
  async listRuns(
    @Headers() headers: Record<string, string>,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('status') statusFilter?: string,
  ) {
    const user = this.requireRole(headers, ['OWNER', 'ADMIN', 'OPERATOR']);
    const take = Math.min(parseInt(limit ?? '20', 10) || 20, 100);

    const query: any = {
      where: { tenantId: user.tenantId },
      orderBy: { startedAt: 'desc' },
      take: take + 1,
    };

    if (statusFilter) {
      query.where.status = statusFilter.toUpperCase();
    }
    if (cursor) {
      query.cursor = { id: cursor };
      query.skip = 1;
    }

    const runs = await this.prisma.reconciliationRun
      .findMany(query)
      .catch(() => []);

    const hasMore = runs.length > take;
    if (hasMore) runs.pop();

    return {
      data: runs,
      pagination: {
        nextCursor: hasMore && runs.length > 0 ? runs[runs.length - 1].id : null,
        hasMore,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  [4] GET /billing/reconciliation/runs/:runId
  //  Chi tiết một run + discrepancies
  // ═══════════════════════════════════════════════════════════════

  @Get('runs/:runId')
  async getRunDetail(
    @Headers() headers: Record<string, string>,
    @Param('runId') runId: string,
  ) {
    const user = this.requireRole(headers, ['OWNER', 'ADMIN', 'OPERATOR']);

    const run = await this.prisma.reconciliationRun
      .findUnique({ where: { id: runId } })
      .catch(() => null);

    if (!run) {
      throw new NotFoundException(`Reconciliation run not found: ${runId}`);
    }

    // IDOR protection
    if (run.tenantId !== user.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const discrepancies = await this.prisma.discrepancyRecord
      .findMany({
        where: { runId },
        orderBy: { severity: 'asc' },
      })
      .catch(() => []);

    return {
      ...run,
      discrepancies,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  [5] GET /billing/reconciliation/discrepancies
  //  Danh sách discrepancies + filter
  // ═══════════════════════════════════════════════════════════════

  @Get('discrepancies')
  async listDiscrepancies(
    @Headers() headers: Record<string, string>,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('severity') severity?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    const user = this.requireRole(headers, ['OWNER', 'ADMIN', 'OPERATOR']);
    const take = Math.min(parseInt(limit ?? '20', 10) || 20, 100);

    const where: any = { tenantId: user.tenantId };
    if (severity) where.severity = severity.toUpperCase();
    if (category) where.category = category.toUpperCase();
    if (status) where.status = status.toUpperCase();

    const query: any = {
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
    };

    if (cursor) {
      query.cursor = { id: cursor };
      query.skip = 1;
    }

    const items = await this.prisma.discrepancyRecord
      .findMany(query)
      .catch(() => []);

    const hasMore = items.length > take;
    if (hasMore) items.pop();

    return {
      data: items,
      pagination: {
        nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  [6] PATCH /billing/reconciliation/discrepancies/:id/resolve
  //  Cập nhật resolution
  // ═══════════════════════════════════════════════════════════════

  @Patch('discrepancies/:id/resolve')
  async resolveDiscrepancy(
    @Headers() headers: Record<string, string>,
    @Param('id') id: string,
    @Body()
    body: {
      status: 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED_MANUAL' | 'DISMISSED';
      resolutionNote?: string;
    },
  ) {
    const user = this.requireRole(headers, ['OWNER', 'ADMIN']);

    // Validate status
    const validStatuses = [
      'ACKNOWLEDGED',
      'INVESTIGATING',
      'RESOLVED_MANUAL',
      'DISMISSED',
    ];
    if (!validStatuses.includes(body.status)) {
      throw new BadRequestException(
        `Invalid status. Allowed: ${validStatuses.join(', ')}`,
      );
    }

    // IDOR protection
    const existing = await this.prisma.discrepancyRecord
      .findUnique({ where: { id } })
      .catch(() => null);

    if (!existing) {
      throw new NotFoundException(`Discrepancy not found: ${id}`);
    }
    if (existing.tenantId !== user.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.discrepancyRecord.update({
      where: { id },
      data: {
        status: body.status,
        resolvedBy: body.status === 'RESOLVED_MANUAL' ? user.userId : undefined,
        resolvedAt:
          body.status === 'RESOLVED_MANUAL' ? new Date() : undefined,
        resolutionNote: body.resolutionNote,
      },
    });

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════
  //  [7] POST /billing/reconciliation/freeze
  //  Freeze wallet thủ công
  // ═══════════════════════════════════════════════════════════════

  @Post('freeze')
  async manualFreeze(
    @Headers() headers: Record<string, string>,
    @Body() body: { reason?: string; hours?: number },
  ) {
    const user = this.requireRole(headers, ['OWNER', 'ADMIN']);

    // Tạo discrepancy CRITICAL và gọi freeze
    const discrepancy = await this.prisma.discrepancyRecord.create({
      data: {
        tenantId: user.tenantId,
        severity: 'CRITICAL',
        category: 'SUSPICIOUS_ACTIVITY',
        title: 'Manual freeze requested by admin',
        description: body.reason ?? 'Admin-initiated wallet freeze',
        source: 'all',
        status: 'OPEN',
      },
    });

    const expiresAt = new Date(
      Date.now() + (body.hours ?? 24) * 60 * 60 * 1000,
    );

    // Gọi evaluateFreeze để thực hiện freeze
    const decision = await this.discrepancyResolver.evaluateFreeze(
      user.tenantId,
      [discrepancy],
    );

    return {
      frozen: decision.frozen,
      reason: decision.reason,
      expiresAt: decision.expiresAt,
      score: decision.score,
      heuristics: decision.triggeredHeuristics,
      discrepancyId: discrepancy.id,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  [8] POST /billing/reconciliation/unfreeze
  //  Unfreeze wallet (admin)
  // ═══════════════════════════════════════════════════════════════

  @Post('unfreeze')
  async manualUnfreeze(
    @Headers() headers: Record<string, string>,
    @Body() body: { reason: string },
  ) {
    const user = this.requireRole(headers, ['OWNER', 'ADMIN']);

    if (!body.reason || body.reason.trim().length === 0) {
      throw new BadRequestException('Reason is required for unfreeze');
    }

    await this.discrepancyResolver.unfreezeWallet(
      user.tenantId,
      user.userId,
      body.reason,
    );

    return {
      unfrozen: true,
      tenantId: user.tenantId,
      requestedBy: user.userId,
      reason: body.reason,
      timestamp: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  [9] POST /billing/reconciliation/export
  //  Tạo job xuất báo cáo bất đồng bộ (stream CSV từ disk)
  // ═══════════════════════════════════════════════════════════════

  @Post('export')
  async requestExport(
    @Headers() headers: Record<string, string>,
    @Body()
    body: {
      reportType: 'daily' | 'weekly' | 'monthly' | 'custom';
      format?: 'csv' | 'xlsx';
      dateFrom: string;
      dateTo: string;
      includeDetails?: boolean;
    },
  ) {
    const user = this.requireRole(headers, ['OWNER', 'ADMIN']);

    // Validate dates
    const dateFrom = new Date(body.dateFrom);
    const dateTo = new Date(body.dateTo);

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      throw new BadRequestException('Invalid date format. Use ISO-8601.');
    }
    if (dateFrom >= dateTo) {
      throw new BadRequestException('dateFrom must be before dateTo');
    }

    // Rate limit: tối đa 10 pending jobs / tenant
    const pendingCount = await this.prisma.financialReportJob
      .count({
        where: {
          tenantId: user.tenantId,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      })
      .catch(() => 0);

    if (pendingCount >= 10) {
      throw new BadRequestException(
        'Too many pending export jobs. Wait for existing jobs to complete.',
      );
    }

    const result = await this.reportExporter.requestReport({
      tenantId: user.tenantId,
      requestedBy: user.userId,
      reportType: body.reportType,
      format: body.format ?? 'csv',
      dateFrom,
      dateTo,
      includeDetails: body.includeDetails ?? false,
    });

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  //  [10] GET /billing/reconciliation/export/:jobId/status
  //  Poll tiến độ job
  // ═══════════════════════════════════════════════════════════════

  @Get('export/:jobId/status')
  async getExportStatus(
    @Headers() headers: Record<string, string>,
    @Param('jobId') jobId: string,
  ) {
    const user = this.requireRole(headers, ['OWNER', 'ADMIN', 'OPERATOR']);
    const progress = await this.reportExporter.getJobStatus(jobId);

    // IDOR protection: kiểm tra job thuộc tenant của user
    const job = await this.prisma.financialReportJob
      .findUnique({ where: { id: jobId } })
      .catch(() => null);

    if (!job) {
      throw new NotFoundException(`Export job not found: ${jobId}`);
    }
    if (job.tenantId !== user.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    return progress;
  }

  // ═══════════════════════════════════════════════════════════════
  //  [11] GET /billing/reconciliation/export/:jobId/download
  //  Download file báo cáo (stream từ disk, bảo mật chống IDOR)
  // ═══════════════════════════════════════════════════════════════

  @Get('export/:jobId/download')
  async downloadExport(
    @Headers() headers: Record<string, string>,
    @Param('jobId') jobId: string,
    @Res() res: Response,
  ) {
    const user = this.requireRole(headers, ['OWNER', 'ADMIN', 'OPERATOR']);

    // IDOR protection: kiểm tra job thuộc tenant của user
    const job = await this.prisma.financialReportJob
      .findUnique({ where: { id: jobId } })
      .catch(() => null);

    if (!job) {
      throw new NotFoundException(`Export job not found: ${jobId}`);
    }
    if (job.tenantId !== user.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const download = await this.reportExporter.getDownloadStream(jobId);

    // Stream trực tiếp từ disk, không load memory
    res.setHeader('Content-Type', download.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${download.filename}"`,
    );
    res.setHeader('Content-Length', download.contentLength);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    download.stream.pipe(res);
  }

  // ═══════════════════════════════════════════════════════════════
  //  [12] GET /billing/reconciliation/export/jobs
  //  Danh sách export jobs gần đây
  // ═══════════════════════════════════════════════════════════════

  @Get('export/jobs')
  async listExportJobs(
    @Headers() headers: Record<string, string>,
    @Query('limit') limit?: string,
  ) {
    const user = this.requireRole(headers, ['OWNER', 'ADMIN', 'OPERATOR']);
    const take = Math.min(parseInt(limit ?? '10', 10) || 10, 50);

    const jobs = await this.prisma.financialReportJob
      .findMany({
        where: { tenantId: user.tenantId },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          reportType: true,
          format: true,
          status: true,
          dateFrom: true,
          dateTo: true,
          fileSize: true,
          error: true,
          createdAt: true,
          completedAt: true,
        },
      })
      .catch(() => []);

    return {
      data: jobs,
      count: jobs.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  AUTH HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * requireRole
   * ============
   * Middleware tạm thời: kiểm tra role từ header X-Authenticated-User.
   * Khi tích hợp AuthGuard thật, thay bằng @UseGuards(AuthGuard) + @User().
   *
   * Header: X-Authenticated-User: {"userId":"...","tenantId":"...","role":"..."}
   * Hoặc: X-Tenant-Id + X-User-Id + X-User-Role
   */
  private requireRole(
    headers: Record<string, string>,
    allowedRoles: string[],
  ): AuthenticatedUser {
    let user: AuthenticatedUser;

    // Thử parse từ X-Authenticated-User
    const authHeader = headers['x-authenticated-user'];
    if (authHeader) {
      try {
        user = JSON.parse(authHeader);
      } catch {
        throw new ForbiddenException('Invalid auth header format');
      }
    } else {
      // Fallback cho development: từ các header riêng lẻ
      user = {
        userId: headers['x-user-id'] ?? 'system',
        tenantId: headers['x-tenant-id'] ?? 'dev-tenant',
        role: (headers['x-user-role']?.toUpperCase() as AuthenticatedUser['role']) ?? 'OWNER',
      };
    }

    // Kiểm tra role
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Requires one of roles: ${allowedRoles.join(', ')}. Current: ${user.role}`,
      );
    }

    return user;
  }
}

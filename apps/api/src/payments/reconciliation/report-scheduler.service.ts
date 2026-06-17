// ============================================================
// report-scheduler.service.ts — Backup Cron Scheduler
// ============================================================
// Quản lý 5 cron jobs chạy định kỳ cho Reconciliation Engine.
// Không dùng @nestjs/schedule (tránh dependency không có sẵn) —
// dùng setInterval/setTimeout thuần với job scheduling pattern.
//
// Các job:
//   [1] Financial Audit Loop       — mỗi 6 giờ
//   [2] Auto-resolve stale INFO    — mỗi 1 giờ
//   [3] Escalate unacknowledged    — mỗi 1 giờ (offset 15 phút)
//   [4] Auto-unfreeze expired      — mỗi 30 phút
//   [5] Cleanup old export files   — mỗi 1 giờ (offset 30 phút)
//
// Mỗi job có interval riêng, độc lập — không ảnh hưởng lẫn nhau.
// Tất cả đều có error boundary + logging đầy đủ.
// ============================================================

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { DiscrepancyResolverService } from './discrepancy-resolver.service';
import { FinancialReportExporterService } from './financial-report-exporter.service';
import { PrismaService } from '../../prisma.service';
import { RECONCILIATION_CRON, RECONCILIATION_LIMITS } from './reconciliation.config';

interface CronJobEntry {
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
  timerId: ReturnType<typeof setInterval> | null;
  running: boolean;
}

@Injectable()
export class ReportSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportSchedulerService.name);
  private readonly jobs: CronJobEntry[] = [];
  private started = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliationService: ReconciliationService,
    private readonly discrepancyResolver: DiscrepancyResolverService,
    private readonly reportExporter: FinancialReportExporterService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  onModuleInit() {
    this.registerAllJobs();
    this.startAll();
    this.logger.log(
      `[ReportScheduler] initialized with ${this.jobs.length} cron jobs`,
    );
  }

  onModuleDestroy() {
    this.stopAll();
    this.logger.log('[ReportScheduler] all cron jobs stopped');
  }

  // ═══════════════════════════════════════════════════════════════
  //  JOB DEFINITIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * registerAllJobs
   * ================
   * Đăng ký 5 cron jobs theo thiết kế mục V.
   * Mỗi job có error boundary riêng để không crash scheduler.
   */
  private registerAllJobs(): void {
    // ── [1] Financial Audit Loop — mỗi 6 giờ ──
    this.addJob({
      name: 'financial-audit-loop',
      intervalMs: this.parseCronInterval(RECONCILIATION_CRON.auditLoop),
      handler: async () => {
        this.logger.log('[Job 1] Running financial audit loop...');
        const startMs = Date.now();
        const results = await this.reconciliationService.runFinancialAuditLoop();
        const durationMs = Date.now() - startMs;
        const totalDiscrepancies = results.reduce(
          (s, r) => s + r.discrepanciesFound,
          0,
        );
        this.logger.log(
          `[Job 1] Audit complete: ${results.length} tenants, ${totalDiscrepancies} discrepancies in ${durationMs}ms`,
        );
      },
    });

    // ── [2] Auto-resolve stale INFO/WARNING — mỗi 1 giờ ──
    this.addJob({
      name: 'auto-resolve-stale',
      intervalMs: this.parseCronInterval(RECONCILIATION_CRON.autoResolveStale),
      handler: async () => {
        this.logger.log('[Job 2] Auto-resolving stale discrepancies...');
        const staleThreshold = new Date(
          Date.now() -
            RECONCILIATION_LIMITS.staleAfterDays * 24 * 60 * 60 * 1000,
        );

        const result = await (this.prisma as any).discrepancyRecord.updateMany({
          where: {
            status: 'OPEN',
            severity: { in: ['INFO', 'WARNING'] },
            createdAt: { lte: staleThreshold },
          },
          data: {
            status: 'DISMISSED',
            resolvedBy: 'system',
            resolvedAt: new Date(),
            resolutionNote: `Auto-dismissed: stale after ${RECONCILIATION_LIMITS.staleAfterDays} days`,
          },
        });

        if (result.count > 0) {
          this.logger.log(
            `[Job 2] Auto-dismissed ${result.count} stale discrepancy(ies)`,
          );
        }
      },
    });

    // ── [3] Escalate unacknowledged WARNING — mỗi 1 giờ (offset 15 phút) ──
    this.addJob({
      name: 'escalate-unacknowledged',
      intervalMs: this.parseCronInterval(
        RECONCILIATION_CRON.escalateUnacknowledged,
      ),
      handler: async () => {
        this.logger.log('[Job 3] Escalating unacknowledged WARNINGs...');
        const escalateThreshold = new Date(
          Date.now() -
            RECONCILIATION_LIMITS.staleAfterDays * 24 * 60 * 60 * 1000,
        );

        const staleWarnings = await (this.prisma as any).discrepancyRecord.findMany(
          {
            where: {
              status: 'OPEN',
              severity: 'WARNING',
              createdAt: { lte: escalateThreshold },
            },
            select: { id: true, tenantId: true },
          },
        );

        if (staleWarnings.length === 0) return;

        const ids = staleWarnings.map((w: any) => w.id);
        const tenants = new Set(staleWarnings.map((w: any) => w.tenantId));

        await (this.prisma as any).discrepancyRecord.updateMany({
          where: { id: { in: ids } },
          data: {
            severity: 'CRITICAL',
            status: 'OPEN',
            description: `Escalated from WARNING: unacknowledged after ${RECONCILIATION_LIMITS.staleAfterDays} days`,
          },
        });

        // Trigger anti-fraud evaluation cho mỗi tenant bị ảnh hưởng
        for (const tenantId of tenants) {
          const criticalItems = await (this.prisma as any).discrepancyRecord.findMany(
            {
              where: { tenantId, id: { in: ids }, severity: 'CRITICAL' },
            },
          );
          if (criticalItems.length > 0) {
            await this.discrepancyResolver.evaluateFreeze(
              tenantId as string,
              criticalItems,
            );
          }
        }

        this.logger.log(
          `[Job 3] Escalated ${staleWarnings.length} WARNING(s) to CRITICAL across ${tenants.size} tenant(s)`,
        );
      },
    });

    // ── [4] Auto-unfreeze expired wallets — mỗi 30 phút ──
    this.addJob({
      name: 'auto-unfreeze',
      intervalMs: this.parseCronInterval(RECONCILIATION_CRON.autoUnfreeze),
      handler: async () => {
        this.logger.log('[Job 4] Checking expired wallet freezes...');
        const count = await this.discrepancyResolver.autoUnfreezeExpired();
        if (count > 0) {
          this.logger.log(`[Job 4] Auto-unfroze ${count} wallet(s)`);
        }
      },
    });

    // ── [5] Cleanup old export files — mỗi 1 giờ (offset 30 phút) ──
    this.addJob({
      name: 'cleanup-exports',
      intervalMs: this.parseCronInterval(RECONCILIATION_CRON.cleanupExports),
      handler: async () => {
        this.logger.log('[Job 5] Cleaning up expired export files...');
        const count = await this.reportExporter.cleanupExpiredFiles();
        if (count > 0) {
          this.logger.log(`[Job 5] Cleaned ${count} expired export file(s)`);
        }
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  SCHEDULER LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  private addJob(def: {
    name: string;
    intervalMs: number;
    handler: () => Promise<void>;
  }): void {
    this.jobs.push({
      name: def.name,
      intervalMs: def.intervalMs,
      handler: def.handler,
      timerId: null,
      running: false,
    });
  }

  private startAll(): void {
    if (this.started) return;
    this.started = true;

    for (const job of this.jobs) {
      // Random initial delay (5–60s) để tránh thundering herd khi server start
      const initialDelay = Math.floor(Math.random() * 55_000) + 5_000;

      setTimeout(() => {
        this.runJobSafely(job);
      }, initialDelay);

      job.timerId = setInterval(() => {
        this.runJobSafely(job);
      }, job.intervalMs);

      this.logger.log(
        `  [${job.name}] every ${(job.intervalMs / 60000).toFixed(0)}m (first in ${(initialDelay / 1000).toFixed(0)}s)`,
      );
    }
  }

  private stopAll(): void {
    for (const job of this.jobs) {
      if (job.timerId !== null) {
        clearInterval(job.timerId);
        job.timerId = null;
      }
    }
    this.started = false;
  }

  /**
   * runJobSafely
   * =============
   * Wrapper chạy job với error boundary.
   * Tránh crash scheduler khi job throw exception.
   */
  private async runJobSafely(job: CronJobEntry): Promise<void> {
    if (job.running) {
      this.logger.warn(
        `[${job.name}] previous run still in progress — skipping`,
      );
      return;
    }

    job.running = true;
    try {
      await job.handler();
    } catch (err) {
      this.logger.error(
        `[${job.name}] error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      job.running = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * parseCronInterval
   * ==================
   * Parse cron expression đơn giản → interval milliseconds.
   * Hỗ trợ các pattern CRON đang dùng.
   */
  private parseCronInterval(expr: string): number {
    const oneHour = 60 * 60 * 1000;
    const sixHours = 6 * oneHour;
    const thirtyMinutes = 30 * 60 * 1000;

    // */30 * * * * = 30 phút
    if (expr === '*/30 * * * *') return thirtyMinutes;
    // 0 */6 * * * = 6 giờ
    if (expr === '0 */6 * * *') return sixHours;
    // 0 * * * * | 15 * * * * | 30 * * * * = 1 giờ
    const hourlyPattern = /^(\d+) \* \* \* \*$/;
    if (hourlyPattern.test(expr)) return oneHour;

    this.logger.warn(
      `[parseCronInterval] unsupported: "${expr}" — fallback 1h`,
    );
    return oneHour;
  }
}

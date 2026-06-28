// ═══════════════════════════════════════════════════════════════════════════
// ai-agent-trigger.scheduler.ts — Proactive Trigger Background Scheduler
// ═══════════════════════════════════════════════════════════════════════════
// Chạy nền (setInterval) — mỗi 60 giây quét các trigger scheduled hết hạn.
// ── Phase 3: Per-tenant AI operator agent — proactive trigger execution ──
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { AiAgentTriggerService } from './ai-agent-trigger.service';

@Injectable()
export class AiAgentTriggerScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiAgentTriggerScheduler.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  /** Poll interval (ms) — mặc định 60 giây */
  private readonly POLL_INTERVAL_MS = 60_000;

  constructor(
    private readonly triggerService: AiAgentTriggerService,
  ) {}

  /**
   * onModuleInit
   * ───────────
   * Khởi động scheduler khi module được load.
   */
  onModuleInit(): void {
    this.logger.log(`Starting AgentTrigger scheduler (poll interval: ${this.POLL_INTERVAL_MS}ms)`);

    // Chạy ngay lần đầu sau 5 giây (để DB kịp init)
    setTimeout(() => {
      void this.tick().catch((err) =>
        this.logger.error('Initial trigger tick failed', err),
      );
    }, 5_000);

    this.intervalHandle = setInterval(() => {
      void this.tick().catch((err) =>
        this.logger.error('Scheduled trigger tick failed', err),
      );
    }, this.POLL_INTERVAL_MS);

    this.logger.log('AgentTrigger scheduler active');
  }

  /**
   * onModuleDestroy
   * ──────────────
   * Dọn dẹp khi app shutdown — tránh memory leak.
   */
  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.logger.log('AgentTrigger scheduler stopped');
  }

  // ═════════════════════════════════════════════════════════════════════
  //  Internal tick
  // ═════════════════════════════════════════════════════════════════════

  /**
   * tick
   * ────
   * Một poll cycle: kiểm tra và fire triggers hết hạn.
   * Dùng flag isRunning để tránh overlap nếu cycle trước chưa xong.
   */
  private async tick(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Previous tick still in progress, skipping');
      return;
    }

    this.isRunning = true;
    try {
      const results = await this.triggerService.checkAndFireDueTriggers();

      if (results.length > 0) {
        const succeeded = results.filter((r) => r.fired).length;
        const failed = results.filter((r) => !r.fired).length;

        this.logger.log(
          `Trigger tick: ${results.length} due → ${succeeded} fired, ${failed} failed`,
        );

        for (const result of results) {
          if (result.fired) {
            this.logger.debug(
              `  ✅ Trigger "${result.triggerName}" (${result.intent}) for tenant ${result.tenantId}`,
            );
          } else {
            this.logger.warn(
              `  ❌ Trigger "${result.triggerName}" failed: ${result.error}`,
            );
          }
        }
      }
    } catch (err) {
      this.logger.error(
        `Trigger tick error: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}

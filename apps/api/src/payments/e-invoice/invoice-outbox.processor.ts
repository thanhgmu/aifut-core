/**
 * Invoice Outbox Processor — E-Invoice
 * ======================================
 * Poller định kỳ xử lý hàng đợi gửi mail hóa đơn điện tử.
 *
 * Kiến trúc:
 *   - Chạy ngầm qua `OnModuleInit` + `setInterval` (interval 5 giây).
 *   - Quét bảng `NotificationLog` (channel=EMAIL) để tìm các bản ghi:
 *       a) status = PENDING, hoặc
 *       b) status = PENDING + metadata.nextRetryAt <= now (retry quá hạn)
 *   - Mỗi chu kỳ xử lý tối đa BATCH_SIZE (10) bản ghi.
 *   - Ủy thác việc gửi mail cho `InvoiceMailerService.send()`.
 *
 * Thay thế @nestjs/schedule ScheduleModule:
 *   package hiện tại chưa cài @nestjs/schedule, dùng setInterval native.
 *   Khi cài `npm install @nestjs/schedule`, chuyển sang @Interval decorator.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { InvoiceMailerService } from './invoice-mailer.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Khoảng thời gian giữa các lần poll (ms). */
const POLL_INTERVAL_MS = 5_000;

/** Số lượng bản ghi tối đa xử lý mỗi chu kỳ. */
const BATCH_SIZE = 10;

/** Delay khởi tạo poller (ms) — chờ module load xong. */
const INIT_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

@Injectable()
export class InvoiceOutboxProcessor implements OnModuleInit {
  private readonly logger = new Logger(InvoiceOutboxProcessor.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: InvoiceMailerService,
  ) {}

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Khi module khởi tạo xong, delay 2s rồi bắt đầu poller.
   *
   * TODO: Khi cài @nestjs/schedule, thay bằng @Interval(POLL_INTERVAL_MS)
   * và bỏ OnModuleInit/setInterval.
   */
  onModuleInit(): void {
    setTimeout(() => {
      this.logger.log(`InvoiceOutboxProcessor started — polling every ${POLL_INTERVAL_MS}ms`);
      this.startPoller();
    }, INIT_DELAY_MS);
  }

  // ── Poller ──────────────────────────────────────────────────────────────

  /**
   * Vòng lặp vô hạn: poll → process → nghỉ → poll.
   *
   * Guard isRunning chống overlap khi chu kỳ trước chưa xong
   * (dù rate 5s rất khó xảy ra với 10 items).
   */
  private startPoller(): void {
    const tick = async () => {
      if (this.isRunning) {
        this.logger.debug('Previous poll still running — skipping this cycle');
        return;
      }

      this.isRunning = true;
      try {
        await this.pollOnce();
      } catch (err) {
        this.logger.error(`Poll cycle error: ${(err as Error).message}`, (err as Error).stack);
      } finally {
        this.isRunning = false;
      }
    };

    setInterval(tick, POLL_INTERVAL_MS);

    // Chạy lần đầu ngay lập tức (không chờ interval đầu tiên)
    tick();
  }

  // ── Single Poll ─────────────────────────────────────────────────────────

  /**
   * Một chu kỳ poll duy nhất:
   *   1. Query các NotificationLog PENDING (channel=EMAIL) cần xử lý.
   *   2. Query các bản ghi đã FAILED nhưng còn trong cửa sổ retry.
   *   3. Gửi từng cái qua InvoiceMailerService.send().
   */
  private async pollOnce(): Promise<void> {
    const now = new Date().toISOString();

    // Query PENDING mới (chưa từng thất bại)
    const pendingJobs = await this.prisma.notificationLog.findMany({
      where: {
        channel: 'EMAIL',
        status: 'PENDING',
        // metadata chưa có retryCount (lần gửi đầu) hoặc retryCount=0
        AND: [
          { metadata: { path: ['retryCount'], equals: 0 } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    // Query PENDING đã thất bại nhưng đã đến hạn retry (nextRetryAt <= now)
    // Dùng lọc phía application vì Prisma không hỗ trợ filter JSON date dễ dàng.
    // Ta query tất cả PENDING có retryCount > 0 và filter phía sau.
    const retryJobs = await this.prisma.notificationLog.findMany({
      where: {
        channel: 'EMAIL',
        status: 'PENDING',
        NOT: { metadata: { path: ['retryCount'], equals: 0 } },
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE * 2, // Query nhiều hơn để có room filter
    });

    // Filter retryJobs: chỉ lấy những job đã đến hạn nextRetryAt
    const dueRetries = retryJobs.filter((job) => {
      const meta = (job.metadata ?? {}) as Record<string, any>;
      const nextRetryAt = meta.nextRetryAt as string | undefined;
      return nextRetryAt && nextRetryAt <= now;
    }).slice(0, BATCH_SIZE);

    // Gộp + xử lý
    const batch = [...pendingJobs, ...dueRetries].slice(0, BATCH_SIZE);

    if (batch.length === 0) return;

    this.logger.debug(`Processing ${batch.length} invoice mail jobs (${pendingJobs.length} pending, ${dueRetries.length} retries)`);

    // Gửi song song với concurrency limit = 3
    const concurrency = 3;
    for (let i = 0; i < batch.length; i += concurrency) {
      const slice = batch.slice(i, i + concurrency);
      await Promise.allSettled(
        slice.map((job) =>
          this.mailer.send(job.id).then((result) => {
            if (result.success) {
              this.logger.log(`✔ Invoice mail sent: ${job.id} → ${job.to}`);
            } else {
              this.logger.warn(`✘ Invoice mail failed: ${job.id} → ${job.to}: ${result.error}`);
            }
          }),
        ),
      );
    }
  }
}

// ============================================================
// refund-reconciliation.service.ts — Refund Reconciliation
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: Poller đối soát định kỳ các giao dịch hoàn tiền
// (RefundRecord) đang ở trạng thái PENDING quá 15 phút.
//
// Hoạt động:
//   1. Khởi động interval 5 phút khi module init (OnModuleInit)
//   2. Mỗi poll query RefundRecord WHERE status = 'PENDING'
//      AND createdAt < (now - 15 phút)
//   3. Với mỗi record PENDING quá hạn:
//      a. Kiểm tra LedgerTransaction có referenceId = refundRecord.id
//         và type = CREDIT không
//      b. Nếu có CREDIT thành công → cập nhật RefundRecord → SUCCESS
//      c. Nếu không có → đánh dấu FAILED (timeout)
//   4. Ghi log reconciliation report
//
// Kiến trúc:
//   - Poller chạy in-process (interval 5 phút) — lightweight,
//     không cần external queue/cron worker
//   - Idempotent: có thể restart tùy ý, không lo double-process
//   - Graceful shutdown: implements OnModuleDestroy
// ============================================================

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { LEDGER_CONFIG } from './ledger.config';

/**
 * Cấu hình poller reconciliation
 */
const RECONCILIATION_CONFIG = {
  /**
   * Interval giữa 2 lần poll (ms).
   * Mặc định: 5 phút.
   */
  pollIntervalMs: 5 * 60 * 1000, // 5 phút

  /**
   * Ngưỡng PENDING quá hạn (ms).
   * RefundRecord PENDING quá ngưỡng này sẽ bị xử lý.
   * Mặc định: 15 phút.
   */
  pendingTimeoutMs: 15 * 60 * 1000, // 15 phút

  /**
   * Kích thước batch tối đa mỗi lần poll.
   * Tránh overload DB với số lượng lớn refund cùng lúc.
   */
  batchSize: 100,
};

/**
 * ReconciliationReport
 * =====================
 * Báo cáo kết quả của một lần poll.
 */
interface ReconciliationReport {
  polledAt: string;
  totalPendingStale: number;
  resolvedToSuccess: number;
  resolvedToFailed: number;
  errors: string[];
}

@Injectable()
export class RefundReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RefundReconciliationService.name);

  /** Timer handle cho poller interval */
  private timerHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ================================================================
  // LIFECYCLE HOOKS
  // ================================================================

  /**
   * OnModuleInit: khởi động poller reconciliation.
   * Chạy poll đầu tiên sau 30 giây (cho các service khác init xong),
   * sau đó lặp mỗi RECONCILIATION_CONFIG.pollIntervalMs.
   */
  onModuleInit(): void {
    this.logger.log(
      `Refund reconciliation poller starting | ` +
        `interval=${RECONCILIATION_CONFIG.pollIntervalMs}ms | ` +
        `timeout=${RECONCILIATION_CONFIG.pendingTimeoutMs}ms | ` +
        `batch=${RECONCILIATION_CONFIG.batchSize}`,
    );

    // Poll đầu tiên sau 30 giây (cho DB connection + service khác init xong)
    setTimeout(() => {
      this.runReconciliation().catch((err) =>
        this.logger.error(`Initial reconciliation poll failed: ${err.message}`, err.stack),
      );
    }, 30_000);

    // Lặp định kỳ
    this.timerHandle = setInterval(() => {
      this.runReconciliation().catch((err) =>
        this.logger.error(`Reconciliation poll failed: ${err.message}`, err.stack),
      );
    }, RECONCILIATION_CONFIG.pollIntervalMs);
  }

  /**
   * OnModuleDestroy: dừng poller khi module bị destroy.
   * (Graceful shutdown)
   */
  onModuleDestroy(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
      this.logger.log('Refund reconciliation poller stopped (graceful shutdown).');
    }
  }

  // ================================================================
  // PUBLIC API
  // ================================================================

  /**
   * runReconciliation
   * ==================
   * Chạy một chu kỳ đối soát: tìm RefundRecord PENDING quá hạn,
   * kiểm tra CREDIT ledger, cập nhật trạng thái.
   *
   * Idempotent: có thể gọi nhiều lần, không trùng lặp.
   * Có thể gọi thủ công qua API nếu cần (future).
   *
   * @returns ReconciliationReport
   */
  async runReconciliation(): Promise<ReconciliationReport> {
    const report: ReconciliationReport = {
      polledAt: new Date().toISOString(),
      totalPendingStale: 0,
      resolvedToSuccess: 0,
      resolvedToFailed: 0,
      errors: [],
    };

    const cutoff = new Date(Date.now() - RECONCILIATION_CONFIG.pendingTimeoutMs);

    this.logger.debug(
      `Reconciliation poll | cutoff=${cutoff.toISOString()} | ` +
        `batch=${RECONCILIATION_CONFIG.batchSize}`,
    );

    try {
      // ── 1. Query RefundRecord PENDING quá hạn ────────────────
      const staleRecords = await this.prisma.refundRecord.findMany({
        where: {
          status: 'PENDING',
          createdAt: { lt: cutoff },
        },
        take: RECONCILIATION_CONFIG.batchSize,
        orderBy: { createdAt: 'asc' },
      });

      report.totalPendingStale = staleRecords.length;

      if (staleRecords.length === 0) {
        this.logger.debug('Reconciliation poll: không có PENDING record nào quá hạn.');
        return report;
      }

      this.logger.log(
        `Reconciliation poll: phát hiện ${staleRecords.length} RefundRecord PENDING quá hạn.`,
      );

      // ── 2. Xử lý từng record ─────────────────────────────────
      for (const record of staleRecords) {
        try {
          await this.resolveStaleRefund(record, report);
        } catch (error: any) {
          const errorMsg = `Lỗi xử lý RefundRecord ${record.id}: ${error.message}`;
          this.logger.error(errorMsg, error.stack);
          report.errors.push(errorMsg);
        }
      }

      // ── 3. Báo cáo ───────────────────────────────────────────
      this.logger.log(
        `Reconciliation poll complete | ` +
          `stale=${report.totalPendingStale} | ` +
          `→SUCCESS=${report.resolvedToSuccess} | ` +
          `→FAILED=${report.resolvedToFailed} | ` +
          `errors=${report.errors.length}`,
      );
    } catch (error: any) {
      const errorMsg = `Reconciliation poll query failed: ${error.message}`;
      this.logger.error(errorMsg, error.stack);
      report.errors.push(errorMsg);
    }

    return report;
  }

  // ================================================================
  // PRIVATE HELPERS
  // ================================================================

  /**
   * resolveStaleRefund
   * ===================
   * Xử lý một RefundRecord PENDING quá hạn.
   *
   * Logic:
   *   a. Tra cứu LedgerTransaction với referenceId = record.id
   *      và referenceType = 'refund' và type = 'CREDIT'
   *   b. Nếu có → CREDIT đã thành công → cập nhật record → SUCCESS
   *   c. Nếu không có → refund chưa hoàn tất → đánh dấu FAILED
   *      do timeout (quá 15 phút)
   */
  private async resolveStaleRefund(
    record: { id: string; originalReferenceId: string; tenantId: string; amount: bigint },
    report: ReconciliationReport,
  ): Promise<void> {
    // a. Tra cứu LedgerTransaction CREDIT 'refund'
    const creditTx = await this.prisma.ledgerTransaction.findFirst({
      where: {
        referenceType: 'refund',
        referenceId: record.id,
        type: 'CREDIT',
      },
    });

    if (creditTx) {
      // b. CREDIT đã thành công → cập nhật → SUCCESS
      await this.prisma.refundRecord.update({
        where: { id: record.id },
        data: { status: 'SUCCESS' },
      });

      this.logger.log(
        `Reconciliation: RefundRecord ${record.id} → SUCCESS ` +
          `(ledger CREDIT found: ${creditTx.id})`,
      );
      report.resolvedToSuccess++;
    } else {
      // c. Không có CREDIT → timeout → FAILED
      await this.prisma.refundRecord.update({
        where: { id: record.id },
        data: { status: 'FAILED' },
      });

      this.logger.warn(
        `Reconciliation: RefundRecord ${record.id} → FAILED (timeout) | ` +
          `originalReferenceId=${record.originalReferenceId} | ` +
          `tenant=${record.tenantId} | amount=${record.amount}`,
      );
      report.resolvedToFailed++;
    }
  }
}

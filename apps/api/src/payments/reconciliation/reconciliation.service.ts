// ============================================================
// reconciliation.service.ts — Reconciliation Engine Core
// ============================================================
// 3 nguồn dữ liệu đối soát:
//   A = Wallet.balance (số dư thực tế sau cùng)
//   B = SUM(LedgerTransaction.amount WHERE type=CREDIT)
//     - SUM(LedgerTransaction.amount WHERE type=DEBIT)
//   C = SUM(Invoice.amount WHERE status=paid)
//       - SUM(PaymentTransaction.amount WHERE status=refunded)
//
// Điều kiện lý tưởng: A = B và A ≈ C (với tolerance cho timing)
//
// Anti-fraud rule:
//   Nếu A ≠ B với diff > criticalDiscrepancyPercent của tổng dòng tiền
//   → freeze wallet + tạo DiscrepancyRecord CRITICAL
//
// Toàn bộ snapshot thực hiện trong interactive transaction READ-ONLY
// (Serializable) để không lock / không ghi vào wallet & ledger.
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { DiscrepancyResolverService } from './discrepancy-resolver.service';
import {
  DEFAULT_RECONCILIATION_THRESHOLDS,
  RECONCILIATION_LIMITS,
} from './reconciliation.config';
import type {
  AuditRunResult,
  DetectedDiscrepancy,
  FinancialSnapshot,
  ReconciliationThresholds,
} from './reconciliation.types';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discrepancyResolver: DiscrepancyResolverService,
  ) {}

  /**
   * runFinancialAuditLoop
   * =======================
   * Hàm core quét đối soát chéo. Gọi cho 1 tenant hoặc ALL tenants.
   *
   * Flow tổng quát:
   *   [1] Resolve danh sách tenant cần audit (1 hoặc tất cả wallet active)
   *   [2] Batch xử lý (batchSize), mỗi tenant gọi runAuditForSingleTenant()
   *   [3] Gom kết quả → AuditRunResult[]
   *
   * @param tenantId - ID tenant cần audit; bỏ trống = quét tất cả tenant có wallet
   * @returns AuditRunResult[]
   */
  async runFinancialAuditLoop(tenantId?: string): Promise<AuditRunResult[]> {
    const thresholds = DEFAULT_RECONCILIATION_THRESHOLDS;
    const tenantIds = await this.resolveTargetTenants(tenantId);

    const results: AuditRunResult[] = [];
    const { batchSize } = RECONCILIATION_LIMITS;

    for (let i = 0; i < tenantIds.length; i += batchSize) {
      const batch = tenantIds.slice(i, i + batchSize);
      const settled = await Promise.allSettled(
        batch.map((id) => this.runAuditForSingleTenant(id, thresholds)),
      );

      for (const [idx, outcome] of settled.entries()) {
        if (outcome.status === 'fulfilled') {
          results.push(outcome.value);
        } else {
          this.logger.error(
            `Audit failed for tenant ${batch[idx]}: ${String(outcome.reason)}`,
          );
        }
      }
    }

    return results;
  }

  /**
   * runAuditForSingleTenant
   * =========================
   * Audit 1 tenant. Snapshot read-only → tạo ReconciliationRun →
   * phát hiện lệch pha → ghi DiscrepancyRecord → gọi resolver nếu cần →
   * cập nhật run completed + summary → trả AuditRunResult.
   */
  private async runAuditForSingleTenant(
    tenantId: string,
    thresholds: ReconciliationThresholds,
  ): Promise<AuditRunResult> {
    const startedAt = Date.now();

    // ── [1] Tạo run record trạng thái RUNNING ──
    const run = await this.prisma.reconciliationRun.create({
      data: { tenantId, trigger: 'scheduled', status: 'RUNNING' },
    });

    try {
      // ── [2] Snapshot 3 nguồn sự thật trong transaction read-only ──
      const snapshot = await this.takeSnapshot(tenantId);

      // ── [3] Phát hiện lệch pha ──
      const detected = this.detectDiscrepancies(snapshot, thresholds);

      // ── [4] Ghi từng DiscrepancyRecord (idempotent qua dedupe key) ──
      const persisted = await this.persistDiscrepancies(
        run.id,
        tenantId,
        detected,
      );

      // ── [5] Nếu có CRITICAL → giao cho resolver xử lý + anti-fraud freeze ──
      const criticalItems = persisted.filter((d) => d.severity === 'CRITICAL');
      const resolution =
        persisted.length > 0
          ? await this.discrepancyResolver.resolveDiscrepancies(
              persisted,
              tenantId,
            )
          : null;

      const counts = this.countBySeverity(detected);
      const frozeWallet = resolution?.freezeDecision?.frozen ?? false;

      // ── [6] Cập nhật run completed + summary ──
      await this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          walletBalance: snapshot.walletBalance,
          ledgerSum: snapshot.ledgerSum,
          paidInvoiceSum: snapshot.paidInvoiceSum,
          discrepancyCount: persisted.length,
          summary: {
            ...counts,
            walletLedgerDiff: (
              snapshot.walletBalance - snapshot.ledgerSum
            ).toString(),
            ledgerInvoiceDiff: (
              snapshot.ledgerSum -
              (snapshot.paidInvoiceSum - snapshot.refundSum)
            ).toString(),
            criticalCount: criticalItems.length,
            frozeWallet,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        runId: run.id,
        tenantId,
        timestamp: new Date().toISOString(),
        walletBalance: snapshot.walletBalance.toString(),
        ledgerSum: snapshot.ledgerSum.toString(),
        diff: (snapshot.walletBalance - snapshot.ledgerSum).toString(),
        discrepanciesFound: persisted.length,
        criticalCount: counts.critical,
        warningsCount: counts.warning,
        infoCount: counts.info,
        frozeWallet,
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', completedAt: new Date(), error: message },
      });
      throw err;
    }
  }

  /**
   * takeSnapshot
   * =============
   * Chụp đồng thời 3 nguồn trong 1 interactive transaction READ-ONLY
   * (Serializable isolation) để tránh lệch do concurrent writes.
   * Không thực hiện bất kỳ ghi nào → không lock wallet/ledger.
   */
  private async takeSnapshot(tenantId: string): Promise<FinancialSnapshot> {
    return this.prisma.$transaction(
      async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { tenantId } });

        const ledgerByType = await tx.ledgerTransaction.groupBy({
          by: ['type'],
          where: { tenantId },
          _sum: { amount: true },
          _count: { _all: true },
        });

        let creditSum = 0n;
        let debitSum = 0n;
        let ledgerTxCount = 0;
        for (const row of ledgerByType) {
          const sum = row._sum.amount ?? 0n;
          ledgerTxCount += row._count._all;
          if (row.type === 'CREDIT') creditSum += sum;
          else if (row.type === 'DEBIT') debitSum += sum;
        }

        const paidInvoiceAgg = await tx.invoice.aggregate({
          where: { tenantId, status: 'paid' },
          _sum: { amount: true },
        });

        const refundAgg = await tx.paymentTransaction.aggregate({
          where: { tenantId, status: 'refunded' },
          _sum: { amount: true },
        });

        // Invoice/Payment amount là Float (VND nguyên) → chuyển sang BigInt an toàn
        const paidInvoiceSum = this.toBigInt(paidInvoiceAgg._sum.amount);
        const refundSum = this.toBigInt(refundAgg._sum.amount);

        return {
          tenantId,
          walletBalance: wallet?.balance ?? 0n,
          walletExists: !!wallet,
          creditSum,
          debitSum,
          ledgerSum: creditSum - debitSum,
          paidInvoiceSum,
          refundSum,
          ledgerTxCount,
          takenAt: new Date().toISOString(),
        } satisfies FinancialSnapshot;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * detectDiscrepancies
   * =====================
   * So sánh chéo snapshot, phân loại severity theo thresholds.
   * Trả về danh sách lệch pha chưa persist.
   */
  private detectDiscrepancies(
    snapshot: FinancialSnapshot,
    thresholds: ReconciliationThresholds,
  ): DetectedDiscrepancy[] {
    const out: DetectedDiscrepancy[] = [];

    // ── A vs B: Wallet balance vs Ledger sum ──
    const walletLedgerDiff = snapshot.walletBalance - snapshot.ledgerSum;
    const absWLDiff = this.abs(walletLedgerDiff);

    if (absWLDiff > thresholds.balanceToleranceVnd) {
      const totalFlow = snapshot.creditSum + snapshot.debitSum;
      const diffPercent =
        totalFlow > 0n ? this.percent(absWLDiff, totalFlow) : 0;
      const severity =
        diffPercent >= thresholds.criticalDiscrepancyPercent
          ? 'CRITICAL'
          : 'WARNING';

      out.push({
        category: 'BALANCE_MISMATCH',
        severity,
        title: `Wallet lệch ${walletLedgerDiff.toString()} so với ledger`,
        description: `Wallet.balance=${snapshot.walletBalance}, ledgerSum=${snapshot.ledgerSum}, diff=${walletLedgerDiff} (${diffPercent.toFixed(2)}% tổng dòng tiền)`,
        expectedValue: snapshot.ledgerSum,
        actualValue: snapshot.walletBalance,
        diffValue: walletLedgerDiff,
        source: 'all',
        affectedEntity: snapshot.tenantId,
        affectedType: 'Wallet',
      });
    } else if (absWLDiff > 0n) {
      // Trong tolerance nhưng khác 0 → INFO (resolver sẽ auto-dismiss)
      out.push({
        category: 'BALANCE_MISMATCH',
        severity: 'INFO',
        title: `Wallet lệch nhỏ ${walletLedgerDiff.toString()} (trong tolerance)`,
        expectedValue: snapshot.ledgerSum,
        actualValue: snapshot.walletBalance,
        diffValue: walletLedgerDiff,
        source: 'all',
        affectedEntity: snapshot.tenantId,
        affectedType: 'Wallet',
      });
    }

    // ── B vs C: Ledger sum vs (paid invoice - refund) ──
    const netInvoice = snapshot.paidInvoiceSum - snapshot.refundSum;
    const ledgerInvoiceDiff = snapshot.ledgerSum - netInvoice;
    const absLIDiff = this.abs(ledgerInvoiceDiff);

    if (absLIDiff > thresholds.invoiceToleranceVnd) {
      // diff > 0: có ledger CREDIT nhưng invoice chưa paid → ORPHAN_LEDGER_CREDIT
      // diff < 0: invoice paid nhưng thiếu ledger CREDIT → MISSING_LEDGER_CREDIT
      const category =
        ledgerInvoiceDiff > 0n
          ? 'ORPHAN_LEDGER_CREDIT'
          : 'MISSING_LEDGER_CREDIT_FOR_PAID_INVOICE';

      out.push({
        category,
        severity: 'WARNING',
        title:
          category === 'ORPHAN_LEDGER_CREDIT'
            ? `Ledger dư ${ledgerInvoiceDiff.toString()} so với invoice đã thu`
            : `Thiếu ledger CREDIT ${absLIDiff.toString()} cho invoice đã thanh toán`,
        description: `ledgerSum=${snapshot.ledgerSum}, netInvoice=${netInvoice} (paid=${snapshot.paidInvoiceSum}, refund=${snapshot.refundSum})`,
        expectedValue: netInvoice,
        actualValue: snapshot.ledgerSum,
        diffValue: ledgerInvoiceDiff,
        source: 'invoice',
        affectedEntity: snapshot.tenantId,
        affectedType: 'Invoice',
      });
    }

    return out;
  }

  /**
   * persistDiscrepancies
   * =====================
   * Ghi từng DiscrepancyRecord. Dùng dedupe unique key
   * (tenantId, runId, category, affectedEntity) — bỏ qua trùng lặp.
   */
  private async persistDiscrepancies(
    runId: string,
    tenantId: string,
    detected: DetectedDiscrepancy[],
  ) {
    const created: any[] = [];
    for (const d of detected) {
      try {
        const rec = await this.prisma.discrepancyRecord.create({
          data: {
            runId,
            tenantId,
            severity: d.severity,
            category: d.category,
            title: d.title,
            description: d.description,
            expectedValue: d.expectedValue,
            actualValue: d.actualValue,
            diffValue: d.diffValue,
            source: d.source,
            affectedEntity: d.affectedEntity,
            affectedType: d.affectedType,
            status: 'OPEN',
          },
        });
        created.push(rec);
      } catch (err) {
        // P2002 = unique constraint (dedupe key) → bỏ qua, không phải lỗi nghiêm trọng
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          this.logger.debug(
            `Discrepancy trùng dedupe key, bỏ qua: ${d.category}/${d.affectedEntity}`,
          );
          continue;
        }
        throw err;
      }
    }
    return created;
  }

  // ── Helpers ──

  private async resolveTargetTenants(tenantId?: string): Promise<string[]> {
    if (tenantId && tenantId !== 'all') return [tenantId];
    const wallets = await this.prisma.wallet.findMany({
      select: { tenantId: true },
      take: RECONCILIATION_LIMITS.maxTenantsPerRun,
      orderBy: { updatedAt: 'desc' },
    });
    return wallets.map((w) => w.tenantId);
  }

  private countBySeverity(items: DetectedDiscrepancy[]) {
    return {
      info: items.filter((d) => d.severity === 'INFO').length,
      warning: items.filter((d) => d.severity === 'WARNING').length,
      critical: items.filter((d) => d.severity === 'CRITICAL').length,
    };
  }

  private toBigInt(value: number | null | undefined): bigint {
    if (value == null) return 0n;
    return BigInt(Math.round(value));
  }

  private abs(value: bigint): bigint {
    return value < 0n ? -value : value;
  }

  private percent(part: bigint, whole: bigint): number {
    if (whole === 0n) return 0;
    // Nhân 10000 để giữ 2 chữ số thập phân khi chia số nguyên lớn
    return Number((part * 10000n) / whole) / 100;
  }
}

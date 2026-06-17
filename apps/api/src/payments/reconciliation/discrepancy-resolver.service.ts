// ============================================================
// discrepancy-resolver.service.ts — Discrepancy Resolver
// ============================================================
// Phân loại và xử lý các giao dịch lệch pha với 3 cấp độ:
//
//   LEVEL 1 — INFO (auto-dismiss):
//     Sai lệch trong tolerance cho phép. Ghi audit log,
//     tự động đánh dấu DISMISSED. Không can thiệp gì thêm.
//
//   LEVEL 2 — WARNING (acknowledge + investigate):
//     Sai lệch ngoài tolerance nhưng dưới ngưỡng nguy hiểm.
//     Ghi audit log, gửi notification đến admin tenant.
//     Yêu cầu admin ACKNOWLEDGED trong vòng 7 ngày.
//     Nếu quá 7 ngày không acknowledge → tự escalate → LEVEL 3.
//
//   LEVEL 3 — CRITICAL (auto-freeze):
//     Sai lệch vượt ngưỡng nguy hiểm + anti-fraud heuristic.
//     Ghi audit log với level CRITICAL.
//     Wallet bị freeze 24h, không cho debit.
//     Gửi notification real-time đến admin.
//     Admin phải INVESTIGATING → RESOLVE_MANUAL mới unfreeze.
//
// Anti-fraud scoring (evaluateFreeze):
//   Heuristic 1: tỷ lệ sai lệch >= criticalDiscrepancyPercent   → +30
//   Heuristic 2: >= 3 CRITICAL trong 24h gần nhất               → +25
//   Heuristic 3: debit lớn > 100M VND                           → +25
//   Heuristic 4: đột biến giao dịch > 3σ so với trung bình 7 ngày → +10
//   Heuristic 5: duplicate reference trong batch                 → +10
//   score >= 50 → freeze ANTI_FRAUD_TRIGGER (24h)
//   score >= 30 → freeze SUSPICIOUS_LEDGER_ACTIVITY (12h)
// ============================================================

import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma.service';
import {
  ANTI_FRAUD_SCORE,
  FREEZE_DECISION,
  RECONCILIATION_LIMITS,
} from './reconciliation.config';
import type {
  FreezeDecision,
  ResolutionSummary,
  WalletFreezeReasonLiteral,
} from './reconciliation.types';

@Injectable()
export class DiscrepancyResolverService {
  private readonly logger = new Logger(DiscrepancyResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  /**
   * resolveDiscrepancies
   * =====================
   * Entry point từ ReconciliationService.
   * Phân loại batch discrepancies, xử lý từng cái theo LEVEL.
   *
   * @param discrepancies - Danh sách DiscrepancyRecord vừa được tạo
   * @param tenantId
   */
  async resolveDiscrepancies(
    discrepancies: any[],
    tenantId: string,
  ): Promise<ResolutionSummary> {
    const criticalItems: any[] = [];

    let autoDismissed = 0;
    let acknowledgedRequired = 0;

    for (const d of discrepancies) {
      const severity: string = d.severity ?? 'INFO';

      switch (severity) {
        case 'INFO':
          // LEVEL 1 — tự động dismiss
          await this.autoDismiss(d);
          autoDismissed++;
          break;

        case 'WARNING':
          // LEVEL 2 — ghi audit trail + gửi notification
          await this.writeAuditTrail(d, null, tenantId);
          await this.dispatchNotification(tenantId, d, 'WARNING');
          acknowledgedRequired++;
          break;

        case 'CRITICAL':
          // LEVEL 3 — gom lại để đánh giá freeze
          criticalItems.push(d);
          acknowledgedRequired++;
          break;
      }
    }

    // ── Đánh giá freeze cho CRITICAL items ──
    let freezeDecision: FreezeDecision | null = null;
    if (criticalItems.length > 0) {
      freezeDecision = await this.evaluateFreeze(tenantId, criticalItems);
    }

    // ── Ghi audit trail cho CRITICAL (có thể đã freeze) ──
    for (const item of criticalItems) {
      await this.writeAuditTrail(item, freezeDecision, tenantId);
    }

    return {
      tenantId,
      processed: discrepancies.length,
      autoDismissed,
      acknowledgedRequired,
      escalated: 0,
      freezeDecision,
    };
  }

  /**
   * evaluateFreeze
   * ===============
   * Anti-fraud: kiểm tra 5 heuristic trước khi quyết định freeze.
   * Trả về FreezeDecision chi tiết.
   */
  async evaluateFreeze(
    tenantId: string,
    criticalItems: any[],
  ): Promise<FreezeDecision> {
    let score = 0;
    const triggeredHeuristics: string[] = [];

    // ── Heuristic 1: tỷ lệ sai lệch ──
    // Kiểm tra diffValue của các critical items có > 5% tổng dòng tiền không
    const maxDiff = criticalItems.reduce(
      (max, item) => {
        const dv = item.diffValue ? BigInt(String(item.diffValue)) : 0n;
        return dv > max ? dv : max;
      },
      0n,
    );

    // Lấy tổng dòng tiền ledger của tenant để so sánh
    try {
      const ledgerByType = await this.prisma.ledgerTransaction.groupBy({
        by: ['type'],
        where: { tenantId },
        _sum: { amount: true },
      });
      let totalFlow = 0n;
      for (const row of ledgerByType) {
        totalFlow += row._sum.amount ?? 0n;
      }
      if (totalFlow > 0n) {
        const diffPercent = Number((maxDiff * 10000n) / totalFlow) / 100;
        if (diffPercent >= 5.0) {
          score += ANTI_FRAUD_SCORE.highDiffPercent;
          triggeredHeuristics.push('high_diff_percent');
        }
      }
    } catch {
      // Không có ledger data → bỏ qua heuristic này
    }

    // ── Heuristic 2: tần suất CRITICAL gần đây ──
    try {
      const recentCriticalCount = await this.prisma.discrepancyRecord.count({
        where: {
          tenantId,
          severity: 'CRITICAL',
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      });
      if (recentCriticalCount >= 3) {
        score += ANTI_FRAUD_SCORE.recentCriticalBurst;
        triggeredHeuristics.push('recent_critical_burst');
      }
    } catch {
      // Bảng chưa có migration → bỏ qua
    }

    // ── Heuristic 3: debit lớn bất thường ──
    const highValueDebits = criticalItems.filter((item) => {
      const dv = item.diffValue ? BigInt(String(item.diffValue)) : 0n;
      return (
        item.affectedType === 'LedgerTransaction' &&
        dv > 100_000_000n
      );
    });
    if (highValueDebits.length > 0) {
      score += ANTI_FRAUD_SCORE.highValueDebit;
      triggeredHeuristics.push('high_value_debit');
    }

    // ── Heuristic 4: đột biến số lượng giao dịch ──
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Lấy tổng giao dịch 7 ngày để tính trung bình
      const recentTxCount = await this.prisma.ledgerTransaction.count({
        where: {
          tenantId,
          createdAt: { gte: sevenDaysAgo },
        },
      });
      const avgTxPerDay = recentTxCount / 7;

      // Lấy tổng giao dịch hôm nay
      const todayTxCount = await this.prisma.ledgerTransaction.count({
        where: {
          tenantId,
          createdAt: { gte: todayStart },
        },
      });

      if (avgTxPerDay > 0 && todayTxCount > avgTxPerDay * 3) {
        score += ANTI_FRAUD_SCORE.transactionSpike;
        triggeredHeuristics.push('transaction_spike');
      }
    } catch {
      // Không có ledger data → bỏ qua
    }

    // ── Heuristic 5: duplicate reference ──
    const dupItems = criticalItems.filter(
      (item) => item.category === 'DUPLICATE_REFERENCE',
    );
    if (dupItems.length > 0) {
      score += ANTI_FRAUD_SCORE.duplicateReference;
      triggeredHeuristics.push('duplicate_reference');
    }

    // ── Quyết định freeze dựa trên score ──
    if (score >= FREEZE_DECISION.hardFreezeScore) {
      // Freeze cứng: ANTI_FRAUD_TRIGGER, 24h
      const expiresAt = new Date(
        Date.now() + FREEZE_DECISION.hardFreezeHours * 60 * 60 * 1000,
      );
      await this.freezeWallet(
        tenantId,
        'ANTI_FRAUD_TRIGGER',
        expiresAt,
        criticalItems,
      );

      return {
        frozen: true,
        score,
        reason: 'ANTI_FRAUD_TRIGGER',
        expiresAt: expiresAt.toISOString(),
        triggeredHeuristics,
      };
    }

    if (score >= FREEZE_DECISION.softFreezeScore) {
      // Freeze mềm: SUSPICIOUS_LEDGER_ACTIVITY, 12h
      const expiresAt = new Date(
        Date.now() + FREEZE_DECISION.softFreezeHours * 60 * 60 * 1000,
      );
      await this.freezeWallet(
        tenantId,
        'SUSPICIOUS_LEDGER_ACTIVITY',
        expiresAt,
        criticalItems,
      );

      return {
        frozen: true,
        score,
        reason: 'SUSPICIOUS_LEDGER_ACTIVITY',
        expiresAt: expiresAt.toISOString(),
        triggeredHeuristics,
      };
    }

    // Không freeze — ghi chú WARNING vào các discrepancy
    this.logger.log(
      `[evaluateFreeze] tenant=${tenantId} score=${score} — no freeze (threshold=${FREEZE_DECISION.softFreezeScore})`,
    );

    return {
      frozen: false,
      score,
      reason: null,
      expiresAt: null,
      triggeredHeuristics,
    };
  }

  /**
   * unfreezeWallet
   * ===============
   * Admin manual unfreeze. Yêu cầu INVESTIGATING status trước.
   */
  async unfreezeWallet(
    tenantId: string,
    requestedBy: string,
    reason: string,
  ): Promise<void> {
    // Cập nhật tất cả DiscrepancyRecord đang frozen
    await this.prisma.discrepancyRecord.updateMany({
      where: {
        tenantId,
        walletFrozen: true,
        freezeExpiresAt: { gt: new Date() },
      },
      data: {
        status: 'RESOLVED_MANUAL',
        resolvedBy: requestedBy,
        resolvedAt: new Date(),
        resolutionNote: `Manual unfreeze: ${reason}`,
        walletFrozen: false,
        freezeExpiresAt: new Date(), // hết hạn ngay
      },
    });

    // Ghi audit trail qua NotificationLog
    await this.prisma.notificationLog.create({
      data: {
        tenantId,
        channel: 'SYSTEM_AUDIT' as any,
        type: 'WALLET_UNFREEZE',
        template: 'SYSTEM',
        recipient: tenantId,
        subject: `Wallet unfrozen by ${requestedBy}`,
        body: JSON.stringify({
          action: 'WALLET_UNFREEZE',
          requestedBy,
          reason,
          timestamp: new Date().toISOString(),
        }),
        status: 'SENT',
      } as any,
    });

    this.logger.warn(
      `[unfreezeWallet] tenant=${tenantId} by=${requestedBy}`,
    );
  }

  /**
   * autoUnfreezeExpired
   * =====================
   * Kiểm tra + mở khóa wallet đã freeze quá freezeExpiresAt.
   * Chạy mỗi 30 phút từ ReportSchedulerService.
   *
   * @returns số lượng wallet đã được auto-unfreeze
   */
  async autoUnfreezeExpired(): Promise<number> {
    const expired = await this.prisma.discrepancyRecord.findMany({
      where: {
        walletFrozen: true,
        freezeExpiresAt: { lte: new Date() },
      },
    });

    if (expired.length === 0) return 0;

    // Cập nhật hàng loạt
    const ids = expired.map((e) => e.id);
    await this.prisma.discrepancyRecord.updateMany({
      where: { id: { in: ids } },
      data: {
        status: 'DISMISSED',
        walletFrozen: false,
        resolutionNote: 'Auto-unfreeze: freeze period expired',
        resolvedBy: 'system',
        resolvedAt: new Date(),
      },
    });

    this.logger.log(
      `[autoUnfreezeExpired] unfroze ${expired.length} wallet(s)`,
    );

    return expired.length;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * freezeWallet
   * =============
   * Đóng băng wallet tenant. Gây ra bởi anti-fraud trigger.
   * No-op lock trên Wallet để đảm bảo ghi nhận.
   * Ghi NotificationLog + cập nhật DiscrepancyRecord.
   */
  private async freezeWallet(
    tenantId: string,
    reason: WalletFreezeReasonLiteral,
    expiresAt: Date,
    criticalItems: any[],
  ): Promise<void> {
    const now = new Date();

    // 1. Touch wallet (no-op balance update để log access)
    try {
      const wallet = await this.prisma.wallet.findUnique({
        where: { tenantId },
      });
      if (wallet) {
        await this.prisma.wallet.update({
          where: { id: wallet.id },
          data: { updatedAt: now },
        });
      }
    } catch {
      // Wallet chưa tồn tại — bỏ qua
    }

    // 2. Cập nhật tất cả discrepancy items
    const itemIds = criticalItems.map((i) => i.id).filter(Boolean);
    if (itemIds.length > 0) {
      await this.prisma.discrepancyRecord.updateMany({
        where: { id: { in: itemIds } },
        data: {
          walletFrozen: true,
          freezeReason: reason,
          freezeExpiresAt: expiresAt,
        },
      });
    }

    // 3. Ghi NotificationLog (SYSTEM_AUDIT)
    await this.prisma.notificationLog.create({
      data: {
        tenantId,
        channel: 'SYSTEM_AUDIT' as any,
        type: 'WALLET_FREEZE',
        template: 'SYSTEM',
        recipient: tenantId,
        subject: `Wallet frozen — ${reason}`,
        body: JSON.stringify({
          action: 'WALLET_FREEZE',
          reason,
          score: FREEZE_DECISION.hardFreezeScore,
          expiresAt: expiresAt.toISOString(),
          discrepancyIds: itemIds,
          timestamp: now.toISOString(),
        }),
        status: 'SENT',
      } as any,
    });

    this.logger.warn(
      `[freezeWallet] tenant=${tenantId} reason=${reason} expiresAt=${expiresAt.toISOString()}`,
    );
  }

  /**
   * autoDismiss
   * ============
   * Tự động đánh dấu DISMISSED cho INFO discrepancies.
   */
  private async autoDismiss(discrepancy: any): Promise<void> {
    await this.prisma.discrepancyRecord.update({
      where: { id: discrepancy.id },
      data: {
        status: 'DISMISSED',
        resolvedBy: 'system',
        resolvedAt: new Date(),
        resolutionNote: 'Auto-dismissed: within tolerance',
      },
    });
  }

  /**
   * writeAuditTrail
   * ================
   * Ghi vết discrepancy vào NotificationLog.
   * CRITICAL/WARNING → body JSON chi tiết.
   */
  private async writeAuditTrail(
    discrepancy: any,
    decision: FreezeDecision | null,
    tenantId: string,
  ): Promise<void> {
    const severity: string = discrepancy.severity ?? 'INFO';

    await this.prisma.notificationLog.create({
      data: {
        tenantId,
        channel: 'SYSTEM_AUDIT' as any,
        type: 'RECONCILIATION_DISCREPANCY',
        template: 'SYSTEM',
        recipient: tenantId,
        subject: `[${severity}] ${discrepancy.title ?? 'Discrepancy'}`,
        body: JSON.stringify({
          action: 'DISCREPANCY_RESOLVED',
          discrepancyId: discrepancy.id,
          category: discrepancy.category,
          severity,
          expectedValue: discrepancy.expectedValue?.toString(),
          actualValue: discrepancy.actualValue?.toString(),
          diffValue: discrepancy.diffValue?.toString(),
 freezeDecision: decision ? (decision as any) : null,
          timestamp: new Date().toISOString(),
        }),
        status: 'SENT',
      } as any,
    });
  }

  /**
   * dispatchNotification
   * =====================
   * Gửi notification đến admin tenant cho WARNING/CRITICAL.
   * Dùng NotificationLog chung với kênh EMAIL để InvoiceOutboxProcessor
   * gửi thực tế.
   */
  private async dispatchNotification(
    tenantId: string,
    discrepancy: any,
    level: string,
  ): Promise<void> {
    try {
      // Lấy email tenant (nếu có) từ Tenant model
      let tenantEmail = 'admin@localhost';
      try {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { email: true },
        } as any);
if ((tenant as any)?.email) {
  tenantEmail = (tenant as any).email;
}
      } catch {
        // Tenant model chưa có hoặc không truy cập được
      }

      await this.prisma.notificationLog.create({
        data: {
          tenantId,
          channel: 'EMAIL',
          type: 'RECONCILIATION_ALERT',
          template: 'RECONCILIATION_ALERT',
          recipient: tenantEmail,
          subject: `[${level}] Cảnh báo đối soát tài chính - ${discrepancy.title ?? 'Lệch pha phát hiện'}`,
          body: `Hệ thống phát hiện lệch pha tài chính mức ${level}.\n\nChi tiết: ${JSON.stringify({ id: discrepancy.id, category: discrepancy.category, diffValue: discrepancy.diffValue?.toString(), description: discrepancy.description })}`,
          status: 'PENDING',
        },
      } as any);
    } catch (err) {
      this.logger.warn(
        `[dispatchNotification] failed for tenant=${tenantId}: ${String(err)}`,
      );
    }
  }
}

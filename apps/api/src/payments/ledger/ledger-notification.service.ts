// ============================================================
// ledger-notification.service.ts — Low Balance Alert Service
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: Service cảnh báo số dư thấp cho internal wallet ledger.
//   - handleThresholdCheck(): hook fire-and-forget sau debit thành công
//   - checkThrottle(): đối chiếu DB-only chặn spam (1 alert / 24h / tenant)
//   - dispatchLowBalanceAlert(): ghi NotificationLog (PENDING, EMAIL)
//
// Thiết kế: ghi NotificationLog ở mức PENDING, để InvoiceOutboxProcessor
// (hoặc poller riêng) gửi email thực tế — giữ luồng debit atomic.
// Tham chiếu: docs/roadmap/WALLET-QUOTA-NOTIFICATION-DESIGN.md
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { LEDGER_CONFIG } from './ledger.config';
import { DebitInput } from './ledger.types';
import {
  LEDGER_ALERT_TYPE,
  ThresholdCheckResult,
  ThrottleResult,
  LowBalanceContext,
  DispatchResult,
} from './ledger-notification.types';

@Injectable()
export class LedgerNotificationService {
  private readonly logger = new Logger(LedgerNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ================================================================
  // HÀM 1 — handleThresholdCheck (hook fire-and-forget)
  // ================================================================

  /**
   * Hook bọc sau debitBalance() thành công.
   * Nếu balanceAfter < ngưỡng cảnh báo → throttle guard → dispatcher.
   *
   * Gọi dạng fire-and-forget từ LedgerService (.catch()), KHÔNG block
   * luồng debit. Mọi lỗi chỉ ghi warning log.
   */
  async handleThresholdCheck(
    tenantId: string,
    balanceAfter: bigint,
    debitInput: DebitInput,
    threshold?: bigint,
  ): Promise<ThresholdCheckResult> {
    // 0. Cho phép tắt toàn bộ hệ thống cảnh báo qua config
    if (!LEDGER_CONFIG.enableLowBalanceAlert) {
      return { alerted: false, reason: 'disabled' };
    }

    const effectiveThreshold =
      threshold ?? LEDGER_CONFIG.lowBalanceWarning;

    // 1. Trên ngưỡng → không làm gì
    if (balanceAfter >= effectiveThreshold) {
      return { alerted: false, reason: 'above_threshold' };
    }

    // 2. Dưới ngưỡng → kiểm tra throttle 24h (DB-only)
    const throttle = await this.checkThrottle(tenantId);
    if (!throttle.allowed) {
      this.logger.debug(
        `Low-balance alert throttled | tenant=${tenantId} | lastAlertAt=${throttle.lastAlertAt?.toISOString()} | nextAllowedAt=${throttle.nextAllowedAt?.toISOString()}`,
      );
      return { alerted: false, reason: 'throttled' };
    }

    // 3. Không throttle → dispatch
    const dispatch = await this.dispatchLowBalanceAlert(tenantId, {
      currentBalance: balanceAfter,
      threshold: effectiveThreshold,
      currency: LEDGER_CONFIG.baseCurrency,
      lastDebitAmount: debitInput.amount,
      lastDebitReason:
        debitInput.description ??
        `${debitInput.referenceType}:${debitInput.referenceId}`,
    });

    if (dispatch.status === 'NO_RECIPIENT') {
      return { alerted: false, reason: 'no_recipient' };
    }

    this.logger.log(
      `Low-balance alert dispatched | tenant=${tenantId} | balance=${balanceAfter} | threshold=${effectiveThreshold} | logId=${dispatch.logId}`,
    );
    return { alerted: true, reason: 'below_threshold' };
  }

  // ================================================================
  // HÀM 2 — checkThrottle (DB-only, 24h cooldown)
  // ================================================================

  /**
   * Đảm bảo mỗi tenant chỉ nhận tối đa 1 cảnh báo low-balance trong
   * cửa sổ cooldown (mặc định 24h). Query NotificationLog trực tiếp —
   * không cần Redis/cache.
   */
  async checkThrottle(
    tenantId: string,
    cooldownWindowMs?: number,
  ): Promise<ThrottleResult> {
    const windowMs =
      cooldownWindowMs ?? LEDGER_CONFIG.lowBalanceAlertCooldownMs;
    const cutoffTime = new Date(Date.now() - windowMs);

    // Tìm cảnh báo low-balance gần nhất còn trong cửa sổ cooldown.
    // metadata.alertType = 'low_balance' để chỉ tính đúng nhóm cảnh báo này.
    const recent = await this.prisma.notificationLog.findFirst({
      where: {
        tenantId,
        channel: 'EMAIL',
        status: { in: ['SENT', 'PENDING'] },
        createdAt: { gt: cutoffTime },
        metadata: {
          path: ['alertType'],
          equals: LEDGER_ALERT_TYPE.LOW_BALANCE,
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });

    const lastAlertAt = recent?.createdAt ?? null;
    const allowed = !recent;
    const nextAllowedAt = lastAlertAt
      ? new Date(lastAlertAt.getTime() + windowMs)
      : null;

    return {
      allowed,
      lastAlertAt,
      nextAllowedAt,
      cooldownWindowMs: windowMs,
    };
  }

  // ================================================================
  // HÀM 3 — dispatchLowBalanceAlert (ghi NotificationLog PENDING)
  // ================================================================

  /**
   * Tạo bản ghi NotificationLog (PENDING, channel=EMAIL) với template
   * nhắc nạp tiền. Outbox processor sẽ gửi email thực tế bất đồng bộ.
   *
   * Không ghi NotificationLog nếu tenant không có email hợp lệ → tránh
   * PENDING outbox chết vô hạn.
   */
  async dispatchLowBalanceAlert(
    tenantId: string,
    context: LowBalanceContext,
    preferredChannel: 'EMAIL' = LEDGER_CONFIG.defaultAlertChannel,
  ): Promise<DispatchResult> {
    // 1. Xác định email người nhận (OWNER/ADMIN của tenant)
    const email =
      context.tenantEmail ?? (await this.resolveTenantEmail(tenantId));

    if (!email) {
      this.logger.warn(
        `Low-balance alert skipped — không tìm thấy email tenant=${tenantId}`,
      );
      return { logId: null, channel: preferredChannel, status: 'NO_RECIPIENT' };
    }

    // 2. Dựng subject + body từ template hardcoded
    const subject = '[AIFUT] Cảnh báo: Số dư ví thấp';
    const body = this.renderLowBalanceEmail({
      tenantName: context.tenantName ?? 'Quý khách',
      currentBalance: this.formatAmount(context.currentBalance),
      threshold: this.formatAmount(context.threshold),
      currency: context.currency,
      lastDebitReason: context.lastDebitReason,
      lastDebitAmount: this.formatAmount(context.lastDebitAmount),
    });

    // 3. Ghi NotificationLog (PENDING)
    const log = await this.prisma.notificationLog.create({
      data: {
        tenantId,
        channel: preferredChannel,
        to: email,
        subject,
        renderedBody: body,
        status: 'PENDING',
        templateKey: 'ledger.low_balance_alert',
        metadata: {
          alertType: LEDGER_ALERT_TYPE.LOW_BALANCE,
          currentBalance: context.currentBalance.toString(),
          threshold: context.threshold.toString(),
          currency: context.currency,
          lastDebitAmount: context.lastDebitAmount.toString(),
          lastDebitReason: context.lastDebitReason,
          tenantName: context.tenantName ?? null,
          cooldownWindowMs: LEDGER_CONFIG.lowBalanceAlertCooldownMs,
        },
      },
      select: { id: true },
    });

    return { logId: log.id, channel: preferredChannel, status: 'PENDING' };
  }

  // ================================================================
  // PRIVATE HELPERS
  // ================================================================

  /**
   * Tìm email OWNER/ADMIN của tenant qua Membership → User.
   * Fallback: bất kỳ user nào thuộc tenant nếu không có OWNER/ADMIN.
   */
  private async resolveTenantEmail(tenantId: string): Promise<string | null> {
    // Ưu tiên OWNER/ADMIN
    const membership = await this.prisma.membership.findFirst({
      where: {
        tenantId,
        role: { in: ['OWNER', 'ADMIN'] },
        user: { email: { not: '' } },
      },
      orderBy: { createdAt: 'asc' },
      select: { user: { select: { email: true } } },
    });
    if (membership?.user?.email) {
      return membership.user.email;
    }

    // Fallback: user bất kỳ thuộc tenant
    const anyUser = await this.prisma.user.findFirst({
      where: { tenantId, email: { not: '' } },
      orderBy: { createdAt: 'asc' },
      select: { email: true },
    });
    return anyUser?.email ?? null;
  }

  /** Định dạng số tiền BigInt → chuỗi có ngăn cách hàng nghìn */
  private formatAmount(amount: bigint): string {
    const s = amount.toString();
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /** Template HTML hardcoded cho email cảnh báo số dư thấp */
  private renderLowBalanceEmail(vars: {
    tenantName: string;
    currentBalance: string;
    threshold: string;
    currency: string;
    lastDebitReason: string;
    lastDebitAmount: string;
  }): string {
    return [
      '<h2>[AIFUT] Cảnh báo: Số dư ví thấp</h2>',
      `<p>Xin chào <strong>${vars.tenantName}</strong>,</p>`,
      `<p>Số dư ví AIFUT của bạn hiện còn <strong>${vars.currentBalance} ${vars.currency}</strong>, ` +
        `dưới ngưỡng cảnh báo <strong>${vars.threshold} ${vars.currency}</strong>.</p>`,
      `<p>Giao dịch gần nhất: ${vars.lastDebitReason} (${vars.lastDebitAmount} ${vars.currency})</p>`,
      '<p>Để tránh gián đoạn dịch vụ, vui lòng ' +
        '<a href="https://app.aifut.dev/billing/wallet">nạp thêm tiền</a>.</p>',
      '<hr>',
      '<small>Email này được gửi tự động bởi hệ thống AIFUT. Tối đa 1 cảnh báo mỗi 24 giờ.</small>',
    ].join('\n');
  }
}

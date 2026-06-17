// ============================================================
// ledger-notification.types.ts — Low Balance Alert Types
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: Định nghĩa types, interfaces, constants cho phân hệ
// cảnh báo số dư thấp (low-balance) của internal wallet ledger.
// Tham chiếu thiết kế: docs/roadmap/WALLET-QUOTA-NOTIFICATION-DESIGN.md
// ============================================================

/**
 * Loại cảnh báo ghi vào NotificationLog.metadata.alertType.
 * Dùng để throttle guard truy vấn đúng nhóm cảnh báo.
 */
export const LEDGER_ALERT_TYPE = {
  LOW_BALANCE: 'low_balance',
  CRITICAL_BALANCE: 'critical_balance',
} as const;

export type LedgerAlertType =
  (typeof LEDGER_ALERT_TYPE)[keyof typeof LEDGER_ALERT_TYPE];

/**
 * Lý do hook threshold kết thúc — phục vụ logging/observability.
 */
export type ThresholdCheckReason =
  | 'below_threshold'
  | 'throttled'
  | 'above_threshold'
  | 'disabled'
  | 'no_recipient';

/**
 * Kết quả của handleThresholdCheck().
 */
export interface ThresholdCheckResult {
  alerted: boolean;
  reason?: ThresholdCheckReason;
}

/**
 * Kết quả của checkThrottle() — kiểm tra cooldown 24h (DB-only).
 */
export interface ThrottleResult {
  /** true = được phép gửi, false = đang bị throttle */
  allowed: boolean;
  /** Thời điểm gửi cảnh báo gần nhất (null nếu chưa từng gửi) */
  lastAlertAt: Date | null;
  /** Thời điểm sớm nhất được gửi cảnh báo tiếp theo */
  nextAllowedAt: Date | null;
  /** Cửa sổ cooldown thực tế áp dụng (ms) */
  cooldownWindowMs: number;
}

/**
 * Ngữ cảnh dùng để dựng nội dung email cảnh báo số dư thấp.
 */
export interface LowBalanceContext {
  /** Số dư hiện tại sau debit (BigInt, đơn vị nhỏ nhất) */
  currentBalance: bigint;
  /** Ngưỡng cảnh báo đã kích hoạt */
  threshold: bigint;
  /** Mã tiền tệ — mặc định 'VND' */
  currency: string;
  /** Số tiền của debit vừa thực hiện */
  lastDebitAmount: bigint;
  /** Mô tả/lý do của debit vừa thực hiện */
  lastDebitReason: string;
  /** Email tenant (nếu đã biết, bỏ qua lookup) */
  tenantEmail?: string;
  /** Tên tenant để hiển thị trong email */
  tenantName?: string;
}

/**
 * Trạng thái kết quả của dispatchLowBalanceAlert().
 */
export type DispatchStatus = 'PENDING' | 'ALREADY_SENT' | 'NO_RECIPIENT';

/**
 * Kết quả của dispatchLowBalanceAlert().
 */
export interface DispatchResult {
  /** Id của NotificationLog vừa ghi (null nếu không ghi) */
  logId: string | null;
  /** Kênh gửi (EMAIL mặc định) */
  channel: string;
  /** Trạng thái dispatch */
  status: DispatchStatus;
}

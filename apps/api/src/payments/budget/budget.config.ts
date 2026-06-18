// ============================================================
// payments/budget/budget.config.ts
// Constants & fallback defaults cho Anti-Drain Budget Caps.
//
// Tất cả giá trị đều có fallback an toàn để Guard/Service không
// bị crash nếu thiếu config. Mặc định dùng VND.
//
// Phase 4 — Cost-based AI budget enforcement.
// ============================================================

/**
 * Default budget limit (VND) khi tenant chưa cấu hình.
 * = 500,000 VND/day — an toàn cho first-run, tránh drain.
 * Dùng BigInt literal (n) để khớp Prisma BigInt.
 */
export const DEFAULT_BUDGET_LIMIT = 500_000n;

/**
 * Default alert threshold (0.0 – 1.0).
 * Mặc định 80% — cảnh báo khi đã dùng 80% hạn mức.
 */
export const DEFAULT_ALERT_THRESHOLD = 0.8;

/**
 * Default currency.
 */
export const DEFAULT_CURRENCY = 'VND';

/**
 * Default period. Mặc định DAILY để kiểm soát chặt.
 */
export const DEFAULT_PERIOD = 'DAILY' as const;

/**
 * Cooldown giữa các lần gửi alert (ms).
 * Tránh spam notification khi mỗi request đều trigger alert.
 * Mặc định: 30 phút.
 */
export const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Max retry for Optimistic Lock conflict trong accumulator.
 */
export const ACCUMULATOR_MAX_RETRY = 5;

/**
 * Budget HTTP error code (dùng làm message body).
 */
export const BUDGET_LIMIT_EXCEEDED = 'BUDGET_LIMIT_EXCEEDED';

/**
 * Guard error message mặc định khi budget chạm mức SOFT_LOCKED.
 */
export const SOFT_LOCK_MESSAGE =
  'Hạn mức AI budget gần đầy. Chỉ request ưu tiên được phép.';

/**
 * Guard error message khi budget chạm mức HARD_LOCKED.
 */
export const HARD_LOCK_MESSAGE =
  'Hạn mức AI budget đã đầy. Vui lòng nâng cấp hoặc đợi reset.';

/**
 * Cron schedule constants.
 */
export const BUDGET_CRON = {
  /** Mỗi 5 phút check period hết hạn để reset */
  RESET_CHECK_INTERVAL: '*/5 * * * *',
  /** 23:55 mỗi ngày — daily maintenance snapshot */
  MAINTENANCE_TIME: '55 23 * * *',
} as const;

/**
 * Mặc định period event window cho các lần build (ngày đơn).
 */
export const DEFAULT_PERIOD_WINDOW_HOURS: Record<string, number> = {
  DAILY: 24,
  WEEKLY: 168,   // 7 * 24
  MONTHLY: 720,  // 30 * 24
} as const;

export type BudgetConfig = typeof import('./budget.config');

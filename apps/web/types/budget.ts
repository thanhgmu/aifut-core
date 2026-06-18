// ============================================================
// types/budget.ts
// UI-facing type definitions cho Hệ thống Hạn mức Chi phí AI
// (Anti-Drain Budget Caps subsystem).
//
// Đồng bộ 1-1 với backend BudgetLimitResponse / BudgetCheckResult
// (apps/api/src/payments/budget/budget.types.ts).
//
// Các interface dưới đây là view-model cho presentation layer
// components/billing/budget-*.tsx và page entry.
// ============================================================

// ─────────────────────────────────────────────────────────────
// ENUMS (đồng bộ backend — string literal để dùng an toàn)
// ─────────────────────────────────────────────────────────────

/** Chu kỳ hạn mức */
export type BudgetPeriod = "DAILY" | "WEEKLY" | "MONTHLY";

export const BUDGET_PERIODS: readonly BudgetPeriod[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
] as const;

export const BUDGET_PERIOD_LABELS: Record<BudgetPeriod, string> = {
  DAILY: "Hàng ngày",
  WEEKLY: "Hàng tuần",
  MONTHLY: "Hàng tháng",
};

/** Trạng thái hạn mức — state machine 3 trạng thái */
export type BudgetStatus = "ACTIVE" | "SOFT_LOCKED" | "HARD_LOCKED";

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  ACTIVE: "Đang hoạt động",
  SOFT_LOCKED: "Cảnh báo — sắp đạt hạn mức",
  HARD_LOCKED: "Đã khoá — vượt hạn mức",
};

export const BUDGET_STATUS_COLORS: Record<BudgetStatus, string> = {
  ACTIVE: "#80e0a0",
  SOFT_LOCKED: "#ffb366",
  HARD_LOCKED: "#ff6b6b",
};

// ─────────────────────────────────────────────────────────────
// VIEW-MODEL — BudgetLimit (một hạn mức cho 1 period)
// ─────────────────────────────────────────────────────────────

/** Budget limit response từ backend (JSON-safe, BigInt→string) */
export interface BudgetLimit {
  id: string;
  tenantId: string;

  /** BigInt dạng string (vd "5000000") */
  maxCostAmount: string;
  /** Hiển thị thân thiện (vd "5.000.000₫") */
  maxCostAmountDisplay: string;
  currency: string;
  period: BudgetPeriod;

  /** Đã tiêu (BigInt string) */
  currentCostSpent: string;
  /** Hiển thị thân thiện */
  currentCostSpentDisplay: string;
  /** 0.0 – 100.0 */
  usagePercent: number;

  status: BudgetStatus;
  alertThreshold: number;

  periodStart: string;
  periodEnd: string;
  lastResetAt: string | null;
  softLockedAt: string | null;
  hardLockedAt: string | null;
  lastAlertSentAt: string | null;

  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// VIEW-MODEL — BudgetHealth (tổng hợp cho health check)
// ─────────────────────────────────────────────────────────────

/** Budget health check response (GET /limits/health) */
export interface BudgetHealth {
  tenantId: string;
  allowed: boolean;
  status: BudgetStatus;
  currentCostSpent: string;
  maxCostAmount: string;
  usagePercent: number;
  blockReason: string | null;
  blockedByPeriods: BlockedPeriodInfo[];
}

export interface BlockedPeriodInfo {
  period: BudgetPeriod;
  status: BudgetStatus;
  currentCostSpent: string;
  maxCostAmount: string;
}

// ─────────────────────────────────────────────────────────────
// ACTIVITY LOG — ghi nhận lịch sử thay đổi budget
// ─────────────────────────────────────────────────────────────

/** Một mục trong lịch sử hoạt động hạn mức */
export interface BudgetActivityLog {
  id: string;
  tenantId: string;
  period: BudgetPeriod;
  action: BudgetLogAction;
  previousStatus: BudgetStatus | null;
  newStatus: BudgetStatus | null;
  previousAmount: string | null;
  newAmount: string | null;
  note: string | null;
  performedBy: string;
  createdAt: string;
}

export type BudgetLogAction =
  | "LIMIT_CREATED"
  | "LIMIT_UPDATED"
  | "LIMIT_RESET"
  | "STATUS_CHANGED"
  | "ALERT_SENT"
  | "EMERGENCY_UNLOCK"
  | "ADMIN_OVERRIDE";

// ─────────────────────────────────────────────────────────────
// FORM INPUT TYPES
// ─────────────────────────────────────────────────────────────

/** Payload form cấu hình budget limit (gửi xuống backend) */
export interface BudgetLimitFormData {
  /** Số tiền tối đa — string BigInt-safe */
  maxCostAmount: string;
  period: BudgetPeriod;
  /** 0.0 – 1.0, mặc định 0.8 */
  alertThreshold: number;
  currency?: string;
}

// ─────────────────────────────────────────────────────────────
// AGGREGATED STATE — cho dashboard tổng hợp
// ─────────────────────────────────────────────────────────────

/** Trạng thái tổng hợp của toàn bộ budget dashboard */
export interface BudgetDashboardState {
  /** Tất cả limit theo từng period */
  limits: BudgetLimit[];
  /** Health check tổng thể */
  health: BudgetHealth | null;
  /** Loading / error tracking */
  loading: boolean;
  error: string | null;
}

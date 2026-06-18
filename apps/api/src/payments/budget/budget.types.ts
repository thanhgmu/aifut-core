// ============================================================
// payments/budget/budget.types.ts
// Domain types cho Anti-Drain Budget Caps subsystem (Phase 4).
//
// Cost-based AI budget enforcement theo period DAILY/WEEKLY/MONTHLY (VND, bigint).
// Chạy song song với AiBudgetPolicy (token-based). State machine 3 trạng thái:
//   ACTIVE → SOFT_LOCKED (vượt alertThreshold) → HARD_LOCKED (chạm maxCostAmount).
//
// LƯU Ý: Các enum dưới đây ĐỒNG BỘ 1-1 với enum Prisma (BudgetPeriod / BudgetStatus).
//        Mọi giá trị string PHẢI khớp với schema.prisma để cast an toàn.
// ============================================================

// ─────────────────────────────────────────────────────────────
// ENUMS (mirror của Prisma enum)
// ─────────────────────────────────────────────────────────────

export enum BudgetPeriod {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export enum BudgetStatus {
  /** Còn hạn mức — mọi request AI được phép */
  ACTIVE = 'ACTIVE',
  /** Vượt alertThreshold — chặn AI request mới không ưu tiên, vẫn cho đọc/analytics */
  SOFT_LOCKED = 'SOFT_LOCKED',
  /** Chạm maxCostAmount — chặn HOÀN TOÀN mọi request AI */
  HARD_LOCKED = 'HARD_LOCKED',
}

/** Tập các trạng thái coi là "đang khoá" (block ở mức nào đó) */
export const LOCKED_STATUSES: readonly BudgetStatus[] = [
  BudgetStatus.SOFT_LOCKED,
  BudgetStatus.HARD_LOCKED,
] as const;

// ─────────────────────────────────────────────────────────────
// INPUT TYPES — tạo / cập nhật hạn mức
// ─────────────────────────────────────────────────────────────

/**
 * Input để TẠO MỚI một hạn mức budget cho tenant theo 1 period.
 * Dùng cho service-layer (đã parse BigInt từ controller).
 */
export interface BudgetLimitInput {
  tenantId: string;
  /** Số tiền tối đa (VND, bigint) */
  maxCostAmount: bigint;
  /** Mặc định 'VND' */
  currency?: string;
  period: BudgetPeriod;
  /** 0.0 – 1.0, mặc định 0.8 (80%) */
  alertThreshold?: number;
}

/**
 * Payload để CẬP NHẬT một hạn mức đã tồn tại (partial).
 * tenantId + period dùng làm khoá định danh (@@unique([tenantId, period])).
 * Các field còn lại là tuỳ chọn — chỉ update field nào được cung cấp.
 */
export interface BudgetLimitUpdatePayload {
  tenantId: string;
  period: BudgetPeriod;
  maxCostAmount?: bigint;
  currency?: string;
  alertThreshold?: number;
  /**
   * Cho phép admin chủ động ép trạng thái (vd: unlock thủ công về ACTIVE).
   * Nếu bỏ trống, status sẽ được re-evaluate tự động theo currentCostSpent.
   */
  forceStatus?: BudgetStatus;
}

/** Request body thô từ REST controller (BigInt-safe: maxCostAmount là string) */
export interface UpsertBudgetLimitRequestBody {
  /** BigInt-safe: nhận string, parse trong controller */
  maxCostAmount: string;
  currency?: string;
  period: BudgetPeriod;
  /** 0.0 – 1.0 */
  alertThreshold?: number;
}

// ─────────────────────────────────────────────────────────────
// RESPONSE / VIEW TYPES — trả về cho API
// ─────────────────────────────────────────────────────────────

/**
 * View an toàn JSON cho 1 budget limit (BigInt → string).
 * Trả về qua REST API GET/POST /budget-limits.
 */
export interface BudgetLimitResponse {
  id: string;
  tenantId: string;

  /** string representation của BigInt (vd "5000000") */
  maxCostAmount: string;
  /** Hiển thị thân thiện (vd "5.000.000₫") */
  maxCostAmountDisplay: string;
  currency: string;
  period: BudgetPeriod;

  currentCostSpent: string;
  currentCostSpentDisplay: string;
  /** 0.0 – 100.0 */
  usagePercent: number;

  status: BudgetStatus;
  alertThreshold: number;

  periodStart: string; // ISO-8601
  periodEnd: string; // ISO-8601
  lastResetAt: string | null;
  softLockedAt: string | null;
  hardLockedAt: string | null;
  lastAlertSentAt: string | null;

  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// BUDGET CHECK — dùng bởi Guard & dashboard usage
// ─────────────────────────────────────────────────────────────

/** Tóm tắt 1 period bị block (cho chi tiết lỗi 403) */
export interface BlockedPeriodInfo {
  period: BudgetPeriod;
  status: BudgetStatus;
  currentCostSpent: bigint;
  maxCostAmount: bigint;
}

/** Kết quả kiểm tra budget TRƯỚC request AI (BudgetGuard) */
export interface BudgetCheckResult {
  allowed: boolean;
  /** Trạng thái nghiêm trọng nhất trong tất cả period */
  status: BudgetStatus;
  currentCostSpent: bigint;
  maxCostAmount: bigint;
  /** 0.0 – 100.0 */
  usagePercent: number;
  blockReason: string | null;
  blockedByPeriods: BlockedPeriodInfo[];
}

// ─────────────────────────────────────────────────────────────
// COST ACCUMULATOR — ghi nhận chi phí sau AI call
// ─────────────────────────────────────────────────────────────

/** Payload cho accumulator — ghi nhận cost sau AI call thành công */
export interface CostAccumulateInput {
  tenantId: string;
  /** VND, số tiền thực tế đã tiêu */
  cost: bigint;
  /** reference ID để đảm bảo idempotency */
  requestId: string;
  modelKey?: string;
  description?: string;
}

/** Một lần chuyển trạng thái trong state machine */
export interface BudgetStateTransition {
  period: BudgetPeriod;
  from: BudgetStatus;
  to: BudgetStatus;
  reason?: string;
}

/** Trạng thái rút gọn của 1 period sau khi accumulate */
export interface PeriodStatusSnapshot {
  period: BudgetPeriod;
  status: BudgetStatus;
}

/** Kết quả của accumulator (sau khi cập nhật + state transition) */
export interface CostAccumulateResult {
  success: boolean;
  tenantId: string;
  previousSpent: bigint;
  currentSpent: bigint;
  statusBefore: BudgetStatus;
  statusAfter: BudgetStatus;
  /** Danh sách alert message đã được kích hoạt */
  alertsTriggered: string[];
  /** Các transition đã xảy ra trong lần accumulate này */
  transitions: BudgetStateTransition[];
  /** Trạng thái cuối của từng period */
  periods: PeriodStatusSnapshot[];
}

// ─────────────────────────────────────────────────────────────
// STATE MACHINE SUPPORT
// ─────────────────────────────────────────────────────────────

/** Tham số đánh giá / chuyển trạng thái cho 1 period */
export interface StatusEvaluationInput {
  currentCostSpent: bigint;
  maxCostAmount: bigint;
  alertThreshold: number;
  currentStatus: BudgetStatus;
}

/** Kết quả đánh giá trạng thái (chưa ghi DB) */
export interface StatusEvaluationResult {
  nextStatus: BudgetStatus;
  changed: boolean;
  /** 0.0 – 100.0 */
  usagePercent: number;
  /** true nếu vừa lần đầu vượt alertThreshold */
  crossedAlertThreshold: boolean;
}

// ─────────────────────────────────────────────────────────────
// SCHEDULER — reset period
// ─────────────────────────────────────────────────────────────

/** Mốc thời gian period mới sau khi reset */
export interface PeriodWindow {
  periodStart: Date;
  periodEnd: Date;
}

/** Kết quả tổng hợp 1 lần chạy cron reset */
export interface PeriodResetSummary {
  resetCount: number;
  hardLockedResetCount: number;
}

// ================================================================
// types/subscription.ts — UI-facing types cho Subscription UI
// ================================================================
// Presentation-layer shapes, ánh xạ từ backend DTOs qua
// lib/subscription.ts helpers. Kế thừa naming conventions từ billing.ts.
// ================================================================

/** Plan key mapping — đồng bộ với backend PLAN_DEFINITIONS */
export type PlanKey = 'free' | 'starter' | 'pro' | 'enterprise';

/** Billing cycle */
export type BillingCycle = 'monthly' | 'yearly';

/** Trạng thái subscription */
export type SubscriptionStatusUI =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'changed'
  | 'none';

// ─────────────────────────────────────────────────────────────
// KHU VỰC 3: Current Subscription Widget types
// ─────────────────────────────────────────────────────────────

/** Thông tin gói cước hiện tại — nạp từ GET /billing/subscription/current */
export interface CurrentSubscriptionInfo {
  subscriptionId: string;
  planKey: PlanKey;
  planName: string;
  status: SubscriptionStatusUI;
  startedAt: string | null;
  expiresAt: string | null;
  trialEndsAt: string | null;
  autoRenew: boolean;
  billingCycle: BillingCycle;
  daysRemaining: number;
}

/** Thống kê sử dụng tài nguyên cho gói hiện tại */
export interface CurrentUsageStats {
  aiCallsUsed: number;
  aiCallsLimit: number;
  aiCallsPercent: number;
  storageUsedGB: number;
  storageLimitGB: number;
  storagePercent: number;
  activeWorkflows: number;
  workflowLimit: number;
  workflowPercent: number;
}

/** Kết quả trả về từ GET /billing/subscription/current */
export interface SubscriptionCurrentResponse {
  subscription: CurrentSubscriptionInfo;
  usage: CurrentUsageStats;
  planDefinition: SubscriptionPlanView | null;
}

// ─────────────────────────────────────────────────────────────
// KHU VỰC 1: Pricing Comparison Matrix types
// ─────────────────────────────────────────────────────────────

/** Một hạn mức tài nguyên hiển thị trong bảng so sánh */
export interface ResourceLimitDisplay {
  key: string;
  label: string;
  icon: string;
  displayValue: string;
  rawValue: number;
  unlimited: boolean;
}

/** Một gói cước trong pricing matrix */
export interface PlanColumnView {
  key: PlanKey;
  name: string;
  nameEn: string;
  description: string;
  tag: string | null;
  sortOrder: number;

  monthlyPrice: number;
  monthlyPriceDisplay: string;
  yearlyPrice: number;
  yearlyPriceDisplay: string;
  yearlyDiscountPercent: number;
  trialDays: number;

  limits: ResourceLimitDisplay[];
  features: { key: string; value: boolean }[];

  isCurrent: boolean;
  highlighted: boolean;
  ctaType: 'current' | 'upgrade' | 'downgrade' | 'contact' | 'trial';
  ctaLabel: string;
}

/** Kết quả trả về từ GET /billing/subscription/plans */
export interface SubscriptionPlansResponse {
  plans: PlanColumnView[];
  currentPlanKey: PlanKey | null;
}

/** Plan definition đầy đủ dùng cho hiển thị */
export interface SubscriptionPlanView {
  key: PlanKey;
  name: string;
  description: string;
  monthlyPrice: number;
  monthlyPriceDisplay: string;
  yearlyPrice: number;
  yearlyPriceDisplay: string;
  trialDays: number;
  limits: ResourceLimitDisplay[];
  features: Record<string, boolean>;
}

// ─────────────────────────────────────────────────────────────
// KHU VỰC 2: Upgrade Preview Modal types
// ─────────────────────────────────────────────────────────────

/** Chi tiết proration */
export interface ProrationPreviewView {
  oldPlanKey: PlanKey;
  newPlanKey: PlanKey;
  oldPlanName: string;
  newPlanName: string;
  oldPlanRemainingDays: number;
  oldPlanTotalDays: number;
  oldPlanRemainingValue: number;
  oldPlanRemainingDisplay: string;
  newPlanTotalPrice: number;
  newPlanTotalDisplay: string;
  newPlanProratedPrice: number;
  newPlanProratedDisplay: string;
  direction: 'upgrade' | 'downgrade' | 'crossgrade' | 'same';
  chargeAmount: number;
  chargeDisplay: string;
  creditAmount: number;
  creditDisplay: string;
  effectiveFromDisplay: string;
  newExpiresAtDisplay: string;
  walletBalanceDisplay: string;
  sufficientBalance: boolean;
  shortfallAmount: number;
  shortfallDisplay: string;
}

/** Payload gửi lên GET /billing/subscription/prorate */
export interface ProrationPreviewPayload {
  currentSubscriptionId: string;
  targetPlanKey: PlanKey;
  targetCycle: BillingCycle;
  immediate: boolean;
}

/** Pha của modal */
export type UpgradeModalPhase =
  | 'closed'
  | 'selecting_plan'
  | 'preview_loading'
  | 'preview_ready'
  | 'preview_error'
  | 'confirming'
  | 'success'
  | 'error';

/** Dữ liệu result sau upgrade */
export interface UpgradeResult {
  success: boolean;
  message: string;
  invoiceId?: string;
  ledgerTransactionId?: string;
  newExpiresAt?: string;
}

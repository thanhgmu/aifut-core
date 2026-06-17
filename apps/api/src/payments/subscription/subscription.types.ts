// ================================================================
// subscription.types.ts — Subscription Service Types / DTOs
// ================================================================
// Module: apps/api/src/payments/subscription
// Interface cho luồng nâng cấp / hạ cấp / hủy gói cước + proration.
// ================================================================

import { PlanKey, BillingCycle } from './plan.config';

/**
 * Đầu vào cho upgradeSubscriptionPlan().
 * Hỗ trợ cả upgrade, downgrade và crossgrade — service tự xác định
 * hướng dựa trên comparePlanKeys(current, target).
 */
export interface UpgradeSubscriptionInput {
  tenantId: string;
  currentSubscriptionId: string;
  targetPlanKey: PlanKey;
  targetCycle: BillingCycle; // monthly | yearly
  immediate: boolean; // true = áp dụng ngay, false = lên lịch chu kỳ kế tiếp
}

/**
 * Chi tiết tính toán prorated pricing — phần này được trả về trong
 * UpgradeResult và cũng là kết quả thuần của calculateProratedPricing().
 */
export interface ProrationDetail {
  oldPlanRemainingDays: number; // số ngày còn lại của gói cũ
  oldPlanTotalDays: number; // tổng số ngày của chu kỳ hiện tại
  oldPlanRemainingValue: number; // giá trị tiền còn lại của gói cũ (VND)
  newPlanTotalPrice: number; // giá đầy đủ của gói mới (VND)
  newPlanProratedPrice: number; // giá gói mới cho số ngày còn lại (VND)

  isUpgrade: boolean;
  chargeAmount: number; // số tiền cần thu thêm (VND, 0 nếu credit đủ bù)
  creditAmount: number; // số tiền hoàn lại (VND, downgrade)

  effectiveFrom: Date; // thời điểm gói mới có hiệu lực
  newExpiresAt: Date; // hạn mới của subscription
}

/**
 * Đầu vào thuần của bộ tính prorated pricing (pure function, testable).
 */
export interface ProratedPricingInput {
  oldPlanKey: PlanKey;
  newPlanKey: PlanKey;
  oldCycle: BillingCycle;
  newCycle: BillingCycle;
  currentPeriodStart: Date; // thời điểm gói hiện tại bắt đầu / gia hạn gần nhất
  currentPeriodEnd: Date; // hạn hiện tại
  upgradeTime: Date; // thời điểm thực hiện (now)
}

/**
 * Kết quả trả về của upgradeSubscriptionPlan().
 */
export interface UpgradeResult {
  success: boolean;
  oldPlanKey: string;
  newPlanKey: string;

  // Proration details
  proration: ProrationDetail;

  // Transaction references
  ledgerTransactionId?: string;
  invoiceId?: string;

  // Bản ghi Subscription mới (đã cập nhật)
  subscription: SubscriptionRecord;
}

/**
 * Kết quả hủy subscription kèm hoàn tiền theo tỷ lệ ngày còn lại.
 */
export interface CancelResult {
  cancelled: boolean;
  subscriptionId: string;
  refundAmount: number; // VND đã hoàn vào ví
  ledgerTransactionId?: string;
}

/**
 * Bản ghi Subscription tối giản dùng trong response (khớp schema Prisma).
 * Không phụ thuộc trực tiếp vào generated Prisma type để tránh coupling.
 */
export interface SubscriptionRecord {
  id: string;
  accountId: string;
  planKey: string;
  tenantId: string;
  status: string;
  startedAt: Date | null;
  expiresAt: Date | null;
  autoRenew: boolean;
  trialEndsAt?: Date | null;
  cancelledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Trạng thái subscription dùng nội bộ */
export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  TRIALING: 'trialing',
  PAST_DUE: 'past_due',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  CHANGED: 'changed', // đã chuyển sang gói khác (upgrade/downgrade)
} as const;

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

/** referenceType dùng cho LedgerTransaction phát sinh từ subscription */
export const SUBSCRIPTION_LEDGER_REF = {
  UPGRADE: 'plan_upgrade',
  DOWNGRADE: 'plan_downgrade',
  CANCEL_REFUND: 'subscription_cancel_refund',
} as const;

// ================================================================
// plan.config.ts — Plan Configuration Constants
// ================================================================
// Module: apps/api/src/payments/subscription
// File DUY NHẤT định nghĩa gói cước. Mọi module khác (billing service,
// plan guard, frontend pricing page) đều đọc từ đây.
//   - 4 gói cước typed: free / starter / pro / enterprise
//   - Resource limits (-1 = unlimited)
//   - Pricing theo billing cycle (monthly / yearly), giá gốc VND
//   - Feature flags
//   - Over-limit policy (block / warn / billable) cho từng resource
// ================================================================

export type PlanKey = 'free' | 'starter' | 'pro' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

/** Resource limit definitions (-1 = unlimited) */
export interface PlanLimits {
  maxUsers: number; // -1 = unlimited
  maxWorkspaces: number; // workspaces per tenant
  maxWorkflows: number; // active workflow templates
  maxWorkflowNodes: number; // max nodes per workflow
  maxConnectors: number; // active integration connections
  maxNotifications: number; // notifications per month
  aiCallsMonthly: number; // AI API calls per month
  storageGB: number; // storage limit in GB
  bandwidthGB: number; // monthly bandwidth in GB
  apiRateLimit: number; // requests/minute
}

/** Feature flags */
export interface PlanFeatures {
  localMode: boolean; // can run locally
  cloudBackup: boolean; // automatic cloud backup
  multiDevice: boolean; // multi-device sync
  marketplace: boolean; // access to connector/template marketplace
  apiAccess: boolean; // REST API + API keys
  analytics: boolean; // analytics dashboard
  customDomain: boolean; // custom domain support
  whiteLabel: boolean; // remove AIFUT branding
  prioritySupport: boolean; // priority support channel
  slaGuarantee: boolean; // SLA guarantee
}

/** Over-billing policy: action when tenant exceeds limit */
export type OverLimitAction =
  | 'block' // block the operation, return PLAN_LIMIT_REACHED
  | 'warn' // allow but log warning
  | 'billable'; // allow and bill per unit over limit

export interface PlanOverLimitPolicy {
  users: OverLimitAction;
  workflows: OverLimitAction;
  connectors: OverLimitAction;
  aiCalls: OverLimitAction;
  storage: OverLimitAction;
}

/** Price tier for a single billing cycle */
export interface PlanPriceTier {
  billingCycle: BillingCycle;
  priceVnd: number; // price in VND (source of truth)
  priceUsd: number; // converted at ~VND/25400
  trialDays: number; // 0 = no trial
  discountPercent: number; // relative to monthly * 12 for yearly
}

/** Complete plan definition */
export interface PlanDefinition {
  key: PlanKey;
  name: string; // Vietnamese display name
  nameEn: string; // English display name
  description: string;
  descriptionEn: string;
  tag?: string; // "Phổ biến", "Best Value", etc.
  sortOrder: number; // display order
  isActive: boolean;

  // Pricing
  prices: PlanPriceTier[];

  // Limits
  limits: PlanLimits;

  // Features
  features: PlanFeatures;

  // Over-limit policy
  overLimitPolicy: PlanOverLimitPolicy;
}

// ================================================================
// PLAN_DEFINITIONS — The single source of truth
// ================================================================

export const PLAN_DEFINITIONS: Record<PlanKey, PlanDefinition> = {
  free: {
    key: 'free',
    name: 'Miễn phí',
    nameEn: 'Free',
    description: 'Dùng thử miễn phí với các tính năng cơ bản',
    descriptionEn: 'Try free with basic features',
    tag: '',
    sortOrder: 0,
    isActive: true,
    prices: [
      { billingCycle: 'monthly', priceVnd: 0, priceUsd: 0, trialDays: 0, discountPercent: 0 },
    ],
    limits: {
      maxUsers: 1,
      maxWorkspaces: 1,
      maxWorkflows: 3,
      maxWorkflowNodes: 10,
      maxConnectors: 2,
      maxNotifications: 100,
      aiCallsMonthly: 500,
      storageGB: 1,
      bandwidthGB: 1,
      apiRateLimit: 10,
    },
    features: {
      localMode: true,
      cloudBackup: false,
      multiDevice: false,
      marketplace: false,
      apiAccess: false,
      analytics: false,
      customDomain: false,
      whiteLabel: false,
      prioritySupport: false,
      slaGuarantee: false,
    },
    overLimitPolicy: {
      users: 'block',
      workflows: 'block',
      connectors: 'block',
      aiCalls: 'block',
      storage: 'block',
    },
  },

  starter: {
    key: 'starter',
    name: 'Cơ bản',
    nameEn: 'Starter',
    description: 'Cho cá nhân và cửa hàng nhỏ',
    descriptionEn: 'For individuals and small shops',
    tag: '',
    sortOrder: 1,
    isActive: true,
    prices: [
      { billingCycle: 'monthly', priceVnd: 99000, priceUsd: 3.9, trialDays: 7, discountPercent: 0 },
      { billingCycle: 'yearly', priceVnd: 990000, priceUsd: 39, trialDays: 14, discountPercent: 17 },
    ],
    limits: {
      maxUsers: 1,
      maxWorkspaces: 1,
      maxWorkflows: 10,
      maxWorkflowNodes: 20,
      maxConnectors: 5,
      maxNotifications: 1000,
      aiCallsMonthly: 1000,
      storageGB: 5,
      bandwidthGB: 10,
      apiRateLimit: 30,
    },
    features: {
      localMode: true,
      cloudBackup: true,
      multiDevice: false,
      marketplace: false,
      apiAccess: false,
      analytics: false,
      customDomain: false,
      whiteLabel: false,
      prioritySupport: false,
      slaGuarantee: false,
    },
    overLimitPolicy: {
      users: 'warn',
      workflows: 'block',
      connectors: 'warn',
      aiCalls: 'billable',
      storage: 'warn',
    },
  },

  pro: {
    key: 'pro',
    name: 'Chuyên nghiệp',
    nameEn: 'Professional',
    description: 'Cho doanh nghiệp vừa và nhỏ',
    descriptionEn: 'For small and medium businesses',
    tag: 'Phổ biến',
    sortOrder: 2,
    isActive: true,
    prices: [
      { billingCycle: 'monthly', priceVnd: 490000, priceUsd: 19.3, trialDays: 7, discountPercent: 0 },
      { billingCycle: 'yearly', priceVnd: 4900000, priceUsd: 193, trialDays: 14, discountPercent: 17 },
    ],
    limits: {
      maxUsers: 5,
      maxWorkspaces: 3,
      maxWorkflows: -1, // unlimited
      maxWorkflowNodes: 50,
      maxConnectors: 20,
      maxNotifications: 10000,
      aiCallsMonthly: 5000,
      storageGB: 50,
      bandwidthGB: 100,
      apiRateLimit: 100,
    },
    features: {
      localMode: true,
      cloudBackup: true,
      multiDevice: true,
      marketplace: true,
      apiAccess: true,
      analytics: true,
      customDomain: false,
      whiteLabel: false,
      prioritySupport: false,
      slaGuarantee: false,
    },
    overLimitPolicy: {
      users: 'warn',
      workflows: 'warn',
      connectors: 'warn',
      aiCalls: 'billable',
      storage: 'billable',
    },
  },

  enterprise: {
    key: 'enterprise',
    name: 'Doanh nghiệp',
    nameEn: 'Enterprise',
    description: 'Cho tổ chức lớn với yêu cầu cao',
    descriptionEn: 'For large organizations with high demands',
    tag: 'Liên hệ',
    sortOrder: 3,
    isActive: true,
    prices: [
      { billingCycle: 'monthly', priceVnd: 1990000, priceUsd: 78.35, trialDays: 0, discountPercent: 0 },
      { billingCycle: 'yearly', priceVnd: 19900000, priceUsd: 783.5, trialDays: 0, discountPercent: 17 },
    ],
    limits: {
      maxUsers: -1, // unlimited
      maxWorkspaces: -1, // unlimited
      maxWorkflows: -1,
      maxWorkflowNodes: -1,
      maxConnectors: -1,
      maxNotifications: -1,
      aiCallsMonthly: 50000,
      storageGB: 500,
      bandwidthGB: 1000,
      apiRateLimit: 1000,
    },
    features: {
      localMode: true,
      cloudBackup: true,
      multiDevice: true,
      marketplace: true,
      apiAccess: true,
      analytics: true,
      customDomain: true,
      whiteLabel: true,
      prioritySupport: true,
      slaGuarantee: true,
    },
    overLimitPolicy: {
      users: 'warn',
      workflows: 'warn',
      connectors: 'warn',
      aiCalls: 'billable',
      storage: 'billable',
    },
  },
};

// ================================================================
// Helper utilities
// ================================================================

/** Lấy PlanDefinition theo key, null nếu không tồn tại */
export function getPlan(key: PlanKey | string): PlanDefinition | null {
  return PLAN_DEFINITIONS[key as PlanKey] ?? null;
}

/** Lấy tất cả plan đang active, sắp xếp theo sortOrder */
export function getActivePlans(): PlanDefinition[] {
  return Object.values(PLAN_DEFINITIONS)
    .filter((p) => p.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Kiểm tra một limit có phải "unlimited" (-1) không */
export function isUnlimited(value: number): boolean {
  return value === -1;
}

/**
 * So sánh hai plan keys.
 * @returns 'upgrade' | 'downgrade' | 'same' | 'crossgrade'
 */
export function comparePlanKeys(
  current: PlanKey,
  target: PlanKey,
): 'upgrade' | 'downgrade' | 'same' | 'crossgrade' {
  if (current === target) return 'same';
  const order: PlanKey[] = ['free', 'starter', 'pro', 'enterprise'];
  const curIdx = order.indexOf(current);
  const tgtIdx = order.indexOf(target);
  if (curIdx === -1 || tgtIdx === -1) return 'crossgrade';
  if (curIdx < tgtIdx) return 'upgrade';
  if (curIdx > tgtIdx) return 'downgrade';
  return 'crossgrade';
}

/** Lấy giá VND cho plan + billing cycle (mặc định monthly) */
export function getPlanPrice(planKey: PlanKey, cycle: BillingCycle = 'monthly'): number {
  const plan = PLAN_DEFINITIONS[planKey];
  if (!plan) return 0;
  const tier = plan.prices.find((p) => p.billingCycle === cycle);
  // Fallback về monthly nếu cycle không tồn tại cho gói này
  return tier?.priceVnd ?? plan.prices[0]?.priceVnd ?? 0;
}

/** Số tháng tương ứng với một billing cycle */
export function cycleMonths(cycle: BillingCycle): number {
  return cycle === 'yearly' ? 12 : 1;
}

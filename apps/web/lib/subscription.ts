// ================================================================
// lib/subscription.ts — Subscription API client & format helpers
// ================================================================
// Kế thừa pattern từ lib/billing.ts (API_BASE, getStoredToken,
// resolveTenantSlug, formatVND, formatBillingDate).
// ================================================================

import { API_BASE, getStoredToken } from './auth';
import { resolveTenantSlug, formatBillingDate } from './billing';
import type {
  SubscriptionCurrentResponse,
  SubscriptionPlansResponse,
  ProrationPreviewPayload,
  ProrationPreviewView,
  PlanKey,
  BillingCycle,
  PlanColumnView,
  ResourceLimitDisplay,
} from '../types/subscription';
import { planOrder } from './plan-mapper';

// ─── Format helpers ────────────────────────────────────

/** Format VND amount */
export function formatVND(amount: number): string {
  if (!Number.isFinite(amount)) return '0₫';
  const rounded = Math.round(amount);
  if (rounded >= 1_000_000_000) {
    return `${(rounded / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ₫`;
  }
  return `${rounded.toLocaleString('vi-VN')}₫`;
}

/** Format ngày tháng */
export { formatBillingDate };

/** Đếm số ngày còn lại từ hôm nay đến mốc */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

/** Map trạng thái subscription → màu status pill */
export function subscriptionStatusColor(status: string): string {
  switch (status) {
    case 'active': return '#80e0a0';
    case 'trialing': return '#ffb366';
    case 'past_due': return '#ff6b6b';
    case 'cancelled': return '#9fb0ff';
    case 'expired': return '#5a6488';
    case 'changed': return '#c8d2ff';
    default: return '#c8d2ff';
  }
}

// ─── API functions ─────────────────────────────────────

/**
 * GET /billing/subscription/current
 * Lấy subscription hiện tại + usage + plan definition
 */
export async function fetchSubscriptionCurrent(): Promise<SubscriptionCurrentResponse | null> {
  const token = getStoredToken();
  if (!token) return null;

  const tenantSlug = await resolveTenantSlug();
  if (!tenantSlug) return null;

  try {
    const res = await fetch(`${API_BASE}/billing/subscription/current`, {
      headers: {
        'x-tenant-slug': tenantSlug,
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * GET /billing/subscription/plans
 * Lấy tất cả plan definitions
 */
export async function fetchSubscriptionPlans(): Promise<SubscriptionPlansResponse | null> {
  const token = getStoredToken();

  try {
    const headers: Record<string, string> = { 'cache': 'no-store' };
    if (token) {
      const tenantSlug = await resolveTenantSlug();
      if (tenantSlug) {
        headers['x-tenant-slug'] = tenantSlug;
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const res = await fetch(`${API_BASE}/billing/subscription/plans`, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * GET /billing/subscription/prorate
 * Preview proration (pure function, không mutate)
 */
export async function fetchProrationPreview(
  payload: ProrationPreviewPayload,
): Promise<ProrationPreviewView | null> {
  const token = getStoredToken();
  if (!token) return null;

  const tenantSlug = await resolveTenantSlug();
  if (!tenantSlug) return null;

  try {
    const params = new URLSearchParams({
      subscriptionId: payload.currentSubscriptionId,
      targetPlanKey: payload.targetPlanKey,
      targetCycle: payload.targetCycle,
      immediate: String(payload.immediate),
    });

    const res = await fetch(
      `${API_BASE}/billing/subscription/prorate?${params}`,
      {
        headers: {
          'x-tenant-slug': tenantSlug,
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * POST /billing/subscription/upgrade
 * Thực hiện upgrade/downgrade
 */
export async function upgradeSubscription(payload: {
  currentSubscriptionId: string;
  targetPlanKey: string;
  targetCycle: BillingCycle;
  immediate: boolean;
}): Promise<{
  success: boolean;
  message: string;
  invoiceId?: string;
  ledgerTransactionId?: string;
  newExpiresAt?: string;
}> {
  const token = getStoredToken();
  if (!token) return { success: false, message: 'Not authenticated' };

  const tenantSlug = await resolveTenantSlug();
  if (!tenantSlug) return { success: false, message: 'No tenant found' };

  try {
    const res = await fetch(`${API_BASE}/billing/subscription/upgrade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-slug': tenantSlug,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        currentSubscriptionId: payload.currentSubscriptionId,
        targetPlanKey: payload.targetPlanKey,
        targetCycle: payload.targetCycle,
        immediate: payload.immediate,
      }),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      return {
        success: true,
        message: `Đã chuyển sang gói ${data.newPlanKey}`,
        invoiceId: data.invoiceId,
        ledgerTransactionId: data.ledgerTransactionId,
        newExpiresAt: data.proration?.newExpiresAt,
      };
    }

    return {
      success: false,
      message: data?.message ?? `Upgrade thất bại (${res.status})`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Lỗi kết nối',
    };
  }
}

/**
 * POST /billing/subscription/cancel
 * Hủy subscription kèm hoàn tiền prorated
 */
export async function cancelSubscription(subscriptionId: string): Promise<{
  success: boolean;
  message: string;
  refundAmount?: number;
  ledgerTransactionId?: string;
}> {
  const token = getStoredToken();
  if (!token) return { success: false, message: 'Not authenticated' };

  const tenantSlug = await resolveTenantSlug();
  if (!tenantSlug) return { success: false, message: 'No tenant found' };

  try {
    const res = await fetch(`${API_BASE}/billing/subscription/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-slug': tenantSlug,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subscriptionId }),
    });

    const data = await res.json();

    if (res.ok && data.cancelled) {
      return {
        success: true,
        message: `Đã hủy gói cước. Hoàn tiền: ${formatVND(data.refundAmount)}`,
        refundAmount: data.refundAmount,
        ledgerTransactionId: data.ledgerTransactionId,
      };
    }

    return {
      success: false,
      message: data?.message ?? `Hủy thất bại (${res.status})`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Lỗi kết nối',
    };
  }
}

// ─── View-model builders ───────────────────────────────

/**
 * Map backend plan data → PlanColumnView[]
 * Xây dựng cột hiển thị cho pricing comparison matrix.
 */
export function buildPlanColumns(
  plans: any[],
  currentPlanKey: string | null,
): PlanColumnView[] {
  if (!Array.isArray(plans) || plans.length === 0) return [];

  // Sort by the predefined sort order
  const sorted = [...plans].sort(
    (a, b) => planOrder(a.key) - planOrder(b.key),
  );

  return sorted.map((plan) => {
    const monthlyPrice = plan.monthlyPrice ?? plan.price ?? 0;
    const yearlyPrice = plan.yearlyPrice ?? 0;
    const yearlyDiscount = yearlyPrice > 0 && monthlyPrice > 0
      ? Math.round((1 - yearlyPrice / (monthlyPrice * 12)) * 100)
      : 0;
    const isCurrent = plan.key === currentPlanKey;

    // Build resource limits display
    const limits: ResourceLimitDisplay[] = buildLimitsFromPlan(plan);

    // Build feature flags
    const features: { key: string; value: boolean }[] = [];
    if (plan.features) {
      for (const [key, value] of Object.entries(plan.features)) {
        features.push({ key, value: Boolean(value) });
      }
    }

    // Determine CTA
    const ctaType = isCurrent
      ? 'current'
      : plan.key === 'enterprise'
        ? 'contact'
        : plan.key === 'free'
          ? 'upgrade'
          : 'upgrade';

    const ctaLabel = isCurrent
      ? 'Gói hiện tại'
      : plan.key === 'enterprise'
        ? 'Liên hệ'
        : monthlyPrice > 0
          ? 'Nâng cấp'
          : 'Chuyển sang';

    return {
      key: plan.key,
      name: plan.name ?? plan.key,
      nameEn: plan.nameEn ?? plan.key,
      description: plan.description ?? '',
      tag: plan.tag ?? null,
      sortOrder: planOrder(plan.key),
      monthlyPrice,
      monthlyPriceDisplay: monthlyPrice === 0 ? '0₫' : formatVND(monthlyPrice),
      yearlyPrice,
      yearlyPriceDisplay: yearlyPrice > 0 ? formatVND(yearlyPrice) : '',
      yearlyDiscountPercent: yearlyDiscount,
      trialDays: plan.trialDays ?? 0,
      limits,
      features,
      isCurrent,
      highlighted: plan.key === 'pro',
      ctaType,
      ctaLabel,
    };
  });
}

/** Xây dựng ResourceLimitDisplay[] từ plan backend DTO */
function buildLimitsFromPlan(plan: any): ResourceLimitDisplay[] {
  const limits: ResourceLimitDisplay[] = [];
  const LIMIT_CONFIGS = [
    { key: 'maxUsers', label: 'Thành viên', icon: '👥' },
    { key: 'maxWorkspaces', label: 'Không gian làm việc', icon: '📦' },
    { key: 'maxWorkflows', label: 'Mẫu workflow', icon: '🔧' },
    { key: 'maxConnectors', label: 'Kết nối', icon: '🔗' },
    { key: 'aiCallsMonthly', label: 'AI Calls/tháng', icon: '🤖' },
    { key: 'storageGB', label: 'Lưu trữ', icon: '💾' },
    { key: 'bandwidthGB', label: 'Băng thông', icon: '🌐' },
  ];

  for (const cfg of LIMIT_CONFIGS) {
    let rawValue = plan.limits?.[cfg.key] ?? plan[cfg.key];
    if (rawValue === undefined || rawValue === null) continue;

    const unlimited = rawValue === -1;
    let displayValue: string;

    if (unlimited) {
      displayValue = '∞';
    } else if (cfg.key === 'storageGB' || cfg.key === 'bandwidthGB') {
      displayValue = `${rawValue}GB`;
    } else if (cfg.key === 'aiCallsMonthly') {
      displayValue = rawValue >= 1000
        ? `${(rawValue / 1000).toFixed(0)}k/tháng`
        : `${rawValue}/tháng`;
    } else {
      displayValue = String(rawValue);
    }

    limits.push({
      key: cfg.key,
      label: cfg.label,
      icon: cfg.icon,
      displayValue,
      rawValue,
      unlimited,
    });
  }

  return limits;
}

import { API_BASE, getStoredToken } from "./auth";
import type {
  BillingDashboardData,
  CurrentPlanInfo,
  InvoiceRow,
  PricingTier,
  SubscriptionStatus,
  TransactionRow,
  UsageMeter,
} from "../types/billing";

export type PlanPrice = {
  amount: number;
  display: string;
};

export type Plan = {
  key: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: string;
  maxUsers: number;
  maxWorkflows: number;
  aiCallsMonthly: number;
  storageGB: number;
  features: Record<string, boolean>;
  limits: Record<string, any> | null;
  isActive: boolean;
  priceDisplay?: string;
  prices?: Record<string, PlanPrice>;
};

export type BillingSummary = {
  tenantId: string;
  planKey: string;
  planName: string;
  period: {
    monthStart: string;
    currentDate: string;
  };
  ai: {
    callsUsed: number;
    callsLimit: number;
    callsPercent: number;
    cost: number;
  };
  storage: {
    usedGB: number;
    limitGB: number;
    percentFull: number;
  };
  workflows: {
    active: number;
    limit: number;
  };
  subscription: {
    status: string;
    startedAt: string;
    expiresAt: string | null;
    trialEndsAt: string | null;
    autoRenew: boolean;
  } | null;
};

export type FeatureAccess = {
  allowed: boolean;
  reason: string | null;
  limit: number | null;
  current: number | null;
};

/**
 * Resolve the current user's tenant slug from the auth token.
 * Returns null when unauthenticated or the tenant cannot be determined.
 * Centralizes the `/auth/me` lookup so data fetchers don't repeat it.
 */
export async function resolveTenantSlug(): Promise<string | null> {
  const token = getStoredToken();
  if (!token) return null;

  const meRes = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!meRes.ok) return null;

  const me = await meRes.json();
  return me?.tenant?.slug ?? null;
}

export async function fetchPlans(currency = "VND"): Promise<Plan[]> {
  const res = await fetch(`${API_BASE}/billing/plans?currency=${currency}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchBillingSummary(): Promise<BillingSummary | null> {
  const token = getStoredToken();
  if (!token) return null;

  const tenantSlug = await resolveTenantSlug();
  if (!tenantSlug) return null;

  const res = await fetch(`${API_BASE}/billing-meter/summary`, {
    headers: {
      "x-tenant-slug": tenantSlug,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export async function checkFeatureAccess(feature: string): Promise<FeatureAccess | null> {
  const token = getStoredToken();
  if (!token) return null;

  const tenantSlug = await resolveTenantSlug();
  if (!tenantSlug) return null;

  const res = await fetch(`${API_BASE}/billing-meter/feature-access?feature=${feature}`, {
    headers: {
      "x-tenant-slug": tenantSlug,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export async function subscribeToPlan(
  planKey: string,
  trialDays = 0,
): Promise<{ success: boolean; message?: string }> {
  const token = getStoredToken();
  if (!token) return { success: false, message: "Not authenticated" };

  const tenantSlug = await resolveTenantSlug();
  if (!tenantSlug) return { success: false, message: "No tenant found" };

  try {
    const res = await fetch(`${API_BASE}/billing/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-slug": tenantSlug,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ planKey, trialDays }),
    });

    const data = await res.json();
    if (res.ok) {
      return { success: true, message: `Subscribed to ${data?.plan?.name ?? planKey}` };
    }
    return { success: false, message: data?.message ?? `Subscription failed (${res.status})` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Network error" };
  }
}

// ---------------------------------------------------------------------------
// Dashboard view-model helpers (additive — power components/billing/* shell)
// ---------------------------------------------------------------------------

/** Format a numeric VND amount with a trailing ₫ and thousands separators. */
export function formatVND(amount: number): string {
  if (!Number.isFinite(amount)) return "0₫";
  return `${Math.round(amount).toLocaleString("vi-VN")}₫`;
}

/** Format an ISO date string into a short, human-readable date. */
export function formatBillingDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Pick a meter accent color based on fill percentage (green→amber→red). */
export function meterColor(percent: number): string {
  if (percent > 80) return "#ff6b6b";
  if (percent > 60) return "#ffb366";
  return "#6d7cff";
}

/** Map an invoice/subscription status to a status pill color. */
export function statusColor(status: string): string {
  switch (status) {
    case "paid":
    case "active":
      return "#80e0a0";
    case "pending":
    case "trialing":
      return "#ffb366";
    case "failed":
    case "past_due":
    case "expired":
    case "canceled":
      return "#ff6b6b";
    case "refunded":
    case "void":
      return "#9fb0ff";
    default:
      return "#c8d2ff";
  }
}

function normalizeStatus(raw: string | null | undefined): SubscriptionStatus {
  switch (raw) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "expired":
      return raw;
    default:
      return raw ? "active" : "none";
  }
}

/** Build usage meters from a BillingSummary DTO. */
export function buildMeters(summary: BillingSummary): UsageMeter[] {
  const workflowPercent =
    summary.workflows.limit > 0
      ? Math.round((summary.workflows.active / summary.workflows.limit) * 100)
      : summary.workflows.limit < 0
        ? 0
        : 100;

  return [
    {
      key: "ai",
      label: "AI Calls",
      icon: "🤖",
      used: summary.ai.callsUsed,
      limit: summary.ai.callsLimit,
      unit: "calls",
      percent: summary.ai.callsPercent,
      cost: `$${summary.ai.cost.toFixed(4)}`,
    },
    {
      key: "storage",
      label: "Storage",
      icon: "💾",
      used: summary.storage.usedGB,
      limit: summary.storage.limitGB,
      unit: "GB",
      percent: summary.storage.percentFull,
    },
    {
      key: "workflows",
      label: "Active Workflows",
      icon: "⚡",
      used: summary.workflows.active,
      limit: summary.workflows.limit,
      unit: "workflows",
      percent: workflowPercent,
    },
  ];
}

/** Build pricing tier cards from plans + the tenant's current plan key. */
export function buildPricingTiers(plans: Plan[], currentKey: string): PricingTier[] {
  return plans
    .filter((p) => p.isActive)
    .map((plan) => {
      const aiLine =
        plan.aiCallsMonthly >= 1000
          ? `${(plan.aiCallsMonthly / 1000).toFixed(0)}K AI calls / month`
          : `${plan.aiCallsMonthly} AI calls / month`;

      return {
        key: plan.key,
        name: plan.name,
        tagline: plan.description,
        priceAmount: plan.price,
        priceDisplay: plan.price === 0 ? "Free" : `${plan.price.toLocaleString("vi-VN")}₫`,
        interval: (plan.interval as "month" | "year") ?? "month",
        highlighted: plan.key === "pro",
        current: plan.key === currentKey,
        ctaLabel: plan.key === currentKey ? "Current plan" : plan.price === 0 ? "Switch" : "Upgrade",
        features: [
          { label: aiLine, included: true },
          { label: `${plan.storageGB}GB storage`, included: plan.storageGB > 0 },
          { label: `${plan.maxWorkflows < 0 ? "Unlimited" : plan.maxWorkflows} workflows`, included: true },
          { label: `${plan.maxUsers < 0 ? "Unlimited" : plan.maxUsers} team members`, included: true },
          { label: "Cloud backup", included: Boolean(plan.features?.cloudBackup) },
          { label: "Marketplace access", included: Boolean(plan.features?.marketplace) },
          { label: "API & webhooks", included: Boolean(plan.features?.api) },
        ],
      };
    });
}

function buildCurrentPlan(summary: BillingSummary): CurrentPlanInfo {
  const sub = summary.subscription;
  return {
    key: summary.planKey,
    name: summary.planName,
    status: normalizeStatus(sub?.status),
    priceDisplay: "—",
    renewsAt: sub?.expiresAt ?? null,
    trialEndsAt: sub?.trialEndsAt ?? null,
    autoRenew: Boolean(sub?.autoRenew),
  };
}

/**
 * Compose the full dashboard view-model. Invoices/transactions are now wired to
 * the real `/billing/invoices` + `/billing/transactions` backend routes.
 */
export async function fetchBillingDashboard(): Promise<BillingDashboardData | null> {
  const [summary, plans] = await Promise.all([fetchBillingSummary(), fetchPlans()]);
  if (!summary) return null;

  const [invoices, transactions] = await Promise.all([fetchInvoices(), fetchTransactions()]);

  return {
    currentPlan: buildCurrentPlan(summary),
    meters: buildMeters(summary),
    tiers: buildPricingTiers(plans, summary.planKey),
    invoices,
    transactions,
  };
}

/** Fetch the tenant's real invoice history from the backend. */
export async function fetchInvoices(): Promise<InvoiceRow[]> {
  const token = getStoredToken();
  if (!token) return [];

  const tenantSlug = await resolveTenantSlug();
  if (!tenantSlug) return [];

  try {
    const res = await fetch(`${API_BASE}/billing/invoices`, {
      headers: {
        "x-tenant-slug": tenantSlug,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as InvoiceRow[]) : [];
  } catch {
    return [];
  }
}

/** Fetch the tenant's real payment transaction history from the backend. */
export async function fetchTransactions(): Promise<TransactionRow[]> {
  const token = getStoredToken();
  if (!token) return [];

  const tenantSlug = await resolveTenantSlug();
  if (!tenantSlug) return [];

  try {
    const res = await fetch(`${API_BASE}/billing/transactions`, {
      headers: {
        "x-tenant-slug": tenantSlug,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as TransactionRow[]) : [];
  } catch {
    return [];
  }
}

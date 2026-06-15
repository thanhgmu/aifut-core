import { API_BASE, getStoredToken } from "./auth";

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

  const meRes = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!meRes.ok) return null;

  const me = await meRes.json();
  const tenantSlug = me?.tenant?.slug;
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

  const meRes = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!meRes.ok) return null;

  const me = await meRes.json();
  const tenantSlug = me?.tenant?.slug;
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

  const meRes = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!meRes.ok) return { success: false, message: "Failed to get tenant info" };

  const me = await meRes.json();
  const tenantSlug = me?.tenant?.slug;
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

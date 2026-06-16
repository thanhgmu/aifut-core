// types/billing.ts
// Canonical UI-facing interfaces for the Billing & Subscription Dashboard.
// These are presentation-layer shapes consumed by components/billing/* and the
// app/(dashboard)/billing shell. Backend DTOs live in lib/billing.ts (Plan,
// BillingSummary, ...) and are mapped into these view-models by the helpers there.

export type BillingInterval = "month" | "year";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "expired"
  | "none";

export type InvoiceStatus = "paid" | "pending" | "failed" | "refunded" | "void";

export type TransactionKind = "charge" | "refund" | "credit" | "adjustment";

/** A single usage dimension rendered as a meter card. limit < 0 = unlimited. */
export interface UsageMeter {
  key: string;
  label: string;
  icon: string;
  used: number;
  limit: number;
  unit: string;
  /** 0..100 fill percentage (clamped for display). */
  percent: number;
  /** Optional cost annotation, already formatted (e.g. "$0.0421"). */
  cost?: string | null;
}

export interface PlanFeatureLine {
  label: string;
  included: boolean;
}

/** A pricing tier card shown in the upgrade/compare grid. */
export interface PricingTier {
  key: string;
  name: string;
  tagline?: string | null;
  priceAmount: number;
  priceDisplay: string;
  interval: BillingInterval;
  features: PlanFeatureLine[];
  highlighted?: boolean;
  current?: boolean;
  ctaLabel: string;
}

/** Header banner describing the tenant's active subscription. */
export interface CurrentPlanInfo {
  key: string;
  name: string;
  status: SubscriptionStatus;
  priceDisplay: string;
  renewsAt: string | null;
  trialEndsAt: string | null;
  autoRenew: boolean;
}

export interface InvoiceRow {
  id: string;
  number: string;
  date: string;
  description: string;
  amount: number;
  amountDisplay: string;
  status: InvoiceStatus;
  method: string;
  downloadUrl?: string | null;
}

export interface TransactionRow {
  id: string;
  date: string;
  kind: TransactionKind;
  description: string;
  amountDisplay: string;
  status: string;
}

/** Aggregated view-model that powers the whole dashboard shell. */
export interface BillingDashboardData {
  currentPlan: CurrentPlanInfo;
  meters: UsageMeter[];
  tiers: PricingTier[];
  invoices: InvoiceRow[];
  transactions: TransactionRow[];
}

// ---------------------------------------------------------------------------
// Payment Analytics Dashboard view-models
// Consumed by components/billing/metric-cards.tsx and revenue-chart.tsx.
// ---------------------------------------------------------------------------

/** Trend direction for a metric vs the previous comparison window. */
export type MetricTrend = "up" | "down" | "flat";

/** Granularity options for the analytics time-series. */
export type AnalyticsGranularity = "day" | "week" | "month";

/** A single key financial metric rendered as a headline card. */
export interface AnalyticsMetric {
  key: string;
  label: string;
  /** Pre-formatted headline value (e.g. "$12,480", "3.2%"). */
  valueDisplay: string;
  /** Signed delta vs previous window, formatted (e.g. "+8.4%"). */
  changeDisplay: string;
  /** Percentage change as a raw number for color/threshold logic. */
  changePercent: number;
  trend: MetricTrend;
  /** Optional caption under the value (e.g. "vs last month"). */
  caption?: string | null;
}

/** One point on the revenue trend area chart. */
export interface RevenueTrendPoint {
  /** ISO date or bucket label used on the X axis. */
  date: string;
  /** Pre-localized X-axis tick label (e.g. "Jun 14"). */
  label: string;
  /** Gross transaction value for the bucket. */
  revenue: number;
  /** Net revenue after refunds/fees for the bucket. */
  netRevenue: number;
}

/** Aggregated payload powering the Payment Analytics Dashboard. */
export interface PaymentAnalyticsData {
  /** Headline metric cards: MRR, GTV, Churn Rate, LTV. */
  metrics: AnalyticsMetric[];
  /** Time-series feeding the revenue area chart. */
  revenueTrend: RevenueTrendPoint[];
  /** Pre-formatted currency code/symbol context (e.g. "USD"). */
  currency: string;
  /** Label describing the active comparison window. */
  rangeLabel: string;
  /** ISO timestamp the snapshot was generated. */
  generatedAt: string;
}

/** Filter state the dashboard sends back to refetch analytics. */
export interface AnalyticsFilters {
  /** Inclusive start of the window (ISO date). */
  startDate: string;
  /** Inclusive end of the window (ISO date). */
  endDate: string;
  granularity: AnalyticsGranularity;
  /** ISO currency code to denominate metrics in. */
  currency: string;
  /** Optional plan key to scope analytics to a single tier. */
  planKey?: string | null;
}

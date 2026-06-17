# Subscription Pricing Plans UI & Plan Upgrade Portal
> **Phase 3 — Kiến trúc giao diện Bảng giá gói cước & Cổng nâng cấp tài khoản tự động**
> Phân hệ: **Frontend apps/web**
> Cập nhật: 2026-06-17 | Trạng thái: **DESIGN COMPLETE** — chờ thực thi

---

## I. BỐI CẢNH & CƠ SỞ HẠ TẦNG

### Backend đã sẵn sàng (không cần chỉnh backend)

| Module Backend | Trạng thái | API Endpoint |
|---|---|---|
| `apps/api/src/payments/subscription/plan.config.ts` | ✅ Đã build pass | `PLAN_DEFINITIONS` — 4 plan typed (free/starter/pro/enterprise) |
| `apps/api/src/payments/subscription/subscription.service.ts` | ✅ Đã build pass | `upgradeSubscriptionPlan()` + `cancelWithRefund()` + `calculateProratedPricing()` |
| `apps/api/src/payments/subscription/subscription.controller.ts` | ✅ Đã build pass | `POST /billing/subscription/upgrade`, `POST /billing/subscription/cancel` |
| `apps/api/src/payments/subscription/subscription.types.ts` | ✅ Đã build pass | `UpgradeResult`, `ProrationDetail`, `CancelResult` |
| `apps/api/src/payments/subscription/plan.guard.ts + plan.decorator.ts` | ✅ Đã build pass | Plan Guard middleware |
| `apps/api/src/payments/subscription/subscription.module.ts` | ✅ Đã build pass | NestJS module |

### Gap: Backend cần bổ sung 3 endpoint READ-ONLY cho frontend

> ⚠️ **Các endpoint này là read-only, không ảnh hưởng đến dữ liệu, cần thêm vào backend trước khi code frontend.**

| Endpoint | Mục đích | Scope |
|---|---|---|
| `GET /billing/subscription/current` | Lấy subscription hiện tại kèm usage stats | **CẦN THÊM** |
| `GET /billing/subscription/plans` | Lấy tất cả plan definitions từ PLAN_DEFINITIONS | **CẦN THÊM** |
| `GET /billing/subscription/prorate` | Preview proration (pure function, không mutate) | **CẦN THÊM** |

*Chi tiết các endpoint cần thêm ở Phụ lục A.*

### Frontend hiện tại

| Component | Trạng thái | Ghi chú |
|---|---|---|
| `app/pricing/page.tsx` | ✅ Tồn tại | Marketing page độc lập, dùng Plan[] từ `/billing/plans` |
| `components/billing/pricing-tier-cards.tsx` | ✅ Tồn tại | Grid cards đơn giản, feature list text-based |
| `components/billing/current-plan-shell.tsx` | ✅ Tồn tại | Header widget cơ bản, thiếu usage progress bar |
| `components/billing/usage-meter-grid.tsx` | ✅ Tồn tại | Grid meter cards riêng (dùng trong billing dashboard) |
| `components/billing/billing-client-shell.tsx` | ✅ Tồn tại | State machine (loading/ready/empty/error) |
| `components/billing/wallet-balance-card.tsx` | ✅ Tồn tại | Widget số dư wallet |
| `apps/web/types/billing.ts` | ✅ Tồn tại | UI-facing types (`PricingTier`, `CurrentPlanInfo`, `UsageMeter`) |
| `apps/web/lib/billing.ts` | ✅ Tồn tại | API client (`fetchBillingDashboard`, `subscribeToPlan`) |
| `apps/web/types/wallet.ts` | ✅ Tồn tại | Wallet types |
| `apps/web/lib/wallet.ts` | ✅ Tồn tại | Wallet API functions |

### Nguyên tắc thiết kế giao diện (kế thừa codebase)

1. **Inline styles** (`React.CSSProperties`) — toàn bộ billing components dùng pattern này, KHÔNG dùng CSS modules hay Tailwind
2. **State machine pattern** — tất cả shell component dùng 4 pha: `loading → ready | empty | error` (xem `wallet-client-shell.tsx` làm mẫu)
3. **Client Component** (`"use client"`) — vì cần truy cập auth token, fetch API, interactive state
4. **Server layout** — `layout.tsx` giữ metadata và padding, `page.tsx` là Server Component entry point gọi Client Shell
5. **Inline shimmer animation** — CSS `@keyframes shimmer` cho loading skeleton (không thư viện ngoài)
6. **Font:** Arial, sans-serif (consistent với codebase)
7. **Color palette:** `#0b1020` (bg), `#f5f7ff` (text), `#6d7cff` (accent), `#c8d2ff` (muted), `#9fb0ff` (dim)

---

## II. CẤU TRÚC FILE — SUBSCRIPTION UI

### 11 file mới cần tạo

```
apps/web/
├── types/
│   └── subscription.ts                 # [MỚI] Types cho subscription UI
├── lib/
│   └── subscription.ts                 # [MỚI] API client + format helpers
├── components/billing/
│   ├── pricing-comparison-matrix.tsx    # [MỚI] Bảng so sánh gói cước (khu vực 1)
│   ├── upgrade-preview-modal.tsx        # [MỚI] Modal proration + xác nhận (khu vực 2)
│   ├── current-plan-widget.tsx          # [MỚI] Widget gói cước hiện tại (khu vực 3)
│   └── subscription-client-shell.tsx    # [MỚI] Orchestration shell cho /billing/subscription
└── app/(dashboard)/billing/subscription/
    ├── layout.tsx                       # [MỚI] Server layout metadata
    └── page.tsx                         # [MỚI] Server Component entry → SubscriptionClientShell
```

### 3 file cập nhật

| File | Cập nhật |
|---|---|
| `app/(dashboard)/billing/page.tsx` | Thêm link/nav đến `/billing/subscription` |
| `app/pricing/page.tsx` | Giữ nguyên cho marketing, thêm note về subscription UI |
| `lib/billing.ts` | Giữ nguyên, không sửa — subscription riêng file mới |

---

## III. KIẾN TRÚC CHI TIẾT — KIỂU DỮ LIỆU (types/subscription.ts)

```typescript
// ================================================================
// types/subscription.ts — UI-facing types cho Subscription UI
// ================================================================
// Các interface này là presentation-layer shapes, ánh xạ từ backend
// DTOs (plan.config.ts, subscription.types.ts) qua lib/subscription.ts helpers.
// ================================================================

/** Plan key mapping — đồng bộ với backend PLAN_DEFINITIONS */
export type PlanKey = 'free' | 'starter' | 'pro' | 'enterprise';

/** Billing cycle */
export type BillingCycle = 'monthly' | 'yearly';

/** Trạng thái subscription */
export type SubscriptionStatus =
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
  /** Subscription ID (cần để upgrade/cancel) */
  subscriptionId: string;
  /** Plan key hiện tại */
  planKey: PlanKey;
  /** Tên gói (Tiếng Việt) */
  planName: string;
  /** Trạng thái */
  status: SubscriptionStatus;
  /** Ngày bắt đầu */
  startedAt: string | null;
  /** Ngày hết hạn */
  expiresAt: string | null;
  /** Ngày kết thúc trial (nếu đang trial) */
  trialEndsAt: string | null;
  /** Tự động gia hạn? */
  autoRenew: boolean;
  /** Chu kỳ thanh toán */
  billingCycle: BillingCycle;
  /** Số ngày còn lại (tính từ hôm nay đến expiresAt) */
  daysRemaining: number;
}

/** Thống kê sử dụng tài nguyên cho gói hiện tại */
export interface CurrentUsageStats {
  /** AI calls đã dùng trong chu kỳ */
  aiCallsUsed: number;
  /** Hạn mức AI calls của gói */
  aiCallsLimit: number;
  /** Phần trăm AI calls đã dùng (0-100) */
  aiCallsPercent: number;
  /** Dung lượng đã dùng (GB) */
  storageUsedGB: number;
  /** Hạn mức dung lượng (GB) */
  storageLimitGB: number;
  /** Phần trăm dung lượng đã dùng (0-100) */
  storagePercent: number;
  /** Workflow templates đang active */
  activeWorkflows: number;
  /** Hạn mức workflows */
  workflowLimit: number;
  /** Phần trăm workflows (0-100) */
  workflowPercent: number;
}

/** Kết quả trả về từ GET /billing/subscription/current */
export interface SubscriptionCurrentResponse {
  subscription: CurrentSubscriptionInfo;
  usage: CurrentUsageStats;
  /** Plan definition đầy đủ (limits, features, prices) */
  planDefinition: SubscriptionPlanView | null;
}

// ─────────────────────────────────────────────────────────────
// KHU VỰC 1: Pricing Comparison Matrix types
// ─────────────────────────────────────────────────────────────

/** Một hạn mức tài nguyên hiển thị trong bảng so sánh */
export interface ResourceLimitDisplay {
  /** Key nội bộ (ví dụ: 'maxUsers') */
  key: string;
  /** Nhãn hiển thị (ví dụ: 'Thành viên') */
  label: string;
  /** Icon/emoji */
  icon: string;
  /** Giá trị hiển thị (ví dụ: '5', 'Không giới hạn', '1GB') */
  displayValue: string;
  /** Số gốc (để so sánh), -1 = unlimited */
  rawValue: number;
  /** Có phải unlimited không? */
  unlimited: boolean;
}

/** Một tính năng hiển thị trong bảng so sánh */
export interface FeatureFlagDisplay {
  /** Key nội bộ */
  key: string;
  /** Nhãn hiển thị */
  label: string;
  /** Icon/emoji */
  icon: string;
  /** Mô tả ngắn */
  description?: string;
}

/** Một gói cước trong pricing matrix — ánh xạ từ PlanDefinition */
export interface PlanColumnView {
  key: PlanKey;
  name: string;
  nameEn: string;
  description: string;
  tag: string | null;
  sortOrder: number;

  /** Giá tháng */
  monthlyPrice: number;
  monthlyPriceDisplay: string;
  /** Giá năm (0 nếu chỉ có monthly) */
  yearlyPrice: number;
  yearlyPriceDisplay: string;
  /** % giảm cho yearly (so với monthly × 12) */
  yearlyDiscountPercent: number;
  /** Số ngày dùng thử (0 = không có) */
  trialDays: number;

  /** Resource limits hiển thị */
  limits: ResourceLimitDisplay[];
  /** Feature flags hiển thị */
  features: { key: string; value: boolean }[];

  /** Gói hiện tại của tenant? */
  isCurrent: boolean;
  /** Có highlight (Pro) không? */
  highlighted: boolean;
  /** Loại CTA button */
  ctaType: 'current' | 'upgrade' | 'downgrade' | 'contact' | 'trial';
  /** Label CTA */
  ctaLabel: string;
}

/** Kết quả trả về từ GET /billing/subscription/plans */
export interface SubscriptionPlansResponse {
  plans: PlanColumnView[];
  currentPlanKey: PlanKey | null;
}

// ─────────────────────────────────────────────────────────────
// KHU VỰC 2: Upgrade Preview Modal types
// ─────────────────────────────────────────────────────────────

/** Chi tiết proration — ánh xạ từ backend ProrationDetail */
export interface ProrationPreviewView {
  oldPlanKey: PlanKey;
  newPlanKey: PlanKey;
  oldPlanName: string;
  newPlanName: string;

  /** Số ngày còn lại của gói cũ */
  oldPlanRemainingDays: number;
  /** Tổng số ngày chu kỳ hiện tại */
  oldPlanTotalDays: number;
  /** Giá trị còn lại của gói cũ (VND) */
  oldPlanRemainingValue: number;
  oldPlanRemainingDisplay: string;

  /** Giá đầy đủ gói mới (VND) */
  newPlanTotalPrice: number;
  newPlanTotalDisplay: string;
  /** Giá prorated gói mới (VND) */
  newPlanProratedPrice: number;
  newPlanProratedDisplay: string;

  /** Hướng upgrade/downgrade */
  direction: 'upgrade' | 'downgrade' | 'crossgrade' | 'same';
  /** Số tiền phải trả thêm (VND, 0 nếu credit đủ) */
  chargeAmount: number;
  chargeDisplay: string;
  /** Số tiền được hoàn (VND, 0 nếu upgrade) */
  creditAmount: number;
  creditDisplay: string;

  /** Ngày hiệu lực */
  effectiveFromDisplay: string;
  /** Hạn mới */
  newExpiresAtDisplay: string;

  /** Số dư wallet hiện tại */
  walletBalanceDisplay: string;
  /** Đủ tiền không? */
  sufficientBalance: boolean;
  /** Thiếu bao nhiêu? (VND) */
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
  | 'selecting_plan'     // Chọn plan muốn chuyển
  | 'preview_loading'    // Đang fetch proration
  | 'preview_ready'      // Đã có proration, hiển thị chi tiết
  | 'preview_error'      // Lỗi proration
  | 'confirming'         // User nhấn xác nhận, gọi POST upgrade
  | 'success'            // Upgrade thành công
  | 'error';             // Upgrade thất bại

/** Dữ liệu cho mỗi pha */
export interface UpgradeModalState {
  phase: UpgradeModalPhase;
  targetPlanKey: PlanKey | null;
  targetCycle: BillingCycle;
  proration: ProrationPreviewView | null;
  result: {
    success: boolean;
    message: string;
    invoiceId?: string;
    ledgerTransactionId?: string;
    newExpiresAt?: string;
  } | null;
  error: string;
}
```

---

## IV. KIẾN TRÚC CHI TIẾT — API CLIENT (lib/subscription.ts)

```typescript
// ================================================================
// lib/subscription.ts — Subscription API client & format helpers
// ================================================================
// Module: frontend apps/web
// Pattern: kế thừa lib/billing.ts (API_BASE, getStoredToken, resolveTenantSlug)
// ================================================================

import { API_BASE, getStoredToken } from './auth';
import { resolveTenantSlug } from './billing';
import type {
  SubscriptionCurrentResponse,
  SubscriptionPlansResponse,
  ProrationPreviewPayload,
  ProrationPreviewView,
} from '../types/subscription';

// ─── Format helpers ────────────────────────────────────

/** Format VND amount (kế thừa từ billing.ts) */
export function formatVND(amount: number): string {
  if (!Number.isFinite(amount)) return '0₫';
  const rounded = Math.round(amount);
  if (rounded >= 1_000_000_000) {
    return `${(rounded / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ₫`;
  }
  return `${rounded.toLocaleString('vi-VN')}₫`;
}

/** Format ngày tháng dạng "24 Thg 6, 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Đếm số ngày còn lại từ hôm nay đến mốc */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

/** Map trạng thái subscription → màu status pill (kế thừa statusColor) */
export function subscriptionStatusColor(status: string): string {
  switch (status) {
    case 'active': return '#80e0a0';       // green
    case 'trialing': return '#ffb366';     // amber
    case 'past_due': return '#ff6b6b';     // red
    case 'cancelled': return '#9fb0ff';    // blue
    case 'expired': return '#5a6488';      // gray
    case 'changed': return '#c8d2ff';      // light
    default: return '#c8d2ff';
  }
}

/** Map plan key → display order index (0=free, 3=enterprise) */
export function planOrder(key: string): number {
  const order = ['free', 'starter', 'pro', 'enterprise'];
  return order.indexOf(key);
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
 * Lấy tất cả plan definitions (từ backend PLAN_DEFINITIONS)
 */
export async function fetchSubscriptionPlans(): Promise<SubscriptionPlansResponse | null> {
  const token = getStoredToken();

  try {
    const headers: Record<string, string> = { cache: 'no-store' as any };
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
 * Thực hiện upgrade/downgrade (có proration + wallet debit/credit)
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
  proration?: any;
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
        proration: data.proration,
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

/**
 * Map backend ProrationDetail → ProrationPreviewView (nếu backend
 * chưa trả về view-model friendly, cần transform ở client)
 */
export function mapProrationToPreview(raw: any): ProrationPreviewView {
  const charge = Math.round(raw.chargeAmount ?? 0);
  const credit = Math.round(raw.creditAmount ?? 0);
  const direction: 'upgrade' | 'downgrade' | 'crossgrade' | 'same' =
    raw.isUpgrade ? 'upgrade'
    : raw.creditAmount > 0 ? 'downgrade'
    : 'crossgrade';

  // Giả sử wallet balance lấy từ wallet state riêng
  const walletBalance = 0; // placeholder — sẽ gắn từ wallet context

  return {
    oldPlanKey: raw.oldPlanKey ?? '',
    newPlanKey: raw.newPlanKey ?? '',
    oldPlanName: raw.oldPlanName ?? '—',
    newPlanName: raw.newPlanName ?? '—',
    oldPlanRemainingDays: raw.oldPlanRemainingDays ?? 0,
    oldPlanTotalDays: raw.oldPlanTotalDays ?? 0,
    oldPlanRemainingValue: raw.oldPlanRemainingValue ?? 0,
    oldPlanRemainingDisplay: formatVND(raw.oldPlanRemainingValue ?? 0),
    newPlanTotalPrice: raw.newPlanTotalPrice ?? 0,
    newPlanTotalDisplay: formatVND(raw.newPlanTotalPrice ?? 0),
    newPlanProratedPrice: raw.newPlanProratedPrice ?? 0,
    newPlanProratedDisplay: formatVND(raw.newPlanProratedPrice ?? 0),
    direction,
    chargeAmount: charge,
    chargeDisplay: formatVND(charge),
    creditAmount: credit,
    creditDisplay: formatVND(credit),
    effectiveFromDisplay: formatDate(raw.effectiveFrom),
    newExpiresAtDisplay: formatDate(raw.newExpiresAt),
    walletBalanceDisplay: formatVND(walletBalance),
    sufficientBalance: walletBalance >= charge,
    shortfallAmount: Math.max(0, charge - walletBalance),
    shortfallDisplay: formatVND(Math.max(0, charge - walletBalance)),
  };
}
```

---

## V. KIẾN TRÚC KHU VỰC 1 — BẢNG SO SÁNH GÓI CƯỚC (Pricing Comparison Matrix)

### File: `components/billing/pricing-comparison-matrix.tsx`

### Layout tổng thể

```
┌──────────────────────────────────────────────────────────────────────────┐
│  💳 Chọn gói cước                                                       │
│                                                                          │
│  [Monthly ●] [Yearly ○]  ← toggle billing cycle — tiết kiệm đến 17% năm │
│                                                                          │
│  ┌──────────┬──────────────┬────────────────┬─────────────────────────┐  │
│  │  Miễn phí │  Cơ bản      │  Chuyên nghiệp  │  Doanh nghiệp           │  │
│  │           │              │  ┌──────────┐   │                         │  │
│  │           │              │  │ Phổ biến │   │  ┌──────┐              │  │
│  │           │              │  └──────────┘   │  │Liên hệ│              │  │
│  ├──────────┼──────────────┼────────────────┼─────────────────────────┤  │
│  │  0₫/th   │  99.000₫/th  │  490.000₫/th   │  1.990.000₫/th          │  │
│  │          │              │                │                         │  │
│  │  Dùng thử│  Dùng thử 7  │  Dùng thử 7    │                         │  │
│  │  không   │  ngày        │  ngày          │                         │  │
│  │  giới hạn│              │                │                         │  │
│  ├──────────┼──────────────┼────────────────┼─────────────────────────┤  │
│  │ 👥 TViên │  1 người     │  1 người       │  5 người     〜         │  │
│  │ 📦 K.vực │  1 nơi       │  1 nơi         │  3 nơi       〜         │  │
│  │ 🔧 Work  │  3 mẫu       │  10 mẫu        │  ∞           〜         │  │
│  │ 🔗 K.nối │  2 kết nối   │  5 kết nối     │  20 kết nối  〜         │  │
│  │ 🤖 AI    │  500/tháng    │  1.000/tháng   │  5.000/tháng 〜         │  │
│  │ 💾 L.trữ │  1GB          │  5GB           │  50GB         〜         │  │
│  │ 🌐 B.thông│  1GB          │  10GB          │  100GB        〜         │  │
│  ├──────────┼──────────────┼────────────────┼─────────────────────────┤  │
│  │ Lưu trữ  │  ✗           │  ✓             │  ✓            ✓          │  │
│  │ đám mây  │              │                │                          │  │
│  │ Đa thiết │  ✗           │  ✗             │  ✓            ✓          │  │
│  │ bị       │              │                │                          │  │
│  │ Chợ ứng  │  ✗           │  ✗             │  ✓            ✓          │  │
│  │ dụng     │              │                │                          │  │
│  │ API      │  ✗           │  ✗             │  ✓            ✓          │  │
│  │ Analytics│  ✗           │  ✗             │  ✓            ✓          │  │
│  │ T.miền   │  ✗           │  ✗             │  ✗            ✓          │  │
│  │ riêng    │              │                │                          │  │
│  │ White    │  ✗           │  ✗             │  ✗            ✓          │  │
│  │ label    │              │                │                          │  │
│  │ Ưu tiên  │  ✗           │  ✗             │  ✗            ✓          │  │
│  │ hỗ trợ   │              │                │                          │  │
│  │ SLA      │  ✗           │  ✗             │  ✗            ✓          │  │
│  ├──────────┼──────────────┼────────────────┼─────────────────────────┤  │
│  │ [Gói hiện│ [Chuyển sang]│ [Nâng cấp]     │ [Liên hệ]               │  │
│  │  tại]    │              │                │                         │  │
│  └──────────┴──────────────┴────────────────┴─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Thiết kế component

```typescript
"use client";

import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import type {
  PlanColumnView,
  BillingCycle,
  ResourceLimitDisplay,
} from "../../types/subscription";

interface PricingComparisonMatrixProps {
  plans: PlanColumnView[];
  currentPlanKey: string | null;
  /** Callback khi user click upgrade/downgrade */
  onPlanAction: (planKey: string, cycle: BillingCycle) => void;
  /** Đang xử lý plan nào? (pending) */
  pendingKey: string | null;
}

/** Bảng so sánh gói cước 4 cột — khu vực hiển thị số 1 */
export function PricingComparisonMatrix({
  plans,
  currentPlanKey,
  onPlanAction,
  pendingKey,
}: PricingComparisonMatrixProps) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => a.sortOrder - b.sortOrder),
    [plans],
  );

  if (sortedPlans.length === 0) return null;

  return (
    <section>
      {/* ─── Section header + cycle toggle ─── */}
      <div style={sectionHeader}>
        <div style={sectionTitle}>💳 Chọn gói cước</div>
        <CycleToggle cycle={cycle} onChange={setCycle} />
      </div>

      {/* ─── 4-column grid ─── */}
      <div style={gridStyle}>
        {sortedPlans.map((plan) => (
          <PlanColumn
            key={plan.key}
            plan={plan}
            cycle={cycle}
            pending={pendingKey === plan.key}
            isCurrent={plan.key === currentPlanKey}
            onAction={onPlanAction}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Sub-components ──────────────────────────────

function CycleToggle({
  cycle,
  onChange,
}: {
  cycle: BillingCycle;
  onChange: (c: BillingCycle) => void;
}) {
  const monthlyActive = cycle === "monthly";
  return (
    <div style={toggleWrapper}>
      <button
        style={{ ...toggleBtn, ...(monthlyActive ? toggleActive : {}) }}
        onClick={() => onChange("monthly")}
      >
        Trả theo tháng
      </button>
      <button
        style={{ ...toggleBtn, ...(!monthlyActive ? toggleActive : {}) }}
        onClick={() => onChange("yearly")}
      >
        Trả theo năm
      </button>
    </div>
  );
}

function PlanColumn({
  plan,
  cycle,
  pending,
  isCurrent,
  onAction,
}: {
  plan: PlanColumnView;
  cycle: BillingCycle;
  pending: boolean;
  isCurrent: boolean;
  onAction: (planKey: string, cycle: BillingCycle) => void;
}) {
  const priceDisplay =
    cycle === "yearly" && plan.yearlyPrice > 0
      ? plan.yearlyPriceDisplay
      : plan.monthlyPriceDisplay;
  const periodLabel =
    cycle === "yearly" && plan.yearlyPrice > 0 ? "/năm" : "/tháng";
  const isPaid = plan.monthlyPrice > 0;

  // CTA type
  let ctaDisabled = false;
  let ctaLabel = plan.ctaLabel;
  if (isCurrent) {
    ctaDisabled = true;
    ctaLabel = "Gói hiện tại";
  } else if (pending) {
    ctaDisabled = true;
    ctaLabel = "Đang xử lý…";
  } else if (plan.ctaType === "contact") {
    ctaLabel = "Liên hệ";
  }

  const handleClick = () => {
    if (!ctaDisabled && plan.ctaType !== "contact") {
      onAction(plan.key, cycle);
    }
    if (plan.ctaType === "contact") {
      window.open("mailto:sales@aifut.com", "_blank");
    }
  };

  const columnBg: CSSProperties = plan.highlighted
    ? { background: "linear-gradient(180deg, rgba(109,124,255,0.12), rgba(109,124,255,0.03))" }
    : { background: "rgba(255,255,255,0.04)" };

  return (
    <div
      style={{
        ...columnStyle,
        ...columnBg,
        border: plan.highlighted
          ? "2px solid rgba(109,124,255,0.5)"
          : "1px solid rgba(255,255,255,0.08)",
        position: "relative",
      }}
    >
      {/* Tag badge */}
      {plan.tag && (
        <div style={tagBadge}>{plan.tag}</div>
      )}

      {/* Plan name + description */}
      <div style={planNameStyle}>{plan.name}</div>
      {plan.description && (
        <div style={planDescStyle}>{plan.description}</div>
      )}

      {/* Price */}
      <div style={priceRowStyle}>
        <span style={priceValueStyle}>
          {plan.monthlyPrice === 0 ? "Miễn phí" : priceDisplay}
        </span>
        {isPaid && plan.monthlyPrice > 0 && (
          <span style={periodStyle}>{periodLabel}</span>
        )}
      </div>

      {/* Trial badge */}
      {plan.trialDays > 0 && !isCurrent && (
        <div style={trialBadge}>Dùng thử {plan.trialDays} ngày</div>
      )}

      {/* Yearly discount */}
      {cycle === "yearly" && plan.yearlyDiscountPercent > 0 && (
        <div style={discountBadge}>
          Tiết kiệm {plan.yearlyDiscountPercent}%
        </div>
      )}

      {/* CTA button */}
      <button
        style={{
          ...ctaBtnStyle,
          ...(isCurrent ? ctaCurrentStyle : {}),
          ...(pending ? ctaPendingStyle : {}),
          ...(plan.ctaType === "contact" ? ctaContactStyle : {}),
        }}
        onClick={handleClick}
        disabled={ctaDisabled}
      >
        {ctaLabel}
      </button>

      {/* Resource limits section */}
      <div style={limitsSectionStyle}>
        <div style={limitsHeaderStyle}>Hạn mức tài nguyên</div>
        {plan.limits.map((limit) => (
          <LimitRow key={limit.key} limit={limit} />
        ))}
      </div>

      {/* Feature flags section */}
      <div style={featuresSectionStyle}>
        <div style={limitsHeaderStyle}>Tính năng</div>
        {plan.features.map((feature) => (
          <FeatureRow key={feature.key} included={feature.value} label={feature.key} />
        ))}
      </div>
    </div>
  );
}

function LimitRow({ limit }: { limit: ResourceLimitDisplay }) {
  return (
    <div style={limitRowStyle}>
      <span style={limitIconStyle}>{limit.icon}</span>
      <span style={limitLabelStyle}>{limit.label}</span>
      <span style={limitValueStyle(limit.unlimited)}>
        {limit.displayValue}
      </span>
    </div>
  );
}

function FeatureRow({ included, label }: { included: boolean; label: string }) {
  return (
    <div style={featureRowStyle}>
      <span style={{ color: included ? "#80e0a0" : "#5a6488", fontWeight: included ? 700 : 400 }}>
        {included ? "✓" : "—"}
      </span>
      <span style={{ color: included ? "#c8d2ff" : "#5a6488", fontSize: 13 }}>
        {label}
      </span>
    </div>
  );
}

// ─── Style constants ──────────────────────────────

const sectionHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 24,
  flexWrap: "wrap",
  gap: 12,
};

const sectionTitle: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
};

const toggleWrapper: CSSProperties = {
  display: "flex",
  background: "rgba(255,255,255,0.05)",
  borderRadius: 10,
  padding: 3,
};

const toggleBtn: CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "#9fb0ff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "Arial, sans-serif",
};

const toggleActive: CSSProperties = {
  background: "rgba(109,124,255,0.2)",
  color: "#f5f7ff",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 16,
  alignItems: "stretch",
};

const columnStyle: CSSProperties = {
  borderRadius: 20,
  padding: "28px 20px",
  display: "flex",
  flexDirection: "column",
};

const tagBadge: CSSProperties = {
  position: "absolute",
  top: -10,
  left: "50%",
  transform: "translateX(-50%)",
  background: "#6d7cff",
  color: "white",
  padding: "3px 14px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 1,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const planNameStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  marginBottom: 6,
};

const planDescStyle: CSSProperties = {
  fontSize: 13,
  color: "#c8d2ff",
  marginBottom: 14,
  lineHeight: 1.6,
};

const priceRowStyle: CSSProperties = {
  margin: "16px 0 8px",
};

const priceValueStyle: CSSProperties = {
  fontSize: 32,
  fontWeight: 800,
};

const periodStyle: CSSProperties = {
  fontSize: 14,
  color: "#9fb0ff",
  fontWeight: 400,
  marginLeft: 4,
};

const trialBadge: CSSProperties = {
  fontSize: 12,
  color: "#ffb366",
  background: "rgba(255,179,102,0.1)",
  padding: "4px 10px",
  borderRadius: 6,
  display: "inline-block",
  marginBottom: 10,
};

const discountBadge: CSSProperties = {
  fontSize: 12,
  color: "#80e0a0",
  background: "rgba(128,224,160,0.1)",
  padding: "4px 10px",
  borderRadius: 6,
  display: "inline-block",
  marginBottom: 10,
};

const ctaBtnStyle: CSSProperties = {
  width: "100%",
  padding: "14px",
  borderRadius: 12,
  border: "none",
  background: "#6d7cff",
  color: "white",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "Arial, sans-serif",
  marginBottom: 20,
};

const ctaCurrentStyle: CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  color: "#9fb0ff",
  cursor: "default",
};

const ctaPendingStyle: CSSProperties = {
  opacity: 0.7,
  cursor: "wait",
};

const ctaContactStyle: CSSProperties = {
  background: "rgba(255,255,255,0.1)",
  color: "#f5f7ff",
};

const limitsSectionStyle: CSSProperties = {
  marginBottom: 16,
};

const limitsHeaderStyle: CSSProperties = {
  fontSize: 11,
  color: "#9fb0ff",
  textTransform: "uppercase",
  letterSpacing: 1,
  fontWeight: 700,
  marginBottom: 12,
};

const limitRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 0",
  fontSize: 13,
};

const limitIconStyle: CSSProperties = {
  width: 18,
  textAlign: "center",
  fontSize: 14,
};

const limitLabelStyle: CSSProperties = {
  color: "#c8d2ff",
  flex: 1,
};

const limitValueStyle = (unlimited: boolean): CSSProperties => ({
  fontWeight: 700,
  color: unlimited ? "#9fb0ff" : "#f5f7ff",
});

const featuresSectionStyle: CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.06)",
  paddingTop: 14,
};

const featureRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 0",
};
```

### Data flow

```
Backend PLAN_DEFINITIONS
  → subscription.controller.ts (new GET /billing/subscription/plans)
    → Response: { plans, currentPlanKey }
      → lib/subscription.ts (fetchSubscriptionPlans)
        → types/subscription.ts (SubscriptionPlansResponse)
          → components/billing/pricing-comparison-matrix.tsx
```

---

## VI. KIẾN TRÚC KHU VỰC 2 — CỬA SỔ XEM TRƯỚC CHI PHÍ (Upgrade Preview Modal)

### File: `components/billing/upgrade-preview-modal.tsx`

### Layout modal

```
┌──────────────────────────────────────────────────────────┐
│  🔄 Nâng cấp gói cước                                  ✕ │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ── CHỌN GÓI MỚI ──                                      │
│  Gói hiện tại:  Miễn phí → Gói mới:  Chuyên nghiệp      │
│                                                          │
│  [Tháng ●] [Năm ○]                                       │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Miễn phí                                 Pro       │  │
│  │  0₫/tháng                    →    490.000₫/tháng   │  │
│  │                                                     │  │
│  │  👥 1 người                        5 người          │  │
│  │  🔧 3 mẫu workflow                 ∞ workflow       │  │
│  │  🤖 500 AI calls/tháng     5.000 AI calls/tháng     │  │
│  │  💾 1GB lưu trữ                   50GB lưu trữ      │  │
│  │  ...                                ...             │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ── CHI TIẾT THANH TOÁN ── (sau khi fetch prorate)     │
│                                                          │
│  Chu kỳ hiện tại:  15/30 ngày đã dùng                   │
│  Số ngày còn lại:  15 ngày                              │
│                                                          │
│  Giá trị gói cũ còn lại:        0₫     (Miễn phí)       │
│  Chi phí gói mới (prorated):   245.000₫  (Pro 15 ngày)  │
│  ───────────────────────────────────────────────────     │
│  📌 Số tiền cần nạp thêm:      245.000₫                 │
│                                                          │
│  Hiệu lực từ:      15/06/2026                            │
│  Ngày gia hạn mới:  15/07/2026 (giữ nguyên chu kỳ)      │
│                                                          │
│  Số dư ví:           500.000₫  ✅ Đủ tiền               │
│  ───────────────────────────────────────────────────     │
│                                                          │
│  [Quay lại]              [💰 Xác nhận nâng cấp]         │
│                                                          │
│  ⚠️ Gói cũ sẽ tự động hủy khi nâng cấp.                │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Sau khi xác nhận thành công:                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │  ✅ Nâng cấp thành công!                            │  │
│  │                                                     │  │
│  │  Gói cũ:    Miễn phí     →     Chuyên nghiệp       │  │
│  │  Ngày hết hạn:  15/07/2026                          │  │
│  │  Số tiền:  245.000₫ đã trừ từ ví                   │  │
│  │  Mã giao dịch:  LEDGER-xxx123                       │  │
│  │  Hóa đơn:  INV-PRO-2026-06-xxxxx                    │  │
│  │                                                     │  │
│  │  [Quay lại Billing]                                 │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### State machine (7 pha)

```
         ✕ (đóng)
            │
     [closed] ←────────────────┐
        │                      │
        │ user clicks          │ user clicks
        │ "Change Plan"        │ "Đóng" / "Quay lại"
        ▼                      │
  [selecting_plan] ────────────┤
        │                      │
        │ user selects plan    │
        ▼                      │
  [preview_loading] ───────────┤
        │                      │
    ┌───┴───┐                 │
    │       │                 │
    ▼       ▼                 │
[preview_  [preview_          │
 ready]    error] ────────────┤
    │
    │ user clicks "Xác nhận"
    ▼
  [confirming]
    │
 ┌──┴──┐
 │     │
 ▼     ▼
[success]  [error]
```

### Logic component chính

```typescript
"use client";

import { useState, useCallback, useEffect } from "react";
import type { CSSProperties } from "react";
import type {
  PlanColumnView,
  BillingCycle,
  ProrationPreviewView,
  UpgradeModalPhase,
  UpgradeModalState,
} from "../../types/subscription";
import {
  fetchProrationPreview,
  upgradeSubscription,
  formatVND,
  formatDate,
} from "../../lib/subscription";

interface UpgradePreviewModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;       // callback refresh sau upgrade
  currentSubscriptionId: string;
  currentPlanKey: string;
  currentPlanName: string;
  plans: PlanColumnView[];     // tất cả plan (để chọn)
}

export function UpgradePreviewModal({
  open,
  onClose,
  onSuccess,
  currentSubscriptionId,
  currentPlanKey,
  currentPlanName,
  plans,
}: UpgradePreviewModalProps) {
  // ─── State machine ──────────────────────────────────
  const [phase, setPhase] = useState<UpgradeModalPhase>("closed");
  const [targetKey, setTargetKey] = useState<string>("");
  const [targetCycle, setTargetCycle] = useState<BillingCycle>("monthly");
  const [proration, setProration] = useState<ProrationPreviewView | null>(null);
  const [result, setResult] = useState<UpgradeModalState["result"]>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Reset khi mở modal
  useEffect(() => {
    if (open) {
      setPhase("selecting_plan");
      setTargetKey("");
      setProration(null);
      setResult(null);
      setErrorMsg("");
    } else {
      setPhase("closed");
    }
  }, [open]);

  // ─── Fetch proration ────────────────────────────────
  const handlePreview = useCallback(
    async (planKey: string, cycle: BillingCycle) => {
      setTargetKey(planKey);
      setTargetCycle(cycle);
      setPhase("preview_loading");
      setProration(null);
      setErrorMsg("");

      try {
        const result = await fetchProrationPreview({
          currentSubscriptionId,
          targetPlanKey: planKey as any,
          targetCycle: cycle,
          immediate: true,
        });

        if (result) {
          setProration(result);
          setPhase("preview_ready");
        } else {
          setErrorMsg("Không thể tính toán proration. Vui lòng thử lại.");
          setPhase("preview_error");
        }
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Lỗi kết nối khi tính proration",
        );
        setPhase("preview_error");
      }
    },
    [currentSubscriptionId],
  );

  // ─── Confirm upgrade ────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!targetKey) return;
    setPhase("confirming");

    try {
      const res = await upgradeSubscription({
        currentSubscriptionId,
        targetPlanKey: targetKey,
        targetCycle,
        immediate: true,
      });

      if (res.success) {
        setResult({
          success: true,
          message: res.message,
          invoiceId: res.invoiceId,
          ledgerTransactionId: res.ledgerTransactionId,
          newExpiresAt: res.newExpiresAt,
        });
        setPhase("success");
        onSuccess();
      } else {
        setResult({
          success: false,
          message: res.message,
        });
        setPhase("error");
      }
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : "Lỗi kết nối",
      });
      setPhase("error");
    }
  }, [currentSubscriptionId, targetKey, targetCycle, onSuccess]);

  // ─── Chọn plan từ dropdown ──────────────────────────
  const availablePlans = plans.filter((p) => p.key !== currentPlanKey);

  if (!open) return null;

  return (
    <div style={overlay}>
      <div style={modalContainer}>
        {/* ─── Header ─── */}
        <div style={modalHeader}>
          <span style={modalTitle}>
            {phase === "success"
              ? "✅ Nâng cấp thành công"
              : "🔄 Nâng cấp gói cước"}
          </span>
          <button style={closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* ─── Phase: selecting_plan ─── */}
        {phase === "selecting_plan" && (
          <div style={modalBody}>
            <SectionLabel>CHỌN GÓI MỚI</SectionLabel>

            <div style={currentPlanIndicator}>
              <span style={{ color: "#9fb0ff" }}>Gói hiện tại:</span>
              <span style={{ fontWeight: 700, marginLeft: 8 }}>
                {currentPlanName}
              </span>
            </div>

            <CycleSelector
              cycle={targetCycle}
              onChange={setTargetCycle}
            />

            <div style={planGrid}>
              {availablePlans.map((plan) => (
                <SelectablePlanCard
                  key={plan.key}
                  plan={plan}
                  cycle={targetCycle}
                  onSelect={() => handlePreview(plan.key, targetCycle)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ─── Phase: preview_loading ─── */}
        {phase === "preview_loading" && (
          <PreviewLoading />
        )}

        {/* ─── Phase: preview_error ─── */}
        {phase === "preview_error" && (
          <ErrorState message={errorMsg} onRetry={() => null} onBack={() => setPhase("selecting_plan")} />
        )}

        {/* ─── Phase: preview_ready ─── */}
        {phase === "preview_ready" && proration && (
          <ProrationPreviewPanel
            proration={proration}
            onBack={() => setPhase("selecting_plan")}
            onConfirm={handleConfirm}
          />
        )}

        {/* ─── Phase: confirming ─── */}
        {phase === "confirming" && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ marginBottom: 12 }}>⏳</div>
            <div style={{ color: "#c8d2ff" }}>Đang xử lý nâng cấp gói cước…</div>
          </div>
        )}

        {/* ─── Phase: success ─── */}
        {phase === "success" && result?.success && (
          <SuccessPanel result={result} proration={proration} onClose={onClose} />
        )}

        {/* ─── Phase: error ─── */}
        {phase === "error" && result && !result.success && (
          <ErrorState
            message={result.message}
            onRetry={handleConfirm}
            onBack={() => setPhase("preview_ready")}
          />
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────

/** Vòng tròn loading khi fetch proration */
function PreviewLoading() {
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div
        style={{
          width: 32,
          height: 32,
          border: "3px solid rgba(109,124,255,0.2)",
          borderTop: "3px solid #6d7cff",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          margin: "0 auto 16px",
        }}
      />
      <div style={{ color: "#c8d2ff", fontSize: 14 }}>
        Đang tính toán proration…
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/** Trạng thái lỗi */
function ErrorState({
  message,
  onRetry,
  onBack,
}: {
  message: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ color: "#ff6b6b", fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <div style={{ color: "#ffb3b3", marginBottom: 20, fontSize: 14 }}>
        {message}
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button onClick={onBack} style={secondaryBtn}>
          Quay lại
        </button>
        <button onClick={onRetry} style={primaryBtn}>
          Thử lại
        </button>
      </div>
    </div>
  );
}

/** Proration preview panel */
function ProrationPreviewPanel({
  proration,
  onBack,
  onConfirm,
}: {
  proration: ProrationPreviewView;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const isUpgrade = proration.direction === "upgrade";

  return (
    <div style={modalBody}>
      {/* Comparison summary */}
      <SectionLabel>SO SÁNH GÓI CƯỚC</SectionLabel>
      <div style={comparisonCard}>
        <div style={comparisonRow}>
          <div style={comparisonCol}>
            <div style={compLabel}>Gói cũ</div>
            <div style={compValue}>{proration.oldPlanName}</div>
          </div>
          <div style={{ color: "#9fb0ff", fontSize: 20, padding: "0 12px" }}>→</div>
          <div style={comparisonCol}>
            <div style={compLabel}>Gói mới</div>
            <div style={{ ...compValue, color: "#f5f7ff" }}>
              {proration.newPlanName}
            </div>
          </div>
        </div>
      </div>

      {/* Proration detail */}
      <SectionLabel>CHI TIẾT THANH TOÁN</SectionLabel>
      <div style={detailCard}>
        <DetailRow
          label="Ngày đã dùng"
          value={`${proration.oldPlanTotalDays - proration.oldPlanRemainingDays}/${proration.oldPlanTotalDays} ngày`}
        />
        <DetailRow
          label="Số ngày còn lại"
          value={`${proration.oldPlanRemainingDays} ngày`}
        />
        <div style={divider} />

        <DetailRow
          label="Giá trị gói cũ còn lại"
          value={proration.oldPlanRemainingDisplay}
          valueColor="#9fb0ff"
        />
        <DetailRow
          label="Chi phí gói mới (prorated)"
          value={proration.newPlanProratedDisplay}
          valueColor="#c8d2ff"
        />

        {isUpgrade && (
          <>
            <div style={divider} />
            <DetailRow
              label="📌 Số tiền cần nạp thêm"
              value={proration.chargeDisplay}
              valueColor="#ffb366"
              bold
            />
          </>
        )}

        {!isUpgrade && proration.creditAmount > 0 && (
          <>
            <div style={divider} />
            <DetailRow
              label="💰 Số tiền được hoàn"
              value={proration.creditDisplay}
              valueColor="#80e0a0"
              bold
            />
          </>
        )}

        <div style={divider} />

        <DetailRow
          label="Hiệu lực từ"
          value={proration.effectiveFromDisplay}
        />
        <DetailRow
          label="Ngày gia hạn mới"
          value={proration.newExpiresAtDisplay}
          bold
        />
      </div>

      {/* Wallet balance */}
      <SectionLabel>SỐ DƯ VÍ</SectionLabel>
      <div style={walletCard}>
        <div style={walletRow}>
          <span style={{ color: "#9fb0ff", fontSize: 14 }}>
            Số dư khả dụng
          </span>
          <span
            style={{
              fontWeight: 800,
              fontSize: 18,
              color: proration.sufficientBalance ? "#80e0a0" : "#ff6b6b",
            }}
          >
            {proration.walletBalanceDisplay}
          </span>
        </div>
        {!proration.sufficientBalance && (
          <div style={shortfallBox}>
            ⚠️ Bạn cần nạp thêm {proration.shortfallDisplay} để nâng cấp gói này.
            <br />
            <span style={{ fontSize: 12, color: "#ffb366" }}>
              Nạp tiền qua cổng VNPay/MoMo
            </span>
          </div>
        )}
        {proration.sufficientBalance && (
          <div style={sufficientBox}>✅ Đủ tiền</div>
        )}
      </div>

      {/* Footer actions */}
      <div style={modalFooter}>
        <button onClick={onBack} style={secondaryBtn}>
          Quay lại
        </button>
        <button
          onClick={onConfirm}
          style={{
            ...primaryBtn,
            opacity: proration.chargeAmount > 0 && !proration.sufficientBalance ? 0.5 : 1,
            cursor:
              proration.chargeAmount > 0 && !proration.sufficientBalance
                ? "not-allowed"
                : "pointer",
          }}
          disabled={proration.chargeAmount > 0 && !proration.sufficientBalance}
        >
          {proration.chargeAmount > 0
            ? `💰 Xác nhận — Trả ${proration.chargeDisplay}`
            : "✅ Xác nhận nâng cấp"}
        </button>
      </div>

      <div style={disclaimer}>
        ⚠️ Gói cũ sẽ tự động hủy khi nâng cấp. Thời gian còn lại được quy đổi thành
        tín dụng cho gói mới.
      </div>
    </div>
  );
}

/** Success panel sau khi upgrade */
function SuccessPanel({
  result,
  proration,
  onClose,
}: {
  result: UpgradeModalState["result"];
  proration: ProrationPreviewView | null;
  onClose: () => void;
}) {
  return (
    <div style={successPanel}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
        Nâng cấp thành công!
      </div>
      <div style={{ color: "#c8d2ff", fontSize: 14, marginBottom: 24, lineHeight: 1.7 }}>
        Gói cước đã được chuyển đổi.{proration && (
          <>
            <br />
            {proration.oldPlanName} → {proration.newPlanName}
          </>
        )}
      </div>

      {result && (
        <div style={successDetailCard}>
          {result.newExpiresAt && (
            <div style={successRow}>
              <span>Ngày hết hạn</span>
              <span style={{ fontWeight: 700 }}>
                {formatDate(result.newExpiresAt)}
              </span>
            </div>
          )}
          {result.invoiceId && (
            <div style={successRow}>
              <span>Hóa đơn</span>
              <span style={{ color: "#9fb0ff", fontSize: 13 }}>
                {result.invoiceId}
              </span>
            </div>
          )}
          {result.ledgerTransactionId && (
            <div style={successRow}>
              <span>Mã giao dịch</span>
              <span style={{ color: "#9fb0ff", fontSize: 13 }}>
                {result.ledgerTransactionId}
              </span>
            </div>
          )}
        </div>
      )}

      <button onClick={onClose} style={primaryBtn}>
        Quay lại Billing
      </button>
    </div>
  );
}

// ─── Utility sub-components ──────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "#9fb0ff",
        letterSpacing: 1,
        fontWeight: 700,
        textTransform: "uppercase",
        marginBottom: 12,
        marginTop: 20,
      }}
    >
      {children}
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueColor,
  bold,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 0",
        fontSize: 14,
      }}
    >
      <span style={{ color: "#9fb0ff" }}>{label}</span>
      <span
        style={{
          color: valueColor ?? "#f5f7ff",
          fontWeight: bold ? 700 : 400,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function CycleSelector({
  cycle,
  onChange,
}: {
  cycle: BillingCycle;
  onChange: (c: BillingCycle) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 16,
      }}
    >
      <button
        style={{
          padding: "8px 16px",
          borderRadius: 8,
          border: "none",
          background:
            cycle === "monthly"
              ? "rgba(109,124,255,0.2)"
              : "rgba(255,255,255,0.05)",
          color: cycle === "monthly" ? "#f5f7ff" : "#9fb0ff",
          fontWeight: 700,
          cursor: "pointer",
          fontSize: 13,
          fontFamily: "Arial, sans-serif",
        }}
        onClick={() => onChange("monthly")}
      >
        Trả theo tháng
      </button>
      <button
        style={{
          padding: "8px 16px",
          borderRadius: 8,
          border: "none",
          background:
            cycle === "yearly"
              ? "rgba(109,124,255,0.2)"
              : "rgba(255,255,255,0.05)",
          color: cycle === "yearly" ? "#f5f7ff" : "#9fb0ff",
          fontWeight: 700,
          cursor: "pointer",
          fontSize: 13,
          fontFamily: "Arial, sans-serif",
        }}
        onClick={() => onChange("yearly")}
      >
        Trả theo năm — tiết kiệm 17%
      </button>
    </div>
  );
}

// ─── Style constants ──────────────────────────────

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 16,
};

const modalContainer: CSSProperties = {
  width: "100%",
  maxWidth: 640,
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#0b1020",
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#f5f7ff",
  fontFamily: "Arial, sans-serif",
};

const modalHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "24px 28px 0",
};

const modalTitle: CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
};

const closeBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: "#9fb0ff",
  fontSize: 20,
  cursor: "pointer",
  padding: 8,
};

const modalBody: CSSProperties = {
  padding: "0 28px 24px",
};

const modalFooter: CSSProperties = {
  display: "flex",
  gap: 12,
  justifyContent: "flex-end",
  marginTop: 24,
  paddingTop: 16,
  borderTop: "1px solid rgba(255,255,255,0.06)",
};

const primaryBtn: CSSProperties = {
  padding: "12px 24px",
  borderRadius: 12,
  border: "none",
  background: "#6d7cff",
  color: "white",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "Arial, sans-serif",
};

const secondaryBtn: CSSProperties = {
  padding: "12px 24px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  color: "#c8d2ff",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "Arial, sans-serif",
};

const currentPlanIndicator: CSSProperties = {
  padding: "12px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: 16,
  fontSize: 14,
};

const planGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const comparisonCard: CSSProperties = {
  padding: 16,
  borderRadius: 14,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: 8,
};

const comparisonRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const comparisonCol: CSSProperties = {
  flex: 1,
};

const compLabel: CSSProperties = {
  fontSize: 11,
  color: "#9fb0ff",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 4,
};

const compValue: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#c8d2ff",
};

const detailCard: CSSProperties = {
  padding: 16,
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  marginBottom: 8,
};

const divider: CSSProperties = {
  height: 1,
  background: "rgba(255,255,255,0.06)",
  margin: "8px 0",
};

const walletCard: CSSProperties = {
  padding: 16,
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  marginBottom: 8,
};

const walletRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const shortfallBox: CSSProperties = {
  marginTop: 12,
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,107,107,0.1)",
  border: "1px solid rgba(255,107,107,0.2)",
  color: "#ffb3b3",
  fontSize: 13,
  lineHeight: 1.6,
};

const sufficientBox: CSSProperties = {
  marginTop: 12,
  padding: "6px 14px",
  borderRadius: 8,
  background: "rgba(128,224,160,0.1)",
  color: "#80e0a0",
  fontSize: 13,
  display: "inline-block",
};

const successPanel: CSSProperties = {
  padding: "32px 28px",
  textAlign: "center",
};

const successDetailCard: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 16,
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  marginBottom: 24,
  fontSize: 14,
};

const successRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  color: "#c8d2ff",
};

const disclaimer: CSSProperties = {
  marginTop: 16,
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,179,102,0.08)",
  border: "1px solid rgba(255,179,102,0.15)",
  color: "#ffb366",
  fontSize: 12,
  lineHeight: 1.6,
};
```

### Data flow

```
1. User chọn target plan + cycle trong modal
      │
      ▼
2. fetchProrationPreview() → GET /billing/subscription/prorate
      │
      ▼
3. Nhận ProrationPreviewView → hiển thị bảng chi tiết
      │
      ▼
4. User nhấn "Xác nhận"
      │
      ▼
5. upgradeSubscription() → POST /billing/subscription/upgrade
      │
      ├─ Wallet debit (prorated charge)
      ├─ Subscription cũ → 'changed'
      ├─ Subscription mới → 'active'
      └─ Invoice prorated
      │
      ▼
6. Success panel → onClose → refresh subscription data
```

---

## VII. KIẾN TRÚC KHU VỰC 3 — WIDGET GÓI CƯỚC HIỆN TẠI (Current Subscription Widget)

### File: `components/billing/current-plan-widget.tsx`

### Layout

```
┌────────────────────────────────────────────────────────────┐
│  GÓI CƯỚC HIỆN TẠI                                    🔄  │
│                                                          │
│  ┌──────────────────────────┐  ┌──────────────────────┐  │
│  │  Chuyên nghiệp  ● Active │  │  📅 Hết hạn:        │  │
│  │                          │  │  15/07/2026          │  │
│  │  490.000₫ / tháng        │  │  (còn 28 ngày)       │  │
│  │  🔄 Tự động gia hạn      │  │                      │  │
│  │                          │  │  [🔁 Gia hạn tự động]│  │
│  └──────────────────────────┘  └──────────────────────┘  │
│                                                          │
│  ── SỬ DỤNG TÀI NGUYÊN TRONG KỲ ──                      │
│                                                          │
│  🤖 AI Calls                           3.420 / 5.000    │
│  ████████████████████░░░░░░░░░░░░  68%   (Billable)     │
│                                                          │
│  💾 Lưu trữ                             32 / 50 GB       │
│  █████████████░░░░░░░░░░░░░░░░░░░  64%   (Cảnh báo)     │
│                                                          │
│  ⚡ Workflows Active                      8 / ∞          │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  0%   (Không giới hạn)│
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  [🔄 Đổi gói cước]     [✕ Hủy gói cước]          │  │
│  └────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### Thiết kế component

```typescript
"use client";

import type { CSSProperties } from "react";
import type {
  CurrentSubscriptionInfo,
  CurrentUsageStats,
  SubscriptionStatus,
} from "../../types/subscription";
import {
  formatDate,
  daysUntil,
  subscriptionStatusColor,
  formatVND,
} from "../../lib/subscription";

interface CurrentPlanWidgetProps {
  subscription: CurrentSubscriptionInfo;
  usage: CurrentUsageStats;
  planName: string;
  onChangePlan: () => void;           // mở upgrade modal
  onCancelPlan: () => Promise<void>;  // xác nhận hủy
}

/** Widget header hiển thị gói cước + hạn + usage progress bars */
export function CurrentPlanWidget({
  subscription,
  usage,
  planName,
  onChangePlan,
  onCancelPlan,
}: CurrentPlanWidgetProps) {
  const daysLeft = daysUntil(subscription.expiresAt);
  const isExpiring = daysLeft !== null && daysLeft <= 7;
  const isCancelled = subscription.status === "cancelled";
  const isTrialing = subscription.status === "trialing";

  return (
    <section style={wrapper}>
      {/* ─── Row 1: Plan info + Expiry ─── */}
      <div style={row1}>
        {/* Left: plan name + status + price */}
        <div>
          <div style={label}>GÓI CƯỚC HIỆN TẠI</div>
          <div style={planNameRow}>
            <span style={planNameValue}>{planName}</span>
            <StatusPill status={subscription.status} />
          </div>

          {!isCancelled && (
            <div style={cycleInfo}>
              {subscription.billingCycle === "yearly"
                ? "Trả theo năm"
                : "Trả theo tháng"}
              {subscription.autoRenew && (
                <span style={{ marginLeft: 8, color: "#80e0a0", fontSize: 12 }}>
                  · Tự động gia hạn
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: expiry + days remaining */}
        <div style={expiryBlock}>
          <div style={expiryLabel}>Hết hạn</div>
          <div style={expiryDate}>
            {formatDate(subscription.expiresAt)}
          </div>

          {daysLeft !== null && !isCancelled && (
            <div
              style={{
                ...daysBadge,
                background: isExpiring
                  ? "rgba(255,107,107,0.15)"
                  : "rgba(109,124,255,0.15)",
                color: isExpiring ? "#ff6b6b" : "#9fb0ff",
              }}
            >
              {isExpiring
                ? `⚠️ Còn ${daysLeft} ngày`
                : `Còn ${daysLeft} ngày`}
            </div>
          )}

          {isTrialing && (
            <div style={trialBadgeExpiry}>
              Dùng thử — còn {daysLeft ?? "?"} ngày
            </div>
          )}
        </div>
      </div>

      {/* ─── Row 2: Usage meters ─── */}
      <div style={usageSection}>
        <div style={label}>SỬ DỤNG TÀI NGUYÊN TRONG KỲ</div>

        <UsageMeterBar
          icon="🤖"
          label="AI Calls"
          used={usage.aiCallsUsed}
          limit={usage.aiCallsLimit}
          percent={usage.aiCallsPercent}
        />

        <UsageMeterBar
          icon="💾"
          label="Lưu trữ"
          used={usage.storageUsedGB}
          limit={usage.storageLimitGB}
          percent={usage.storagePercent}
          unit="GB"
        />

        <UsageMeterBar
          icon="⚡"
          label="Workflows Active"
          used={usage.activeWorkflows}
          limit={usage.workflowLimit}
          percent={usage.workflowPercent}
        />
      </div>

      {/* ─── Row 3: Actions ─── */}
      <div style={actionRow}>
        <button onClick={onChangePlan} style={changePlanBtn}>
          🔄 Đổi gói cước
        </button>
        {!isCancelled && (
          <button
            onClick={async () => {
              if (
                window.confirm(
                  "Bạn có chắc muốn hủy gói cước? Tiền còn lại sẽ được hoàn vào ví.",
                )
              ) {
                await onCancelPlan();
              }
            }}
            style={cancelBtn}
          >
            ✕ Hủy gói cước
          </button>
        )}
      </div>
    </section>
  );
}

// ─── Sub-components ──────────────────────────────

function StatusPill({ status }: { status: SubscriptionStatus }) {
  const color = subscriptionStatusColor(status);
  return (
    <span
      style={{
        padding: "4px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        textTransform: "capitalize",
        color,
        background: `${color}1f`,
        border: `1px solid ${color}40`,
        whiteSpace: "nowrap",
      }}
    >
      ● {status === "trialing" ? "Dùng thử" : status}
    </span>
  );
}

function UsageMeterBar({
  icon,
  label,
  used,
  limit,
  percent,
  unit,
}: {
  icon: string;
  label: string;
  used: number;
  limit: number;
  percent: number;
  unit?: string;
}) {
  const isUnlimited = limit < 0;
  const displayPercent = Math.min(Math.max(percent, 0), 100);
  const barColor =
    displayPercent > 80 ? "#ff6b6b" : displayPercent > 60 ? "#ffb366" : "#6d7cff";

  return (
    <div style={meterWrapper}>
      <div style={meterHeader}>
        <span>
          <span style={{ marginRight: 8 }}>{icon}</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
        </span>
        <span style={meterValue}>
          {isUnlimited
            ? `${used.toLocaleString()} / ∞`
            : `${used.toLocaleString()} / ${limit.toLocaleString()} ${unit ?? ""}`}
        </span>
      </div>

      {!isUnlimited && (
        <div style={meterTrack}>
          <div
            style={{
              ...meterFill,
              width: `${displayPercent}%`,
              background: barColor,
            }}
          />
        </div>
      )}

      <div style={meterFooter}>
        <span style={{ color: barColor, fontSize: 12 }}>
          {isUnlimited
            ? "Không giới hạn"
            : `${displayPercent}% đã dùng`}
        </span>
      </div>
    </div>
  );
}

// ─── Style constants ──────────────────────────────

const wrapper: CSSProperties = {
  padding: 24,
  borderRadius: 20,
  background:
    "linear-gradient(135deg, rgba(109,124,255,0.1), rgba(109,124,255,0.03))",
  border: "1px solid rgba(109,124,255,0.2)",
  fontFamily: "Arial, sans-serif",
};

const label: CSSProperties = {
  fontSize: 11,
  color: "#9fb0ff",
  textTransform: "uppercase",
  letterSpacing: 1,
  fontWeight: 700,
  marginBottom: 14,
};

const row1: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 24,
};

const planNameRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 8,
};

const planNameValue: CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
};

const cycleInfo: CSSProperties = {
  fontSize: 14,
  color: "#c8d2ff",
};

const expiryBlock: CSSProperties = {
  textAlign: "right",
};

const expiryLabel: CSSProperties = {
  fontSize: 11,
  color: "#9fb0ff",
  textTransform: "uppercase",
  letterSpacing: 1,
  fontWeight: 700,
  marginBottom: 4,
};

const expiryDate: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 6,
};

const daysBadge: CSSProperties = {
  display: "inline-block",
  padding: "4px 12px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
};

const trialBadgeExpiry: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#ffb366",
};

const usageSection: CSSProperties = {
  marginBottom: 20,
};

const meterWrapper: CSSProperties = {
  marginBottom: 16,
};

const meterHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
};

const meterValue: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#f5f7ff",
};

const meterTrack: CSSProperties = {
  height: 6,
  borderRadius: 3,
  background: "rgba(255,255,255,0.08)",
  overflow: "hidden",
  marginBottom: 4,
};

const meterFill: CSSProperties = {
  height: "100%",
  borderRadius: 3,
  transition: "width 0.4s ease",
};

const meterFooter: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
};

const actionRow: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  paddingTop: 16,
  borderTop: "1px solid rgba(255,255,255,0.08)",
};

const changePlanBtn: CSSProperties = {
  padding: "12px 20px",
  borderRadius: 12,
  background: "#6d7cff",
  color: "white",
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  fontFamily: "Arial, sans-serif",
};

const cancelBtn: CSSProperties = {
  padding: "12px 20px",
  borderRadius: 12,
  background: "rgba(255,107,107,0.1)",
  color: "#ff6b6b",
  fontWeight: 700,
  border: "1px solid rgba(255,107,107,0.25)",
  cursor: "pointer",
  fontSize: 14,
  fontFamily: "Arial, sans-serif",
};
```

---

## VIII. KIẾN TRÚC ORCHESTRATION SHELL (subscription-client-shell.tsx)

### File: `components/billing/subscription-client-shell.tsx`

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import type {
  CurrentSubscriptionInfo,
  CurrentUsageStats,
  PlanColumnView,
  BillingCycle,
} from "../../types/subscription";
import {
  fetchSubscriptionCurrent,
  fetchSubscriptionPlans,
  cancelSubscription,
} from "../../lib/subscription";
import { CurrentPlanWidget } from "./current-plan-widget";
import { PricingComparisonMatrix } from "./pricing-comparison-matrix";
import { UpgradePreviewModal } from "./upgrade-preview-modal";

type ShellPhase = "loading" | "ready" | "empty" | "error";

/** Orchestration shell: quản lý state, fetch data, route events */
export function SubscriptionClientShell() {
  const [phase, setPhase] = useState<ShellPhase>("loading");
  const [subData, setSubData] = useState<{
    subscription: CurrentSubscriptionInfo;
    usage: CurrentUsageStats;
    plans: PlanColumnView[];
    currentPlanKey: string | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  // ─── Load all data ────────────────────────────────
  const loadAll = useCallback(async () => {
    setPhase("loading");
    setError("");

    try {
      const [currentRes, plansRes] = await Promise.all([
        fetchSubscriptionCurrent(),
        fetchSubscriptionPlans(),
      ]);

      if (!currentRes && !plansRes) {
        setPhase("empty");
        return;
      }

      setSubData({
        subscription: currentRes?.subscription ?? {
          subscriptionId: "",
          planKey: "free",
          planName: "Miễn phí",
          status: "none",
          startedAt: null,
          expiresAt: null,
          trialEndsAt: null,
          autoRenew: false,
          billingCycle: "monthly",
          daysRemaining: 0,
        },
        usage: currentRes?.usage ?? {
          aiCallsUsed: 0,
          aiCallsLimit: 500,
          aiCallsPercent: 0,
          storageUsedGB: 0,
          storageLimitGB: 1,
          storagePercent: 0,
          activeWorkflows: 0,
          workflowLimit: 3,
          workflowPercent: 0,
        },
        plans: plansRes?.plans ?? [],
        currentPlanKey: plansRes?.currentPlanKey ?? currentRes?.subscription?.planKey ?? null,
      });

      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải dữ liệu gói cước");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ─── Upgrade callback ─────────────────────────────
  const handlePlanAction = useCallback(
    (planKey: string, _cycle: BillingCycle) => {
      if (!subData?.subscription?.subscriptionId) return;
      setUpgradeOpen(true);
    },
    [subData],
  );

  // ─── Cancel callback ──────────────────────────────
  const handleCancelPlan = useCallback(async () => {
    if (!subData?.subscription?.subscriptionId) return;

    setPendingKey("cancel");
    setNotice(null);

    const result = await cancelSubscription(subData.subscription.subscriptionId);

    setNotice({
      ok: result.success,
      message: result.message,
    });

    setPendingKey(null);
    if (result.success) {
      await loadAll(); // refresh sau khi hủy
    }
  }, [subData, loadAll]);

  // ─── Upgrade modal success callback ───────────────
  const handleUpgradeSuccess = useCallback(() => {
    setUpgradeOpen(false);
    loadAll();
  }, [loadAll]);

  // ─── Render ───────────────────────────────────────
  if (phase === "loading") {
    return <PanelMessage tone="muted">Đang tải dữ liệu gói cước…</PanelMessage>;
  }

  if (phase === "error") {
    return (
      <PanelMessage tone="error">
        {error || "Có lỗi xảy ra."}
        <div style={{ marginTop: 12 }}>
          <button onClick={loadAll} style={retryBtn}>
            Thử lại
          </button>
        </div>
      </PanelMessage>
    );
  }

  if (phase === "empty" || !subData) {
    return (
      <PanelMessage tone="muted">
        Chưa có dữ liệu gói cước. Hãy đăng nhập và seed dữ liệu billing để tiếp tục.
      </PanelMessage>
    );
  }

  return (
    <div style={{ display: "grid", gap: 28 }}>
      {/* Notification */}
      {notice && (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: notice.ok
              ? "rgba(80,200,120,0.1)"
              : "rgba(255,80,80,0.1)",
            border: `1px solid ${notice.ok ? "rgba(80,200,120,0.2)" : "rgba(255,80,80,0.2)"}`,
            color: notice.ok ? "#b3ffcc" : "#ffb3b3",
          }}
        >
          {notice.message}
        </div>
      )}

      {/* Khu vực 3: Current Subscription Widget */}
      <CurrentPlanWidget
        subscription={subData.subscription}
        usage={subData.usage}
        planName={subData.subscription.planName}
        onChangePlan={() => setUpgradeOpen(true)}
        onCancelPlan={handleCancelPlan}
      />

      {/* Khu vực 1: Pricing Comparison Matrix */}
      <PricingComparisonMatrix
        plans={subData.plans}
        currentPlanKey={subData.currentPlanKey}
        onPlanAction={handlePlanAction}
        pendingKey={pendingKey}
      />

      {/* Khu vực 2: Upgrade Preview Modal */}
      <UpgradePreviewModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        onSuccess={handleUpgradeSuccess}
        currentSubscriptionId={subData.subscription.subscriptionId}
        currentPlanKey={subData.subscription.planKey}
        currentPlanName={subData.subscription.planName}
        plans={subData.plans}
      />
    </div>
  );
}

function PanelMessage({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "muted" | "error";
}) {
  return (
    <div
      style={{
        padding: 32,
        borderRadius: 20,
        textAlign: "center",
        background:
          tone === "error"
            ? "rgba(255,80,80,0.08)"
            : "rgba(255,255,255,0.04)",
        border:
          tone === "error"
            ? "1px solid rgba(255,80,80,0.2)"
            : "1px solid rgba(255,255,255,0.08)",
        color: tone === "error" ? "#ffb3b3" : "#c8d2ff",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {children}
    </div>
  );
}

const retryBtn: CSSProperties = {
  padding: "10px 18px",
  borderRadius: 10,
  border: "none",
  background: "#6d7cff",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "Arial, sans-serif",
};
```

---

## IX. ROUTE & LAYOUT

### Route: `/billing/subscription`

**File A: `app/(dashboard)/billing/subscription/layout.tsx`**

```typescript
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Gói cước & Nâng cấp · AIFUT",
  description: "Quản lý gói cước, so sánh hạn mức tài nguyên và nâng cấp/hạ cấp tài khoản.",
};

/** Server Component layout — padding + metadata (kế thừa pattern billing layout) */
export default function SubscriptionLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif" }}>
      {children}
    </div>
  );
}
```

**File B: `app/(dashboard)/billing/subscription/page.tsx`**

```typescript
import { SubscriptionClientShell } from "../../../../components/billing/subscription-client-shell";

export const dynamic = "force-dynamic";

export default function SubscriptionPage() {
  return (
    <>
      <header style={{ marginBottom: 32 }}>
        <div
          style={{
            fontSize: 12,
            color: "#9fb0ff",
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 8,
          }}
        >
          AIFUT Subscription
        </div>
        <h1 style={{ fontSize: 36, margin: "0 0 4px" }}>Gói cước &amp; Nâng cấp</h1>
        <p style={{ color: "#c8d2ff", fontSize: 16, margin: 0 }}>
          Quản lý gói cước, so sánh hạn mức tài nguyên và thực hiện nâng cấp / hạ cấp.
        </p>
      </header>

      <SubscriptionClientShell />
    </>
  );
}
```

### Cập nhật navigation

**File: `app/(dashboard)/billing/page.tsx`** — thêm link đến `/billing/subscription`

```typescript
// Bổ sung trong header hoặc sub-navigation:
<Link href="/billing/subscription">
  Gói cước & Nâng cấp
</Link>
```

---

## X. DATA FLOW TỔNG THỂ

```
┌──────────────────────────────────────────────────────────────────────┐
│  apps/web/(dashboard)/billing/subscription/page.tsx                 │
│  (Server Component, force-dynamic)                                  │
│         │                                                           │
│         ▼                                                           │
│  SubscriptionClientShell (Client Component)                          │
│         │                                                           │
│         ├── useEffect → loadAll()                                    │
│         │     ├── fetchSubscriptionCurrent() → GET /current         │
│         │     │     └── Response: { subscription, usage, planDef }  │
│         │     └── fetchSubscriptionPlans() → GET /plans             │
│         │           └── Response: { plans[], currentPlanKey }       │
│         │                                                           │
│         ├── KHU VỰC 3: CurrentPlanWidget                           │
│         │     ├── subscription + usage → header + progress bars    │
│         │     ├── onChangePlan → open UpgradePreviewModal          │
│         │     └── onCancelPlan → cancelSubscription()              │
│         │                                                           │
│         ├── KHU VỰC 1: PricingComparisonMatrix                     │
│         │     ├── plans[] → 4-column grid                          │
│         │     └── onPlanAction → open UpgradePreviewModal          │
│         │                                                           │
│         └── KHU VỰC 2: UpgradePreviewModal                         │
│               ├── Phase selecting_plan → chọn target               │
│               ├── fetchProrationPreview() → GET /prorate            │
│               ├── Phase preview_ready → hiển thị tính toán          │
│               └── upgradeSubscription() → POST /upgrade             │
│                                                                      │
│  API Backend:                                                       │
│  GET  /billing/subscription/current    → subscription.service.ts    │
│  GET  /billing/subscription/plans      → plan.config.ts             │
│  GET  /billing/subscription/prorate    → calculateProratedPricing() │
│  POST /billing/subscription/upgrade    → upgradeSubscriptionPlan()  │
│  POST /billing/subscription/cancel     → cancelWithRefund()         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## XI. BACKEND CẦN BỔ SUNG (3 ENDPOINTS READ-ONLY)

### Endpoint A: `GET /billing/subscription/current`

```typescript
// Thêm vào subscription.controller.ts
@Get('current')
async getCurrent(
  @Headers('x-tenant-slug') slug?: string,
  @Headers('x-tenant-id') tenantId?: string,
) {
  const tenant = await this.resolveTenant(slug, tenantId);
  return this.subscriptionService.getSubscriptionWithUsage(tenant.id);
}
```

Cần implement `getSubscriptionWithUsage()` trong subscription.service.ts:

```typescript
async getSubscriptionWithUsage(tenantId: string) {
  const sub = await this.prisma.subscription.findFirst({
    where: { tenantId, status: { in: ['active', 'trialing'] } },
    orderBy: { createdAt: 'desc' },
  });

  if (!sub) {
    return { subscription: null, usage: null, planDefinition: null };
  }

  const planDef = PLAN_DEFINITIONS[sub.planKey as PlanKey] ?? null;
  const since = sub.startedAt ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Aggregate usage
  const aiUsage = await this.prisma.usageRecord.aggregate({
    where: { tenantId, category: 'ai', recordedAt: { gte: since } },
    _sum: { value: true },
  });
  const storageUsage = await this.prisma.usageRecord.aggregate({
    where: { tenantId, category: 'storage', recordedAt: { gte: since } },
    _sum: { value: true },
  });
  const workflowCount = await this.prisma.workflowTemplate.count({
    where: { tenantId, status: { not: 'ARCHIVED' } },
  });

  return {
    subscription: {
      subscriptionId: sub.id,
      planKey: sub.planKey,
      planName: planDef?.name ?? sub.planKey,
      status: sub.status,
      startedAt: sub.startedAt?.toISOString() ?? null,
      expiresAt: sub.expiresAt?.toISOString() ?? null,
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      autoRenew: sub.autoRenew,
      billingCycle: sub.billingCycle ?? 'monthly',
      daysRemaining: sub.expiresAt
        ? Math.max(0, Math.ceil((sub.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0,
    },
    usage: {
      aiCallsUsed: Number(aiUsage._sum.value ?? 0),
      aiCallsLimit: planDef?.limits.aiCallsMonthly ?? 0,
      aiCallsPercent: planDef && planDef.limits.aiCallsMonthly > 0
        ? Math.round((Number(aiUsage._sum.value ?? 0) / planDef.limits.aiCallsMonthly) * 100)
        : 0,
      storageUsedGB: Math.round(Number(storageUsage._sum.value ?? 0) / (1024 * 1024 * 1024)),
      storageLimitGB: planDef?.limits.storageGB ?? 0,
      storagePercent: planDef && planDef.limits.storageGB > 0
        ? Math.round((Number(storageUsage._sum.value ?? 0) / (1024 * 1024 * 1024) / planDef.limits.storageGB) * 100)
        : 0,
      activeWorkflows: workflowCount,
      workflowLimit: planDef?.limits.maxWorkflows ?? 0,
      workflowPercent: planDef && planDef.limits.maxWorkflows > 0
        ? Math.round((workflowCount / planDef.limits.maxWorkflows) * 100)
        : planDef?.limits.maxWorkflows === -1 ? 0 : 100,
    },
    planDefinition: planDef,
  };
}
```

### Endpoint B: `GET /billing/subscription/plans`

```typescript
// Thêm vào subscription.controller.ts
@Get('plans')
async listPlans(
  @Headers('x-tenant-slug') slug?: string,
  @Headers('x-tenant-id') tenantId?: string,
) {
  const activePlans = getActivePlans();
  let currentPlanKey: string | null = null;

  if (tenantId || slug) {
    try {
      const tenant = await this.resolveTenant(slug, tenantId);
      const currentSub = await this.prisma.subscription.findFirst({
        where: { tenantId: tenant.id, status: { in: ['active', 'trialing'] } },
        orderBy: { createdAt: 'desc' },
      });
      currentPlanKey = currentSub?.planKey ?? null;
    } catch {
      // Tenant not resolved — return plans without current key
    }
  }

  const plans = activePlans.map((plan) => {
    const monthlyPrice = plan.prices.find((p) => p.billingCycle === 'monthly');
    const yearlyPrice = plan.prices.find((p) => p.billingCycle === 'yearly');

    return {
      key: plan.key,
      name: plan.name,
      nameEn: plan.nameEn,
      description: plan.description,
      tag: plan.tag ?? null,
      sortOrder: plan.sortOrder,
      monthlyPrice: monthlyPrice?.priceVnd ?? 0,
      monthlyPriceDisplay: monthlyPrice?.priceVnd
        ? `${monthlyPrice.priceVnd.toLocaleString('vi-VN')}₫`
        : 'Miễn phí',
      yearlyPrice: yearlyPrice?.priceVnd ?? 0,
      yearlyPriceDisplay: yearlyPrice?.priceVnd
        ? `${yearlyPrice.priceVnd.toLocaleString('vi-VN')}₫`
        : 'Miễn phí',
      yearlyDiscountPercent: yearlyPrice?.discountPercent ?? 0,
      trialDays: monthlyPrice?.trialDays ?? 0,
      limits: [
        { key: 'maxUsers', label: 'Thành viên', icon: '👥', displayValue: isUnlimited(plan.limits.maxUsers) ? 'Không giới hạn' : `${plan.limits.maxUsers} người`, rawValue: plan.limits.maxUsers, unlimited: isUnlimited(plan.limits.maxUsers) },
        { key: 'maxWorkspaces', label: 'Không gian làm việc', icon: '📦', displayValue: isUnlimited(plan.limits.maxWorkspaces) ? 'Không giới hạn' : `${plan.limits.maxWorkspaces} nơi`, rawValue: plan.limits.maxWorkspaces, unlimited: isUnlimited(plan.limits.maxWorkspaces) },
        { key: 'maxWorkflows', label: 'Mẫu workflow', icon: '🔧', displayValue: isUnlimited(plan.limits.maxWorkflows) ? 'Không giới hạn' : `${plan.limits.maxWorkflows} mẫu`, rawValue: plan.limits.maxWorkflows, unlimited: isUnlimited(plan.limits.maxWorkflows) },
        { key: 'maxConnectors', label: 'Kết nối tích hợp', icon: '🔗', displayValue: isUnlimited(plan.limits.maxConnectors) ? 'Không giới hạn' : `${plan.limits.maxConnectors} kết nối`, rawValue: plan.limits.maxConnectors, unlimited: isUnlimited(plan.limits.maxConnectors) },
        { key: 'aiCallsMonthly', label: 'AI Calls/tháng', icon: '🤖', displayValue: isUnlimited(plan.limits.aiCallsMonthly) ? 'Không giới hạn' : plan.limits.aiCallsMonthly >= 1000 ? `${(plan.limits.aiCallsMonthly / 1000).toFixed(0)}K` : `${plan.limits.aiCallsMonthly}`, rawValue: plan.limits.aiCallsMonthly, unlimited: isUnlimited(plan.limits.aiCallsMonthly) },
        { key: 'storageGB', label: 'Lưu trữ', icon: '💾', displayValue: isUnlimited(plan.limits.storageGB) ? 'Không giới hạn' : `${plan.limits.storageGB}GB`, rawValue: plan.limits.storageGB, unlimited: isUnlimited(plan.limits.storageGB) },
        { key: 'bandwidthGB', label: 'Băng thông', icon: '🌐', displayValue: isUnlimited(plan.limits.bandwidthGB) ? 'Không giới hạn' : `${plan.limits.bandwidthGB}GB`, rawValue: plan.limits.bandwidthGB, unlimited: isUnlimited(plan.limits.bandwidthGB) },
        { key: 'apiRateLimit', label: 'API rate limit', icon: '⚡', displayValue: isUnlimited(plan.limits.apiRateLimit) ? 'Không giới hạn' : `${plan.limits.apiRateLimit}/phút`, rawValue: plan.limits.apiRateLimit, unlimited: isUnlimited(plan.limits.apiRateLimit) },
      ],
      features: [
        { key: 'Lưu trữ đám mây', value: plan.features.cloudBackup },
        { key: 'Đa thiết bị', value: plan.features.multiDevice },
        { key: 'Chợ ứng dụng', value: plan.features.marketplace },
        { key: 'API & Webhooks', value: plan.features.apiAccess },
        { key: 'Analytics', value: plan.features.analytics },
        { key: 'Tên miền riêng', value: plan.features.customDomain },
        { key: 'White label', value: plan.features.whiteLabel },
        { key: 'Hỗ trợ ưu tiên', value: plan.features.prioritySupport },
        { key: 'SLA', value: plan.features.slaGuarantee },
      ],
      // CTA config
      ctaType: plan.key === 'enterprise' ? 'contact'
        : plan.key === currentPlanKey ? 'current'
        : 'upgrade',
      ctaLabel: plan.key === currentPlanKey ? 'Gói hiện tại'
        : plan.key === 'enterprise' ? 'Liên hệ'
        : 'Nâng cấp',
      highlighted: plan.key === 'pro',
      isCurrent: plan.key === currentPlanKey,
    };
  });

  return { plans, currentPlanKey };
}
```

### Endpoint C: `GET /billing/subscription/prorate`

```typescript
// Thêm vào subscription.controller.ts
@Get('prorate')
async previewProration(
  @Headers('x-tenant-slug') slug?: string,
  @Headers('x-tenant-id') tenantId?: string,
  @Query('subscriptionId') subscriptionId?: string,
  @Query('targetPlanKey') targetPlanKey?: string,
  @Query('targetCycle') targetCycle?: string,
  @Query('immediate') immediate?: string,
) {
  if (!targetPlanKey || !subscriptionId) {
    throw new BadRequestException('subscriptionId and targetPlanKey are required');
  }

  const tenant = await this.resolveTenant(slug, tenantId);

  // Fetch current subscription to get proration input params
  const currentSub = await this.prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!currentSub || currentSub.tenantId !== tenant.id) {
    throw new NotFoundException('Subscription not found');
  }

  const proration = this.subscriptionService.calculateProratedPricing({
    oldPlanKey: currentSub.planKey as PlanKey,
    newPlanKey: targetPlanKey as PlanKey,
    oldCycle: (currentSub as any).billingCycle ?? 'monthly',
    newCycle: (targetCycle as BillingCycle) ?? 'monthly',
    currentPeriodStart: currentSub.startedAt ?? new Date(),
    currentPeriodEnd: currentSub.expiresAt ?? new Date(),
    upgradeTime: new Date(),
  });

  // Enrich with plan names and format display values
  const oldPlan = getPlan(currentSub.planKey);
  const newPlan = getPlan(targetPlanKey);

  return {
    ...proration,
    oldPlanKey: currentSub.planKey,
    newPlanKey: targetPlanKey,
    oldPlanName: oldPlan?.name ?? currentSub.planKey,
    newPlanName: newPlan?.name ?? targetPlanKey,
  };
}
```

### Helper method `resolveTenant()` trong controller

```typescript
// Thêm vào SubscriptionController
private async resolveTenant(slug?: string, tenantId?: string) {
  if (tenantId) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (tenant) return tenant;
  }
  if (slug) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (tenant) return tenant;
  }
  throw new NotFoundException('Tenant not found');
}

// Cần inject PrismaService vào controller:
constructor(
  private readonly subscriptionService: SubscriptionService,
  private readonly prisma: PrismaService,
) {}
```

---

## XII. IMPLEMENTATION ORDER

### Batch 1 — Backend (3 endpoints, ~1.5 giờ)

```
[P0] Thêm resolveTenant() helper vào subscription.controller.ts
[P0] GET /billing/subscription/current     (30 phút)
[P0] GET /billing/subscription/plans       (30 phút)
[P1] GET /billing/subscription/prorate     (30 phút)
[P1] npm run build → fix lỗi nếu có
```

### Batch 2 — Frontend types + lib (1 giờ)

```
[P0] types/subscription.ts                 (20 phút)
[P0] lib/subscription.ts — 4 API functions + 4 helpers (40 phút)
```

### Batch 3 — Frontend components (3-4 giờ)

```
[P0] components/billing/current-plan-widget.tsx        (40 phút)
[P0] components/billing/pricing-comparison-matrix.tsx  (1 giờ)
[P0] components/billing/upgrade-preview-modal.tsx      (1.5 giờ)
[P1] components/billing/subscription-client-shell.tsx  (30 phút)
```

### Batch 4 — Route + layout (15 phút)

```
[P0] app/(dashboard)/billing/subscription/layout.tsx   (5 phút)
[P0] app/(dashboard)/billing/subscription/page.tsx     (10 phút)
[P1] Cập nhật /billing nav link
```

### Batch 5 — Verify

```
[P1] npm run build (frontend)
[P2] npm run build (full monorepo turbo)
```

---

## XIII. TỔNG KẾT

### 11 file MỚI trong frontend

| # | File | Khu vực | Loại |
|---|---|---|---|
| 1 | `types/subscription.ts` | — | Types |
| 2 | `lib/subscription.ts` | — | API client |
| 3 | `components/billing/pricing-comparison-matrix.tsx` | Khu vực 1 | Component |
| 4 | `components/billing/upgrade-preview-modal.tsx` | Khu vực 2 | Component |
| 5 | `components/billing/current-plan-widget.tsx` | Khu vực 3 | Component |
| 6 | `components/billing/subscription-client-shell.tsx` | Shell | Component |
| 7 | `app/(dashboard)/billing/subscription/layout.tsx` | Route | Layout |
| 8 | `app/(dashboard)/billing/subscription/page.tsx` | Route | Page |

### 3 endpoint READ-ONLY cần thêm vào backend

| # | Method | Path | Mô tả |
|---|---|---|---|
| 1 | GET | `/billing/subscription/current` | Lấy subscription hiện tại + usage |
| 2 | GET | `/billing/subscription/plans` | Lấy plan definitions + currentPlanKey |
| 3 | GET | `/billing/subscription/prorate` | Preview proration (pure, không mutate) |

### Tổng effort ước tính

- **Backend (3 endpoints):** ~1.5 giờ code + 30 phút build
- **Frontend (11 file):** ~5 giờ code + 1 giờ build/test
- **Tổng cộng:** ~8 giờ (có thể hoàn thành trong 1-2 phiên code)

### Kế thừa codebase

- ✅ Kế thừa `PLAN_DEFINITIONS` từ `plan.config.ts` (single source of truth)
- ✅ Kế thừa `calculateProratedPricing()` từ `subscription.service.ts`
- ✅ Kế thừa `upgradeSubscriptionPlan()` + `cancelWithRefund()` từ backend
- ✅ Kế thừa state machine pattern từ `billing-client-shell.tsx` + `wallet-client-shell.tsx`
- ✅ Kế thừa inline styles pattern từ toàn bộ billing components
- ✅ Kế thừa shimmer animation cho loading skeleton
- ✅ Kế thừa `API_BASE`, `getStoredToken`, `resolveTenantSlug` từ `lib/auth.ts`

---

*Bản thiết kế được xây dựng dựa trên phân tích codebase thực tế ngày 2026-06-17. Backend subscription module đã build pass. Frontend cần implement 11 file mới + bổ sung 3 endpoint read-only backend.*

## Phụ lục A: Backend endpoint contract (tham khảo cho implementation)

### GET /billing/subscription/current

**Request headers:** `x-tenant-slug` hoặc `x-tenant-id`

**Response (200):**
```json
{
  "subscription": {
    "subscriptionId": "clsx...",
    "planKey": "pro",
    "planName": "Chuyên nghiệp",
    "status": "active",
    "startedAt": "2026-06-01T00:00:00.000Z",
    "expiresAt": "2026-07-01T00:00:00.000Z",
    "trialEndsAt": null,
    "autoRenew": true,
    "billingCycle": "monthly",
    "daysRemaining": 14
  },
  "usage": {
    "aiCallsUsed": 3420,
    "aiCallsLimit": 5000,
    "aiCallsPercent": 68,
    "storageUsedGB": 32,
    "storageLimitGB": 50,
    "storagePercent": 64,
    "activeWorkflows": 8,
    "workflowLimit": -1,
    "workflowPercent": 0
  },
  "planDefinition": { ... }
}
```

### GET /billing/subscription/plans

**Response (200):**
```json
{
  "plans": [
    {
      "key": "free",
      "name": "Miễn phí",
      "monthlyPrice": 0,
      "monthlyPriceDisplay": "Miễn phí",
      "yearlyPrice": 0,
      "yearlyPriceDisplay": "Miễn phí",
      "tag": null,
      "limits": [...],
      "features": [...],
      "highlighted": false,
      "isCurrent": false,
      "ctaType": "upgrade",
      "ctaLabel": "Nâng cấp"
    },
    {
      "key": "pro",
      "name": "Chuyên nghiệp",
      "monthlyPrice": 490000,
      "monthlyPriceDisplay": "490.000₫",
      "yearlyPrice": 4900000,
      "yearlyPriceDisplay": "4.900.000₫",
      "yearlyDiscountPercent": 17,
      "tag": "Phổ biến",
      "limits": [...],
      "features": [...],
      "highlighted": true,
      "isCurrent": true,
      "ctaType": "current",
      "ctaLabel": "Gói hiện tại"
    }
  ],
  "currentPlanKey": "pro"
}
```

### GET /billing/subscription/prorate?subscriptionId=xxx&targetPlanKey=pro&targetCycle=monthly&immediate=true

**Response (200):**
```json
{
  "oldPlanRemainingDays": 15,
  "oldPlanTotalDays": 30,
  "oldPlanRemainingValue": 0,
  "newPlanTotalPrice": 490000,
  "newPlanProratedPrice": 245000,
  "isUpgrade": true,
  "chargeAmount": 245000,
  "creditAmount": 0,
  "effectiveFrom": "2026-06-17T07:52:00.000Z",
  "newExpiresAt": "2026-07-01T00:00:00.000Z",
  "oldPlanKey": "free",
  "newPlanKey": "pro",
  "oldPlanName": "Miễn phí",
  "newPlanName": "Chuyên nghiệp"
}
```

---

*Hết bản thiết kế. Trạng thái: IDLE.*

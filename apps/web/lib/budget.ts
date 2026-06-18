// ============================================================
// lib/budget.ts
// API helpers cho Hệ thống Hạn mức Chi phí AI (Budget Caps).
//
// Kết nối trực tiếp tới backend NestJS budget controller
// qua header x-tenant-slug (resolve từ auth token).
//
// Mọi API call đều xử lý loading/empty/error state
// và trả về strongly-typed results.
// ============================================================

import { API_BASE, getStoredToken } from "./auth";
import type {
  BudgetLimit,
  BudgetHealth,
  BudgetLimitFormData,
  BudgetPeriod,
  BudgetStatus,
} from "../types/budget";

// ─────────────────────────────────────────────────────────────
// TIỆN ÍCH — format tiền tệ
// ─────────────────────────────────────────────────────────────

/**
 * Format số tiền VND với dấu phân cách hàng nghìn.
 * Dùng toLocaleString("vi-VN") để đảm bảo locale đúng.
 *
 * @example formatVND(5000000) → "5.000.000₫"
 * @example formatVND(0)       → "0₫"
 */
export function formatVND(amount: number | string | bigint): string {
  let num: number;
  if (typeof amount === "bigint") {
    num = Number(amount);
  } else if (typeof amount === "string") {
    num = Number(amount);
  } else {
    num = amount;
  }
  if (!Number.isFinite(num) || num < 0) return "0₫";
  return `${Math.round(num).toLocaleString("vi-VN")}₫`;
}

/**
 * Format số tiền VND từ BigInt string (backend format).
 * @example formatVNDFromString("5000000") → "5.000.000₫"
 */
export function formatVNDFromString(amountStr: string | null | undefined): string {
  if (!amountStr) return "0₫";
  try {
    return formatVND(BigInt(amountStr));
  } catch {
    return "0₫";
  }
}

/**
 * Parse chuỗi nhập vào (không dấu, không ký tự) thành BigInt string.
 * Dùng để chuẩn hoá input form trước khi gửi backend.
 * @example parseToBigIntString("5.000.000₫") → "5000000"
 * @example parseToBigIntString("5000000")    → "5000000"
 */
export function parseToBigIntString(raw: string): string {
  const cleaned = raw.replace(/[^\d]/g, "");
  if (!cleaned || cleaned === "0") return "0";
  try {
    return BigInt(cleaned).toString();
  } catch {
    return "0";
  }
}

/**
 * Format số thập phân alertThreshold ra phần trăm hiển thị.
 * @example displayThresholdPercent(0.8) → "80%"
 */
export function displayThresholdPercent(threshold: number): string {
  return `${Math.round(threshold * 100)}%`;
}

// ─────────────────────────────────────────────────────────────
// HEADER HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Tạo headers chuẩn cho API call budget.
 * Luôn gắn x-tenant-slug + Authorization.
 */
async function buildBudgetHeaders(): Promise<Record<string, string>> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  // Thử gắn x-tenant-slug nếu có
  const slug = await resolveTenantSlug();
  if (slug) {
    headers["x-tenant-slug"] = slug;
  }
  // Fallback: x-tenant-id nếu slug không resolve được
  const tenantId = await resolveTenantId();
  if (tenantId) {
    headers["x-tenant-id"] = tenantId;
  }
  return headers;
}

/**
 * Resolve tenant slug từ auth token → /auth/me.
 * Cache kết quả trong memory để tránh gọi lại nhiều lần.
 */
let _slugCache: string | null | undefined = undefined;

export async function resolveTenantSlug(): Promise<string | null> {
  if (_slugCache !== undefined) return _slugCache;
  const token = getStoredToken();
  if (!token) {
    _slugCache = null;
    return null;
  }
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      _slugCache = null;
      return null;
    }
    const me = await res.json();
    _slugCache = (me?.tenant?.slug ?? null) as string | null;
    return _slugCache;
  } catch {
    _slugCache = null;
    return null;
  }
}

let _tenantIdCache: string | null | undefined = undefined;

export async function resolveTenantId(): Promise<string | null> {
  if (_tenantIdCache !== undefined) return _tenantIdCache;
  const token = getStoredToken();
  if (!token) {
    _tenantIdCache = null;
    return null;
  }
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      _tenantIdCache = null;
      return null;
    }
    const me = await res.json();
    _tenantIdCache = (me?.tenant?.id ?? null) as string | null;
    return _tenantIdCache;
  } catch {
    _tenantIdCache = null;
    return null;
  }
}

/**
 * Xoá cache để lần gọi sau resolve lại từ đầu.
 * Gọi sau mỗi mutation thành công.
 */
export function clearBudgetCache(): void {
  _slugCache = undefined;
  _tenantIdCache = undefined;
}

// ─────────────────────────────────────────────────────────────
// API CALLS — Budget Limits
// ─────────────────────────────────────────────────────────────

/**
 * Lấy danh sách tất cả budget limit của tenant hiện tại.
 * GET /billing/budget/limits
 */
export async function fetchBudgetLimits(): Promise<BudgetLimit[]> {
  const headers = await buildBudgetHeaders();
  try {
    const res = await fetch(`${API_BASE}/billing/budget/limits`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`fetchBudgetLimits failed: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? (data as BudgetLimit[]) : [];
  } catch (err) {
    console.error("fetchBudgetLimits error:", err);
    return [];
  }
}

/**
 * Lấy chi tiết 1 limit theo period.
 * GET /billing/budget/limits/:period
 */
export async function fetchBudgetLimitByPeriod(
  period: BudgetPeriod,
): Promise<BudgetLimit | null> {
  const headers = await buildBudgetHeaders();
  try {
    const res = await fetch(`${API_BASE}/billing/budget/limits/${period}`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      console.warn(`fetchBudgetLimitByPeriod(${period}) failed: ${res.status}`);
      return null;
    }
    return (await res.json()) as BudgetLimit;
  } catch (err) {
    console.error(`fetchBudgetLimitByPeriod(${period}) error:`, err);
    return null;
  }
}

/**
 * Lấy health check budget tổng thể.
 * GET /billing/budget/limits/health
 */
export async function fetchBudgetHealth(): Promise<BudgetHealth | null> {
  const headers = await buildBudgetHeaders();
  try {
    const res = await fetch(`${API_BASE}/billing/budget/limits/health`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as BudgetHealth;
  } catch (err) {
    console.error("fetchBudgetHealth error:", err);
    return null;
  }
}

/**
 * Tạo hoặc cập nhật budget limit (upsert).
 * POST /billing/budget/limits
 *
 * @returns BudgetLimit mới hoặc null nếu thất bại.
 */
export async function upsertBudgetLimit(
  data: BudgetLimitFormData,
): Promise<BudgetLimit | null> {
  const headers = await buildBudgetHeaders();
  try {
    const res = await fetch(`${API_BASE}/billing/budget/limits`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        maxCostAmount: parseToBigIntString(data.maxCostAmount),
        period: data.period,
        alertThreshold: data.alertThreshold,
        currency: data.currency ?? "VND",
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`upsertBudgetLimit failed (${res.status}):`, errBody);
      return null;
    }
    clearBudgetCache();
    return (await res.json()) as BudgetLimit;
  } catch (err) {
    console.error("upsertBudgetLimit error:", err);
    return null;
  }
}

/**
 * Cập nhật partial một budget limit (PATCH).
 * PATCH /billing/budget/limits/:period
 */
export async function patchBudgetLimit(
  period: BudgetPeriod,
  patch: {
    maxCostAmount?: string;
    alertThreshold?: number;
    forceStatus?: BudgetStatus;
    currency?: string;
  },
): Promise<BudgetLimit | null> {
  const headers = await buildBudgetHeaders();
  const body: Record<string, string | number> = {};
  if (patch.maxCostAmount !== undefined) {
    body["maxCostAmount"] = parseToBigIntString(patch.maxCostAmount);
  }
  if (patch.alertThreshold !== undefined) {
    body["alertThreshold"] = patch.alertThreshold;
  }
  if (patch.forceStatus !== undefined) {
    body["forceStatus"] = patch.forceStatus;
  }
  if (patch.currency !== undefined) {
    body["currency"] = patch.currency;
  }

  try {
    const res = await fetch(`${API_BASE}/billing/budget/limits/${period}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`patchBudgetLimit(${period}) failed (${res.status}):`, errBody);
      return null;
    }
    clearBudgetCache();
    return (await res.json()) as BudgetLimit;
  } catch (err) {
    console.error(`patchBudgetLimit(${period}) error:`, err);
    return null;
  }
}

/**
 * Emergency unlock — force unlock một period về ACTIVE.
 * POST /billing/budget/limits/unlock/:period
 *
 * @returns BudgetLimit mới sau unlock hoặc null.
 */
export async function emergencyUnlockBudget(
  period: BudgetPeriod,
): Promise<BudgetLimit | null> {
  const headers = await buildBudgetHeaders();
  try {
    const res = await fetch(
      `${API_BASE}/billing/budget/limits/unlock/${period}`,
      {
        method: "POST",
        headers,
        cache: "no-store",
      },
    );
    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`emergencyUnlockBudget(${period}) failed (${res.status}):`, errBody);
      return null;
    }
    clearBudgetCache();
    return (await res.json()) as BudgetLimit;
  } catch (err) {
    console.error(`emergencyUnlockBudget(${period}) error:`, err);
    return null;
  }
}

/**
 * Cập nhật toàn bộ budget limit (gọi upsert cho mỗi limit có dữ liệu).
 * Đồng bộ state từ form config lên backend.
 */
export async function updateBudgetLimit(
  period: BudgetPeriod,
  maxCostAmount: string,
  alertThreshold: number,
): Promise<BudgetLimit | null> {
  return upsertBudgetLimit({
    maxCostAmount,
    period,
    alertThreshold,
    currency: "VND",
  });
}

// ─────────────────────────────────────────────────────────────
// ACTIVITY LOG
// ─────────────────────────────────────────────────────────────

/**
 * Lấy lịch sử hoạt động budget của tenant.
 * GET /billing/budget/logs (nếu backend hỗ trợ)
 * Fallback: trả về mảng rỗng nếu endpoint chưa có.
 */
export async function fetchBudgetActivityLogs(): Promise<BudgetActivityLogDto[]> {
  const headers = await buildBudgetHeaders();
  try {
    const res = await fetch(`${API_BASE}/billing/budget/logs`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as BudgetActivityLogDto[]) : [];
  } catch {
    return [];
  }
}

/** DTO nội bộ cho activity log (tương lai) */
interface BudgetActivityLogDto {
  id: string;
  period: string;
  action: string;
  note: string | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// COMPOSITE FETCHER — cho dashboard one-shot load
// ─────────────────────────────────────────────────────────────

export interface BudgetDashboardLoadResult {
  limits: BudgetLimit[];
  health: BudgetHealth | null;
  error: string | null;
}

/**
 * Load toàn bộ dữ liệu budget dashboard trong 1 call.
 * Chạy song song GET limits + health.
 */
export async function fetchBudgetDashboard(): Promise<BudgetDashboardLoadResult> {
  try {
    const [limits, health] = await Promise.all([
      fetchBudgetLimits(),
      fetchBudgetHealth(),
    ]);
    return { limits, health, error: null };
  } catch (err) {
    return {
      limits: [],
      health: null,
      error: err instanceof Error ? err.message : "Failed to load budget data",
    };
  }
}

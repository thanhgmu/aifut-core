// ─────────────────────────────────────────────────────────────
// Wallet & Refund Portal — API helpers + format utilities
// Dùng chung API_BASE + getStoredToken từ lib/auth.ts
// Backend trả BigInt dạng string ⇒ format an toàn bằng BigInt.
// ─────────────────────────────────────────────────────────────

import { API_BASE, getStoredToken } from "./auth";
import type {
  WalletInfo,
  LedgerHistoryResponse,
  LedgerTxTypeUI,
  LedgerRefTypeUI,
  RefundRequestPayload,
  RefundIntegrityResult,
  RefundResponse,
} from "../types/wallet";

// ─── Internal fetch helper ───────────────────────────
function authHeaders(json = false): Record<string, string> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

async function parseJsonSafe(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ─── API: Wallet balance ─────────────────────────────
/** GET /billing/wallet/balance — Anti-IDOR, auth context. */
export async function fetchWalletBalance(): Promise<WalletInfo | null> {
  const res = await fetch(`${API_BASE}/billing/wallet/balance`, {
    headers: authHeaders(),
    cache: "no-store",
  });

  if (res.status === 404) return null;

  const json = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(json?.message || `wallet/balance failed (${res.status})`);
  }
  if (!json) return null;

  // Backend tạm thời chưa trả status ⇒ mặc định "active".
  return {
    tenantId: String(json.tenantId ?? ""),
    balance: String(json.balance ?? "0"),
    currency: String(json.currency ?? "VND"),
    status: json.status === "locked" ? "locked" : "active",
  };
}

// ─── API: Ledger history (cursor pagination) ─────────
/** GET /billing/wallet/history?cursor=&limit=&type= */
export async function fetchWalletHistory(opts: {
  cursor?: string;
  limit?: number;
  type?: LedgerTxTypeUI;
}): Promise<LedgerHistoryResponse> {
  const params = new URLSearchParams();
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.type) params.set("type", opts.type);

  const qs = params.toString();
  const url = `${API_BASE}/billing/wallet/history${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    headers: authHeaders(),
    cache: "no-store",
  });

  const json = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(json?.message || `wallet/history failed (${res.status})`);
  }

  return {
    items: Array.isArray(json?.items) ? json.items : [],
    nextCursor: json?.nextCursor ?? null,
    hasMore: Boolean(json?.hasMore),
  };
}

// ─── API: Refund integrity pre-check ─────────────────
/** POST /billing/refund/check — chỉ đọc, anti-over-refund pre-check. */
export async function checkRefundIntegrity(
  payload: RefundRequestPayload,
): Promise<RefundIntegrityResult> {
  const res = await fetch(`${API_BASE}/billing/refund/check`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const json = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(json?.message || `refund/check failed (${res.status})`);
  }

  return {
    pass: Boolean(json?.pass),
    originalAmount: String(json?.originalAmount ?? "0"),
    totalRefunded: String(json?.totalRefunded ?? "0"),
    requestedAmount: String(json?.requestedAmount ?? "0"),
    remainingAvailable: String(json?.remainingAvailable ?? "0"),
    details: Array.isArray(json?.details) ? json.details : [],
  };
}

// ─── API: Refund submit ──────────────────────────────
/** POST /billing/refund/request — ghi CREDIT wallet, anti-over-refund. */
export async function submitRefundRequest(
  payload: RefundRequestPayload,
): Promise<RefundResponse> {
  const res = await fetch(`${API_BASE}/billing/refund/request`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const json = await parseJsonSafe(res);
  if (!res.ok) {
    return {
      success: false,
      refundRecordId: "",
      transactionId: "",
      amount: "0",
      status: "error",
      error: json?.message || `refund/request failed (${res.status})`,
    };
  }

  return {
    success: Boolean(json?.success),
    refundRecordId: String(json?.refundRecordId ?? ""),
    transactionId: String(json?.transactionId ?? ""),
    amount: String(json?.amount ?? "0"),
    status: String(json?.status ?? ""),
    error: json?.error,
  };
}

// ─────────────────────────────────────────────────────
//  Format helpers
// ─────────────────────────────────────────────────────

/** Parse BigInt-string an toàn → bigint (rỗng/lỗi ⇒ 0n). */
function toBigIntSafe(value: string): bigint {
  if (value == null) return 0n;
  const cleaned = String(value).trim().replace(/[^\d-]/g, "");
  if (cleaned === "" || cleaned === "-") return 0n;
  try {
    return BigInt(cleaned);
    } catch {
    return 0n;
  }
}

/** Thêm dấu chấm phân tách hàng nghìn cho phần nguyên (bigint). */
function groupThousands(n: bigint): string {
  const neg = n < 0n;
  const digits = (neg ? -n : n).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return neg ? `-${grouped}` : grouped;
}

/**
 * Format BigInt string → human-readable VND.
 * Input:  "150000"  →  Output: "150.000₫"
 */
export function formatWalletAmount(amount: string): string {
  const n = toBigIntSafe(amount);
  return `${groupThousands(n)}₫`;
}

/**
 * Format BigInt string → compact (e.g. "1,5tr", "500k").
 * Quy ước: ≥ 1.000.000 ⇒ "tr"; ≥ 1.000 ⇒ "k"; còn lại ⇒ "₫".
 */
export function compactWalletAmount(amount: string): string {
  const raw = toBigIntSafe(amount);
  const neg = raw < 0n;
  const n = neg ? -raw : raw;
  const sign = neg ? "-" : "";

  if (n >= 1_000_000n) {
    const whole = n / 1_000_000n;
    const frac = (n % 1_000_000n) / 100_000n; // 1 chữ số thập phân
    const fracStr = frac > 0n ? `,${frac}` : "";
    return `${sign}${whole}${fracStr}tr`;
  }
  if (n >= 1_000n) {
    const whole = n / 1_000n;
    const frac = (n % 1_000n) / 100n;
    const fracStr = frac > 0n ? `,${frac}` : "";
    return `${sign}${whole}${fracStr}k`;
  }
  return `${sign}${n}₫`;
}

/**
 * Format ISO date → "14/06/2026 09:30".
 */
export function formatLedgerDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (v: number) => String(v).padStart(2, "0");
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

// ─── Metadata mappers ────────────────────────────────

/** Map referenceType → nhãn tiếng Việt + icon + màu. */
export function referenceTypeMeta(type: LedgerRefTypeUI): {
  label: string;
  icon: string;
  color: string;
} {
  const map: Record<LedgerRefTypeUI, { label: string; icon: string; color: string }> = {
    invoice: { label: "Hóa đơn", icon: "🧾", color: "#9fb0ff" },
    payout: { label: "Chi trả", icon: "💸", color: "#ffb86b" },
    commission: { label: "Hoa hồng", icon: "🤝", color: "#80e0a0" },
    topup: { label: "Nạp tiền", icon: "💳", color: "#6d7cff" },
    refund: { label: "Hoàn tiền", icon: "↩️", color: "#80e0a0" },
    adjustment: { label: "Điều chỉnh", icon: "⚙️", color: "#c8d2ff" },
    affiliate_commission: { label: "HH Affiliate", icon: "🔗", color: "#80e0a0" },
    affiliate_payout: { label: "Chi trả Affiliate", icon: "🔗", color: "#ffb86b" },
    reseller_commission: { label: "HH Đại lý", icon: "🏷️", color: "#80e0a0" },
    system_credit: { label: "Cộng hệ thống", icon: "✨", color: "#6d7cff" },
  };
  return map[type] ?? { label: String(type), icon: "•", color: "#9fb0ff" };
}

/** Map CREDIT/DEBIT → dấu + màu + màu nền. */
export function txTypeMeta(type: LedgerTxTypeUI): {
  sign: "+" | "−";
  color: string;
  bgColor: string;
} {
  if (type === "CREDIT") {
    return { sign: "+", color: "#80e0a0", bgColor: "rgba(128,224,160,0.12)" };
  }
  return { sign: "−", color: "#ff6b6b", bgColor: "rgba(255,107,107,0.12)" };
}

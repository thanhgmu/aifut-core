// ─────────────────────────────────────────────────────────────
// Wallet & Refund Portal — Type Definitions
// Phase 3 (Operator Ready) · Frontend apps/web
// Backend trả BigInt dạng string trong các trường amount / balance.
// ─────────────────────────────────────────────────────────────

// ─── Wallet Info ─────────────────────────────────────
export interface WalletInfo {
  tenantId: string;
  balance: string; // BigInt as string (e.g. "150000")
  currency: string; // "VND"
  status: "active" | "locked";
}

// ─── Ledger Transaction ──────────────────────────────
export type LedgerTxTypeUI = "CREDIT" | "DEBIT";

export type LedgerRefTypeUI =
  | "invoice"
  | "payout"
  | "commission"
  | "topup"
  | "refund"
  | "adjustment"
  | "affiliate_commission"
  | "affiliate_payout"
  | "reseller_commission"
  | "system_credit";

export interface LedgerTransactionItem {
  id: string;
  type: LedgerTxTypeUI;
  amount: string; // BigInt as string
  balanceAfter: string; // BigInt as string
  referenceType: LedgerRefTypeUI;
  referenceId: string;
  description: string | null;
  createdAt: string; // ISO string
}

export interface LedgerHistoryResponse {
  items: LedgerTransactionItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── Refund ──────────────────────────────────────────
export interface RefundRequestPayload {
  originalReferenceId: string;
  amount: number; // VND, positive integer
  description?: string;
}

export interface RefundResponse {
  success: boolean;
  refundRecordId: string;
  transactionId: string;
  amount: string;
  status: string;
  error?: string;
}

export interface RefundIntegrityResult {
  pass: boolean;
  originalAmount: string;
  totalRefunded: string;
  requestedAmount: string;
  remainingAvailable: string;
  details: string[];
}

// ─── Wallet Dashboard View-Model ─────────────────────
export interface WalletDashboardData {
  wallet: WalletInfo;
  history: LedgerTransactionItem[];
  nextCursor: string | null;
  hasMore: boolean;
  typeFilter?: LedgerTxTypeUI;
}

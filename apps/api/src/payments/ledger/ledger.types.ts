// ============================================================
// ledger.types.ts — Internal Wallet / Ledger Transaction Types
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: Định nghĩa các kiểu dữ liệu lõi cho internal wallet ledger.
// Dùng BigInt cho số dư nhằm tránh mất precision với float.
// ============================================================

/** Loại giao dịch ledger */
export enum LedgerTxType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

/** Trạng thái của một giao dịch ledger (append-only, không sửa/xóa) */
export enum LedgerTxStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REVERSED = 'REVERSED', // giao dịch đảo — chỉ cho reverse debit
}

/**
 * Kiểu reference mà giao dịch ledger trỏ tới.
 * Giúp truy vết: ai/cái gì đã gây ra biến động số dư.
 */
export const LedgerReferenceTypes = {
  INVOICE: 'invoice',
  PAYOUT: 'payout',
  COMMISSION: 'commission',
  TOPUP: 'topup',
  REFUND: 'refund',
  ADJUSTMENT: 'adjustment',
  AFFILIATE_COMMISSION: 'affiliate_commission',
  AFFILIATE_PAYOUT: 'affiliate_payout',
  RESELLER_COMMISSION: 'reseller_commission',
  SYSTEM_CREDIT: 'system_credit',
} as const;

export type LedgerReferenceType =
  (typeof LedgerReferenceTypes)[keyof typeof LedgerReferenceTypes];

/** Kết quả trả về của một thao tác ghi ledger */
export interface LedgerResult {
  success: boolean;
  walletId: string;
  transactionId: string;
  balanceBefore: bigint;
  balanceAfter: bigint;
  version: number;
  error?: string;
}

/** Đầu vào cho thao tác debit (rút tiền) */
export interface DebitInput {
  tenantId: string;
  amount: bigint; // luôn dương
  referenceType: LedgerReferenceType;
  referenceId: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/** Đầu vào cho thao tác credit (nạp tiền) */
export interface CreditInput {
  tenantId: string;
  amount: bigint; // luôn dương
  referenceType: LedgerReferenceType;
  referenceId: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/** Đầu vào kiểm tra số dư */
export interface BalanceCheckInput {
  tenantId: string;
  requiredAmount: bigint; // số dư tối thiểu cần có
}

/** Cấu trúc đầy đủ của 1 giao dịch ledger (phục vụ đọc/truy vấn) */
export interface LedgerTransactionRecord {
  id: string;
  tenantId: string;
  type: LedgerTxType;
  amount: bigint;
  balanceAfter: bigint;
  referenceType: LedgerReferenceType;
  referenceId: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/** Cấu trúc đầy đủ của 1 Wallet */
export interface WalletRecord {
  id: string;
  tenantId: string;
  balance: bigint;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// ledger.config.ts — Cấu hình đơn vị tiền tệ hệ thống
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: Định nghĩa currency mặc định, scale, precision và các
// ngưỡng cảnh báo cho internal wallet ledger.
// Tất cả số dư lưu trữ dạng BigInt (smallest unit).
// ============================================================

/**
 * Hệ thống hiện tại dùng VND làm base currency.
 * Mọi số dư trong Wallet.balance và LedgerTransaction.amount
 * đều được lưu ở dạng "nhỏ nhất" (đồng) — BigInt.
 */
export const LEDGER_CONFIG = {
  /** Base currency code */
  baseCurrency: 'VND' as const,

  /** Số chữ số thập phân (0 = VND không có hàng thập phân) */
  decimalPlaces: 0,

  /** Số dư tối đa cho phép trên 1 wallet (tránh overflow) */
  maxBalance: BigInt('999999999999999999'), // ~10^18

  /** Số dư âm tối đa cho phép (nếu cho phép overdraft) */
  maxOverdraft: BigInt(0), // 0 = không cho phép âm

  /**
   * Ngưỡng cảnh báo: nếu số dư dưới ngưỡng này,
   * hệ thống gửi thông báo đến chủ tenant
   */
  lowBalanceWarningThreshold: BigInt(10000), // 10,000 VND

  /**
   * Ngưỡng khóa dịch vụ: nếu số dư dưới ngưỡng này,
   * một số service bị vô hiệu hóa
   */
  serviceBlockThreshold: BigInt(0), // 0 = không block

  /**
   * Số lần thử lại tối đa khi gặp Optimistic Lock conflict
   */
  maxRetryOnLockConflict: 5,

  /**
   * Khoảng thời gian tối thiểu giữa 2 giao dịch của cùng 1 wallet (ms)
   * dùng để tránh spam giao dịch
   */
  minIntervalBetweenTxMs: 100,

  /**
   * Danh sách các referenceType được phép debit
   * (rỗng = cho phép tất cả)
   */
  allowedDebitReferenceTypes: [] as string[],

  /**
   * Danh sách các referenceType được phép credit
   * (rỗng = cho phép tất cả)
   */
  allowedCreditReferenceTypes: [] as string[],

  /** Ghi log mọi thao tác ledger vào bảng audit */
  enableAuditLog: true,
} as const;

export type LedgerConfig = typeof LEDGER_CONFIG;

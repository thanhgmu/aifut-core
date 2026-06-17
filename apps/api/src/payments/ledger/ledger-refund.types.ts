// ============================================================
// ledger-refund.types.ts — Refund Engine Type Definitions
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: Định nghĩa các kiểu dữ liệu cho Refund Engine.
// Refund = ghi CREDIT vào wallet tenant với phân loại 'refund',
// có kèm cơ chế chống hoàn tiền vượt gốc (anti-over-refund)
// và RefundRecord làm first-class entity để truy vết.
// ============================================================

/**
 * Trạng thái của một RefundRecord.
 * PENDING → SUCCESS (khi CREDIT ledger thành công)
 * PENDING → FAILED  (khi CREDIT ledger thất bại)
 */
export type RefundStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

/**
 * Đầu vào cho thao tác processRefundCredit.
 * originalReferenceId: ID giao dịch gốc cần hoàn tiền (ví dụ PaymentTransaction.id).
 * amount: số tiền hoàn (luôn dương, BigInt = đồng).
 */
export interface RefundInput {
  /** Tenant sở hữu refund */
  tenantId: string;

  /** ID của giao dịch gốc bị hoàn tiền (ví dụ PaymentTransaction.id) */
  originalReferenceId: string;

  /** Số tiền hoàn (BigInt, luôn dương, đơn vị đồng) */
  amount: bigint;

  /** Mô tả lý do hoàn tiền */
  description?: string;

  /** Metadata bổ sung (ví dụ: user tạo refund, lý do, analytics tags) */
  metadata?: Record<string, unknown>;
}

/**
 * Kết quả trả về từ thao tác processRefundCredit.
 */
export interface RefundResult {
  /** Thành công hay thất bại */
  success: boolean;

  /** ID của RefundRecord (first-class entity) */
  refundRecordId: string;

  /** ID của LedgerTransaction (CREDIT) được tạo */
  transactionId: string;

  /** Số tiền đã hoàn */
  amount: bigint;

  /** Trạng thái của refund record */
  status: RefundStatus;

  /** Thông báo lỗi nếu có */
  error?: string;
}

/**
 * Kết quả kiểm tra tính toàn vẹn refund.
 * Được dùng bởi checkRefundIntegrity() để xác thực
 * trước khi thực hiện refund thật.
 */
export interface RefundIntegrityResult {
  /** Anti-over-refund có pass không? */
  pass: boolean;

  /** Số tiền gốc của giao dịch (từ PaymentTransaction) */
  originalAmount: bigint;

  /** Tổng số tiền đã refund thành công trước đó */
  totalRefunded: bigint;

  /** Số tiền yêu cầu refund lần này */
  requestedAmount: bigint;

  /** Số tiền còn lại có thể refund (= originalAmount - totalRefunded) */
  remainingAvailable: bigint;

  /** Chi tiết các bước kiểm tra (phục vụ debug/audit) */
  details: string[];
}

/**
 * VNPay SDK — Response code map (vnp_ResponseCode).
 *
 * Canonical mapping of VNPay `vnp_ResponseCode` values to a normalized status
 * and a human-readable Vietnamese message. Used by both the Return-URL handler
 * and the IPN verification path to interpret gateway outcomes consistently.
 *
 * Note: VNPay also exposes `vnp_TransactionStatus` with the same code space for
 * the *settlement* outcome. `'00'` means success in both fields; a transaction
 * is only truly successful when BOTH are `'00'`.
 *
 * Reference: https://sandbox.vnpayment.vn/apis/docs/bang-ma-loi/
 */

export type VnpayResultStatus =
  | 'success'
  | 'pending'
  | 'failed'
  | 'cancelled'
  | 'fraud'
  | 'error';

export interface VnpayResultCodeEntry {
  /** The raw vnp_ResponseCode value (kept as string to preserve leading zeros). */
  code: string;
  status: VnpayResultStatus;
  /** Whether the customer can meaningfully retry the same intent. */
  retryable: boolean;
  message: string;
}

/** Full lookup table keyed by vnp_ResponseCode. */
export const VNPAY_RESPONSE_CODES: Record<string, VnpayResultCodeEntry> = {
  '00': {
    code: '00',
    status: 'success',
    retryable: false,
    message: 'Giao dịch thành công.',
  },
  '07': {
    code: '07',
    status: 'fraud',
    retryable: false,
    message:
      'Trừ tiền thành công. Giao dịch bị nghi ngờ (liên quan tới gian lận, giao dịch bất thường).',
  },
  '09': {
    code: '09',
    status: 'failed',
    retryable: true,
    message:
      'Thẻ/Tài khoản chưa đăng ký dịch vụ InternetBanking tại ngân hàng.',
  },
  '10': {
    code: '10',
    status: 'failed',
    retryable: true,
    message:
      'Xác thực thông tin thẻ/tài khoản không đúng quá 3 lần.',
  },
  '11': {
    code: '11',
    status: 'cancelled',
    retryable: true,
    message: 'Đã hết hạn chờ thanh toán. Vui lòng thực hiện lại giao dịch.',
  },
  '12': {
    code: '12',
    status: 'failed',
    retryable: false,
    message: 'Thẻ/Tài khoản bị khóa.',
  },
  '13': {
    code: '13',
    status: 'failed',
    retryable: true,
    message:
      'Nhập sai mật khẩu xác thực giao dịch (OTP). Vui lòng thực hiện lại giao dịch.',
  },
  '24': {
    code: '24',
    status: 'cancelled',
    retryable: true,
    message: 'Khách hàng hủy giao dịch.',
  },
  '51': {
    code: '51',
    status: 'failed',
    retryable: false,
    message: 'Tài khoản không đủ số dư để thực hiện giao dịch.',
  },
  '65': {
    code: '65',
    status: 'failed',
    retryable: false,
    message: 'Tài khoản đã vượt quá hạn mức giao dịch trong ngày.',
  },
  '75': {
    code: '75',
    status: 'pending',
    retryable: true,
    message: 'Ngân hàng thanh toán đang bảo trì.',
  },
  '79': {
    code: '79',
    status: 'failed',
    retryable: true,
    message:
      'Nhập sai mật khẩu thanh toán quá số lần quy định. Vui lòng thực hiện lại giao dịch.',
  },
  '99': {
    code: '99',
    status: 'error',
    retryable: true,
    message: 'Lỗi không xác định (other reasons).',
  },
  '01': {
    code: '01',
    status: 'failed',
    retryable: false,
    message: 'Giao dịch chưa hoàn tất.',
  },
  '02': {
    code: '02',
    status: 'failed',
    retryable: false,
    message: 'Giao dịch bị lỗi.',
  },
  '04': {
    code: '04',
    status: 'failed',
    retryable: false,
    message:
      'Giao dịch đảo (khách hàng đã bị trừ tiền tại ngân hàng nhưng GD chưa thành công ở VNPay).',
  },
  '05': {
    code: '05',
    status: 'pending',
    retryable: true,
    message: 'VNPay đang xử lý giao dịch (GD hoàn tiền).',
  },
  '06': {
    code: '06',
    status: 'pending',
    retryable: true,
    message:
      'VNPay đã gửi yêu cầu hoàn tiền sang ngân hàng (GD hoàn tiền).',
  },
};

const UNKNOWN_ENTRY: VnpayResultCodeEntry = {
  code: '__unknown__',
  status: 'error',
  retryable: false,
  message: 'Mã phản hồi VNPay không xác định.',
};

/** Resolve a response code to its entry, falling back to a safe unknown entry. */
export function resolveVnpayResponseCode(
  code: string | undefined,
): VnpayResultCodeEntry {
  if (!code) return { ...UNKNOWN_ENTRY };
  return VNPAY_RESPONSE_CODES[code] ?? { ...UNKNOWN_ENTRY, code };
}

/** Convenience: true only for the definitive success code '00'. */
export function isVnpaySuccess(code: string | undefined): boolean {
  return code === '00';
}

/** Convenience: true when the outcome is still in flight. */
export function isVnpayPending(code: string | undefined): boolean {
  return resolveVnpayResponseCode(code).status === 'pending';
}

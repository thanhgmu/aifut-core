/**
 * MoMo Wallet SDK — Result code map.
 *
 * Canonical mapping of MoMo AIO v2 `resultCode` values to a normalized
 * status and a human-readable Vietnamese message. Used by both create-payment
 * response handling and IPN verification to interpret gateway outcomes
 * consistently.
 *
 * Reference: https://developers.momo.vn/v3/docs/payment/api/result-handling/resultcode
 */

export type MomoResultStatus =
  | 'success'
  | 'pending'
  | 'failed'
  | 'refunded'
  | 'cancelled'
  | 'error';

export interface MomoResultCodeEntry {
  code: number;
  status: MomoResultStatus;
  /** Whether the transaction may still transition (e.g. user not yet paid). */
  retryable: boolean;
  message: string;
}

/** Full lookup table keyed by MoMo resultCode. */
export const MOMO_RESULT_CODES: Record<number, MomoResultCodeEntry> = {
  0: { code: 0, status: 'success', retryable: false, message: 'Giao dịch thành công.' },
  9000: {
    code: 9000,
    status: 'pending',
    retryable: true,
    message: 'Giao dịch được xác nhận thành công, đang chờ trừ tiền.',
  },
  8000: {
    code: 8000,
    status: 'pending',
    retryable: true,
    message: 'Giao dịch đang được xử lý.',
  },
  7000: {
    code: 7000,
    status: 'pending',
    retryable: true,
    message: 'Giao dịch đang được xử lý.',
  },
  7002: {
    code: 7002,
    status: 'pending',
    retryable: true,
    message: 'Giao dịch đang được xử lý bởi nhà cung cấp thanh toán.',
  },
  1000: {
    code: 1000,
    status: 'pending',
    retryable: true,
    message: 'Giao dịch đã được khởi tạo, chờ người dùng xác nhận thanh toán.',
  },
  10: { code: 10, status: 'error', retryable: false, message: 'Hệ thống đang bảo trì.' },
  11: { code: 11, status: 'error', retryable: false, message: 'Truy cập bị từ chối.' },
  12: {
    code: 12,
    status: 'error',
    retryable: false,
    message: 'Phiên bản API không được hỗ trợ.',
  },
  13: {
    code: 13,
    status: 'error',
    retryable: false,
    message: 'Xác thực doanh nghiệp thất bại.',
  },
  20: {
    code: 20,
    status: 'failed',
    retryable: false,
    message: 'Yêu cầu sai định dạng (bad format).',
  },
  21: {
    code: 21,
    status: 'failed',
    retryable: false,
    message: 'Số tiền giao dịch không hợp lệ.',
  },
  22: {
    code: 22,
    status: 'failed',
    retryable: false,
    message: 'Số tiền giao dịch nằm ngoài giới hạn cho phép.',
  },
  40: { code: 40, status: 'failed', retryable: false, message: 'RequestId bị trùng.' },
  41: { code: 41, status: 'failed', retryable: false, message: 'OrderId bị trùng.' },
  42: {
    code: 42,
    status: 'failed',
    retryable: false,
    message: 'OrderId không hợp lệ hoặc không tồn tại.',
  },
  43: {
    code: 43,
    status: 'failed',
    retryable: false,
    message: 'Xung đột giao dịch — đang có giao dịch khác xử lý cùng orderId.',
  },
  45: { code: 45, status: 'failed', retryable: false, message: 'Trùng lặp ItemId.' },
  47: {
    code: 47,
    status: 'failed',
    retryable: false,
    message: 'Dữ liệu yêu cầu không hợp lệ trong danh sách cho phép.',
  },
  98: {
    code: 98,
    status: 'failed',
    retryable: true,
    message: 'QR Code tạo không thành công. Vui lòng thử lại.',
  },
  99: {
    code: 99,
    status: 'error',
    retryable: true,
    message: 'Lỗi không xác định.',
  },
  1001: {
    code: 1001,
    status: 'failed',
    retryable: false,
    message: 'Giao dịch thất bại do tài khoản người dùng không đủ tiền.',
  },
  1002: {
    code: 1002,
    status: 'failed',
    retryable: false,
    message: 'Giao dịch bị từ chối bởi nhà phát hành tài khoản thanh toán.',
  },
  1003: {
    code: 1003,
    status: 'cancelled',
    retryable: false,
    message: 'Giao dịch bị hủy do người dùng hủy hoặc quá hạn xác nhận.',
  },
  1004: {
    code: 1004,
    status: 'failed',
    retryable: false,
    message: 'Giao dịch thất bại do vượt hạn mức thanh toán.',
  },
  1005: {
    code: 1005,
    status: 'failed',
    retryable: false,
    message: 'Giao dịch thất bại do URL hoặc QR code đã hết hạn.',
  },
  1006: {
    code: 1006,
    status: 'cancelled',
    retryable: false,
    message: 'Giao dịch thất bại do người dùng từ chối xác nhận thanh toán.',
  },
  1007: {
    code: 1007,
    status: 'failed',
    retryable: false,
    message: 'Giao dịch bị từ chối do tài khoản không tồn tại hoặc đang bị khóa.',
  },
  2001: {
    code: 2001,
    status: 'failed',
    retryable: false,
    message: 'Giao dịch thất bại do sai thông tin liên kết.',
  },
  4001: {
    code: 4001,
    status: 'failed',
    retryable: false,
    message: 'Tài khoản người dùng bị hạn chế.',
  },
  4100: {
    code: 4100,
    status: 'failed',
    retryable: false,
    message: 'Giao dịch thất bại do người dùng chưa đăng nhập thành công.',
  },
};

const UNKNOWN_ENTRY: MomoResultCodeEntry = {
  code: -1,
  status: 'error',
  retryable: false,
  message: 'Mã phản hồi MoMo không xác định.',
};

/** Resolve a result code to its entry, falling back to a safe unknown entry. */
export function resolveMomoResultCode(code: number): MomoResultCodeEntry {
  return MOMO_RESULT_CODES[code] ?? { ...UNKNOWN_ENTRY, code };
}

/** Convenience: true only for the definitive success code 0. */
export function isMomoSuccess(code: number): boolean {
  return code === 0;
}

/** Convenience: true when the outcome is still in flight. */
export function isMomoPending(code: number): boolean {
  return resolveMomoResultCode(code).status === 'pending';
}

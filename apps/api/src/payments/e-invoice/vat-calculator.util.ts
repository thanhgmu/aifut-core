/**
 * VAT Calculator Utility
 * ======================
 * Hàm tính toán thuế GTGT, phân tách net/gross, tra cứu đa thuế suất,
 * và chuyển số tiền thành chữ bằng tiếng Việt.
 *
 * Tuân thủ Thông tư 78/2021/TT-BTC và Nghị định 123/2020/ND-CP.
 */

// ---------------------------------------------------------------------------
// 1. Đa thuế suất chuẩn Việt Nam
// ---------------------------------------------------------------------------

/** Danh sách các thuế suất GTGT hợp lệ tại Việt Nam (%). */
export const VAT_RATES = [10, 8, 5, 0] as const;

export type VatRate = (typeof VAT_RATES)[number];

/** Mô tả ngắn từng mức thuế suất (song ngữ). */
export const VAT_RATE_LABELS: Record<VatRate, { vi: string; en: string }> = {
  10: { vi: 'Thuế suất 10% (hàng hóa, dịch vụ thông thường)', en: '10% standard rate' },
  8: { vi: 'Thuế suất 8% (giảm thuế theo NQ 43/2022/QH15)', en: '8% reduced rate (NQ 43/2022/QH15)' },
  5: { vi: 'Thuế suất 5% (hàng hóa, dịch vụ thiết yếu)', en: '5% reduced rate (essential goods)' },
  0: { vi: 'Thuế suất 0% (xuất khẩu, vận tải quốc tế)', en: '0% zero rate (export, intl. transport)' },
};

// ---------------------------------------------------------------------------
// 2. Split Net / VAT từ Gross
// ---------------------------------------------------------------------------

export interface VatSplitResult {
  /** Tiền hàng chưa thuế (net). */
  net: number;
  /** Tiền thuế GTGT. */
  vat: number;
  /** Tổng tiền bao gồm thuế (gross). */
  gross: number;
  /** Thuế suất áp dụng (0-100). */
  rate: number;
  /** Tỷ lệ thập phân (rate / 100). */
  rateDecimal: number;
}

/**
 * Phân tách tổng tiền (gross) thành net + vat dựa trên thuế suất.
 *
 * Công thức:
 *   net   = gross / (1 + rate/100)
 *   vat   = gross - net
 *
 * Làm tròn 2 chữ số thập phân theo quy tắc thương mại (round half-up).
 *
 * @param gross - Tổng tiền bao gồm thuế.
 * @param rate  - Thuế suất phần trăm (mặc định 10).
 */
export function splitVat(gross: number, rate: VatRate = 10): VatSplitResult {
  if (gross < 0) throw new Error(`Gross amount must be non-negative, got ${gross}`);
  if (!VAT_RATES.includes(rate)) throw new Error(`Invalid VAT rate: ${rate}. Allowed: ${VAT_RATES.join(', ')}`);

  const rateDecimal = rate / 100;
  const net = gross / (1 + rateDecimal);
  const vat = gross - net;

  // Làm tròn 2 chữ số thập phân
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    net: round2(net),
    vat: round2(vat),
    gross: round2(gross),
    rate,
    rateDecimal,
  };
}

/**
 * Tính gross từ net + thuế suất.
 *
 * @param net  - Tiền hàng chưa thuế.
 * @param rate - Thuế suất phần trăm.
 */
export function applyVat(net: number, rate: VatRate = 10): VatSplitResult {
  if (net < 0) throw new Error(`Net amount must be non-negative, got ${net}`);
  if (!VAT_RATES.includes(rate)) throw new Error(`Invalid VAT rate: ${rate}. Allowed: ${VAT_RATES.join(', ')}`);

  const rateDecimal = rate / 100;
  const vat = net * rateDecimal;
  const gross = net + vat;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    net: round2(net),
    vat: round2(vat),
    gross: round2(gross),
    rate,
    rateDecimal,
  };
}

// ---------------------------------------------------------------------------
// 3. Chuyển số tiền thành chữ - Tiếng Việt
// ---------------------------------------------------------------------------

const VI_DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const VI_TEENS = ['mười', 'mười một', 'mười hai', 'mười ba', 'mười bốn', 'mười lăm', 'mười sáu', 'mười bảy', 'mười tám', 'mười chín'];
const VI_TENS = ['', '', 'hai mươi', 'ba mươi', 'bốn mươi', 'năm mươi', 'sáu mươi', 'bảy mươi', 'tám mươi', 'chín mươi'];
const VI_UNITS = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

/** Đọc một nhóm 3 chữ số (0-999). */
function readBlock3(n: number): string {
  if (n === 0) return '';
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let result = '';

  if (hundreds > 0) {
    result += VI_DIGITS[hundreds] + ' trăm';
    if (rest === 0) return result;
  }

  if (rest < 10) {
    if (hundreds > 0) result += ' linh';
    result += ' ' + VI_DIGITS[rest];
  } else if (rest < 20) {
    result += ' ' + VI_TEENS[rest - 10];
  } else {
    const tens = Math.floor(rest / 10);
    const ones = rest % 10;
    result += ' ' + VI_TENS[tens];
    if (ones === 1) {
      result += ' mốt';
    } else if (ones === 4) {
      result += ' tư';
    } else if (ones === 5) {
      result += ' lăm';
    } else if (ones > 0) {
      result += ' ' + VI_DIGITS[ones];
    }
  }

  return result.trim();
}

/**
 * Chuyển đổi số nguyên (0 – 999,999,999,999,999,999) thành chữ bằng tiếng Việt.
 *
 * @param num - Số cần chuyển (số nguyên không âm, tối đa 999.999 tỷ).
 * @returns Chuỗi chữ số bằng tiếng Việt.
 */
export function numberToVietnameseWords(num: number): string {
  if (!Number.isFinite(num)) throw new Error('Input must be a finite number');
  if (num < 0) throw new Error('Input must be non-negative');
  if (num > 999_999_999_999_999_999) throw new Error('Input exceeds maximum supported value (999.999.999.999.999.999)');

  if (num === 0) return 'không đồng';

  // Làm tròn 2 chữ số thập phân
  const rounded = Math.round(num * 100) / 100;
  const integerPart = Math.floor(rounded);
  const decimalPart = Math.round((rounded - integerPart) * 100);

  // Đọc phần nguyên
  let result = '';

  if (integerPart > 0) {
    // Chia thành các nhóm 3 chữ số
    const groups: number[] = [];
    let remaining = integerPart;
    while (remaining > 0) {
      groups.push(remaining % 1000);
      remaining = Math.floor(remaining / 1000);
    }

    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i] === 0) continue;
      const blockText = readBlock3(groups[i]);
      if (blockText) {
        if (result) result += ' ';
        result += blockText;
        if (i > 0) {
          result += ' ' + VI_UNITS[i];
        }
      }
    }

    result += ' đồng';
  }

  // Đọc phần thập phân (hào, xu)
  if (decimalPart > 0) {
    if (integerPart > 0) result += ' ';
    result += numberToVietnameseWords(decimalPart).replace(' đồng', '');
    result += ' xu';
  }

  // Chuẩn hóa một số trường hợp đặc biệt
  result = result
    .replace(/\bmột mươi\b/g, 'mười')
    .replace(/\bmười một\b/g, 'mười một')
    .replace(/\bkhông trăm linh không\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Viết hoa chữ cái đầu tiên
  result = result.charAt(0).toUpperCase() + result.slice(1);

  return result;
}

// ---------------------------------------------------------------------------
// 4. Tiện ích phụ trợ
// ---------------------------------------------------------------------------

/**
 * Map thuế suất theo mã ngành hàng.
 * Có thể mở rộng thành lookup DB hoặc cấu hình tenant.
 */
const CATEGORY_VAT_MAP: Record<string, VatRate> = {
  // Hàng hóa, dịch vụ thông thường
  general: 10,
  // Thực phẩm, nông sản chưa qua chế biến
  food_raw: 5,
  // Dịch vụ y tế, giáo dục
  healthcare: 5,
  education: 5,
  // Hàng xuất khẩu
  export: 0,
  // Bảo hiểm, tín dụng
  insurance: 0,
  credit: 0,
  // Mức 8% tạm thời
  reduced: 8,
  // Vận tải quốc tế
  transport_intl: 0,
};

/**
 * Tra cứu thuế suất theo mã ngành hàng.
 *
 * @param category - Mã ngành hàng.
 * @param fallback - Thuế suất mặc định nếu không tìm thấy (mặc định 10).
 */
export function getVatRateForCategory(category: string, fallback: VatRate = 10): VatRate {
  return CATEGORY_VAT_MAP[category] ?? fallback;
}

/**
 * Chuẩn hóa số tiền theo quy tắc hóa đơn điện tử:
 * - Làm tròn 2 chữ số thập phân
 * - Trả về dạng string locale-agnostic
 */
export function formatInvoiceAmount(amount: number): string {
  return Math.round(amount * 100 / 100).toFixed(2);
}

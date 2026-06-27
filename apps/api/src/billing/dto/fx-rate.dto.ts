import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

/**
 * DTO truy vấn tỷ giá ngoại tệ Billing FX Rate
 *
 * Strict check:
 * - baseCurrency: bắt buộc, nằm trong danh sách hỗ trợ
 * - targetCurrency: bắt buộc, nằm trong danh sách hỗ trợ
 * - amount: optional, dùng cho cost estimation runtime
 */
const SUPPORTED_CURRENCIES = [
  'VND', 'USD', 'EUR', 'THB', 'IDR', 'MYR', 'PHP', 'SGD',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export class FxRateQueryDto {
  @IsString()
  @IsNotEmpty({ message: 'baseCurrency is required' })
  @IsIn(SUPPORTED_CURRENCIES, {
    message: `baseCurrency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
  })
  baseCurrency!: SupportedCurrency;

  @IsString()
  @IsNotEmpty({ message: 'targetCurrency is required' })
  @IsIn(SUPPORTED_CURRENCIES, {
    message: `targetCurrency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
  })
  targetCurrency!: SupportedCurrency;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'amount must be a positive number' })
  amount?: number;
}

/**
 * DTO response cho FX rate — trả về tỷ giá đã chuẩn hóa
 */
export class FxRateResponseDto {
  baseCurrency!: string;
  targetCurrency!: string;
  rate!: number;
  inverseRate!: number;
  updatedAt!: Date;

  /** Kết quả cost estimation nếu có amount */
  convertedAmount?: number;
  estimatedCost?: number;
}

/**
 * DTO tạo / cập nhật FX rate thủ công (admin)
 */
export class UpsertFxRateDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(SUPPORTED_CURRENCIES)
  baseCurrency!: SupportedCurrency;

  @IsString()
  @IsNotEmpty()
  @IsIn(SUPPORTED_CURRENCIES)
  targetCurrency!: SupportedCurrency;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001, { message: 'rate must be > 0' })
  rate!: number;

  @IsOptional()
  @IsString()
  tenantId?: string;
}

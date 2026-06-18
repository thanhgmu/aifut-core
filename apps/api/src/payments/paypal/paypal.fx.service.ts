/**
 * PayPal FX Service — Tỷ giá USD/VND 2 tầng + Cache TTL 1h.
 *
 * Chiến lược:
 *   Tầng 1 — Cấu hình (mặc định, deterministic): đọc PAYPAL_USD_VND_RATE từ env.
 *   Tầng 2 — Provider (tùy chọn, khi PAYPAL_FX_PROVIDER_URL được set): gọi URL
 *            provider với cache TTL 1h, fallback về config khi lỗi.
 *
 * Spread 1% (cấu hình qua PAYPAL_SPREAD_RATE) được cộng vào baseRate để ra
 * effectiveRate — tỷ giá user thực chịu trên UI (dùng create-order hiển thị).
 *
 * AIFUT stores money internally as BigInt in smallest unit (VND * 100).
 * FX rate multiply uses Number safely (amounts well within SAFE_INTEGER),
 * then rounds back.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PayPalConfig } from './paypal.config';
import { resolveSpreadRate } from './paypal.utils';
import type { FxRateResult } from './paypal.types';

/** Cache TTL mặc định: 1 giờ. */
const DEFAULT_TTL_MS = 60 * 60 * 1000;
/** Timeout HTTP cho fetch provider. */
const FETCH_TIMEOUT_MS = 5_000;

interface CacheEntry {
  rate: number;
  fetchedAt: number;
}

@Injectable()
export class PayPalFxService {
  private readonly logger = new Logger(PayPalFxService.name);
  private cache: CacheEntry | null = null;

  constructor(private readonly config: PayPalConfig) {}

  /**
   * Trả về tỷ giá hiệu lực USD/VND.
   *
   * Returns:
   *   baseRate       = VND per 1 USD (provider hoặc env PAYPAL_USD_VND_RATE).
   *   spreadRate     = resolveSpreadRate() (mặc định 0.01 → 1%).
   *   effectiveRate  = baseRate * (1 + spreadRate) — tỷ giá user thực chịu.
   *
   * Không bao giờ ném lỗi — fallback về config tĩnh khi provider lỗi.
   */
  async getUsdVndRate(): Promise<FxRateResult> {
    const creds = this.config.tryGet();
    let baseRate = creds?.usdVndRate ?? 25400;
    let source: 'config' | 'provider' = 'config';

    // Tầng 2 — provider (tùy chọn, chỉ chạy khi được cấu hình)
    if (creds?.fxProviderUrl) {
      try {
        const liveRate = await this.fetchProviderRate(creds.fxProviderUrl);
        if (liveRate !== null && Number.isFinite(liveRate) && liveRate > 0) {
          baseRate = liveRate;
          source = 'provider';
        }
      } catch (err) {
        this.logger.warn(
          `FX provider fallback to config: ${(err as Error).message}`,
        );
      }
    }

    const spreadRate = resolveSpreadRate();
    const effectiveRate = Math.round(baseRate * (1 + spreadRate) * 100) / 100;

    return {
      base: 'USD',
      quote: 'VND',
      baseRate,
      spreadRate,
      effectiveRate,
      source,
      asOf: new Date().toISOString(),
    };
  }

  /**
   * Fetch tỷ giá từ provider URL với cache TTL 1h.
   *
   * Kỳ vọng response JSON chứa trường `conversion_rate` (float).
   * Ví dụ: { "conversion_rate": 25450 }.
   *
   * Fallback an toàn:
   *   - Cache còn hạn → trả về cache (không gọi mạng).
   *   - Network/parse lỗi → trả về null (caller fallback config tĩnh).
   *   - Không throw — mọi lỗi được log và trả về null.
   */
  private async fetchProviderRate(url: string): Promise<number | null> {
    // Cache TTL guard
    if (
      this.cache &&
      Date.now() - this.cache.fetchedAt < DEFAULT_TTL_MS
    ) {
      return this.cache.rate;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        this.logger.warn(`FX provider HTTP ${res.status} for ${url}`);
        return null;
      }
      const json = (await res.json()) as Record<string, unknown>;
      const raw = json['conversion_rate'] as number | undefined;
      if (raw === undefined || !Number.isFinite(raw) || raw <= 0) {
        this.logger.warn(
          `FX provider invalid response for ${url}: conversion_rate=${raw}`,
        );
        return null;
      }
      this.cache = { rate: raw, fetchedAt: Date.now() };
      return raw;
    } catch (err) {
      this.logger.warn(
        `FX provider fetch error for ${url}: ${(err as Error).message}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Xoá cache (hữu ích cho test hoặc force refresh từ admin). */
  clearCache(): void {
    this.cache = null;
  }
}

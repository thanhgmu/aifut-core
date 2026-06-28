// ═══════════════════════════════════════════════════════════════════════════
// analytics-cron.service.ts — Scheduled Analytics Jobs
// ═══════════════════════════════════════════════════════════════════════════
// Điều phối các tác vụ analytics định kỳ:
//   • handleHourlyAggregation — Mỗi giờ, tổng hợp dữ liệu vào TenantAnalyticsSummary
//   • handleDailyPlatformBenchmark — Mỗi ngày, tính benchmark toàn sàn
//   • handleHourlyAnomalyDetection — Mỗi giờ, phát hiện bất thường (statistical)
//   • handleDailyDeepAnomalyDetection — Mỗi ngày, phân tích sâu (DAILY period, MA window rộng)
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsBiService } from './analytics-bi.service';
import { AnomalyDetectorService } from './anomaly-detector.service';

@Injectable()
export class AnalyticsCronService {
  private readonly logger = new Logger(AnalyticsCronService.name);

  constructor(
    private readonly analytics: AnalyticsBiService,
    private readonly anomalyDetector: AnomalyDetectorService,
  ) {}

  /**
   * handleHourlyAggregation
   * ───────────────────────
   * Gọi mỗi giờ — tổng hợp dữ liệu từ WorkflowExecution, AiUsageEvent,
   * Invoice, Session → ghi vào TenantAnalyticsSummary.
   */
  async handleHourlyAggregation(): Promise<void> {
    this.logger.log('Running hourly analytics aggregation via cron...');
    try {
      const result = await this.analytics.aggregateHourly();
      this.logger.log(`Hourly aggregation done: ${result.tenantsProcessed} tenants`);
    } catch (err: any) {
      this.logger.error(`Hourly aggregation failed: ${err.message}`);
    }
  }

  /**
   * handleDailyPlatformBenchmark
   * ────────────────────────────
   * Gọi mỗi ngày — tính toán benchmark toàn sàn theo industry.
   */
  async handleDailyPlatformBenchmark(): Promise<void> {
    this.logger.log('Running daily platform benchmark via cron...');
    try {
      const result = await this.analytics.computePlatformBenchmarks();
      this.logger.log(`Daily benchmark done: ${result.metricsComputed} metrics`);
    } catch (err: any) {
      this.logger.error(`Daily benchmark failed: ${err.message}`);
    }
  }

  /**
   * handleHourlyAnomalyDetection
   * ────────────────────────────
   * Gọi mỗi giờ (sau aggregation) — chạy anomaly detection trên HOURLY data.
   * Dùng history window 48h, z-score + IQR + moving average.
   * Ưu tiên phát hiện spike cost/token/execution.
   */
  async handleHourlyAnomalyDetection(): Promise<void> {
    this.logger.log('Running hourly anomaly detection via cron...');
    try {
      const result = await this.anomalyDetector.runAllTenantDetection({
        period: 'HOURLY',
        historyWindow: 48,
      });
      this.logger.log(
        `Hourly anomaly detection done: ${result.totalAnomalies} anomalies ` +
        `across ${result.tenantsChecked} tenants (${result.errors} errors)`,
      );
    } catch (err: any) {
      this.logger.error(`Hourly anomaly detection failed: ${err.message}`);
    }
  }

  /**
   * handleDailyDeepAnomalyDetection
   * ────────────────────────────────
   * Gọi mỗi ngày — phân tích sâu hơn trên DAILY data.
   * Dùng history window 30 ngày, phát hiện trend shift, revenue drop, idle tenant.
   * Không giới hạn severity (bắt cả LOW anomalies để gom báo cáo).
   */
  async handleDailyDeepAnomalyDetection(): Promise<void> {
    this.logger.log('Running daily deep anomaly detection via cron...');
    try {
      const result = await this.anomalyDetector.runAllTenantDetection({
        period: 'DAILY',
        historyWindow: 30,
        movingAvgRatio: {
          upper: 1.8,   // Nhạy hơn hourly (1.8x vs 2.0x)
          lower: 0.2,   // Drop > 80% so với MA
        },
      });
      this.logger.log(
        `Daily deep anomaly detection done: ${result.totalAnomalies} anomalies ` +
        `across ${result.tenantsChecked} tenants`,
      );
    } catch (err: any) {
      this.logger.error(`Daily deep anomaly detection failed: ${err.message}`);
    }
  }
}

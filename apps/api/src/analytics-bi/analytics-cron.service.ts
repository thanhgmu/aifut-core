import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsBiService } from './analytics-bi.service';

@Injectable()
export class AnalyticsCronService {
  private readonly logger = new Logger(AnalyticsCronService.name);

  constructor(private readonly analytics: AnalyticsBiService) {}

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
}

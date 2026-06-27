import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AnalyticsBiService } from './analytics-bi.service';
import { AnalyticsBiController } from './analytics-bi.controller';
import { AnalyticsCronService } from './analytics-cron.service';

/**
 * AnalyticsBiModule
 * ─────────────────
 * Cross-Tenant BI Analytics Engine.
 * Cung cấp:
 *   - Hourly/Daily aggregation từ các bảng nguồn
 *   - Platform benchmark theo industry
 *   - Anomaly detection (interface for cron)
 *   - Tenant health scoring & revenue analytics
 *
 * Export: AnalyticsBiService + AnalyticsCronService để các module khác
 * (vd: Admin Dashboard) tái sử dụng analytics data.
 */
@Module({
  controllers: [AnalyticsBiController],
  providers: [
    PrismaService,
    AnalyticsBiService,
    AnalyticsCronService,
  ],
  exports: [
    AnalyticsBiService,
    AnalyticsCronService,
  ],
})
export class AnalyticsBiModule {}

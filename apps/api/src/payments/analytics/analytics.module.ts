// ============================================================================
// payments/analytics/analytics.module.ts
// Dùng gói phần tích AI Cost Analytics (Batch 1).
// ============================================================================

import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AnalyticsBiModule } from '../../analytics-bi/analytics-bi.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsCronService } from '../../analytics-bi/analytics-cron.service';

@Module({
  imports: [AnalyticsBiModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, PrismaService, AnalyticsCronService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

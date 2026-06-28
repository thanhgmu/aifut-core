import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AnalyticsBiService } from './analytics-bi.service';
import { AnalyticsBiController } from './analytics-bi.controller';
import { AnalyticsCronService } from './analytics-cron.service';
import { AnomalyDetectorService } from './anomaly-detector.service';
import { RecommendationService } from './recommendation.service';

/**
 * AnalyticsBiModule
 * ─────────────────
 * Cross-Tenant BI Analytics Engine.
 * Cung cấp:
 *   - Hourly/Daily aggregation từ các bảng nguồn
 *   - Platform benchmark theo industry
 *   - Anomaly detection (statistical: z-score, IQR, moving avg)
 *   - Predictive recommendation (collaborative + content-based)
 *   - Tenant health scoring & revenue analytics
 *   - Anomaly record CRUD & notification
 *
 * Export: AnalyticsBiService + AnalyticsCronService + AnomalyDetectorService
 * + RecommendationService để các module khác tái sử dụng.
 */
@Module({
  controllers: [AnalyticsBiController],
  providers: [
    PrismaService,
    AnalyticsBiService,
    AnalyticsCronService,
    AnomalyDetectorService,
    RecommendationService,
  ],
  exports: [
    AnalyticsBiService,
    AnalyticsCronService,
    AnomalyDetectorService,
    RecommendationService,
  ],
})
export class AnalyticsBiModule {}

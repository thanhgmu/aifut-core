// ============================================================================
// payments/analytics/analytics.module.ts
// Đóng gói phân hệ AI Cost Analytics (Batch 1).
// ============================================================================

import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, PrismaService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

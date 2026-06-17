// ============================================================
// reconciliation.module.ts — Financial Reconciliation Module
// ============================================================
// Đóng gói toàn bộ phân hệ đối soát tài chính.
// Bao gồm:
//   - ReconciliationService     — Engine lõi audit loop
//   - DiscrepancyResolverService — Anti-fraud + freeze wallet
//   - FinancialReportExporterService — CSV stream export
//   - ReportSchedulerService    — 5 cron jobs định kỳ
//   - ReconciliationController  — 12 REST endpoints
//
// Module này được imports bởi PaymentsModule.
// Không export PrismaService (đã có từ LedgerModule Global).
// ============================================================

import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ReconciliationService } from './reconciliation.service';
import { DiscrepancyResolverService } from './discrepancy-resolver.service';
import { FinancialReportExporterService } from './financial-report-exporter.service';
import { ReportSchedulerService } from './report-scheduler.service';
import { ReconciliationController } from './reconciliation.controller';

@Module({
  controllers: [ReconciliationController],
  providers: [
    ReconciliationService,
    DiscrepancyResolverService,
    FinancialReportExporterService,
    ReportSchedulerService,
    PrismaService,
  ],
  exports: [
    ReconciliationService,
    DiscrepancyResolverService,
    FinancialReportExporterService,
  ],
})
export class ReconciliationModule {}

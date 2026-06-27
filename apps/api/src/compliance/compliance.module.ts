// ═══════════════════════════════════════════════════════════════════════════
// compliance.module.ts — Compliance & Audit Trail Module
// ═══════════════════════════════════════════════════════════════════════════
// Audit log viewer, compliance reports, data export (CSV/JSON).

import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ComplianceService } from './compliance.service';
import { ComplianceController } from './compliance.controller';

@Module({
  controllers: [ComplianceController],
  providers: [PrismaService, ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}

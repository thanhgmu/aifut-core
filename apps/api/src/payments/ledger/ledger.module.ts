// ============================================================
// ledger.module.ts — Wallet Ledger Module
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: Đóng gói LedgerService, LedgerController và
// LedgerDebitInterceptor. Export LedgerService để các module
// khác (billing, marketplace, reseller, affiliate) có thể
// debit/credit wallet của tenant.
// ============================================================

import { Module, Global } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { LedgerDebitInterceptor } from './ledger-debit.interceptor';
import { PrismaService } from '../../prisma.service';

@Global()
@Module({
  controllers: [LedgerController],
  providers: [
    LedgerService,
    LedgerDebitInterceptor,
    PrismaService,
  ],
  exports: [
    LedgerService,
    LedgerDebitInterceptor,
  ],
})
export class LedgerModule {}

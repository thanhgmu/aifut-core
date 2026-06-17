// ============================================================
// ledger.module.ts — Wallet Ledger Module
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: Đóng gói LedgerService, LedgerController, LedgerDebitInterceptor
// và LedgerNotificationService (cảnh báo số dư thấp). Export LedgerService
// + LedgerNotificationService để các module khác (billing, marketplace,
// reseller, affiliate) có thể debit/credit wallet và tái dùng dispatcher.
// ============================================================

import { Module, Global } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { LedgerDebitInterceptor } from './ledger-debit.interceptor';
import { LedgerNotificationService } from './ledger-notification.service';
import { PrismaService } from '../../prisma.service';

@Global()
@Module({
  controllers: [LedgerController],
  providers: [
    LedgerService,
    LedgerDebitInterceptor,
    LedgerNotificationService,
    PrismaService,
  ],
  exports: [
    LedgerService,
    LedgerNotificationService,
    LedgerDebitInterceptor,
  ],
})
export class LedgerModule {}

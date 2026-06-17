// ============================================================
// ledger.module.ts — Wallet Ledger Module
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: Đóng gói LedgerService, LedgerController, LedgerDebitInterceptor,
// LedgerNotificationService (cảnh báo số dư thấp).
// Export LedgerService + LedgerNotificationService để các module khác
// (billing, marketplace, reseller, affiliate) có thể debit/credit wallet
// và tái dùng dispatcher.
//
// Phase 3 bổ sung:
//   - LedgerRefundService   : xử lý hoàn tiền qua wallet ledger
//   - LedgerRefundController: endpoint POST /billing/refund/request
//   - RefundWebhookRouter   : đấu nối webhook Stripe 'charge.refunded'
//                             + MoMo refund callback
//   - RefundReconciliationService: poller đối soát PENDING quá 15 phút
// ============================================================

import { Module, Global } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { LedgerRefundController } from './ledger-refund.controller';
import { LedgerDebitInterceptor } from './ledger-debit.interceptor';
import { LedgerNotificationService } from './ledger-notification.service';
import { LedgerRefundService } from './ledger-refund.service';
import { RefundWebhookRouter } from './refund-webhook.router';
import { RefundReconciliationService } from './refund-reconciliation.service';
import { PrismaService } from '../../prisma.service';

@Global()
@Module({
  controllers: [
    LedgerController,
    LedgerRefundController,
  ],
  providers: [
    LedgerService,
    LedgerDebitInterceptor,
    LedgerNotificationService,
    LedgerRefundService,
    RefundWebhookRouter,
    RefundReconciliationService,
    PrismaService,
  ],
  exports: [
    LedgerService,
    LedgerNotificationService,
    LedgerRefundService,
    RefundWebhookRouter,
  ],
})
export class LedgerModule {}

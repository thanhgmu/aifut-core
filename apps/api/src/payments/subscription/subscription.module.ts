// ================================================================
// subscription.module.ts — Subscription Module
// ================================================================
// Module: apps/api/src/payments/subscription
//
// Đóng gói toàn bộ phân hệ quản lý gói cước:
//   - SubscriptionService          : nâng cấp / hạ cấp / hủy gói + read-only
//                                     view (prorated pricing, ledger, invoice,
//                                     getCurrentSubscriptionDetails)
//   - SubscriptionController       : REST mutation /billing/subscription/* (POST)
//   - SubscriptionQueryController  : REST read-only /billing/subscription/* (GET)
//   - SubscriptionIdorProvider     : phân giải + xác thực tenant từ header
//                                     (lớp chống IDOR thống nhất)
//   - PlanGuard                    : guard kiểm tra hạn ngạch tài nguyên
//   - PlanConfig / PlanDefinition  : cấu hình gói cước (free→enterprise)
//
// Phụ thuộc: LedgerModule (wallet debit/credit), PrismaService.
//
// Import vào PaymentsModule để đăng ký vào hệ thống API chính.
// ================================================================

import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionQueryController } from './subscription.query.controller';
import { SubscriptionIdorProvider } from './subscription.idor.provider';
import { PlanGuard } from './plan.guard';
import { PrismaService } from '../../prisma.service';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  controllers: [
    SubscriptionController, // mutation: POST upgrade + cancel
    SubscriptionQueryController, // query: GET current + plans + prorate
  ],
  providers: [
    SubscriptionService,
    PlanGuard,
    SubscriptionIdorProvider,
    PrismaService,
  ],
  exports: [SubscriptionService, PlanGuard, SubscriptionIdorProvider],
})
export class SubscriptionModule {}

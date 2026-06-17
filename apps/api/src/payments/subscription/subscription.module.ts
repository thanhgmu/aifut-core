// ================================================================
// subscription.module.ts — Subscription Module
// ================================================================
// Module: apps/api/src/payments/subscription
//
// Đóng gói toàn bộ phân hệ quản lý gói cước:
//   - SubscriptionService       : xử lý nâng cấp / hạ cấp / hủy gói
//                                  (prorated pricing, ledger, invoice)
//   - SubscriptionController    : REST endpoints /billing/subscription/*
//   - PlanGuard                 : guard kiểm tra hạn ngạch tài nguyên
//   - PlanConfig / PlanDefinition: cấu hình gói cước (free→enterprise)
//
// Phụ thuộc: LedgerModule (wallet debit/credit), PrismaService.
//
// Import vào PaymentsModule để đăng ký vào hệ thống API chính.
// ================================================================

import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { PlanGuard } from './plan.guard';
import { PrismaService } from '../../prisma.service';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, PlanGuard, PrismaService],
  exports: [SubscriptionService, PlanGuard],
})
export class SubscriptionModule {}

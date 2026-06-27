import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { FxRateController } from './fx-rate.controller';
import { FxRateService } from './fx-rate.service';
import { TenancyModule } from '../tenancy.module';

/**
 * BillingModule — Quản lý thanh toán, đăng ký gói, tỷ giá ngoại tệ
 *
 * Import TenancyModule để dùng AccessPolicyGuard và PrismaService
 * (tránh duplicate provider instances).
 */
@Module({
  imports: [TenancyModule],
  controllers: [BillingController, FxRateController],
  providers: [
    BillingService,
    FxRateService,
  ],
  exports: [BillingService, FxRateService],
})
export class BillingModule {}

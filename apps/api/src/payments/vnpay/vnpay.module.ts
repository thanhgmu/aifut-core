/**
 * VNPay SDK — NestJS Module.
 *
 * Encapsulates the entire VNPay payment subsystem:
 *   - VnpayConfig        — environment-sourced credentials provider
 *   - VnpayService       — HMAC-SHA512 signing, payment URL creation,
 *                          IPN/Return callback verification
 *   - VnpayIpnGuard      — 3-layer idempotency guard
 *   - VnpayController    — 5 HTTP endpoints under /payments/vnpay
 *
 * Import this module into PaymentsModule (or AppModule) to register the VNPay
 * payment gateway. The module bootstraps cleanly in unconfigured environments
 * (missing env vars); adapters should check `VnpayConfig.isConfigured` before
 * exposing payment UI.
 */

import { Module } from '@nestjs/common';
import { VnpayController } from './vnpay.controller';
import { VnpayService } from './vnpay.service';
import { VnpayConfig } from './vnpay.config';
import { VnpayIpnGuard } from './vnpay.ipn.guard';
import { SubscriptionActivatorService } from '../subscription-activator.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [VnpayController],
  providers: [
    VnpayService,
    VnpayConfig,
    VnpayIpnGuard,
    SubscriptionActivatorService,
    PrismaService,
  ],
  exports: [
    VnpayService,
    VnpayConfig,
    VnpayIpnGuard,
  ],
})
export class VnpayModule {}

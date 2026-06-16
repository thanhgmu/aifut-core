/**
 * MoMo Wallet SDK — NestJS Module.
 *
 * Encapsulates the entire MoMo payment subsystem:
 *   - MomoConfig       — environment-sourced credentials provider
 *   - MomoService      — HMAC signing, payment creation, IPN verification
 *   - MomoIpnGuard     — 3-layer idempotency guard
 *   - MomoController   — 5 HTTP endpoints under /payments/momo
 *
 * Import this module into PaymentsModule (or AppModule) to register the MoMo
 * payment gateway. The module bootstraps cleanly in unconfigured environments
 * (missing env vars); adapters should check `MomoConfig.isConfigured` before
 * exposing payment UI.
 */

import { Module } from '@nestjs/common';
import { MomoController } from './momo.controller';
import { MomoService } from './momo.service';
import { MomoConfig } from './momo.config';
import { MomoIpnGuard } from './momo.ipn.guard';
import { SubscriptionActivatorService } from '../subscription-activator.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [MomoController],
  providers: [
    MomoService,
    MomoConfig,
    MomoIpnGuard,
    SubscriptionActivatorService,
    PrismaService,
  ],
  exports: [
    MomoService,
    MomoConfig,
    MomoIpnGuard,
  ],
})
export class MomoModule {}

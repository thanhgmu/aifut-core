/**
 * PayPal Gateway SDK — NestJS Module.
 *
 * Encapsulates the entire PayPal payment subsystem:
 *   - PayPalConfig             — environment-sourced credentials provider + OAuth2 cache
 *   - PayPalService            — order creation, webhook handling, active reconciliation
 *   - PayPalIpnGuard           — 3-layer idempotency guard (CAS + Serializable tx)
 *   - PayPalController         — 5 HTTP endpoints under /payments/paypal
 *
 * Import this module into PaymentsModule (or AppModule) to register the PayPal
 * payment gateway. The module bootstraps cleanly in unconfigured environments
 * (missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET env vars); adapters should
 * check `PayPalConfig.isConfigured` before exposing payment UI.
 *
 * Dependencies (resolved from @Global() modules):
 *   - PrismaService (from LedgerModule, @Global)
 *   - LedgerService (from LedgerModule, @Global)
 *   - SubscriptionActivatorService (injected at PayPalService)
 */

import { Module } from '@nestjs/common';
import { PayPalController } from './paypal.controller';
import { PayPalService } from './paypal.service';
import { PayPalConfig } from './paypal.config';
import { PayPalIpnGuard } from './paypal.ipn.guard';
import { SubscriptionActivatorService } from '../subscription-activator.service';
import { PrismaService } from '../../prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerNotificationService } from '../ledger/ledger-notification.service';

@Module({
  controllers: [PayPalController],
  providers: [
    PayPalService,
    PayPalConfig,
    PayPalIpnGuard,
    SubscriptionActivatorService,
    PrismaService,
    LedgerService,
    LedgerNotificationService,
  ],
  exports: [
    PayPalService,
    PayPalConfig,
    PayPalIpnGuard,
  ],
})
export class PayPalModule {}

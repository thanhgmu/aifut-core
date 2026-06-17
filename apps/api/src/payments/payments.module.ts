import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { PaymentsWebhookService } from './payments-webhook.service';
import { SubscriptionActivatorService } from './subscription-activator.service';
import { InvoiceMailerService } from './e-invoice/invoice-mailer.service';
import { InvoiceOutboxProcessor } from './e-invoice/invoice-outbox.processor';
import { PrismaService } from '../prisma.service';
import { MomoModule } from './momo/momo.module';
import { VnpayModule } from './vnpay/vnpay.module';
import { PayPalModule } from './paypal/paypal.module';
import { LedgerModule } from './ledger/ledger.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';

@Module({
  imports: [
    MomoModule,
    VnpayModule,
    PayPalModule,
    LedgerModule,
    SubscriptionModule,
    ReconciliationModule,
  ],
  controllers: [PaymentsController, StripeWebhookController],
  providers: [
    PaymentsService,
    PaymentsWebhookService,
    SubscriptionActivatorService,
    InvoiceMailerService,
    InvoiceOutboxProcessor,
    PrismaService,
  ],
  exports: [
    PaymentsService,
    SubscriptionActivatorService,
    PaymentsWebhookService,
    InvoiceMailerService,
  ],
})
export class PaymentsModule {}

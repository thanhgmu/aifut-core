import { Module } from '@nestjs/common';
import { AiGovernanceModule } from './ai-governance.module';
import { AppController } from './app.controller';
import { AuditModule } from './audit.module';
import { BillingModule } from './billing/billing.module';
import { AuthModule } from './auth/auth.module';
import { BackupModule } from './backups/backup.module';
import { DeveloperModule } from './developer/developer.module';
import { ConnectorsModule } from './connectors.module';
import { EntitlementsModule } from './entitlements.module';
import { GlobalizationModule } from './globalization/globalization.module';
import { IntegrationsModule } from './integrations.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { MembershipsModule } from './memberships.module';
import { OrchestrationModule } from './orchestration.module';
import { TenancyModule } from './tenancy.module';
import { NotificationModule } from './notifications/notification.module';
import { WorkflowModule } from './workflows/workflow.module';

import { ResellerModule } from './reseller/reseller.module';
import { AffiliateModule } from './affiliate/affiliate.module';
import { BillingMeterController } from './billing-meter.controller';
import { AiBillingMeterService } from './ai-billing-meter.service';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { ApiKeyService } from './api-key.service';
import { ApiKeyController } from './api-key.controller';

@Module({
  imports: [
    TenancyModule,
    AiGovernanceModule,
    GlobalizationModule,
    OrchestrationModule,
    BillingModule,
    DeveloperModule,
    BackupModule,
    AuthModule,
    MembershipsModule,
    AuditModule,
    IntegrationsModule,
    MarketplaceModule,
    ResellerModule,
    ConnectorsModule,
    EntitlementsModule,
    NotificationModule,
    WorkflowModule,
    AffiliateModule,
    PaymentsModule,
  ],
  controllers: [AppController, BillingMeterController, SearchController, AnalyticsController, ApiKeyController],
  providers: [AiBillingMeterService, SearchService, AnalyticsService, ApiKeyService],
})
export class AppModule {}

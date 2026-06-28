import { Module } from '@nestjs/common';
import { AiGovernanceModule } from './ai-governance.module';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.module';
import { SandboxModule } from './sandbox/sandbox.module';
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
import { PaymentsModule } from './payments/payments.module';
import { CertificationModule } from './certification/certification.module';
import { AnalyticsBiModule } from './analytics-bi/analytics-bi.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { ComplianceModule } from './compliance/compliance.module';
import { LicensingModule } from './licensing/licensing.module';
import { ConsultantModule } from './consultant/consultant.module';
import { DataMarketplaceModule } from './data-marketplace/data-marketplace.module';
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
    CertificationModule,
    SandboxModule,
    AnalyticsBiModule,
    AiAgentModule,
    ComplianceModule,
    LicensingModule,
    ConsultantModule,
    DataMarketplaceModule,
  ],
  controllers: [AppController, BillingMeterController, SearchController, AnalyticsController, ApiKeyController],
  providers: [AiBillingMeterService, SearchService, AnalyticsService, ApiKeyService],
})
export class AppModule {}

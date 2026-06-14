import { Module } from '@nestjs/common';
import { AiGovernanceModule } from './ai-governance.module';
import { AppController } from './app.controller';
import { AuditModule } from './audit.module';
import { BillingModule } from './billing/billing.module';
import { AuthModule } from './auth/auth.module';
import { BackupModule } from './backups/backup.module';
import { ConnectorsModule } from './connectors.module';
import { EntitlementsModule } from './entitlements.module';
import { GlobalizationModule } from './globalization.module';
import { IntegrationsModule } from './integrations.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { MembershipsModule } from './memberships.module';
import { OrchestrationModule } from './orchestration.module';
import { TenancyModule } from './tenancy.module';
import { NotificationModule } from './notifications/notification.module';
import { WorkflowModule } from './workflows/workflow.module';

import { ResellerModule } from './reseller/reseller.module';

@Module({
  imports: [
    TenancyModule,
    AiGovernanceModule,
    GlobalizationModule,
    OrchestrationModule,
    BillingModule,
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
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}

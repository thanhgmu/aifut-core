import { Module } from '@nestjs/common';
import { ConnectionInstancesService } from './connection-instances.service';
import { InfrastructureProfileService } from './infrastructure-profile.service';
import { IntegrationAiDraftingService } from './integration-ai-drafting.service';
import { IntegrationControlPlaneService } from './integration-control-plane.service';
import { IntegrationDiagnosticsService } from './integration-diagnostics.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationSetupService } from './integration-setup.service';
import { IntegrationWorkflowService } from './integration-workflow.service';
import { TenancyModule } from './tenancy.module';

@Module({
  imports: [TenancyModule],
  controllers: [IntegrationsController],
  providers: [
    InfrastructureProfileService,
    ConnectionInstancesService,
    IntegrationControlPlaneService,
    IntegrationSetupService,
    IntegrationDiagnosticsService,
    IntegrationAiDraftingService,
    IntegrationWorkflowService,
  ],
})
export class IntegrationsModule {}

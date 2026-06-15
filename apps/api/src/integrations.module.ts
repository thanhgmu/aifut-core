import { Module } from '@nestjs/common';
import { ConnectionInstancesService } from './connection-instances.service';
import { CredentialReferencesService } from './credential-references.service';
import { InfrastructureProfileService } from './infrastructure-profile.service';
import { IntegrationAiDraftingService } from './integration-ai-drafting.service';
import { IntegrationControlPlaneService } from './integration-control-plane.service';
import { IntegrationDiagnosticsService } from './integration-diagnostics.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationSetupService } from './integration-setup.service';
import { IntegrationWorkflowService } from './integration-workflow.service';
import { IntegrationAwlGeneratorService } from './integration-awl-generator.service';
import { TenancyModule } from './tenancy.module';
import { WorkflowModule } from './workflows/workflow.module';

@Module({
  imports: [TenancyModule, WorkflowModule],
  controllers: [IntegrationsController],
  providers: [
    InfrastructureProfileService,
    ConnectionInstancesService,
    CredentialReferencesService,
    IntegrationControlPlaneService,
    IntegrationSetupService,
    IntegrationDiagnosticsService,
    IntegrationAiDraftingService,
    IntegrationWorkflowService,
    IntegrationAwlGeneratorService,
  ],
})
export class IntegrationsModule {}

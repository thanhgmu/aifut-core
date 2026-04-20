import { Module } from '@nestjs/common';
import { ConnectionInstancesService } from './connection-instances.service';
import { InfrastructureProfileService } from './infrastructure-profile.service';
import { IntegrationControlPlaneService } from './integration-control-plane.service';
import { IntegrationsController } from './integrations.controller';
import { TenancyModule } from './tenancy.module';

@Module({
  imports: [TenancyModule],
  controllers: [IntegrationsController],
  providers: [
    InfrastructureProfileService,
    ConnectionInstancesService,
    IntegrationControlPlaneService,
  ],
})
export class IntegrationsModule {}

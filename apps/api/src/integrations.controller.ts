import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { RequireAccessPolicy } from './access-policy.decorator';
import { AccessPolicyGuard } from './access-policy.guard';
import { ConnectionInstancesService } from './connection-instances.service';
import { InfrastructureProfileService } from './infrastructure-profile.service';
import { IntegrationControlPlaneService } from './integration-control-plane.service';
import { IntegrationDiagnosticsService } from './integration-diagnostics.service';
import { INTEGRATIONS_FOUNDATION_ROADMAP } from './integrations.constants';
import { IntegrationSetupService } from './integration-setup.service';
import { StorageRoutingPolicyService } from './storage-routing-policy.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly infrastructureProfileService: InfrastructureProfileService,
    private readonly connectionInstances: ConnectionInstancesService,
    private readonly storageRoutingPolicy: StorageRoutingPolicyService,
    private readonly integrationControlPlane: IntegrationControlPlaneService,
    private readonly integrationSetup: IntegrationSetupService,
    private readonly integrationDiagnostics: IntegrationDiagnosticsService,
  ) {}

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'integrations',
      status: 'foundation',
      supports: {
        connectorRegistry: true,
        tenantOwnedInfrastructure: true,
        workflowHandoffs: true,
        persistedConnectionSetup: true,
        mappingProfiles: true,
      },
      next: INTEGRATIONS_FOUNDATION_ROADMAP,
    };
  }

  @Get('infrastructure-profile')
  async infrastructureProfile(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
  ) {
    return {
      capability: 'integrations',
      status: 'resolved',
      profile: await this.infrastructureProfileService.getTenantInfrastructureProfile(
        tenantSlugHeader ?? tenantSlugQuery,
      ),
    };
  }

  @Get('domain-routing')
  async domainRouting(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
  ) {
    return this.infrastructureProfileService.getDomainRoutingPolicy(
      tenantSlugHeader ?? tenantSlugQuery,
    );
  }

  @Get('storage-routing')
  async storageRouting(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Query('policyKey') policyKey?: string,
    @Query('writePath') writePath?: string,
  ) {
    return {
      capability: 'integrations',
      status: 'resolved',
      storage: await this.storageRoutingPolicy.getEffectivePolicy({
        tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
        userEmail: userEmailHeader ?? userEmailQuery,
        workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
        hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
        policyKey,
        writePath,
      }),
    };
  }

  @Get('connections')
  async connections(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
  ) {
    return {
      capability: 'integrations',
      status: 'resolved',
      connections: await this.connectionInstances.listTenantConnections(
        tenantSlugHeader ?? tenantSlugQuery,
      ),
    };
  }

  @Get('control-plane')
  async controlPlane(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('hostname') hostnameQuery?: string,
  ) {
    return this.integrationControlPlane.summarizeTenantControlPlane({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
    });
  }

  @Get('setup-session')
  async setupSession(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('connectorKey') connectorKey?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Query('storagePolicyKey') storagePolicyKey?: string,
  ) {
    return this.integrationSetup.buildSetupSession({
      connectorKey,
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      storagePolicyKey,
    });
  }

  @Get('diagnostics')
  async diagnostics(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('connectionSlug') connectionSlug?: string,
    @Query('connectorKey') connectorKey?: string,
  ) {
    return this.integrationDiagnostics.diagnose({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
      connectionSlug,
      connectorKey,
    });
  }

  @Post('connections')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  async createConnection(
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      connectorKey?: string;
      name?: string;
      slug?: string;
      config?: Record<string, unknown>;
      secretsRef?: string;
      hostname?: string;
      storagePolicyKey?: string;
      mappingProfile?: {
        mode?: string;
        objects?: string[];
        fieldMappings?: Record<string, unknown>;
        eventMappings?: Record<string, unknown>;
        syncPolicy?: Record<string, unknown>;
      };
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
  ) {
    return this.connectionInstances.createConnection({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      hostname: forwardedHostHeader ?? hostHeader ?? body.hostname,
    });
  }

  @Get('setup-blueprint')
  setupBlueprint(@Query('connectorKey') connectorKey?: string) {
    return {
      capability: 'integrations',
      status: 'foundation',
      setup: this.connectionInstances.getSetupBlueprint(connectorKey),
    };
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'integrations',
      roadmap: INTEGRATIONS_FOUNDATION_ROADMAP,
    };
  }
}

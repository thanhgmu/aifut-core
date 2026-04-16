import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ConnectionInstancesService } from './connection-instances.service';
import { InfrastructureProfileService } from './infrastructure-profile.service';
import { INTEGRATIONS_FOUNDATION_ROADMAP } from './integrations.constants';

@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly infrastructureProfileService: InfrastructureProfileService,
    private readonly connectionInstances: ConnectionInstancesService,
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

  @Post('connections')
  async createConnection(
    @Body()
    body: {
      tenantSlug?: string;
      workspaceSlug?: string;
      connectorKey?: string;
      name?: string;
      slug?: string;
      config?: Record<string, unknown>;
      secretsRef?: string;
      mappingProfile?: {
        mode?: string;
        objects?: string[];
        fieldMappings?: Record<string, unknown>;
        eventMappings?: Record<string, unknown>;
        syncPolicy?: Record<string, unknown>;
      };
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
  ) {
    return this.connectionInstances.createConnection({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
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

import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ActorContextService } from './actor-context.service';
import { MEMBERSHIPS_FOUNDATION_ROADMAP } from './memberships.constants';

@Controller('memberships')
export class MembershipsController {
  constructor(private readonly actorContext: ActorContextService) {}

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'memberships',
      status: 'foundation',
      supports: {
        tenantMemberships: true,
        workspaceScope: true,
        roleBoundaries: true,
      },
      next: MEMBERSHIPS_FOUNDATION_ROADMAP,
    };
  }

  @Get('resolve')
  async resolve(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
  ) {
    const context = await this.actorContext.resolve({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
    });

    return {
      capability: 'memberships',
      status: 'resolved',
      tenant: context.tenant,
      user: context.user,
      activeMembership: context.activeMembership,
      activeWorkspace: context.activeWorkspace,
      memberships: context.memberships,
      resolution: context.resolution,
      next: ['policy-enforcement', 'workspace-default-selection-hardening'],
    };
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'memberships',
      roadmap: MEMBERSHIPS_FOUNDATION_ROADMAP,
    };
  }
}

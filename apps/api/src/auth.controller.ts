import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AccessPolicyService } from './access-policy.service';
import { ActorContextService } from './actor-context.service';
import { AUTH_FOUNDATION_ROADMAP } from './auth.constants';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly actorContext: ActorContextService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'auth',
      status: 'foundation',
      supports: {
        actorContext: true,
        sessionIssuance: true,
        tenantAwareIdentity: true,
        passwordlessReady: true,
      },
      next: AUTH_FOUNDATION_ROADMAP,
    };
  }

  @Get('context')
  async context(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
  ) {
    return {
      capability: 'auth',
      status: 'resolved',
      context: await this.actorContext.resolve({
        tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
        userEmail: userEmailHeader ?? userEmailQuery,
        workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
      }),
      next: ['session-issuance-and-rotation', 'request-guard-enforcement'],
    };
  }

  @Get('me')
  async me(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
  ) {
    const resolved = await this.accessPolicy.resolve({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
    });

    return {
      capability: 'auth',
      status: 'resolved',
      actor: resolved.context.user,
      tenant: resolved.context.tenant,
      workspace: resolved.context.activeWorkspace,
      membership: resolved.context.activeMembership,
      access: resolved.boundary,
      memberships: resolved.context.memberships,
      resolution: resolved.context.resolution,
      next: resolved.next,
    };
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'auth',
      roadmap: AUTH_FOUNDATION_ROADMAP,
    };
  }
}

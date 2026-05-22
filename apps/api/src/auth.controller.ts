import {
  Controller,
  Get,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { AccessPolicyService } from './access-policy.service';
import { ActorContextService } from './actor-context.service';
import { AUTH_FOUNDATION_ROADMAP } from './auth.constants';
import { verifyAuthToken } from './auth/jwt.util';

function extractBearerToken(authHeader?: string) {
  if (!authHeader) return null;
  const [type, token] = authHeader.split(' ');
  if (type !== 'Bearer' || !token) return null;
  return token;
}

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
    @Headers('authorization') authorizationHeader?: string,
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
  ) {
    const token = extractBearerToken(authorizationHeader);
    const authUserId = token ? this.verifyTokenUserId(token) : undefined;

    return {
      capability: 'auth',
      status: 'resolved',
      context: await this.actorContext.resolve({
        tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
        userEmail: userEmailHeader ?? userEmailQuery,
        workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
        hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
        authUserId,
      }),
      next: ['session-issuance-and-rotation', 'request-guard-enforcement'],
    };
  }

  @Get('me')
  async me(
    @Headers('authorization') authorizationHeader?: string,
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
  ) {
    const token = extractBearerToken(authorizationHeader);
    const authUserId = token ? this.verifyTokenUserId(token) : undefined;

    const resolved = await this.accessPolicy.resolve({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authUserId,
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

  private verifyTokenUserId(token: string) {
    try {
      return verifyAuthToken(token).sub;
    } catch {
      throw new UnauthorizedException('Invalid bearer token');
    }
  }
}

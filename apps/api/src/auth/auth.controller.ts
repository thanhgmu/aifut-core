import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { AccessPolicyService } from '../access-policy.service';
import { ActorContextService } from '../actor-context.service';
import { AUTH_FOUNDATION_ROADMAP } from '../auth.constants';
import { AuthService } from './auth.service';
import { extractBearerToken, verifyAuthToken } from './jwt.util';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly actorContext: ActorContextService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  // ── Credentials ────────────────────────────────────────────────────────────

  @Post('register')
  register(
    @Body() body: { email?: string; password?: string; name?: string },
  ) {
    if (!body?.email || !body?.password) {
      throw new UnauthorizedException('Email and password are required');
    }
    return this.authService.register({
      email: body.email,
      password: body.password,
      name: body.name,
    });
  }

  @Post('login')
  login(@Body() body: { email?: string; password?: string }) {
    if (!body?.email || !body?.password) {
      throw new UnauthorizedException('Email and password are required');
    }
    return this.authService.login({
      email: body.email,
      password: body.password,
    });
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    const token = extractBearerToken(authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      const payload = verifyAuthToken(token);
      return this.authService.me(payload.sub);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  // ── Actor context (tenant-aware identity resolution) ────────────────────────

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
    const authUserId = token ? this.safeVerifyUserId(token) : undefined;
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

  @Get('profile')
  async profile(
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
    const authUserId = token ? this.safeVerifyUserId(token) : undefined;
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

  // ── Discovery ───────────────────────────────────────────────────────────────

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
        credentialLogin: true,
      },
      next: AUTH_FOUNDATION_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return { capability: 'auth', roadmap: AUTH_FOUNDATION_ROADMAP };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private safeVerifyUserId(token: string): string | undefined {
    try {
      return verifyAuthToken(token).sub;
    } catch {
      throw new UnauthorizedException('Invalid bearer token');
    }
  }
}

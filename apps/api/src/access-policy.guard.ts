import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessPolicyService } from './access-policy.service';
import {
  AccessPolicyRequirement,
  ACCESS_POLICY_METADATA_KEY,
} from './access-policy.constants';
import { verifyAuthToken } from './auth/jwt.util';

type RequestWithContext = {
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  accessPolicy?: unknown;
};

@Injectable()
export class AccessPolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const requirement = this.reflector.getAllAndOverride<AccessPolicyRequirement>(
      ACCESS_POLICY_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const resolved = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: this.pickString(
          request.headers?.['x-tenant-slug'],
          request.query?.tenantSlug,
          request.body?.tenantSlug,
        ),
        userEmail: this.pickString(
          request.headers?.['x-user-email'],
          request.query?.userEmail,
          request.body?.userEmail,
        ),
        workspaceSlug: this.pickString(
          request.headers?.['x-workspace-slug'],
          request.query?.workspaceSlug,
          request.body?.workspaceSlug,
        ),
        hostname: this.pickString(
          request.headers?.['x-forwarded-host'],
          request.headers?.host,
          request.query?.hostname,
          request.body?.hostname,
        ),
        authUserId: this.extractAuthUserId(request.headers?.authorization),
        enforceWorkspaceDomainMatch: true,
      },
      requirement,
    );

    request.accessPolicy = resolved;
    return true;
  }

  private extractAuthUserId(authorization?: string | string[]) {
    const token = this.extractBearerToken(authorization);

    if (!token) {
      return undefined;
    }

    try {
      return verifyAuthToken(token).sub;
    } catch {
      throw new UnauthorizedException('Invalid bearer token');
    }
  }

  private extractBearerToken(value?: string | string[]) {
    const authorization = this.pickString(value);

    if (!authorization) {
      return undefined;
    }

    const [type, token] = authorization.split(' ');
    if (type !== 'Bearer' || !token) {
      return undefined;
    }

    return token;
  }

  private pickString(...values: unknown[]) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value;
      }

      if (Array.isArray(value)) {
        const first = value.find(
          (candidate): candidate is string =>
            typeof candidate === 'string' && candidate.trim().length > 0,
        );

        if (first) {
          return first;
        }
      }
    }

    return undefined;
  }
}

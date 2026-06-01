import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessPolicyService } from './access-policy.service';
import {
  AccessPolicyRequirement,
  ACCESS_POLICY_METADATA_KEY,
} from './access-policy.constants';
import { resolveAuthUserId } from './auth/jwt.util';
import { normalizeTenantDomainHostname } from './tenant-domain-hostname';

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
    const forwardedHostname = this.normalizeForwardedHostname(
      request.headers?.['x-forwarded-host'],
    );
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
          forwardedHostname,
          request.headers?.host,
          request.query?.hostname,
          request.body?.hostname,
        ),
        authUserId: resolveAuthUserId(request.headers?.authorization),
        enforceWorkspaceDomainMatch: true,
      },
      requirement,
    );

    request.accessPolicy = resolved;
    return true;
  }

  private normalizeForwardedHostname(value: unknown) {
    const forwardedHostname = Array.isArray(value)
      ? value
          .filter(
            (candidate): candidate is string =>
              typeof candidate === 'string' && candidate.trim().length > 0,
          )
          .join(',')
      : typeof value === 'string'
        ? value
        : undefined;

    return forwardedHostname
      ? normalizeTenantDomainHostname(forwardedHostname)
      : undefined;
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

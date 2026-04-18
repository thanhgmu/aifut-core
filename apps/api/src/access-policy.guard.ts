import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { AccessPolicyService } from './access-policy.service';
import {
  AccessPolicyRequirement,
  ACCESS_POLICY_METADATA_KEY,
  ROLE_PRIORITY,
} from './access-policy.constants';

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
    const resolved = await this.accessPolicy.resolve({
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
    });

    const role = (resolved.boundary.role ?? null) as MembershipRole | null;

    if (requirement.minimumRole && !this.hasAtLeastRole(role, requirement.minimumRole)) {
      throw new ForbiddenException(
        `Requires at least ${requirement.minimumRole} role in the active tenant/workspace scope.`,
      );
    }

    if (requirement.requireWorkspace && !resolved.context.activeWorkspace) {
      throw new ForbiddenException(
        'This action requires an explicit workspace scope.',
      );
    }

    request.accessPolicy = resolved;
    return true;
  }

  private hasAtLeastRole(role: MembershipRole | null, minimum: MembershipRole) {
    if (!role) {
      return false;
    }

    return ROLE_PRIORITY[role] >= ROLE_PRIORITY[minimum];
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

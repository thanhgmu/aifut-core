import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantStorageMode } from '@prisma/client';
import { ActorContextInput, ActorContextService } from './actor-context.service';
import { PrismaService } from './prisma.service';

type StorageWriteRequirement = {
  policyKey?: string;
  allowTenantScope?: boolean;
  writePath?: string;
};

@Injectable()
export class StorageRoutingPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actorContext: ActorContextService,
  ) {}

  async getEffectivePolicy(
    input: ActorContextInput & { policyKey?: string; writePath?: string },
  ) {
    const context = await this.actorContext.resolve({
      ...input,
      enforceWorkspaceDomainMatch: true,
    });
    const policyKey = input.policyKey?.trim().toLowerCase();

    if (!policyKey) {
      throw new BadRequestException('Missing storage policy key.');
    }

    const policies = await this.prisma.tenantStoragePolicy.findMany({
      where: {
        tenantId: context.tenant.id,
        key: policyKey,
        OR: [
          ...(context.activeWorkspace
            ? [{ workspaceId: context.activeWorkspace.id }]
            : []),
          { workspaceId: null },
        ],
      },
      orderBy: [{ workspaceId: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        key: true,
        mode: true,
        storageClass: true,
        targetRef: true,
        targetRegion: true,
        backupTargetRef: true,
        meteringEnabled: true,
        workspaceId: true,
        createdAt: true,
      },
    });

    const effectivePolicy = policies[0] ?? null;

    return {
      context,
      policyKey,
      effectivePolicy,
      allMatchingPolicies: policies,
      resolution: {
        workspaceScoped: Boolean(effectivePolicy?.workspaceId),
        activeWorkspaceSlug: context.activeWorkspace?.slug ?? null,
        fallbackToTenantPolicy: Boolean(
          !effectivePolicy?.workspaceId && context.activeWorkspace,
        ),
      },
      next: [
        'storage-write-enforcement',
        'backup-target-requirement-checks',
        'metering-boundary-enforcement',
      ],
    };
  }

  async requireWritePolicy(
    input: ActorContextInput & StorageWriteRequirement,
  ) {
    const resolved = await this.getEffectivePolicy(input);
    const allowTenantScope = input.allowTenantScope ?? false;

    if (!resolved.effectivePolicy) {
      throw new NotFoundException(
        `Storage policy not found for key: ${resolved.policyKey}`,
      );
    }

    if (resolved.effectivePolicy.mode === TenantStorageMode.DISABLED) {
      throw new ForbiddenException(
        `Storage policy ${resolved.policyKey} is disabled for the active scope.`,
      );
    }

    if (
      resolved.context.activeWorkspace &&
      !resolved.effectivePolicy.workspaceId &&
      !allowTenantScope
    ) {
      throw new ForbiddenException(
        `Storage writes for policy ${resolved.policyKey} require a workspace-scoped routing policy in workspace ${resolved.context.activeWorkspace.slug}.`,
      );
    }

    if (
      resolved.effectivePolicy.mode === TenantStorageMode.TENANT_MANAGED &&
      !resolved.effectivePolicy.targetRef
    ) {
      throw new ForbiddenException(
        `Storage policy ${resolved.policyKey} is tenant-managed but missing targetRef.`,
      );
    }

    if (
      resolved.effectivePolicy.mode === TenantStorageMode.HYBRID &&
      (!resolved.effectivePolicy.targetRef || !resolved.effectivePolicy.backupTargetRef)
    ) {
      throw new ForbiddenException(
        `Hybrid storage policy ${resolved.policyKey} requires both targetRef and backupTargetRef.`,
      );
    }

    const topology = this.buildTopology({
      tenantSlug: resolved.context.tenant.slug,
      workspaceSlug: resolved.effectivePolicy.workspaceId
        ? resolved.context.activeWorkspace?.slug ??
          resolved.resolution.activeWorkspaceSlug
        : null,
      policyKey: resolved.policyKey,
      mode: resolved.effectivePolicy.mode,
    });

    const enforcedWritePath = input.writePath
      ? this.enforceWritePath({
          rootPrefix: topology.rootPrefix,
          requestedPath: input.writePath,
        })
      : null;

    return {
      ...resolved,
      storageTopology: topology,
      writeGuardrail: {
        mode: resolved.effectivePolicy.mode,
        requiresWorkspaceScopedPolicy: Boolean(resolved.context.activeWorkspace),
        meterWritesOnPlatform: resolved.effectivePolicy.meteringEnabled,
        rootPrefix: topology.rootPrefix,
        enforcedWritePath,
      },
    };
  }

  private buildTopology(input: {
    tenantSlug: string;
    workspaceSlug?: string | null;
    policyKey: string;
    mode: TenantStorageMode;
  }) {
    const tenantSegment = this.normalizePathSegment(input.tenantSlug, 'tenant slug');
    const policySegment = this.normalizePathSegment(input.policyKey, 'storage policy key');
    const workspaceSegment = input.workspaceSlug
      ? this.normalizePathSegment(input.workspaceSlug, 'workspace slug')
      : null;

    const rootPrefix = workspaceSegment
      ? `tenants/${tenantSegment}/workspaces/${workspaceSegment}/storage/${policySegment}`
      : `tenants/${tenantSegment}/storage/${policySegment}`;

    return {
      rootPrefix,
      ownershipScope: workspaceSegment ? 'workspace' : 'tenant',
      mode: input.mode,
      workspaceSlug: workspaceSegment,
    };
  }

  private enforceWritePath(input: { rootPrefix: string; requestedPath: string }) {
    const normalizedRequestedPath = this.normalizeRelativePath(input.requestedPath);

    if (!normalizedRequestedPath) {
      return input.rootPrefix;
    }

    if (normalizedRequestedPath.startsWith(`${input.rootPrefix}/`)) {
      return normalizedRequestedPath;
    }

    return `${input.rootPrefix}/${normalizedRequestedPath}`;
  }

  private normalizeRelativePath(value: string) {
    const normalized = value.trim().replace(/\\+/g, '/').replace(/^\/+|\/+$/g, '');

    if (!normalized) {
      return '';
    }

    const segments = normalized.split('/').filter(Boolean);

    for (const segment of segments) {
      this.normalizePathSegment(segment, 'storage write path');
    }

    return segments.join('/');
  }

  private normalizePathSegment(value: string, label: string) {
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      throw new BadRequestException(`Missing ${label}.`);
    }

    if (normalized === '.' || normalized === '..' || normalized.includes('/')) {
      throw new BadRequestException(`Invalid ${label}.`);
    }

    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(normalized)) {
      throw new BadRequestException(`Invalid ${label}.`);
    }

    return normalized;
  }
}

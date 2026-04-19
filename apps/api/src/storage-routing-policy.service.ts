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
};

@Injectable()
export class StorageRoutingPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actorContext: ActorContextService,
  ) {}

  async getEffectivePolicy(input: ActorContextInput & { policyKey?: string }) {
    const context = await this.actorContext.resolve(input);
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

    return {
      ...resolved,
      writeGuardrail: {
        mode: resolved.effectivePolicy.mode,
        requiresWorkspaceScopedPolicy: Boolean(resolved.context.activeWorkspace),
        meterWritesOnPlatform: resolved.effectivePolicy.meteringEnabled,
      },
    };
  }
}

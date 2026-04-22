import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  TenantDomainKind,
  TenantDomainStatus,
  TenantStorageMode,
} from '@prisma/client';
import { AccessPolicyService } from './access-policy.service';
import { ActorContextInput } from './actor-context.service';
import { PrismaService } from './prisma.service';

type TenancyOperationInput = ActorContextInput;

type CreateWorkspaceInput = TenancyOperationInput & {
  name?: string;
  slug?: string;
  makeDefaultForUser?: boolean;
};

type UpsertDomainInput = TenancyOperationInput & {
  hostname?: string;
  kind?: TenantDomainKind;
  status?: TenantDomainStatus;
  workspaceSlug?: string;
  isPrimary?: boolean;
  provider?: string | null;
  provisioningMode?: string | null;
  dnsTarget?: string | null;
  certificateStatus?: string | null;
};

type UpsertStoragePolicyInput = TenancyOperationInput & {
  key?: string;
  mode?: TenantStorageMode;
  workspaceSlug?: string;
  storageClass?: string | null;
  targetRef?: string | null;
  targetRegion?: string | null;
  backupTargetRef?: string | null;
  meteringEnabled?: boolean;
};

@Injectable()
export class TenancyOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async createWorkspace(input: CreateWorkspaceInput) {
    const resolved = await this.accessPolicy.resolveAndRequire(input, {
      minimumRole: MembershipRole.ADMIN,
      scope: 'tenant-admin',
    });

    const name = input.name?.trim();
    const slug = this.normalizeSlug(input.slug, 'workspace slug');

    if (!name) {
      throw new BadRequestException('Missing workspace name.');
    }

    const workspace = await this.prisma.workspace.create({
      data: {
        tenantId: resolved.context.tenant.id,
        name,
        slug,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        tenantId: true,
        createdAt: true,
      },
    });

    const membership = await this.prisma.membership.create({
      data: {
        tenantId: resolved.context.tenant.id,
        userId: resolved.context.user.id,
        workspaceId: workspace.id,
        role: resolved.context.activeMembership?.role ?? MembershipRole.ADMIN,
        isDefault: Boolean(input.makeDefaultForUser),
      },
      select: {
        id: true,
        role: true,
        isDefault: true,
        workspaceId: true,
        createdAt: true,
      },
    });

    if (input.makeDefaultForUser) {
      await this.prisma.membership.updateMany({
        where: {
          tenantId: resolved.context.tenant.id,
          userId: resolved.context.user.id,
          NOT: { id: membership.id },
        },
        data: {
          isDefault: false,
        },
      });
    }

    return {
      capability: 'tenancy',
      status: 'workspace-created',
      tenant: resolved.context.tenant,
      workspace,
      membership,
      next: ['workspace-domain-binding', 'workspace-storage-policy-assignment'],
    };
  }

  async upsertDomain(input: UpsertDomainInput) {
    const resolved = await this.accessPolicy.resolveAndRequire(input, {
      minimumRole: MembershipRole.ADMIN,
      scope: 'tenant-admin',
    });

    const hostname = this.normalizeHostname(input.hostname);

    if (!hostname) {
      throw new BadRequestException('Missing hostname.');
    }

    const workspace = await this.resolveWorkspace({
      tenantId: resolved.context.tenant.id,
      workspaceSlug: input.workspaceSlug,
    });

    const domain = await this.prisma.tenantDomain.upsert({
      where: { hostname },
      update: {
        tenantId: resolved.context.tenant.id,
        workspaceId: workspace?.id ?? null,
        kind: input.kind ?? TenantDomainKind.CUSTOM,
        status: input.status ?? TenantDomainStatus.ACTIVE,
        isPrimary: input.isPrimary ?? false,
        provider: this.normalizeOptional(input.provider),
        provisioningMode: this.normalizeOptional(input.provisioningMode),
        dnsTarget: this.normalizeOptional(input.dnsTarget),
        certificateStatus: this.normalizeOptional(input.certificateStatus),
      },
      create: {
        tenantId: resolved.context.tenant.id,
        workspaceId: workspace?.id ?? null,
        hostname,
        kind: input.kind ?? TenantDomainKind.CUSTOM,
        status: input.status ?? TenantDomainStatus.ACTIVE,
        isPrimary: input.isPrimary ?? false,
        provider: this.normalizeOptional(input.provider),
        provisioningMode: this.normalizeOptional(input.provisioningMode),
        dnsTarget: this.normalizeOptional(input.dnsTarget),
        certificateStatus: this.normalizeOptional(input.certificateStatus),
      },
      select: {
        id: true,
        hostname: true,
        kind: true,
        status: true,
        isPrimary: true,
        provider: true,
        provisioningMode: true,
        dnsTarget: true,
        certificateStatus: true,
        workspaceId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (domain.isPrimary) {
      await this.prisma.tenantDomain.updateMany({
        where: {
          tenantId: resolved.context.tenant.id,
          id: { not: domain.id },
          workspaceId: workspace?.id ?? null,
        },
        data: {
          isPrimary: false,
        },
      });
    }

    return {
      capability: 'tenancy',
      status: 'domain-upserted',
      tenant: resolved.context.tenant,
      workspace,
      domain,
      next: ['host-header-routing-enforcement', 'certificate-automation-hooks'],
    };
  }

  async upsertStoragePolicy(input: UpsertStoragePolicyInput) {
    const resolved = await this.accessPolicy.resolveAndRequire(input, {
      minimumRole: MembershipRole.ADMIN,
      scope: 'tenant-admin',
    });

    const key = this.normalizeSlug(input.key, 'storage policy key');

    if (!key) {
      throw new BadRequestException('Missing storage policy key.');
    }

    const mode = input.mode ?? TenantStorageMode.PLATFORM_MANAGED;

    if (
      mode === TenantStorageMode.TENANT_MANAGED &&
      !this.normalizeOptional(input.targetRef)
    ) {
      throw new BadRequestException(
        'Tenant-managed storage policies require targetRef.',
      );
    }

    if (
      mode === TenantStorageMode.HYBRID &&
      (!this.normalizeOptional(input.targetRef) ||
        !this.normalizeOptional(input.backupTargetRef))
    ) {
      throw new BadRequestException(
        'Hybrid storage policies require both targetRef and backupTargetRef.',
      );
    }

    const workspace = await this.resolveWorkspace({
      tenantId: resolved.context.tenant.id,
      workspaceSlug: input.workspaceSlug,
    });

    const policy = await this.prisma.tenantStoragePolicy.upsert({
      where: {
        tenantId_key: {
          tenantId: resolved.context.tenant.id,
          key,
        },
      },
      update: {
        workspaceId: workspace?.id ?? null,
        mode,
        storageClass: this.normalizeOptional(input.storageClass),
        targetRef: this.normalizeOptional(input.targetRef),
        targetRegion: this.normalizeOptional(input.targetRegion),
        backupTargetRef: this.normalizeOptional(input.backupTargetRef),
        meteringEnabled: input.meteringEnabled ?? false,
      },
      create: {
        tenantId: resolved.context.tenant.id,
        workspaceId: workspace?.id ?? null,
        key,
        mode,
        storageClass: this.normalizeOptional(input.storageClass),
        targetRef: this.normalizeOptional(input.targetRef),
        targetRegion: this.normalizeOptional(input.targetRegion),
        backupTargetRef: this.normalizeOptional(input.backupTargetRef),
        meteringEnabled: input.meteringEnabled ?? false,
      },
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
        updatedAt: true,
      },
    });

    return {
      capability: 'tenancy',
      status: 'storage-policy-upserted',
      tenant: resolved.context.tenant,
      workspace,
      policy,
      topology: {
        scope: workspace ? 'workspace' : 'tenant',
        ownershipMode: policy.mode,
      },
      next: ['storage-write-enforcement', 'backup-policy-validation'],
    };
  }

  private async resolveWorkspace(input: {
    tenantId: string;
    workspaceSlug?: string;
  }) {
    const workspaceSlug = input.workspaceSlug?.trim().toLowerCase();

    if (!workspaceSlug) {
      return null;
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: {
        tenantId_slug: {
          tenantId: input.tenantId,
          slug: workspaceSlug,
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException(
        `Workspace not found for slug: ${workspaceSlug}`,
      );
    }

    return workspace;
  }

  private normalizeSlug(value: string | undefined, label: string) {
    const normalized = value?.trim().toLowerCase();

    if (!normalized) {
      throw new BadRequestException(`Missing ${label}.`);
    }

    if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) {
      throw new BadRequestException(`Invalid ${label}.`);
    }

    return normalized;
  }

  private normalizeHostname(value?: string) {
    return value
      ?.trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      ?.split(':')[0];
  }

  private normalizeOptional(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}

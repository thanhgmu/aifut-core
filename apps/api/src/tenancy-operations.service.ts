import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  TenantDomainKind,
  TenantDomainStatus,
  TenantStorageMode,
  Prisma,
} from '@prisma/client';
import { AccessPolicyService } from './access-policy.service';
import { ActorContextInput } from './actor-context.service';
import { PrismaService } from './prisma.service';
import { normalizeTenantDomainHostname } from './tenant-domain-hostname';
import { evaluateTenantDomainReadiness } from './tenant-domain-readiness';

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
  allowPrimaryDemotion?: boolean;
  allowScopeRebinding?: boolean;
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

type UpsertPackageAssignmentInput = TenancyOperationInput & {
  workspaceSlug?: string;
  basePlanKey?: string;
  selectedOptions?: string[];
  provisioningState?: string | null;
  source?: string | null;
  billingSnapshot?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null;
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

    const requestedWorkspace = await this.resolveWorkspace({
      tenantId: resolved.context.tenant.id,
      workspaceSlug: input.workspaceSlug,
    });

    const existingDomain = await this.prisma.tenantDomain.findUnique({
      where: { hostname },
      select: {
        id: true,
        tenantId: true,
        workspaceId: true,
        kind: true,
        status: true,
        isPrimary: true,
        provider: true,
        provisioningMode: true,
        dnsTarget: true,
        certificateStatus: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (
      existingDomain &&
      existingDomain.tenantId !== resolved.context.tenant.id
    ) {
      throw new ForbiddenException(
        `Hostname ${hostname} is already bound to another tenant.`,
      );
    }

    const workspace =
      input.workspaceSlug === undefined && existingDomain
        ? existingDomain.workspace
        : requestedWorkspace;
    const kind =
      input.kind === undefined
        ? existingDomain?.kind ?? this.normalizeDomainKind()
        : this.normalizeDomainKind(input.kind);
    const status =
      input.status === undefined
        ? existingDomain?.status ?? this.normalizeDomainStatus()
        : this.normalizeDomainStatus(input.status);
    const dnsTarget =
      input.dnsTarget === undefined
        ? existingDomain?.dnsTarget ?? null
        : this.normalizeOptional(input.dnsTarget);
    const certificateStatus = this.normalizeOptionalLowercase(
      input.certificateStatus === undefined
        ? existingDomain?.certificateStatus
        : input.certificateStatus,
    );
    const provider =
      input.provider === undefined
        ? existingDomain?.provider ?? null
        : this.normalizeOptional(input.provider);
    const provisioningMode = this.normalizeOptionalLowercase(
      input.provisioningMode === undefined
        ? existingDomain?.provisioningMode
        : input.provisioningMode,
    );
    const readiness = evaluateTenantDomainReadiness({
      kind,
      status,
      dnsTarget,
      certificateStatus,
      provider,
      provisioningMode,
    });
    const managedProvisioning =
      provisioningMode === 'managed' || provisioningMode === 'affiliate-managed';
    const isPrimary = input.isPrimary ?? existingDomain?.isPrimary ?? false;
    const promotionRequested = input.isPrimary === true;

    if (
      status === TenantDomainStatus.ACTIVE &&
      kind !== TenantDomainKind.PLATFORM_SUBDOMAIN &&
      readiness.reasons.includes('dns-target:missing')
    ) {
      throw new BadRequestException(
        'Active custom or affiliate domains require dnsTarget.',
      );
    }

    if (
      status === TenantDomainStatus.ACTIVE &&
      kind !== TenantDomainKind.PLATFORM_SUBDOMAIN &&
      readiness.reasons.some((reason) =>
        reason.startsWith('certificate-status:'),
      )
    ) {
      throw new BadRequestException(
        'Active custom or affiliate domains require ready certificateStatus.',
      );
    }

    if (isPrimary && status !== TenantDomainStatus.ACTIVE) {
      throw new BadRequestException(
        'Primary domains must be ACTIVE before promotion.',
      );
    }

    if (isPrimary && !readiness.routeReady) {
      throw new BadRequestException(
        'Primary domains must be route-ready before promotion or retention.',
      );
    }

    if (
      status === TenantDomainStatus.ACTIVE &&
      kind === TenantDomainKind.AFFILIATE_DOMAIN &&
      readiness.reasons.includes('provisioning-mode:missing')
    ) {
      throw new BadRequestException(
        'Active affiliate domains require provisioningMode.',
      );
    }

    if (
      status === TenantDomainStatus.ACTIVE &&
      readiness.reasons.includes('provider:missing')
    ) {
      throw new BadRequestException(
        'Managed or affiliate-managed active domains require provider.',
      );
    }

    const targetWorkspaceId = workspace?.id ?? null;
    const demotionRequested =
      Boolean(existingDomain?.isPrimary) && input.isPrimary === false;
    const scopeRebindingRequested =
      existingDomain != null && existingDomain.workspaceId !== targetWorkspaceId;

    if (demotionRequested && !input.allowPrimaryDemotion) {
      throw new BadRequestException(
        'Demoting an existing primary domain requires allowPrimaryDemotion.',
      );
    }

    if (scopeRebindingRequested && !input.allowScopeRebinding) {
      throw new BadRequestException(
        'Rebinding a domain across tenant/workspace scope requires allowScopeRebinding.',
      );
    }

    const domain = await this.prisma.tenantDomain.upsert({
      where: { hostname },
      update: {
        tenantId: resolved.context.tenant.id,
        workspaceId: workspace?.id ?? null,
        kind,
        status,
        isPrimary,
        provider,
        provisioningMode,
        dnsTarget,
        certificateStatus,
      },
      create: {
        tenantId: resolved.context.tenant.id,
        workspaceId: workspace?.id ?? null,
        hostname,
        kind,
        status,
        isPrimary,
        provider,
        provisioningMode,
        dnsTarget,
        certificateStatus,
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

    const primaryScope = workspace ? `workspace:${workspace.slug}` : 'tenant:default';
    const previousScope = existingDomain?.workspace?.slug
      ? `workspace:${existingDomain.workspace.slug}`
      : existingDomain
        ? 'tenant:default'
        : null;

    const primaryReassignment = domain.isPrimary
      ? await this.prisma.tenantDomain.updateMany({
        where: {
          tenantId: resolved.context.tenant.id,
          id: { not: domain.id },
          workspaceId: workspace?.id ?? null,
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      })
      : { count: 0 };

    const primaryCollisionDetected = primaryReassignment.count > 0;

    return {
      capability: 'tenancy',
      status: 'domain-upserted',
      tenant: resolved.context.tenant,
      workspace,
      domain,
      governance: {
        bindingScope: workspace ? 'workspace' : 'tenant',
        primaryScope: domain.isPrimary ? primaryScope : null,
        primaryReassignment: {
          scope: primaryScope,
          demotedPrimaryCount: primaryReassignment.count,
          collisionDetected: primaryCollisionDetected,
          action: domain.isPrimary
            ? promotionRequested
              ? primaryCollisionDetected
                ? 'promoted-and-demoted-existing-primary'
                : 'promoted-without-existing-primary-collision'
              : primaryCollisionDetected
                ? 'retained-primary-and-demoted-existing-primary'
                : 'retained-existing-primary'
            : 'no-primary-reassignment',
        },
        primaryIntent: {
          requestedPromotion: promotionRequested,
          requestedDemotion: demotionRequested,
          explicitDemotionApproved: demotionRequested
            ? Boolean(input.allowPrimaryDemotion)
            : false,
          resultingPrimary: domain.isPrimary,
          resultingAction: domain.isPrimary
            ? promotionRequested
              ? primaryCollisionDetected
                ? 'promote-target-and-demote-existing-scope-primary'
                : 'promote-target-as-scope-primary'
              : primaryCollisionDetected
                ? 'retain-primary-and-demote-existing-scope-primary'
                : 'retain-existing-scope-primary'
            : 'retain-or-write-non-primary-domain',
        },
        scopeTransition: {
          rebindingRequested: scopeRebindingRequested,
          explicitRebindingApproved: scopeRebindingRequested
            ? Boolean(input.allowScopeRebinding)
            : false,
          previousScope,
          targetScope: primaryScope,
          action: scopeRebindingRequested
            ? 'rebound-domain-scope'
            : 'retained-domain-scope',
        },
        readiness: evaluateTenantDomainReadiness(domain),
        provisioning: {
          provider: domain.provider,
          mode: domain.provisioningMode,
          externallyManaged:
            domain.provisioningMode === 'managed' ||
            domain.provisioningMode === 'affiliate-managed',
        },
      },
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

    const mode = this.normalizeStorageMode(input.mode);

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

  async upsertPackageAssignment(input: UpsertPackageAssignmentInput) {
    const resolved = await this.accessPolicy.resolveAndRequire(input, {
      minimumRole: MembershipRole.ADMIN,
      scope: 'tenant-admin',
    });

    const basePlanKey = this.normalizeSlug(input.basePlanKey, 'base plan key');
    const workspace = await this.resolveWorkspace({
      tenantId: resolved.context.tenant.id,
      workspaceSlug: input.workspaceSlug,
    });
    const tenantSlug = resolved.context.tenant.slug;
    const scopeKey = workspace
      ? `${tenantSlug}:workspace:${workspace.slug}`
      : `${tenantSlug}:tenant:default`;
    const selectedOptions = Array.from(
      new Set(
        (input.selectedOptions ?? [])
          .map((option) => this.normalizeSlug(option, 'package option key')),
      ),
    );
    const provisioningState =
      this.normalizeOptionalLowercase(input.provisioningState) ??
      (selectedOptions.length > 0 ? 'pending' : 'inactive');

    if (provisioningState === 'active' && selectedOptions.length === 0) {
      throw new BadRequestException(
        'Active package assignments require at least one selected option.',
      );
    }

    const assignment = await this.prisma.tenantPackageAssignment.upsert({
      where: { scopeKey },
      update: {
        tenantId: resolved.context.tenant.id,
        workspaceId: workspace?.id ?? null,
        basePlanKey,
        selectedOptions,
        billingSnapshot: input.billingSnapshot ?? undefined,
        provisioningState,
        source: this.normalizeOptional(input.source),
      },
      create: {
        tenantId: resolved.context.tenant.id,
        workspaceId: workspace?.id ?? null,
        scopeKey,
        basePlanKey,
        selectedOptions,
        billingSnapshot: input.billingSnapshot ?? undefined,
        provisioningState,
        source: this.normalizeOptional(input.source),
      },
      select: {
        id: true,
        scopeKey: true,
        basePlanKey: true,
        selectedOptions: true,
        billingSnapshot: true,
        provisioningState: true,
        source: true,
        workspaceId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      capability: 'tenancy',
      status: 'package-assignment-upserted',
      tenant: resolved.context.tenant,
      workspace,
      packageAssignment: assignment,
      topology: {
        scope: workspace ? 'workspace' : 'tenant',
        commercialScopeKey: scopeKey,
        selectedOptionsCount: selectedOptions.length,
      },
      next: ['entitlement-sync', 'connector-provisioning-reconciliation'],
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
    return normalizeTenantDomainHostname(value);
  }

  private normalizeOptional(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeOptionalLowercase(value?: string | null) {
    const normalized = this.normalizeOptional(value);
    return normalized ? normalized.toLowerCase() : null;
  }

  private normalizeOptionalUppercase(value?: string | null) {
    const normalized = this.normalizeOptional(value);
    return normalized ? normalized.toUpperCase() : null;
  }

  private normalizeStorageMode(value?: string | null): TenantStorageMode {
    const normalized = this.normalizeOptionalUppercase(value);

    if (!normalized) {
      return TenantStorageMode.PLATFORM_MANAGED;
    }

    if (Object.values(TenantStorageMode).includes(normalized as TenantStorageMode)) {
      return normalized as TenantStorageMode;
    }

    throw new BadRequestException(`Invalid storage policy mode ${normalized}.`);
  }

  private normalizeDomainKind(value?: string | null): TenantDomainKind {
    const normalized = this.normalizeOptionalUppercase(value);

    if (!normalized) {
      return TenantDomainKind.CUSTOM;
    }

    if (Object.values(TenantDomainKind).includes(normalized as TenantDomainKind)) {
      return normalized as TenantDomainKind;
    }

    throw new BadRequestException(`Invalid domain kind ${normalized}.`);
  }

  private normalizeDomainStatus(value?: string | null): TenantDomainStatus {
    const normalized = this.normalizeOptionalUppercase(value);

    if (!normalized) {
      return TenantDomainStatus.ACTIVE;
    }

    if (Object.values(TenantDomainStatus).includes(normalized as TenantDomainStatus)) {
      return normalized as TenantDomainStatus;
    }

    throw new BadRequestException(`Invalid domain status ${normalized}.`);
  }
}

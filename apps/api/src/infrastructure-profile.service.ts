import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { evaluateTenantDomainReadiness } from './tenant-domain-readiness';

@Injectable()
export class InfrastructureProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getTenantInfrastructureProfile(tenantSlug?: string) {
    const normalizedTenantSlug = tenantSlug?.trim().toLowerCase();

    if (!normalizedTenantSlug) {
      throw new BadRequestException(
        'Missing tenant slug. Provide x-tenant-slug header or tenantSlug query param.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: normalizedTenantSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        workspaces: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        integrations: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: true,
            provider: true,
            status: true,
            workspaceId: true,
            workspace: {
              select: {
                name: true,
                slug: true,
              },
            },
            lastVerifiedAt: true,
            routingMode: true,
            targetBaseUrl: true,
            targetRegion: true,
            targetEnvironment: true,
          },
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        },
        entitlements: {
          select: {
            id: true,
            key: true,
            kind: true,
            value: true,
            startsAt: true,
            endsAt: true,
          },
          orderBy: { key: 'asc' },
        },
        domains: {
          select: {
            id: true,
            hostname: true,
            kind: true,
            status: true,
            isPrimary: true,
            dnsTarget: true,
            certificateStatus: true,
            provider: true,
            provisioningMode: true,
            workspaceId: true,
            workspace: {
              select: {
                name: true,
                slug: true,
              },
            },
            createdAt: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { hostname: 'asc' }],
        },
        storagePolicies: {
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
            workspace: {
              select: {
                name: true,
                slug: true,
              },
            },
            createdAt: true,
          },
          orderBy: [{ mode: 'asc' }, { key: 'asc' }],
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        `Tenant not found for slug: ${normalizedTenantSlug}`,
      );
    }

    const integrationCounts = tenant.integrations.reduce<
      Record<string, number>
    >((accumulator, integration) => {
      accumulator[integration.category] =
        (accumulator[integration.category] ?? 0) + 1;
      return accumulator;
    }, {});

    const storageIntegrations = tenant.integrations.filter(
      (integration) => integration.category === 'STORAGE',
    );

    const backupEntitlements = tenant.entitlements.filter((entitlement) =>
      entitlement.key.toLowerCase().includes('backup'),
    );

    const primaryDomain =
      tenant.domains.find((domain) => domain.isPrimary) ??
      tenant.domains[0] ??
      null;
    const domains = tenant.domains.map((domain) => ({
      ...domain,
      readiness: evaluateTenantDomainReadiness(domain),
    }));
    const primaryDomainWithReadiness = primaryDomain
      ? (domains.find((domain) => domain.id === primaryDomain.id) ?? null)
      : null;

    const activeStoragePolicies = tenant.storagePolicies.filter(
      (policy) => policy.mode !== 'DISABLED',
    );

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        createdAt: tenant.createdAt,
      },
      infrastructure: {
        tenancyMode:
          storageIntegrations.length > 0
            ? 'hybrid-or-external-ready'
            : 'platform-hosted-foundation',
        workspaceCount: tenant.workspaces.length,
        integrationCounts,
        domains: {
          primary: primaryDomainWithReadiness,
          total: domains.length,
          routeReady: domains.filter((domain) => domain.readiness.routeReady)
            .length,
          customDomainReady: domains.some(
            (domain) => domain.kind === 'CUSTOM' && domain.readiness.routeReady,
          ),
        },
        storage: {
          status:
            activeStoragePolicies.length > 0
              ? 'tenant-routing-policy-declared'
              : storageIntegrations.length > 0
                ? 'tenant-storage-connected'
                : 'platform-storage-only',
          routingPolicies: tenant.storagePolicies,
          connections: storageIntegrations,
        },
        backup: {
          status:
            backupEntitlements.length > 0 ||
            tenant.storagePolicies.some((policy) => policy.backupTargetRef)
              ? 'tenant-backup-policy-declared'
              : 'backup-policy-not-declared',
          entitlements: backupEntitlements,
        },
      },
      workspaces: tenant.workspaces,
      integrations: tenant.integrations,
      entitlements: tenant.entitlements,
      domains,
      storagePolicies: tenant.storagePolicies,
      next: [
        'tenant-domain-binding',
        'storage-routing-policy-enforcement',
        'backup-target-enforcement',
        'hosting-affiliate-boundaries',
        'token-governance-foundation',
      ],
    };
  }

  async getDomainRoutingPolicy(tenantSlug?: string) {
    const tenant = await this.resolveTenant(tenantSlug);

    const domains = await this.prisma.tenantDomain.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ isPrimary: 'desc' }, { hostname: 'asc' }],
      select: {
        id: true,
        hostname: true,
        kind: true,
        status: true,
        isPrimary: true,
        dnsTarget: true,
        certificateStatus: true,
        provider: true,
        provisioningMode: true,
        workspaceId: true,
        workspace: {
          select: {
            name: true,
            slug: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    const visibleDomains = domains.map((domain) => ({
      ...domain,
      readiness: evaluateTenantDomainReadiness(domain),
    }));

    return {
      capability: 'integrations',
      status: 'resolved',
      routing: {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
        },
        summary: {
          domainCount: visibleDomains.length,
          routeReadyDomainCount: visibleDomains.filter(
            (domain) => domain.readiness.routeReady,
          ).length,
          attentionRequiredDomainCount: visibleDomains.filter(
            (domain) => !domain.readiness.routeReady,
          ).length,
        },
        domains: visibleDomains,
        recommendations: [
          'declare-primary-subdomain-or-custom-domain',
          'attach-dns-target-and-certificate-status',
          'bind-domain-to-workspace-when-needed',
        ],
      },
    };
  }

  async getStorageRoutingPolicy(tenantSlug?: string) {
    const tenant = await this.resolveTenant(tenantSlug);

    const storagePolicies = await this.prisma.tenantStoragePolicy.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ mode: 'asc' }, { key: 'asc' }],
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
        workspace: {
          select: {
            name: true,
            slug: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      capability: 'integrations',
      status: 'resolved',
      storage: {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
        },
        policies: storagePolicies,
        recommendations: [
          'declare-control-plane-vs-data-plane-boundaries',
          'attach-backup-target-for-tenant-owned-storage',
          'enable-metering-only-for-platform-hosted-storage',
        ],
      },
    };
  }

  async getBackupReadinessPolicy(tenantSlug?: string) {
    const tenant = await this.resolveTenant(tenantSlug);

    const [storagePolicies, integrations, entitlements] = await Promise.all([
      this.prisma.tenantStoragePolicy.findMany({
        where: { tenantId: tenant.id },
        orderBy: [{ mode: 'asc' }, { key: 'asc' }],
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
          workspace: {
            select: {
              name: true,
              slug: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.integrationConnection.findMany({
        where: { tenantId: tenant.id },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          slug: true,
          category: true,
          provider: true,
          status: true,
          workspaceId: true,
          workspace: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      }),
      this.prisma.entitlement.findMany({
        where: {
          tenantId: tenant.id,
          key: { contains: 'backup', mode: 'insensitive' },
        },
        orderBy: { key: 'asc' },
        select: {
          id: true,
          key: true,
          kind: true,
          value: true,
          startsAt: true,
          endsAt: true,
        },
      }),
    ]);

    const policiesWithBackupTarget = storagePolicies.filter(
      (policy) => policy.backupTargetRef,
    );
    const policiesMissingBackupTarget = storagePolicies.filter(
      (policy) => policy.mode !== 'DISABLED' && !policy.backupTargetRef,
    );
    const backupTargetRefs = [
      ...new Set(
        policiesWithBackupTarget
          .map((policy) => policy.backupTargetRef)
          .filter((targetRef): targetRef is string => Boolean(targetRef)),
      ),
    ];
    const appBackupCandidates = integrations.filter((integration) =>
      ['CRM', 'WORKFLOW', 'AI', 'AFFILIATE', 'STORAGE'].includes(
        integration.category,
      ),
    );

    const backupStatus =
      backupTargetRefs.length > 0 && policiesMissingBackupTarget.length === 0
        ? 'backup-targets-ready'
        : backupTargetRefs.length > 0
          ? 'backup-targets-partial'
          : 'backup-targets-not-declared';
    const restoreModes = [
      'config-only',
      'workflow-bundle',
      'skill-plugin-addon-bundle',
      'database-snapshot',
      'app-specific-export',
      'tenant-workspace-restore',
    ];
    const approvalRequiredFor = [
      'database-snapshot',
      'app-specific-export',
      'tenant-workspace-restore',
    ];
    const blockers = [
      ...(backupTargetRefs.length === 0 ? ['backup-target:missing'] : []),
      ...(policiesMissingBackupTarget.length > 0
        ? ['storage-policies-without-backup-target']
        : []),
      'backup-schedule:not-configured',
      'restore-preview:not-implemented',
    ];
    const recommendations = [
      'add-local-or-user-cloud-backup-target',
      'configure-user-and-admin-backup-schedules',
      'define-workflow-skill-plugin-addon-portability-bundle',
      'assess-nexovaflow-and-other-app-specific-export-adapters',
      'require-approval-for-destructive-restores',
    ];
    const setupReviewStatus =
      blockers.length > 0
        ? 'operator-configuration-required'
        : 'ready-for-schedule-preview';
    const setupPrimaryActionKey =
      blockers[0] ?? 'backup-schedule:preview-configuration';
    const setupContract = {
      contractVersion: 'backup-readiness-setup.v1',
      sourceSurface: 'GET /integrations/backup-readiness',
      consumerSurfaces: [
        'operator-ui-control-plane',
        'local-runtime-reality-checks',
        'backup-center-foundation',
      ],
      reviewStatus: setupReviewStatus,
      displaySummary: {
        title: `${tenant.name} backup readiness`,
        subtitle:
          'Backup coverage is visible for review before schedules, restore previews, or external writes are enabled.',
        statusLabel:
          backupStatus === 'backup-targets-ready'
            ? 'Targets ready'
            : 'Setup needed',
      },
      primaryActionKey: setupPrimaryActionKey,
      requiredActionKeys: blockers,
      recommendedActionKeys: recommendations,
      runtimeHandoff: {
        mode: 'preview-only',
        previewEndpoint: 'GET /integrations/backup-readiness',
        requiredInputKeys: ['tenantSlug'],
        schedulePersistenceAllowed: false,
        restoreExecutionAllowed: false,
        externalCloudWritesAllowed: false,
        approvalRequiredFor,
      },
    };
    const setupIntent = {
      intentVersion: 'backup-center-setup-intent.v1',
      sourceContractVersion: setupContract.contractVersion,
      sourceSurface: setupContract.sourceSurface,
      mode: 'preview-only',
      intentKey: `${tenant.slug}:backup-center:setup-preview`,
      status:
        blockers.length > 0
          ? 'blocked-before-decision'
          : 'awaiting-operator-decision',
      decisionScope: 'backup-center-setup-preview',
      primaryDecisionKey: setupPrimaryActionKey,
      allowedDecisions:
        blockers.length > 0
          ? ['resolve-required-actions', 'defer-setup']
          : [
              'preview-schedule-configuration',
              'request-setup-changes',
              'defer-setup',
            ],
      defaultDecision:
        blockers.length > 0
          ? 'resolve-required-actions'
          : 'preview-schedule-configuration',
      projectedOutcome:
        blockers.length > 0
          ? 'operator-configuration-required'
          : 'schedule-preview-ready',
      derivedFrom: {
        backupStatus,
        requiredActionKeys: setupContract.requiredActionKeys,
        recommendedActionKeys: setupContract.recommendedActionKeys,
      },
      decisionProjection: {
        status: 'preview-only',
        recordable: false,
        persistenceAllowed: false,
        schedulePersistenceAllowed: false,
        restoreExecutionAllowed: false,
        credentialStorageAllowed: false,
        externalCloudWritesAllowed: false,
      },
      targetSummary: {
        declaredTargetCount: backupTargetRefs.length,
        policyCount: storagePolicies.length,
        policiesMissingBackupTargetCount: policiesMissingBackupTarget.length,
      },
    };

    return {
      capability: 'integrations',
      surface: 'backup-readiness',
      status: 'resolved',
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
      },
      backup: {
        status: backupStatus,
        schedule: {
          status: 'not-configured',
          supportedCadences: ['manual', 'daily', 'weekly', 'monthly'],
          next: 'persist-user-and-admin-backup-schedules',
        },
        targets: backupTargetRefs.map((targetRef) => ({
          targetRef,
          targetClass: this.classifyBackupTarget(targetRef),
          policyKeys: policiesWithBackupTarget
            .filter((policy) => policy.backupTargetRef === targetRef)
            .map((policy) => policy.key),
        })),
        scopes: [
          {
            key: 'database',
            status:
              backupTargetRefs.length > 0
                ? 'target-declared'
                : 'target-missing',
            source: 'tenant-storage-policy',
          },
          {
            key: 'workflow-skill-plugin-addon-config',
            status: 'contract-needed',
            source: 'aifut-control-plane',
          },
          {
            key: 'app-specific-snapshots',
            status:
              appBackupCandidates.length > 0
                ? 'adapter-assessment-needed'
                : 'no-app-candidates-detected',
            source: 'connected-app-adapters',
            candidates: appBackupCandidates.map((integration) => ({
              slug: integration.slug,
              provider: integration.provider,
              category: integration.category,
              status: integration.status,
              workspace: integration.workspace,
            })),
          },
        ],
        storagePolicies: {
          total: storagePolicies.length,
          withBackupTarget: policiesWithBackupTarget.length,
          missingBackupTarget: policiesMissingBackupTarget.map((policy) => ({
            key: policy.key,
            mode: policy.mode,
            workspace: policy.workspace,
          })),
        },
        entitlements,
        restore: {
          status: 'manual-governance-needed',
          modes: restoreModes,
          approvalRequiredFor,
        },
        blockers,
        recommendations,
        setupContract,
        setupIntent,
      },
    };
  }

  private classifyBackupTarget(targetRef: string) {
    const normalizedTargetRef = targetRef.trim().toLowerCase();

    if (
      normalizedTargetRef.startsWith('gdrive://') ||
      normalizedTargetRef.startsWith('google-drive://')
    ) {
      return 'user-google-drive';
    }

    if (
      normalizedTargetRef.startsWith('file://') ||
      normalizedTargetRef.startsWith('local://')
    ) {
      return 'user-local';
    }

    if (
      normalizedTargetRef.startsWith('s3://') ||
      normalizedTargetRef.startsWith('b2://') ||
      normalizedTargetRef.startsWith('r2://')
    ) {
      return 'user-object-storage';
    }

    return normalizedTargetRef.includes('platform')
      ? 'aifut-managed'
      : 'external-or-custom';
  }

  private async resolveTenant(tenantSlug?: string) {
    const normalizedTenantSlug = tenantSlug?.trim().toLowerCase();

    if (!normalizedTenantSlug) {
      throw new BadRequestException(
        'Missing tenant slug. Provide x-tenant-slug header or tenantSlug query param.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: normalizedTenantSlug },
      select: {
        id: true,
        slug: true,
        name: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        `Tenant not found for slug: ${normalizedTenantSlug}`,
      );
    }

    return tenant;
  }
}

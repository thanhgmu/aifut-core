import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { evaluateTenantDomainReadiness } from './tenant-domain-readiness';

type BackupSetupPreviewValues = Record<string, unknown>;

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
        previewEndpoint: 'POST /integrations/backup-setup-preview',
        requiredInputKeys: ['tenantSlug'],
        schedulePersistenceAllowed: false,
        restoreExecutionAllowed: false,
        externalCloudWritesAllowed: false,
        approvalRequiredFor,
      },
    };
    const setupFormSchema = {
      schemaVersion: 'backup-center-setup-form.v1',
      mode: 'preview-only',
      projectionOnly: true,
      persistenceAllowed: false,
      credentialStorageAllowed: false,
      restoreExecutionAllowed: false,
      externalCloudWritesAllowed: false,
      inputGroups: [
        {
          key: 'backup-target',
          title: 'Backup target',
          purpose: 'Collect non-secret target metadata for readiness review.',
          requiredActionKeys:
            backupTargetRefs.length === 0 ? ['backup-target:missing'] : [],
          fields: [
            {
              key: 'targetClass',
              label: 'Target class',
              type: 'select',
              required: true,
              options: [
                'user-local',
                'user-google-drive',
                'cloud-object-storage',
                'custom-target',
              ],
              previewOnly: true,
            },
            {
              key: 'targetRefPreview',
              label: 'Target reference preview',
              type: 'text',
              required: backupTargetRefs.length === 0,
              sensitive: false,
              placeholder: 'local://team-backups or gdrive://folder-name',
              previewOnly: true,
              persistenceAllowed: false,
            },
            {
              key: 'policyKeys',
              label: 'Storage policies to cover',
              type: 'multi-select',
              required: policiesMissingBackupTarget.length > 0,
              options: storagePolicies.map((policy) => policy.key),
              previewOnly: true,
            },
          ],
        },
        {
          key: 'schedule',
          title: 'Schedule',
          purpose:
            'Preview cadence and retention inputs without creating jobs.',
          requiredActionKeys: ['backup-schedule:not-configured'],
          fields: [
            {
              key: 'cadence',
              label: 'Cadence',
              type: 'select',
              required: true,
              options: ['manual', 'daily', 'weekly', 'monthly'],
              previewOnly: true,
              persistenceAllowed: false,
            },
            {
              key: 'timezone',
              label: 'Timezone',
              type: 'text',
              required: true,
              previewOnly: true,
            },
            {
              key: 'retentionDays',
              label: 'Retention days',
              type: 'number',
              required: true,
              min: 1,
              previewOnly: true,
            },
          ],
        },
        {
          key: 'portability-bundle',
          title: 'Portability bundle',
          purpose:
            'Preview export coverage for workflow, skill, plugin, and addon configuration.',
          requiredActionKeys: [],
          recommendedActionKeys: [
            'define-workflow-skill-plugin-addon-portability-bundle',
          ],
          fields: [
            {
              key: 'includedConfigScopes',
              label: 'Configuration scopes',
              type: 'multi-select',
              required: true,
              options: [
                'workflows',
                'skills',
                'plugins',
                'addons',
                'tenant-settings',
              ],
              previewOnly: true,
            },
            {
              key: 'bundleFormat',
              label: 'Bundle format',
              type: 'select',
              required: true,
              options: ['manifest-and-archive', 'manifest-only'],
              previewOnly: true,
            },
          ],
        },
        {
          key: 'adapter-assessment',
          title: 'Adapter assessment',
          purpose: 'Review connected app backup/export adapter readiness.',
          requiredActionKeys:
            appBackupCandidates.length > 0
              ? ['app-specific-export-adapters:assess']
              : [],
          recommendedActionKeys: [
            'assess-nexovaflow-and-other-app-specific-export-adapters',
          ],
          fields: [
            {
              key: 'connectionSlugs',
              label: 'Connections to assess',
              type: 'multi-select',
              required: appBackupCandidates.length > 0,
              options: appBackupCandidates.map(
                (integration) => integration.slug,
              ),
              previewOnly: true,
            },
            {
              key: 'adapterDecision',
              label: 'Adapter decision',
              type: 'select',
              required: appBackupCandidates.length > 0,
              options: [
                'native-export-available',
                'manual-export-required',
                'exclude-from-backup',
              ],
              previewOnly: true,
              externalWritesAllowed: false,
            },
          ],
        },
        {
          key: 'restore-approval-review',
          title: 'Restore approval review',
          purpose:
            'Preview approvals required before destructive restore paths.',
          requiredActionKeys: ['restore-preview:not-implemented'],
          recommendedActionKeys: ['require-approval-for-destructive-restores'],
          fields: [
            {
              key: 'approvalRequiredFor',
              label: 'Approval required for',
              type: 'multi-select',
              required: true,
              options: approvalRequiredFor,
              previewOnly: true,
              restoreExecutionAllowed: false,
            },
            {
              key: 'approverRole',
              label: 'Approver role',
              type: 'text',
              required: true,
              previewOnly: true,
            },
          ],
        },
      ],
    };
    const persistenceDesignLock = {
      schemaVersion: 'backup-center-persistence-design-lock.v1',
      mode: 'preview-only',
      migrationRequired: true,
      sourceSurface: 'GET /integrations/backup-readiness',
      lockedWriteZones: [
        'prisma-schema',
        'database-migrations',
        'backup-schedule-worker',
        'credential-storage-boundary',
        'restore-execution-boundary',
        'external-cloud-write-boundary',
      ],
      proposedTables: [
        {
          name: 'tenant_backup_setup',
          purpose:
            'Persist tenant-level backup center setup review state and selected coverage scopes.',
          requiredBeforeWrites: [
            'Prisma model reviewed',
            'migration reviewed',
            'tenant ownership enforced',
          ],
        },
        {
          name: 'tenant_backup_schedule',
          purpose:
            'Persist cadence, timezone, retention, and enabled state without embedding credentials.',
          requiredBeforeWrites: [
            'schedule worker contract reviewed',
            'idempotency rules defined',
            'operator enablement gate added',
          ],
        },
        {
          name: 'tenant_backup_target',
          purpose:
            'Persist non-secret target metadata and references to separately governed credential material.',
          requiredBeforeWrites: [
            'credential boundary reviewed',
            'secret storage excluded from readiness payloads',
            'target ownership validation defined',
          ],
        },
        {
          name: 'tenant_restore_approval_review',
          purpose:
            'Persist restore approval policy and review state before any restore execution path exists.',
          requiredBeforeWrites: [
            'destructive restore approval flow reviewed',
            'audit trail requirements defined',
            'restore execution remains separately gated',
          ],
        },
      ],
      guardrails: {
        projectionOnly: true,
        persistenceAllowed: false,
        databaseWritesAllowed: false,
        prismaSchemaWritesAllowed: false,
        migrationWritesAllowed: false,
        schedulePersistenceAllowed: false,
        scheduleExecutionAllowed: false,
        credentialStorageAllowed: false,
        restoreExecutionAllowed: false,
        externalCloudWritesAllowed: false,
      },
      acceptanceCriteria: [
        'readiness response exposes this design lock without creating or updating database rows',
        'future implementation adds reviewed Prisma schema and migration before persistence is enabled',
        'schedule configuration writes remain disabled until a reviewed worker contract exists',
        'credential material is stored only through an approved secret boundary and never in readiness payloads',
        'restore execution remains disabled until approval review, audit, and rollback criteria are implemented',
        'external cloud writes require explicit target ownership validation and operator approval',
      ],
    };
    const persistencePrerequisiteReview =
      this.buildBackupPersistencePrerequisiteReview(persistenceDesignLock);
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
      persistenceDesignLock,
      persistencePrerequisiteReview,
      formSchema: setupFormSchema,
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

  async previewBackupSetup(params: {
    tenantSlug?: string;
    values?: BackupSetupPreviewValues;
    decision?: string;
  }) {
    const readiness = await this.getBackupReadinessPolicy(params.tenantSlug);
    const setupIntent = readiness.backup.setupIntent;
    const formSchema = setupIntent.formSchema;
    const values = params.values ?? {};
    const allowedDecisions = setupIntent.allowedDecisions;
    const requestedDecision = params.decision ?? setupIntent.defaultDecision;
    const fieldReviews = formSchema.inputGroups.flatMap((group) =>
      group.fields.map((field) => {
        const value = values[field.key];
        const issues = this.validateBackupSetupField(field, value);

        return {
          groupKey: group.key,
          fieldKey: field.key,
          status: issues.length > 0 ? 'invalid' : 'accepted-for-preview',
          issues,
          previewOnly: true,
          persistenceAllowed: false,
          credentialStorageAllowed: false,
          restoreExecutionAllowed: false,
          externalWritesAllowed: false,
        };
      }),
    );
    const decisionIssues = allowedDecisions.includes(requestedDecision)
      ? []
      : [`decision:not-allowed:${requestedDecision}`];
    const validationIssues = [
      ...fieldReviews.flatMap((review) => review.issues),
      ...decisionIssues,
    ];
    const requiredFieldReviews = fieldReviews.filter((review) =>
      formSchema.inputGroups
        .find((group) => group.key === review.groupKey)
        ?.fields.find(
          (field) => field.key === review.fieldKey && field.required,
        ),
    );
    const missingInputKeys = fieldReviews
      .filter((review) =>
        review.issues.some((issue) => issue.endsWith(':required')),
      )
      .map((review) => review.fieldKey);
    const invalidInputKeys = fieldReviews
      .filter(
        (review) =>
          review.status === 'invalid' &&
          !review.issues.some((issue) => issue.endsWith(':required')),
      )
      .map((review) => review.fieldKey);
    const previewStatus =
      validationIssues.length > 0 ? 'validation-required' : 'resolved';
    const inputSummary = {
      requiredCount: requiredFieldReviews.length,
      providedCount: requiredFieldReviews.length - missingInputKeys.length,
      missingInputKeys,
      invalidInputKeys,
    };
    const previewBlockers = [
      ...validationIssues,
      'persistence:not-enabled',
      'schedule-execution:not-enabled',
      'credential-storage:not-enabled',
      'restore-execution:not-enabled',
      'external-cloud-writes:not-enabled',
    ];
    const nextActions = [
      ...setupIntent.derivedFrom.requiredActionKeys.map((actionKey, index) => ({
        actionKey,
        actionOrder: index + 1,
        actionStatus:
          requestedDecision === 'defer-setup'
            ? 'deferred-for-preview'
            : validationIssues.length > 0
              ? 'input-validation-required'
              : 'accepted-for-preview',
        reason:
          requestedDecision === 'defer-setup'
            ? 'operator-deferred-setup'
            : 'preview-only-no-persistence',
        missingInputKeys,
        invalidInputKeys,
      })),
      ...setupIntent.derivedFrom.recommendedActionKeys.map(
        (actionKey, index) => ({
          actionKey,
          actionOrder:
            setupIntent.derivedFrom.requiredActionKeys.length + index + 1,
          actionStatus: 'recommended-for-review',
          reason: 'operator-review-before-persistence',
          missingInputKeys: [],
          invalidInputKeys: [],
        }),
      ),
    ];

    return {
      capability: 'integrations',
      surface: 'backup-setup-preview',
      status: previewStatus,
      mode: 'preview-only',
      tenant: readiness.tenant,
      preview: {
        contractVersion: setupIntent.sourceContractVersion,
        formSchemaVersion: formSchema.schemaVersion,
        sourceSurface: 'POST /integrations/backup-setup-preview',
        derivedFromSurface: readiness.backup.setupContract.sourceSurface,
        decisionScope: setupIntent.decisionScope,
        requestedDecision,
        decisionStatus:
          decisionIssues.length > 0 ? 'not-allowed' : 'accepted-for-preview',
        allowedDecisions,
        projectedOutcome:
          validationIssues.length > 0
            ? 'operator-input-validation-required'
            : setupIntent.projectedOutcome,
        requiredActionKeys: setupIntent.derivedFrom.requiredActionKeys,
        recommendedActionKeys: setupIntent.derivedFrom.recommendedActionKeys,
        inputSummary,
        persistencePrerequisiteReview:
          setupIntent.persistencePrerequisiteReview,
        reviewSummary: {
          statusLabel:
            previewStatus === 'resolved'
              ? 'Ready for preview'
              : 'Validation required',
          status: previewStatus,
          previewOnly: true,
          activationAllowed: false,
          externalActionsAllowed: false,
          validationIssueCount: validationIssues.length,
          missingInputCount: missingInputKeys.length,
          invalidInputCount: invalidInputKeys.length,
          requiredActionCount:
            setupIntent.derivedFrom.requiredActionKeys.length,
          recommendedActionCount:
            setupIntent.derivedFrom.recommendedActionKeys.length,
          blockers: previewBlockers,
          nextActions,
          decisionSummary: {
            configuredCount:
              requestedDecision === 'defer-setup'
                ? 0
                : validationIssues.length > 0
                  ? inputSummary.providedCount
                  : setupIntent.derivedFrom.requiredActionKeys.length,
            unresolvedCount:
              missingInputKeys.length +
              invalidInputKeys.length +
              decisionIssues.length,
            deferredCount:
              requestedDecision === 'defer-setup'
                ? setupIntent.derivedFrom.requiredActionKeys.length
                : 0,
          },
          inputSummary,
          persistenceAllowed: false,
          schedulePersistenceAllowed: false,
          restoreExecutionAllowed: false,
          credentialStorageAllowed: false,
          externalCloudWritesAllowed: false,
          safety: {
            persistenceAllowed: false,
            schedulePersistenceAllowed: false,
            restoreExecutionAllowed: false,
            credentialStorageAllowed: false,
            externalCloudWritesAllowed: false,
          },
        },
        fieldReviews,
        validationIssues,
      },
      safety: {
        projectionOnly: true,
        persistenceAllowed: false,
        schedulePersistenceAllowed: false,
        restoreExecutionAllowed: false,
        credentialStorageAllowed: false,
        externalCloudWritesAllowed: false,
        databaseWritesAllowed: false,
        disallowedActions: [
          'persist-backup-setup',
          'persist-backup-schedule',
          'execute-restore',
          'store-credentials',
          'write-external-cloud-target',
        ],
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

  private buildBackupPersistencePrerequisiteReview(designLock: {
    schemaVersion: string;
    lockedWriteZones: string[];
    proposedTables: Array<{
      name: string;
      requiredBeforeWrites: string[];
    }>;
    guardrails: Record<string, boolean>;
    acceptanceCriteria: string[];
  }) {
    const blockedGuardrails = Object.entries(designLock.guardrails)
      .filter(([key, value]) => key.endsWith('Allowed') && value === false)
      .map(([key]) => key);
    const requiredReviewItems = designLock.proposedTables.flatMap((table) =>
      table.requiredBeforeWrites.map((requirement) => ({
        table: table.name,
        requirement,
        status: 'pending-review',
      })),
    );

    return {
      reviewVersion: 'backup-center-persistence-prerequisite-review.v1',
      sourceDesignLockVersion: designLock.schemaVersion,
      mode: 'preview-only',
      status: 'blocked-until-reviewed',
      writeReadiness: 'not-ready',
      migrationReadiness: 'not-ready',
      lockedWriteZoneCount: designLock.lockedWriteZones.length,
      proposedTableCount: designLock.proposedTables.length,
      pendingReviewCount: requiredReviewItems.length,
      blockedGuardrails,
      requiredReviewItems,
      acceptanceCriteriaCount: designLock.acceptanceCriteria.length,
      nextSafeAction:
        'review-prisma-schema-and-migration-before-enabling-backup-persistence',
      guardrails: {
        persistenceAllowed: false,
        databaseWritesAllowed: false,
        migrationWritesAllowed: false,
        scheduleExecutionAllowed: false,
        credentialStorageAllowed: false,
        restoreExecutionAllowed: false,
        externalCloudWritesAllowed: false,
      },
    };
  }

  private validateBackupSetupField(
    field: {
      key: string;
      type: string;
      required?: boolean;
      options?: string[];
      min?: number;
    },
    value: unknown,
  ) {
    const issues: string[] = [];
    const missing =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (field.required && missing) {
      issues.push(`${field.key}:required`);
      return issues;
    }

    if (missing) {
      return issues;
    }

    if (field.type === 'select') {
      if (typeof value !== 'string') {
        issues.push(`${field.key}:must-be-string`);
      } else if (field.options && !field.options.includes(value)) {
        issues.push(`${field.key}:option-not-allowed`);
      }
    }

    if (field.type === 'multi-select') {
      if (!Array.isArray(value)) {
        issues.push(`${field.key}:must-be-array`);
      } else if (field.options) {
        const invalidOptions = value.filter(
          (option) =>
            typeof option !== 'string' || !field.options?.includes(option),
        );

        if (invalidOptions.length > 0) {
          issues.push(`${field.key}:contains-option-not-allowed`);
        }
      }
    }

    if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push(`${field.key}:must-be-number`);
      } else if (field.min !== undefined && value < field.min) {
        issues.push(`${field.key}:below-minimum:${field.min}`);
      }
    }

    if (field.type === 'text' && typeof value !== 'string') {
      issues.push(`${field.key}:must-be-string`);
    }

    return issues;
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

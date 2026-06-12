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
    const readinessRequiredFieldCount = setupFormSchema.inputGroups.reduce(
      (count, group) =>
        count + group.fields.filter((field) => field.required).length,
      0,
    );
    const readinessReviewSummary = {
      statusLabel: setupContract.displaySummary.statusLabel,
      status: setupContract.reviewStatus,
      previewOnly: true,
      activationAllowed: false,
      externalActionsAllowed: false,
      validationIssueCount: 0,
      missingInputCount: readinessRequiredFieldCount,
      invalidInputCount: 0,
      requiredActionCount: setupContract.requiredActionKeys.length,
      recommendedActionCount: setupContract.recommendedActionKeys.length,
      blockers: [
        ...blockers,
        'persistence:not-enabled',
        'schedule-execution:not-enabled',
        'credential-storage:not-enabled',
        'restore-execution:not-enabled',
        'external-cloud-writes:not-enabled',
      ],
      nextActions: [
        ...setupContract.requiredActionKeys.map((actionKey, index) => ({
          actionKey,
          actionOrder: index + 1,
          actionStatus: 'required-before-persistence',
          reason: 'readiness-summary-before-preview-submit',
          missingInputKeys: [],
          invalidInputKeys: [],
        })),
        ...setupContract.recommendedActionKeys.map((actionKey, index) => ({
          actionKey,
          actionOrder: setupContract.requiredActionKeys.length + index + 1,
          actionStatus: 'recommended-for-review',
          reason: 'operator-review-before-persistence',
          missingInputKeys: [],
          invalidInputKeys: [],
        })),
      ],
      decisionSummary: {
        configuredCount: 0,
        unresolvedCount: setupContract.requiredActionKeys.length,
        deferredCount: 0,
      },
      inputSummary: {
        requiredCount: readinessRequiredFieldCount,
        providedCount: 0,
        missingInputKeys: setupFormSchema.inputGroups.flatMap((group) =>
          group.fields
            .filter((field) => field.required)
            .map((field) => field.key),
        ),
        invalidInputKeys: [],
      },
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
    };
    const activationGates = [
      {
        key: 'operator-input-preview',
        label: 'Operator input preview',
        status: 'pending',
        requiredBefore: 'persist-backup-setup',
        evidence: 'Submit and review preview-only Backup Center setup inputs.',
      },
      {
        key: 'prisma-schema-review',
        label: 'Prisma schema review',
        status: 'blocked',
        requiredBefore: 'database-migration',
        evidence: 'No backup persistence Prisma schema has been reviewed yet.',
      },
      {
        key: 'migration-review',
        label: 'Migration review',
        status: 'blocked',
        requiredBefore: 'database-writes',
        evidence: 'No backup persistence migration has been reviewed yet.',
      },
      {
        key: 'schedule-worker-contract',
        label: 'Schedule worker contract',
        status: 'blocked',
        requiredBefore: 'schedule-execution',
        evidence: 'Schedule persistence and execution remain disabled.',
      },
      {
        key: 'credential-boundary',
        label: 'Credential boundary',
        status: 'blocked',
        requiredBefore: 'backup-target-credentials',
        evidence:
          'Credential storage remains disabled and excluded from readiness payloads.',
      },
      {
        key: 'restore-approval-flow',
        label: 'Restore approval flow',
        status: 'blocked',
        requiredBefore: 'restore-execution',
        evidence:
          'Restore execution remains disabled until approval and audit criteria are reviewed.',
      },
      {
        key: 'external-write-approval',
        label: 'External write approval',
        status: 'blocked',
        requiredBefore: 'external-cloud-writes',
        evidence:
          'External cloud writes remain disabled until target ownership validation is reviewed.',
      },
    ];
    const summarizeActivationPhase = (phase: {
      phaseKey: string;
      title: string;
      status: string;
      gateKeys: string[];
      nextGateKey: string;
    }) => {
      const phaseGates = activationGates.filter((gate) =>
        phase.gateKeys.includes(gate.key),
      );

      return {
        ...phase,
        gateCount: phaseGates.length,
        blockedGateCount: phaseGates.filter(
          (gate) => gate.status === 'blocked',
        ).length,
        pendingGateCount: phaseGates.filter(
          (gate) => gate.status === 'pending',
        ).length,
        readyGateCount: phaseGates.filter((gate) => gate.status === 'ready')
          .length,
      };
    };
    const activationChecklist = {
      checklistVersion: 'backup-center-activation-checklist.v1',
      mode: 'preview-only',
      status: 'blocked-before-activation',
      activationAllowed: false,
      sourceReviewVersion: persistencePrerequisiteReview.reviewVersion,
      gateSummary: {
        totalGateCount: activationGates.length,
        blockedGateCount: activationGates.filter(
          (gate) => gate.status === 'blocked',
        ).length,
        pendingGateCount: activationGates.filter(
          (gate) => gate.status === 'pending',
        ).length,
        readyGateCount: activationGates.filter(
          (gate) => gate.status === 'ready',
        ).length,
        nextGateKey:
          activationGates.find((gate) => gate.status !== 'ready')?.key ??
          null,
        activationRisk: 'high',
      },
      phaseSummary: [
        summarizeActivationPhase({
          phaseKey: 'preview-review',
          title: 'Preview review',
          status: 'pending',
          gateKeys: ['operator-input-preview'],
          nextGateKey: 'operator-input-preview',
        }),
        summarizeActivationPhase({
          phaseKey: 'persistence-foundation',
          title: 'Persistence foundation',
          status: 'blocked',
          gateKeys: ['prisma-schema-review', 'migration-review'],
          nextGateKey: 'prisma-schema-review',
        }),
        summarizeActivationPhase({
          phaseKey: 'automation-boundaries',
          title: 'Automation boundaries',
          status: 'blocked',
          gateKeys: ['schedule-worker-contract', 'credential-boundary'],
          nextGateKey: 'schedule-worker-contract',
        }),
        summarizeActivationPhase({
          phaseKey: 'restore-and-external-writes',
          title: 'Restore and external writes',
          status: 'blocked',
          gateKeys: ['restore-approval-flow', 'external-write-approval'],
          nextGateKey: 'restore-approval-flow',
        }),
      ],
      phaseBlockerMatrix: [
        {
          phaseKey: 'preview-review',
          title: 'Preview review',
          blockerType: 'preview-evidence-pending',
          blockingGateKeys: ['operator-input-preview'],
          blockingEvidenceKeys: [
            'validated-backup-target-preview',
            'policy-scope-selection',
            'restore-approval-owner',
          ],
          pendingReviewCheckCount: 3,
          nextAction: 'record-preview-evidence-before-submission',
        },
        {
          phaseKey: 'persistence-foundation',
          title: 'Persistence foundation',
          blockerType: 'write-zone-review-required',
          blockingGateKeys: ['prisma-schema-review', 'migration-review'],
          blockingEvidenceKeys: [],
          pendingReviewCheckCount: 0,
          nextAction: 'complete-preview-review-before-opening-prisma-or-migration-work',
        },
        {
          phaseKey: 'automation-boundaries',
          title: 'Automation boundaries',
          blockerType: 'automation-boundary-review-required',
          blockingGateKeys: ['schedule-worker-contract', 'credential-boundary'],
          blockingEvidenceKeys: [],
          pendingReviewCheckCount: 0,
          nextAction: 'complete-preview-review-before-opening-schedule-or-credential-work',
        },
        {
          phaseKey: 'restore-and-external-writes',
          title: 'Restore and external writes',
          blockerType: 'approval-boundary-review-required',
          blockingGateKeys: ['restore-approval-flow', 'external-write-approval'],
          blockingEvidenceKeys: [],
          pendingReviewCheckCount: 0,
          nextAction: 'complete-preview-review-before-opening-restore-or-external-write-work',
        },
      ],
      operatorActionPriority: {
        priorityVersion: 'backup-center-operator-action-priority.v1',
        status: 'preview-action-queue-ready',
        prioritizationRule: 'preview-unblock-plan-order-with-current-blocker-tie',
        recommendedFirstAction: 'fill-preview-only-setup-form',
        actions: [
          {
            actionKey: 'fill-preview-only-setup-form',
            rank: 1,
            priorityReason:
              'first-missing-preview-evidence-in-current-unblock-plan',
            clearsEvidenceKeys: ['validated-backup-target-preview'],
            clearsReviewCheckKeys: ['target-ownership-confirmed'],
            clearsBlockedReasons: ['validated-backup-target-preview:missing'],
            affectsPhaseKeys: ['preview-review'],
            blockedSignalCount: 4,
          },
          {
            actionKey: 'review-readiness-summary',
            rank: 2,
            priorityReason:
              'second-missing-preview-evidence-in-current-unblock-plan',
            clearsEvidenceKeys: ['policy-scope-selection'],
            clearsReviewCheckKeys: ['backup-scope-clear'],
            clearsBlockedReasons: ['policy-scope-selection:missing'],
            affectsPhaseKeys: ['preview-review'],
            blockedSignalCount: 4,
          },
          {
            actionKey: 'restore-approval-review',
            rank: 3,
            priorityReason:
              'third-missing-preview-evidence-in-current-unblock-plan',
            clearsEvidenceKeys: ['restore-approval-owner'],
            clearsReviewCheckKeys: ['restore-approval-accountable'],
            clearsBlockedReasons: ['restore-approval-owner:missing'],
            affectsPhaseKeys: ['preview-review'],
            blockedSignalCount: 4,
          },
        ],
        nextPriorityAction: 'fill-preview-only-setup-form',
      },
      submissionImpactForecast: {
        forecastVersion: 'backup-center-submission-impact-forecast.v1',
        status: 'projected-preview-unblock-sequence',
        currentMissingEvidenceCount: 3,
        currentPendingReviewCheckCount: 3,
        currentBlockedReasonCount: 3,
        sequence: [
          {
            actionKey: 'fill-preview-only-setup-form',
            rank: 1,
            clearedEvidenceKey: 'validated-backup-target-preview',
            projectedMissingEvidenceCount: 2,
            projectedPendingReviewCheckCount: 2,
            projectedBlockedReasonCount: 2,
            projectedSubmissionAllowed: false,
          },
          {
            actionKey: 'review-readiness-summary',
            rank: 2,
            clearedEvidenceKey: 'policy-scope-selection',
            projectedMissingEvidenceCount: 1,
            projectedPendingReviewCheckCount: 1,
            projectedBlockedReasonCount: 1,
            projectedSubmissionAllowed: false,
          },
          {
            actionKey: 'restore-approval-review',
            rank: 3,
            clearedEvidenceKey: 'restore-approval-owner',
            projectedMissingEvidenceCount: 0,
            projectedPendingReviewCheckCount: 0,
            projectedBlockedReasonCount: 0,
            projectedSubmissionAllowed: true,
          },
        ],
        forecastNote:
          'Projection assumes each ranked preview action records its linked evidence and satisfies the matching review signal.',
        nextForecastAction: 'fill-preview-only-setup-form',
      },
      previewSubmissionUnlockMatrix: {
        matrixVersion: 'backup-center-preview-submission-unlock-matrix.v1',
        status: 'preview-submission-unlocks-pending',
        unlockCount: 3,
        unlockedCount: 0,
        rows: [
          {
            unlockKey: 'all-preview-evidence-recorded',
            label: 'All preview evidence recorded',
            status: 'blocked',
            remainingCount: 3,
            evidenceKeys: [
              'validated-backup-target-preview',
              'policy-scope-selection',
              'restore-approval-owner',
            ],
            blockedReasons: [
              'validated-backup-target-preview:missing',
              'policy-scope-selection:missing',
              'restore-approval-owner:missing',
            ],
            nextAction: 'record-preview-evidence-before-submission',
          },
          {
            unlockKey: 'all-preview-evidence-checks-passed',
            label: 'All preview evidence checks passed',
            status: 'blocked',
            remainingCount: 3,
            reviewCheckKeys: [
              'target-ownership-confirmed',
              'backup-scope-clear',
              'restore-approval-accountable',
            ],
            requiredSignals: [
              'owner-confirmation-present',
              'scope-key-and-reason-present',
              'owner-role-and-channel-present',
            ],
            nextAction: 'review-preview-evidence-before-submission',
          },
          {
            unlockKey: 'preview-review-packet-complete',
            label: 'Preview review packet complete',
            status: 'blocked',
            remainingCount: 3,
            packetItemKeys: [
              'operator-readiness-digest',
              'validated-backup-target-preview',
              'policy-scope-selection',
              'restore-approval-owner',
            ],
            missingPacketItemKeys: [
              'validated-backup-target-preview',
              'policy-scope-selection',
              'restore-approval-owner',
            ],
            nextAction: 'assemble-preview-review-packet-before-submission',
          },
        ],
        nextUnlockAction: 'record-preview-evidence-before-submission',
      },
      previewActionUnlockCoverage: {
        coverageVersion: 'backup-center-preview-action-unlock-coverage.v1',
        status: 'preview-actions-linked-to-unlocks',
        recommendedAction: 'fill-preview-only-setup-form',
        actions: [
          {
            actionKey: 'fill-preview-only-setup-form',
            rank: 1,
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            advancesEvidenceKeys: ['validated-backup-target-preview'],
            advancesReviewCheckKeys: ['target-ownership-confirmed'],
            clearsPacketItemKeys: ['validated-backup-target-preview'],
            unlockSignalCount: 3,
          },
          {
            actionKey: 'review-readiness-summary',
            rank: 2,
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            advancesEvidenceKeys: ['policy-scope-selection'],
            advancesReviewCheckKeys: ['backup-scope-clear'],
            clearsPacketItemKeys: ['policy-scope-selection'],
            unlockSignalCount: 3,
          },
          {
            actionKey: 'restore-approval-review',
            rank: 3,
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            advancesEvidenceKeys: ['restore-approval-owner'],
            advancesReviewCheckKeys: ['restore-approval-accountable'],
            clearsPacketItemKeys: ['restore-approval-owner'],
            unlockSignalCount: 3,
          },
        ],
        nextCoverageAction: 'fill-preview-only-setup-form',
      },
      previewUnlockProgression: {
        progressionVersion: 'backup-center-preview-unlock-progression.v1',
        status: 'unlock-conditions-projected-across-ranked-actions',
        currentBlockedUnlockCount: 3,
        steps: [
          {
            actionKey: 'fill-preview-only-setup-form',
            rank: 1,
            remainingBlockedUnlockCount: 3,
            clearedUnlockKeys: [],
            resultingSubmissionAllowed: false,
          },
          {
            actionKey: 'review-readiness-summary',
            rank: 2,
            remainingBlockedUnlockCount: 3,
            clearedUnlockKeys: [],
            resultingSubmissionAllowed: false,
          },
          {
            actionKey: 'restore-approval-review',
            rank: 3,
            remainingBlockedUnlockCount: 0,
            clearedUnlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            resultingSubmissionAllowed: true,
          },
        ],
        nextProgressionAction: 'fill-preview-only-setup-form',
      },
      previewEvidenceUnlockDependencies: {
        dependencyVersion: 'backup-center-preview-evidence-unlock-dependencies.v1',
        status: 'evidence-linked-to-unlock-conditions',
        itemCount: 3,
        rows: [
          {
            evidenceKey: 'validated-backup-target-preview',
            actionKey: 'fill-preview-only-setup-form',
            reviewCheckKey: 'target-ownership-confirmed',
            packetItemKey: 'validated-backup-target-preview',
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            dependencyCount: 3,
          },
          {
            evidenceKey: 'policy-scope-selection',
            actionKey: 'review-readiness-summary',
            reviewCheckKey: 'backup-scope-clear',
            packetItemKey: 'policy-scope-selection',
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            dependencyCount: 3,
          },
          {
            evidenceKey: 'restore-approval-owner',
            actionKey: 'restore-approval-review',
            reviewCheckKey: 'restore-approval-accountable',
            packetItemKey: 'restore-approval-owner',
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            dependencyCount: 3,
          },
        ],
        nextDependencyAction: 'fill-preview-only-setup-form',
      },
      previewReviewCheckCoverage: {
        coverageVersion: 'backup-center-preview-review-check-coverage.v1',
        status: 'review-checks-linked-to-evidence-packets-and-unlocks',
        checkCount: 3,
        rows: [
          {
            reviewCheckKey: 'target-ownership-confirmed',
            evidenceKey: 'validated-backup-target-preview',
            actionKey: 'fill-preview-only-setup-form',
            requiredSignals: ['owner-confirmation-present'],
            packetItemKey: 'validated-backup-target-preview',
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            dependencyCount: 3,
          },
          {
            reviewCheckKey: 'backup-scope-clear',
            evidenceKey: 'policy-scope-selection',
            actionKey: 'review-readiness-summary',
            requiredSignals: ['scope-key-and-reason-present'],
            packetItemKey: 'policy-scope-selection',
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            dependencyCount: 3,
          },
          {
            reviewCheckKey: 'restore-approval-accountable',
            evidenceKey: 'restore-approval-owner',
            actionKey: 'restore-approval-review',
            requiredSignals: ['owner-role-and-channel-present'],
            packetItemKey: 'restore-approval-owner',
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            dependencyCount: 3,
          },
        ],
        nextCheckAction: 'fill-preview-only-setup-form',
      },
      previewReviewSignalChecklist: {
        checklistVersion: 'backup-center-preview-review-signal-checklist.v1',
        status: 'preview-review-signals-pending',
        pendingSignalCount: 3,
        rows: [
          {
            reviewCheckKey: 'target-ownership-confirmed',
            signalKey: 'owner-confirmation-present',
            currentStatus: 'missing',
            requiredEvidenceFields: [
              'targetClass',
              'targetRefPreview',
              'ownerConfirmation',
            ],
            missingReason:
              'validated-backup-target-preview evidence has not been submitted for review.',
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            nextOperatorAction: 'fill-preview-only-setup-form',
          },
          {
            reviewCheckKey: 'backup-scope-clear',
            signalKey: 'scope-key-and-reason-present',
            currentStatus: 'missing',
            requiredEvidenceFields: [
              'policyKeys',
              'includedConfigScopes',
              'scopeRationale',
            ],
            missingReason:
              'policy-scope-selection evidence has not been submitted for review.',
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            nextOperatorAction: 'review-readiness-summary',
          },
          {
            reviewCheckKey: 'restore-approval-accountable',
            signalKey: 'owner-role-and-channel-present',
            currentStatus: 'missing',
            requiredEvidenceFields: [
              'approvalRequiredFor',
              'approverRole',
              'approvalChannel',
            ],
            missingReason:
              'restore-approval-owner evidence has not been submitted for review.',
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            nextOperatorAction: 'restore-approval-review',
          },
        ],
        nextSignalAction: 'fill-preview-only-setup-form',
      },
      previewReviewSignalCoverage: {
        coverageVersion: 'backup-center-preview-review-signal-coverage.v1',
        status: 'review-signals-linked-to-checks-evidence-and-unlocks',
        signalCount: 3,
        rows: [
          {
            signalKey: 'owner-confirmation-present',
            reviewCheckKeys: ['target-ownership-confirmed'],
            evidenceKeys: ['validated-backup-target-preview'],
            actionKeys: ['fill-preview-only-setup-form'],
            packetItemKeys: ['validated-backup-target-preview'],
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            dependencyCount: 3,
          },
          {
            signalKey: 'scope-key-and-reason-present',
            reviewCheckKeys: ['backup-scope-clear'],
            evidenceKeys: ['policy-scope-selection'],
            actionKeys: ['review-readiness-summary'],
            packetItemKeys: ['policy-scope-selection'],
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            dependencyCount: 3,
          },
          {
            signalKey: 'owner-role-and-channel-present',
            reviewCheckKeys: ['restore-approval-accountable'],
            evidenceKeys: ['restore-approval-owner'],
            actionKeys: ['restore-approval-review'],
            packetItemKeys: ['restore-approval-owner'],
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            dependencyCount: 3,
          },
        ],
        nextSignalCoverageAction: 'fill-preview-only-setup-form',
      },
      previewReviewFieldCoverage: {
        coverageVersion: 'backup-center-preview-review-field-coverage.v1',
        status: 'review-fields-linked-to-signals-and-actions',
        fieldCount: 9,
        rows: [
          {
            fieldKey: 'targetClass',
            signalKey: 'owner-confirmation-present',
            reviewCheckKey: 'target-ownership-confirmed',
            evidenceKey: 'validated-backup-target-preview',
            actionKey: 'fill-preview-only-setup-form',
            currentStatus: 'missing',
          },
          {
            fieldKey: 'targetRefPreview',
            signalKey: 'owner-confirmation-present',
            reviewCheckKey: 'target-ownership-confirmed',
            evidenceKey: 'validated-backup-target-preview',
            actionKey: 'fill-preview-only-setup-form',
            currentStatus: 'missing',
          },
          {
            fieldKey: 'ownerConfirmation',
            signalKey: 'owner-confirmation-present',
            reviewCheckKey: 'target-ownership-confirmed',
            evidenceKey: 'validated-backup-target-preview',
            actionKey: 'fill-preview-only-setup-form',
            currentStatus: 'missing',
          },
          {
            fieldKey: 'policyKeys',
            signalKey: 'scope-key-and-reason-present',
            reviewCheckKey: 'backup-scope-clear',
            evidenceKey: 'policy-scope-selection',
            actionKey: 'review-readiness-summary',
            currentStatus: 'missing',
          },
          {
            fieldKey: 'includedConfigScopes',
            signalKey: 'scope-key-and-reason-present',
            reviewCheckKey: 'backup-scope-clear',
            evidenceKey: 'policy-scope-selection',
            actionKey: 'review-readiness-summary',
            currentStatus: 'missing',
          },
          {
            fieldKey: 'scopeRationale',
            signalKey: 'scope-key-and-reason-present',
            reviewCheckKey: 'backup-scope-clear',
            evidenceKey: 'policy-scope-selection',
            actionKey: 'review-readiness-summary',
            currentStatus: 'missing',
          },
          {
            fieldKey: 'approvalRequiredFor',
            signalKey: 'owner-role-and-channel-present',
            reviewCheckKey: 'restore-approval-accountable',
            evidenceKey: 'restore-approval-owner',
            actionKey: 'restore-approval-review',
            currentStatus: 'missing',
          },
          {
            fieldKey: 'approverRole',
            signalKey: 'owner-role-and-channel-present',
            reviewCheckKey: 'restore-approval-accountable',
            evidenceKey: 'restore-approval-owner',
            actionKey: 'restore-approval-review',
            currentStatus: 'missing',
          },
          {
            fieldKey: 'approvalChannel',
            signalKey: 'owner-role-and-channel-present',
            reviewCheckKey: 'restore-approval-accountable',
            evidenceKey: 'restore-approval-owner',
            actionKey: 'restore-approval-review',
            currentStatus: 'missing',
          },
        ],
        nextFieldCoverageAction: 'fill-preview-only-setup-form',
      },
      previewReviewFieldActionMap: {
        mapVersion: 'backup-center-preview-review-field-action-map.v1',
        status: 'review-fields-grouped-by-preview-action',
        actionCount: 3,
        totalFieldCount: 9,
        rows: [
          {
            actionKey: 'fill-preview-only-setup-form',
            rank: 1,
            fieldKeys: ['targetClass', 'targetRefPreview', 'ownerConfirmation'],
            signalKey: 'owner-confirmation-present',
            reviewCheckKey: 'target-ownership-confirmed',
            evidenceKey: 'validated-backup-target-preview',
            missingFieldCount: 3,
          },
          {
            actionKey: 'review-readiness-summary',
            rank: 2,
            fieldKeys: ['policyKeys', 'includedConfigScopes', 'scopeRationale'],
            signalKey: 'scope-key-and-reason-present',
            reviewCheckKey: 'backup-scope-clear',
            evidenceKey: 'policy-scope-selection',
            missingFieldCount: 3,
          },
          {
            actionKey: 'restore-approval-review',
            rank: 3,
            fieldKeys: [
              'approvalRequiredFor',
              'approverRole',
              'approvalChannel',
            ],
            signalKey: 'owner-role-and-channel-present',
            reviewCheckKey: 'restore-approval-accountable',
            evidenceKey: 'restore-approval-owner',
            missingFieldCount: 3,
          },
        ],
        nextFieldAction: 'fill-preview-only-setup-form',
      },
      previewReviewActionDependencySummary: {
        summaryVersion:
          'backup-center-preview-review-action-dependency-summary.v1',
        status: 'preview-actions-linked-to-review-dependencies',
        actionCount: 3,
        totalDependencyCount: 18,
        rows: [
          {
            actionKey: 'fill-preview-only-setup-form',
            rank: 1,
            missingFieldKeys: [
              'targetClass',
              'targetRefPreview',
              'ownerConfirmation',
            ],
            reviewCheckKey: 'target-ownership-confirmed',
            signalKey: 'owner-confirmation-present',
            evidenceKey: 'validated-backup-target-preview',
            packetItemKey: 'validated-backup-target-preview',
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            dependencyCount: 6,
          },
          {
            actionKey: 'review-readiness-summary',
            rank: 2,
            missingFieldKeys: [
              'policyKeys',
              'includedConfigScopes',
              'scopeRationale',
            ],
            reviewCheckKey: 'backup-scope-clear',
            signalKey: 'scope-key-and-reason-present',
            evidenceKey: 'policy-scope-selection',
            packetItemKey: 'policy-scope-selection',
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            dependencyCount: 6,
          },
          {
            actionKey: 'restore-approval-review',
            rank: 3,
            missingFieldKeys: [
              'approvalRequiredFor',
              'approverRole',
              'approvalChannel',
            ],
            reviewCheckKey: 'restore-approval-accountable',
            signalKey: 'owner-role-and-channel-present',
            evidenceKey: 'restore-approval-owner',
            packetItemKey: 'restore-approval-owner',
            unlockKeys: [
              'all-preview-evidence-recorded',
              'all-preview-evidence-checks-passed',
              'preview-review-packet-complete',
            ],
            dependencyCount: 6,
          },
        ],
        nextDependencyAction: 'fill-preview-only-setup-form',
      },
      previewReviewDependencyClosure: {
        closureVersion: 'backup-center-preview-review-dependency-closure.v1',
        status: 'preview-review-dependencies-open',
        closureMode: 'all-dependencies-required-before-preview-submission',
        dependencyGroupCount: 3,
        openDependencyGroupCount: 3,
        totalOpenDependencyCount: 18,
        rows: [
          {
            actionKey: 'fill-preview-only-setup-form',
            rank: 1,
            dependencyGroupKey: 'validated-backup-target-preview-closure',
            closureStatus: 'open',
            openDependencyKeys: [
              'targetClass',
              'targetRefPreview',
              'ownerConfirmation',
              'target-ownership-confirmed',
              'owner-confirmation-present',
              'validated-backup-target-preview',
            ],
            unlockKey: 'all-preview-evidence-recorded',
            nextClosureAction: 'fill-preview-only-setup-form',
          },
          {
            actionKey: 'review-readiness-summary',
            rank: 2,
            dependencyGroupKey: 'policy-scope-selection-closure',
            closureStatus: 'open',
            openDependencyKeys: [
              'policyKeys',
              'includedConfigScopes',
              'scopeRationale',
              'backup-scope-clear',
              'scope-key-and-reason-present',
              'policy-scope-selection',
            ],
            unlockKey: 'all-preview-evidence-checks-passed',
            nextClosureAction: 'review-readiness-summary',
          },
          {
            actionKey: 'restore-approval-review',
            rank: 3,
            dependencyGroupKey: 'restore-approval-owner-closure',
            closureStatus: 'open',
            openDependencyKeys: [
              'approvalRequiredFor',
              'approverRole',
              'approvalChannel',
              'restore-approval-accountable',
              'owner-role-and-channel-present',
              'restore-approval-owner',
            ],
            unlockKey: 'preview-review-packet-complete',
            nextClosureAction: 'restore-approval-review',
          },
        ],
        nextClosureAction: 'fill-preview-only-setup-form',
      },
      previewReviewClosureSequence: {
        sequenceVersion: 'backup-center-preview-review-closure-sequence.v1',
        status: 'preview-review-closure-sequence-open',
        sequenceMode: 'close-preview-dependencies-before-submission',
        stepCount: 3,
        completedStepCount: 0,
        remainingStepCount: 3,
        steps: [
          {
            stepKey: 'close-validated-backup-target-preview',
            rank: 1,
            actionKey: 'fill-preview-only-setup-form',
            dependencyGroupKey: 'validated-backup-target-preview-closure',
            closesOpenDependencyCount: 6,
            closesUnlockKey: 'all-preview-evidence-recorded',
            stepStatus: 'pending',
            nextStepAction: 'fill-preview-only-setup-form',
          },
          {
            stepKey: 'close-policy-scope-selection',
            rank: 2,
            actionKey: 'review-readiness-summary',
            dependencyGroupKey: 'policy-scope-selection-closure',
            closesOpenDependencyCount: 6,
            closesUnlockKey: 'all-preview-evidence-checks-passed',
            stepStatus: 'pending',
            nextStepAction: 'review-readiness-summary',
          },
          {
            stepKey: 'close-restore-approval-owner',
            rank: 3,
            actionKey: 'restore-approval-review',
            dependencyGroupKey: 'restore-approval-owner-closure',
            closesOpenDependencyCount: 6,
            closesUnlockKey: 'preview-review-packet-complete',
            stepStatus: 'pending',
            nextStepAction: 'restore-approval-review',
          },
        ],
        finalSequenceAction: 'submit-preview-only-backup-setup-review',
        nextSequenceAction: 'fill-preview-only-setup-form',
      },
      previewReviewClosureHandoff: {
        handoffVersion: 'backup-center-preview-review-closure-handoff.v1',
        status: 'preview-review-closure-handoff-blocked',
        handoffMode: 'operator-closes-sequence-before-preview-submit',
        submissionAction: 'submit-preview-only-backup-setup-review',
        submissionAllowed: false,
        requiredStepCount: 3,
        completedStepCount: 0,
        remainingStepCount: 3,
        firstRequiredStepKey: 'close-validated-backup-target-preview',
        firstRequiredAction: 'fill-preview-only-setup-form',
        handoffBlockers: [
          'closure-sequence:remaining-steps',
          'preview-review-packet:incomplete',
          'submission-unlocks:blocked',
        ],
        readyWhen: [
          'all-closure-steps-complete',
          'preview-review-packet-complete',
          'all-preview-unlocks-cleared',
        ],
        nextHandoffAction: 'fill-preview-only-setup-form',
      },
      previewReviewSubmissionGate: {
        gateVersion: 'backup-center-preview-review-submission-gate.v1',
        status: 'preview-review-submission-gate-closed',
        gateMode: 'preview-only-submit-after-closure-handoff',
        submissionAction: 'submit-preview-only-backup-setup-review',
        submissionAllowed: false,
        closureHandoffStatus: 'preview-review-closure-handoff-blocked',
        requiredClosureStepCount: 3,
        remainingClosureStepCount: 3,
        openGateKeys: [
          'all-preview-evidence-recorded',
          'all-preview-evidence-checks-passed',
          'preview-review-packet-complete',
        ],
        blockedBy: [
          'preview-review-closure-handoff-blocked',
          'all-closure-steps-complete:not-satisfied',
          'submission-unlocks:blocked',
        ],
        finalOperatorAction: 'submit-preview-only-backup-setup-review',
        nextGateAction: 'fill-preview-only-setup-form',
      },
      previewReviewSubmissionGateResolution: {
        resolutionVersion:
          'backup-center-preview-review-submission-gate-resolution.v1',
        status: 'preview-review-submission-gate-resolution-open',
        resolutionMode: 'resolve-open-preview-gates-before-submit',
        openGateCount: 3,
        resolvedGateCount: 0,
        remainingGateCount: 3,
        rows: [
          {
            gateKey: 'all-preview-evidence-recorded',
            gateStatus: 'open',
            requiredClosureStepKey: 'close-validated-backup-target-preview',
            requiredOperatorAction: 'fill-preview-only-setup-form',
            clearsWhen: 'validated-backup-target-preview-recorded',
          },
          {
            gateKey: 'all-preview-evidence-checks-passed',
            gateStatus: 'open',
            requiredClosureStepKey: 'close-policy-scope-selection',
            requiredOperatorAction: 'review-readiness-summary',
            clearsWhen: 'policy-scope-selection-reviewed',
          },
          {
            gateKey: 'preview-review-packet-complete',
            gateStatus: 'open',
            requiredClosureStepKey: 'close-restore-approval-owner',
            requiredOperatorAction: 'restore-approval-review',
            clearsWhen: 'restore-approval-owner-packeted',
          },
        ],
        nextResolutionAction: 'fill-preview-only-setup-form',
      },
      previewReviewSubmissionAttempt: {
        attemptVersion: 'backup-center-preview-review-submission-attempt.v1',
        status: 'preview-review-submission-attempt-blocked',
        attemptMode: 'dry-run-submit-readiness-check',
        submissionAction: 'submit-preview-only-backup-setup-review',
        attemptAllowed: false,
        operatorCanAttemptNow: false,
        blockingGateCount: 3,
        blockingClosureStepCount: 3,
        blockingReasons: [
          'preview-review-closure-handoff-blocked',
          'preview-review-submission-gate-resolution-open',
          'preview-review-packet:incomplete',
        ],
        requiredBeforeAttempt: [
          'resolve-all-preview-submission-gates',
          'complete-preview-review-closure-handoff',
          'complete-preview-review-packet',
        ],
        nextAttemptAction: 'fill-preview-only-setup-form',
      },
      operatorHandoff: {
        handoffVersion: 'backup-center-activation-operator-handoff.v1',
        mode: 'preview-only',
        sourceSurface: 'GET /integrations/backup-readiness',
        previewEndpoint: setupContract.runtimeHandoff.previewEndpoint,
        primaryNextGateKey: 'operator-input-preview',
        primaryNextOperation: 'submit-preview-only-backup-setup-review',
        allowedOperations: [
          'review-readiness-summary',
          'submit-preview-only-backup-setup-review',
          'inspect-activation-gates',
        ],
        disabledOperations: [
          'persist-backup-setup',
          'run-database-migration',
          'persist-backup-schedule',
          'store-backup-credentials',
          'execute-restore',
          'write-external-cloud-target',
        ],
        runbook: {
          runbookVersion: 'backup-center-operator-runbook.v1',
          status: 'preview-review-required',
          nextReviewStep: 'collect-preview-inputs-and-submit-review',
          evidenceRequired: [
            'validated-backup-target-preview',
            'policy-scope-selection',
            'restore-approval-owner',
          ],
          safeSequence: [
            'review-readiness-summary',
            'fill-preview-only-setup-form',
            'submit-preview-only-backup-setup-review',
            'inspect-activation-gates',
          ],
          escalationTriggers: [
            'prisma-schema-review-requested',
            'migration-review-requested',
            'credential-storage-requested',
            'external-cloud-write-requested',
          ],
        },
      },
      customerImpactPreview: {
        previewVersion: 'backup-center-customer-impact-preview.v1',
        status: 'protected-preview-only',
        customerRiskLevel: 'contained',
        currentCustomerExperience:
          'Customer-facing operations continue without backup automation until operator review is complete.',
        expectedBenefitAfterActivation:
          'Customers gain safer restore governance and clearer continuity coverage once reviewed persistence and restore controls are enabled.',
        protections: [
          'no-customer-data-export-without-review',
          'no-restore-execution-without-approval',
          'no-external-cloud-write-without-target-ownership-review',
        ],
      },
      operatorReadinessDigest: {
        digestVersion: 'backup-center-operator-readiness-digest.v1',
        status: 'preview-ready-activation-blocked',
        operatorState: 'ready-to-preview-not-ready-to-activate',
        nextOperatorAction: 'submit-preview-only-backup-setup-review',
        currentActivationRisk: 'high',
        customerRiskLevel: 'contained',
        readyGateCount: activationGates.filter((gate) => gate.status === 'ready')
          .length,
        pendingGateCount: activationGates.filter(
          (gate) => gate.status === 'pending',
        ).length,
        blockedGateCount: activationGates.filter(
          (gate) => gate.status === 'blocked',
        ).length,
        evidenceRequiredCount: 3,
        disabledOperationCount: 6,
        summaryPoints: [
          'operator-preview-is-the-next-safe-step',
          'activation-remains-blocked-before-persistence-review',
          'customer-impact-is-contained-while-actions-stay-preview-only',
        ],
      },
      evidenceChecklist: {
        checklistVersion: 'backup-center-evidence-checklist.v1',
        status: 'evidence-needed-before-preview-review',
        requiredEvidenceCount: 3,
        capturedEvidenceCount: 0,
        missingEvidenceCount: 3,
        items: [
          {
            key: 'validated-backup-target-preview',
            label: 'Validated backup target preview',
            status: 'missing',
            sourceStep: 'fill-preview-only-setup-form',
          },
          {
            key: 'policy-scope-selection',
            label: 'Policy scope selection',
            status: 'missing',
            sourceStep: 'review-readiness-summary',
          },
          {
            key: 'restore-approval-owner',
            label: 'Restore approval owner',
            status: 'missing',
            sourceStep: 'restore-approval-review',
          },
        ],
        nextEvidenceAction: 'collect-preview-evidence-before-activation-review',
      },
      previewReviewPacket: {
        packetVersion: 'backup-center-preview-review-packet.v1',
        status: 'ready-to-assemble-preview-review',
        sourceEndpoint: setupContract.runtimeHandoff.previewEndpoint,
        nextSubmissionAction: 'submit-preview-only-backup-setup-review',
        requiredPacketItemCount: 4,
        readyPacketItemCount: 1,
        missingPacketItemCount: 3,
        packetItems: [
          {
            key: 'operator-readiness-digest',
            status: 'ready',
            sourceVersion: 'backup-center-operator-readiness-digest.v1',
          },
          {
            key: 'validated-backup-target-preview',
            status: 'missing',
            sourceVersion: 'backup-center-evidence-checklist.v1',
          },
          {
            key: 'policy-scope-selection',
            status: 'missing',
            sourceVersion: 'backup-center-evidence-checklist.v1',
          },
          {
            key: 'restore-approval-owner',
            status: 'missing',
            sourceVersion: 'backup-center-evidence-checklist.v1',
          },
        ],
      },
      previewSubmissionReadiness: {
        readinessVersion: 'backup-center-preview-submission-readiness.v1',
        status: 'blocked-pending-preview-evidence',
        previewOnly: true,
        submissionAllowed: false,
        nextSubmissionAction: 'collect-preview-evidence-before-submission',
        readyPacketItemCount: 1,
        missingPacketItemCount: 3,
        requiredEvidenceCount: 3,
        missingEvidenceCount: 3,
        blockedReasons: [
          'validated-backup-target-preview:missing',
          'policy-scope-selection:missing',
          'restore-approval-owner:missing',
        ],
      },
      previewUnblockPlan: {
        planVersion: 'backup-center-preview-unblock-plan.v1',
        status: 'ready-for-operator-evidence-collection',
        firstActionKey: 'validated-backup-target-preview',
        stepCount: 3,
        completedStepCount: 0,
        remainingStepCount: 3,
        steps: [
          {
            key: 'validated-backup-target-preview',
            label: 'Validate backup target preview',
            status: 'pending',
            sourceStep: 'fill-preview-only-setup-form',
            unblocks: 'preview-submission-target-evidence',
          },
          {
            key: 'policy-scope-selection',
            label: 'Confirm backup policy scope',
            status: 'pending',
            sourceStep: 'review-readiness-summary',
            unblocks: 'preview-submission-policy-evidence',
          },
          {
            key: 'restore-approval-owner',
            label: 'Assign restore approval owner',
            status: 'pending',
            sourceStep: 'restore-approval-review',
            unblocks: 'preview-submission-approval-evidence',
          },
        ],
        finalAction: 'submit-preview-only-backup-setup-review',
      },
      previewEvidenceCaptureGuide: {
        guideVersion: 'backup-center-preview-evidence-capture-guide.v1',
        status: 'ready-for-preview-only-capture',
        captureMode: 'operator-notes-only',
        itemCount: 3,
        items: [
          {
            evidenceKey: 'validated-backup-target-preview',
            capturePrompt: 'Confirm target type, destination label, and owner.',
            expectedFormat: 'target-type + destination + owner-confirmation',
            sourceStep: 'fill-preview-only-setup-form',
          },
          {
            evidenceKey: 'policy-scope-selection',
            capturePrompt:
              'Confirm whether the preview covers workspace, tenant, or app scope.',
            expectedFormat: 'scope-key + reason',
            sourceStep: 'review-readiness-summary',
          },
          {
            evidenceKey: 'restore-approval-owner',
            capturePrompt:
              'Identify the person or role that must approve restore actions.',
            expectedFormat: 'owner-role + approval-channel',
            sourceStep: 'restore-approval-review',
          },
        ],
        nextCaptureAction: 'record-preview-evidence-before-submission',
      },
      previewEvidenceReviewRubric: {
        rubricVersion: 'backup-center-preview-evidence-review-rubric.v1',
        status: 'pending-evidence-review',
        requiredCheckCount: 3,
        passedCheckCount: 0,
        pendingCheckCount: 3,
        checks: [
          {
            key: 'target-ownership-confirmed',
            label: 'Target ownership confirmed',
            status: 'pending',
            sourceEvidenceKey: 'validated-backup-target-preview',
            requiredSignal: 'owner-confirmation-present',
          },
          {
            key: 'backup-scope-clear',
            label: 'Backup scope is clear',
            status: 'pending',
            sourceEvidenceKey: 'policy-scope-selection',
            requiredSignal: 'scope-key-and-reason-present',
          },
          {
            key: 'restore-approval-accountable',
            label: 'Restore approval owner is accountable',
            status: 'pending',
            sourceEvidenceKey: 'restore-approval-owner',
            requiredSignal: 'owner-role-and-channel-present',
          },
        ],
        nextReviewAction: 'review-preview-evidence-before-submission',
      },
      previewEvidenceTraceability: {
        traceabilityVersion: 'backup-center-preview-evidence-traceability.v1',
        status: 'pending-preview-evidence-linkage',
        itemCount: 3,
        rows: [
          {
            evidenceKey: 'validated-backup-target-preview',
            sourceStep: 'fill-preview-only-setup-form',
            expectedFormat: 'target-type + destination + owner-confirmation',
            reviewCheckKey: 'target-ownership-confirmed',
            reviewCheckLabel: 'Target ownership confirmed',
            requiredSignal: 'owner-confirmation-present',
            packetItemKey: 'validated-backup-target-preview',
            blockedReason: 'validated-backup-target-preview:missing',
          },
          {
            evidenceKey: 'policy-scope-selection',
            sourceStep: 'review-readiness-summary',
            expectedFormat: 'scope-key + reason',
            reviewCheckKey: 'backup-scope-clear',
            reviewCheckLabel: 'Backup scope is clear',
            requiredSignal: 'scope-key-and-reason-present',
            packetItemKey: 'policy-scope-selection',
            blockedReason: 'policy-scope-selection:missing',
          },
          {
            evidenceKey: 'restore-approval-owner',
            sourceStep: 'restore-approval-review',
            expectedFormat: 'owner-role + approval-channel',
            reviewCheckKey: 'restore-approval-accountable',
            reviewCheckLabel: 'Restore approval owner is accountable',
            requiredSignal: 'owner-role-and-channel-present',
            packetItemKey: 'restore-approval-owner',
            blockedReason: 'restore-approval-owner:missing',
          },
        ],
        nextTraceAction: 'link-preview-evidence-to-review-checks-before-submission',
      },
      previewSubmissionDecisionSummary: {
        summaryVersion: 'backup-center-preview-submission-decision-summary.v1',
        decision: 'blocked',
        decisionReason: 'preview-evidence-and-review-checks-pending',
        submissionAllowed: false,
        missingEvidenceCount: 3,
        pendingReviewCheckCount: 3,
        readyPacketItemCount: 1,
        nextDecisionAction: 'review-preview-evidence-before-submission',
        unlocksWhen: [
          'all-preview-evidence-recorded',
          'all-preview-evidence-checks-passed',
          'preview-review-packet-complete',
        ],
      },
      gates: activationGates,
      nextSafeAction:
        'complete-preview-review-before-opening-prisma-or-migration-work',
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
      persistenceDesignLock,
      persistencePrerequisiteReview,
      readinessReviewSummary,
      activationChecklist,
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

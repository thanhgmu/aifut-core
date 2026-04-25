import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { AccessPolicyService } from './access-policy.service';
import { PrismaService } from './prisma.service';
import { CONNECTOR_REGISTRY_FOUNDATION } from './connectors.constants';
import { StorageRoutingPolicyService } from './storage-routing-policy.service';

type CreateConnectionInput = {
  tenantSlug?: string;
  workspaceSlug?: string;
  hostname?: string;
  connectorKey?: string;
  name?: string;
  storagePolicyKey?: string;
  slug?: string;
  config?: Record<string, unknown>;
  secretsRef?: string;
  mappingProfile?: {
    mode?: string;
    objects?: string[];
    fieldMappings?: Record<string, unknown>;
    eventMappings?: Record<string, unknown>;
    syncPolicy?: Record<string, unknown>;
  };
};

type VerifyConnectionInput = {
  tenantSlug?: string;
  workspaceSlug?: string;
  userEmail?: string;
  hostname?: string;
  connectionSlug?: string;
  verificationMode?: 'dry-run' | 'operator-check' | 'connector-probe';
  verificationNotes?: string;
};

type ConnectionHealthTimelineInput = {
  tenantSlug?: string;
  workspaceSlug?: string;
  userEmail?: string;
  hostname?: string;
  connectionSlug?: string;
};

type AcknowledgeHealthAlertInput = {
  tenantSlug?: string;
  workspaceSlug?: string;
  userEmail?: string;
  hostname?: string;
  connectionSlug?: string;
  note?: string;
};

type SuppressHealthAlertInput = {
  tenantSlug?: string;
  workspaceSlug?: string;
  userEmail?: string;
  hostname?: string;
  connectionSlug?: string;
  note?: string;
  durationMinutes?: number;
};

type UnsuppressHealthAlertInput = {
  tenantSlug?: string;
  workspaceSlug?: string;
  userEmail?: string;
  hostname?: string;
  connectionSlug?: string;
  note?: string;
};

type AddRecoveryNoteInput = {
  tenantSlug?: string;
  workspaceSlug?: string;
  userEmail?: string;
  hostname?: string;
  connectionSlug?: string;
  note?: string;
};

type AssignHealthFollowUpInput = {
  tenantSlug?: string;
  workspaceSlug?: string;
  userEmail?: string;
  hostname?: string;
  connectionSlug?: string;
  assigneeEmail?: string;
  note?: string;
};

type RecordFollowUpNotificationInput = {
  tenantSlug?: string;
  workspaceSlug?: string;
  userEmail?: string;
  hostname?: string;
  connectionSlug?: string;
  channel?: string;
  recipient?: string;
  note?: string;
};

type UpdateFollowUpStateInput = {
  tenantSlug?: string;
  workspaceSlug?: string;
  userEmail?: string;
  hostname?: string;
  connectionSlug?: string;
  state?: string;
  note?: string;
};

type UpdateAlertThresholdsInput = {
  tenantSlug?: string;
  workspaceSlug?: string;
  userEmail?: string;
  hostname?: string;
  connectionSlug?: string;
  immediateFailures?: number;
  repeatedFailures?: number;
  cooldownMinutes?: number;
  note?: string;
};

@Injectable()
export class ConnectionInstancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly storageRoutingPolicy: StorageRoutingPolicyService,
  ) {}

  async listTenantConnections(tenantSlug?: string) {
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
        integrations: {
          select: {
            id: true,
            name: true,
            slug: true,
            provider: true,
            category: true,
            status: true,
            workspaceId: true,
            secretsRef: true,
            lastVerifiedAt: true,
            config: true,
            mappingMode: true,
            mappedObjects: true,
            fieldMappings: true,
            eventMappings: true,
            syncPolicy: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        },
        workspaces: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        `Tenant not found for slug: ${normalizedTenantSlug}`,
      );
    }

    const connectorIndex = new Map(
      CONNECTOR_REGISTRY_FOUNDATION.map((connector) => [connector.key, connector]),
    );

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      connections: tenant.integrations.map((integration) => {
        const connector =
          CONNECTOR_REGISTRY_FOUNDATION.find(
            (candidate) => candidate.key === integration.provider.toLowerCase(),
          ) ?? null;
        const workspace =
          tenant.workspaces.find(
            (candidate) => candidate.id === integration.workspaceId,
          ) ?? null;

        return {
          id: integration.id,
          name: integration.name,
          slug: integration.slug,
          provider: integration.provider,
          category: integration.category,
          status: integration.status,
          workspace,
          credentialReferenceStatus: integration.secretsRef
            ? 'reference-present'
            : 'not-declared',
          credentialReference: integration.secretsRef
            ? {
                ref: integration.secretsRef,
                ownership:
                  integration.secretsRef.startsWith('platform:')
                    ? 'platform-provided'
                    : integration.secretsRef.startsWith('affiliate:')
                      ? 'affiliate-provided'
                      : 'tenant-provided',
              }
            : null,
          configStatus: integration.config ? 'declared' : 'not-declared',
          lastVerifiedAt: integration.lastVerifiedAt,
          mappingProfile: {
            mode: integration.mappingMode,
            objects: integration.mappedObjects,
            fieldMappings: integration.fieldMappings,
            eventMappings: integration.eventMappings,
            syncPolicy: integration.syncPolicy,
          },
          syncPolicy: {
            mode:
              integration.mappingMode ??
              (integration.status === 'ACTIVE'
                ? 'bidirectional-ready'
                : 'manual-review'),
            eventIngestion: true,
            workflowHandoff: true,
          },
          templateSupport: connector
            ? {
                connectorKey: connector.key,
                authModes: connector.authModes,
                syncDirections: connector.syncDirections,
              }
            : null,
          createdAt: integration.createdAt,
          updatedAt: integration.updatedAt,
        };
      }),
      next: [
        'connection-verification-run',
        'mapping-policy-configuration',
        'credential-vault-reference-hardening',
      ],
    };
  }

  async createConnection(input: CreateConnectionInput & { userEmail?: string }) {
    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: input.tenantSlug,
        userEmail: input.userEmail,
        workspaceSlug: input.workspaceSlug,
        hostname: input.hostname,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.OPERATOR,
        scope: 'operator-control',
      },
    );

    const tenantSlug = context.tenant.slug;
    const workspaceSlug = context.activeWorkspace?.slug ?? input.workspaceSlug?.trim().toLowerCase();
    const connectorKey = input.connectorKey?.trim().toLowerCase();
    const name = input.name?.trim();
    const slug = input.slug?.trim().toLowerCase();

    if (!tenantSlug) {
      throw new BadRequestException('Missing tenantSlug.');
    }

    if (!connectorKey) {
      throw new BadRequestException('Missing connectorKey.');
    }

    if (!name) {
      throw new BadRequestException('Missing connection name.');
    }

    if (!slug) {
      throw new BadRequestException('Missing connection slug.');
    }

    const connector = CONNECTOR_REGISTRY_FOUNDATION.find(
      (candidate) => candidate.key === connectorKey,
    );

    const storageWritePolicy = input.storagePolicyKey
      ? await this.storageRoutingPolicy.requireWritePolicy({
          tenantSlug: context.tenant.slug,
          userEmail: context.user.email,
          workspaceSlug: context.activeWorkspace?.slug ?? input.workspaceSlug,
          hostname: input.hostname,
          enforceWorkspaceDomainMatch: true,
          policyKey: input.storagePolicyKey,
          writePath: `${slug}/connection-config`,
        })
      : null;

    if (!connector) {
      throw new NotFoundException(`Connector not found for key: ${connectorKey}`);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: {
        id: true,
        slug: true,
        workspaces: {
          select: {
            id: true,
            slug: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant not found for slug: ${tenantSlug}`);
    }

    const workspace = workspaceSlug
      ? tenant.workspaces.find((candidate) => candidate.slug === workspaceSlug) ?? null
      : null;

    if (workspaceSlug && !workspace) {
      throw new NotFoundException(
        `Workspace not found for slug ${workspaceSlug} in tenant ${tenantSlug}`,
      );
    }

    const created = await this.prisma.integrationConnection.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace?.id ?? context.activeWorkspace?.id,
        name,
        slug,
        provider: connector.key,
        category: this.mapConnectorCategoryToIntegrationCategory(connector.category),
        status: 'PENDING',
        config: this.toJsonValue(
          this.buildConnectionConfig(input.config, storageWritePolicy),
        ),
        secretsRef: input.secretsRef,
        mappingMode: input.mappingProfile?.mode ?? 'template-first',
        mappedObjects: input.mappingProfile?.objects ?? [],
        fieldMappings: this.toJsonValue(input.mappingProfile?.fieldMappings),
        eventMappings: this.toJsonValue(input.mappingProfile?.eventMappings),
        syncPolicy: this.toJsonValue(input.mappingProfile?.syncPolicy),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        category: true,
        status: true,
        secretsRef: true,
        mappingMode: true,
        mappedObjects: true,
        fieldMappings: true,
        eventMappings: true,
        syncPolicy: true,
        createdAt: true,
      },
    });

    return {
      capability: 'integrations',
      status: 'created',
      connection: created,
      next: [
        'run-connection-verification',
        'confirm-mapping-policy',
        'enable-sync-after-review',
      ],
    };
  }

  async activateConnection(input: {
    tenantSlug?: string;
    workspaceSlug?: string;
    connectionSlug?: string;
    userEmail?: string;
    hostname?: string;
    reviewSummary?: string;
    activationMode?: 'manual-review' | 'verified-ready';
  }) {
    const connectionSlug = input.connectionSlug?.trim().toLowerCase();

    if (!connectionSlug) {
      throw new BadRequestException('Missing connectionSlug.');
    }

    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: input.tenantSlug,
        userEmail: input.userEmail,
        workspaceSlug: input.workspaceSlug,
        hostname: input.hostname,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.OPERATOR,
        scope: 'operator-control',
      },
    );

    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        tenantId: context.tenant.id,
        slug: connectionSlug,
        OR: [
          ...(context.activeWorkspace
            ? [{ workspaceId: context.activeWorkspace.id }, { workspaceId: null }]
            : [{ workspaceId: null }, {}]),
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        mappingMode: true,
        mappedObjects: true,
        fieldMappings: true,
        eventMappings: true,
        syncPolicy: true,
        config: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException(
        `Connection not found for slug: ${connectionSlug}`,
      );
    }

    const config =
      connection.config && typeof connection.config === 'object'
        ? { ...(connection.config as Record<string, unknown>) }
        : {};
    const platform =
      config._platform && typeof config._platform === 'object'
        ? { ...(config._platform as Record<string, unknown>) }
        : {};
    const activatedAt = new Date().toISOString();

    const review = {
      reviewedAt: new Date().toISOString(),
      reviewedBy: context.user.email,
      reviewSummary: input.reviewSummary?.trim() || 'Operator review completed.',
      activationMode: input.activationMode ?? 'manual-review',
      workspaceSlug: connection.workspace?.slug ?? context.activeWorkspace?.slug ?? null,
    };

    const activated = await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        status: 'ACTIVE',
        lastVerifiedAt: new Date(),
        config: this.toJsonValue({
          ...config,
          _platform: {
            ...platform,
            review,
            activation: {
              state: 'active',
              activatedAt,
              activatedBy: context.user.email,
            },
            healthTimeline: this.appendTimelineEntry(platform.healthTimeline, {
              type: 'activation',
              status: 'active',
              at: activatedAt,
              actor: context.user.email,
              detail: {
                activationMode: input.activationMode ?? 'manual-review',
                reviewSummary: review.reviewSummary,
                workspaceSlug: review.workspaceSlug,
              },
            }),
          },
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        lastVerifiedAt: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return {
      capability: 'integrations',
      status: 'activated',
      connection: activated,
      review,
      next: ['monitor-health', 'enable-sync-jobs', 'track-usage-and-billing'],
    };
  }

  async verifyConnection(input: VerifyConnectionInput) {
    const connectionSlug = input.connectionSlug?.trim().toLowerCase();

    if (!connectionSlug) {
      throw new BadRequestException('Missing connectionSlug.');
    }

    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: input.tenantSlug,
        userEmail: input.userEmail,
        workspaceSlug: input.workspaceSlug,
        hostname: input.hostname,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.OPERATOR,
        scope: 'operator-control',
      },
    );

    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        tenantId: context.tenant.id,
        slug: connectionSlug,
        OR: context.activeWorkspace
          ? [{ workspaceId: context.activeWorkspace.id }, { workspaceId: null }]
          : undefined,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        secretsRef: true,
        targetBaseUrl: true,
        config: true,
        mappedObjects: true,
        eventMappings: true,
        syncPolicy: true,
        lastVerifiedAt: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException(
        `Connection not found for slug: ${connectionSlug}`,
      );
    }

    const checks = [
      {
        key: 'credential-reference',
        passed: Boolean(connection.secretsRef),
        detail: connection.secretsRef
          ? `Credential reference ${connection.secretsRef} is attached.`
          : 'Missing credential reference.',
      },
      {
        key: 'endpoint',
        passed: this.hasTargetBaseUrl(connection.config, connection.targetBaseUrl),
        detail: this.hasTargetBaseUrl(connection.config, connection.targetBaseUrl)
          ? 'Remote endpoint is declared.'
          : 'Missing remote endpoint/base URL.',
      },
      {
        key: 'mapping',
        passed: connection.mappedObjects.length > 0,
        detail:
          connection.mappedObjects.length > 0
            ? `Mapped objects: ${connection.mappedObjects.join(', ')}`
            : 'No mapped objects selected.',
      },
      {
        key: 'sync-policy',
        passed: Boolean(connection.eventMappings || connection.syncPolicy),
        detail:
          connection.eventMappings || connection.syncPolicy
            ? 'Sync policy or event mappings are declared.'
            : 'Missing sync policy and event mappings.',
      },
    ];

    const passed = checks.every((check) => check.passed);
    const verificationMode = input.verificationMode ?? 'operator-check';
    const timestamp = new Date();
    const config =
      connection.config && typeof connection.config === 'object'
        ? { ...(connection.config as Record<string, unknown>) }
        : {};
    const platform =
      config._platform && typeof config._platform === 'object'
        ? { ...(config._platform as Record<string, unknown>) }
        : {};
    const verificationRecord = {
      checkedAt: timestamp.toISOString(),
      checkedBy: context.user.email,
      mode: verificationMode,
      notes: input.verificationNotes?.trim() || null,
      passed,
      checks: checks.map((check) => ({
        key: check.key,
        passed: check.passed,
        detail: check.detail,
      })),
    };

    const updated = await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        status: passed ? 'ACTIVE' : connection.status,
        lastVerifiedAt: timestamp,
        config: this.toJsonValue({
          ...config,
          _platform: {
            ...platform,
            verification: verificationRecord,
            healthTimeline: this.appendTimelineEntry(platform.healthTimeline, {
              type: 'verification',
              status: passed ? 'verified' : 'needs-setup',
              at: verificationRecord.checkedAt,
              actor: context.user.email,
              detail: {
                mode: verificationMode,
                notes: verificationRecord.notes,
                checks: verificationRecord.checks,
              },
            }),
          },
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        lastVerifiedAt: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    return {
      capability: 'integrations',
      surface: 'connection-verification',
      status: passed ? 'verified' : 'needs-setup',
      connection: updated,
      verification: {
        mode: verificationMode,
        checkedAt: timestamp.toISOString(),
        checkedBy: context.user.email,
        passed,
        checks,
      },
      next: passed
        ? ['activate-or-monitor-connection', 'start-health-history']
        : ['attach-credentials', 'declare-endpoint', 'complete-mapping'],
    };
  }

  async getConnectionHealthTimeline(input: ConnectionHealthTimelineInput) {
    const connectionSlug = input.connectionSlug?.trim().toLowerCase();

    if (!connectionSlug) {
      throw new BadRequestException('Missing connectionSlug.');
    }

    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: input.tenantSlug,
        userEmail: input.userEmail,
        workspaceSlug: input.workspaceSlug,
        hostname: input.hostname,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.OPERATOR,
        scope: 'operator-control',
      },
    );

    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        tenantId: context.tenant.id,
        slug: connectionSlug,
        OR: context.activeWorkspace
          ? [{ workspaceId: context.activeWorkspace.id }, { workspaceId: null }]
          : undefined,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        lastVerifiedAt: true,
        config: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException(
        `Connection not found for slug: ${connectionSlug}`,
      );
    }

    const config =
      connection.config && typeof connection.config === 'object'
        ? (connection.config as Record<string, unknown>)
        : {};
    const platform =
      config._platform && typeof config._platform === 'object'
        ? (config._platform as Record<string, unknown>)
        : {};
    const timeline = Array.isArray(platform.healthTimeline)
      ? platform.healthTimeline
      : [];
    const normalizedTimeline = timeline.filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
    );
    const repeatFailureCount = timeline.filter(
      (entry) =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        (entry as Record<string, unknown>).status === 'needs-setup',
    ).length;
    const latestTimelineEntry =
      timeline.length > 0 &&
      timeline[timeline.length - 1] &&
      typeof timeline[timeline.length - 1] === 'object' &&
      !Array.isArray(timeline[timeline.length - 1])
        ? (timeline[timeline.length - 1] as Record<string, unknown>)
        : null;
    const recoveryStreak = this.calculateRecoveryStreak(normalizedTimeline);
    const alertThresholds = this.resolveAlertThresholds(platform.alertThresholds);
    const cooldown = this.calculateCooldownWindow(
      normalizedTimeline,
      alertThresholds.cooldownMinutes,
    );
    const suppression = this.resolveSuppression(platform.alertSuppression);
    const recoveryNote = this.resolveRecoveryNote(platform.recoveryNote);
    const followUpAssignment = this.resolveFollowUpAssignment(
      platform.followUpAssignment,
    );
    const followUpNotification = this.resolveFollowUpNotification(
      platform.followUpNotification,
    );
    const followUpState = this.resolveFollowUpState(platform.followUpState);
    const latestNeedsSetup = latestTimelineEntry?.status === 'needs-setup';
    const shouldAlertOperator =
      latestNeedsSetup && repeatFailureCount >= alertThresholds.immediateFailures;
    const shouldEscalateOperator =
      latestNeedsSetup && repeatFailureCount >= alertThresholds.repeatedFailures;

    return {
      capability: 'integrations',
      surface: 'connection-health-timeline',
      status: 'resolved',
      connection: {
        id: connection.id,
        name: connection.name,
        slug: connection.slug,
        provider: connection.provider,
        status: connection.status,
        lastVerifiedAt: connection.lastVerifiedAt,
        workspace: connection.workspace,
      },
      latestVerification:
        platform.verification && typeof platform.verification === 'object'
          ? platform.verification
          : null,
      healthSummary: {
        latestStatus: latestTimelineEntry?.status ?? null,
        repeatFailureCount,
        recoveryStreak,
        alertThresholds,
        cooldown,
        suppression,
        recoveryNote,
        followUpAssignment,
        followUpNotification,
        followUpState,
        shouldAlertOperator: shouldAlertOperator && !suppression.active,
        shouldEscalateOperator: shouldEscalateOperator && !suppression.active,
      },
      healthTimeline: timeline,
      next: ['monitor-repeat-failures', 'tune-operator-alert-thresholds'],
    };
  }

  async updateAlertThresholds(input: UpdateAlertThresholdsInput) {
    const connectionSlug = input.connectionSlug?.trim().toLowerCase();

    if (!connectionSlug) {
      throw new BadRequestException('Missing connectionSlug.');
    }

    const providedThresholds = {
      immediateFailures: input.immediateFailures,
      repeatedFailures: input.repeatedFailures,
      cooldownMinutes: input.cooldownMinutes,
    };

    if (
      providedThresholds.immediateFailures === undefined &&
      providedThresholds.repeatedFailures === undefined &&
      providedThresholds.cooldownMinutes === undefined
    ) {
      throw new BadRequestException(
        'Provide at least one alert threshold to update.',
      );
    }

    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: input.tenantSlug,
        userEmail: input.userEmail,
        workspaceSlug: input.workspaceSlug,
        hostname: input.hostname,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.OPERATOR,
        scope: 'operator-control',
      },
    );

    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        tenantId: context.tenant.id,
        slug: connectionSlug,
        OR: context.activeWorkspace
          ? [{ workspaceId: context.activeWorkspace.id }, { workspaceId: null }]
          : undefined,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        config: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException(
        `Connection not found for slug: ${connectionSlug}`,
      );
    }

    const config =
      connection.config && typeof connection.config === 'object'
        ? { ...(connection.config as Record<string, unknown>) }
        : {};
    const platform =
      config._platform && typeof config._platform === 'object'
        ? { ...(config._platform as Record<string, unknown>) }
        : {};
    const currentThresholds = this.resolveAlertThresholds(platform.alertThresholds);
    const nextThresholds = this.resolveAlertThresholds({
      ...currentThresholds,
      ...providedThresholds,
    });

    if (nextThresholds.repeatedFailures < nextThresholds.immediateFailures) {
      throw new BadRequestException(
        'repeatedFailures must be greater than or equal to immediateFailures.',
      );
    }

    const updatedAt = new Date().toISOString();
    const note = input.note?.trim() || null;

    const updated = await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        config: this.toJsonValue({
          ...config,
          _platform: {
            ...platform,
            alertThresholds: {
              ...nextThresholds,
              updatedAt,
              updatedBy: context.user.email,
              note,
            },
            healthTimeline: this.appendTimelineEntry(platform.healthTimeline, {
              type: 'alert-thresholds',
              status: 'alert-thresholds-updated',
              at: updatedAt,
              actor: context.user.email,
              detail: {
                ...nextThresholds,
                note,
              },
            }),
          },
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    return {
      capability: 'integrations',
      surface: 'connection-health-alert-thresholds',
      status: 'alert-thresholds-updated',
      connection: updated,
      alertThresholds: {
        ...nextThresholds,
        updatedAt,
        updatedBy: context.user.email,
        note,
      },
      next: ['monitor-alert-noise', 'verify-threshold-behavior'],
    };
  }

  async acknowledgeHealthAlert(input: AcknowledgeHealthAlertInput) {
    const connectionSlug = input.connectionSlug?.trim().toLowerCase();

    if (!connectionSlug) {
      throw new BadRequestException('Missing connectionSlug.');
    }

    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: input.tenantSlug,
        userEmail: input.userEmail,
        workspaceSlug: input.workspaceSlug,
        hostname: input.hostname,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.OPERATOR,
        scope: 'operator-control',
      },
    );

    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        tenantId: context.tenant.id,
        slug: connectionSlug,
        OR: context.activeWorkspace
          ? [{ workspaceId: context.activeWorkspace.id }, { workspaceId: null }]
          : undefined,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        config: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException(
        `Connection not found for slug: ${connectionSlug}`,
      );
    }

    const config =
      connection.config && typeof connection.config === 'object'
        ? { ...(connection.config as Record<string, unknown>) }
        : {};
    const platform =
      config._platform && typeof config._platform === 'object'
        ? { ...(config._platform as Record<string, unknown>) }
        : {};
    const acknowledgedAt = new Date().toISOString();

    const updated = await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        config: this.toJsonValue({
          ...config,
          _platform: {
            ...platform,
            alertAcknowledgement: {
              acknowledgedAt,
              acknowledgedBy: context.user.email,
              note: input.note?.trim() || null,
            },
            healthTimeline: this.appendTimelineEntry(platform.healthTimeline, {
              type: 'acknowledgement',
              status: 'acknowledged',
              at: acknowledgedAt,
              actor: context.user.email,
              detail: {
                note: input.note?.trim() || null,
              },
            }),
          },
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    return {
      capability: 'integrations',
      surface: 'connection-health-acknowledgement',
      status: 'acknowledged',
      connection: updated,
      acknowledgement: {
        acknowledgedAt,
        acknowledgedBy: context.user.email,
        note: input.note?.trim() || null,
      },
      next: ['monitor-recovery', 'optionally-suppress-alerts'],
    };
  }

  async suppressHealthAlert(input: SuppressHealthAlertInput) {
    const connectionSlug = input.connectionSlug?.trim().toLowerCase();

    if (!connectionSlug) {
      throw new BadRequestException('Missing connectionSlug.');
    }

    const durationMinutes = Number(input.durationMinutes ?? 60);

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      throw new BadRequestException('durationMinutes must be greater than 0.');
    }

    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: input.tenantSlug,
        userEmail: input.userEmail,
        workspaceSlug: input.workspaceSlug,
        hostname: input.hostname,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.OPERATOR,
        scope: 'operator-control',
      },
    );

    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        tenantId: context.tenant.id,
        slug: connectionSlug,
        OR: context.activeWorkspace
          ? [{ workspaceId: context.activeWorkspace.id }, { workspaceId: null }]
          : undefined,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        config: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException(
        `Connection not found for slug: ${connectionSlug}`,
      );
    }

    const config =
      connection.config && typeof connection.config === 'object'
        ? { ...(connection.config as Record<string, unknown>) }
        : {};
    const platform =
      config._platform && typeof config._platform === 'object'
        ? { ...(config._platform as Record<string, unknown>) }
        : {};
    const suppressedAt = new Date();
    const suppressedUntil = new Date(
      suppressedAt.getTime() + durationMinutes * 60 * 1000,
    ).toISOString();

    const updated = await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        config: this.toJsonValue({
          ...config,
          _platform: {
            ...platform,
            alertSuppression: {
              active: true,
              suppressedAt: suppressedAt.toISOString(),
              suppressedUntil,
              suppressedBy: context.user.email,
              note: input.note?.trim() || null,
            },
            healthTimeline: this.appendTimelineEntry(platform.healthTimeline, {
              type: 'suppression',
              status: 'suppressed',
              at: suppressedAt.toISOString(),
              actor: context.user.email,
              detail: {
                note: input.note?.trim() || null,
                durationMinutes,
                suppressedUntil,
              },
            }),
          },
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    return {
      capability: 'integrations',
      surface: 'connection-health-suppression',
      status: 'suppressed',
      connection: updated,
      suppression: {
        active: true,
        suppressedUntil,
        suppressedBy: context.user.email,
        note: input.note?.trim() || null,
        durationMinutes,
      },
      next: ['monitor-recovery', 'lift-suppression-when-safe'],
    };
  }

  async unsuppressHealthAlert(input: UnsuppressHealthAlertInput) {
    const connectionSlug = input.connectionSlug?.trim().toLowerCase();

    if (!connectionSlug) {
      throw new BadRequestException('Missing connectionSlug.');
    }

    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: input.tenantSlug,
        userEmail: input.userEmail,
        workspaceSlug: input.workspaceSlug,
        hostname: input.hostname,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.OPERATOR,
        scope: 'operator-control',
      },
    );

    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        tenantId: context.tenant.id,
        slug: connectionSlug,
        OR: context.activeWorkspace
          ? [{ workspaceId: context.activeWorkspace.id }, { workspaceId: null }]
          : undefined,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        config: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException(
        `Connection not found for slug: ${connectionSlug}`,
      );
    }

    const config =
      connection.config && typeof connection.config === 'object'
        ? { ...(connection.config as Record<string, unknown>) }
        : {};
    const platform =
      config._platform && typeof config._platform === 'object'
        ? { ...(config._platform as Record<string, unknown>) }
        : {};
    const unsuppressedAt = new Date().toISOString();

    const updated = await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        config: this.toJsonValue({
          ...config,
          _platform: {
            ...platform,
            alertSuppression: {
              active: false,
              suppressedAt:
                typeof (platform.alertSuppression as Record<string, unknown> | undefined)
                  ?.suppressedAt === 'string'
                  ? (platform.alertSuppression as Record<string, unknown>).suppressedAt
                  : null,
              suppressedUntil: null,
              suppressedBy: null,
              note: null,
              liftedAt: unsuppressedAt,
              liftedBy: context.user.email,
              liftNote: input.note?.trim() || null,
            },
            healthTimeline: this.appendTimelineEntry(platform.healthTimeline, {
              type: 'suppression',
              status: 'unsuppressed',
              at: unsuppressedAt,
              actor: context.user.email,
              detail: {
                note: input.note?.trim() || null,
              },
            }),
          },
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    return {
      capability: 'integrations',
      surface: 'connection-health-unsuppression',
      status: 'unsuppressed',
      connection: updated,
      suppression: {
        active: false,
        liftedAt: unsuppressedAt,
        liftedBy: context.user.email,
        note: input.note?.trim() || null,
      },
      next: ['resume-alert-monitoring', 'add-recovery-note-if-needed'],
    };
  }

  async addRecoveryNote(input: AddRecoveryNoteInput) {
    const connectionSlug = input.connectionSlug?.trim().toLowerCase();
    const note = input.note?.trim();

    if (!connectionSlug) {
      throw new BadRequestException('Missing connectionSlug.');
    }

    if (!note) {
      throw new BadRequestException('Missing recovery note.');
    }

    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: input.tenantSlug,
        userEmail: input.userEmail,
        workspaceSlug: input.workspaceSlug,
        hostname: input.hostname,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.OPERATOR,
        scope: 'operator-control',
      },
    );

    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        tenantId: context.tenant.id,
        slug: connectionSlug,
        OR: context.activeWorkspace
          ? [{ workspaceId: context.activeWorkspace.id }, { workspaceId: null }]
          : undefined,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        config: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException(
        `Connection not found for slug: ${connectionSlug}`,
      );
    }

    const config =
      connection.config && typeof connection.config === 'object'
        ? { ...(connection.config as Record<string, unknown>) }
        : {};
    const platform =
      config._platform && typeof config._platform === 'object'
        ? { ...(config._platform as Record<string, unknown>) }
        : {};
    const recordedAt = new Date().toISOString();

    const updated = await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        config: this.toJsonValue({
          ...config,
          _platform: {
            ...platform,
            recoveryNote: {
              note,
              recordedAt,
              recordedBy: context.user.email,
            },
            healthTimeline: this.appendTimelineEntry(platform.healthTimeline, {
              type: 'recovery-note',
              status: 'recovery-noted',
              at: recordedAt,
              actor: context.user.email,
              detail: {
                note,
              },
            }),
          },
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    return {
      capability: 'integrations',
      surface: 'connection-health-recovery-note',
      status: 'recovery-noted',
      connection: updated,
      recoveryNote: {
        note,
        recordedAt,
        recordedBy: context.user.email,
      },
      next: ['monitor-post-recovery-health', 'close-operator-loop'],
    };
  }

  async assignHealthFollowUp(input: AssignHealthFollowUpInput) {
    const connectionSlug = input.connectionSlug?.trim().toLowerCase();
    const assigneeEmail = input.assigneeEmail?.trim().toLowerCase();

    if (!connectionSlug) {
      throw new BadRequestException('Missing connectionSlug.');
    }

    if (!assigneeEmail) {
      throw new BadRequestException('Missing assigneeEmail.');
    }

    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: input.tenantSlug,
        userEmail: input.userEmail,
        workspaceSlug: input.workspaceSlug,
        hostname: input.hostname,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.OPERATOR,
        scope: 'operator-control',
      },
    );

    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        tenantId: context.tenant.id,
        slug: connectionSlug,
        OR: context.activeWorkspace
          ? [{ workspaceId: context.activeWorkspace.id }, { workspaceId: null }]
          : undefined,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        config: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException(
        `Connection not found for slug: ${connectionSlug}`,
      );
    }

    const config =
      connection.config && typeof connection.config === 'object'
        ? { ...(connection.config as Record<string, unknown>) }
        : {};
    const platform =
      config._platform && typeof config._platform === 'object'
        ? { ...(config._platform as Record<string, unknown>) }
        : {};
    const assignedAt = new Date().toISOString();
    const note = input.note?.trim() || null;

    const updated = await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        config: this.toJsonValue({
          ...config,
          _platform: {
            ...platform,
            followUpAssignment: {
              assigneeEmail,
              assignedAt,
              assignedBy: context.user.email,
              note,
            },
            healthTimeline: this.appendTimelineEntry(platform.healthTimeline, {
              type: 'follow-up-assignment',
              status: 'follow-up-assigned',
              at: assignedAt,
              actor: context.user.email,
              detail: {
                assigneeEmail,
                note,
              },
            }),
          },
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    return {
      capability: 'integrations',
      surface: 'connection-health-follow-up-assignment',
      status: 'follow-up-assigned',
      connection: updated,
      followUpAssignment: {
        assigneeEmail,
        assignedAt,
        assignedBy: context.user.email,
        note,
      },
      next: ['notify-assignee', 'monitor-follow-up-progress'],
    };
  }

  async recordFollowUpNotification(input: RecordFollowUpNotificationInput) {
    const connectionSlug = input.connectionSlug?.trim().toLowerCase();
    const channel = input.channel?.trim().toLowerCase();
    const recipient = input.recipient?.trim();

    if (!connectionSlug) {
      throw new BadRequestException('Missing connectionSlug.');
    }

    if (!channel) {
      throw new BadRequestException('Missing channel.');
    }

    if (!recipient) {
      throw new BadRequestException('Missing recipient.');
    }

    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: input.tenantSlug,
        userEmail: input.userEmail,
        workspaceSlug: input.workspaceSlug,
        hostname: input.hostname,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.OPERATOR,
        scope: 'operator-control',
      },
    );

    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        tenantId: context.tenant.id,
        slug: connectionSlug,
        OR: context.activeWorkspace
          ? [{ workspaceId: context.activeWorkspace.id }, { workspaceId: null }]
          : undefined,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        config: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException(
        `Connection not found for slug: ${connectionSlug}`,
      );
    }

    const config =
      connection.config && typeof connection.config === 'object'
        ? { ...(connection.config as Record<string, unknown>) }
        : {};
    const platform =
      config._platform && typeof config._platform === 'object'
        ? { ...(config._platform as Record<string, unknown>) }
        : {};
    const notifiedAt = new Date().toISOString();
    const note = input.note?.trim() || null;

    const updated = await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        config: this.toJsonValue({
          ...config,
          _platform: {
            ...platform,
            followUpNotification: {
              channel,
              recipient,
              notifiedAt,
              notifiedBy: context.user.email,
              note,
            },
            healthTimeline: this.appendTimelineEntry(platform.healthTimeline, {
              type: 'follow-up-notification',
              status: 'follow-up-notified',
              at: notifiedAt,
              actor: context.user.email,
              detail: {
                channel,
                recipient,
                note,
              },
            }),
          },
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    return {
      capability: 'integrations',
      surface: 'connection-health-follow-up-notification',
      status: 'follow-up-notified',
      connection: updated,
      followUpNotification: {
        channel,
        recipient,
        notifiedAt,
        notifiedBy: context.user.email,
        note,
      },
      next: ['wait-for-assignee-response', 'track-follow-up-progress'],
    };
  }

  async updateFollowUpState(input: UpdateFollowUpStateInput) {
    const connectionSlug = input.connectionSlug?.trim().toLowerCase();
    const rawState = input.state?.trim().toLowerCase();

    if (!connectionSlug) {
      throw new BadRequestException('Missing connectionSlug.');
    }

    if (!rawState) {
      throw new BadRequestException('Missing state.');
    }

    const allowedStates = new Set(['in-progress', 'blocked', 'resolved']);
    if (!allowedStates.has(rawState)) {
      throw new BadRequestException(
        'Invalid follow-up state. Expected one of: in-progress, blocked, resolved.',
      );
    }

    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: input.tenantSlug,
        userEmail: input.userEmail,
        workspaceSlug: input.workspaceSlug,
        hostname: input.hostname,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.OPERATOR,
        scope: 'operator-control',
      },
    );

    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        tenantId: context.tenant.id,
        slug: connectionSlug,
        OR: context.activeWorkspace
          ? [{ workspaceId: context.activeWorkspace.id }, { workspaceId: null }]
          : undefined,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        config: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException(
        `Connection not found for slug: ${connectionSlug}`,
      );
    }

    const config =
      connection.config && typeof connection.config === 'object'
        ? { ...(connection.config as Record<string, unknown>) }
        : {};
    const platform =
      config._platform && typeof config._platform === 'object'
        ? { ...(config._platform as Record<string, unknown>) }
        : {};
    const updatedAt = new Date().toISOString();
    const note = input.note?.trim() || null;
    const status = `follow-up-${rawState}`;

    const updated = await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        config: this.toJsonValue({
          ...config,
          _platform: {
            ...platform,
            followUpState: {
              state: rawState,
              updatedAt,
              updatedBy: context.user.email,
              note,
            },
            healthTimeline: this.appendTimelineEntry(platform.healthTimeline, {
              type: 'follow-up-state',
              status,
              at: updatedAt,
              actor: context.user.email,
              detail: {
                state: rawState,
                note,
              },
            }),
          },
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    return {
      capability: 'integrations',
      surface: 'connection-health-follow-up-state',
      status,
      connection: updated,
      followUpState: {
        state: rawState,
        updatedAt,
        updatedBy: context.user.email,
        note,
      },
      next:
        rawState === 'resolved'
          ? ['verify-connection-health', 'close-follow-up-loop']
          : ['continue-follow-up', 'monitor-connection-health'],
    };
  }

  getSetupBlueprint(connectorKey?: string) {
    const normalizedConnectorKey = connectorKey?.trim().toLowerCase();

    if (!normalizedConnectorKey) {
      throw new BadRequestException('Missing connector key.');
    }

    const connector = CONNECTOR_REGISTRY_FOUNDATION.find(
      (candidate) => candidate.key === normalizedConnectorKey,
    );

    if (!connector) {
      throw new NotFoundException(
        `Connector blueprint not found for key: ${normalizedConnectorKey}`,
      );
    }

    return {
      connector,
      wizard: [
        'choose-tenant-and-workspace',
        'provide-auth-and-remote-endpoint',
        'run-verification-check',
        'choose-sync-objects',
        'confirm-mapping-defaults',
        'enable-connection',
      ],
      setupModes: ['template-first', 'ai-assisted', 'advanced'],
      syncPolicyDefaults: {
        mode: connector.syncDirections.some(
          (direction) => direction === 'bidirectional',
        )
          ? 'bidirectional'
          : connector.syncDirections[0],
        verification: 'manual-before-enable',
        retryPolicy: 'backoff-default',
      },
      next: ['save-connection-instance', 'test-connection', 'attach-workflow-rules'],
    };
  }

  private toJsonValue(value?: Record<string, unknown>) {
    return value as Prisma.InputJsonValue | undefined;
  }

  private buildConnectionConfig(
    config: Record<string, unknown> | undefined,
    storageWritePolicy: Awaited<
      ReturnType<StorageRoutingPolicyService['requireWritePolicy']>
    > | null,
  ) {
    if (!storageWritePolicy) {
      return config;
    }

    if (
      config &&
      typeof config._platform === 'object' &&
      config._platform !== null
    ) {
      throw new BadRequestException(
        'Connection config cannot override reserved _platform storage routing metadata.',
      );
    }

    return {
      ...(config ?? {}),
      _platform: {
        storageRouting: {
          policyKey: storageWritePolicy.policyKey,
          mode: storageWritePolicy.writeGuardrail.mode,
          rootPrefix: storageWritePolicy.storageTopology.rootPrefix,
          enforcedWritePath: storageWritePolicy.writeGuardrail.enforcedWritePath,
          ownershipScope: storageWritePolicy.storageTopology.ownershipScope,
          workspaceSlug: storageWritePolicy.storageTopology.workspaceSlug,
          meterWritesOnPlatform:
            storageWritePolicy.writeGuardrail.meterWritesOnPlatform,
        },
      },
    };
  }

  private hasTargetBaseUrl(config: unknown, targetBaseUrl?: string | null) {
    if (typeof targetBaseUrl === 'string' && targetBaseUrl.trim()) {
      return true;
    }

    if (!config || typeof config !== 'object') {
      return false;
    }

    const record = config as Record<string, unknown>;
    return typeof record.baseUrl === 'string' && record.baseUrl.trim().length > 0;
  }

  private mapConnectorCategoryToIntegrationCategory(category: string) {
    switch (category) {
      case 'storage':
        return 'STORAGE';
      case 'workflow':
        return 'WORKFLOW';
      case 'ai':
        return 'AI';
      case 'messaging':
        return 'COMMUNICATION';
      case 'analytics':
        return 'ANALYTICS';
      case 'payments':
        return 'PAYMENTS';
      case 'custom':
        return 'OTHER';
      default:
        return 'OTHER';
    }
  }

  private appendTimelineEntry(existing: unknown, entry: Record<string, unknown>) {
    const timeline = Array.isArray(existing)
      ? existing.filter(
          (candidate): candidate is Record<string, unknown> =>
            Boolean(candidate) && typeof candidate === 'object' && !Array.isArray(candidate),
        )
      : [];

    return [...timeline.slice(-9), entry];
  }

  private calculateRecoveryStreak(timeline: Record<string, unknown>[]) {
    let streak = 0;

    for (let index = timeline.length - 1; index >= 0; index -= 1) {
      const status = timeline[index].status;

      if (status === 'verified' || status === 'active') {
        streak += 1;
        continue;
      }

      break;
    }

    return streak;
  }

  private calculateCooldownWindow(
    timeline: Record<string, unknown>[],
    cooldownMinutes = 15,
  ) {
    const latestFailure = [...timeline]
      .reverse()
      .find((entry) => entry.status === 'needs-setup');

    if (!latestFailure || typeof latestFailure.at !== 'string') {
      return {
        active: false,
        reason: null,
        until: null,
      };
    }

    const failedAt = new Date(latestFailure.at);

    if (Number.isNaN(failedAt.getTime())) {
      return {
        active: false,
        reason: null,
        until: null,
      };
    }

    const cooldownUntil = new Date(
      failedAt.getTime() + cooldownMinutes * 60 * 1000,
    );
    const active = cooldownUntil.getTime() > Date.now();

    return {
      active,
      reason: active ? 'recent-verification-failure' : null,
      until: active ? cooldownUntil.toISOString() : null,
    };
  }

  private resolveSuppression(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        active: false,
        suppressedUntil: null,
        suppressedBy: null,
        note: null,
      };
    }

    const record = value as Record<string, unknown>;
    const suppressedUntil =
      typeof record.suppressedUntil === 'string' ? record.suppressedUntil : null;
    const until = suppressedUntil ? new Date(suppressedUntil) : null;
    const active = Boolean(
      suppressedUntil && until && !Number.isNaN(until.getTime()) && until.getTime() > Date.now(),
    );

    return {
      active,
      suppressedUntil: active ? suppressedUntil : null,
      suppressedBy: active && typeof record.suppressedBy === 'string'
        ? record.suppressedBy
        : null,
      note: active && typeof record.note === 'string' ? record.note : null,
    };
  }

  private resolveRecoveryNote(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;

    return {
      note: typeof record.note === 'string' ? record.note : null,
      recordedAt:
        typeof record.recordedAt === 'string' ? record.recordedAt : null,
      recordedBy:
        typeof record.recordedBy === 'string' ? record.recordedBy : null,
    };
  }

  private resolveFollowUpAssignment(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;

    return {
      assigneeEmail:
        typeof record.assigneeEmail === 'string' ? record.assigneeEmail : null,
      assignedAt:
        typeof record.assignedAt === 'string' ? record.assignedAt : null,
      assignedBy:
        typeof record.assignedBy === 'string' ? record.assignedBy : null,
      note: typeof record.note === 'string' ? record.note : null,
    };
  }

  private resolveFollowUpNotification(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;

    return {
      channel: typeof record.channel === 'string' ? record.channel : null,
      recipient: typeof record.recipient === 'string' ? record.recipient : null,
      notifiedAt:
        typeof record.notifiedAt === 'string' ? record.notifiedAt : null,
      notifiedBy:
        typeof record.notifiedBy === 'string' ? record.notifiedBy : null,
      note: typeof record.note === 'string' ? record.note : null,
    };
  }

  private resolveFollowUpState(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;

    return {
      state: typeof record.state === 'string' ? record.state : null,
      updatedAt:
        typeof record.updatedAt === 'string' ? record.updatedAt : null,
      updatedBy:
        typeof record.updatedBy === 'string' ? record.updatedBy : null,
      note: typeof record.note === 'string' ? record.note : null,
    };
  }

  private resolveAlertThresholds(value: unknown) {
    const defaults = {
      immediateFailures: 1,
      repeatedFailures: 3,
      cooldownMinutes: 15,
    };

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return defaults;
    }

    const record = value as Record<string, unknown>;
    const immediateFailures =
      typeof record.immediateFailures === 'number' &&
      Number.isInteger(record.immediateFailures) &&
      record.immediateFailures >= 1
        ? record.immediateFailures
        : defaults.immediateFailures;
    const repeatedFailures =
      typeof record.repeatedFailures === 'number' &&
      Number.isInteger(record.repeatedFailures) &&
      record.repeatedFailures >= immediateFailures
        ? record.repeatedFailures
        : Math.max(defaults.repeatedFailures, immediateFailures);
    const cooldownMinutes =
      typeof record.cooldownMinutes === 'number' &&
      Number.isInteger(record.cooldownMinutes) &&
      record.cooldownMinutes >= 0
        ? record.cooldownMinutes
        : defaults.cooldownMinutes;

    return {
      immediateFailures,
      repeatedFailures,
      cooldownMinutes,
    };
  }
}

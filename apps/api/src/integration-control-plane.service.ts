import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CONNECTOR_REGISTRY_FOUNDATION } from './connectors.constants';
import { StorageRoutingPolicyService } from './storage-routing-policy.service';
import { evaluateTenantDomainReadiness } from './tenant-domain-readiness';

const NEXOVAFLOW_AUTOMATION_OPTION = {
  key: 'nexovaflow.automation',
  entitlementKey: 'feature.nexovaflow.automation',
} as const;

@Injectable()
export class IntegrationControlPlaneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageRoutingPolicy: StorageRoutingPolicyService,
  ) {}

  async summarizeTenantControlPlane(input: {
    tenantSlug?: string;
    workspaceSlug?: string;
    userEmail?: string;
    hostname?: string;
  }) {
    const tenantSlug = input.tenantSlug?.trim().toLowerCase();

    if (!tenantSlug) {
      throw new BadRequestException(
        'Missing tenant slug. Provide x-tenant-slug header or tenantSlug query param.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        workspaces: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
          orderBy: { name: 'asc' },
        },
        domains: {
          select: {
            hostname: true,
            kind: true,
            status: true,
            isPrimary: true,
            provider: true,
            provisioningMode: true,
            dnsTarget: true,
            certificateStatus: true,
            workspaceId: true,
            workspace: {
              select: {
                slug: true,
                name: true,
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { hostname: 'asc' }],
        },
        storagePolicies: {
          select: {
            key: true,
            mode: true,
            storageClass: true,
            targetRef: true,
            backupTargetRef: true,
            meteringEnabled: true,
            workspaceId: true,
            workspace: {
              select: {
                slug: true,
                name: true,
              },
            },
          },
          orderBy: [{ workspaceId: 'desc' }, { key: 'asc' }],
        },
        integrations: {
          select: {
            id: true,
            name: true,
            slug: true,
            provider: true,
            category: true,
            status: true,
            workspaceId: true,
            workspace: {
              select: {
                slug: true,
                name: true,
              },
            },
            routingMode: true,
            targetBaseUrl: true,
            targetEnvironment: true,
            targetRegion: true,
            secretsRef: true,
            config: true,
            mappingMode: true,
            mappedObjects: true,
            syncPolicy: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant not found for slug: ${tenantSlug}`);
    }

    const requestedWorkspaceSlug = input.workspaceSlug?.trim().toLowerCase();
    const activeWorkspace = requestedWorkspaceSlug
      ? tenant.workspaces.find((workspace) => workspace.slug === requestedWorkspaceSlug) ?? null
      : null;

    if (requestedWorkspaceSlug && !activeWorkspace) {
      throw new NotFoundException(
        `Workspace not found for slug ${requestedWorkspaceSlug} in tenant ${tenantSlug}`,
      );
    }

    const connectors = new Map<string, (typeof CONNECTOR_REGISTRY_FOUNDATION)[number]>(
      CONNECTOR_REGISTRY_FOUNDATION.map((connector) => [connector.key, connector]),
    );

    const filteredDomains = activeWorkspace
      ? tenant.domains.filter(
          (domain) => !domain.workspaceId || domain.workspaceId === activeWorkspace.id,
        )
      : tenant.domains;
    const visibleDomains = filteredDomains.map((domain) => ({
      ...domain,
      readiness: evaluateTenantDomainReadiness(domain),
    }));

    const filteredPolicies = activeWorkspace
      ? tenant.storagePolicies.filter(
          (policy) => !policy.workspaceId || policy.workspaceId === activeWorkspace.id,
        )
      : tenant.storagePolicies;

    const filteredConnections = activeWorkspace
      ? tenant.integrations.filter(
          (integration) =>
            !integration.workspaceId || integration.workspaceId === activeWorkspace.id,
        )
      : tenant.integrations;

    const effectiveStoragePolicies = await Promise.all(
      filteredPolicies.map(async (policy) => ({
        key: policy.key,
        workspace: policy.workspace,
        effective: await this.storageRoutingPolicy.getEffectivePolicy({
          tenantSlug,
          workspaceSlug: policy.workspace?.slug ?? activeWorkspace?.slug,
          userEmail: input.userEmail,
          hostname: input.hostname,
          policyKey: policy.key,
        }),
      })),
    );

    const requestedScopeKey = activeWorkspace
      ? `${tenant.slug}:workspace:${activeWorkspace.slug}`
      : `${tenant.slug}:tenant:default`;
    const fallbackScopeKey = `${tenant.slug}:tenant:default`;
    const scopeKeys = activeWorkspace
      ? [requestedScopeKey, fallbackScopeKey]
      : [requestedScopeKey];

    const [assignments, entitlements] = await Promise.all([
      this.prisma.tenantPackageAssignment.findMany({
        where: {
          tenantId: tenant.id,
          scopeKey: { in: scopeKeys },
        },
        select: {
          id: true,
          scopeKey: true,
          basePlanKey: true,
          selectedOptions: true,
          provisioningState: true,
          source: true,
          updatedAt: true,
        },
      }),
      this.prisma.entitlement.findMany({
        where: {
          tenantId: tenant.id,
          key: NEXOVAFLOW_AUTOMATION_OPTION.entitlementKey,
        },
        select: {
          key: true,
          value: true,
          source: true,
          updatedAt: true,
          endsAt: true,
        },
      }),
    ]);

    const assignment = assignments.find(
      (candidate) => candidate.scopeKey === requestedScopeKey,
    ) ?? assignments.find((candidate) => candidate.scopeKey === fallbackScopeKey) ?? null;
    const effectiveScopeKey = assignment?.scopeKey ?? requestedScopeKey;
    const fallbackApplied = Boolean(
      assignment &&
        activeWorkspace &&
        effectiveScopeKey !== requestedScopeKey,
    );
    const entitlementBoundary = {
      model: 'tenant-wide-entitlements',
      assignmentScope: activeWorkspace && effectiveScopeKey !== fallbackScopeKey ? 'workspace' : 'tenant',
      assignmentScopeKey: effectiveScopeKey,
      workspaceScopedAssignment:
        Boolean(activeWorkspace) && effectiveScopeKey !== fallbackScopeKey,
    };
    const automationEntitlement = entitlements[0] ?? null;

    return {
      capability: 'integrations',
      surface: 'control-plane',
      status: 'resolved',
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      activeWorkspace,
      controlPlane: {
        integrationAbstractionLayer: {
          enabled: true,
          connectorRegistrySize: CONNECTOR_REGISTRY_FOUNDATION.length,
          supports: [
            'connector',
            'credential-reference',
            'sync-policy',
            'event-mapping',
            'command-action-mapping',
            'health-status',
            'capability-contract',
          ],
        },
        unifiedBusinessContext: {
          tenantAware: true,
          workspaceAware: true,
          actorAware: true,
          billingAware: true,
          analyticsAware: true,
          policyAware: true,
        },
        operatorPlane: {
          connectedSystems: filteredConnections.length,
          workspaceCount: tenant.workspaces.length,
          domainCount: visibleDomains.length,
          routeReadyDomainCount: visibleDomains.filter(
            (domain) => domain.readiness.routeReady,
          ).length,
          attentionRequiredDomainCount: visibleDomains.filter(
            (domain) => !domain.readiness.routeReady,
          ).length,
          storagePolicyCount: filteredPolicies.length,
        },
        commercialization: {
          packageAssignmentScope: {
            requestedScopeKey,
            effectiveScopeKey,
            fallbackApplied,
            entitlementBoundary,
          },
          activePackageAssignment: assignment
            ? {
                basePlanKey: assignment.basePlanKey,
                selectedOptions: assignment.selectedOptions,
                provisioningState: assignment.provisioningState,
                provisioningUpdatedAt: assignment.updatedAt,
                provisioningRecency: this.describeProvisioningRecency(
                  assignment.updatedAt,
                ),
                latestProvisioningEvent: this.describeProvisioningEvent(assignment),
                provisioningHistory: this.describeProvisioningHistory(
                  assignment,
                  automationEntitlement,
                ),
                source: assignment.source,
                updatedAt: assignment.updatedAt,
              }
            : null,
          nexovaflowAutomation: {
            packageSelected:
              (assignment?.selectedOptions as string[])?.includes(NEXOVAFLOW_AUTOMATION_OPTION.key) ?? false,
            provisioningState: assignment?.provisioningState ?? null,
            provisioningUpdatedAt: assignment?.updatedAt ?? null,
            provisioningRecency: this.describeProvisioningRecency(
              assignment?.updatedAt ?? null,
            ),
            latestProvisioningEvent: this.describeProvisioningEvent(assignment),
            provisioningHistory: this.describeProvisioningHistory(
              assignment,
              automationEntitlement,
            ),
            entitlementEnabled:
              automationEntitlement?.value?.toLowerCase() === 'enabled',
            entitlementSource: automationEntitlement?.source ?? null,
            entitlementUpdatedAt: automationEntitlement?.updatedAt ?? null,
          },
        },
      },
      domains: visibleDomains.map((domain) => ({
        hostname: domain.hostname,
        kind: domain.kind,
        status: domain.status,
        isPrimary: domain.isPrimary,
        workspace: domain.workspace,
        readiness: domain.readiness,
      })),
      storagePolicies: effectiveStoragePolicies.map(({ key, workspace, effective }) => ({
        key,
        workspace,
        mode: effective.effectivePolicy?.mode ?? null,
        storageClass: effective.effectivePolicy?.storageClass ?? null,
        targetRefPresent: Boolean(effective.effectivePolicy?.targetRef),
        backupTargetRefPresent: Boolean(effective.effectivePolicy?.backupTargetRef),
        meteringEnabled: effective.effectivePolicy?.meteringEnabled ?? false,
        topology: effective.effectivePolicy
          ? {
              workspaceScoped: effective.resolution.workspaceScoped,
              activeWorkspaceSlug: effective.resolution.activeWorkspaceSlug,
            }
          : null,
      })),
      connections: filteredConnections.map((connection) => {
        const connector = connectors.get(connection.provider.toLowerCase()) ?? null;

        return {
          id: connection.id,
          name: connection.name,
          slug: connection.slug,
          provider: connection.provider,
          category: connection.category,
          status: connection.status,
          workspace: connection.workspace,
          credentialReferenceStatus: connection.secretsRef
            ? 'reference-present'
            : 'not-declared',
          mappingMode: connection.mappingMode,
          mappedObjects: connection.mappedObjects,
          syncPolicyDeclared: Boolean(connection.syncPolicy),
          endpoint: {
            routingMode: connection.routingMode,
            targetBaseUrl: connection.targetBaseUrl,
            targetEnvironment: connection.targetEnvironment,
            targetRegion: connection.targetRegion,
          },
          capabilityContract: connector
            ? {
                connectorKey: connector.key,
                authModes: connector.authModes,
                syncDirections: connector.syncDirections,
                capabilities: connector.capabilities,
                audience: connector.audience,
              }
            : null,
          healthStatus: {
            state: connection.status,
            verification: connection.status === 'ACTIVE' ? 'verified-or-activated' : 'review-pending',
            followUpState: this.resolveFollowUpState(connection.config),
            shouldEscalateOperator: this.shouldEscalateOperator(connection.config),
          },
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        };
      }),
      recommendedNextMilestones: [
        'connector-health-diagnostics-surface',
        'wizard-driven-setup-session-contract',
        'ai-assisted-mapping-and-policy-drafting',
      ],
    };
  }

  private resolveFollowUpState(config: unknown) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return null;
    }

    const platform = (config as Record<string, unknown>)._platform;
    if (!platform || typeof platform !== 'object' || Array.isArray(platform)) {
      return null;
    }

    const followUpState = (platform as Record<string, unknown>).followUpState;
    if (
      !followUpState ||
      typeof followUpState !== 'object' ||
      Array.isArray(followUpState)
    ) {
      return null;
    }

    const record = followUpState as Record<string, unknown>;
    return typeof record.state === 'string' ? record.state : null;
  }

  private shouldEscalateOperator(config: unknown) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return false;
    }

    const platform = (config as Record<string, unknown>)._platform;
    if (!platform || typeof platform !== 'object' || Array.isArray(platform)) {
      return false;
    }

    const healthTimeline = (platform as Record<string, unknown>).healthTimeline;
    const alertThresholds = (platform as Record<string, unknown>).alertThresholds;
    const repeatedFailures =
      alertThresholds &&
      typeof alertThresholds === 'object' &&
      !Array.isArray(alertThresholds) &&
      typeof (alertThresholds as Record<string, unknown>).repeatedFailures === 'number'
        ? ((alertThresholds as Record<string, unknown>).repeatedFailures as number)
        : 3;

    if (!Array.isArray(healthTimeline)) {
      return false;
    }

    const failureCount = healthTimeline.filter(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        (entry as Record<string, unknown>).status === 'needs-setup',
    ).length;

    const latest = [...healthTimeline]
      .reverse()
      .find(
        (entry) => entry && typeof entry === 'object' && !Array.isArray(entry),
      ) as Record<string, unknown> | undefined;

    return latest?.status === 'needs-setup' && failureCount >= repeatedFailures;
  }

  private describeProvisioningRecency(updatedAt: Date | string | null | undefined) {
    const value =
      updatedAt instanceof Date ? updatedAt : updatedAt ? new Date(updatedAt) : null;

    if (!value || Number.isNaN(value.getTime())) {
      return null;
    }

    const ageHours = (Date.now() - value.getTime()) / (60 * 60 * 1000);

    return ageHours <= 24 ? 'recent' : ageHours <= 72 ? 'aging' : 'stale';
  }

  private describeProvisioningEvent(
    assignment:
      | {
          provisioningState?: string | null;
          updatedAt?: Date | null;
          source?: string | null;
        }
      | null
      | undefined,
  ) {
    if (!assignment?.provisioningState || !assignment.updatedAt) {
      return null;
    }

    return {
      type: 'package-provisioning-state',
      state: assignment.provisioningState,
      at: assignment.updatedAt,
      source: assignment.source ?? null,
    };
  }

  private describeProvisioningHistory(
    assignment:
      | {
          provisioningState?: string | null;
          updatedAt?: Date | null;
          source?: string | null;
        }
      | null
      | undefined,
    entitlement:
      | {
          value?: string | null;
          updatedAt?: Date | null;
          source?: string | null;
        }
      | null
      | undefined,
  ) {
    const events = [
      assignment?.provisioningState && assignment.updatedAt
        ? {
            type: 'package-provisioning-state',
            state: assignment.provisioningState,
            at: assignment.updatedAt,
            source: assignment.source ?? null,
          }
        : null,
      entitlement?.value && entitlement.updatedAt
        ? {
            type: 'entitlement-sync-state',
            state: entitlement.value,
            at: entitlement.updatedAt,
            source: entitlement.source ?? null,
          }
        : null,
    ]
      .filter((event) => Boolean(event))
      .sort((left, right) => {
        const leftAt = left?.at instanceof Date ? left.at.getTime() : 0;
        const rightAt = right?.at instanceof Date ? right.at.getTime() : 0;
        return leftAt - rightAt;
      });

    return events.length > 0 ? events : null;
  }
}

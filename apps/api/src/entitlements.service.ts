import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntitlementKind, MembershipRole } from '@prisma/client';
import { AccessPolicyService } from './access-policy.service';
import { ActorContextService } from './actor-context.service';
import { PrismaService } from './prisma.service';
import { PACKAGE_OPTIONS_BLUEPRINT } from './entitlements.constants';

type PackageSelectionPreviewInput = {
  tenantSlug?: string;
  userEmail?: string;
  workspaceSlug?: string;
  basePlanKey?: string;
  selectedOptions?: string[];
};

type AssignPackageInput = {
  tenantSlug?: string;
  userEmail?: string;
  workspaceSlug?: string;
  basePlanKey?: string;
  selectedOptions?: string[];
  source?: string;
};

type ConnectorCommercializationInput = {
  tenantSlug?: string;
  userEmail?: string;
  workspaceSlug?: string;
  connectorKey?: string;
};

type ScopeDescriptor = {
  scopeKey: string;
  scopeType: 'tenant' | 'workspace';
  workspaceSlug: string | null;
  tenantSlug: string;
};

const PLAN_CATALOG = [
  {
    key: 'core.starter',
    label: 'Core Starter',
    description: 'Entry control-plane package for a smaller operator footprint.',
    basePriceMonthly: 'set-by-operator',
    includes: [
      'tenant-and-workspace-foundation',
      'core-audit-visibility',
      'connector-registry-access',
    ],
    availableOptions: ['nexovaflow.automation'],
  },
  {
    key: 'core.growth',
    label: 'Core Growth',
    description: 'Operator-stack package for more active automations and integrations.',
    basePriceMonthly: 'set-by-operator',
    includes: [
      'everything-in-core-starter',
      'expanded-workflow-capacity',
      'priority-operator-controls',
    ],
    availableOptions: ['nexovaflow.automation'],
  },
] as const;

const PACKAGE_OPTIONS_CATALOG = [
  {
    key: 'nexovaflow.automation',
    label: 'NexovaFlow Automation',
    category: 'app-capability',
    billingMode: 'fixed-delta',
    defaultPriceDelta: 'set-by-operator',
    entitlementKey: 'feature.nexovaflow.automation',
    dependencyKeys: ['connector.nexovaflow'],
    downstreamSystem: 'nexovaflow',
    provisioningStates: ['inactive', 'pending', 'active', 'degraded'],
    operatorConfiguration: {
      aifutAdmin: true,
      nexovaflowPanelIfNeeded: true,
    },
  },
] as const;

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actorContext: ActorContextService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  capabilities() {
    return {
      capability: 'entitlements',
      status: 'foundation',
      supports: {
        planFeatures: true,
        limits: true,
        pricingControls: true,
        packageOptions: true,
        appCapabilityCommercialization: true,
      },
    };
  }

  getPlanCatalog() {
    return {
      capability: 'entitlements',
      status: 'foundation',
      packagingModel: PACKAGE_OPTIONS_BLUEPRINT.packagingModel,
      plans: PLAN_CATALOG,
      options: PACKAGE_OPTIONS_CATALOG,
    };
  }

  async getAdminPackageBuilderState(input: {
    tenantSlug?: string;
    userEmail?: string;
    workspaceSlug?: string;
  }) {
    const context = await this.actorContext.resolve(input);
    const requestedScope = this.describeScope(
      context.tenant.slug,
      context.activeWorkspace?.slug,
    );

    const [assignmentResolution, entitlements, connections] = await Promise.all([
      this.resolvePackageAssignmentForScope(
        context.tenant.id,
        context.tenant.slug,
        context.activeWorkspace?.slug,
      ),
      this.prisma.entitlement.findMany({
        where: {
          tenantId: context.tenant.id,
        },
        orderBy: [{ key: 'asc' }],
        select: {
          id: true,
          key: true,
          kind: true,
          value: true,
          source: true,
          endsAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.integrationConnection.findMany({
        where: {
          tenantId: context.tenant.id,
          provider: 'nexovaflow',
        },
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          workspaceId: true,
          updatedAt: true,
        },
      }),
    ]);

    const assignment = assignmentResolution.assignment;

    const activePlan = assignment
      ? PLAN_CATALOG.find((plan) => plan.key === assignment.basePlanKey) ?? null
      : null;

    const selectedOptions = (assignment?.selectedOptions ?? []).map(
      (selectedKey) =>
        PACKAGE_OPTIONS_CATALOG.find((option) => option.key === selectedKey) ?? {
          key: selectedKey,
          label: selectedKey,
          category: 'unknown',
        },
    );

    const builderOptions = PACKAGE_OPTIONS_CATALOG.map((option) => {
      const connectorReady = option.dependencyKeys.includes('connector.nexovaflow')
        ? connections.some((connection) => connection.status === 'ACTIVE')
        : true;
      const entitlement = entitlements.find(
        (candidate) => candidate.key === option.entitlementKey,
      );
      const selected = assignment?.selectedOptions.includes(option.key) ?? false;

      return {
        ...option,
        selected,
        connectorReady,
        entitlementState: entitlement
          ? {
              value: entitlement.value,
              source: entitlement.source,
              endsAt: entitlement.endsAt,
              updatedAt: entitlement.updatedAt,
            }
          : null,
        recommendedNextAction: selected
          ? connectorReady
            ? 'ready-for-provisioning-or-activation'
            : 'connect-nexovaflow-first'
          : 'available-to-add',
      };
    });

    return {
      capability: 'entitlements',
      status: 'foundation',
      tenant: context.tenant,
      workspace: context.activeWorkspace,
      builder: {
        scope: {
          requested: requestedScope,
          effective: assignmentResolution.effectiveScope,
          fallbackApplied: assignmentResolution.fallbackApplied,
          entitlementBoundary: assignmentResolution.entitlementBoundary,
        },
        scopeKey: assignmentResolution.effectiveScope.scopeKey,
        activePlan,
        assignment,
        selectedOptions,
        catalog: {
          plans: PLAN_CATALOG,
          options: builderOptions,
        },
        dependencyState: {
          nexovaflowConnections: connections,
          nexovaflowConnectorReady: connections.some(
            (connection) => connection.status === 'ACTIVE',
          ),
        },
        operatorActions: [
          'select-base-plan',
          'toggle-package-options',
          'review-price-book-impact',
          'sync-entitlements',
          'trigger-downstream-provisioning',
        ],
      },
      next: ['price-book-model', 'ui-form-contract', 'provisioning-run-records'],
    };
  }

  async getTenantPackageState(input: {
    tenantSlug?: string;
    userEmail?: string;
    workspaceSlug?: string;
  }) {
    const context = await this.actorContext.resolve(input);
    const requestedScope = this.describeScope(
      context.tenant.slug,
      context.activeWorkspace?.slug,
    );

    const [assignmentResolution, entitlements] = await Promise.all([
      this.resolvePackageAssignmentForScope(
        context.tenant.id,
        context.tenant.slug,
        context.activeWorkspace?.slug,
      ),
      this.prisma.entitlement.findMany({
        where: {
          tenantId: context.tenant.id,
        },
        orderBy: [{ key: 'asc' }],
        select: {
          id: true,
          key: true,
          kind: true,
          value: true,
          source: true,
          startsAt: true,
          endsAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const assignment = assignmentResolution.assignment;

    const activeOptionKeys = entitlements
      .filter(
        (entitlement) =>
          entitlement.kind === EntitlementKind.FEATURE &&
          PACKAGE_OPTIONS_CATALOG.some(
            (option) => option.entitlementKey === entitlement.key,
          ) &&
          entitlement.value.toLowerCase() === 'enabled',
      )
      .map((entitlement) => entitlement.key);

    return {
      capability: 'entitlements',
      status: assignment ? 'resolved' : 'foundation',
      tenant: context.tenant,
      workspace: context.activeWorkspace,
      packageState: {
        scope: {
          requested: requestedScope,
          effective: assignmentResolution.effectiveScope,
          fallbackApplied: assignmentResolution.fallbackApplied,
          entitlementBoundary: assignmentResolution.entitlementBoundary,
        },
        assignment,
        basePlan: assignment?.basePlanKey ?? 'operator-assigned',
        selectedOptions: assignment?.selectedOptions ?? [],
        activeOptionEntitlements: activeOptionKeys,
        entitlementCount: entitlements.length,
        entitlementSyncSummary: this.describeEntitlementSyncSummary({
          requestedScope,
          effectiveScope: assignmentResolution.effectiveScope,
          fallbackApplied: assignmentResolution.fallbackApplied,
          entitlements,
        }),
      },
      entitlements,
      next: ['price-book-linkage', 'workspace-scope-overrides', 'entitlement-sync-from-assignment'],
    };
  }

  previewSelection(input: PackageSelectionPreviewInput) {
    const validated = this.validateSelection(
      input.basePlanKey,
      input.selectedOptions,
    );

    return {
      capability: 'entitlements',
      status: 'preview',
      selection: {
        basePlan: validated.plan,
        selectedOptions: validated.selectedOptionDefinitions,
      },
      commercialEffects: {
        basePlanPriceMonthly: validated.plan.basePriceMonthly,
        optionPriceDeltas: validated.selectedOptionDefinitions.map((option) => ({
          key: option.key,
          billingMode: option.billingMode,
          priceDelta: option.defaultPriceDelta,
        })),
        totalPriceComputation: 'operator-price-book-required',
      },
      provisioningEffects: {
        requiresConnectorKeys: Array.from(
          new Set(
            validated.selectedOptionDefinitions.flatMap(
              (option) => option.dependencyKeys,
            ),
          ),
        ),
        downstreamSystems: Array.from(
          new Set(
            validated.selectedOptionDefinitions.map(
              (option) => option.downstreamSystem,
            ),
          ),
        ),
      },
      next: ['persist-package-assignment', 'apply-entitlements', 'run-provisioning-flow'],
    };
  }

  async assignPackage(input: AssignPackageInput) {
    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        ...input,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.ADMIN,
        scope: 'tenant-admin',
      },
    );
    const validated = this.validateSelection(
      input.basePlanKey,
      input.selectedOptions,
    );
    const assignmentScope = this.describeScope(
      context.tenant.slug,
      context.activeWorkspace?.slug,
    );
    const source = input.source?.trim() || 'aifut-admin';

    const assignment = await this.prisma.tenantPackageAssignment.upsert({
      where: { scopeKey: assignmentScope.scopeKey },
      update: {
        basePlanKey: validated.plan.key,
        selectedOptions: validated.selectedOptions,
        billingSnapshot: {
          basePlanPriceMonthly: validated.plan.basePriceMonthly,
          optionPriceDeltas: validated.selectedOptionDefinitions.map((option) => ({
            key: option.key,
            billingMode: option.billingMode,
            priceDelta: option.defaultPriceDelta,
          })),
        },
        provisioningState:
          validated.selectedOptions.length > 0 ? 'pending' : 'inactive',
        source,
      },
      create: {
        tenantId: context.tenant.id,
        workspaceId: context.activeWorkspace?.id,
        scopeKey: assignmentScope.scopeKey,
        basePlanKey: validated.plan.key,
        selectedOptions: validated.selectedOptions,
        billingSnapshot: {
          basePlanPriceMonthly: validated.plan.basePriceMonthly,
          optionPriceDeltas: validated.selectedOptionDefinitions.map((option) => ({
            key: option.key,
            billingMode: option.billingMode,
            priceDelta: option.defaultPriceDelta,
          })),
        },
        provisioningState:
          validated.selectedOptions.length > 0 ? 'pending' : 'inactive',
        source,
      },
      select: {
        id: true,
        scopeKey: true,
        basePlanKey: true,
        selectedOptions: true,
        billingSnapshot: true,
        provisioningState: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      capability: 'entitlements',
      status: 'assigned',
      tenant: context.tenant,
      workspace: context.activeWorkspace,
      assignment,
      scope: {
        assignment: assignmentScope,
        entitlementBoundary: this.describeEntitlementBoundary(assignmentScope),
      },
      entitlementSync: await this.syncEntitlementsFromAssignment({
        tenantId: context.tenant.id,
        basePlanKey: validated.plan.key,
        selectedOptions: validated.selectedOptions,
        source,
        scope: assignmentScope,
      }),
      next: ['connect-price-book', 'run-downstream-provisioning', 'workspace-scope-entitlements'],
    };
  }

  async syncCurrentPackage(input: {
    tenantSlug?: string;
    userEmail?: string;
    workspaceSlug?: string;
    source?: string;
  }) {
    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        ...input,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.ADMIN,
        scope: 'tenant-admin',
      },
    );
    const assignmentResolution = await this.resolvePackageAssignmentForScope(
      context.tenant.id,
      context.tenant.slug,
      context.activeWorkspace?.slug,
    );
    const assignment = assignmentResolution.assignment;

    if (!assignment) {
      throw new NotFoundException(
        `Package assignment not found for scope: ${assignmentResolution.effectiveScope.scopeKey}`,
      );
    }

    const entitlementSync = await this.syncEntitlementsFromAssignment({
      tenantId: context.tenant.id,
      basePlanKey: assignment.basePlanKey,
      selectedOptions: assignment.selectedOptions,
      source: input.source?.trim() || 'package-sync',
      scope: assignmentResolution.effectiveScope,
    });

    return {
      capability: 'entitlements',
      status: 'synced',
      tenant: context.tenant,
      workspace: context.activeWorkspace,
      assignment,
      scope: {
        requested: this.describeScope(
          context.tenant.slug,
          context.activeWorkspace?.slug,
        ),
        effective: assignmentResolution.effectiveScope,
        fallbackApplied: assignmentResolution.fallbackApplied,
        entitlementBoundary: assignmentResolution.entitlementBoundary,
      },
      entitlementSync,
      next: ['price-book-linkage', 'downstream-provisioning-reconciliation'],
    };
  }

  async getConnectorCommercializationState(input: ConnectorCommercializationInput) {
    const context = await this.actorContext.resolve(input);
    const connectorKey = input.connectorKey?.trim().toLowerCase();

    if (!connectorKey) {
      throw new BadRequestException('Missing connectorKey.');
    }

    const connectorDependencyKey = `connector.${connectorKey}`;
    const matchingOptions = PACKAGE_OPTIONS_CATALOG.filter((option) =>
      option.dependencyKeys.some((dependencyKey) => dependencyKey === connectorDependencyKey),
    );

    const [assignmentResolution, entitlements, connections] = await Promise.all([
      this.resolvePackageAssignmentForScope(
        context.tenant.id,
        context.tenant.slug,
        context.activeWorkspace?.slug,
      ),
      this.prisma.entitlement.findMany({
        where: {
          tenantId: context.tenant.id,
          key: {
            in: matchingOptions.map((option) => option.entitlementKey),
          },
        },
        orderBy: [{ key: 'asc' }],
        select: {
          key: true,
          kind: true,
          value: true,
          source: true,
          endsAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.integrationConnection.findMany({
        where: {
          tenantId: context.tenant.id,
          provider: connectorKey,
          ...(context.activeWorkspace
            ? {
                OR: [
                  { workspaceId: context.activeWorkspace.id },
                  { workspaceId: null },
                ],
              }
            : {}),
        },
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          updatedAt: true,
        },
      }),
    ]);

    const assignment = assignmentResolution.assignment;

    return {
      capability: 'entitlements',
      status: 'resolved',
      tenant: context.tenant,
      workspace: context.activeWorkspace,
      connector: {
        key: connectorKey,
        connectionCount: connections.length,
        activeConnectionCount: connections.filter(
          (connection) => connection.status === 'ACTIVE',
        ).length,
        connections,
      },
      commercialization: {
        scope: {
          requested: this.describeScope(
            context.tenant.slug,
            context.activeWorkspace?.slug,
          ),
          effective: assignmentResolution.effectiveScope,
          fallbackApplied: assignmentResolution.fallbackApplied,
          entitlementBoundary: assignmentResolution.entitlementBoundary,
        },
        assignment,
        options: matchingOptions.map((option) => {
          const entitlement = entitlements.find(
            (candidate) => candidate.key === option.entitlementKey,
          );
          const selected = assignment?.selectedOptions.includes(option.key) ?? false;
          const connectorReady = connections.some(
            (connection) => connection.status === 'ACTIVE',
          );

          return {
            ...option,
            selected,
            connectorReady,
            entitlement,
            commercializationState: selected
              ? connectorReady
                ? 'commercializable'
                : 'selected-but-connector-not-active'
              : 'available-not-selected',
          };
        }),
        operatorActions: [
          'review-package-option',
          'confirm-entitlement-state',
          'check-connector-health',
          'provision-or-reconcile-downstream-capability',
        ],
      },
      next: ['connector-option-provisioning-preview', 'price-book-binding', 'usage-metering-linkage'],
    };
  }

  previewConnectorOptionProvisioning(input: {
    connectorKey?: string;
    selectedOptions?: string[];
  }) {
    const connectorKey = input.connectorKey?.trim().toLowerCase();

    if (!connectorKey) {
      throw new BadRequestException('Missing connectorKey.');
    }

    const normalizedOptions = Array.from(
      new Set((input.selectedOptions ?? []).map((item) => item.trim().toLowerCase())),
    );

    const connectorDependencyKey = `connector.${connectorKey}`;
    const matchingOptions = PACKAGE_OPTIONS_CATALOG.filter(
      (option) =>
        option.dependencyKeys.some((dependencyKey) => dependencyKey === connectorDependencyKey) &&
        (normalizedOptions.length === 0 || normalizedOptions.includes(option.key)),
    );

    if (matchingOptions.length === 0) {
      throw new NotFoundException(
        `No package options found for connector: ${connectorKey}`,
      );
    }

    return {
      capability: 'entitlements',
      status: 'preview',
      connector: connectorKey,
      provisioningPreview: matchingOptions.map((option) => ({
        optionKey: option.key,
        downstreamSystem: option.downstreamSystem,
        entitlementKey: option.entitlementKey,
        billingMode: option.billingMode,
        operatorConfiguration: option.operatorConfiguration,
        provisioningStates: option.provisioningStates,
        steps: [
          'ensure-connector-active',
          'assign-or-confirm-package-option',
          'sync-entitlement',
          'trigger-downstream-provisioning',
          'verify-health-and-usage-visibility',
        ],
      })),
      next: ['assign-package-option', 'sync-entitlements', 'record-provisioning-run'],
    };
  }

  private async syncEntitlementsFromAssignment(input: {
    tenantId: string;
    basePlanKey: string;
    selectedOptions: string[];
    source: string;
    scope: ScopeDescriptor;
  }) {
    const basePlanEntitlementKey = 'package.base-plan';
    const featureKeys = PACKAGE_OPTIONS_CATALOG.map((option) => option.entitlementKey);
    const scopedSource = `${input.source}:${input.scope.scopeKey}`;

    await this.prisma.entitlement.upsert({
      where: {
        tenantId_key: {
          tenantId: input.tenantId,
          key: basePlanEntitlementKey,
        },
      },
      update: {
        kind: EntitlementKind.FEATURE,
        value: input.basePlanKey,
        source: scopedSource,
        endsAt: null,
      },
      create: {
        tenantId: input.tenantId,
        key: basePlanEntitlementKey,
        kind: EntitlementKind.FEATURE,
        value: input.basePlanKey,
        source: scopedSource,
      },
    });

    const selectedFeatureKeys = PACKAGE_OPTIONS_CATALOG.filter((option) =>
      input.selectedOptions.includes(option.key),
    ).map((option) => option.entitlementKey);

    const now = new Date();

    await Promise.all(
      featureKeys.map((featureKey) => {
        const enabled = selectedFeatureKeys.includes(featureKey);

        return this.prisma.entitlement.upsert({
          where: {
            tenantId_key: {
              tenantId: input.tenantId,
              key: featureKey,
            },
          },
          update: {
            kind: EntitlementKind.FEATURE,
            value: enabled ? 'enabled' : 'disabled',
            source: scopedSource,
            endsAt: enabled ? null : now,
          },
          create: {
            tenantId: input.tenantId,
            key: featureKey,
            kind: EntitlementKind.FEATURE,
            value: enabled ? 'enabled' : 'disabled',
            source: scopedSource,
            endsAt: enabled ? null : now,
          },
        });
      }),
    );

    return {
      scope: {
        assignment: input.scope,
        entitlementBoundary: this.describeEntitlementBoundary(input.scope),
        sourceTag: scopedSource,
      },
      basePlanEntitlementKey,
      selectedFeatureKeys,
      disabledFeatureKeys: featureKeys.filter(
        (featureKey) => !selectedFeatureKeys.includes(featureKey),
      ),
      syncedAt: now.toISOString(),
    };
  }

  private validateSelection(basePlanKey?: string, selectedOptions?: string[]) {
    const normalizedBasePlanKey = basePlanKey?.trim().toLowerCase();
    const normalizedSelectedOptions = Array.from(
      new Set((selectedOptions ?? []).map((item) => item.trim().toLowerCase())),
    );

    if (!normalizedBasePlanKey) {
      throw new BadRequestException('Missing basePlanKey.');
    }

    const plan = PLAN_CATALOG.find(
      (candidate) => candidate.key === normalizedBasePlanKey,
    );

    if (!plan) {
      throw new NotFoundException(`Plan not found: ${normalizedBasePlanKey}`);
    }

    const selectedOptionDefinitions = normalizedSelectedOptions.map((optionKey) => {
      const option = PACKAGE_OPTIONS_CATALOG.find(
        (candidate) => candidate.key === optionKey,
      );

      if (!option) {
        throw new NotFoundException(`Package option not found: ${optionKey}`);
      }

      return option;
    });

    const unavailableOptions = selectedOptionDefinitions
      .filter((option) => !plan.availableOptions.includes(option.key))
      .map((option) => option.key);

    if (unavailableOptions.length > 0) {
      throw new BadRequestException(
        `Selected options are not available for plan ${plan.key}: ${unavailableOptions.join(', ')}`,
      );
    }

    return {
      plan,
      selectedOptions: normalizedSelectedOptions,
      selectedOptionDefinitions,
    };
  }

  private buildScopeKey(tenantSlug: string, workspaceSlug?: string | null) {
    return workspaceSlug
      ? `${tenantSlug}:workspace:${workspaceSlug}`
      : `${tenantSlug}:tenant:default`;
  }

  private describeScope(tenantSlug: string, workspaceSlug?: string | null): ScopeDescriptor {
    return {
      scopeKey: this.buildScopeKey(tenantSlug, workspaceSlug),
      scopeType: workspaceSlug ? 'workspace' : 'tenant',
      workspaceSlug: workspaceSlug ?? null,
      tenantSlug,
    };
  }

  private describeEntitlementBoundary(scope: ScopeDescriptor) {
    return {
      model: 'tenant-wide-entitlements',
      assignmentScope: scope.scopeType,
      assignmentScopeKey: scope.scopeKey,
      workspaceScopedAssignment: scope.scopeType === 'workspace',
      note:
        scope.scopeType === 'workspace'
          ? 'Workspace-scoped package selection is recorded separately, but current entitlement records remain tenant-wide and must be interpreted with the attached scope metadata.'
          : 'Tenant-scoped package selection and entitlement records are aligned at the tenant boundary.',
    };
  }

  private describeEntitlementSyncSummary(input: {
    requestedScope: ScopeDescriptor;
    effectiveScope: ScopeDescriptor;
    fallbackApplied: boolean;
    entitlements: Array<{
      key: string;
      value: string;
      source: string | null;
      updatedAt?: Date | null;
    }>;
  }) {
    const requestedScopeSuffix = `:${input.requestedScope.scopeKey}`;
    const effectiveScopeSuffix = `:${input.effectiveScope.scopeKey}`;
    const requestedScopeMatches = input.entitlements.filter((entitlement) =>
      entitlement.source?.endsWith(requestedScopeSuffix),
    );
    const effectiveScopeMatches = input.entitlements.filter((entitlement) =>
      entitlement.source?.endsWith(effectiveScopeSuffix),
    );
    const basePlanEntitlement = input.entitlements.find(
      (entitlement) => entitlement.key === 'package.base-plan',
    );

    return {
      requestedScope: input.requestedScope,
      effectiveScope: input.effectiveScope,
      fallbackApplied: input.fallbackApplied,
      counts: {
        requestedScopeSourceMatches: requestedScopeMatches.length,
        effectiveScopeSourceMatches: effectiveScopeMatches.length,
      },
      basePlanEntitlement: basePlanEntitlement
        ? {
            key: basePlanEntitlement.key,
            value: basePlanEntitlement.value,
            source: basePlanEntitlement.source,
            scopeAligned: Boolean(
              basePlanEntitlement.source?.endsWith(effectiveScopeSuffix),
            ),
            updatedAt: basePlanEntitlement.updatedAt ?? null,
          }
        : null,
      optionAudit: PACKAGE_OPTIONS_CATALOG.map((option) => {
        const entitlement = input.entitlements.find(
          (candidate) => candidate.key === option.entitlementKey,
        );

        return {
          optionKey: option.key,
          entitlementKey: option.entitlementKey,
          value: entitlement?.value ?? null,
          source: entitlement?.source ?? null,
          scopeAligned: Boolean(
            entitlement?.source?.endsWith(effectiveScopeSuffix),
          ),
          updatedAt: entitlement?.updatedAt ?? null,
        };
      }),
    };
  }

  private async resolvePackageAssignmentForScope(
    tenantId: string,
    tenantSlug: string,
    workspaceSlug?: string | null,
  ) {
    const requestedScope = this.describeScope(tenantSlug, workspaceSlug);
    const fallbackScope = this.describeScope(tenantSlug);
    const scopeKeys = requestedScope.scopeType === 'workspace'
      ? [requestedScope.scopeKey, fallbackScope.scopeKey]
      : [requestedScope.scopeKey];

    const assignments = await this.prisma.tenantPackageAssignment.findMany({
      where: {
        tenantId,
        scopeKey: { in: scopeKeys },
      },
      select: {
        id: true,
        scopeKey: true,
        basePlanKey: true,
        selectedOptions: true,
        billingSnapshot: true,
        provisioningState: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const assignment = assignments.find(
      (candidate) => candidate.scopeKey === requestedScope.scopeKey,
    ) ?? assignments.find((candidate) => candidate.scopeKey === fallbackScope.scopeKey) ?? null;

    const effectiveScope = assignment
      ? assignment.scopeKey === fallbackScope.scopeKey
        ? fallbackScope
        : requestedScope
      : requestedScope;

    return {
      assignment,
      requestedScope,
      effectiveScope,
      fallbackApplied:
        Boolean(assignment) &&
        requestedScope.scopeType === 'workspace' &&
        effectiveScope.scopeKey !== requestedScope.scopeKey,
      entitlementBoundary: this.describeEntitlementBoundary(effectiveScope),
    };
  }
}

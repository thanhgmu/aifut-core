import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntitlementKind } from '@prisma/client';
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

  async getTenantPackageState(input: {
    tenantSlug?: string;
    userEmail?: string;
    workspaceSlug?: string;
  }) {
    const context = await this.actorContext.resolve(input);
    const scopeKey = this.buildScopeKey(
      context.tenant.slug,
      context.activeWorkspace?.slug,
    );

    const [assignment, entitlements] = await Promise.all([
      this.prisma.tenantPackageAssignment.findUnique({
        where: { scopeKey },
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
      }),
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
        },
      }),
    ]);

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
        assignment,
        basePlan: assignment?.basePlanKey ?? 'operator-assigned',
        selectedOptions: assignment?.selectedOptions ?? [],
        activeOptionEntitlements: activeOptionKeys,
        entitlementCount: entitlements.length,
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
    const context = await this.actorContext.resolve(input);
    const validated = this.validateSelection(
      input.basePlanKey,
      input.selectedOptions,
    );
    const scopeKey = this.buildScopeKey(
      context.tenant.slug,
      context.activeWorkspace?.slug,
    );

    const assignment = await this.prisma.tenantPackageAssignment.upsert({
      where: { scopeKey },
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
        source: input.source?.trim() || 'aifut-admin',
      },
      create: {
        tenantId: context.tenant.id,
        workspaceId: context.activeWorkspace?.id,
        scopeKey,
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
        source: input.source?.trim() || 'aifut-admin',
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
      next: ['sync-feature-entitlements', 'connect-price-book', 'run-downstream-provisioning'],
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
}

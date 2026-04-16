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

    const entitlements = await this.prisma.entitlement.findMany({
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
    });

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
      status: 'resolved',
      tenant: context.tenant,
      workspace: context.activeWorkspace,
      packageState: {
        basePlan: 'operator-assigned',
        activeOptionEntitlements: activeOptionKeys,
        entitlementCount: entitlements.length,
      },
      entitlements,
      next: ['plan-assignment-record', 'price-book-linkage', 'workspace-scope-overrides'],
    };
  }

  previewSelection(input: PackageSelectionPreviewInput) {
    const basePlanKey = input.basePlanKey?.trim().toLowerCase();
    const selectedOptions = Array.from(
      new Set((input.selectedOptions ?? []).map((item) => item.trim().toLowerCase())),
    );

    if (!basePlanKey) {
      throw new BadRequestException('Missing basePlanKey.');
    }

    const plan = PLAN_CATALOG.find((candidate) => candidate.key === basePlanKey);

    if (!plan) {
      throw new NotFoundException(`Plan not found: ${basePlanKey}`);
    }

    const selectedOptionDefinitions = selectedOptions.map((optionKey) => {
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
      capability: 'entitlements',
      status: 'preview',
      selection: {
        basePlan: plan,
        selectedOptions: selectedOptionDefinitions,
      },
      commercialEffects: {
        basePlanPriceMonthly: plan.basePriceMonthly,
        optionPriceDeltas: selectedOptionDefinitions.map((option) => ({
          key: option.key,
          billingMode: option.billingMode,
          priceDelta: option.defaultPriceDelta,
        })),
        totalPriceComputation: 'operator-price-book-required',
      },
      provisioningEffects: {
        requiresConnectorKeys: Array.from(
          new Set(selectedOptionDefinitions.flatMap((option) => option.dependencyKeys)),
        ),
        downstreamSystems: Array.from(
          new Set(selectedOptionDefinitions.map((option) => option.downstreamSystem)),
        ),
      },
      next: ['persist-package-assignment', 'apply-entitlements', 'run-provisioning-flow'],
    };
  }
}

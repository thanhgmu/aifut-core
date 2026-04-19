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
}

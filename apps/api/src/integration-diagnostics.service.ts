import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CONNECTOR_REGISTRY_FOUNDATION } from './connectors.constants';

@Injectable()
export class IntegrationDiagnosticsService {
  constructor(private readonly prisma: PrismaService) {}

  async diagnose(input: {
    tenantSlug?: string;
    workspaceSlug?: string;
    connectionSlug?: string;
    connectorKey?: string;
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
            slug: true,
            name: true,
          },
        },
        integrations: {
          select: {
            id: true,
            name: true,
            slug: true,
            provider: true,
            status: true,
            workspaceId: true,
            workspace: {
              select: {
                slug: true,
                name: true,
              },
            },
            secretsRef: true,
            config: true,
            mappingMode: true,
            mappedObjects: true,
            fieldMappings: true,
            eventMappings: true,
            syncPolicy: true,
            targetBaseUrl: true,
            lastVerifiedAt: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: 'desc' }],
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant not found for slug: ${tenantSlug}`);
    }

    const workspaceSlug = input.workspaceSlug?.trim().toLowerCase();
    const activeWorkspace = workspaceSlug
      ? tenant.workspaces.find((workspace) => workspace.slug === workspaceSlug) ?? null
      : null;

    if (workspaceSlug && !activeWorkspace) {
      throw new NotFoundException(
        `Workspace not found for slug ${workspaceSlug} in tenant ${tenantSlug}`,
      );
    }

    const scopedConnections = activeWorkspace
      ? tenant.integrations.filter(
          (connection) =>
            !connection.workspaceId || connection.workspaceId === activeWorkspace.id,
        )
      : tenant.integrations;

    const requestedConnectionSlug = input.connectionSlug?.trim().toLowerCase();
    const requestedConnectorKey = input.connectorKey?.trim().toLowerCase();

    const candidateConnections = scopedConnections.filter((connection) => {
      if (requestedConnectionSlug && connection.slug !== requestedConnectionSlug) {
        return false;
      }

      if (
        requestedConnectorKey &&
        connection.provider.trim().toLowerCase() !== requestedConnectorKey
      ) {
        return false;
      }

      return true;
    });

    return {
      capability: 'integrations',
      surface: 'diagnostics',
      status: candidateConnections.length > 0 ? 'resolved' : 'empty',
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      activeWorkspace,
      diagnostics: candidateConnections.map((connection) => {
        const connector = CONNECTOR_REGISTRY_FOUNDATION.find(
          (candidate) => candidate.key === connection.provider.trim().toLowerCase(),
        );

        const checks = [
          {
            key: 'credential-reference',
            status: connection.secretsRef ? 'pass' : 'warn',
            detail: connection.secretsRef
              ? 'Credential reference is declared.'
              : 'No secretsRef declared yet.',
          },
          {
            key: 'endpoint-declaration',
            status: this.hasTargetBaseUrl(connection.config, connection.targetBaseUrl)
              ? 'pass'
              : 'warn',
            detail: this.hasTargetBaseUrl(connection.config, connection.targetBaseUrl)
              ? 'Remote endpoint is declared.'
              : 'No target base URL detected in config or connection endpoint fields.',
          },
          {
            key: 'mapping-readiness',
            status: connection.mappedObjects.length > 0 ? 'pass' : 'warn',
            detail:
              connection.mappedObjects.length > 0
                ? `Mapped objects: ${connection.mappedObjects.join(', ')}`
                : 'No mapped objects selected yet.',
          },
          {
            key: 'event-policy',
            status: connection.eventMappings || connection.syncPolicy ? 'pass' : 'warn',
            detail:
              connection.eventMappings || connection.syncPolicy
                ? 'Event mappings or sync policy declared.'
                : 'No event mapping or sync policy declared yet.',
          },
          {
            key: 'verification-state',
            status: connection.lastVerifiedAt ? 'pass' : 'warn',
            detail: connection.lastVerifiedAt
              ? `Last verified at ${connection.lastVerifiedAt.toISOString()}.`
              : 'Connection has not been verified yet.',
          },
        ];

        const issueSummary = checks.filter((check) => check.status !== 'pass');

        return {
          connection: {
            id: connection.id,
            name: connection.name,
            slug: connection.slug,
            provider: connection.provider,
            workspace: connection.workspace,
            status: connection.status,
            mappingMode: connection.mappingMode,
            lastVerifiedAt: connection.lastVerifiedAt,
            updatedAt: connection.updatedAt,
          },
          connectorContract: connector
            ? {
                key: connector.key,
                name: connector.name,
                category: connector.category,
                authModes: connector.authModes,
                syncDirections: connector.syncDirections,
                capabilities: connector.capabilities,
              }
            : null,
          checks,
          summary: {
            readyForOperatorReview: issueSummary.length <= 1,
            issueCount: issueSummary.length,
            state:
              issueSummary.length === 0
                ? 'ready'
                : issueSummary.length <= 2
                  ? 'needs-review'
                  : 'needs-setup',
          },
          recommendedActions: issueSummary.map((issue) =>
            this.mapIssueToAction(issue.key),
          ),
        };
      }),
      next: [
        'connection-health-persistence',
        'diagnostic-run-history',
        'auto-fix-suggestion-surface',
      ],
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

  private mapIssueToAction(issueKey: string) {
    switch (issueKey) {
      case 'credential-reference':
        return 'attach-or-create-credential-reference';
      case 'endpoint-declaration':
        return 'declare-target-endpoint-or-base-url';
      case 'mapping-readiness':
        return 'choose-initial-mapped-objects';
      case 'event-policy':
        return 'define-sync-policy-or-event-mappings';
      case 'verification-state':
        return 'run-verification-check';
      default:
        return 'manual-review';
    }
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { IntegrationAiDraftingService } from './integration-ai-drafting.service';
import { IntegrationDiagnosticsService } from './integration-diagnostics.service';
import { IntegrationSetupService } from './integration-setup.service';

type SaveSetupDraftInput = {
  tenantSlug?: string;
  workspaceSlug?: string;
  connectorKey?: string;
  prompt?: string;
  storagePolicyKey?: string;
  draftKey?: string;
};

type RecordDiagnosticRunInput = {
  tenantSlug?: string;
  workspaceSlug?: string;
  connectionSlug?: string;
  connectorKey?: string;
  runKey?: string;
};

@Injectable()
export class IntegrationWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationSetup: IntegrationSetupService,
    private readonly integrationAiDrafting: IntegrationAiDraftingService,
    private readonly integrationDiagnostics: IntegrationDiagnosticsService,
  ) {}

  async saveSetupDraft(input: SaveSetupDraftInput) {
    const tenant = await this.requireTenant(input.tenantSlug);
    const workspace = this.findWorkspace(tenant, input.workspaceSlug);
    const connectorKey = input.connectorKey?.trim().toLowerCase();
    const prompt = input.prompt?.trim();

    if (!connectorKey) {
      throw new BadRequestException('Missing connectorKey.');
    }

    const setupSession = await this.integrationSetup.buildSetupSession({
      connectorKey,
      tenantSlug: tenant.slug,
      workspaceSlug: workspace?.slug,
      storagePolicyKey: input.storagePolicyKey,
    });

    const aiDraft = prompt
      ? this.integrationAiDrafting.draftFromNaturalLanguage({
          connectorKey,
          prompt,
          tenantSlug: tenant.slug,
          workspaceSlug: workspace?.slug,
          storagePolicyKey: input.storagePolicyKey,
        })
      : null;

    const draftKey = input.draftKey?.trim().toLowerCase() || `${connectorKey}-draft`;

    const payload = this.toJson({
      connectorKey,
      storagePolicyKey: input.storagePolicyKey?.trim().toLowerCase() ?? null,
      setupSession,
      aiDraft,
      prompt: prompt ?? null,
    });

    const draftRecord = await this.prisma.integrationConnection.upsert({
      where: {
        tenantId_slug: {
          tenantId: tenant.id,
          slug: draftKey,
        },
      },
      update: {
        workspaceId: workspace?.id ?? null,
        provider: connectorKey,
        status: 'PENDING',
        config: payload,
        mappingMode: aiDraft?.draft.mappingProfile.mode ?? 'draft-session',
        mappedObjects: aiDraft?.draft.mappingProfile.objects ?? [],
        fieldMappings: this.toJson(aiDraft?.draft.mappingProfile.fieldMappings),
        eventMappings: this.toJson(aiDraft?.draft.mappingProfile.eventMappings),
        syncPolicy: this.toJson(aiDraft?.draft.mappingProfile.syncPolicy),
      },
      create: {
        tenantId: tenant.id,
        workspaceId: workspace?.id ?? null,
        name: `${setupSession.connector.name} Draft Session`,
        slug: draftKey,
        provider: connectorKey,
        category: this.mapConnectorCategory(setupSession.connector.category),
        status: 'PENDING',
        config: payload,
        mappingMode: aiDraft?.draft.mappingProfile.mode ?? 'draft-session',
        mappedObjects: aiDraft?.draft.mappingProfile.objects ?? [],
        fieldMappings: this.toJson(aiDraft?.draft.mappingProfile.fieldMappings),
        eventMappings: this.toJson(aiDraft?.draft.mappingProfile.eventMappings),
        syncPolicy: this.toJson(aiDraft?.draft.mappingProfile.syncPolicy),
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
            name: true,
            slug: true,
          },
        },
        updatedAt: true,
      },
    });

    return {
      capability: 'integrations',
      surface: 'workflow-state',
      status: 'draft-saved',
      draft: draftRecord,
      next: ['review-draft-session', 'collect-credentials', 'run-diagnostics'],
    };
  }

  async recordDiagnosticRun(input: RecordDiagnosticRunInput) {
    const tenant = await this.requireTenant(input.tenantSlug);
    const workspace = this.findWorkspace(tenant, input.workspaceSlug);

    const diagnostics = await this.integrationDiagnostics.diagnose({
      tenantSlug: tenant.slug,
      workspaceSlug: workspace?.slug,
      connectionSlug: input.connectionSlug,
      connectorKey: input.connectorKey,
    });

    if (!diagnostics.diagnostics.length) {
      throw new NotFoundException('No matching integration connections found for diagnostics.');
    }

    const runKey = input.runKey?.trim().toLowerCase() || `${input.connectionSlug ?? input.connectorKey ?? 'diagnostic'}-health`;
    const primaryDiagnostic = diagnostics.diagnostics[0];

    const diagnosticRecord = await this.prisma.integrationConnection.upsert({
      where: {
        tenantId_slug: {
          tenantId: tenant.id,
          slug: runKey,
        },
      },
      update: {
        workspaceId: workspace?.id ?? null,
        provider: primaryDiagnostic.connection.provider.toLowerCase(),
        status: primaryDiagnostic.summary.state === 'ready' ? 'ACTIVE' : 'DEGRADED',
        config: this.toJson({
          type: 'diagnostic-history',
          sourceConnection: primaryDiagnostic.connection,
          diagnostics,
        }),
        mappingMode: primaryDiagnostic.connection.mappingMode ?? 'diagnostic-history',
        mappedObjects: [],
      },
      create: {
        tenantId: tenant.id,
        workspaceId: workspace?.id ?? null,
        name: `${primaryDiagnostic.connection.name} Diagnostic History`,
        slug: runKey,
        provider: primaryDiagnostic.connection.provider.toLowerCase(),
        category: this.mapConnectorCategory(
          primaryDiagnostic.connectorContract?.category ?? 'custom',
        ),
        status: primaryDiagnostic.summary.state === 'ready' ? 'ACTIVE' : 'DEGRADED',
        config: this.toJson({
          type: 'diagnostic-history',
          sourceConnection: primaryDiagnostic.connection,
          diagnostics,
        }),
        mappingMode: primaryDiagnostic.connection.mappingMode ?? 'diagnostic-history',
        mappedObjects: [],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        status: true,
        updatedAt: true,
      },
    });

    return {
      capability: 'integrations',
      surface: 'workflow-state',
      status: 'diagnostic-recorded',
      record: diagnosticRecord,
      summary: primaryDiagnostic.summary,
      recommendedActions: primaryDiagnostic.recommendedActions,
      next: ['review-operator-actions', 'rerun-diagnostics-after-fixes', 'activate-connection-when-ready'],
    };
  }

  private async requireTenant(tenantSlug?: string) {
    const normalizedTenantSlug = tenantSlug?.trim().toLowerCase();

    if (!normalizedTenantSlug) {
      throw new BadRequestException('Missing tenantSlug.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: normalizedTenantSlug },
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
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant not found for slug: ${normalizedTenantSlug}`);
    }

    return tenant;
  }

  private findWorkspace(
    tenant: {
      workspaces: { id: string; name: string; slug: string }[];
    },
    workspaceSlug?: string,
  ) {
    const normalizedWorkspaceSlug = workspaceSlug?.trim().toLowerCase();

    if (!normalizedWorkspaceSlug) {
      return null;
    }

    const workspace =
      tenant.workspaces.find((candidate) => candidate.slug === normalizedWorkspaceSlug) ?? null;

    if (!workspace) {
      throw new NotFoundException(
        `Workspace not found for slug ${normalizedWorkspaceSlug}.`,
      );
    }

    return workspace;
  }

  private toJson(value: unknown) {
    return value as Prisma.InputJsonValue;
  }

  private mapConnectorCategory(category: string) {
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
      default:
        return 'OTHER';
    }
  }
}

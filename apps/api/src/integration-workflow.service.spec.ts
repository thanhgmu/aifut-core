import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationWorkflowService } from './integration-workflow.service';
import { PrismaService } from './prisma.service';
import { IntegrationSetupService } from './integration-setup.service';
import { IntegrationAiDraftingService } from './integration-ai-drafting.service';
import { IntegrationDiagnosticsService } from './integration-diagnostics.service';
import { ConnectionInstancesService } from './connection-instances.service';

describe('IntegrationWorkflowService', () => {
  let service: IntegrationWorkflowService;
  let prisma: {
    tenant: { findUnique: jest.Mock };
    integrationConnection: { upsert: jest.Mock };
  };
  let integrationSetup: { buildSetupSession: jest.Mock };
  let integrationAiDrafting: { draftFromNaturalLanguage: jest.Mock };
  let integrationDiagnostics: { diagnose: jest.Mock };
  let connectionInstances: { activateConnection: jest.Mock };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findUnique: jest.fn(),
      },
      integrationConnection: {
        upsert: jest.fn(),
      },
    };

    integrationSetup = {
      buildSetupSession: jest.fn(),
    };

    integrationAiDrafting = {
      draftFromNaturalLanguage: jest.fn(),
    };

    integrationDiagnostics = {
      diagnose: jest.fn(),
    };

    connectionInstances = {
      activateConnection: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationWorkflowService,
        { provide: PrismaService, useValue: prisma },
        { provide: IntegrationSetupService, useValue: integrationSetup },
        { provide: IntegrationAiDraftingService, useValue: integrationAiDrafting },
        { provide: IntegrationDiagnosticsService, useValue: integrationDiagnostics },
        { provide: ConnectionInstancesService, useValue: connectionInstances },
      ],
    }).compile();

    service = module.get<IntegrationWorkflowService>(IntegrationWorkflowService);
  });

  it('should reject setup draft creation when tenantSlug is missing', async () => {
    await expect(
      service.saveSetupDraft({
        connectorKey: 'n8n',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject workflow setup draft when workspace is not part of the tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant_1',
      name: 'Acme',
      slug: 'acme',
      workspaces: [{ id: 'ws_1', name: 'Ops', slug: 'ops' }],
    });

    await expect(
      service.saveSetupDraft({
        tenantSlug: 'acme',
        workspaceSlug: 'sales',
        connectorKey: 'n8n',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should reject diagnostic recording when no matching connections are found', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant_1',
      name: 'Acme',
      slug: 'acme',
      workspaces: [{ id: 'ws_1', name: 'Ops', slug: 'ops' }],
    });
    integrationDiagnostics.diagnose.mockResolvedValue({ diagnostics: [] });

    await expect(
      service.recordDiagnosticRun({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        connectionSlug: 'missing-connection',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should reject review activation when diagnostics cannot resolve a connection', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant_1',
      name: 'Acme',
      slug: 'acme',
      workspaces: [{ id: 'ws_1', name: 'Ops', slug: 'ops' }],
    });
    integrationDiagnostics.diagnose.mockResolvedValue({ diagnostics: [] });

    await expect(
      service.reviewAndActivate({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        userEmail: 'ops@acme.test',
        connectionSlug: 'missing-connection',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should activate the connection resolved from diagnostics review', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant_1',
      name: 'Acme',
      slug: 'acme',
      workspaces: [{ id: 'ws_1', name: 'Ops', slug: 'ops' }],
    });
    integrationDiagnostics.diagnose.mockResolvedValue({
      diagnostics: [
        {
          connection: {
            slug: 'n8n-main',
          },
          summary: {
            issueCount: 1,
          },
          recommendedActions: ['rotate-credentials'],
        },
      ],
    });
    connectionInstances.activateConnection.mockResolvedValue({
      status: 'activated',
      connection: { slug: 'n8n-main' },
    });

    const result = await service.reviewAndActivate({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      hostname: 'ops.acme.test',
      connectionSlug: 'n8n-main',
    });

    expect(connectionInstances.activateConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        userEmail: 'ops@acme.test',
        hostname: 'ops.acme.test',
        connectionSlug: 'n8n-main',
        activationMode: 'manual-review',
      }),
    );
    expect(result).toMatchObject({
      status: 'reviewed-and-activated',
      activation: {
        status: 'activated',
      },
    });
  });
});

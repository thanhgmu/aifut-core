import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { IntegrationsController } from './integrations.controller';
import { InfrastructureProfileService } from './infrastructure-profile.service';
import { ConnectionInstancesService } from './connection-instances.service';
import { CredentialReferencesService } from './credential-references.service';
import { StorageRoutingPolicyService } from './storage-routing-policy.service';
import { IntegrationControlPlaneService } from './integration-control-plane.service';
import { IntegrationSetupService } from './integration-setup.service';
import { IntegrationDiagnosticsService } from './integration-diagnostics.service';
import { IntegrationAiDraftingService } from './integration-ai-drafting.service';
import { IntegrationWorkflowService } from './integration-workflow.service';
import { AccessPolicyService } from './access-policy.service';

describe('IntegrationsController', () => {
  let controller: IntegrationsController;
  let infrastructureProfileService: {
    getTenantInfrastructureProfile: jest.Mock;
    getDomainRoutingPolicy: jest.Mock;
  };
  let storageRoutingPolicy: { getEffectivePolicy: jest.Mock };
  let connectionInstances: {
    listTenantConnections: jest.Mock;
    getConnectionHealthTimeline: jest.Mock;
  };
  let integrationSetup: { buildSetupSession: jest.Mock };
  let integrationDiagnostics: { diagnose: jest.Mock };
  let integrationWorkflow: {
    saveSetupDraft: jest.Mock;
    recordDiagnosticRun: jest.Mock;
    reviewAndActivate: jest.Mock;
  };

  beforeEach(async () => {
    infrastructureProfileService = {
      getTenantInfrastructureProfile: jest.fn(),
      getDomainRoutingPolicy: jest.fn(),
    };

    storageRoutingPolicy = {
      getEffectivePolicy: jest.fn(),
    };

    connectionInstances = {
      listTenantConnections: jest.fn(),
      getConnectionHealthTimeline: jest.fn(),
    };

    integrationSetup = {
      buildSetupSession: jest.fn(),
    };

    integrationDiagnostics = {
      diagnose: jest.fn(),
    };

    integrationWorkflow = {
      saveSetupDraft: jest.fn(),
      recordDiagnosticRun: jest.fn(),
      reviewAndActivate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntegrationsController],
      providers: [
        { provide: InfrastructureProfileService, useValue: infrastructureProfileService },
        { provide: ConnectionInstancesService, useValue: connectionInstances },
        { provide: CredentialReferencesService, useValue: { getBlueprint: jest.fn(), previewReference: jest.fn() } },
        { provide: StorageRoutingPolicyService, useValue: storageRoutingPolicy },
        { provide: IntegrationControlPlaneService, useValue: { summarizeTenantControlPlane: jest.fn() } },
        { provide: IntegrationSetupService, useValue: integrationSetup },
        { provide: IntegrationDiagnosticsService, useValue: integrationDiagnostics },
        { provide: IntegrationAiDraftingService, useValue: { draftFromNaturalLanguage: jest.fn() } },
        { provide: IntegrationWorkflowService, useValue: integrationWorkflow },
        { provide: AccessPolicyService, useValue: { resolveAndRequire: jest.fn() } },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
      ],
    }).compile();

    controller = module.get<IntegrationsController>(IntegrationsController);
  });

  it('should resolve infrastructure profile from header or query', async () => {
    infrastructureProfileService.getTenantInfrastructureProfile.mockResolvedValue({
      tenantSlug: 'acme',
      topology: 'split',
    });

    const result = await controller.infrastructureProfile('acme', undefined);

    expect(infrastructureProfileService.getTenantInfrastructureProfile).toHaveBeenCalledWith(
      'acme',
    );
    expect(result).toMatchObject({
      capability: 'integrations',
      status: 'resolved',
      profile: { tenantSlug: 'acme', topology: 'split' },
    });
  });

  it('should forward storage routing context to storage policy service', async () => {
    storageRoutingPolicy.getEffectivePolicy.mockResolvedValue({
      policyKey: 'assets',
      effectivePolicy: { id: 'policy_1' },
    });

    const result = await controller.storageRouting(
      'acme',
      'ops@acme.test',
      'ops',
      'ops.acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'assets',
      'uploads/logo.png',
    );

    expect(storageRoutingPolicy.getEffectivePolicy).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'ops.acme.test',
      policyKey: 'assets',
      writePath: 'uploads/logo.png',
    });
    expect(result).toMatchObject({
      capability: 'integrations',
      status: 'resolved',
      storage: { policyKey: 'assets' },
    });
  });

  it('should resolve tenant connections from the active tenant', async () => {
    connectionInstances.listTenantConnections.mockResolvedValue([
      { id: 'conn_1', slug: 'nexovaflow-main' },
    ]);

    const result = await controller.connections(undefined, 'acme');

    expect(connectionInstances.listTenantConnections).toHaveBeenCalledWith('acme');
    expect(result).toMatchObject({
      capability: 'integrations',
      status: 'resolved',
      connections: [{ id: 'conn_1', slug: 'nexovaflow-main' }],
    });
  });

  it('should build setup session with routing and storage context', async () => {
    integrationSetup.buildSetupSession.mockResolvedValue({
      connectorKey: 'nexovaflow',
      storagePolicyKey: 'assets',
    });

    const result = await controller.setupSession(
      'acme',
      'ops',
      'ops@acme.test',
      'ops.acme.test',
      undefined,
      'nexovaflow',
      undefined,
      undefined,
      undefined,
      undefined,
      'assets',
    );

    expect(integrationSetup.buildSetupSession).toHaveBeenCalledWith({
      connectorKey: 'nexovaflow',
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      hostname: 'ops.acme.test',
      storagePolicyKey: 'assets',
    });
    expect(result).toMatchObject({
      connectorKey: 'nexovaflow',
      storagePolicyKey: 'assets',
    });
  });

  it('should return connection health timeline for operator surfaces', async () => {
    connectionInstances.getConnectionHealthTimeline.mockResolvedValue({
      surface: 'connection-health-timeline',
      healthTimeline: [{ type: 'verification', status: 'verified' }],
    });

    const result = await controller.connectionHealthTimeline(
      'acme',
      'ops',
      'ops@acme.test',
      'ops.acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'nexovaflow-main',
    );

    expect(connectionInstances.getConnectionHealthTimeline).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      hostname: 'ops.acme.test',
      connectionSlug: 'nexovaflow-main',
    });
    expect(result).toMatchObject({
      surface: 'connection-health-timeline',
      healthTimeline: [{ type: 'verification', status: 'verified' }],
    });
  });

  it('should forward diagnostics routing with header precedence over query params', async () => {
    integrationDiagnostics.diagnose.mockResolvedValue({
      capability: 'integrations',
      diagnostics: [],
    });

    const result = await controller.diagnostics(
      'acme-header',
      'ops-header',
      'acme-query',
      'ops-query',
      'n8n-main',
      'n8n',
    );

    expect(integrationDiagnostics.diagnose).toHaveBeenCalledWith({
      tenantSlug: 'acme-header',
      workspaceSlug: 'ops-header',
      connectionSlug: 'n8n-main',
      connectorKey: 'n8n',
    });
    expect(result).toMatchObject({ capability: 'integrations' });
  });

  it('should route workflow setup draft payload with header tenant/workspace precedence', async () => {
    integrationWorkflow.saveSetupDraft.mockResolvedValue({
      surface: 'workflow-state',
      status: 'draft-saved',
    });

    const result = await controller.saveSetupDraft(
      {
        tenantSlug: 'body-tenant',
        workspaceSlug: 'body-workspace',
        connectorKey: 'n8n',
        prompt: 'Connect n8n',
        storagePolicyKey: 'configs',
        draftKey: 'n8n-draft',
      },
      'header-tenant',
      'header-workspace',
    );

    expect(integrationWorkflow.saveSetupDraft).toHaveBeenCalledWith({
      tenantSlug: 'header-tenant',
      workspaceSlug: 'header-workspace',
      connectorKey: 'n8n',
      prompt: 'Connect n8n',
      storagePolicyKey: 'configs',
      draftKey: 'n8n-draft',
    });
    expect(result).toMatchObject({ status: 'draft-saved' });
  });

  it('should route workflow diagnostic runs through the workflow service', async () => {
    integrationWorkflow.recordDiagnosticRun.mockResolvedValue({
      surface: 'workflow-state',
      status: 'diagnostic-recorded',
    });

    const result = await controller.recordDiagnosticRun(
      {
        tenantSlug: 'body-tenant',
        workspaceSlug: 'body-workspace',
        connectionSlug: 'n8n-main',
        connectorKey: 'n8n',
        runKey: 'n8n-health',
      },
      'header-tenant',
      'header-workspace',
    );

    expect(integrationWorkflow.recordDiagnosticRun).toHaveBeenCalledWith({
      tenantSlug: 'header-tenant',
      workspaceSlug: 'header-workspace',
      connectionSlug: 'n8n-main',
      connectorKey: 'n8n',
      runKey: 'n8n-health',
    });
    expect(result).toMatchObject({ status: 'diagnostic-recorded' });
  });

  it('should route workflow review activation with header and forwarded-host precedence', async () => {
    integrationWorkflow.reviewAndActivate.mockResolvedValue({
      surface: 'workflow-state',
      status: 'reviewed-and-activated',
    });

    const result = await controller.reviewAndActivate(
      {
        tenantSlug: 'body-tenant',
        workspaceSlug: 'body-workspace',
        userEmail: 'body@acme.test',
        hostname: 'body.acme.test',
        connectionSlug: 'n8n-main',
        reviewSummary: 'Looks good',
        activationMode: 'verified-ready',
      },
      'header-tenant',
      'header-workspace',
      'header@acme.test',
      'forwarded.acme.test',
      'host.acme.test',
    );

    expect(integrationWorkflow.reviewAndActivate).toHaveBeenCalledWith({
      tenantSlug: 'header-tenant',
      workspaceSlug: 'header-workspace',
      userEmail: 'header@acme.test',
      hostname: 'forwarded.acme.test',
      connectionSlug: 'n8n-main',
      reviewSummary: 'Looks good',
      activationMode: 'verified-ready',
    });
    expect(result).toMatchObject({ status: 'reviewed-and-activated' });
  });
});

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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntegrationsController],
      providers: [
        { provide: InfrastructureProfileService, useValue: infrastructureProfileService },
        { provide: ConnectionInstancesService, useValue: connectionInstances },
        { provide: CredentialReferencesService, useValue: { getBlueprint: jest.fn(), previewReference: jest.fn() } },
        { provide: StorageRoutingPolicyService, useValue: storageRoutingPolicy },
        { provide: IntegrationControlPlaneService, useValue: { summarizeTenantControlPlane: jest.fn() } },
        { provide: IntegrationSetupService, useValue: integrationSetup },
        { provide: IntegrationDiagnosticsService, useValue: { diagnose: jest.fn() } },
        { provide: IntegrationAiDraftingService, useValue: { draftFromNaturalLanguage: jest.fn() } },
        { provide: IntegrationWorkflowService, useValue: { saveSetupDraft: jest.fn() } },
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
});

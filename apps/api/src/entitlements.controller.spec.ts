import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementsService } from './entitlements.service';
import { AccessPolicyService } from './access-policy.service';

describe('EntitlementsController', () => {
  let controller: EntitlementsController;
  let entitlements: {
    capabilities: jest.Mock;
    getPlanCatalog: jest.Mock;
    getAdminPackageBuilderState: jest.Mock;
    getTenantPackageState: jest.Mock;
    getConnectorCommercializationState: jest.Mock;
    previewSelection: jest.Mock;
    previewConnectorOptionProvisioning: jest.Mock;
    assignPackage: jest.Mock;
    syncCurrentPackage: jest.Mock;
  };

  beforeEach(async () => {
    entitlements = {
      capabilities: jest.fn().mockReturnValue({ capability: 'entitlements', status: 'foundation' }),
      getPlanCatalog: jest.fn(),
      getAdminPackageBuilderState: jest.fn(),
      getTenantPackageState: jest.fn(),
      getConnectorCommercializationState: jest.fn(),
      previewSelection: jest.fn(),
      previewConnectorOptionProvisioning: jest.fn(),
      assignPackage: jest.fn(),
      syncCurrentPackage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EntitlementsController],
      providers: [
        {
          provide: EntitlementsService,
          useValue: entitlements,
        },
        {
          provide: AccessPolicyService,
          useValue: {
            resolve: jest.fn(),
            resolveAndRequire: jest.fn(),
          },
        },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<EntitlementsController>(EntitlementsController);
  });

  it('should forward admin package builder scope from headers before query params', async () => {
    entitlements.getAdminPackageBuilderState.mockResolvedValue({
      builder: {
        scope: {
          requested: { scopeKey: 'acme:workspace:ops' },
          effective: { scopeKey: 'acme:tenant:default' },
          fallbackApplied: true,
        },
      },
    });

    const result = await controller.adminPackageBuilder(
      'acme',
      'ops@acme.test',
      'ops',
      'ignored-tenant',
      'ignored@acme.test',
      'ignored-workspace',
    );

    expect(entitlements.getAdminPackageBuilderState).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
    });
    expect(result).toMatchObject({
      builder: {
        scope: {
          requested: { scopeKey: 'acme:workspace:ops' },
          effective: { scopeKey: 'acme:tenant:default' },
          fallbackApplied: true,
        },
      },
    });
  });

  it('should forward current package scope to tenant package state lookup', async () => {
    entitlements.getTenantPackageState.mockResolvedValue({
      packageState: {
        scope: {
          requested: { scopeKey: 'acme:workspace:ops', scopeType: 'workspace' },
          effective: { scopeKey: 'acme:workspace:ops', scopeType: 'workspace' },
          fallbackApplied: false,
        },
      },
    });

    const result = await controller.currentPackage(
      undefined,
      undefined,
      undefined,
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(entitlements.getTenantPackageState).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
    });
    expect(result).toMatchObject({
      packageState: {
        scope: {
          requested: { scopeKey: 'acme:workspace:ops', scopeType: 'workspace' },
          effective: { scopeKey: 'acme:workspace:ops', scopeType: 'workspace' },
          fallbackApplied: false,
        },
      },
    });
  });

  it('should forward connector commercialization scope and connector key', async () => {
    entitlements.getConnectorCommercializationState.mockResolvedValue({
      commercialization: {
        scope: {
          requested: { scopeKey: 'acme:workspace:ops' },
          effective: { scopeKey: 'acme:tenant:default' },
          fallbackApplied: true,
        },
      },
      connector: { key: 'nexovaflow' },
    });

    const result = await controller.connectorCommercialization(
      'acme',
      'ops@acme.test',
      'ops',
      undefined,
      undefined,
      undefined,
      'nexovaflow',
    );

    expect(entitlements.getConnectorCommercializationState).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      connectorKey: 'nexovaflow',
    });
    expect(result).toMatchObject({
      commercialization: {
        scope: {
          requested: { scopeKey: 'acme:workspace:ops' },
          effective: { scopeKey: 'acme:tenant:default' },
          fallbackApplied: true,
        },
      },
      connector: { key: 'nexovaflow' },
    });
  });

  it('should forward package assignment writes with header scope precedence', async () => {
    entitlements.assignPackage.mockResolvedValue({
      status: 'assigned',
      scope: {
        assignment: { scopeKey: 'acme:workspace:ops' },
      },
    });

    const result = await controller.assignPackage(
      {
        tenantSlug: 'ignored-tenant',
        userEmail: 'ignored@acme.test',
        workspaceSlug: 'ignored-workspace',
        basePlanKey: 'core.growth',
        selectedOptions: ['nexovaflow.automation'],
        source: 'admin-ui',
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(entitlements.assignPackage).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      basePlanKey: 'core.growth',
      selectedOptions: ['nexovaflow.automation'],
      source: 'admin-ui',
    });
    expect(result).toMatchObject({
      status: 'assigned',
      scope: {
        assignment: { scopeKey: 'acme:workspace:ops' },
      },
    });
  });

  it('should forward entitlement sync requests with header scope precedence', async () => {
    entitlements.syncCurrentPackage.mockResolvedValue({
      status: 'synced',
      scope: {
        requested: { scopeKey: 'acme:workspace:ops' },
        effective: { scopeKey: 'acme:tenant:default' },
        fallbackApplied: true,
      },
    });

    const result = await controller.syncPackageEntitlements(
      {
        tenantSlug: 'ignored-tenant',
        userEmail: 'ignored@acme.test',
        workspaceSlug: 'ignored-workspace',
        source: 'manual-sync',
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(entitlements.syncCurrentPackage).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      source: 'manual-sync',
    });
    expect(result).toMatchObject({
      status: 'synced',
      scope: {
        requested: { scopeKey: 'acme:workspace:ops' },
        effective: { scopeKey: 'acme:tenant:default' },
        fallbackApplied: true,
      },
    });
  });
});

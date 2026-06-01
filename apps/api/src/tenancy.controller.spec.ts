import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { TenantDomainKind, TenantDomainStatus } from '@prisma/client';
import { TenancyController } from './tenancy.controller';
import { PrismaService } from './prisma.service';
import { ActorContextService } from './actor-context.service';
import { TenantDomainResolutionService } from './tenant-domain-resolution.service';
import { TenancyOperationsService } from './tenancy-operations.service';
import { StorageRoutingPolicyService } from './storage-routing-policy.service';
import { AccessPolicyService } from './access-policy.service';

describe('TenancyController', () => {
  let controller: TenancyController;
  let actorContext: { resolve: jest.Mock };
  let tenantDomainResolution: { resolveHostname: jest.Mock };
  let storageRoutingPolicy: {
    getEffectivePolicy: jest.Mock;
    requireWritePolicy: jest.Mock;
  };
  let tenancyOperations: {
    createWorkspace: jest.Mock;
    upsertDomain: jest.Mock;
    upsertStoragePolicy: jest.Mock;
    upsertPackageAssignment: jest.Mock;
  };

  beforeEach(async () => {
    tenantDomainResolution = {
      resolveHostname: jest.fn(),
    };

    storageRoutingPolicy = {
      getEffectivePolicy: jest.fn(),
      requireWritePolicy: jest.fn(),
    };

    tenancyOperations = {
      createWorkspace: jest.fn(),
      upsertDomain: jest.fn(),
      upsertStoragePolicy: jest.fn(),
      upsertPackageAssignment: jest.fn(),
    };
    actorContext = {
      resolve: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenancyController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            tenant: { count: jest.fn() },
            workspace: { count: jest.fn() },
            user: { count: jest.fn() },
            tenantDomain: { findMany: jest.fn() },
            tenantStoragePolicy: { findMany: jest.fn() },
          },
        },
        {
          provide: ActorContextService,
          useValue: actorContext,
        },
        {
          provide: TenantDomainResolutionService,
          useValue: tenantDomainResolution,
        },
        {
          provide: AccessPolicyService,
          useValue: {
            resolve: jest.fn(),
          },
        },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
        {
          provide: TenancyOperationsService,
          useValue: tenancyOperations,
        },
        {
          provide: StorageRoutingPolicyService,
          useValue: storageRoutingPolicy,
        },
      ],
    }).compile();

    controller = module.get<TenancyController>(TenancyController);
  });

  it('should enforce known forwarded-host tenant matching for current topology reads', async () => {
    actorContext.resolve.mockRejectedValue(new ForbiddenException());

    await expect(
      controller.current(
        'acme',
        'ops@acme.test',
        undefined,
        'OPS.ACME.TEST:443',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: undefined,
      hostname: 'ops.acme.test',
      enforceWorkspaceDomainMatch: true,
    });
  });

  it('should reject malformed forwarded-host lists before current topology actor resolution', async () => {
    await expect(
      controller.current(
        'acme',
        'ops@acme.test',
        undefined,
        'ops.acme.test, proxy.acme.test',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(actorContext.resolve).not.toHaveBeenCalled();
  });

  it('should pass enforceWorkspaceMatch into host resolution', async () => {
    tenantDomainResolution.resolveHostname.mockResolvedValue({ hostname: 'acme.test' });

    const result = await controller.resolveHost(
      'acme.test',
      undefined,
      undefined,
      'ops',
      'true',
    );

    expect(tenantDomainResolution.resolveHostname).toHaveBeenCalledWith({
      hostname: 'acme.test',
      workspaceSlug: 'ops',
      enforceWorkspaceMatch: true,
    });
    expect(result).toMatchObject({
      capability: 'tenancy',
      status: 'resolved',
      hostResolution: { hostname: 'acme.test' },
    });
  });

  it('should resolve effective storage policy by default', async () => {
    storageRoutingPolicy.getEffectivePolicy.mockResolvedValue({
      policyKey: 'assets',
      effectivePolicy: { id: 'policy_1' },
    });

    const result = await controller.resolveStoragePolicy(
      'acme',
      'ops@acme.test',
      'main',
      'acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'assets',
      'uploads/logo.png',
      undefined,
      undefined,
    );

    expect(storageRoutingPolicy.getEffectivePolicy).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'main',
      hostname: 'acme.test',
      policyKey: 'assets',
      writePath: 'uploads/logo.png',
    });
    expect(result).toMatchObject({
      capability: 'tenancy',
      status: 'resolved',
      storagePolicy: {
        policyKey: 'assets',
        effectivePolicy: { id: 'policy_1' },
      },
    });
  });

  it('should enforce write-policy guardrails when requested', async () => {
    storageRoutingPolicy.requireWritePolicy.mockResolvedValue({
      policyKey: 'assets',
      writeGuardrail: { enforcedWritePath: 'tenants/acme/storage/assets/uploads/logo.png' },
    });

    const result = await controller.resolveStoragePolicy(
      'acme',
      'ops@acme.test',
      'main',
      'acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'assets',
      'uploads/logo.png',
      'true',
      '1',
    );

    expect(storageRoutingPolicy.requireWritePolicy).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'main',
      hostname: 'acme.test',
      policyKey: 'assets',
      writePath: 'uploads/logo.png',
      allowTenantScope: true,
    });
    expect(result).toMatchObject({
      capability: 'tenancy',
      status: 'resolved',
      storagePolicy: {
        writeGuardrail: {
          enforcedWritePath: 'tenants/acme/storage/assets/uploads/logo.png',
        },
      },
    });
  });

  it('should prefer forwarded host and query context for guarded storage resolution when headers are absent', async () => {
    storageRoutingPolicy.requireWritePolicy.mockResolvedValue({
      policyKey: 'assets',
      writeGuardrail: {
        enforcedWritePath:
          'tenants/query-tenant/workspaces/query-workspace/storage/assets/uploads/logo.png',
      },
    });

    const result = await controller.resolveStoragePolicy(
      undefined,
      undefined,
      undefined,
      'forwarded.query.acme.test',
      'fallback.query.acme.test',
      'query-tenant',
      'query@acme.test',
      'query-workspace',
      'query-host.acme.test',
      'assets',
      'uploads/logo.png',
      '1',
      'false',
    );

    expect(storageRoutingPolicy.requireWritePolicy).toHaveBeenCalledWith({
      tenantSlug: 'query-tenant',
      userEmail: 'query@acme.test',
      workspaceSlug: 'query-workspace',
      hostname: 'forwarded.query.acme.test',
      policyKey: 'assets',
      writePath: 'uploads/logo.png',
      allowTenantScope: false,
    });
    expect(result).toMatchObject({
      capability: 'tenancy',
      status: 'resolved',
      storagePolicy: {
        writeGuardrail: {
          enforcedWritePath:
            'tenants/query-tenant/workspaces/query-workspace/storage/assets/uploads/logo.png',
        },
      },
    });
  });

  it('should coerce allowTenantScope to false when explicitly disabled on guarded storage resolution', async () => {
    storageRoutingPolicy.requireWritePolicy.mockResolvedValue({
      policyKey: 'assets',
      writeGuardrail: {
        enforcedWritePath:
          'tenants/query-tenant/workspaces/query-workspace/storage/assets/uploads/logo.png',
      },
    });

    const result = await controller.resolveStoragePolicy(
      undefined,
      undefined,
      undefined,
      'forwarded.query.acme.test',
      'fallback.query.acme.test',
      'query-tenant',
      'query@acme.test',
      'query-workspace',
      'query-host.acme.test',
      'assets',
      'uploads/logo.png',
      'true',
      '0',
    );

    expect(storageRoutingPolicy.requireWritePolicy).toHaveBeenCalledWith({
      tenantSlug: 'query-tenant',
      userEmail: 'query@acme.test',
      workspaceSlug: 'query-workspace',
      hostname: 'forwarded.query.acme.test',
      policyKey: 'assets',
      writePath: 'uploads/logo.png',
      allowTenantScope: false,
    });
    expect(result).toMatchObject({
      capability: 'tenancy',
      status: 'resolved',
      storagePolicy: {
        writeGuardrail: {
          enforcedWritePath:
            'tenants/query-tenant/workspaces/query-workspace/storage/assets/uploads/logo.png',
        },
      },
    });
  });

  it('should prefer host header over hostname query for unguarded storage resolution', async () => {
    storageRoutingPolicy.getEffectivePolicy.mockResolvedValue({
      policyKey: 'assets',
      effectivePolicy: { id: 'policy_host_precedence' },
    });

    const result = await controller.resolveStoragePolicy(
      undefined,
      undefined,
      undefined,
      undefined,
      'host-header.acme.test',
      'query-tenant',
      'query@acme.test',
      'query-workspace',
      'query-host.acme.test',
      'assets',
      'uploads/from-query.png',
      undefined,
      undefined,
    );

    expect(storageRoutingPolicy.getEffectivePolicy).toHaveBeenCalledWith({
      tenantSlug: 'query-tenant',
      userEmail: 'query@acme.test',
      workspaceSlug: 'query-workspace',
      hostname: 'host-header.acme.test',
      policyKey: 'assets',
      writePath: 'uploads/from-query.png',
    });
    expect(result).toMatchObject({
      capability: 'tenancy',
      status: 'resolved',
      storagePolicy: {
        effectivePolicy: { id: 'policy_host_precedence' },
      },
    });
  });

  it('should ignore allowTenantScope when write guardrails are not requested', async () => {
    storageRoutingPolicy.getEffectivePolicy.mockResolvedValue({
      policyKey: 'assets',
      effectivePolicy: { id: 'policy_no_guardrail' },
    });

    const result = await controller.resolveStoragePolicy(
      'acme',
      'ops@acme.test',
      'main',
      'forwarded.acme.test',
      'host.acme.test',
      undefined,
      undefined,
      undefined,
      'query-host.acme.test',
      'assets',
      'uploads/logo.png',
      'false',
      '1',
    );

    expect(storageRoutingPolicy.getEffectivePolicy).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'main',
      hostname: 'forwarded.acme.test',
      policyKey: 'assets',
      writePath: 'uploads/logo.png',
    });
    expect(storageRoutingPolicy.requireWritePolicy).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      capability: 'tenancy',
      status: 'resolved',
      storagePolicy: {
        effectivePolicy: { id: 'policy_no_guardrail' },
      },
    });
  });

  it('should prefer tenant and user headers for workspace creation writes', async () => {
    tenancyOperations.createWorkspace.mockResolvedValue({
      status: 'workspace-created',
      workspace: { slug: 'ops-hub' },
      membership: { isDefault: true },
    });

    const result = await controller.createWorkspace(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        name: 'Ops Hub',
        slug: 'ops-hub',
        makeDefaultForUser: true,
      },
      'acme',
      'ops@acme.test',
    );

    expect(tenancyOperations.createWorkspace).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      name: 'Ops Hub',
      slug: 'ops-hub',
      makeDefaultForUser: true,
    });
    expect(result).toMatchObject({
      status: 'workspace-created',
      workspace: { slug: 'ops-hub' },
      membership: { isDefault: true },
    });
  });

  it('should fall back to body tenant and user values for workspace creation when headers are absent', async () => {
    tenancyOperations.createWorkspace.mockResolvedValue({
      status: 'workspace-created',
      workspace: { slug: 'ops-body' },
      membership: { isDefault: false },
    });

    const result = await controller.createWorkspace({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      name: 'Ops Body',
      slug: 'ops-body',
      makeDefaultForUser: false,
    });

    expect(tenancyOperations.createWorkspace).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      name: 'Ops Body',
      slug: 'ops-body',
      makeDefaultForUser: false,
    });
    expect(result).toMatchObject({
      status: 'workspace-created',
      workspace: { slug: 'ops-body' },
      membership: { isDefault: false },
    });
  });

  it('should prefer tenant, user, and workspace headers for storage policy writes', async () => {
    tenancyOperations.upsertStoragePolicy.mockResolvedValue({
      status: 'storage-policy-upserted',
      topology: { scope: 'workspace', ownershipMode: 'HYBRID' },
    });

    const result = await controller.upsertStoragePolicy(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        key: 'media-assets',
        mode: 'HYBRID' as any,
        targetRef: 's3://primary-assets',
        backupTargetRef: 'b2://backup-assets',
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(tenancyOperations.upsertStoragePolicy).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      key: 'media-assets',
      mode: 'HYBRID',
      targetRef: 's3://primary-assets',
      backupTargetRef: 'b2://backup-assets',
    });
    expect(result).toMatchObject({
      status: 'storage-policy-upserted',
      topology: { scope: 'workspace', ownershipMode: 'HYBRID' },
    });
  });

  it('should fall back to body tenant, user, and workspace values for storage policy writes when headers are absent', async () => {
    tenancyOperations.upsertStoragePolicy.mockResolvedValue({
      status: 'storage-policy-upserted',
      topology: { scope: 'workspace', ownershipMode: 'SINGLE' },
    });

    const result = await controller.upsertStoragePolicy({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      key: 'media-assets',
      mode: 'SINGLE' as any,
      targetRef: 's3://body-assets',
    });

    expect(tenancyOperations.upsertStoragePolicy).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      key: 'media-assets',
      mode: 'SINGLE',
      targetRef: 's3://body-assets',
    });
    expect(result).toMatchObject({
      status: 'storage-policy-upserted',
      topology: { scope: 'workspace', ownershipMode: 'SINGLE' },
    });
  });

  it('should preserve body storage policy fields while headers override tenant context', async () => {
    tenancyOperations.upsertStoragePolicy.mockResolvedValue({
      status: 'storage-policy-upserted',
      topology: { scope: 'workspace', ownershipMode: 'HYBRID' },
    });

    const result = await controller.upsertStoragePolicy(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        key: 'media-assets',
        mode: ' hybrid ' as any,
        storageClass: 'warm',
        targetRef: 's3://primary-assets',
        targetRegion: 'ap-southeast-1',
        backupTargetRef: 'b2://backup-assets',
        meteringEnabled: true,
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(tenancyOperations.upsertStoragePolicy).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      key: 'media-assets',
      mode: ' hybrid ',
      storageClass: 'warm',
      targetRef: 's3://primary-assets',
      targetRegion: 'ap-southeast-1',
      backupTargetRef: 'b2://backup-assets',
      meteringEnabled: true,
    });
    expect(result).toMatchObject({
      status: 'storage-policy-upserted',
      topology: { scope: 'workspace', ownershipMode: 'HYBRID' },
    });
  });

  it('should preserve falsy body storage policy fields while headers override tenant context', async () => {
    tenancyOperations.upsertStoragePolicy.mockResolvedValue({
      status: 'storage-policy-upserted',
      topology: { scope: 'workspace', ownershipMode: 'TENANT_MANAGED' },
    });

    const result = await controller.upsertStoragePolicy(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        key: 'media-assets',
        mode: ' tenant_managed ' as any,
        storageClass: ' cold ',
        targetRef: ' s3://tenant-assets ',
        targetRegion: ' ap-southeast-1 ',
        meteringEnabled: false,
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(tenancyOperations.upsertStoragePolicy).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      key: 'media-assets',
      mode: ' tenant_managed ',
      storageClass: ' cold ',
      targetRef: ' s3://tenant-assets ',
      targetRegion: ' ap-southeast-1 ',
      meteringEnabled: false,
    });
    expect(result).toMatchObject({
      status: 'storage-policy-upserted',
      topology: { scope: 'workspace', ownershipMode: 'TENANT_MANAGED' },
    });
  });

  it('should preserve body workspace scope and falsy storage fields when tenant and user headers are supplied without a workspace header', async () => {
    tenancyOperations.upsertStoragePolicy.mockResolvedValue({
      status: 'storage-policy-upserted',
      topology: { scope: 'workspace', ownershipMode: 'TENANT_MANAGED' },
    });

    const result = await controller.upsertStoragePolicy(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        key: 'media-assets',
        mode: ' tenant_managed ' as any,
        storageClass: ' cold ',
        targetRef: ' s3://tenant-assets ',
        targetRegion: ' ap-southeast-1 ',
        meteringEnabled: false,
      },
      'acme',
      'ops@acme.test',
      undefined,
    );

    expect(tenancyOperations.upsertStoragePolicy).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'body-workspace',
      key: 'media-assets',
      mode: ' tenant_managed ',
      storageClass: ' cold ',
      targetRef: ' s3://tenant-assets ',
      targetRegion: ' ap-southeast-1 ',
      meteringEnabled: false,
    });
    expect(result).toMatchObject({
      status: 'storage-policy-upserted',
      topology: { scope: 'workspace', ownershipMode: 'TENANT_MANAGED' },
    });
  });

  it('should forward package assignment writes to tenancy operations', async () => {
    tenancyOperations.upsertPackageAssignment.mockResolvedValue({
      status: 'package-assignment-upserted',
      packageAssignment: { scopeKey: 'acme:workspace:ops' },
    });

    const result = await controller.upsertPackageAssignment(
      {
        tenantSlug: 'ignored',
        userEmail: 'ignored@acme.test',
        workspaceSlug: 'ignored',
        basePlanKey: 'core.growth',
        selectedOptions: ['nexovaflow.automation'],
        provisioningState: 'pending',
        source: 'admin-ui',
        billingSnapshot: { basePlanPriceMonthly: 'set-by-operator' },
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(tenancyOperations.upsertPackageAssignment).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      basePlanKey: 'core.growth',
      selectedOptions: ['nexovaflow.automation'],
      provisioningState: 'pending',
      source: 'admin-ui',
      billingSnapshot: { basePlanPriceMonthly: 'set-by-operator' },
    });
    expect(result).toMatchObject({
      status: 'package-assignment-upserted',
      packageAssignment: { scopeKey: 'acme:workspace:ops' },
    });
  });

  it('should allow tenant-scoped package assignment writes without workspace context', async () => {
    tenancyOperations.upsertPackageAssignment.mockResolvedValue({
      status: 'package-assignment-upserted',
      packageAssignment: { scopeKey: 'acme:tenant:default', provisioningState: 'inactive' },
    });

    const result = await controller.upsertPackageAssignment(
      {
        tenantSlug: 'ignored',
        userEmail: 'ignored@acme.test',
        basePlanKey: 'core.starter',
        selectedOptions: [],
      },
      'acme',
      'ops@acme.test',
      undefined,
    );

    expect(tenancyOperations.upsertPackageAssignment).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: undefined,
      basePlanKey: 'core.starter',
      selectedOptions: [],
    });
    expect(result).toMatchObject({
      status: 'package-assignment-upserted',
      packageAssignment: { scopeKey: 'acme:tenant:default', provisioningState: 'inactive' },
    });
  });

  it('should fall back to body tenant, user, and workspace values for package assignment writes when headers are absent', async () => {
    tenancyOperations.upsertPackageAssignment.mockResolvedValue({
      status: 'package-assignment-upserted',
      packageAssignment: { scopeKey: 'body-tenant:workspace:body-workspace' },
    });

    const result = await controller.upsertPackageAssignment({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      basePlanKey: 'core.scale',
      selectedOptions: ['nexovaflow.automation'],
      provisioningState: 'active',
    });

    expect(tenancyOperations.upsertPackageAssignment).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      basePlanKey: 'core.scale',
      selectedOptions: ['nexovaflow.automation'],
      provisioningState: 'active',
    });
    expect(result).toMatchObject({
      status: 'package-assignment-upserted',
      packageAssignment: { scopeKey: 'body-tenant:workspace:body-workspace' },
    });
  });

  it('should preserve body package assignment fields while headers override tenant context', async () => {
    tenancyOperations.upsertPackageAssignment.mockResolvedValue({
      status: 'package-assignment-upserted',
      packageAssignment: { scopeKey: 'acme:workspace:ops', provisioningState: 'active' },
    });

    const result = await controller.upsertPackageAssignment(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        basePlanKey: 'core.scale',
        selectedOptions: [' magicai.pro ', 'nexovaflow.automation'],
        provisioningState: ' Active ',
        source: 'admin-ui',
        billingSnapshot: { currency: 'USD', seats: 3 },
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(tenancyOperations.upsertPackageAssignment).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      basePlanKey: 'core.scale',
      selectedOptions: [' magicai.pro ', 'nexovaflow.automation'],
      provisioningState: ' Active ',
      source: 'admin-ui',
      billingSnapshot: { currency: 'USD', seats: 3 },
    });
    expect(result).toMatchObject({
      status: 'package-assignment-upserted',
      packageAssignment: { scopeKey: 'acme:workspace:ops', provisioningState: 'active' },
    });
  });

  it('should preserve body workspace scope and package assignment fields when tenant and user headers are supplied without a workspace header', async () => {
    tenancyOperations.upsertPackageAssignment.mockResolvedValue({
      status: 'package-assignment-upserted',
      packageAssignment: {
        scopeKey: 'acme:workspace:body-workspace',
        provisioningState: 'active',
      },
    });

    const result = await controller.upsertPackageAssignment(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        basePlanKey: 'core.scale',
        selectedOptions: [' magicai.pro ', 'nexovaflow.automation'],
        provisioningState: ' Active ',
        source: 'admin-ui',
        billingSnapshot: { currency: 'USD', seats: 3 },
      },
      'acme',
      'ops@acme.test',
      undefined,
    );

    expect(tenancyOperations.upsertPackageAssignment).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'body-workspace',
      basePlanKey: 'core.scale',
      selectedOptions: [' magicai.pro ', 'nexovaflow.automation'],
      provisioningState: ' Active ',
      source: 'admin-ui',
      billingSnapshot: { currency: 'USD', seats: 3 },
    });
    expect(result).toMatchObject({
      status: 'package-assignment-upserted',
      packageAssignment: {
        scopeKey: 'acme:workspace:body-workspace',
        provisioningState: 'active',
      },
    });
  });

  it('should forward domain governance intent flags to tenancy operations', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      governance: {
        primaryIntent: { requestedDemotion: true },
        scopeTransition: { explicitRebindingApproved: true },
      },
    });

    const result = await controller.upsertDomain(
      {
        tenantSlug: 'ignored',
        userEmail: 'ignored@acme.test',
        workspaceSlug: 'ignored',
        hostname: 'acme.test',
        kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
        status: TenantDomainStatus.ACTIVE,
        isPrimary: false,
        allowPrimaryDemotion: true,
        allowScopeRebinding: true,
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'acme.test',
      kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: true,
      allowScopeRebinding: true,
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      governance: {
        primaryIntent: { requestedDemotion: true },
        scopeTransition: { explicitRebindingApproved: true },
      },
    });
  });

  it('should prefer tenant, user, and workspace headers for domain provisioning writes', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'ops.acme.test' },
      governance: {
        provisioning: { provider: 'cloudflare', mode: 'managed' },
      },
    });

    const result = await controller.upsertDomain(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        hostname: 'ops.acme.test',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        isPrimary: true,
        provider: 'cloudflare',
        provisioningMode: 'managed',
        dnsTarget: 'edge.aifut.test',
        certificateStatus: 'issued',
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: { hostname: 'ops.acme.test' },
      governance: {
        provisioning: { provider: 'cloudflare', mode: 'managed' },
      },
    });
  });

  it('should preserve tenant-scope primary writes when tenant and user headers are supplied without a workspace header', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'acme.test', isPrimary: true },
      governance: {
        bindingScope: 'tenant',
        primaryScope: 'tenant:default',
        primaryIntent: { requestedPromotion: true },
      },
    });

    const result = await controller.upsertDomain(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        hostname: 'acme.test',
        kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
        status: TenantDomainStatus.ACTIVE,
        isPrimary: true,
      },
      'acme',
      'ops@acme.test',
      undefined,
    );

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: undefined,
      hostname: 'acme.test',
      kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: { hostname: 'acme.test', isPrimary: true },
      governance: {
        bindingScope: 'tenant',
        primaryScope: 'tenant:default',
        primaryIntent: { requestedPromotion: true },
      },
    });
  });

  it('should preserve falsy body domain governance flags while headers override tenant context', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'ops.acme.test' },
      governance: {
        primaryIntent: { requestedDemotion: false },
        scopeTransition: { explicitRebindingApproved: false },
        provisioning: { provider: 'cloudflare', mode: 'managed' },
      },
    });

    const result = await controller.upsertDomain(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        hostname: 'ops.acme.test',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        isPrimary: false,
        allowPrimaryDemotion: false,
        allowScopeRebinding: false,
        provider: 'cloudflare',
        provisioningMode: 'managed',
        dnsTarget: 'edge.aifut.test',
        certificateStatus: 'issued',
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: false,
      allowScopeRebinding: false,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      governance: {
        primaryIntent: { requestedDemotion: false },
        scopeTransition: { explicitRebindingApproved: false },
        provisioning: { provider: 'cloudflare', mode: 'managed' },
      },
    });
  });

  it('should preserve body workspace scope when tenant and user headers are supplied without a workspace header for custom domain writes', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'ops.body.acme.test' },
      governance: {
        bindingScope: 'workspace',
        provisioning: { provider: 'cloudflare', mode: 'managed' },
      },
    });

    const result = await controller.upsertDomain(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        hostname: 'ops.body.acme.test',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        isPrimary: false,
        provider: 'cloudflare',
        provisioningMode: 'managed',
        dnsTarget: 'edge.aifut.test',
        certificateStatus: 'issued',
      },
      'acme',
      'ops@acme.test',
      undefined,
    );

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: 'ops.body.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: { hostname: 'ops.body.acme.test' },
      governance: {
        bindingScope: 'workspace',
        provisioning: { provider: 'cloudflare', mode: 'managed' },
      },
    });
  });

  it('should preserve body workspace scope and governance flags for custom domain writes when tenant and user headers are supplied without a workspace header', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'ops.body.acme.test' },
      governance: {
        bindingScope: 'workspace',
        primaryIntent: { requestedDemotion: true },
        scopeTransition: { explicitRebindingApproved: true },
        provisioning: { provider: 'cloudflare', mode: 'managed' },
      },
    });

    const result = await controller.upsertDomain(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        hostname: 'ops.body.acme.test',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        isPrimary: false,
        allowPrimaryDemotion: true,
        allowScopeRebinding: true,
        provider: 'cloudflare',
        provisioningMode: 'managed',
        dnsTarget: 'edge.aifut.test',
        certificateStatus: 'issued',
      },
      'acme',
      'ops@acme.test',
      undefined,
    );

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: 'ops.body.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: true,
      allowScopeRebinding: true,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: { hostname: 'ops.body.acme.test' },
      governance: {
        bindingScope: 'workspace',
        primaryIntent: { requestedDemotion: true },
        scopeTransition: { explicitRebindingApproved: true },
        provisioning: { provider: 'cloudflare', mode: 'managed' },
      },
    });
  });

  it('should preserve body workspace scope when tenant and user headers are supplied without a workspace header for affiliate domain writes', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'partner.ops.acme.test' },
      governance: {
        bindingScope: 'workspace',
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });

    const result = await controller.upsertDomain(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        hostname: 'partner.ops.acme.test',
        kind: TenantDomainKind.AFFILIATE_DOMAIN,
        status: TenantDomainStatus.ACTIVE,
        isPrimary: false,
        provider: 'reseller-edge',
        provisioningMode: 'affiliate-managed',
        dnsTarget: 'edge.partner.test',
        certificateStatus: 'ready',
      },
      'acme',
      'ops@acme.test',
      undefined,
    );

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: 'partner.ops.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: { hostname: 'partner.ops.acme.test' },
      governance: {
        bindingScope: 'workspace',
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });
  });

  it('should preserve body workspace scope and governance flags for affiliate domain writes when tenant and user headers are supplied without a workspace header', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'partner.ops.acme.test' },
      governance: {
        bindingScope: 'workspace',
        primaryIntent: { requestedDemotion: true },
        scopeTransition: { explicitRebindingApproved: true },
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });

    const result = await controller.upsertDomain(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        hostname: 'partner.ops.acme.test',
        kind: TenantDomainKind.AFFILIATE_DOMAIN,
        status: TenantDomainStatus.ACTIVE,
        isPrimary: false,
        allowPrimaryDemotion: true,
        allowScopeRebinding: true,
        provider: 'reseller-edge',
        provisioningMode: 'affiliate-managed',
        dnsTarget: 'edge.partner.test',
        certificateStatus: 'ready',
      },
      'acme',
      'ops@acme.test',
      undefined,
    );

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: 'partner.ops.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: true,
      allowScopeRebinding: true,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: { hostname: 'partner.ops.acme.test' },
      governance: {
        bindingScope: 'workspace',
        primaryIntent: { requestedDemotion: true },
        scopeTransition: { explicitRebindingApproved: true },
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });
  });

  it('should prefer tenant, user, and workspace headers for affiliate domain provisioning writes', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'partner.acme.test' },
      governance: {
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });

    const result = await controller.upsertDomain(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        hostname: 'partner.acme.test',
        kind: TenantDomainKind.AFFILIATE_DOMAIN,
        status: TenantDomainStatus.ACTIVE,
        isPrimary: false,
        provider: 'reseller-edge',
        provisioningMode: 'affiliate-managed',
        dnsTarget: 'edge.partner.test',
        certificateStatus: 'ready',
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: { hostname: 'partner.acme.test' },
      governance: {
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });
  });

  it('should preserve falsy affiliate domain governance flags while headers override tenant context', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'partner.acme.test' },
      governance: {
        primaryIntent: { requestedDemotion: false },
        scopeTransition: { explicitRebindingApproved: false },
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });

    const result = await controller.upsertDomain(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        hostname: 'partner.acme.test',
        kind: TenantDomainKind.AFFILIATE_DOMAIN,
        status: TenantDomainStatus.ACTIVE,
        isPrimary: false,
        allowPrimaryDemotion: false,
        allowScopeRebinding: false,
        provider: 'reseller-edge',
        provisioningMode: 'affiliate-managed',
        dnsTarget: 'edge.partner.test',
        certificateStatus: 'ready',
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: false,
      allowScopeRebinding: false,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      governance: {
        primaryIntent: { requestedDemotion: false },
        scopeTransition: { explicitRebindingApproved: false },
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });
  });

  it('should preserve degraded custom-domain readiness metadata while headers override tenant context', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: {
        hostname: 'degraded.ops.acme.test',
        status: TenantDomainStatus.DEGRADED,
        provider: null,
        provisioningMode: null,
      },
      governance: {
        readiness: { routeReady: false },
        provisioning: { provider: null, mode: null, externallyManaged: false },
      },
    });

    const result = await controller.upsertDomain(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        hostname: 'degraded.ops.acme.test',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.DEGRADED,
        isPrimary: false,
        provider: '   ',
        provisioningMode: '   ',
        dnsTarget: '   ',
        certificateStatus: '   ',
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'degraded.ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.DEGRADED,
      isPrimary: false,
      provider: '   ',
      provisioningMode: '   ',
      dnsTarget: '   ',
      certificateStatus: '   ',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: {
        hostname: 'degraded.ops.acme.test',
        status: TenantDomainStatus.DEGRADED,
        provider: null,
        provisioningMode: null,
      },
      governance: {
        readiness: { routeReady: false },
        provisioning: { provider: null, mode: null, externallyManaged: false },
      },
    });
  });

  it('should preserve degraded affiliate-domain readiness metadata while headers override tenant context', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: {
        hostname: 'degraded.partner.acme.test',
        status: TenantDomainStatus.DEGRADED,
        provider: null,
        provisioningMode: null,
      },
      governance: {
        readiness: { routeReady: false },
        provisioning: { provider: null, mode: null, externallyManaged: false },
      },
    });

    const result = await controller.upsertDomain(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        hostname: 'degraded.partner.acme.test',
        kind: TenantDomainKind.AFFILIATE_DOMAIN,
        status: TenantDomainStatus.DEGRADED,
        isPrimary: false,
        provider: '   ',
        provisioningMode: '   ',
        dnsTarget: '   ',
        certificateStatus: '   ',
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'degraded.partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.DEGRADED,
      isPrimary: false,
      provider: '   ',
      provisioningMode: '   ',
      dnsTarget: '   ',
      certificateStatus: '   ',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: {
        hostname: 'degraded.partner.acme.test',
        status: TenantDomainStatus.DEGRADED,
        provider: null,
        provisioningMode: null,
      },
      governance: {
        readiness: { routeReady: false },
        provisioning: { provider: null, mode: null, externallyManaged: false },
      },
    });
  });

  it('should fall back to body tenant, user, and workspace values for domain writes when headers are absent', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'body.acme.test' },
    });

    const result = await controller.upsertDomain({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: 'body.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: 'body.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: { hostname: 'body.acme.test' },
    });
  });

  it('should preserve tenant-scope primary domain writes when no workspace header or body scope is supplied', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'acme.test', isPrimary: true },
      governance: {
        bindingScope: 'tenant',
        primaryScope: 'tenant:default',
        primaryIntent: { requestedPromotion: true },
      },
    });

    const result = await controller.upsertDomain({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      hostname: 'acme.test',
      kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
    });

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: undefined,
      hostname: 'acme.test',
      kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: { hostname: 'acme.test', isPrimary: true },
      governance: {
        bindingScope: 'tenant',
        primaryScope: 'tenant:default',
        primaryIntent: { requestedPromotion: true },
      },
    });
  });

  it('should preserve tenant-scope affiliate primary writes when no workspace header or body scope is supplied', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'partner.acme.test', isPrimary: true },
      governance: {
        bindingScope: 'tenant',
        primaryScope: 'tenant:default',
        primaryIntent: { requestedPromotion: true },
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });

    const result = await controller.upsertDomain({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: undefined,
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: { hostname: 'partner.acme.test', isPrimary: true },
      governance: {
        bindingScope: 'tenant',
        primaryScope: 'tenant:default',
        primaryIntent: { requestedPromotion: true },
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });
  });

  it('should fall back to body tenant, user, and workspace values for affiliate domain writes when headers are absent', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'partner.body.acme.test' },
      governance: {
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });

    const result = await controller.upsertDomain({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: 'partner.body.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: 'partner.body.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: { hostname: 'partner.body.acme.test' },
      governance: {
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });
  });

  it('should preserve degraded custom-domain readiness and null provisioning metadata when domain writes run without headers', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: {
        hostname: 'degraded.body.acme.test',
        status: TenantDomainStatus.DEGRADED,
        provider: null,
        provisioningMode: null,
      },
      governance: {
        readiness: { routeReady: false },
        provisioning: { provider: null, mode: null, externallyManaged: false },
      },
    });

    const result = await controller.upsertDomain({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: 'degraded.body.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.DEGRADED,
      isPrimary: false,
    });

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: 'degraded.body.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.DEGRADED,
      isPrimary: false,
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: {
        hostname: 'degraded.body.acme.test',
        status: TenantDomainStatus.DEGRADED,
        provider: null,
        provisioningMode: null,
      },
      governance: {
        readiness: { routeReady: false },
        provisioning: { provider: null, mode: null, externallyManaged: false },
      },
    });
  });

  it('should preserve body domain governance flags when domain writes run without headers', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      governance: {
        primaryIntent: { requestedDemotion: true },
        scopeTransition: { explicitRebindingApproved: true },
      },
    });

    const result = await controller.upsertDomain({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: 'body.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: true,
      allowScopeRebinding: true,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: 'body.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: true,
      allowScopeRebinding: true,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      governance: {
        primaryIntent: { requestedDemotion: true },
        scopeTransition: { explicitRebindingApproved: true },
      },
    });
  });

  it('should preserve body domain governance flags for affiliate domain writes when headers are absent', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      governance: {
        primaryIntent: { requestedDemotion: true },
        scopeTransition: { explicitRebindingApproved: true },
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });

    const result = await controller.upsertDomain({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: 'partner.body.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: true,
      allowScopeRebinding: true,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: 'partner.body.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: true,
      allowScopeRebinding: true,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      governance: {
        primaryIntent: { requestedDemotion: true },
        scopeTransition: { explicitRebindingApproved: true },
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });
  });

  it('should preserve tenant-scope affiliate primary demotion writes when no workspace header or body scope is supplied', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'partner.acme.test', isPrimary: false },
      governance: {
        bindingScope: 'tenant',
        primaryIntent: { requestedDemotion: true },
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });

    const result = await controller.upsertDomain({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: true,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: undefined,
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: true,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: { hostname: 'partner.acme.test', isPrimary: false },
      governance: {
        bindingScope: 'tenant',
        primaryIntent: { requestedDemotion: true },
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });
  });

  it('should prefer headers while preserving custom domain governance flags when both are supplied', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'ops.acme.test' },
      governance: {
        primaryIntent: { requestedDemotion: true },
        scopeTransition: { explicitRebindingApproved: true },
        provisioning: { provider: 'cloudflare', mode: 'managed' },
      },
    });

    const result = await controller.upsertDomain(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        hostname: 'ops.acme.test',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        isPrimary: false,
        allowPrimaryDemotion: true,
        allowScopeRebinding: true,
        provider: 'cloudflare',
        provisioningMode: 'managed',
        dnsTarget: 'edge.aifut.test',
        certificateStatus: 'issued',
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: true,
      allowScopeRebinding: true,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: { hostname: 'ops.acme.test' },
      governance: {
        primaryIntent: { requestedDemotion: true },
        scopeTransition: { explicitRebindingApproved: true },
        provisioning: { provider: 'cloudflare', mode: 'managed' },
      },
    });
  });

  it('should prefer headers while preserving affiliate domain governance flags when both are supplied', async () => {
    tenancyOperations.upsertDomain.mockResolvedValue({
      status: 'domain-upserted',
      domain: { hostname: 'partner.acme.test' },
      governance: {
        primaryIntent: { requestedDemotion: true },
        scopeTransition: { explicitRebindingApproved: true },
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });

    const result = await controller.upsertDomain(
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        hostname: 'partner.acme.test',
        kind: TenantDomainKind.AFFILIATE_DOMAIN,
        status: TenantDomainStatus.ACTIVE,
        isPrimary: false,
        allowPrimaryDemotion: true,
        allowScopeRebinding: true,
        provider: 'reseller-edge',
        provisioningMode: 'affiliate-managed',
        dnsTarget: 'edge.partner.test',
        certificateStatus: 'ready',
      },
      'acme',
      'ops@acme.test',
      'ops',
    );

    expect(tenancyOperations.upsertDomain).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: true,
      allowScopeRebinding: true,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: { hostname: 'partner.acme.test' },
      governance: {
        primaryIntent: { requestedDemotion: true },
        scopeTransition: { explicitRebindingApproved: true },
        provisioning: { provider: 'reseller-edge', mode: 'affiliate-managed' },
      },
    });
  });
});

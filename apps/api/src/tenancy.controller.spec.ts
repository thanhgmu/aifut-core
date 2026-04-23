import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { TenancyController } from './tenancy.controller';
import { PrismaService } from './prisma.service';
import { ActorContextService } from './actor-context.service';
import { TenantDomainResolutionService } from './tenant-domain-resolution.service';
import { TenancyOperationsService } from './tenancy-operations.service';
import { StorageRoutingPolicyService } from './storage-routing-policy.service';
import { AccessPolicyService } from './access-policy.service';

describe('TenancyController', () => {
  let controller: TenancyController;
  let tenantDomainResolution: { resolveHostname: jest.Mock };
  let storageRoutingPolicy: {
    getEffectivePolicy: jest.Mock;
    requireWritePolicy: jest.Mock;
  };

  beforeEach(async () => {
    tenantDomainResolution = {
      resolveHostname: jest.fn(),
    };

    storageRoutingPolicy = {
      getEffectivePolicy: jest.fn(),
      requireWritePolicy: jest.fn(),
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
          useValue: {
            resolve: jest.fn(),
          },
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
          useValue: {
            createWorkspace: jest.fn(),
            upsertDomain: jest.fn(),
            upsertStoragePolicy: jest.fn(),
          },
        },
        {
          provide: StorageRoutingPolicyService,
          useValue: storageRoutingPolicy,
        },
      ],
    }).compile();

    controller = module.get<TenancyController>(TenancyController);
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
});

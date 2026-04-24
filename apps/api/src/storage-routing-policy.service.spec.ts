import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantStorageMode } from '@prisma/client';
import { StorageRoutingPolicyService } from './storage-routing-policy.service';
import { PrismaService } from './prisma.service';
import { ActorContextService } from './actor-context.service';

describe('StorageRoutingPolicyService', () => {
  let service: StorageRoutingPolicyService;
  let prisma: { tenantStoragePolicy: { findMany: jest.Mock } };
  let actorContext: { resolve: jest.Mock };

  beforeEach(async () => {
    prisma = {
      tenantStoragePolicy: {
        findMany: jest.fn(),
      },
    };

    actorContext = {
      resolve: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageRoutingPolicyService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActorContextService, useValue: actorContext },
      ],
    }).compile();

    service = module.get<StorageRoutingPolicyService>(StorageRoutingPolicyService);
  });

  it('should block writes when only tenant-scope policy exists for a workspace and tenant fallback is not allowed', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
    });
    prisma.tenantStoragePolicy.findMany.mockResolvedValue([
      {
        id: 'policy_1',
        key: 'assets',
        mode: TenantStorageMode.PLATFORM_MANAGED,
        storageClass: 'standard',
        targetRef: null,
        targetRegion: null,
        backupTargetRef: null,
        meteringEnabled: true,
        workspaceId: null,
        createdAt: new Date('2026-04-24T00:00:00.000Z'),
      },
    ]);

    await expect(
      service.requireWritePolicy({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        workspaceSlug: 'ops',
        policyKey: 'assets',
        writePath: 'uploads/logo.png',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should enforce hybrid policy dependencies and normalize the write path when allowed', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
    });
    prisma.tenantStoragePolicy.findMany.mockResolvedValue([
      {
        id: 'policy_2',
        key: 'assets',
        mode: TenantStorageMode.HYBRID,
        storageClass: 'hot',
        targetRef: 's3://tenant-bucket',
        targetRegion: 'ap-southeast-1',
        backupTargetRef: 'b2://tenant-backup',
        meteringEnabled: false,
        workspaceId: 'ws_1',
        createdAt: new Date('2026-04-24T00:00:00.000Z'),
      },
    ]);

    const result = await service.requireWritePolicy({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      policyKey: 'assets',
      writePath: 'uploads\\logo.png',
    });

    expect(result.storageTopology).toMatchObject({
      ownershipScope: 'workspace',
      workspaceSlug: 'ops',
      mode: TenantStorageMode.HYBRID,
    });
    expect(result.writeGuardrail).toMatchObject({
      enforcedWritePath:
        'tenants/acme/workspaces/ops/storage/assets/uploads/logo.png',
    });
  });
});

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActorContextService } from './actor-context.service';
import { PrismaService } from './prisma.service';
import { TenantDomainResolutionService } from './tenant-domain-resolution.service';

describe('ActorContextService', () => {
  let service: ActorContextService;
  let prisma: {
    tenant: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
    membership: { findMany: jest.Mock };
  };
  let tenantDomainResolution: { resolveHostname: jest.Mock };

  beforeEach(async () => {
    prisma = {
      tenant: { findUnique: jest.fn() },
      user: { findFirst: jest.fn() },
      membership: { findMany: jest.fn() },
    };

    tenantDomainResolution = {
      resolveHostname: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActorContextService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TenantDomainResolutionService,
          useValue: tenantDomainResolution,
        },
      ],
    }).compile();

    service = module.get(ActorContextService);
  });

  it('should reject when neither tenant slug, hostname, nor auth token identity are provided', async () => {
    await expect(
      service.resolve({ userEmail: 'owner@acme.test' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should resolve tenant/user/workspace from auth token identity without tenant slug', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user_1',
      email: 'owner@acme.test',
      name: 'Owner',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      tenant: {
        id: 'tenant_1',
        name: 'Acme',
        slug: 'acme',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    });

    prisma.membership.findMany.mockResolvedValue([
      {
        id: 'membership_1',
        role: 'OWNER',
        isDefault: true,
        workspace: {
          id: 'workspace_1',
          name: 'Default Workspace',
          slug: 'default',
        },
      },
    ]);

    const result = await service.resolve({
      authUserId: 'user_1',
      userEmail: 'owner@acme.test',
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'user_1',
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
          },
        },
      },
    });

    expect(result).toMatchObject({
      tenant: { slug: 'acme' },
      user: { id: 'user_1', email: 'owner@acme.test' },
      activeWorkspace: { slug: 'default' },
      resolution: {
        tenantSlug: 'acme',
        usedAuthIdentityResolution: true,
        usedHostnameResolution: false,
      },
    });
  });

  it('should reject when auth token identity resolves to a different user email than requested', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user_1',
      email: 'other@acme.test',
      name: 'Other',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      tenant: {
        id: 'tenant_1',
        name: 'Acme',
        slug: 'acme',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    });

    await expect(
      service.resolve({
        authUserId: 'user_1',
        userEmail: 'owner@acme.test',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should require route-ready hostname resolution for runtime actor context', async () => {
    tenantDomainResolution.resolveHostname.mockResolvedValue({
      hostname: 'ops.acme.test',
      tenant: {
        id: 'tenant_1',
        name: 'Acme',
        slug: 'acme',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      },
      workspace: null,
    });
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant_1',
      name: 'Acme',
      slug: 'acme',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user_1',
      email: 'owner@acme.test',
      name: 'Owner',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    prisma.membership.findMany.mockResolvedValue([]);

    await service.resolve({
      hostname: 'ops.acme.test',
      userEmail: 'owner@acme.test',
    });

    expect(tenantDomainResolution.resolveHostname).toHaveBeenCalledWith({
      hostname: 'ops.acme.test',
      workspaceSlug: undefined,
      enforceWorkspaceMatch: undefined,
      requireRouteReady: true,
    });
  });

  it('should reject workspace-bound hostname routing when the user lacks membership in the bound workspace', async () => {
    tenantDomainResolution.resolveHostname.mockResolvedValue({
      hostname: 'sales.acme.test',
      tenant: {
        id: 'tenant_1',
        name: 'Acme',
        slug: 'acme',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      },
      workspace: {
        id: 'workspace_sales',
        name: 'Sales',
        slug: 'sales',
      },
    });
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant_1',
      name: 'Acme',
      slug: 'acme',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user_1',
      email: 'owner@acme.test',
      name: 'Owner',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    prisma.membership.findMany.mockResolvedValue([
      {
        id: 'membership_ops',
        role: 'OWNER',
        isDefault: true,
        workspace: {
          id: 'workspace_ops',
          name: 'Ops',
          slug: 'ops',
        },
      },
    ]);

    await expect(
      service.resolve({
        hostname: 'sales.acme.test',
        userEmail: 'owner@acme.test',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

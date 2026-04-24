import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantDomainResolutionService } from './tenant-domain-resolution.service';
import { PrismaService } from './prisma.service';

describe('TenantDomainResolutionService', () => {
  let service: TenantDomainResolutionService;
  let prisma: { tenantDomain: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      tenantDomain: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantDomainResolutionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TenantDomainResolutionService>(
      TenantDomainResolutionService,
    );
  });

  it('should reject missing hostname input', async () => {
    await expect(service.resolveHostname({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should raise not found when no matching domain exists', async () => {
    prisma.tenantDomain.findUnique.mockResolvedValue(null);

    await expect(
      service.resolveHostname({ hostname: 'missing.acme.test' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should block enforced workspace mismatch', async () => {
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_1',
      hostname: 'ops.acme.test',
      kind: 'CUSTOM',
      status: 'ACTIVE',
      isPrimary: true,
      workspaceId: 'ws_1',
      tenant: {
        id: 'tenant_1',
        name: 'Acme',
        slug: 'acme',
        createdAt: new Date('2026-04-24T00:00:00.000Z'),
      },
      workspace: {
        id: 'ws_1',
        name: 'Ops',
        slug: 'ops',
      },
    });

    await expect(
      service.resolveHostname({
        hostname: 'ops.acme.test',
        workspaceSlug: 'sales',
        enforceWorkspaceMatch: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should return resolved domain and workspace metadata when matched', async () => {
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_1',
      hostname: 'ops.acme.test',
      kind: 'CUSTOM',
      status: 'ACTIVE',
      isPrimary: true,
      workspaceId: 'ws_1',
      tenant: {
        id: 'tenant_1',
        name: 'Acme',
        slug: 'acme',
        createdAt: new Date('2026-04-24T00:00:00.000Z'),
      },
      workspace: {
        id: 'ws_1',
        name: 'Ops',
        slug: 'ops',
      },
    });

    const result = await service.resolveHostname({
      hostname: 'https://ops.acme.test/login',
      workspaceSlug: 'ops',
      enforceWorkspaceMatch: true,
    });

    expect(result).toMatchObject({
      hostname: 'ops.acme.test',
      tenant: { slug: 'acme' },
      workspace: { slug: 'ops' },
      resolution: {
        workspaceSlugMatchedDomain: true,
        enforceWorkspaceMatch: true,
      },
    });
  });
});

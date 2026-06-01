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

  it('should reject malformed hostnames before lookup', async () => {
    await expect(
      service.resolveHostname({ hostname: 'invalid_host.acme.test' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.tenantDomain.findUnique).not.toHaveBeenCalled();
  });

  it('should reject ambiguous hostname ports before lookup', async () => {
    await expect(
      service.resolveHostname({ hostname: 'ops.acme.test:443:evil' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.tenantDomain.findUnique).not.toHaveBeenCalled();
  });

  it('should block enforced workspace mismatch', async () => {
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_1',
      hostname: 'ops.acme.test',
      kind: 'CUSTOM',
      status: 'ACTIVE',
      isPrimary: true,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
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
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
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
      domain: {
        provider: 'cloudflare',
        provisioningMode: 'managed',
        dnsTarget: 'edge.aifut.test',
        certificateStatus: 'issued',
      },
      tenant: { slug: 'acme' },
      workspace: { slug: 'ops' },
      resolution: {
        workspaceSlugMatchedDomain: true,
        enforceWorkspaceMatch: true,
      },
      governance: {
        bindingScope: 'workspace',
        workspaceRequestDisposition: 'matched',
        workspaceRouting: {
          requestedWorkspaceSlug: 'ops',
          boundWorkspaceSlug: 'ops',
          effectiveWorkspaceSlug: 'ops',
          mismatchDetected: false,
        },
        runtimeRouting: {
          routeReady: true,
          reasons: [],
        },
      },
    });
  });

  it('should surface fallback runtime governance when workspace request differs without enforcement', async () => {
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_2',
      hostname: 'acme.test',
      kind: 'PLATFORM_SUBDOMAIN',
      status: 'DEGRADED',
      isPrimary: true,
      provider: 'aifut-affiliate',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'tenant-edge.aifut.test',
      certificateStatus: 'pending',
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
      hostname: 'acme.test',
      workspaceSlug: 'sales',
      enforceWorkspaceMatch: false,
    });

    expect(result.workspace).toBeNull();
    expect(result).toMatchObject({
      governance: {
        bindingScope: 'workspace',
        workspaceRequestDisposition: 'workspace-request-mismatch',
        workspaceRouting: {
          requestedWorkspaceSlug: 'sales',
          boundWorkspaceSlug: 'ops',
          effectiveWorkspaceSlug: null,
          mismatchDetected: true,
        },
        runtimeRouting: {
          routeReady: false,
          reasons: ['domain-status:degraded', 'certificate-status:pending'],
        },
      },
    });
  });

  it('should block route-unready domains when runtime routing is required', async () => {
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_2',
      hostname: 'acme.test',
      kind: 'PLATFORM_SUBDOMAIN',
      status: 'ACTIVE',
      isPrimary: false,
      provider: null,
      provisioningMode: null,
      dnsTarget: null,
      certificateStatus: 'pending',
      workspaceId: null,
      tenant: {
        id: 'tenant_1',
        name: 'Acme',
        slug: 'acme',
        createdAt: new Date('2026-04-24T00:00:00.000Z'),
      },
      workspace: null,
    });

    await expect(
      service.resolveHostname({
        hostname: 'acme.test',
        requireRouteReady: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should treat active platform subdomains as route ready without tenant-managed dns or certificate metadata', async () => {
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_3',
      hostname: 'acme.aifut.test',
      kind: 'PLATFORM_SUBDOMAIN',
      status: 'ACTIVE',
      isPrimary: true,
      provider: null,
      provisioningMode: null,
      dnsTarget: null,
      certificateStatus: null,
      workspaceId: null,
      tenant: {
        id: 'tenant_1',
        name: 'Acme',
        slug: 'acme',
        createdAt: new Date('2026-04-24T00:00:00.000Z'),
      },
      workspace: null,
    });

    const result = await service.resolveHostname({
      hostname: 'acme.aifut.test',
    });

    expect(result.governance.runtimeRouting).toEqual({
      routeReady: true,
      reasons: [],
    });
  });

  it('should explain legacy custom-domain readiness drift', async () => {
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_4',
      hostname: 'legacy.acme.test',
      kind: 'CUSTOM',
      status: 'ACTIVE',
      isPrimary: false,
      provider: null,
      provisioningMode: 'managed',
      dnsTarget: null,
      certificateStatus: 'pending',
      workspaceId: null,
      tenant: {
        id: 'tenant_1',
        name: 'Acme',
        slug: 'acme',
        createdAt: new Date('2026-04-24T00:00:00.000Z'),
      },
      workspace: null,
    });

    const result = await service.resolveHostname({
      hostname: 'legacy.acme.test',
    });

    expect(result.governance.runtimeRouting).toEqual({
      routeReady: false,
      reasons: [
        'dns-target:missing',
        'certificate-status:pending',
        'provider:missing',
      ],
    });
  });
});

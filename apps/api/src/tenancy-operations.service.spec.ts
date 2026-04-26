import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipRole,
  TenantDomainKind,
  TenantDomainStatus,
} from '@prisma/client';
import { AccessPolicyService } from './access-policy.service';
import { PrismaService } from './prisma.service';
import { TenancyOperationsService } from './tenancy-operations.service';

describe('TenancyOperationsService', () => {
  let service: TenancyOperationsService;
  let prisma: {
    workspace: { findUnique: jest.Mock };
    tenantDomain: { findUnique: jest.Mock; upsert: jest.Mock; updateMany: jest.Mock };
  };
  let accessPolicy: { resolveAndRequire: jest.Mock };

  beforeEach(async () => {
    prisma = {
      workspace: { findUnique: jest.fn() },
      tenantDomain: { findUnique: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
    };

    accessPolicy = {
      resolveAndRequire: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenancyOperationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessPolicyService, useValue: accessPolicy },
      ],
    }).compile();

    service = module.get<TenancyOperationsService>(TenancyOperationsService);

    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeMembership: { role: MembershipRole.ADMIN },
      },
    });

    prisma.tenantDomain.findUnique.mockResolvedValue(null);
  });

  it('should reject demoting an existing primary domain without explicit approval', async () => {
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_existing',
      tenantId: 'tenant_1',
      workspaceId: null,
      isPrimary: true,
      workspace: null,
    });

    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'acme.test',
        kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
        status: TenantDomainStatus.ACTIVE,
        isPrimary: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject rebinding a primary domain across scope without explicit approval', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_existing',
      tenantId: 'tenant_1',
      workspaceId: null,
      isPrimary: true,
      workspace: null,
    });

    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        workspaceSlug: 'ops',
        hostname: 'acme.test',
        kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
        status: TenantDomainStatus.ACTIVE,
        isPrimary: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject active custom domains without dns target', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'ops.acme.test',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject active custom domains without ready certificate status', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'ops.acme.test',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        dnsTarget: 'edge.aifut.test',
        certificateStatus: 'pending',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject non-active domains from becoming primary', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'ops.acme.test',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.DEGRADED,
        isPrimary: true,
        dnsTarget: 'edge.aifut.test',
        certificateStatus: 'issued',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject active affiliate domains without provisioning mode', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'promo.acme.test',
        kind: TenantDomainKind.AFFILIATE_DOMAIN,
        status: TenantDomainStatus.ACTIVE,
        dnsTarget: 'edge.aifut.test',
        certificateStatus: 'issued',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject managed active domains without provider metadata', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'ops.acme.test',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        dnsTarget: 'edge.aifut.test',
        certificateStatus: 'issued',
        provisioningMode: 'managed',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should upsert active workspace-bound domain with readiness metadata', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_1',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-26T08:50:00.000Z'),
      updatedAt: new Date('2026-04-26T08:50:00.000Z'),
    });
    prisma.tenantDomain.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.upsertDomain({
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

    expect(prisma.tenantDomain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workspaceId: 'ws_1',
          dnsTarget: 'edge.aifut.test',
          certificateStatus: 'issued',
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'domain-upserted',
      workspace: { slug: 'ops' },
      domain: {
        hostname: 'ops.acme.test',
        dnsTarget: 'edge.aifut.test',
        certificateStatus: 'issued',
      },
      governance: {
        bindingScope: 'workspace',
        primaryScope: 'workspace:ops',
        primaryReassignment: {
          scope: 'workspace:ops',
          demotedPrimaryCount: 1,
          collisionDetected: true,
          action: 'promoted-and-demoted-existing-primary',
        },
        primaryIntent: {
          requestedPromotion: true,
          requestedDemotion: false,
          explicitDemotionApproved: false,
          resultingPrimary: true,
          resultingAction:
            'promote-target-and-demote-existing-scope-primary',
        },
        scopeTransition: {
          rebindingRequested: false,
          explicitRebindingApproved: false,
          previousScope: null,
          targetScope: 'workspace:ops',
          action: 'retained-domain-scope',
        },
        readiness: {
          routeReady: true,
        },
        provisioning: {
          provider: 'cloudflare',
          mode: 'managed',
          externallyManaged: true,
        },
      },
    });
  });

  it('should surface non-collision promotion intent when no existing primary is displaced', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_2',
      hostname: 'acme.test',
      kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      provider: null,
      provisioningMode: null,
      dnsTarget: null,
      certificateStatus: null,
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:10:00.000Z'),
      updatedAt: new Date('2026-04-26T09:10:00.000Z'),
    });
    prisma.tenantDomain.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'acme.test',
      kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
    });

    expect(result.governance).toMatchObject({
      bindingScope: 'tenant',
      primaryScope: 'tenant:default',
      primaryReassignment: {
        scope: 'tenant:default',
        demotedPrimaryCount: 0,
        collisionDetected: false,
        action: 'promoted-without-existing-primary-collision',
      },
      primaryIntent: {
        requestedPromotion: true,
        requestedDemotion: false,
        explicitDemotionApproved: false,
        resultingPrimary: true,
        resultingAction: 'promote-target-as-scope-primary',
      },
      scopeTransition: {
        rebindingRequested: false,
        explicitRebindingApproved: false,
        previousScope: null,
        targetScope: 'tenant:default',
        action: 'retained-domain-scope',
      },
    });
  });

  it('should allow explicit demotion and scope rebinding of an existing primary domain', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_existing',
      tenantId: 'tenant_1',
      workspaceId: null,
      isPrimary: true,
      workspace: null,
    });
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_existing',
      hostname: 'acme.test',
      kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: null,
      provisioningMode: null,
      dnsTarget: null,
      certificateStatus: null,
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
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

    expect(result.governance).toMatchObject({
      bindingScope: 'workspace',
      primaryScope: null,
      primaryReassignment: {
        scope: 'workspace:ops',
        demotedPrimaryCount: 0,
        collisionDetected: false,
        action: 'no-primary-reassignment',
      },
      primaryIntent: {
        requestedPromotion: false,
        requestedDemotion: true,
        explicitDemotionApproved: true,
        resultingPrimary: false,
        resultingAction: 'retain-or-write-non-primary-domain',
      },
      scopeTransition: {
        rebindingRequested: true,
        explicitRebindingApproved: true,
        previousScope: 'tenant:default',
        targetScope: 'workspace:ops',
        action: 'rebound-domain-scope',
      },
    });
  });
});

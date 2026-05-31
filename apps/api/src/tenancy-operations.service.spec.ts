import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
    workspace: { findUnique: jest.Mock; create: jest.Mock };
    membership: { create: jest.Mock; updateMany: jest.Mock };
    tenantDomain: { findUnique: jest.Mock; upsert: jest.Mock; updateMany: jest.Mock };
    tenantStoragePolicy: { upsert: jest.Mock };
    tenantPackageAssignment: { upsert: jest.Mock };
  };
  let accessPolicy: { resolveAndRequire: jest.Mock };

  beforeEach(async () => {
    prisma = {
      workspace: { findUnique: jest.fn(), create: jest.fn() },
      membership: { create: jest.fn(), updateMany: jest.fn() },
      tenantDomain: { findUnique: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
      tenantStoragePolicy: { upsert: jest.fn() },
      tenantPackageAssignment: { upsert: jest.fn() },
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

  it('should create a workspace and default the requesting membership when asked', async () => {
    prisma.workspace.create.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops Hub',
      slug: 'ops-hub',
      tenantId: 'tenant_1',
      createdAt: new Date('2026-04-27T11:00:00.000Z'),
    });
    prisma.membership.create.mockResolvedValue({
      id: 'membership_1',
      role: MembershipRole.ADMIN,
      isDefault: true,
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-27T11:00:00.000Z'),
    });
    prisma.membership.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.createWorkspace({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      name: ' Ops Hub ',
      slug: ' ops-hub ',
      makeDefaultForUser: true,
    });

    expect(prisma.workspace.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant_1',
        name: 'Ops Hub',
        slug: 'ops-hub',
      },
      select: {
        id: true,
        name: true,
        slug: true,
        tenantId: true,
        createdAt: true,
      },
    });
    expect(prisma.membership.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        role: MembershipRole.ADMIN,
        isDefault: true,
      },
      select: {
        id: true,
        role: true,
        isDefault: true,
        workspaceId: true,
        createdAt: true,
      },
    });
    expect(prisma.membership.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant_1',
        userId: 'user_1',
        NOT: { id: 'membership_1' },
      },
      data: {
        isDefault: false,
      },
    });
    expect(result).toMatchObject({
      status: 'workspace-created',
      workspace: { slug: 'ops-hub' },
      membership: { isDefault: true },
    });
  });

  it('should create a workspace without reassigning defaults when not requested', async () => {
    prisma.workspace.create.mockResolvedValue({
      id: 'ws_2',
      name: 'Ops Satellite',
      slug: 'ops-satellite',
      tenantId: 'tenant_1',
      createdAt: new Date('2026-04-27T11:10:00.000Z'),
    });
    prisma.membership.create.mockResolvedValue({
      id: 'membership_2',
      role: MembershipRole.ADMIN,
      isDefault: false,
      workspaceId: 'ws_2',
      createdAt: new Date('2026-04-27T11:10:00.000Z'),
    });

    const result = await service.createWorkspace({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      name: 'Ops Satellite',
      slug: 'ops-satellite',
    });

    expect(prisma.membership.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant_1',
        userId: 'user_1',
        workspaceId: 'ws_2',
        role: MembershipRole.ADMIN,
        isDefault: false,
      },
      select: {
        id: true,
        role: true,
        isDefault: true,
        workspaceId: true,
        createdAt: true,
      },
    });
    expect(prisma.membership.updateMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'workspace-created',
      workspace: { slug: 'ops-satellite' },
      membership: { isDefault: false },
    });
  });

  it('should preserve the caller membership role on new workspace membership records', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeMembership: { role: MembershipRole.OWNER },
      },
    });
    prisma.workspace.create.mockResolvedValue({
      id: 'ws_3',
      name: 'Ops Owner Hub',
      slug: 'ops-owner-hub',
      tenantId: 'tenant_1',
      createdAt: new Date('2026-04-27T11:20:00.000Z'),
    });
    prisma.membership.create.mockResolvedValue({
      id: 'membership_3',
      role: MembershipRole.OWNER,
      isDefault: false,
      workspaceId: 'ws_3',
      createdAt: new Date('2026-04-27T11:20:00.000Z'),
    });

    const result = await service.createWorkspace({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      name: 'Ops Owner Hub',
      slug: 'ops-owner-hub',
    });

    expect(prisma.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: MembershipRole.OWNER,
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'workspace-created',
      membership: { role: MembershipRole.OWNER },
    });
  });

  it('should fall back to admin role when caller membership role is unavailable', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeMembership: null,
      },
    });
    prisma.workspace.create.mockResolvedValue({
      id: 'ws_4',
      name: 'Ops Admin Hub',
      slug: 'ops-admin-hub',
      tenantId: 'tenant_1',
      createdAt: new Date('2026-04-27T11:30:00.000Z'),
    });
    prisma.membership.create.mockResolvedValue({
      id: 'membership_4',
      role: MembershipRole.ADMIN,
      isDefault: false,
      workspaceId: 'ws_4',
      createdAt: new Date('2026-04-27T11:30:00.000Z'),
    });

    const result = await service.createWorkspace({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      name: 'Ops Admin Hub',
      slug: 'ops-admin-hub',
    });

    expect(prisma.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: MembershipRole.ADMIN,
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'workspace-created',
      membership: { role: MembershipRole.ADMIN },
    });
  });

  it('should reject invalid workspace slug during workspace creation', async () => {
    await expect(
      service.createWorkspace({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        name: 'Ops Hub',
        slug: 'Ops Hub',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject missing workspace name during workspace creation', async () => {
    await expect(
      service.createWorkspace({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        slug: 'ops-hub',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
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

  it('should allow rebinding a non-primary domain across scope without explicit approval', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_existing',
      tenantId: 'tenant_1',
      workspaceId: null,
      isPrimary: false,
      workspace: null,
    });
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_existing',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });

    expect(prisma.tenantDomain.updateMany).not.toHaveBeenCalled();
    expect(result.governance).toMatchObject({
      bindingScope: 'workspace',
      primaryScope: null,
      primaryIntent: {
        requestedPromotion: false,
        requestedDemotion: false,
        explicitDemotionApproved: false,
        resultingPrimary: false,
        resultingAction: 'retain-or-write-non-primary-domain',
      },
      scopeTransition: {
        rebindingRequested: true,
        explicitRebindingApproved: false,
        previousScope: 'tenant:default',
        targetScope: 'workspace:ops',
        action: 'rebound-domain-scope',
      },
    });
  });

  it('should allow primary demotion within the same workspace scope without rebinding approval', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_existing',
      tenantId: 'tenant_1',
      workspaceId: 'ws_1',
      isPrimary: true,
      workspace: { slug: 'ops' },
    });
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_existing',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: true,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });

    expect(result.governance).toMatchObject({
      bindingScope: 'workspace',
      primaryScope: null,
      primaryIntent: {
        requestedPromotion: false,
        requestedDemotion: true,
        explicitDemotionApproved: true,
        resultingPrimary: false,
        resultingAction: 'retain-or-write-non-primary-domain',
      },
      scopeTransition: {
        rebindingRequested: false,
        explicitRebindingApproved: false,
        previousScope: 'workspace:ops',
        targetScope: 'workspace:ops',
        action: 'retained-domain-scope',
      },
    });
  });

  it('should allow tenant-scope primary demotion without rebinding approval', async () => {
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
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'acme.test',
      kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      allowPrimaryDemotion: true,
    });

    expect(prisma.tenantDomain.updateMany).not.toHaveBeenCalled();
    expect(result.governance).toMatchObject({
      bindingScope: 'tenant',
      primaryScope: null,
      primaryIntent: {
        requestedPromotion: false,
        requestedDemotion: true,
        explicitDemotionApproved: true,
        resultingPrimary: false,
        resultingAction: 'retain-or-write-non-primary-domain',
      },
      scopeTransition: {
        rebindingRequested: false,
        explicitRebindingApproved: false,
        previousScope: 'tenant:default',
        targetScope: 'tenant:default',
        action: 'retained-domain-scope',
      },
    });
  });

  it('should allow tenant-scope primary affiliate demotion without rebinding approval', async () => {
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_existing_affiliate',
      tenantId: 'tenant_1',
      workspaceId: null,
      isPrimary: true,
      workspace: null,
    });
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_existing_affiliate',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:31:00.000Z'),
      updatedAt: new Date('2026-04-26T09:31:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
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

    expect(prisma.tenantDomain.updateMany).not.toHaveBeenCalled();
    expect(result.governance).toMatchObject({
      bindingScope: 'tenant',
      primaryScope: null,
      primaryIntent: {
        requestedPromotion: false,
        requestedDemotion: true,
        explicitDemotionApproved: true,
        resultingPrimary: false,
        resultingAction: 'retain-or-write-non-primary-domain',
      },
      scopeTransition: {
        rebindingRequested: false,
        explicitRebindingApproved: false,
        previousScope: 'tenant:default',
        targetScope: 'tenant:default',
        action: 'retained-domain-scope',
      },
      readiness: {
        routeReady: true,
      },
      provisioning: {
        provider: 'reseller-edge',
        mode: 'affiliate-managed',
        externallyManaged: true,
      },
    });
  });

  it('should demote only tenant-scope primaries when promoting a tenant-scope primary domain', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_tenant_primary_2',
      hostname: 'tenant-primary.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:45:00.000Z'),
      updatedAt: new Date('2026-04-26T09:45:00.000Z'),
    });
    prisma.tenantDomain.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'tenant-primary.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });

    expect(prisma.tenantDomain.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant_1',
        id: { not: 'domain_tenant_primary_2' },
        workspaceId: null,
      },
      data: {
        isPrimary: false,
      },
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      governance: {
        bindingScope: 'tenant',
        primaryScope: 'tenant:default',
        primaryReassignment: {
          scope: 'tenant:default',
          demotedPrimaryCount: 1,
          collisionDetected: true,
          action: 'promoted-and-demoted-existing-primary',
        },
        primaryIntent: {
          resultingAction: 'promote-target-and-demote-existing-scope-primary',
        },
      },
    });
  });

  it('should surface workspace-to-tenant rebinding for non-primary domains without override flags', async () => {
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_existing',
      tenantId: 'tenant_1',
      workspaceId: 'ws_1',
      isPrimary: false,
      workspace: { slug: 'ops' },
    });
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_existing',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });

    expect(prisma.tenantDomain.updateMany).not.toHaveBeenCalled();
    expect(result.governance).toMatchObject({
      bindingScope: 'tenant',
      primaryScope: null,
      primaryIntent: {
        requestedPromotion: false,
        requestedDemotion: false,
        explicitDemotionApproved: false,
        resultingPrimary: false,
        resultingAction: 'retain-or-write-non-primary-domain',
      },
      scopeTransition: {
        rebindingRequested: true,
        explicitRebindingApproved: false,
        previousScope: 'workspace:ops',
        targetScope: 'tenant:default',
        action: 'rebound-domain-scope',
      },
    });
  });

  it('should allow affiliate-domain rebinding across scope without override flags when the domain is not primary', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_existing',
      tenantId: 'tenant_1',
      workspaceId: null,
      isPrimary: false,
      workspace: null,
    });
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_existing',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
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

    expect(prisma.tenantDomain.updateMany).not.toHaveBeenCalled();
    expect(result.governance).toMatchObject({
      bindingScope: 'workspace',
      primaryScope: null,
      primaryIntent: {
        requestedPromotion: false,
        requestedDemotion: false,
        explicitDemotionApproved: false,
        resultingPrimary: false,
        resultingAction: 'retain-or-write-non-primary-domain',
      },
      scopeTransition: {
        rebindingRequested: true,
        explicitRebindingApproved: false,
        previousScope: 'tenant:default',
        targetScope: 'workspace:ops',
        action: 'rebound-domain-scope',
      },
      provisioning: {
        provider: 'reseller-edge',
        mode: 'affiliate-managed',
        externallyManaged: true,
      },
    });
  });

  it('should reject binding a hostname that already belongs to another tenant', async () => {
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_other',
      tenantId: 'tenant_other',
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
        isPrimary: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should normalize domain hostnames before checking existing bindings and upserting', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_normalized',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: ' https://OPS.ACME.TEST:443/path ',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });

    expect(prisma.tenantDomain.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hostname: 'ops.acme.test' },
      }),
    );
    expect(prisma.tenantDomain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hostname: 'ops.acme.test' },
        create: expect.objectContaining({
          hostname: 'ops.acme.test',
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: {
        hostname: 'ops.acme.test',
      },
    });
  });

  it('should reject normalized hostnames that resolve to another tenant binding', async () => {
    prisma.tenantDomain.findUnique.mockResolvedValue({
      id: 'domain_other',
      tenantId: 'tenant_other',
      workspaceId: null,
      isPrimary: true,
      workspace: null,
    });

    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: ' https://OPS.ACME.TEST:443/path ',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        provider: 'cloudflare',
        provisioningMode: 'managed',
        dnsTarget: 'edge.aifut.test',
        certificateStatus: 'issued',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.tenantDomain.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hostname: 'ops.acme.test' },
      }),
    );
    expect(prisma.tenantDomain.upsert).not.toHaveBeenCalled();
  });

  it('should normalize domain kind and status before persistence', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_normalized_enum',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:40:00.000Z'),
      updatedAt: new Date('2026-04-26T09:40:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'partner.acme.test',
      kind: ' affiliate_domain ' as TenantDomainKind,
      status: ' active ' as TenantDomainStatus,
      provider: 'cloudflare',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });

    expect(prisma.tenantDomain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: TenantDomainKind.AFFILIATE_DOMAIN,
          status: TenantDomainStatus.ACTIVE,
        }),
        update: expect.objectContaining({
          kind: TenantDomainKind.AFFILIATE_DOMAIN,
          status: TenantDomainStatus.ACTIVE,
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: {
        kind: TenantDomainKind.AFFILIATE_DOMAIN,
        status: TenantDomainStatus.ACTIVE,
      },
    });
  });

  it('should reject invalid normalized domain kind values', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'ops.acme.test',
        kind: ' unsupported ' as TenantDomainKind,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.tenantDomain.upsert).not.toHaveBeenCalled();
  });

  it('should reject invalid normalized domain status values', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'ops.acme.test',
        status: ' unsupported ' as TenantDomainStatus,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.tenantDomain.upsert).not.toHaveBeenCalled();
  });

  it('should reject domain writes whose hostname normalizes to an empty value', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: ' https:// ',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        provider: 'cloudflare',
        provisioningMode: 'managed',
        dnsTarget: 'edge.aifut.test',
        certificateStatus: 'issued',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.tenantDomain.findUnique).not.toHaveBeenCalled();
    expect(prisma.tenantDomain.upsert).not.toHaveBeenCalled();
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

  it('should reject active custom domains when dns target normalizes to empty', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'ops.acme.test',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        dnsTarget: '   ',
        certificateStatus: 'issued',
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

  it('should reject active custom domains when certificate status normalizes to a non-ready value', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'custom.acme.test',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        dnsTarget: 'edge.aifut.test',
        certificateStatus: ' Pending ',
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

  it('should reject active affiliate domains when provisioning mode normalizes to empty', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'partner.acme.test',
        kind: TenantDomainKind.AFFILIATE_DOMAIN,
        status: TenantDomainStatus.ACTIVE,
        provisioningMode: '   ',
        dnsTarget: 'edge.partner.test',
        certificateStatus: 'ready',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject active affiliate domains when dns target normalizes to empty', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'partner.acme.test',
        kind: TenantDomainKind.AFFILIATE_DOMAIN,
        status: TenantDomainStatus.ACTIVE,
        provisioningMode: 'affiliate-managed',
        dnsTarget: '   ',
        certificateStatus: 'ready',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject active affiliate domains when certificate status normalizes to a non-ready value', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'partner.acme.test',
        kind: TenantDomainKind.AFFILIATE_DOMAIN,
        status: TenantDomainStatus.ACTIVE,
        provisioningMode: 'affiliate-managed',
        dnsTarget: 'edge.partner.test',
        certificateStatus: ' Pending ',
        provider: 'reseller-edge',
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

  it('should normalize provisioning mode and certificate status casing before validation and persistence', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_1',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: ' Managed ',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: ' Issued ',
    });

    expect(prisma.tenantDomain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          provisioningMode: 'managed',
          certificateStatus: 'issued',
        }),
        create: expect.objectContaining({
          provisioningMode: 'managed',
          certificateStatus: 'issued',
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: {
        provisioningMode: 'managed',
        certificateStatus: 'issued',
      },
      governance: {
        provisioning: {
          mode: 'managed',
          externallyManaged: true,
        },
        readiness: {
          routeReady: true,
        },
      },
    });
  });

  it('should trim provider metadata before persistence for managed active domains', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_provider_trimmed',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      provider: ' cloudflare ',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
    });

    expect(prisma.tenantDomain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          provider: 'cloudflare',
        }),
        create: expect.objectContaining({
          provider: 'cloudflare',
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: {
        provider: 'cloudflare',
      },
      governance: {
        provisioning: {
          provider: 'cloudflare',
        },
      },
    });
  });

  it('should trim dns target before persistence for managed active domains', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_dns_target_trimmed',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: 'edge.aifut.test',
      certificateStatus: 'issued',
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.ACTIVE,
      provider: 'cloudflare',
      provisioningMode: 'managed',
      dnsTarget: ' edge.aifut.test ',
      certificateStatus: 'issued',
    });

    expect(prisma.tenantDomain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          dnsTarget: 'edge.aifut.test',
        }),
        create: expect.objectContaining({
          dnsTarget: 'edge.aifut.test',
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: {
        dnsTarget: 'edge.aifut.test',
      },
    });
  });

  it('should surface non-route-ready governance for degraded custom domains without managed provisioning metadata', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_degraded_custom_1',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.DEGRADED,
      isPrimary: false,
      provider: null,
      provisioningMode: null,
      dnsTarget: null,
      certificateStatus: null,
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'ops.acme.test',
      kind: TenantDomainKind.CUSTOM,
      status: TenantDomainStatus.DEGRADED,
      isPrimary: false,
    });

    expect(prisma.tenantDomain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          provider: null,
          provisioningMode: null,
          dnsTarget: null,
          certificateStatus: null,
        }),
        create: expect.objectContaining({
          provider: null,
          provisioningMode: null,
          dnsTarget: null,
          certificateStatus: null,
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: {
        status: TenantDomainStatus.DEGRADED,
        provider: null,
        provisioningMode: null,
      },
      governance: {
        readiness: {
          routeReady: false,
        },
        provisioning: {
          provider: null,
          mode: null,
          externallyManaged: false,
        },
      },
    });
  });

  it('should surface non-route-ready governance for degraded affiliate domains without managed provisioning metadata', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_degraded_affiliate_1',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.DEGRADED,
      isPrimary: false,
      provider: null,
      provisioningMode: null,
      dnsTarget: null,
      certificateStatus: null,
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.DEGRADED,
      isPrimary: false,
      provider: '   ',
      provisioningMode: '   ',
      dnsTarget: '   ',
      certificateStatus: '   ',
    });

    expect(prisma.tenantDomain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          provider: null,
          provisioningMode: null,
          dnsTarget: null,
          certificateStatus: null,
        }),
        create: expect.objectContaining({
          provider: null,
          provisioningMode: null,
          dnsTarget: null,
          certificateStatus: null,
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: {
        status: TenantDomainStatus.DEGRADED,
        provider: null,
        provisioningMode: null,
      },
      governance: {
        readiness: {
          routeReady: false,
        },
        provisioning: {
          provider: null,
          mode: null,
          externallyManaged: false,
        },
      },
    });
  });

  it('should still require provider metadata for managed active domains after provisioning mode normalization', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'ops.acme.test',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        provisioningMode: ' Managed ',
        dnsTarget: 'edge.aifut.test',
        certificateStatus: ' Issued ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject managed active domains when provider metadata normalizes to empty', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'ops.acme.test',
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        provider: '   ',
        provisioningMode: ' Managed ',
        dnsTarget: 'edge.aifut.test',
        certificateStatus: ' Issued ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should still require provider metadata for affiliate-managed active domains after provisioning mode normalization', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'partner.acme.test',
        kind: TenantDomainKind.AFFILIATE_DOMAIN,
        status: TenantDomainStatus.ACTIVE,
        provisioningMode: ' Affiliate-Managed ',
        dnsTarget: 'edge.partner.test',
        certificateStatus: ' Ready ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject affiliate-managed active domains when provider metadata normalizes to empty', async () => {
    await expect(
      service.upsertDomain({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        hostname: 'partner.acme.test',
        kind: TenantDomainKind.AFFILIATE_DOMAIN,
        status: TenantDomainStatus.ACTIVE,
        provider: '   ',
        provisioningMode: ' Affiliate-Managed ',
        dnsTarget: 'edge.partner.test',
        certificateStatus: ' Ready ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should normalize affiliate-managed provisioning mode before persistence and readiness evaluation', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_affiliate',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      provider: 'reseller-edge',
      provisioningMode: ' Affiliate-Managed ',
      dnsTarget: 'edge.partner.test',
      certificateStatus: ' Ready ',
    });

    expect(prisma.tenantDomain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          provisioningMode: 'affiliate-managed',
          certificateStatus: 'ready',
        }),
        create: expect.objectContaining({
          provisioningMode: 'affiliate-managed',
          certificateStatus: 'ready',
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: {
        provisioningMode: 'affiliate-managed',
        certificateStatus: 'ready',
      },
      governance: {
        provisioning: {
          mode: 'affiliate-managed',
          externallyManaged: true,
        },
        readiness: {
          routeReady: true,
        },
      },
    });
  });

  it('should trim provider metadata before persistence for affiliate-managed domains', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_affiliate_provider_trimmed',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      provider: ' reseller-edge ',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });

    expect(prisma.tenantDomain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          provider: 'reseller-edge',
        }),
        create: expect.objectContaining({
          provider: 'reseller-edge',
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: {
        provider: 'reseller-edge',
      },
      governance: {
        provisioning: {
          provider: 'reseller-edge',
        },
      },
    });
  });

  it('should trim dns target before persistence for affiliate-managed domains', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_affiliate_dns_trimmed',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: ' edge.partner.test ',
      certificateStatus: 'ready',
    });

    expect(prisma.tenantDomain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          dnsTarget: 'edge.partner.test',
        }),
        create: expect.objectContaining({
          dnsTarget: 'edge.partner.test',
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'domain-upserted',
      domain: {
        dnsTarget: 'edge.partner.test',
      },
    });
  });

  it('should reject package assignments without a base plan key', async () => {
    await expect(
      service.upsertPackageAssignment({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        selectedOptions: ['nexovaflow.automation'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject active package assignments when no options are selected', async () => {
    await expect(
      service.upsertPackageAssignment({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        basePlanKey: 'core.scale',
        selectedOptions: [],
        provisioningState: 'active',
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
    expect(prisma.tenantDomain.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant_1',
        id: { not: 'domain_1' },
        workspaceId: 'ws_1',
      },
      data: {
        isPrimary: false,
      },
    });
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

  it('should demote only tenant-scope primaries when promoting a tenant-level primary domain', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_tenant_primary',
      hostname: 'acme.test',
      kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      provider: null,
      provisioningMode: null,
      dnsTarget: null,
      certificateStatus: null,
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:05:00.000Z'),
      updatedAt: new Date('2026-04-26T09:05:00.000Z'),
    });
    prisma.tenantDomain.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'acme.test',
      kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
    });

    expect(prisma.tenantDomain.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant_1',
        id: { not: 'domain_tenant_primary' },
        workspaceId: null,
      },
      data: {
        isPrimary: false,
      },
    });
    expect(result.governance).toMatchObject({
      bindingScope: 'tenant',
      primaryScope: 'tenant:default',
      primaryReassignment: {
        scope: 'tenant:default',
        demotedPrimaryCount: 1,
        collisionDetected: true,
        action: 'promoted-and-demoted-existing-primary',
      },
      primaryIntent: {
        requestedPromotion: true,
        requestedDemotion: false,
        explicitDemotionApproved: false,
        resultingPrimary: true,
        resultingAction: 'promote-target-and-demote-existing-scope-primary',
      },
    });
  });

  it('should demote only tenant-scope primaries when promoting a tenant-level primary affiliate domain', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_tenant_affiliate_primary',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:06:00.000Z'),
      updatedAt: new Date('2026-04-26T09:06:00.000Z'),
    });
    prisma.tenantDomain.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });

    expect(prisma.tenantDomain.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant_1',
        id: { not: 'domain_tenant_affiliate_primary' },
        workspaceId: null,
      },
      data: {
        isPrimary: false,
      },
    });
    expect(result.governance).toMatchObject({
      bindingScope: 'tenant',
      primaryScope: 'tenant:default',
      primaryReassignment: {
        scope: 'tenant:default',
        demotedPrimaryCount: 1,
        collisionDetected: true,
        action: 'promoted-and-demoted-existing-primary',
      },
      primaryIntent: {
        requestedPromotion: true,
        requestedDemotion: false,
        explicitDemotionApproved: false,
        resultingPrimary: true,
        resultingAction: 'promote-target-and-demote-existing-scope-primary',
      },
      readiness: {
        routeReady: true,
      },
      provisioning: {
        provider: 'reseller-edge',
        mode: 'affiliate-managed',
        externallyManaged: true,
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

  it('should surface non-collision promotion intent for a tenant-level primary affiliate domain when no existing primary is displaced', async () => {
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_affiliate_no_collision',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
      workspaceId: null,
      createdAt: new Date('2026-04-26T09:11:00.000Z'),
      updatedAt: new Date('2026-04-26T09:11:00.000Z'),
    });
    prisma.tenantDomain.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
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
      readiness: {
        routeReady: true,
      },
      provisioning: {
        provider: 'reseller-edge',
        mode: 'affiliate-managed',
        externallyManaged: true,
      },
    });
  });

  it('should promote an affiliate domain and demote an existing workspace primary', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantDomain.upsert.mockResolvedValue({
      id: 'domain_affiliate_primary',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-26T09:45:00.000Z'),
      updatedAt: new Date('2026-04-26T09:45:00.000Z'),
    });
    prisma.tenantDomain.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
    });

    expect(prisma.tenantDomain.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant_1',
        id: { not: 'domain_affiliate_primary' },
        workspaceId: 'ws_1',
      },
      data: {
        isPrimary: false,
      },
    });
    expect(result).toMatchObject({
      status: 'domain-upserted',
      workspace: { slug: 'ops' },
      domain: {
        hostname: 'partner.acme.test',
        provider: 'reseller-edge',
        provisioningMode: 'affiliate-managed',
        dnsTarget: 'edge.partner.test',
        certificateStatus: 'ready',
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
          provider: 'reseller-edge',
          mode: 'affiliate-managed',
          externallyManaged: true,
        },
      },
    });
  });

  it('should reject hybrid storage policies without both primary and backup targets', async () => {
    await expect(
      service.upsertStoragePolicy({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        key: 'media-assets',
        mode: 'HYBRID' as any,
        targetRef: 's3://primary-assets',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should normalize storage policy mode casing before validation and persistence', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantStoragePolicy.upsert.mockResolvedValue({
      id: 'policy_2',
      key: 'media-assets',
      mode: 'HYBRID',
      storageClass: 'warm',
      targetRef: 's3://primary-assets',
      targetRegion: 'ap-southeast-1',
      backupTargetRef: 'b2://backup-assets',
      meteringEnabled: true,
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-27T08:05:00.000Z'),
      updatedAt: new Date('2026-04-27T08:05:00.000Z'),
    });

    const result = await service.upsertStoragePolicy({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      key: 'media-assets',
      mode: ' hybrid ' as any,
      storageClass: 'warm',
      targetRef: 's3://primary-assets',
      targetRegion: 'ap-southeast-1',
      backupTargetRef: 'b2://backup-assets',
      meteringEnabled: true,
    });

    expect(prisma.tenantStoragePolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          mode: 'HYBRID',
        }),
        update: expect.objectContaining({
          mode: 'HYBRID',
        }),
      }),
    );
    expect(result).toMatchObject({
      policy: {
        mode: 'HYBRID',
      },
      topology: {
        ownershipMode: 'HYBRID',
      },
    });
  });

  it('should trim optional storage policy fields before persistence', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantStoragePolicy.upsert.mockResolvedValue({
      id: 'policy_3',
      key: 'media-assets',
      mode: 'TENANT_MANAGED',
      storageClass: 'cold',
      targetRef: 's3://tenant-assets',
      targetRegion: 'ap-southeast-1',
      backupTargetRef: null,
      meteringEnabled: false,
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-27T08:06:00.000Z'),
      updatedAt: new Date('2026-04-27T08:06:00.000Z'),
    });

    const result = await service.upsertStoragePolicy({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      key: 'media-assets',
      mode: ' tenant_managed ' as any,
      storageClass: ' cold ',
      targetRef: ' s3://tenant-assets ',
      targetRegion: ' ap-southeast-1 ',
      meteringEnabled: false,
    });

    expect(prisma.tenantStoragePolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          storageClass: 'cold',
          targetRef: 's3://tenant-assets',
          targetRegion: 'ap-southeast-1',
        }),
        update: expect.objectContaining({
          storageClass: 'cold',
          targetRef: 's3://tenant-assets',
          targetRegion: 'ap-southeast-1',
        }),
      }),
    );
    expect(result).toMatchObject({
      policy: {
        storageClass: 'cold',
        targetRef: 's3://tenant-assets',
        targetRegion: 'ap-southeast-1',
      },
    });
  });

  it('should trim backup storage targets before persisting hybrid storage policies', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantStoragePolicy.upsert.mockResolvedValue({
      id: 'policy_4',
      key: 'media-assets',
      mode: 'HYBRID',
      storageClass: 'warm',
      targetRef: 's3://primary-assets',
      targetRegion: 'ap-southeast-1',
      backupTargetRef: 'b2://backup-assets',
      meteringEnabled: true,
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-27T08:07:00.000Z'),
      updatedAt: new Date('2026-04-27T08:07:00.000Z'),
    });

    const result = await service.upsertStoragePolicy({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      key: 'media-assets',
      mode: ' hybrid ' as any,
      storageClass: 'warm',
      targetRef: 's3://primary-assets',
      targetRegion: 'ap-southeast-1',
      backupTargetRef: ' b2://backup-assets ',
      meteringEnabled: true,
    });

    expect(prisma.tenantStoragePolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          backupTargetRef: 'b2://backup-assets',
        }),
        update: expect.objectContaining({
          backupTargetRef: 'b2://backup-assets',
        }),
      }),
    );
    expect(result).toMatchObject({
      policy: {
        backupTargetRef: 'b2://backup-assets',
      },
    });
  });

  it('should upsert a workspace-scoped hybrid storage policy with topology metadata', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantStoragePolicy.upsert.mockResolvedValue({
      id: 'policy_1',
      key: 'media-assets',
      mode: 'HYBRID',
      storageClass: 'warm',
      targetRef: 's3://primary-assets',
      targetRegion: 'ap-southeast-1',
      backupTargetRef: 'b2://backup-assets',
      meteringEnabled: true,
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-27T08:00:00.000Z'),
      updatedAt: new Date('2026-04-27T08:00:00.000Z'),
    });

    const result = await service.upsertStoragePolicy({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      key: 'media-assets',
      mode: 'HYBRID' as any,
      storageClass: 'warm',
      targetRef: 's3://primary-assets',
      targetRegion: 'ap-southeast-1',
      backupTargetRef: 'b2://backup-assets',
      meteringEnabled: true,
    });

    expect(prisma.tenantStoragePolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workspaceId: 'ws_1',
          mode: 'HYBRID',
          targetRef: 's3://primary-assets',
          backupTargetRef: 'b2://backup-assets',
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'storage-policy-upserted',
      workspace: { slug: 'ops' },
      policy: {
        key: 'media-assets',
        mode: 'HYBRID',
        targetRef: 's3://primary-assets',
        backupTargetRef: 'b2://backup-assets',
      },
      topology: {
        scope: 'workspace',
        ownershipMode: 'HYBRID',
      },
    });
  });

  it('should upsert a workspace-scoped package assignment with normalized options and pending provisioning', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantPackageAssignment.upsert.mockResolvedValue({
      id: 'assignment_1',
      scopeKey: 'acme:workspace:ops',
      basePlanKey: 'core-growth',
      selectedOptions: ['magicai-pro', 'nexovaflow-automation'],
      billingSnapshot: { currency: 'USD' },
      provisioningState: 'pending',
      source: 'admin-ui',
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-27T09:00:00.000Z'),
      updatedAt: new Date('2026-04-27T09:00:00.000Z'),
    });

    const result = await service.upsertPackageAssignment({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      basePlanKey: ' core-growth ',
      selectedOptions: [' magicai-pro ', 'nexovaflow-automation', 'magicai-pro'],
      source: 'admin-ui',
      billingSnapshot: { currency: 'USD' } as any,
    });

    expect(prisma.tenantPackageAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { scopeKey: 'acme:workspace:ops' },
        create: expect.objectContaining({
          workspaceId: 'ws_1',
          basePlanKey: 'core-growth',
          selectedOptions: ['magicai-pro', 'nexovaflow-automation'],
          provisioningState: 'pending',
          source: 'admin-ui',
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'package-assignment-upserted',
      workspace: { slug: 'ops' },
      packageAssignment: {
        scopeKey: 'acme:workspace:ops',
        basePlanKey: 'core-growth',
        selectedOptions: ['magicai-pro', 'nexovaflow-automation'],
        provisioningState: 'pending',
      },
      topology: {
        scope: 'workspace',
        commercialScopeKey: 'acme:workspace:ops',
        selectedOptionsCount: 2,
      },
    });
  });

  it('should default tenant-scoped package assignments without options to inactive provisioning', async () => {
    prisma.tenantPackageAssignment.upsert.mockResolvedValue({
      id: 'assignment_2',
      scopeKey: 'acme:tenant:default',
      basePlanKey: 'core-starter',
      selectedOptions: [],
      billingSnapshot: null,
      provisioningState: 'inactive',
      source: null,
      workspaceId: null,
      createdAt: new Date('2026-04-27T09:15:00.000Z'),
      updatedAt: new Date('2026-04-27T09:15:00.000Z'),
    });

    const result = await service.upsertPackageAssignment({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      basePlanKey: ' core-starter ',
      selectedOptions: [],
    });

    expect(prisma.tenantPackageAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { scopeKey: 'acme:tenant:default' },
        create: expect.objectContaining({
          workspaceId: null,
          basePlanKey: 'core-starter',
          selectedOptions: [],
          provisioningState: 'inactive',
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'package-assignment-upserted',
      workspace: null,
      packageAssignment: {
        scopeKey: 'acme:tenant:default',
        basePlanKey: 'core-starter',
        selectedOptions: [],
        provisioningState: 'inactive',
      },
      topology: {
        scope: 'tenant',
        commercialScopeKey: 'acme:tenant:default',
        selectedOptionsCount: 0,
      },
    });
  });

  it('should normalize explicit package provisioning state before persistence', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantPackageAssignment.upsert.mockResolvedValue({
      id: 'assignment_3',
      scopeKey: 'acme:workspace:ops',
      basePlanKey: 'core-growth',
      selectedOptions: ['magicai-pro'],
      billingSnapshot: null,
      provisioningState: 'active',
      source: 'admin-ui',
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-27T09:20:00.000Z'),
      updatedAt: new Date('2026-04-27T09:20:00.000Z'),
    });

    const result = await service.upsertPackageAssignment({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      basePlanKey: ' core-growth ',
      selectedOptions: [' magicai-pro '],
      provisioningState: ' Active ',
      source: 'admin-ui',
    });

    expect(prisma.tenantPackageAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provisioningState: 'active',
        }),
        update: expect.objectContaining({
          provisioningState: 'active',
        }),
      }),
    );
    expect(result).toMatchObject({
      packageAssignment: {
        provisioningState: 'active',
      },
    });
  });

  it('should reject active package assignments without options even when provisioning state is spaced or mixed-case', async () => {
    await expect(
      service.upsertPackageAssignment({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        basePlanKey: ' core-starter ',
        selectedOptions: [],
        provisioningState: ' Active ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should trim package assignment source before persistence', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantPackageAssignment.upsert.mockResolvedValue({
      id: 'assignment_4',
      scopeKey: 'acme:workspace:ops',
      basePlanKey: 'core-growth',
      selectedOptions: ['magicai-pro'],
      billingSnapshot: { currency: 'USD' },
      provisioningState: 'pending',
      source: 'admin-ui',
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-27T09:25:00.000Z'),
      updatedAt: new Date('2026-04-27T09:25:00.000Z'),
    });

    const result = await service.upsertPackageAssignment({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      basePlanKey: ' core-growth ',
      selectedOptions: [' magicai-pro '],
      source: ' admin-ui ',
      billingSnapshot: { currency: 'USD' } as any,
    });

    expect(prisma.tenantPackageAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          source: 'admin-ui',
        }),
        update: expect.objectContaining({
          source: 'admin-ui',
        }),
      }),
    );
    expect(result).toMatchObject({
      packageAssignment: {
        source: 'admin-ui',
      },
    });
  });

  it('should normalize whitespace-only package assignment source to null', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantPackageAssignment.upsert.mockResolvedValue({
      id: 'assignment_5',
      scopeKey: 'acme:workspace:ops',
      basePlanKey: 'core-growth',
      selectedOptions: ['magicai-pro'],
      billingSnapshot: { currency: 'USD' },
      provisioningState: 'pending',
      source: null,
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-27T09:26:00.000Z'),
      updatedAt: new Date('2026-04-27T09:26:00.000Z'),
    });

    const result = await service.upsertPackageAssignment({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      basePlanKey: ' core-growth ',
      selectedOptions: [' magicai-pro '],
      source: '   ',
      billingSnapshot: { currency: 'USD' } as any,
    });

    expect(prisma.tenantPackageAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          source: null,
        }),
        update: expect.objectContaining({
          source: null,
        }),
      }),
    );
    expect(result).toMatchObject({
      packageAssignment: {
        source: null,
      },
    });
  });

  it('should preserve package billing snapshots without normalization', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Ops',
      slug: 'ops',
    });
    prisma.tenantPackageAssignment.upsert.mockResolvedValue({
      id: 'assignment_6',
      scopeKey: 'acme:workspace:ops',
      basePlanKey: 'core-growth',
      selectedOptions: ['magicai-pro'],
      billingSnapshot: {
        currency: 'USD',
        tiers: [{ seats: 5, monthly: 199 }],
        notes: { lockedBy: 'operator' },
      },
      provisioningState: 'pending',
      source: 'admin-ui',
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-27T09:27:00.000Z'),
      updatedAt: new Date('2026-04-27T09:27:00.000Z'),
    });

    const billingSnapshot = {
      currency: 'USD',
      tiers: [{ seats: 5, monthly: 199 }],
      notes: { lockedBy: 'operator' },
    } as any;

    const result = await service.upsertPackageAssignment({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      basePlanKey: ' core-growth ',
      selectedOptions: [' magicai-pro '],
      source: 'admin-ui',
      billingSnapshot,
    });

    expect(prisma.tenantPackageAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          billingSnapshot,
        }),
        update: expect.objectContaining({
          billingSnapshot,
        }),
      }),
    );
    expect(result).toMatchObject({
      packageAssignment: {
        billingSnapshot: {
          currency: 'USD',
          tiers: [{ seats: 5, monthly: 199 }],
          notes: { lockedBy: 'operator' },
        },
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

  it('should allow explicit demotion and scope rebinding of an existing primary affiliate domain', async () => {
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
      hostname: 'partner.acme.test',
      kind: TenantDomainKind.AFFILIATE_DOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: false,
      provider: 'reseller-edge',
      provisioningMode: 'affiliate-managed',
      dnsTarget: 'edge.partner.test',
      certificateStatus: 'ready',
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-26T09:30:00.000Z'),
      updatedAt: new Date('2026-04-26T09:30:00.000Z'),
    });

    const result = await service.upsertDomain({
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
      provisioning: {
        provider: 'reseller-edge',
        mode: 'affiliate-managed',
        externallyManaged: true,
      },
    });
  });

  it('should allow scope rebinding of an existing primary domain while keeping it primary and reassigning the target-scope primary', async () => {
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
      isPrimary: true,
      provider: null,
      provisioningMode: null,
      dnsTarget: null,
      certificateStatus: null,
      workspaceId: 'ws_1',
      createdAt: new Date('2026-04-26T09:35:00.000Z'),
      updatedAt: new Date('2026-04-26T09:35:00.000Z'),
    });
    prisma.tenantDomain.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.upsertDomain({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'acme.test',
      kind: TenantDomainKind.PLATFORM_SUBDOMAIN,
      status: TenantDomainStatus.ACTIVE,
      isPrimary: true,
      allowScopeRebinding: true,
    });

    expect(prisma.tenantDomain.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant_1',
        id: { not: 'domain_existing' },
        workspaceId: 'ws_1',
      },
      data: {
        isPrimary: false,
      },
    });
    expect(result.governance).toMatchObject({
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
        resultingAction: 'promote-target-and-demote-existing-scope-primary',
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

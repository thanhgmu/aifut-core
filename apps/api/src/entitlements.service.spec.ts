import { Test, TestingModule } from '@nestjs/testing';
import { EntitlementKind, MembershipRole } from '@prisma/client';
import { EntitlementsService } from './entitlements.service';
import { PrismaService } from './prisma.service';
import { ActorContextService } from './actor-context.service';
import { AccessPolicyService } from './access-policy.service';

describe('EntitlementsService', () => {
  let service: EntitlementsService;
  let prisma: {
    tenantPackageAssignment: { findMany: jest.Mock; upsert: jest.Mock };
    entitlement: { findMany: jest.Mock; upsert: jest.Mock };
    integrationConnection: { findMany: jest.Mock };
  };
  let actorContext: { resolve: jest.Mock };
  let accessPolicy: { resolveAndRequire: jest.Mock };

  beforeEach(async () => {
    prisma = {
      tenantPackageAssignment: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      entitlement: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      integrationConnection: {
        findMany: jest.fn(),
      },
    };

    actorContext = {
      resolve: jest.fn(),
    };

    accessPolicy = {
      resolveAndRequire: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitlementsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActorContextService, useValue: actorContext },
        { provide: AccessPolicyService, useValue: accessPolicy },
      ],
    }).compile();

    service = module.get<EntitlementsService>(EntitlementsService);
  });

  it('should expose workspace fallback to tenant assignment in current package state', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
    });
    prisma.tenantPackageAssignment.findMany.mockResolvedValue([
      {
        id: 'pkg_1',
        scopeKey: 'acme:tenant:default',
        basePlanKey: 'core.growth',
        selectedOptions: ['nexovaflow.automation'],
        billingSnapshot: null,
        provisioningState: 'pending',
        source: 'seed',
        createdAt: new Date('2026-04-24T00:00:00.000Z'),
        updatedAt: new Date('2026-04-24T00:00:00.000Z'),
      },
    ]);
    prisma.entitlement.findMany.mockResolvedValue([
      {
        id: 'ent_1',
        key: 'feature.nexovaflow.automation',
        kind: EntitlementKind.FEATURE,
        value: 'enabled',
        source: 'seed:acme:tenant:default',
        startsAt: null,
        endsAt: null,
        createdAt: new Date('2026-04-24T00:00:00.000Z'),
        updatedAt: new Date('2026-04-24T00:01:00.000Z'),
      },
      {
        id: 'ent_2',
        key: 'package.base-plan',
        kind: EntitlementKind.FEATURE,
        value: 'core.growth',
        source: 'seed:acme:tenant:default',
        startsAt: null,
        endsAt: null,
        createdAt: new Date('2026-04-24T00:00:00.000Z'),
        updatedAt: new Date('2026-04-24T00:01:00.000Z'),
      },
    ]);

    const result = await service.getTenantPackageState({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
    });

    expect(result.packageState.scope).toMatchObject({
      requested: { scopeKey: 'acme:workspace:ops', scopeType: 'workspace' },
      effective: { scopeKey: 'acme:tenant:default', scopeType: 'tenant' },
      fallbackApplied: true,
      entitlementBoundary: {
        model: 'tenant-wide-entitlements',
      },
    });
    expect(result.packageState.assignment).toMatchObject({
      scopeKey: 'acme:tenant:default',
      basePlanKey: 'core.growth',
    });
    expect(result.packageState.entitlementSyncSummary).toMatchObject({
      requestedScope: { scopeKey: 'acme:workspace:ops' },
      effectiveScope: { scopeKey: 'acme:tenant:default' },
      fallbackApplied: true,
      counts: {
        requestedScopeSourceMatches: 0,
        effectiveScopeSourceMatches: 2,
      },
      basePlanEntitlement: {
        key: 'package.base-plan',
        value: 'core.growth',
        source: 'seed:acme:tenant:default',
        scopeAligned: true,
        freshness: 'aging',
      },
      optionAudit: expect.arrayContaining([
        expect.objectContaining({
          optionKey: 'nexovaflow.automation',
          value: 'enabled',
          source: 'seed:acme:tenant:default',
          scopeAligned: true,
          freshness: 'aging',
        }),
      ]),
    });
  });

  it('should expose direct tenant-scope entitlement alignment without fallback', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: null,
    });
    prisma.tenantPackageAssignment.findMany.mockResolvedValue([
      {
        id: 'pkg_3',
        scopeKey: 'acme:tenant:default',
        basePlanKey: 'core.growth',
        selectedOptions: ['nexovaflow.automation'],
        billingSnapshot: null,
        provisioningState: 'active',
        source: 'admin-ui',
        createdAt: new Date('2026-04-24T02:00:00.000Z'),
        updatedAt: new Date('2026-04-24T02:05:00.000Z'),
      },
    ]);
    prisma.entitlement.findMany.mockResolvedValue([
      {
        id: 'ent_3',
        key: 'feature.nexovaflow.automation',
        kind: EntitlementKind.FEATURE,
        value: 'enabled',
        source: 'admin-ui:acme:tenant:default',
        startsAt: null,
        endsAt: null,
        createdAt: new Date('2026-04-24T02:00:00.000Z'),
        updatedAt: new Date('2026-04-24T02:06:00.000Z'),
      },
      {
        id: 'ent_4',
        key: 'package.base-plan',
        kind: EntitlementKind.FEATURE,
        value: 'core.growth',
        source: 'admin-ui:acme:tenant:default',
        startsAt: null,
        endsAt: null,
        createdAt: new Date('2026-04-24T02:00:00.000Z'),
        updatedAt: new Date('2026-04-24T02:06:00.000Z'),
      },
    ]);

    const result = await service.getTenantPackageState({
      tenantSlug: 'acme',
      userEmail: 'owner@acme.test',
    });

    expect(result.packageState.scope).toMatchObject({
      requested: { scopeKey: 'acme:tenant:default', scopeType: 'tenant' },
      effective: { scopeKey: 'acme:tenant:default', scopeType: 'tenant' },
      fallbackApplied: false,
    });
    expect(result.packageState.entitlementSyncSummary).toMatchObject({
      requestedScope: { scopeKey: 'acme:tenant:default' },
      effectiveScope: { scopeKey: 'acme:tenant:default' },
      fallbackApplied: false,
      counts: {
        requestedScopeSourceMatches: 2,
        effectiveScopeSourceMatches: 2,
      },
      basePlanEntitlement: {
        key: 'package.base-plan',
        value: 'core.growth',
        source: 'admin-ui:acme:tenant:default',
        scopeAligned: true,
        freshness: 'aging',
      },
      optionAudit: expect.arrayContaining([
        expect.objectContaining({
          optionKey: 'nexovaflow.automation',
          value: 'enabled',
          source: 'admin-ui:acme:tenant:default',
          scopeAligned: true,
          freshness: 'aging',
        }),
      ]),
    });
  });

  it('should surface partial source misalignment in entitlement sync audit summary', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
    });
    prisma.tenantPackageAssignment.findMany.mockResolvedValue([
      {
        id: 'pkg_4',
        scopeKey: 'acme:workspace:ops',
        basePlanKey: 'core.growth',
        selectedOptions: ['nexovaflow.automation'],
        billingSnapshot: null,
        provisioningState: 'active',
        source: 'admin-ui',
        createdAt: new Date('2026-04-24T03:00:00.000Z'),
        updatedAt: new Date('2026-04-24T03:05:00.000Z'),
      },
    ]);
    prisma.entitlement.findMany.mockResolvedValue([
      {
        id: 'ent_5',
        key: 'feature.nexovaflow.automation',
        kind: EntitlementKind.FEATURE,
        value: 'enabled',
        source: 'admin-ui:acme:tenant:default',
        startsAt: null,
        endsAt: null,
        createdAt: new Date('2026-04-24T03:00:00.000Z'),
        updatedAt: new Date('2026-04-24T03:06:00.000Z'),
      },
      {
        id: 'ent_6',
        key: 'package.base-plan',
        kind: EntitlementKind.FEATURE,
        value: 'core.growth',
        source: 'admin-ui:acme:workspace:ops',
        startsAt: null,
        endsAt: null,
        createdAt: new Date('2026-04-24T03:00:00.000Z'),
        updatedAt: new Date('2026-04-24T03:06:00.000Z'),
      },
    ]);

    const result = await service.getTenantPackageState({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
    });

    expect(result.packageState.scope).toMatchObject({
      requested: { scopeKey: 'acme:workspace:ops', scopeType: 'workspace' },
      effective: { scopeKey: 'acme:workspace:ops', scopeType: 'workspace' },
      fallbackApplied: false,
    });
    expect(result.packageState.entitlementSyncSummary).toMatchObject({
      requestedScope: { scopeKey: 'acme:workspace:ops' },
      effectiveScope: { scopeKey: 'acme:workspace:ops' },
      fallbackApplied: false,
      counts: {
        requestedScopeSourceMatches: 1,
        effectiveScopeSourceMatches: 1,
      },
      basePlanEntitlement: {
        key: 'package.base-plan',
        value: 'core.growth',
        source: 'admin-ui:acme:workspace:ops',
        scopeAligned: true,
        freshness: 'aging',
      },
      optionAudit: expect.arrayContaining([
        expect.objectContaining({
          optionKey: 'nexovaflow.automation',
          value: 'enabled',
          source: 'admin-ui:acme:tenant:default',
          scopeAligned: false,
          freshness: 'aging',
        }),
      ]),
    });
  });

  it('should surface stale entitlement records in entitlement sync audit summary', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: null,
    });
    prisma.tenantPackageAssignment.findMany.mockResolvedValue([
      {
        id: 'pkg_5',
        scopeKey: 'acme:tenant:default',
        basePlanKey: 'core.growth',
        selectedOptions: ['nexovaflow.automation'],
        billingSnapshot: null,
        provisioningState: 'active',
        source: 'admin-ui',
        createdAt: new Date('2026-04-10T03:00:00.000Z'),
        updatedAt: new Date('2026-04-10T03:05:00.000Z'),
      },
    ]);
    prisma.entitlement.findMany.mockResolvedValue([
      {
        id: 'ent_7',
        key: 'feature.nexovaflow.automation',
        kind: EntitlementKind.FEATURE,
        value: 'enabled',
        source: 'admin-ui:acme:tenant:default',
        startsAt: null,
        endsAt: null,
        createdAt: new Date('2026-04-10T03:00:00.000Z'),
        updatedAt: new Date('2026-04-10T03:06:00.000Z'),
      },
      {
        id: 'ent_8',
        key: 'package.base-plan',
        kind: EntitlementKind.FEATURE,
        value: 'core.growth',
        source: 'admin-ui:acme:tenant:default',
        startsAt: null,
        endsAt: null,
        createdAt: new Date('2026-04-10T03:00:00.000Z'),
        updatedAt: new Date('2026-04-10T03:06:00.000Z'),
      },
    ]);

    const result = await service.getTenantPackageState({
      tenantSlug: 'acme',
      userEmail: 'owner@acme.test',
    });

    expect(result.packageState.entitlementSyncSummary).toMatchObject({
      basePlanEntitlement: {
        source: 'admin-ui:acme:tenant:default',
        scopeAligned: true,
        freshness: 'stale',
      },
      optionAudit: expect.arrayContaining([
        expect.objectContaining({
          optionKey: 'nexovaflow.automation',
          source: 'admin-ui:acme:tenant:default',
          scopeAligned: true,
          freshness: 'stale',
        }),
      ]),
    });
  });

  it('should surface freshly re-synced entitlement records as aligned and recent', async () => {
    const recentAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
    });
    prisma.tenantPackageAssignment.findMany.mockResolvedValue([
      {
        id: 'pkg_6',
        scopeKey: 'acme:workspace:ops',
        basePlanKey: 'core.growth',
        selectedOptions: ['nexovaflow.automation'],
        billingSnapshot: null,
        provisioningState: 'active',
        source: 'admin-ui',
        createdAt: recentAt,
        updatedAt: recentAt,
      },
    ]);
    prisma.entitlement.findMany.mockResolvedValue([
      {
        id: 'ent_9',
        key: 'feature.nexovaflow.automation',
        kind: EntitlementKind.FEATURE,
        value: 'enabled',
        source: 'admin-ui:acme:workspace:ops',
        startsAt: null,
        endsAt: null,
        createdAt: recentAt,
        updatedAt: recentAt,
      },
      {
        id: 'ent_10',
        key: 'package.base-plan',
        kind: EntitlementKind.FEATURE,
        value: 'core.growth',
        source: 'admin-ui:acme:workspace:ops',
        startsAt: null,
        endsAt: null,
        createdAt: recentAt,
        updatedAt: recentAt,
      },
    ]);

    const result = await service.getTenantPackageState({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
    });

    expect(result.packageState.entitlementSyncSummary).toMatchObject({
      requestedScope: { scopeKey: 'acme:workspace:ops' },
      effectiveScope: { scopeKey: 'acme:workspace:ops' },
      fallbackApplied: false,
      counts: {
        requestedScopeSourceMatches: 2,
        effectiveScopeSourceMatches: 2,
      },
      basePlanEntitlement: {
        source: 'admin-ui:acme:workspace:ops',
        scopeAligned: true,
        freshness: 'recent',
      },
      optionAudit: expect.arrayContaining([
        expect.objectContaining({
          optionKey: 'nexovaflow.automation',
          source: 'admin-ui:acme:workspace:ops',
          scopeAligned: true,
          freshness: 'recent',
        }),
      ]),
    });
  });

  it('should tag synced entitlements with assignment scope metadata', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        activeWorkspace: { id: 'ws_1', slug: 'ops' },
        activeMembership: { role: MembershipRole.ADMIN },
      },
    });
    prisma.tenantPackageAssignment.upsert.mockResolvedValue({
      id: 'pkg_2',
      scopeKey: 'acme:workspace:ops',
      basePlanKey: 'core.growth',
      selectedOptions: ['nexovaflow.automation'],
      billingSnapshot: null,
      provisioningState: 'pending',
      source: 'aifut-admin',
      createdAt: new Date('2026-04-24T00:00:00.000Z'),
      updatedAt: new Date('2026-04-24T00:00:00.000Z'),
    });
    prisma.entitlement.upsert.mockResolvedValue({});

    const result = await service.assignPackage({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      basePlanKey: 'core.growth',
      selectedOptions: ['nexovaflow.automation'],
      source: 'admin-ui',
    });

    expect(prisma.entitlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          source: 'admin-ui:acme:workspace:ops',
        }),
      }),
    );
    expect(result.scope).toMatchObject({
      assignment: { scopeKey: 'acme:workspace:ops', scopeType: 'workspace' },
      entitlementBoundary: {
        workspaceScopedAssignment: true,
      },
    });
    expect(result.entitlementSync.scope).toMatchObject({
      assignment: { scopeKey: 'acme:workspace:ops' },
      sourceTag: 'admin-ui:acme:workspace:ops',
    });
  });
});

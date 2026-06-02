import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationControlPlaneService } from './integration-control-plane.service';
import { PrismaService } from './prisma.service';
import { StorageRoutingPolicyService } from './storage-routing-policy.service';

describe('IntegrationControlPlaneService', () => {
  let service: IntegrationControlPlaneService;
  let prisma: {
    tenant: { findUnique: jest.Mock };
    tenantPackageAssignment: { findMany: jest.Mock };
    entitlement: { findMany: jest.Mock };
  };
  let storageRoutingPolicy: { getEffectivePolicy: jest.Mock };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findUnique: jest.fn(),
      },
      tenantPackageAssignment: {
        findMany: jest.fn(),
      },
      entitlement: {
        findMany: jest.fn(),
      },
    };
    prisma.tenantPackageAssignment.findMany.mockResolvedValue([]);
    prisma.entitlement.findMany.mockResolvedValue([]);

    storageRoutingPolicy = {
      getEffectivePolicy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationControlPlaneService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageRoutingPolicyService, useValue: storageRoutingPolicy },
      ],
    }).compile();

    service = module.get<IntegrationControlPlaneService>(
      IntegrationControlPlaneService,
    );
  });

  it('should reject missing tenant slug', async () => {
    await expect(service.summarizeTenantControlPlane({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should reject unknown workspace in tenant scope', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant_1',
      name: 'Acme',
      slug: 'acme',
      workspaces: [{ id: 'ws_1', name: 'Ops', slug: 'ops' }],
      domains: [],
      storagePolicies: [],
      integrations: [],
    });

    await expect(
      service.summarizeTenantControlPlane({
        tenantSlug: 'acme',
        workspaceSlug: 'sales',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should summarize workspace-scoped control plane and resolve effective storage policies', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant_1',
      name: 'Acme',
      slug: 'acme',
      workspaces: [
        { id: 'ws_1', name: 'Ops', slug: 'ops' },
        { id: 'ws_2', name: 'Sales', slug: 'sales' },
      ],
      domains: [
        {
          hostname: 'ops.acme.test',
          kind: 'CUSTOM',
          status: 'ACTIVE',
          isPrimary: true,
          provider: 'cloudflare',
          provisioningMode: 'managed',
          dnsTarget: 'edge.aifut.test',
          certificateStatus: 'issued',
          workspaceId: 'ws_1',
          workspace: { slug: 'ops', name: 'Ops' },
        },
        {
          hostname: 'tenant.acme.test',
          kind: 'SUBDOMAIN',
          status: 'ACTIVE',
          isPrimary: false,
          provider: null,
          provisioningMode: null,
          dnsTarget: null,
          certificateStatus: null,
          workspaceId: null,
          workspace: null,
        },
      ],
      storagePolicies: [
        {
          key: 'assets',
          mode: 'PLATFORM_MANAGED',
          storageClass: 'standard',
          targetRef: null,
          backupTargetRef: null,
          meteringEnabled: true,
          workspaceId: 'ws_1',
          workspace: { slug: 'ops', name: 'Ops' },
        },
        {
          key: 'shared',
          mode: 'TENANT_MANAGED',
          storageClass: 'archive',
          targetRef: 's3://tenant-shared',
          backupTargetRef: null,
          meteringEnabled: false,
          workspaceId: null,
          workspace: null,
        },
      ],
      integrations: [
        {
          id: 'conn_1',
          name: 'N8N Ops',
          slug: 'n8n-ops',
          provider: 'n8n',
          category: 'WORKFLOW',
          status: 'ACTIVE',
          workspaceId: 'ws_1',
          workspace: { slug: 'ops', name: 'Ops' },
          routingMode: 'direct',
          targetBaseUrl: 'https://n8n.example.com',
          targetEnvironment: 'cloud',
          targetRegion: 'ap-southeast-1',
          secretsRef: 'tenant:n8n:primary',
          config: {
            _platform: {
              alertThresholds: {
                immediateFailures: 2,
                repeatedFailures: 3,
                cooldownMinutes: 30,
              },
              followUpState: {
                state: 'blocked',
              },
              healthTimeline: [
                { status: 'needs-setup', at: '2099-04-24T20:00:00.000Z' },
                { status: 'needs-setup', at: '2099-04-24T20:04:00.000Z' },
                { status: 'needs-setup', at: '2099-04-24T20:05:00.000Z' },
              ],
            },
          },
          mappingMode: 'template-first',
          mappedObjects: ['tasks'],
          syncPolicy: { mode: 'bidirectional' },
          createdAt: new Date('2026-04-24T20:00:00.000Z'),
          updatedAt: new Date('2026-04-24T20:05:00.000Z'),
        },
        {
          id: 'conn_2',
          name: 'Salesforce Sales',
          slug: 'salesforce-sales',
          provider: 'generic-rest',
          category: 'OTHER',
          status: 'PENDING',
          workspaceId: 'ws_2',
          workspace: { slug: 'sales', name: 'Sales' },
          routingMode: 'proxy',
          targetBaseUrl: 'https://sales.example.com',
          targetEnvironment: 'cloud',
          targetRegion: 'us-east-1',
          secretsRef: null,
          config: {},
          mappingMode: 'manual',
          mappedObjects: [],
          syncPolicy: null,
          createdAt: new Date('2026-04-24T20:10:00.000Z'),
          updatedAt: new Date('2026-04-24T20:15:00.000Z'),
        },
      ],
    });
    prisma.tenantPackageAssignment.findMany.mockResolvedValue([
      {
        id: 'pkg_1',
        scopeKey: 'acme:tenant:default',
        basePlanKey: 'core.growth',
        selectedOptions: ['nexovaflow.automation'],
        provisioningState: 'pending',
        source: 'seed',
        updatedAt: new Date('2026-04-24T20:06:00.000Z'),
      },
    ]);
    prisma.entitlement.findMany.mockResolvedValue([
      {
        key: 'feature.nexovaflow.automation',
        value: 'enabled',
        source: 'seed:acme:tenant:default',
        updatedAt: new Date('2026-04-24T20:05:00.000Z'),
        endsAt: null,
      },
    ]);
    storageRoutingPolicy.getEffectivePolicy.mockImplementation(async (input) => ({
      policyKey: input.policyKey,
      effectivePolicy: {
        mode: input.policyKey === 'assets' ? 'PLATFORM_MANAGED' : 'TENANT_MANAGED',
        storageClass: input.policyKey === 'assets' ? 'standard' : 'archive',
        targetRef: input.policyKey === 'shared' ? 's3://tenant-shared' : null,
        backupTargetRef: null,
        meteringEnabled: input.policyKey === 'assets',
      },
      resolution: {
        workspaceScoped: input.policyKey === 'assets',
        activeWorkspaceSlug: input.workspaceSlug ?? null,
      },
    }));

    const result = await service.summarizeTenantControlPlane({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      hostname: 'ops.acme.test',
    });

    expect(storageRoutingPolicy.getEffectivePolicy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        policyKey: 'assets',
      }),
    );
    expect(storageRoutingPolicy.getEffectivePolicy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        policyKey: 'shared',
      }),
    );
    expect(result).toMatchObject({
      status: 'resolved',
      activeWorkspace: { slug: 'ops' },
      controlPlane: {
        operatorPlane: {
          connectedSystems: 1,
          domainCount: 2,
          storagePolicyCount: 2,
        },
        commercialization: {
          packageAssignmentScope: {
            requestedScopeKey: 'acme:workspace:ops',
            effectiveScopeKey: 'acme:tenant:default',
            fallbackApplied: true,
          },
          activePackageAssignment: {
            provisioningState: 'pending',
            provisioningUpdatedAt: new Date('2026-04-24T20:06:00.000Z'),
            provisioningRecency: 'stale',
            latestProvisioningEvent: {
              type: 'package-provisioning-state',
              state: 'pending',
              at: new Date('2026-04-24T20:06:00.000Z'),
              source: 'seed',
            },
            provisioningHistory: [
              {
                type: 'entitlement-sync-state',
                state: 'enabled',
                at: new Date('2026-04-24T20:05:00.000Z'),
                source: 'seed:acme:tenant:default',
              },
              {
                type: 'package-provisioning-state',
                state: 'pending',
                at: new Date('2026-04-24T20:06:00.000Z'),
                source: 'seed',
              },
            ],
          },
          nexovaflowAutomation: {
            packageSelected: true,
            provisioningState: 'pending',
            provisioningUpdatedAt: new Date('2026-04-24T20:06:00.000Z'),
            provisioningRecency: 'stale',
            latestProvisioningEvent: {
              type: 'package-provisioning-state',
              state: 'pending',
              at: new Date('2026-04-24T20:06:00.000Z'),
              source: 'seed',
            },
            provisioningHistory: [
              {
                type: 'entitlement-sync-state',
                state: 'enabled',
                at: new Date('2026-04-24T20:05:00.000Z'),
                source: 'seed:acme:tenant:default',
              },
              {
                type: 'package-provisioning-state',
                state: 'pending',
                at: new Date('2026-04-24T20:06:00.000Z'),
                source: 'seed',
              },
            ],
            entitlementEnabled: true,
            entitlementSource: 'seed:acme:tenant:default',
          },
        },
      },
      connections: [
        {
          slug: 'n8n-ops',
          workspace: { slug: 'ops' },
          healthStatus: {
            state: 'ACTIVE',
            verification: 'verified-or-activated',
            followUpState: 'blocked',
            shouldEscalateOperator: true,
          },
        },
      ],
      domains: [
        {
          hostname: 'ops.acme.test',
          workspace: { slug: 'ops', name: 'Ops' },
          readiness: { routeReady: true, reasons: [] },
        },
        {
          hostname: 'tenant.acme.test',
          workspace: null,
          readiness: {
            routeReady: false,
            reasons: ['dns-target:missing', 'certificate-status:missing'],
          },
        },
      ],
    });
    expect(result.connections).toHaveLength(1);
    expect(result.storagePolicies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'assets',
          topology: {
            workspaceScoped: true,
            activeWorkspaceSlug: 'ops',
          },
        }),
        expect.objectContaining({
          key: 'shared',
          targetRefPresent: true,
        }),
      ]),
    );
  });
});

import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationDiagnosticsService } from './integration-diagnostics.service';
import { PrismaService } from './prisma.service';

describe('IntegrationDiagnosticsService', () => {
  let service: IntegrationDiagnosticsService;
  let prisma: {
    tenant: { findUnique: jest.Mock };
    tenantPackageAssignment: { findMany: jest.Mock };
    entitlement: { findMany: jest.Mock };
  };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationDiagnosticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<IntegrationDiagnosticsService>(IntegrationDiagnosticsService);
  });

  it('should reject missing tenant slug', async () => {
    await expect(service.diagnose({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should reject unknown workspace in the requested tenant scope', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant_1',
      name: 'Acme',
      slug: 'acme',
      workspaces: [{ id: 'ws_1', slug: 'ops', name: 'Ops' }],
      integrations: [],
    });

    await expect(
      service.diagnose({
        tenantSlug: 'acme',
        workspaceSlug: 'sales',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should return empty status when connector and connection filters resolve no candidates', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant_1',
      name: 'Acme',
      slug: 'acme',
      workspaces: [{ id: 'ws_1', slug: 'ops', name: 'Ops' }],
      integrations: [
        {
          id: 'conn_1',
          name: 'N8N Main',
          slug: 'n8n-main',
          provider: 'n8n',
          status: 'PENDING',
          workspaceId: 'ws_1',
          workspace: { slug: 'ops', name: 'Ops' },
          secretsRef: null,
          config: {},
          mappingMode: 'template-first',
          mappedObjects: [],
          fieldMappings: null,
          eventMappings: null,
          syncPolicy: null,
          targetBaseUrl: null,
          lastVerifiedAt: null,
          updatedAt: new Date('2026-04-24T19:00:00.000Z'),
        },
      ],
    });
    prisma.tenantPackageAssignment.findMany.mockResolvedValue([
      {
        scopeKey: 'acme:workspace:ops',
        basePlanKey: 'core.growth',
        selectedOptions: ['nexovaflow.automation'],
        provisioningState: 'active',
        source: 'admin-ui:acme:workspace:ops',
        updatedAt: new Date('2026-04-24T19:10:00.000Z'),
      },
    ]);
    prisma.entitlement.findMany.mockResolvedValue([
      {
        key: 'feature.nexovaflow.automation',
        value: 'enabled',
        source: 'admin-ui:acme:workspace:ops',
        updatedAt: new Date('2026-04-24T19:09:00.000Z'),
      },
    ]);

    const result = await service.diagnose({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      connectionSlug: 'missing-connection',
      connectorKey: 'shopify',
    });

    expect(result).toMatchObject({
      status: 'empty',
      diagnostics: [],
    });
  });

  it('should summarize ready connection diagnostics when all checks pass', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant_1',
      name: 'Acme',
      slug: 'acme',
      workspaces: [{ id: 'ws_1', slug: 'ops', name: 'Ops' }],
      integrations: [
        {
          id: 'conn_2',
          name: 'NexovaFlow Main',
          slug: 'nexovaflow-main',
          provider: 'nexovaflow',
          status: 'ACTIVE',
          workspaceId: 'ws_1',
          workspace: { slug: 'ops', name: 'Ops' },
          secretsRef: 'tenant:nexovaflow:primary',
          config: {
            baseUrl: 'https://nexovaflow.example.com',
            _platform: {
              alertThresholds: {
                immediateFailures: 1,
                repeatedFailures: 2,
                cooldownMinutes: 20,
              },
              followUpState: {
                state: 'blocked',
              },
              healthTimeline: [
                { status: 'needs-setup', at: '2099-04-24T19:00:00.000Z' },
                { status: 'needs-setup', at: '2099-04-24T19:02:00.000Z' },
              ],
            },
          },
          mappingMode: 'template-first',
          mappedObjects: ['tasks'],
          fieldMappings: { title: 'name' },
          eventMappings: { task_created: 'workflow.task.created' },
          syncPolicy: { mode: 'bidirectional' },
          targetBaseUrl: 'https://nexovaflow.example.com',
          lastVerifiedAt: new Date('2026-04-24T19:05:00.000Z'),
          updatedAt: new Date('2026-04-24T19:06:00.000Z'),
        },
      ],
    });
    prisma.tenantPackageAssignment.findMany.mockResolvedValue([
      {
        scopeKey: 'acme:workspace:ops',
        basePlanKey: 'core.growth',
        selectedOptions: ['nexovaflow.automation'],
        provisioningState: 'active',
        source: 'admin-ui:acme:workspace:ops',
        updatedAt: new Date('2026-04-24T19:10:00.000Z'),
      },
    ]);
    prisma.entitlement.findMany.mockResolvedValue([
      {
        key: 'feature.nexovaflow.automation',
        value: 'enabled',
        source: 'admin-ui:acme:workspace:ops',
        updatedAt: new Date('2026-04-24T19:09:00.000Z'),
      },
    ]);

    const result = await service.diagnose({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      connectionSlug: 'nexovaflow-main',
    });

    expect(result).toMatchObject({
      status: 'resolved',
      diagnostics: [
        {
          operatorHealth: {
            followUpState: 'blocked',
            shouldEscalateOperator: true,
          },
          commercialization: {
            packageAssignmentScope: {
              requestedScopeKey: 'acme:workspace:ops',
              effectiveScopeKey: 'acme:workspace:ops',
              fallbackApplied: false,
            },
            provisioningState: 'active',
            provisioningUpdatedAt: new Date('2026-04-24T19:10:00.000Z'),
            provisioningRecency: 'aging',
            latestProvisioningEvent: {
              type: 'package-provisioning-state',
              state: 'active',
              at: new Date('2026-04-24T19:10:00.000Z'),
              source: 'admin-ui:acme:workspace:ops',
            },
            provisioningHistory: [
              {
                type: 'entitlement-sync-state',
                state: 'enabled',
                at: new Date('2026-04-24T19:09:00.000Z'),
                source: 'admin-ui:acme:workspace:ops',
              },
              {
                type: 'package-provisioning-state',
                state: 'active',
                at: new Date('2026-04-24T19:10:00.000Z'),
                source: 'admin-ui:acme:workspace:ops',
              },
            ],
            packageSelected: true,
            entitlementEnabled: true,
            entitlementSource: 'admin-ui:acme:workspace:ops',
            packageAssignmentSource: 'admin-ui:acme:workspace:ops',
          },
          summary: {
            readyForOperatorReview: true,
            issueCount: 0,
            state: 'ready',
          },
          recommendedActions: [],
        },
      ],
    });
  });

  it('should summarize operator health with tenant fallback commercialization history for workspace diagnostics', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant_1',
      name: 'Acme',
      slug: 'acme',
      workspaces: [{ id: 'ws_1', slug: 'ops', name: 'Ops' }],
      integrations: [
        {
          id: 'conn_3',
          name: 'NexovaFlow Fallback',
          slug: 'nexovaflow-fallback',
          provider: 'nexovaflow',
          status: 'ACTIVE',
          workspaceId: 'ws_1',
          workspace: { slug: 'ops', name: 'Ops' },
          secretsRef: 'tenant:nexovaflow:fallback',
          config: {
            baseUrl: 'https://nexovaflow.example.com',
            _platform: {
              alertThresholds: {
                immediateFailures: 1,
                repeatedFailures: 2,
                cooldownMinutes: 20,
              },
              followUpState: {
                state: 'blocked',
              },
              healthTimeline: [
                { status: 'needs-setup', at: '2099-04-24T20:00:00.000Z' },
                { status: 'needs-setup', at: '2099-04-24T20:02:00.000Z' },
              ],
            },
          },
          mappingMode: 'template-first',
          mappedObjects: ['tasks'],
          fieldMappings: { title: 'name' },
          eventMappings: { task_created: 'workflow.task.created' },
          syncPolicy: { mode: 'bidirectional' },
          targetBaseUrl: 'https://nexovaflow.example.com',
          lastVerifiedAt: new Date('2026-04-24T20:03:00.000Z'),
          updatedAt: new Date('2026-04-24T20:04:00.000Z'),
        },
      ],
    });
    prisma.tenantPackageAssignment.findMany.mockResolvedValue([
      {
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
      },
    ]);

    const result = await service.diagnose({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      connectionSlug: 'nexovaflow-fallback',
    });

    expect(result).toMatchObject({
      status: 'resolved',
      diagnostics: [
        {
          operatorHealth: {
            followUpState: 'blocked',
            shouldEscalateOperator: true,
          },
          commercialization: {
            packageAssignmentScope: {
              requestedScopeKey: 'acme:workspace:ops',
              effectiveScopeKey: 'acme:tenant:default',
              fallbackApplied: true,
            },
            provisioningState: 'pending',
            provisioningUpdatedAt: new Date('2026-04-24T20:06:00.000Z'),
            provisioningRecency: 'aging',
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
            packageSelected: true,
            entitlementEnabled: true,
            entitlementSource: 'seed:acme:tenant:default',
            packageAssignmentSource: 'seed',
          },
          summary: {
            readyForOperatorReview: true,
            issueCount: 0,
            state: 'ready',
          },
          recommendedActions: [],
        },
      ],
    });
  });
});

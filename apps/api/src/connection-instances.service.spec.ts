import { Test, TestingModule } from '@nestjs/testing';
import { MembershipRole } from '@prisma/client';
import { ConnectionInstancesService } from './connection-instances.service';
import { PrismaService } from './prisma.service';
import { AccessPolicyService } from './access-policy.service';
import { StorageRoutingPolicyService } from './storage-routing-policy.service';

describe('ConnectionInstancesService', () => {
  let service: ConnectionInstancesService;
  let prisma: {
    integrationConnection: { findFirst: jest.Mock; update: jest.Mock };
  };
  let accessPolicy: { resolveAndRequire: jest.Mock };

  beforeEach(async () => {
    prisma = {
      integrationConnection: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    accessPolicy = {
      resolveAndRequire: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionInstancesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessPolicyService, useValue: accessPolicy },
        {
          provide: StorageRoutingPolicyService,
          useValue: { requireWritePolicy: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ConnectionInstancesService>(ConnectionInstancesService);
  });

  it('should mark a connection verified when credential, endpoint, mapping, and sync policy are present', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeWorkspace: { id: 'ws_1', slug: 'ops' },
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });
    prisma.integrationConnection.findFirst.mockResolvedValue({
      id: 'conn_1',
      name: 'NexovaFlow Main',
      slug: 'nexovaflow-main',
      provider: 'nexovaflow',
      status: 'PENDING',
      secretsRef: 'tenant:nexovaflow:primary',
      targetBaseUrl: 'https://nexovaflow.example.com',
      config: { baseUrl: 'https://nexovaflow.example.com' },
      mappedObjects: ['tasks'],
      eventMappings: { task_created: 'workflow.task.created' },
      syncPolicy: { mode: 'bidirectional' },
      lastVerifiedAt: null,
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
    });
    prisma.integrationConnection.update.mockResolvedValue({
      id: 'conn_1',
      name: 'NexovaFlow Main',
      slug: 'nexovaflow-main',
      provider: 'nexovaflow',
      status: 'ACTIVE',
      lastVerifiedAt: new Date('2026-04-24T08:45:00.000Z'),
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
    });

    const result = await service.verifyConnection({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectionSlug: 'nexovaflow-main',
      verificationMode: 'operator-check',
    });

    expect(result).toMatchObject({
      status: 'verified',
      verification: {
        passed: true,
        mode: 'operator-check',
      },
    });
    expect(prisma.integrationConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('should keep the connection in needs-setup when verification checks fail', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeWorkspace: null,
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });
    prisma.integrationConnection.findFirst.mockResolvedValue({
      id: 'conn_2',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      secretsRef: null,
      targetBaseUrl: null,
      config: {},
      mappedObjects: [],
      eventMappings: null,
      syncPolicy: null,
      lastVerifiedAt: null,
      workspace: null,
    });
    prisma.integrationConnection.update.mockResolvedValue({
      id: 'conn_2',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      lastVerifiedAt: new Date('2026-04-24T08:45:00.000Z'),
      workspace: null,
    });

    const result = await service.verifyConnection({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      connectionSlug: 'n8n-draft',
      verificationMode: 'dry-run',
    });

    expect(result).toMatchObject({
      status: 'needs-setup',
      verification: {
        passed: false,
        mode: 'dry-run',
      },
    });
    expect(result.verification.checks.map((check) => check.key)).toEqual([
      'credential-reference',
      'endpoint',
      'mapping',
      'sync-policy',
    ]);
    expect(prisma.integrationConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
        }),
      }),
    );
  });

  it('should return stored connection health timeline entries', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeWorkspace: { id: 'ws_1', slug: 'ops' },
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });
    prisma.integrationConnection.findFirst.mockResolvedValue({
      id: 'conn_3',
      name: 'NexovaFlow Main',
      slug: 'nexovaflow-main',
      provider: 'nexovaflow',
      status: 'ACTIVE',
      lastVerifiedAt: new Date('2026-04-24T09:05:00.000Z'),
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
      config: {
        _platform: {
          verification: {
            checkedAt: '2026-04-24T09:05:00.000Z',
            checkedBy: 'ops@acme.test',
            mode: 'operator-check',
            passed: true,
          },
          healthTimeline: [
            {
              type: 'verification',
              status: 'needs-setup',
              at: '2026-04-24T08:55:00.000Z',
              actor: 'ops@acme.test',
            },
            {
              type: 'verification',
              status: 'verified',
              at: '2026-04-24T09:05:00.000Z',
              actor: 'ops@acme.test',
            },
          ],
        },
      },
    });

    const result = await service.getConnectionHealthTimeline({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectionSlug: 'nexovaflow-main',
    });

    expect(result).toMatchObject({
      surface: 'connection-health-timeline',
      status: 'resolved',
      latestVerification: {
        checkedBy: 'ops@acme.test',
        mode: 'operator-check',
      },
      healthSummary: {
        latestStatus: 'verified',
        repeatFailureCount: 1,
        shouldAlertOperator: false,
      },
    });
    expect(Array.isArray(result.healthTimeline)).toBe(true);
    expect(result.healthTimeline[0]).toMatchObject({
      type: 'verification',
      status: 'needs-setup',
    });
  });

  it('should append activation events into the health timeline', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeWorkspace: { id: 'ws_1', slug: 'ops' },
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });
    prisma.integrationConnection.findFirst.mockResolvedValue({
      id: 'conn_4',
      name: 'NexovaFlow Main',
      slug: 'nexovaflow-main',
      provider: 'nexovaflow',
      status: 'PENDING',
      mappingMode: 'template-first',
      mappedObjects: ['tasks'],
      fieldMappings: null,
      eventMappings: { task_created: 'workflow.task.created' },
      syncPolicy: { mode: 'bidirectional' },
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
      config: {
        _platform: {
          healthTimeline: [
            {
              type: 'verification',
              status: 'verified',
              at: '2026-04-24T09:05:00.000Z',
              actor: 'ops@acme.test',
            },
          ],
        },
      },
    });
    prisma.integrationConnection.update.mockResolvedValue({
      id: 'conn_4',
      name: 'NexovaFlow Main',
      slug: 'nexovaflow-main',
      provider: 'nexovaflow',
      status: 'ACTIVE',
      lastVerifiedAt: new Date('2026-04-24T09:10:00.000Z'),
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
    });

    const result = await service.activateConnection({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectionSlug: 'nexovaflow-main',
      reviewSummary: 'Looks good.',
      activationMode: 'verified-ready',
    });

    expect(result).toMatchObject({
      status: 'activated',
      review: {
        activationMode: 'verified-ready',
      },
    });
    expect(prisma.integrationConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({
            _platform: expect.objectContaining({
              healthTimeline: expect.arrayContaining([
                expect.objectContaining({
                  type: 'activation',
                  status: 'active',
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });
});

import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipRole } from '@prisma/client';
import { ConnectionInstancesService } from './connection-instances.service';
import { PrismaService } from './prisma.service';
import { AccessPolicyService } from './access-policy.service';
import { StorageRoutingPolicyService } from './storage-routing-policy.service';

describe('ConnectionInstancesService', () => {
  let service: ConnectionInstancesService;
  let prisma: {
    integrationConnection: {
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    tenant: { findUnique: jest.Mock };
  };
  let accessPolicy: { resolveAndRequire: jest.Mock };
  let storageRoutingPolicy: { requireWritePolicy: jest.Mock };

  beforeEach(async () => {
    prisma = {
      integrationConnection: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
      },
    };

    accessPolicy = {
      resolveAndRequire: jest.fn(),
    };

    storageRoutingPolicy = {
      requireWritePolicy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionInstancesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessPolicyService, useValue: accessPolicy },
        { provide: StorageRoutingPolicyService, useValue: storageRoutingPolicy },
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

  it('should reject connection creation when the requested workspace does not belong to the tenant', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeWorkspace: null,
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant_1',
      slug: 'acme',
      workspaces: [{ id: 'ws_1', slug: 'ops' }],
    });

    await expect(
      service.createConnection({
        tenantSlug: 'acme',
        workspaceSlug: 'sales',
        userEmail: 'ops@acme.test',
        connectorKey: 'n8n',
        name: 'Sales Bridge',
        slug: 'sales-bridge',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should enforce storage write policy during connection creation when storage policy is declared', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeWorkspace: { id: 'ws_1', slug: 'ops' },
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });
    storageRoutingPolicy.requireWritePolicy.mockResolvedValue({
      policyKey: 'configs',
      storageTopology: {
        rootPrefix: 'tenants/acme/workspaces/ops/storage/configs',
        ownershipScope: 'workspace',
        workspaceSlug: 'ops',
      },
      writeGuardrail: {
        mode: 'PLATFORM_MANAGED',
        enforcedWritePath:
          'tenants/acme/workspaces/ops/storage/configs/n8n-main/connection-config',
      },
    });
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant_1',
      slug: 'acme',
      workspaces: [{ id: 'ws_1', slug: 'ops' }],
    });
    prisma.integrationConnection.create.mockResolvedValue({
      id: 'conn_create_1',
      name: 'N8N Main',
      slug: 'n8n-main',
      provider: 'n8n',
      category: 'COMMUNICATION',
      status: 'PENDING',
      secretsRef: null,
      mappingMode: 'template-first',
      mappedObjects: [],
      fieldMappings: null,
      eventMappings: null,
      syncPolicy: null,
      createdAt: new Date('2026-04-24T19:30:00.000Z'),
    });

    await service.createConnection({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectorKey: 'n8n',
      name: 'N8N Main',
      slug: 'n8n-main',
      storagePolicyKey: 'configs',
    });

    expect(storageRoutingPolicy.requireWritePolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        policyKey: 'configs',
        writePath: 'n8n-main/connection-config',
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
        recoveryStreak: 1,
        shouldAlertOperator: false,
        cooldown: {
          active: false,
        },
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

  it('should reject activation when the target connection does not exist', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeWorkspace: { id: 'ws_1', slug: 'ops' },
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });
    prisma.integrationConnection.findFirst.mockResolvedValue(null);

    await expect(
      service.activateConnection({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        userEmail: 'ops@acme.test',
        connectionSlug: 'missing-connection',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should expose cooldown and recovery streak after repeated failures', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeWorkspace: { id: 'ws_1', slug: 'ops' },
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });
    prisma.integrationConnection.findFirst.mockResolvedValue({
      id: 'conn_5',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      lastVerifiedAt: new Date('2026-04-24T10:05:00.000Z'),
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
      config: {
        _platform: {
          healthTimeline: [
            {
              type: 'verification',
              status: 'needs-setup',
              at: '2099-04-24T10:00:00.000Z',
              actor: 'ops@acme.test',
            },
            {
              type: 'verification',
              status: 'needs-setup',
              at: '2099-04-24T10:05:00.000Z',
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
      connectionSlug: 'n8n-draft',
    });

    expect(result.healthSummary).toMatchObject({
      latestStatus: 'needs-setup',
      repeatFailureCount: 2,
      recoveryStreak: 0,
      shouldAlertOperator: true,
      cooldown: {
        active: true,
        reason: 'recent-verification-failure',
      },
    });
  });

  it('should append acknowledgement events into the health timeline', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeWorkspace: { id: 'ws_1', slug: 'ops' },
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });
    prisma.integrationConnection.findFirst.mockResolvedValue({
      id: 'conn_6',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
      config: {
        _platform: {
          healthTimeline: [
            {
              type: 'verification',
              status: 'needs-setup',
              at: '2026-04-24T17:35:00.000Z',
              actor: 'ops@acme.test',
            },
          ],
        },
      },
    });
    prisma.integrationConnection.update.mockResolvedValue({
      id: 'conn_6',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
    });

    const result = await service.acknowledgeHealthAlert({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectionSlug: 'n8n-draft',
      note: 'Seen by operator.',
    });

    expect(result).toMatchObject({
      surface: 'connection-health-acknowledgement',
      status: 'acknowledged',
      acknowledgement: {
        acknowledgedBy: 'ops@acme.test',
        note: 'Seen by operator.',
      },
    });
    expect(prisma.integrationConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({
            _platform: expect.objectContaining({
              healthTimeline: expect.arrayContaining([
                expect.objectContaining({
                  type: 'acknowledgement',
                  status: 'acknowledged',
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it('should suppress operator alerts when an active suppression window exists', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeWorkspace: { id: 'ws_1', slug: 'ops' },
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });
    prisma.integrationConnection.findFirst.mockResolvedValueOnce({
      id: 'conn_7',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
      config: {
        _platform: {
          healthTimeline: [
            {
              type: 'verification',
              status: 'needs-setup',
              at: '2026-04-24T17:35:00.000Z',
              actor: 'ops@acme.test',
            },
          ],
        },
      },
    });
    prisma.integrationConnection.update.mockResolvedValue({
      id: 'conn_7',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
    });

    const suppressionResult = await service.suppressHealthAlert({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectionSlug: 'n8n-draft',
      note: 'Suppress during vendor maintenance.',
      durationMinutes: 30,
    });

    expect(suppressionResult).toMatchObject({
      surface: 'connection-health-suppression',
      status: 'suppressed',
      suppression: {
        active: true,
        suppressedBy: 'ops@acme.test',
        note: 'Suppress during vendor maintenance.',
        durationMinutes: 30,
      },
    });

    prisma.integrationConnection.findFirst.mockResolvedValueOnce({
      id: 'conn_7',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      lastVerifiedAt: new Date('2026-04-24T10:05:00.000Z'),
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
      config: {
        _platform: {
          alertSuppression: {
            active: true,
            suppressedAt: '2099-04-24T17:40:00.000Z',
            suppressedUntil: '2099-04-24T18:10:00.000Z',
            suppressedBy: 'ops@acme.test',
            note: 'Suppress during vendor maintenance.',
          },
          healthTimeline: [
            {
              type: 'verification',
              status: 'needs-setup',
              at: '2099-04-24T17:35:00.000Z',
              actor: 'ops@acme.test',
            },
          ],
        },
      },
    });

    const timelineResult = await service.getConnectionHealthTimeline({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectionSlug: 'n8n-draft',
    });

    expect(timelineResult.healthSummary).toMatchObject({
      latestStatus: 'needs-setup',
      suppression: {
        active: true,
        suppressedBy: 'ops@acme.test',
        note: 'Suppress during vendor maintenance.',
      },
      shouldAlertOperator: false,
    });
  });

  it('should unsuppress operator alerts and append an unsuppressed timeline event', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeWorkspace: { id: 'ws_1', slug: 'ops' },
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });
    prisma.integrationConnection.findFirst.mockResolvedValueOnce({
      id: 'conn_8',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
      config: {
        _platform: {
          alertSuppression: {
            active: true,
            suppressedAt: '2099-04-24T17:40:00.000Z',
            suppressedUntil: '2099-04-24T18:10:00.000Z',
            suppressedBy: 'ops@acme.test',
            note: 'Suppress during vendor maintenance.',
          },
          healthTimeline: [
            {
              type: 'suppression',
              status: 'suppressed',
              at: '2099-04-24T17:40:00.000Z',
              actor: 'ops@acme.test',
            },
          ],
        },
      },
    });
    prisma.integrationConnection.update.mockResolvedValue({
      id: 'conn_8',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
    });

    const unsuppressResult = await service.unsuppressHealthAlert({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectionSlug: 'n8n-draft',
      note: 'Maintenance window ended.',
    });

    expect(unsuppressResult).toMatchObject({
      surface: 'connection-health-unsuppression',
      status: 'unsuppressed',
      suppression: {
        active: false,
        liftedBy: 'ops@acme.test',
        note: 'Maintenance window ended.',
      },
    });
    expect(prisma.integrationConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({
            _platform: expect.objectContaining({
              healthTimeline: expect.arrayContaining([
                expect.objectContaining({
                  type: 'suppression',
                  status: 'unsuppressed',
                }),
              ]),
            }),
          }),
        }),
      }),
    );

    prisma.integrationConnection.findFirst.mockResolvedValueOnce({
      id: 'conn_8',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      lastVerifiedAt: new Date('2026-04-24T10:05:00.000Z'),
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
      config: {
        _platform: {
          alertSuppression: {
            active: false,
            suppressedAt: '2099-04-24T17:40:00.000Z',
            suppressedUntil: null,
            suppressedBy: null,
            note: null,
            liftedAt: '2099-04-24T17:50:00.000Z',
            liftedBy: 'ops@acme.test',
            liftNote: 'Maintenance window ended.',
          },
          healthTimeline: [
            {
              type: 'verification',
              status: 'needs-setup',
              at: '2099-04-24T17:35:00.000Z',
              actor: 'ops@acme.test',
            },
          ],
        },
      },
    });

    const timelineResult = await service.getConnectionHealthTimeline({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectionSlug: 'n8n-draft',
    });

    expect(timelineResult.healthSummary).toMatchObject({
      latestStatus: 'needs-setup',
      suppression: {
        active: false,
      },
      shouldAlertOperator: true,
    });
  });

  it('should record a recovery note and expose it in the health summary', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeWorkspace: { id: 'ws_1', slug: 'ops' },
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });
    prisma.integrationConnection.findFirst.mockResolvedValueOnce({
      id: 'conn_9',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'ACTIVE',
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
      config: {
        _platform: {
          healthTimeline: [
            {
              type: 'verification',
              status: 'verified',
              at: '2099-04-24T18:05:00.000Z',
              actor: 'ops@acme.test',
            },
          ],
        },
      },
    });
    prisma.integrationConnection.update.mockResolvedValue({
      id: 'conn_9',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'ACTIVE',
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
    });

    const noteResult = await service.addRecoveryNote({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectionSlug: 'n8n-draft',
      note: 'Recovered after connector credential rotation.',
    });

    expect(noteResult).toMatchObject({
      surface: 'connection-health-recovery-note',
      status: 'recovery-noted',
      recoveryNote: {
        note: 'Recovered after connector credential rotation.',
        recordedBy: 'ops@acme.test',
      },
    });
    expect(prisma.integrationConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({
            _platform: expect.objectContaining({
              healthTimeline: expect.arrayContaining([
                expect.objectContaining({
                  type: 'recovery-note',
                  status: 'recovery-noted',
                }),
              ]),
            }),
          }),
        }),
      }),
    );

    prisma.integrationConnection.findFirst.mockResolvedValueOnce({
      id: 'conn_9',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'ACTIVE',
      lastVerifiedAt: new Date('2026-04-24T18:05:00.000Z'),
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
      config: {
        _platform: {
          recoveryNote: {
            note: 'Recovered after connector credential rotation.',
            recordedAt: '2099-04-24T18:08:00.000Z',
            recordedBy: 'ops@acme.test',
          },
          healthTimeline: [
            {
              type: 'verification',
              status: 'verified',
              at: '2099-04-24T18:05:00.000Z',
              actor: 'ops@acme.test',
            },
            {
              type: 'recovery-note',
              status: 'recovery-noted',
              at: '2099-04-24T18:08:00.000Z',
              actor: 'ops@acme.test',
              detail: {
                note: 'Recovered after connector credential rotation.',
              },
            },
          ],
        },
      },
    });

    const timelineResult = await service.getConnectionHealthTimeline({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectionSlug: 'n8n-draft',
    });

    expect(timelineResult.healthSummary).toMatchObject({
      latestStatus: 'recovery-noted',
      recoveryNote: {
        note: 'Recovered after connector credential rotation.',
        recordedBy: 'ops@acme.test',
      },
    });
  });

  it('should assign follow-up ownership and expose it in the health summary', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeWorkspace: { id: 'ws_1', slug: 'ops' },
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });
    prisma.integrationConnection.findFirst.mockResolvedValueOnce({
      id: 'conn_10',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
      config: {
        _platform: {
          healthTimeline: [
            {
              type: 'verification',
              status: 'needs-setup',
              at: '2099-04-24T18:20:00.000Z',
              actor: 'ops@acme.test',
            },
          ],
        },
      },
    });
    prisma.integrationConnection.update.mockResolvedValue({
      id: 'conn_10',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
    });

    const assignmentResult = await service.assignHealthFollowUp({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectionSlug: 'n8n-draft',
      assigneeEmail: 'sre@acme.test',
      note: 'Please inspect webhook retries.',
    });

    expect(assignmentResult).toMatchObject({
      surface: 'connection-health-follow-up-assignment',
      status: 'follow-up-assigned',
      followUpAssignment: {
        assigneeEmail: 'sre@acme.test',
        assignedBy: 'ops@acme.test',
        note: 'Please inspect webhook retries.',
      },
    });
    expect(prisma.integrationConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({
            _platform: expect.objectContaining({
              healthTimeline: expect.arrayContaining([
                expect.objectContaining({
                  type: 'follow-up-assignment',
                  status: 'follow-up-assigned',
                }),
              ]),
            }),
          }),
        }),
      }),
    );

    prisma.integrationConnection.findFirst.mockResolvedValueOnce({
      id: 'conn_10',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      lastVerifiedAt: new Date('2026-04-24T18:20:00.000Z'),
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
      config: {
        _platform: {
          followUpAssignment: {
            assigneeEmail: 'sre@acme.test',
            assignedAt: '2099-04-24T18:25:00.000Z',
            assignedBy: 'ops@acme.test',
            note: 'Please inspect webhook retries.',
          },
          healthTimeline: [
            {
              type: 'verification',
              status: 'needs-setup',
              at: '2099-04-24T18:20:00.000Z',
              actor: 'ops@acme.test',
            },
            {
              type: 'follow-up-assignment',
              status: 'follow-up-assigned',
              at: '2099-04-24T18:25:00.000Z',
              actor: 'ops@acme.test',
              detail: {
                assigneeEmail: 'sre@acme.test',
                note: 'Please inspect webhook retries.',
              },
            },
          ],
        },
      },
    });

    const timelineResult = await service.getConnectionHealthTimeline({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectionSlug: 'n8n-draft',
    });

    expect(timelineResult.healthSummary).toMatchObject({
      latestStatus: 'follow-up-assigned',
      followUpAssignment: {
        assigneeEmail: 'sre@acme.test',
        assignedBy: 'ops@acme.test',
        note: 'Please inspect webhook retries.',
      },
    });
  });

  it('should record follow-up notification metadata and expose it in the health summary', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        user: { id: 'user_1', email: 'ops@acme.test' },
        activeWorkspace: { id: 'ws_1', slug: 'ops' },
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });
    prisma.integrationConnection.findFirst.mockResolvedValueOnce({
      id: 'conn_11',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
      config: {
        _platform: {
          healthTimeline: [
            {
              type: 'follow-up-assignment',
              status: 'follow-up-assigned',
              at: '2099-04-24T18:25:00.000Z',
              actor: 'ops@acme.test',
            },
          ],
        },
      },
    });
    prisma.integrationConnection.update.mockResolvedValue({
      id: 'conn_11',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
    });

    const notificationResult = await service.recordFollowUpNotification({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectionSlug: 'n8n-draft',
      channel: 'telegram',
      recipient: '@sre-acme',
      note: 'Pinged on-call.',
    });

    expect(notificationResult).toMatchObject({
      surface: 'connection-health-follow-up-notification',
      status: 'follow-up-notified',
      followUpNotification: {
        channel: 'telegram',
        recipient: '@sre-acme',
        notifiedBy: 'ops@acme.test',
        note: 'Pinged on-call.',
      },
    });
    expect(prisma.integrationConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({
            _platform: expect.objectContaining({
              healthTimeline: expect.arrayContaining([
                expect.objectContaining({
                  type: 'follow-up-notification',
                  status: 'follow-up-notified',
                }),
              ]),
            }),
          }),
        }),
      }),
    );

    prisma.integrationConnection.findFirst.mockResolvedValueOnce({
      id: 'conn_11',
      name: 'N8N Draft',
      slug: 'n8n-draft',
      provider: 'n8n',
      status: 'PENDING',
      lastVerifiedAt: new Date('2026-04-24T18:25:00.000Z'),
      workspace: { id: 'ws_1', slug: 'ops', name: 'Ops' },
      config: {
        _platform: {
          followUpNotification: {
            channel: 'telegram',
            recipient: '@sre-acme',
            notifiedAt: '2099-04-24T18:27:00.000Z',
            notifiedBy: 'ops@acme.test',
            note: 'Pinged on-call.',
          },
          healthTimeline: [
            {
              type: 'follow-up-assignment',
              status: 'follow-up-assigned',
              at: '2099-04-24T18:25:00.000Z',
              actor: 'ops@acme.test',
            },
            {
              type: 'follow-up-notification',
              status: 'follow-up-notified',
              at: '2099-04-24T18:27:00.000Z',
              actor: 'ops@acme.test',
              detail: {
                channel: 'telegram',
                recipient: '@sre-acme',
                note: 'Pinged on-call.',
              },
            },
          ],
        },
      },
    });

    const timelineResult = await service.getConnectionHealthTimeline({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectionSlug: 'n8n-draft',
    });

    expect(timelineResult.healthSummary).toMatchObject({
      latestStatus: 'follow-up-notified',
      followUpNotification: {
        channel: 'telegram',
        recipient: '@sre-acme',
        notifiedBy: 'ops@acme.test',
        note: 'Pinged on-call.',
      },
    });
  });
});

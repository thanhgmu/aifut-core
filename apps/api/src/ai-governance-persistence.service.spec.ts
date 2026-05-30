import { BadRequestException } from '@nestjs/common';
import { AiGovernancePersistenceService } from './ai-governance-persistence.service';

describe('AiGovernancePersistenceService', () => {
  let service: AiGovernancePersistenceService;

  beforeEach(() => {
    service = new AiGovernancePersistenceService();
  });

  it('should build a workspace-scoped routing policy record with normalized defaults', () => {
    const result = service.buildRoutingPolicyRecord({
      tenantSlug: ' Acme ',
      workspaceSlug: ' Ops ',
      featureKey: ' WorkflowBuilder ',
      taskType: ' Draft-Generation ',
      defaultLane: 'cheap-model',
      maxLane: 'premium-model',
      allowByoKeys: true,
      preferredCredentialMode: 'byo',
      source: ' Admin-UI ',
    });

    expect(result).toEqual({
      policyKey: 'acme:workspace:ops:feature:workflowbuilder:task:draft-generation',
      scope: {
        scopeKey: 'acme:workspace:ops',
        scopeType: 'workspace',
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
      featureKey: 'workflowbuilder',
      taskType: 'draft-generation',
      routing: {
        defaultLane: 'cheap-model',
        maxLane: 'premium-model',
        deterministicFirst: true,
        cacheEnabled: true,
        preferredCredentialMode: 'byo',
        allowByoKeys: true,
        downgradeAtQuotaPressure: 'near-limit',
        requireApprovalAboveLane: 'balanced-model',
      },
      source: 'admin-ui',
    });
  });

  it('should reject routing policies whose max lane is lower than the default lane', () => {
    expect(() =>
      service.buildRoutingPolicyRecord({
        tenantSlug: 'acme',
        defaultLane: 'premium-model',
        maxLane: 'cheap-model',
      }),
    ).toThrow(BadRequestException);
  });

  it('should build a tenant-scoped budget policy record with normalized ceilings', () => {
    const result = service.buildBudgetPolicyRecord({
      tenantSlug: 'Acme',
      featureKey: 'OperatorControlPlane',
      monthlyTokenBudget: 10000.8,
      hardMonthlyTokenLimit: 25000.2,
      premiumExecutionCap: 120.9,
      requireApprovalAtProjectedCost: 9.5,
    });

    expect(result).toEqual({
      policyKey: 'acme:tenant:default:feature:operatorcontrolplane:budget',
      scope: {
        scopeKey: 'acme:tenant:default',
        scopeType: 'tenant',
        tenantSlug: 'acme',
        workspaceSlug: null,
      },
      featureKey: 'operatorcontrolplane',
      budget: {
        monthlyTokenBudget: 10000,
        hardMonthlyTokenLimit: 25000,
        premiumExecutionCap: 120,
        blockOnHardLimit: true,
        requireApprovalAtProjectedCost: 9.5,
      },
      source: 'aifut-budget',
    });
  });

  it('should reject budget policies whose hard limit is lower than the monthly budget', () => {
    expect(() =>
      service.buildBudgetPolicyRecord({
        tenantSlug: 'acme',
        monthlyTokenBudget: 10000,
        hardMonthlyTokenLimit: 5000,
      }),
    ).toThrow('AI hard monthly token limit cannot be lower than monthly token budget.');
  });

  it('should build usage event records with normalized totals and defaults', () => {
    const occurredAt = new Date('2026-05-30T12:10:00.000Z');

    const result = service.buildUsageEventRecord({
      tenantSlug: 'Acme',
      workspaceSlug: 'Ops',
      actorKey: 'user_1',
      featureKey: 'WorkflowBuilder',
      taskType: 'Draft-Generation',
      providerKey: 'OpenAI',
      modelKey: 'GPT-5.4',
      credentialMode: 'aifut-managed',
      executionLane: 'balanced-model',
      inputTokens: 1200,
      outputTokens: 300,
      estimatedCost: 0.11,
      actualCost: 0.12,
      cacheHit: false,
      retryCount: 1,
      escalationCount: 0,
      status: 'success',
      source: 'Ai-Gateway',
      occurredAt,
    });

    expect(result).toEqual({
      eventKey:
        'ai-usage:acme:workspace:ops:workflowbuilder:draft-generation:user_1:2026-05-30T12:10:00.000Z',
      scope: {
        scopeKey: 'acme:workspace:ops',
        scopeType: 'workspace',
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
      actorKey: 'user_1',
      featureKey: 'workflowbuilder',
      taskType: 'draft-generation',
      providerKey: 'openai',
      modelKey: 'gpt-5.4',
      credentialMode: 'aifut-managed',
      executionLane: 'balanced-model',
      usage: {
        inputTokens: 1200,
        outputTokens: 300,
        totalTokens: 1500,
        estimatedCost: 0.11,
        actualCost: 0.12,
        cacheHit: false,
        retryCount: 1,
        escalationCount: 0,
      },
      status: 'success',
      source: 'ai-gateway',
      occurredAt,
    });
  });

  it('should persist routing policies through an upsert-ready Prisma payload', async () => {
    const prisma = {
      aiRoutingPolicy: {
        upsert: jest.fn().mockResolvedValue({ policyKey: 'policy_1' }),
      },
    };
    service = new AiGovernancePersistenceService(prisma as never);

    await expect(
      service.persistRoutingPolicyRecord({
        tenantSlug: 'Acme',
        workspaceSlug: 'Ops',
        featureKey: 'WorkflowBuilder',
        taskType: 'Draft',
        maxLane: 'premium-model',
      }),
    ).resolves.toEqual({ policyKey: 'policy_1' });

    expect(prisma.aiRoutingPolicy.upsert).toHaveBeenCalledWith({
      where: {
        policyKey: 'acme:workspace:ops:feature:workflowbuilder:task:draft',
      },
      update: expect.objectContaining({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        featureKey: 'workflowbuilder',
        taskType: 'draft',
        defaultLane: 'cheap-model',
        maxLane: 'premium-model',
      }),
      create: expect.objectContaining({
        policyKey: 'acme:workspace:ops:feature:workflowbuilder:task:draft',
        preferredCredentialMode: 'aifut-managed',
      }),
    });
  });

  it('should persist budget policies through an upsert-ready Prisma payload', async () => {
    const prisma = {
      aiBudgetPolicy: {
        upsert: jest.fn().mockResolvedValue({ policyKey: 'budget_1' }),
      },
    };
    service = new AiGovernancePersistenceService(prisma as never);

    await expect(
      service.persistBudgetPolicyRecord({
        tenantSlug: 'Acme',
        featureKey: 'WorkflowBuilder',
        monthlyTokenBudget: 1500,
        hardMonthlyTokenLimit: 2000,
      }),
    ).resolves.toEqual({ policyKey: 'budget_1' });

    expect(prisma.aiBudgetPolicy.upsert).toHaveBeenCalledWith({
      where: {
        policyKey: 'acme:tenant:default:feature:workflowbuilder:budget',
      },
      update: expect.objectContaining({
        tenantSlug: 'acme',
        workspaceSlug: null,
        featureKey: 'workflowbuilder',
        monthlyTokenBudget: 1500,
        hardMonthlyTokenLimit: 2000,
      }),
      create: expect.objectContaining({
        policyKey: 'acme:tenant:default:feature:workflowbuilder:budget',
        blockOnHardLimit: true,
      }),
    });
  });

  it('should persist usage events as append-only ledger create payloads', async () => {
    const occurredAt = new Date('2026-05-30T12:30:00.000Z');
    const prisma = {
      aiUsageEvent: {
        create: jest.fn().mockResolvedValue({ eventKey: 'event_1' }),
      },
    };
    service = new AiGovernancePersistenceService(prisma as never);

    await expect(
      service.persistUsageEventRecord({
        tenantSlug: 'Acme',
        workspaceSlug: 'Ops',
        actorKey: 'User_1',
        featureKey: 'WorkflowBuilder',
        taskType: 'Draft',
        inputTokens: 10,
        outputTokens: 5,
        occurredAt,
      }),
    ).resolves.toEqual({ eventKey: 'event_1' });

    expect(prisma.aiUsageEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventKey:
          'ai-usage:acme:workspace:ops:workflowbuilder:draft:user_1:2026-05-30T12:30:00.000Z',
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        actorKey: 'user_1',
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        occurredAt,
      }),
    });
  });

  it('should resolve workspace routing policy before tenant fallback', async () => {
    const prisma = {
      aiRoutingPolicy: {
        findFirst: jest.fn().mockResolvedValueOnce({
          tenantSlug: 'acme',
          workspaceSlug: 'ops',
          featureKey: 'workflowbuilder',
          taskType: 'draft',
          defaultLane: 'balanced-model',
          maxLane: 'premium-model',
          preferredCredentialMode: 'byo',
          allowByoKeys: true,
          requireApprovalAboveLane: 'balanced-model',
          downgradeAtQuotaPressure: 'near-limit',
          cacheEnabled: true,
          deterministicFirst: true,
          source: 'workspace-policy',
        }),
      },
    };
    service = new AiGovernancePersistenceService(prisma as never);

    await expect(
      service.resolveEffectiveRoutingPolicy({
        tenantSlug: 'Acme',
        workspaceSlug: 'Ops',
        featureKey: 'WorkflowBuilder',
        taskType: 'Draft',
      }),
    ).resolves.toMatchObject({
      policyKey: 'acme:workspace:ops:feature:workflowbuilder:task:draft',
      routing: {
        defaultLane: 'balanced-model',
        maxLane: 'premium-model',
        preferredCredentialMode: 'byo',
      },
      source: 'workspace-policy',
    });

    expect(prisma.aiRoutingPolicy.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.aiRoutingPolicy.findFirst).toHaveBeenCalledWith({
      where: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        featureKey: 'workflowbuilder',
        taskType: 'draft',
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  });

  it('should block gateway decisions that reach a hard monthly budget limit', async () => {
    const occurredAt = new Date('2026-05-30T12:00:00.000Z');
    const prisma = {
      aiRoutingPolicy: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      aiBudgetPolicy: {
        findFirst: jest.fn().mockResolvedValueOnce({
          tenantSlug: 'acme',
          workspaceSlug: null,
          featureKey: 'workflowbuilder',
          monthlyTokenBudget: 800,
          hardMonthlyTokenLimit: 1000,
          premiumExecutionCap: 0,
          blockOnHardLimit: true,
          requireApprovalAtProjectedCost: 0,
          source: 'tenant-budget',
        }),
      },
      aiUsageEvent: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            totalTokens: 900,
            actualCost: 0.1,
            estimatedCost: 0.1,
          },
        }),
      },
    };
    service = new AiGovernancePersistenceService(prisma as never);

    await expect(
      service.buildGatewayDecision({
        tenantSlug: 'Acme',
        featureKey: 'WorkflowBuilder',
        taskType: 'Draft',
        projectedTokens: 100,
        occurredAt,
      }),
    ).resolves.toMatchObject({
      selectedLane: null,
      quotaPressure: 'hard-limit',
      requiresApproval: false,
      blockReason: 'Projected AI token usage reaches hard monthly limit of 1000.',
      usageWindow: {
        usedTokens: 900,
        projectedTokens: 100,
        projectedMonthlyTokens: 1000,
      },
    });
  });

  it('should downgrade gateway lane under configured near-limit pressure', async () => {
    const occurredAt = new Date('2026-05-30T12:00:00.000Z');
    const prisma = {
      aiRoutingPolicy: {
        findFirst: jest.fn().mockResolvedValueOnce({
          tenantSlug: 'acme',
          workspaceSlug: null,
          featureKey: 'workflowbuilder',
          taskType: 'draft',
          defaultLane: 'premium-model',
          maxLane: 'premium-model',
          preferredCredentialMode: 'aifut-managed',
          allowByoKeys: false,
          requireApprovalAboveLane: 'balanced-model',
          downgradeAtQuotaPressure: 'near-limit',
          cacheEnabled: true,
          deterministicFirst: true,
          source: 'tenant-policy',
        }),
      },
      aiBudgetPolicy: {
        findFirst: jest.fn().mockResolvedValueOnce({
          tenantSlug: 'acme',
          workspaceSlug: null,
          featureKey: 'workflowbuilder',
          monthlyTokenBudget: 1000,
          hardMonthlyTokenLimit: 2000,
          premiumExecutionCap: 0,
          blockOnHardLimit: true,
          requireApprovalAtProjectedCost: 0,
          source: 'tenant-budget',
        }),
      },
      aiUsageEvent: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            totalTokens: 800,
            actualCost: 0.1,
            estimatedCost: 0.1,
          },
        }),
      },
    };
    service = new AiGovernancePersistenceService(prisma as never);

    await expect(
      service.buildGatewayDecision({
        tenantSlug: 'Acme',
        featureKey: 'WorkflowBuilder',
        taskType: 'Draft',
        requestedLane: 'premium-model',
        projectedTokens: 50,
        occurredAt,
      }),
    ).resolves.toMatchObject({
      requestedLane: 'premium-model',
      selectedLane: 'balanced-model',
      quotaPressure: 'near-limit',
      requiresApproval: false,
      downgradeReason:
        'Quota pressure near-limit downgraded lane from premium-model to balanced-model.',
    });
  });

  it('should summarize usage ledger totals and recent events for operator visibility', async () => {
    const occurredFrom = new Date('2026-05-01T00:00:00.000Z');
    const occurredTo = new Date('2026-05-31T23:59:59.000Z');
    const prisma = {
      aiUsageEvent: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            totalTokens: 2400,
            actualCost: 0.21,
            estimatedCost: 0.24,
          },
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            eventKey: 'event-1',
            actorKey: 'ops@acme.test',
            providerKey: 'openai',
            modelKey: 'gpt-lean',
            credentialMode: 'aifut-managed',
            executionLane: 'cheap-model',
            totalTokens: 1200,
            actualCost: 0.1,
            estimatedCost: 0.12,
            status: 'success',
            source: 'orchestration-dispatch-run',
            occurredAt: new Date('2026-05-30T12:00:00.000Z'),
          },
        ]),
      },
    };
    service = new AiGovernancePersistenceService(prisma as never);

    await expect(
      service.summarizeUsageLedger({
        tenantSlug: 'Acme',
        workspaceSlug: 'Ops',
        featureKey: 'Orchestration-Runtime',
        taskType: 'Dispatch-Run',
        occurredFrom,
        occurredTo,
        take: 5,
      }),
    ).resolves.toMatchObject({
      scope: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
      featureKey: 'orchestration-runtime',
      taskType: 'dispatch-run',
      totals: {
        totalTokens: 2400,
        actualCost: 0.21,
        estimatedCost: 0.24,
        effectiveCost: 0.21,
      },
      filters: {
        occurredFrom,
        occurredTo,
        take: 5,
      },
      recentEvents: [
        {
          eventKey: 'event-1',
          actorKey: 'ops@acme.test',
          executionLane: 'cheap-model',
          totalTokens: 1200,
          status: 'success',
          source: 'orchestration-dispatch-run',
        },
      ],
    });
    expect(prisma.aiUsageEvent.aggregate).toHaveBeenCalledWith({
      where: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        featureKey: 'orchestration-runtime',
        taskType: 'dispatch-run',
        occurredAt: {
          gte: occurredFrom,
          lte: occurredTo,
        },
      },
      _sum: {
        totalTokens: true,
        actualCost: true,
        estimatedCost: true,
      },
    });
    expect(prisma.aiUsageEvent.findMany).toHaveBeenCalledWith({
      where: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        featureKey: 'orchestration-runtime',
        taskType: 'dispatch-run',
        occurredAt: {
          gte: occurredFrom,
          lte: occurredTo,
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 5,
    });
  });
});

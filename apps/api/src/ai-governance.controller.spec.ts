import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AiGovernanceController } from './ai-governance.controller';
import { AiGovernancePersistenceService } from './ai-governance-persistence.service';
import { AccessPolicyService } from './access-policy.service';

describe('AiGovernanceController', () => {
  let controller: AiGovernanceController;
  let governancePersistence: {
    persistRoutingPolicyRecord: jest.Mock;
    persistBudgetPolicyRecord: jest.Mock;
    buildGatewayDecision: jest.Mock;
    persistUsageEventRecord: jest.Mock;
    summarizeUsageLedger: jest.Mock;
  };

  beforeEach(async () => {
    governancePersistence = {
      persistRoutingPolicyRecord: jest.fn(),
      persistBudgetPolicyRecord: jest.fn(),
      buildGatewayDecision: jest.fn(),
      persistUsageEventRecord: jest.fn(),
      summarizeUsageLedger: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiGovernanceController],
      providers: [
        {
          provide: AiGovernancePersistenceService,
          useValue: governancePersistence,
        },
        {
          provide: AccessPolicyService,
          useValue: {
            resolveAndRequire: jest.fn(),
          },
        },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AiGovernanceController>(AiGovernanceController);
  });

  it('should upsert admin-scoped routing policies with header scope precedence', async () => {
    governancePersistence.persistRoutingPolicyRecord.mockResolvedValue({
      policyKey: 'acme:workspace:ops:feature:workflowbuilder:task:draft',
    });

    const result = await controller.upsertRoutingPolicy(
      {
        tenantSlug: 'body-tenant',
        workspaceSlug: 'body-workspace',
        featureKey: 'WorkflowBuilder',
        taskType: 'Draft',
        defaultLane: 'cheap-model',
        maxLane: 'balanced-model',
        allowByoKeys: true,
        preferredCredentialMode: 'byo',
      },
      'acme',
      'ops',
    );

    expect(governancePersistence.persistRoutingPolicyRecord).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      featureKey: 'WorkflowBuilder',
      taskType: 'Draft',
      defaultLane: 'cheap-model',
      maxLane: 'balanced-model',
      allowByoKeys: true,
      preferredCredentialMode: 'byo',
    });
    expect(result).toMatchObject({
      capability: 'ai-governance',
      status: 'routing-policy-upserted',
      policy: {
        policyKey: 'acme:workspace:ops:feature:workflowbuilder:task:draft',
      },
    });
  });

  it('should upsert admin-scoped budget policies with header scope precedence', async () => {
    governancePersistence.persistBudgetPolicyRecord.mockResolvedValue({
      policyKey: 'acme:tenant:default:feature:workflowbuilder:budget',
    });

    const result = await controller.upsertBudgetPolicy(
      {
        tenantSlug: 'body-tenant',
        workspaceSlug: null,
        featureKey: 'WorkflowBuilder',
        monthlyTokenBudget: 100000,
        hardMonthlyTokenLimit: 120000,
        requireApprovalAtProjectedCost: 25,
      },
      'acme',
    );

    expect(governancePersistence.persistBudgetPolicyRecord).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: null,
      featureKey: 'WorkflowBuilder',
      monthlyTokenBudget: 100000,
      hardMonthlyTokenLimit: 120000,
      requireApprovalAtProjectedCost: 25,
    });
    expect(result).toMatchObject({
      capability: 'ai-governance',
      status: 'budget-policy-upserted',
      policy: {
        policyKey: 'acme:tenant:default:feature:workflowbuilder:budget',
      },
    });
  });

  it('should expose guarded gateway decisions with header scope precedence', async () => {
    governancePersistence.buildGatewayDecision.mockResolvedValue({
      scope: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
      featureKey: 'workflowbuilder',
      taskType: 'draft',
      selectedLane: 'balanced-model',
      blockReason: null,
      outcome: {
        status: 'downgraded',
      },
      executionPolicy: {
        canAutoDispatch: true,
      },
    });

    const result = await controller.gatewayDecision(
      {
        tenantSlug: 'body-tenant',
        workspaceSlug: 'body-workspace',
        featureKey: 'WorkflowBuilder',
        taskType: 'Draft',
        requestedLane: 'premium-model',
        projectedTokens: 2500,
        occurredAt: '2026-05-30T12:00:00.000Z',
      },
      'acme',
      'ops',
    );

    expect(governancePersistence.buildGatewayDecision).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      featureKey: 'WorkflowBuilder',
      taskType: 'Draft',
      requestedLane: 'premium-model',
      projectedTokens: 2500,
      occurredAt: new Date('2026-05-30T12:00:00.000Z'),
    });
    expect(result).toMatchObject({
      capability: 'ai-governance',
      status: 'decision-ready',
      decision: {
        selectedLane: 'balanced-model',
        outcome: {
          status: 'downgraded',
        },
        executionPolicy: {
          canAutoDispatch: true,
        },
      },
    });
  });

  it('should surface blocked gateway decisions without hiding the block reason', async () => {
    governancePersistence.buildGatewayDecision.mockResolvedValue({
      selectedLane: null,
      quotaPressure: 'hard-limit',
      blockReason: 'Projected AI token usage reaches hard monthly limit of 1000.',
    });

    const result = await controller.gatewayDecision({
      tenantSlug: 'acme',
      featureKey: 'WorkflowBuilder',
      projectedTokens: 1000,
    });

    expect(result).toMatchObject({
      capability: 'ai-governance',
      status: 'blocked',
      decision: {
        selectedLane: null,
        blockReason: 'Projected AI token usage reaches hard monthly limit of 1000.',
      },
    });
  });

  it('should record execution usage events from gateway decisions', async () => {
    governancePersistence.persistUsageEventRecord.mockResolvedValue({
      eventKey: 'ai-usage:acme:workspace:ops:workflowbuilder:draft:ops@acme.test',
    });

    const result = await controller.recordUsageEvent(
      {
        tenantSlug: 'body-tenant',
        workspaceSlug: 'body-workspace',
        providerKey: 'openai',
        modelKey: 'gpt-5.5',
        inputTokens: 1200,
        outputTokens: 300,
        actualCost: 0.15,
        gatewayDecision: {
          featureKey: 'workflowbuilder',
          taskType: 'draft',
          selectedLane: 'balanced-model',
          credentialMode: 'aifut-managed',
        },
        occurredAt: '2026-05-30T12:20:00.000Z',
      },
      'acme',
      'ops',
      'ops@acme.test',
    );

    expect(governancePersistence.persistUsageEventRecord).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      providerKey: 'openai',
      modelKey: 'gpt-5.5',
      inputTokens: 1200,
      outputTokens: 300,
      actualCost: 0.15,
      actorKey: 'ops@acme.test',
      featureKey: 'workflowbuilder',
      taskType: 'draft',
      credentialMode: 'aifut-managed',
      executionLane: 'balanced-model',
      source: 'ai-gateway-execution',
      occurredAt: new Date('2026-05-30T12:20:00.000Z'),
    });
    expect(result).toMatchObject({
      capability: 'ai-governance',
      status: 'usage-event-recorded',
      event: {
        eventKey: 'ai-usage:acme:workspace:ops:workflowbuilder:draft:ops@acme.test',
      },
    });
  });

  it('should let explicit usage event fields override decision defaults', async () => {
    governancePersistence.persistUsageEventRecord.mockResolvedValue({
      eventKey: 'event-explicit',
    });

    await controller.recordUsageEvent({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      actorKey: 'worker_1',
      featureKey: 'explicit-feature',
      taskType: 'explicit-task',
      credentialMode: 'byo',
      executionLane: 'cheap-model',
      source: 'worker-runtime',
      gatewayDecision: {
        featureKey: 'decision-feature',
        taskType: 'decision-task',
        selectedLane: 'premium-model',
        credentialMode: 'aifut-managed',
      },
    });

    expect(governancePersistence.persistUsageEventRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        actorKey: 'worker_1',
        featureKey: 'explicit-feature',
        taskType: 'explicit-task',
        credentialMode: 'byo',
        executionLane: 'cheap-model',
        source: 'worker-runtime',
      }),
    );
  });

  it('should expose operator usage summaries with header scope precedence', async () => {
    governancePersistence.summarizeUsageLedger.mockResolvedValue({
      scope: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
      featureKey: 'orchestration-runtime',
      taskType: 'dispatch-run',
      totals: {
        totalTokens: 2400,
        effectiveCost: 0.24,
      },
      recentEvents: [
        {
          eventKey: 'event-1',
          executionLane: 'cheap-model',
          status: 'success',
        },
      ],
    });

    const result = await controller.usageSummary(
      'body-tenant',
      'body-workspace',
      'orchestration-runtime',
      'dispatch-run',
      '2026-05-01T00:00:00.000Z',
      '2026-05-31T23:59:59.000Z',
      '5',
      'acme',
      'ops',
    );

    expect(governancePersistence.summarizeUsageLedger).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      featureKey: 'orchestration-runtime',
      taskType: 'dispatch-run',
      occurredFrom: new Date('2026-05-01T00:00:00.000Z'),
      occurredTo: new Date('2026-05-31T23:59:59.000Z'),
      take: 5,
    });
    expect(result).toMatchObject({
      capability: 'ai-governance',
      status: 'usage-summary-fetched',
      summary: {
        totals: {
          totalTokens: 2400,
          effectiveCost: 0.24,
        },
        recentEvents: [
          {
            eventKey: 'event-1',
            executionLane: 'cheap-model',
          },
        ],
      },
    });
  });
});

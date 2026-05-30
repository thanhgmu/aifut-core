import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AiGovernanceController } from './ai-governance.controller';
import { AiGovernancePersistenceService } from './ai-governance-persistence.service';
import { AccessPolicyService } from './access-policy.service';

describe('AiGovernanceController', () => {
  let controller: AiGovernanceController;
  let governancePersistence: {
    buildGatewayDecision: jest.Mock;
    persistUsageEventRecord: jest.Mock;
  };

  beforeEach(async () => {
    governancePersistence = {
      buildGatewayDecision: jest.fn(),
      persistUsageEventRecord: jest.fn(),
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
});

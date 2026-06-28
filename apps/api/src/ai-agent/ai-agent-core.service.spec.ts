import { AiAgentCoreService } from './ai-agent-core.service';

describe('AiAgentCoreService', () => {
  let service: AiAgentCoreService;
  let auditCreate: jest.Mock;

  beforeEach(() => {
    auditCreate = jest.fn().mockResolvedValue({});
    service = new AiAgentCoreService({
      auditLog: {
        create: auditCreate,
      },
    } as never);
  });

  it('should return an auditable auto-safe operator plan for budget commands', async () => {
    const result = await service.processAgentCommand(
      'tenant-a',
      'Please optimize budget and AI cost.',
    );

    expect(result).toMatchObject({
      success: true,
      intent: 'BUDGET_OPTIMIZATION',
      operatorPlan: {
        contractVersion: 'ai-operator-plan.v1',
        executionMode: 'auto-safe',
        riskLevel: 'medium',
        approvalRequired: false,
        evidenceKey: 'tenant:tenant-a:ai-agent:budget_optimization',
        nextSafeStep: 'ANALYZE_USAGE_COST',
        blockedUntil: null,
      },
    });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          action: 'AI_AGENT_COMMAND_PROCESSED',
          metadata: expect.objectContaining({
            intent: 'BUDGET_OPTIMIZATION',
            recommendedActions: expect.any(Array),
          }),
        }),
      }),
    );
  });

  it('should require operator approval for security-sensitive commands', async () => {
    const result = await service.processAgentCommand(
      'tenant-a',
      'Run a security and permission audit.',
    );

    expect(result).toMatchObject({
      intent: 'SECURITY_REVIEW',
      operatorPlan: {
        contractVersion: 'ai-operator-plan.v1',
        executionMode: 'approval-required',
        riskLevel: 'high',
        approvalRequired: true,
        nextSafeStep: 'REVIEW_ACCESS_POLICY',
        blockedUntil: 'operator-approval',
      },
    });
  });
});

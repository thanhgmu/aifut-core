import { AiAgentCoreService } from './ai-agent-core.service';

describe('AiAgentCoreService', () => {
  let service: AiAgentCoreService;
  let auditCreate: jest.Mock;
  let mockExecutor: { executeActions: jest.Mock };

  beforeEach(() => {
    auditCreate = jest.fn().mockResolvedValue({});
    mockExecutor = {
      executeActions: jest.fn().mockResolvedValue({
        sessionId: 'test-session',
        intent: 'GENERAL_ASSISTANCE',
        confidence: 0.67,
        executionMode: 'preview-only',
        riskLevel: 'low',
        results: [],
        total: 0,
        succeeded: 0,
        failed: 0,
        simulated: 0,
        totalDurationMs: 5,
      } as any),
    };
    service = new AiAgentCoreService(
      {
        auditLog: {
          create: auditCreate,
        },
      } as never,
      mockExecutor as never,
    );
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

  it('should execute actions via processAndExecute', async () => {
    const result = await service.processAndExecute(
      'tenant-a',
      'session-1',
      'Kiểm tra lỗi hệ thống và sự cố gần đây',
    );

    expect(result.command.success).toBe(true);
    expect(result.command.intent).toBe('SYSTEM_HEALTH_CHECK');
    expect(result.execution.total).toBe(0);
    expect(mockExecutor.executeActions).toHaveBeenCalledWith(
      'session-1',
      'tenant-a',
      expect.objectContaining({ intent: 'SYSTEM_HEALTH_CHECK' }),
      undefined,
    );
  });

  it('should throw for empty tenantId', async () => {
    await expect(
      service.processAgentCommand('', 'some query'),
    ).rejects.toThrow('tenantId is required');
  });

  it('should throw for empty query', async () => {
    await expect(
      service.processAgentCommand('tenant-a', ''),
    ).rejects.toThrow('query is required');
  });
});

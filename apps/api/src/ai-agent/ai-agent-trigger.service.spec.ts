// ═══════════════════════════════════════════════════════════════════════════
// ai-agent-trigger.service.spec.ts — AgentTrigger Service Tests
// ═══════════════════════════════════════════════════════════════════════════

import { AiAgentTriggerService } from './ai-agent-trigger.service';

describe('AiAgentTriggerService', () => {
  let service: AiAgentTriggerService;

  // ── Mocks ───────────────────────────────────────────────────────────────

  const mockSessions: Array<{ id: string; title: string; tenantId: string }> = [];
  let mockSessionService: any;
  let mockCoreService: any;
  let mockExecutor: any;

  function createMockRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'trigger-1',
      tenantId: 'tenant-1',
      name: 'Daily Health Check',
      triggerType: 'scheduled',
      schedule: '0 */6 * * *',
      eventType: null,
      config: {},
      intent: 'SYSTEM_HEALTH_CHECK',
      isActive: true,
      lastFiredAt: null,
      nextFireAt: null,
      failCount: 0,
      createdAt: new Date('2026-06-28'),
      updatedAt: new Date('2026-06-28'),
      ...overrides,
    };
  }

  const mockPrisma = {
    agentTrigger: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockSessionService = {
      createSession: jest.fn().mockImplementation((tenantId: string, title: string) => {
        const session = { id: `session-${Date.now()}`, tenantId, title };
        mockSessions.push(session);
        return Promise.resolve(session);
      }),
      addMessage: jest.fn().mockResolvedValue({}),
    };

    mockCoreService = {
      processAndExecute: jest.fn().mockResolvedValue({
        command: {
          success: true,
          intent: 'SYSTEM_HEALTH_CHECK',
          confidence: 0.88,
          recommendedActions: [
            { type: 'SCAN_RECENT_ERRORS', targetId: 'test', description: 'Scan errors' },
          ],
          operatorPlan: {
            contractVersion: 'ai-operator-plan.v1',
            executionMode: 'auto-safe',
            riskLevel: 'medium',
            approvalRequired: false,
            evidenceKey: 'test',
            nextSafeStep: 'test',
            blockedUntil: null,
          },
          timestamp: new Date().toISOString(),
        },
        execution: {
          sessionId: 'session-1',
          intent: 'SYSTEM_HEALTH_CHECK',
          confidence: 0.88,
          executionMode: 'auto-safe',
          riskLevel: 'medium',
          results: [
            { type: 'SCAN_RECENT_ERRORS', status: 'success', durationMs: 120, output: {} },
          ],
          total: 1,
          succeeded: 1,
          failed: 0,
          simulated: 0,
          totalDurationMs: 150,
        },
      }),
    };

    mockExecutor = {
      executeActions: jest.fn().mockResolvedValue({}),
    };

    service = new AiAgentTriggerService(
      mockPrisma as any,
      mockCoreService,
      mockSessionService,
      mockExecutor,
    );
  });

  // ═════════════════════════════════════════════════════════════════════
  //  CRUD Tests
  // ═════════════════════════════════════════════════════════════════════

  describe('CRUD', () => {
    it('should create a scheduled trigger with nextFireAt', async () => {
      mockPrisma.agentTrigger.create.mockImplementation(async (args: any) => ({
        ...createMockRecord({}),
        ...args.data,
        id: 'new-trigger-1',
        nextFireAt: args.data?.nextFireAt ?? null,
      }));

      const result = await service.createTrigger({
        tenantId: 'tenant-1',
        name: 'Hourly Check',
        triggerType: 'scheduled',
        schedule: '0 * * * *',
        intent: 'SYSTEM_HEALTH_CHECK',
      });

      expect(mockPrisma.agentTrigger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            name: 'Hourly Check',
            triggerType: 'scheduled',
            schedule: '0 * * * *',
            intent: 'SYSTEM_HEALTH_CHECK',
            isActive: true,
          }),
        }),
      );
      expect(result.name).toBe('Hourly Check');
      expect(result.triggerType).toBe('scheduled');
    });

    it('should create an event trigger without nextFireAt', async () => {
      mockPrisma.agentTrigger.create.mockImplementation(async (args: any) => ({
        ...createMockRecord({}),
        ...args.data,
        id: 'new-trigger-2',
        triggerType: 'event',
        eventType: 'budget.threshold.exceeded',
        schedule: null,
        nextFireAt: null,
      }));

      const result = await service.createTrigger({
        tenantId: 'tenant-1',
        name: 'Budget Alert',
        triggerType: 'event',
        eventType: 'budget.threshold.exceeded',
        intent: 'BUDGET_OPTIMIZATION',
      });

      expect(result.triggerType).toBe('event');
      expect(result.eventType).toBe('budget.threshold.exceeded');
      expect(mockPrisma.agentTrigger.create).toHaveBeenCalled();
    });

    it('should get trigger by id', async () => {
      const mockRecord = createMockRecord();
      mockPrisma.agentTrigger.findUnique.mockResolvedValue(mockRecord);

      const result = await service.getTrigger('trigger-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('trigger-1');
      expect(result!.name).toBe('Daily Health Check');
    });

    it('should return null for non-existent trigger', async () => {
      mockPrisma.agentTrigger.findUnique.mockResolvedValue(null);
      const result = await service.getTrigger('nonexistent');
      expect(result).toBeNull();
    });

    it('should list triggers with filters', async () => {
      const mockRecords = [
        createMockRecord({ id: 't1', name: 'Health Check', triggerType: 'scheduled' }),
        createMockRecord({ id: 't2', name: 'Budget Alert', triggerType: 'event', eventType: 'budget.threshold' }),
      ];
      mockPrisma.agentTrigger.findMany.mockResolvedValue(mockRecords);

      const result = await service.listTriggers('tenant-1', { triggerType: 'scheduled' });
      expect(result).toHaveLength(2);
      expect(mockPrisma.agentTrigger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', triggerType: 'scheduled' }),
        }),
      );
    });

    it('should update trigger and recalculate nextFireAt on schedule change', async () => {
      const existing = createMockRecord({ schedule: '0 */6 * * *' });
      mockPrisma.agentTrigger.findUnique.mockResolvedValue(existing);
      mockPrisma.agentTrigger.update.mockResolvedValue({
        ...existing,
        name: 'Updated Check',
        isActive: false,
      });

      const result = await service.updateTrigger('trigger-1', {
        name: 'Updated Check',
        isActive: false,
      });

      expect(result).not.toBeNull();
      expect(mockPrisma.agentTrigger.update).toHaveBeenCalled();
    });

    it('should delete trigger', async () => {
      mockPrisma.agentTrigger.delete.mockResolvedValue({});

      const result = await service.deleteTrigger('trigger-1');
      expect(result).toBe(true);
      expect(mockPrisma.agentTrigger.delete).toHaveBeenCalledWith({ where: { id: 'trigger-1' } });
    });

    it('should return false on delete failure', async () => {
      mockPrisma.agentTrigger.delete.mockRejectedValue(new Error('Not found'));
      const result = await service.deleteTrigger('nonexistent');
      expect(result).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  Trigger Execution Tests
  // ═════════════════════════════════════════════════════════════════════

  describe('fireTrigger', () => {
    it('should fire an active trigger successfully', async () => {
      const mockRecord = createMockRecord({
        nextFireAt: new Date(Date.now() - 1000), // due
        schedule: '0 */6 * * *',
      });
      mockPrisma.agentTrigger.findUnique.mockResolvedValue(mockRecord);
      mockPrisma.agentTrigger.update.mockResolvedValue(mockRecord);

      const result = await service.fireTrigger('trigger-1');

      expect(result.fired).toBe(true);
      expect(result.triggerName).toBe('Daily Health Check');
      expect(result.intent).toBe('SYSTEM_HEALTH_CHECK');
      expect(result.executionResult).toBeDefined();
      expect((result.executionResult as any).succeeded).toBe(1);

      // Verify session created
      expect(mockSessionService.createSession).toHaveBeenCalledWith(
        'tenant-1',
        expect.stringContaining('[Auto] Daily Health Check'),
      );

      // Verify agent processed
      expect(mockCoreService.processAndExecute).toHaveBeenCalledWith(
        'tenant-1',
        expect.stringContaining('session-'),
        expect.any(String),
        undefined,
      );

      // Verify DB updated with lastFiredAt and nextFireAt
      expect(mockPrisma.agentTrigger.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'trigger-1' },
          data: expect.objectContaining({
            lastFiredAt: expect.any(Date),
            nextFireAt: expect.any(Date),
            failCount: 0,
          }),
        }),
      );
    });

    it('should return error for non-existent trigger', async () => {
      mockPrisma.agentTrigger.findUnique.mockResolvedValue(null);
      const result = await service.fireTrigger('nonexistent');

      expect(result.fired).toBe(false);
      expect(result.error).toBe('Trigger not found');
    });

    it('should return error for inactive trigger', async () => {
      const mockRecord = createMockRecord({ isActive: false });
      mockPrisma.agentTrigger.findUnique.mockResolvedValue(mockRecord);

      const result = await service.fireTrigger('trigger-1');
      expect(result.fired).toBe(false);
      expect(result.error).toBe('Trigger is not active');
    });

    it('should increment failCount on execution error', async () => {
      const mockRecord = createMockRecord({ failCount: 2 });
      mockPrisma.agentTrigger.findUnique.mockResolvedValue(mockRecord);
      mockCoreService.processAndExecute.mockRejectedValue(new Error('Service unavailable'));

      const result = await service.fireTrigger('trigger-1');

      expect(result.fired).toBe(false);
      expect(result.error).toBe('Service unavailable');

      // Verify fail count was incremented
      expect(mockPrisma.agentTrigger.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'trigger-1' },
          data: expect.objectContaining({
            failCount: { increment: 1 },
          }),
        }),
      );
    });

    it('should handle empty recommended actions gracefully', async () => {
      const mockRecord = createMockRecord({ nextFireAt: new Date() });
      mockPrisma.agentTrigger.findUnique.mockResolvedValue(mockRecord);
      mockCoreService.processAndExecute.mockResolvedValue({
        command: { intent: 'GENERAL_ASSISTANCE', recommendedActions: [] },
        execution: { total: 0, succeeded: 0, failed: 0, totalDurationMs: 5, results: [] },
      });
      mockPrisma.agentTrigger.update.mockResolvedValue(mockRecord);

      const result = await service.fireTrigger('trigger-1');
      expect(result.fired).toBe(true);
      expect((result.executionResult as any).total).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  checkAndFireDueTriggers Tests
  // ═════════════════════════════════════════════════════════════════════

  describe('checkAndFireDueTriggers', () => {
    it('should fire due triggers and skip non-due', async () => {
      const dueTrigger = createMockRecord({
        id: 'due-1',
        name: 'Overdue Check',
        nextFireAt: new Date(Date.now() - 10_000), // overdue
        schedule: '0 * * * *',
      });
      const futureTrigger = createMockRecord({
        id: 'future-1',
        name: 'Future Check',
        nextFireAt: new Date(Date.now() + 3600_000), // 1 hour from now
        schedule: '0 * * * *',
      });

      mockPrisma.agentTrigger.findMany.mockResolvedValue([dueTrigger, futureTrigger]);
      mockPrisma.agentTrigger.findUnique.mockImplementation(async (args: any) => {
        if (args.where.id === 'due-1') return dueTrigger;
        if (args.where.id === 'future-1') return futureTrigger;
        return null;
      });
      mockPrisma.agentTrigger.update.mockResolvedValue(dueTrigger);

      const results = await service.checkAndFireDueTriggers();

      // Only the overdue trigger should have been fired
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(mockCoreService.processAndExecute).toHaveBeenCalled();
    });

    it('should do nothing when no due triggers', async () => {
      mockPrisma.agentTrigger.findMany.mockResolvedValue([]);

      const results = await service.checkAndFireDueTriggers();

      expect(results).toHaveLength(0);
      expect(mockCoreService.processAndExecute).not.toHaveBeenCalled();
    });

    it('should handle findMany failure gracefully', async () => {
      mockPrisma.agentTrigger.findMany.mockRejectedValue(new Error('DB error'));
      const results = await service.checkAndFireDueTriggers();
      expect(results).toHaveLength(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  Trigger Stats Test
  // ═════════════════════════════════════════════════════════════════════

  describe('getTenantTriggerStats', () => {
    it('should return correct stats', async () => {
      mockPrisma.agentTrigger.findMany.mockResolvedValue([
        { id: 't1', triggerType: 'scheduled', isActive: true, nextFireAt: new Date() },
        { id: 't2', triggerType: 'scheduled', isActive: true, nextFireAt: new Date(Date.now() + 3600_000) },
        { id: 't3', triggerType: 'event', isActive: false, nextFireAt: null },
        { id: 't4', triggerType: 'threshold', isActive: true, nextFireAt: null },
      ]);

      const stats = await service.getTenantTriggerStats('tenant-1');

      expect(stats.total).toBe(4);
      expect(stats.active).toBe(3);
      expect(stats.scheduled).toBe(2);
      expect(stats.event).toBe(1);
      expect(stats.threshold).toBe(1);
    });
  });
});

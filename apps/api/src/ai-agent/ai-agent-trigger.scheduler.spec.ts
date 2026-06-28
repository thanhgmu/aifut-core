// ═══════════════════════════════════════════════════════════════════════════
// ai-agent-trigger.scheduler.spec.ts — AgentTrigger Scheduler Tests
// ═══════════════════════════════════════════════════════════════════════════

import { AiAgentTriggerScheduler } from './ai-agent-trigger.scheduler';
import { AiAgentTriggerService } from './ai-agent-trigger.service';

describe('AiAgentTriggerScheduler', () => {
  let scheduler: AiAgentTriggerScheduler;
  let mockTriggerService: jest.Mocked<Pick<AiAgentTriggerService, 'checkAndFireDueTriggers'>>;

  beforeEach(() => {
    jest.useFakeTimers();

    mockTriggerService = {
      checkAndFireDueTriggers: jest.fn().mockResolvedValue([
        {
          triggerId: 't1',
          triggerName: 'Health Check',
          tenantId: 'tenant-1',
          intent: 'SYSTEM_HEALTH_CHECK',
          fired: true,
          executionResult: { sessionId: 's1', succeeded: 2, failed: 0 },
        },
      ]),
    };

    scheduler = new AiAgentTriggerScheduler(mockTriggerService as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should start interval on init and fire checkAndFireDueTriggers', async () => {
    scheduler.onModuleInit();
    expect(mockTriggerService.checkAndFireDueTriggers).not.toHaveBeenCalled();

    // Advance past initial 5s delay + flush promise
    jest.advanceTimersByTime(5_100);
    await Promise.resolve();
    expect(mockTriggerService.checkAndFireDueTriggers).toHaveBeenCalledTimes(1);

    // Advance past the poll interval (60s)
    jest.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(mockTriggerService.checkAndFireDueTriggers).toHaveBeenCalledTimes(2);
  });

  it('should skip overlapping tick when previous still running', () => {
    // Mock that never resolves — keeps isRunning=true
    let resolver: (v: unknown) => void = () => {};
    mockTriggerService.checkAndFireDueTriggers.mockImplementation(
      () => new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    scheduler.onModuleInit();

    // Advance past initial delay — first tick starts
    jest.advanceTimersByTime(6_000);

    // Advance past poll interval — second tick sees isRunning=true, skips
    jest.advanceTimersByTime(60_000);

    // Only called once because first never completed
    expect(mockTriggerService.checkAndFireDueTriggers).toHaveBeenCalledTimes(1);

    // Clean up the hanging promise
    resolver([]);
  });

  it('should stop interval on destroy', () => {
    scheduler.onModuleInit();

    const clearSpy = jest.spyOn(global, 'clearInterval');

    scheduler.onModuleDestroy();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('should handle tick errors gracefully', async () => {
    mockTriggerService.checkAndFireDueTriggers.mockRejectedValue(new Error('Unexpected error'));

    scheduler.onModuleInit();

    jest.advanceTimersByTime(6_000);
    await Promise.resolve();

    // Logged error, recovered — isRunning reset to false
    expect(mockTriggerService.checkAndFireDueTriggers).toHaveBeenCalled();
  });
});

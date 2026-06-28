// ═══════════════════════════════════════════════════════════════════════════
// ai-agent-action-executor.service.spec.ts — AI Operator Agent Action Executor
// ═══════════════════════════════════════════════════════════════════════════

import { AiAgentActionExecutorService } from './ai-agent-action-executor.service';
import { PrismaService } from '../prisma.service';
import { BillingService } from '../billing/billing.service';
import { AnalyticsBiService } from '../analytics-bi/analytics-bi.service';
import { AuditService } from '../audit/audit.service';
import type { AgentCommandResult } from './ai-agent-core.service';

// ── Mock AgentCommandResult ───────────────────────────────────────────────

function makeCommand(overrides: Partial<AgentCommandResult> = {}): AgentCommandResult {
  return {
    intent: 'SYSTEM_HEALTH_CHECK',
    confidence: 0.88,
    recommendedActions: [
      { type: 'SCAN_RECENT_ERRORS', targetId: 'all', description: 'Scan recent errors' },
    ],
    operatorPlan: {
      contractVersion: 'ai-operator-plan.v1',
      executionMode: 'auto-safe',
      riskLevel: 'medium',
      approvalRequired: false,
      evidenceKey: 'evt-001',
      nextSafeStep: 'review errors',
      blockedUntil: null,
    },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── Mock Services ─────────────────────────────────────────────────────────

function makeMockBillingService() {
  return {
    getOrCreateAccount: jest.fn().mockResolvedValue({ currency: 'VND' }),
    getInvoices: jest.fn().mockResolvedValue([]),
  };
}

function makeMockAnalyticsBiService() {
  return {
    getTenantAnalytics: jest.fn().mockResolvedValue([]),
  };
}

function makeMockAuditService() {
  return {
    logActivity: jest.fn().mockResolvedValue({}),
  };
}

function makeMockPrisma() {
  const auditEvents: any[] = [];
  return {
    auditEvent: {
      findMany: jest.fn().mockImplementation((args: any) => {
        let filtered = [...auditEvents];
        if (args?.where?.tenantId) filtered = filtered.filter((e) => e.tenantId === args.where.tenantId);
        if (args?.where?.severity?.in) filtered = filtered.filter((e) => args.where.severity.in.includes(e.severity));
        if (args?.where?.action?.contains) filtered = filtered.filter((e) => e.action.includes(args.where.action.contains));
        if (args?.where?.createdAt?.gte) filtered = filtered.filter((e) => e.createdAt >= args.where.createdAt.gte);
        filtered.sort((a, b) => b.createdAt - a.createdAt);
        return Promise.resolve(filtered.slice(0, args?.take ?? filtered.length));
      }),
    },
    integrationConnection: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    _seedEvent: (overrides: any) => {
      const evt = {
        id: `evt-${auditEvents.length + 1}`,
        tenantId: 'tenant-1',
        action: 'USER_LOGIN',
        severity: 'INFO',
        actorType: 'USER',
        userId: 'u-1',
        targetId: null,
        metadata: null,
        createdAt: new Date(),
        ...overrides,
      };
      auditEvents.push(evt);
      return evt;
    },
    _clear: () => { auditEvents.length = 0; },
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('AiAgentActionExecutorService', () => {
  let service: AiAgentActionExecutorService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;
  let mockBilling: ReturnType<typeof makeMockBillingService>;
  let mockAnalytics: ReturnType<typeof makeMockAnalyticsBiService>;
  let mockAudit: ReturnType<typeof makeMockAuditService>;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    mockBilling = makeMockBillingService();
    mockAnalytics = makeMockAnalyticsBiService();
    mockAudit = makeMockAuditService();

    service = new AiAgentActionExecutorService(
      mockPrisma as unknown as PrismaService,
      mockBilling as unknown as BillingService,
      mockAnalytics as unknown as AnalyticsBiService,
      mockAudit as unknown as AuditService,
    );
  });

  afterEach(() => mockPrisma._clear());

  // ═════════════════════════════════════════════════════════════════════
  //  executeActions — sanity
  // ═════════════════════════════════════════════════════════════════════

  describe('executeActions', () => {
    it('should execute recommended actions and return results', async () => {
      const command = makeCommand({
        recommendedActions: [
          { type: 'SCAN_RECENT_ERRORS', targetId: 'all', description: 'Scan errors' },
        ],
      });

      const result = await service.executeActions('session-1', 'tenant-1', command);

      expect(result.sessionId).toBe('session-1');
      expect(result.intent).toBe('SYSTEM_HEALTH_CHECK');
      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].status).toBe('success');
      expect(result.results[0].type).toBe('SCAN_RECENT_ERRORS');
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should execute multiple actions independently', async () => {
      const command = makeCommand({
        recommendedActions: [
          { type: 'SCAN_RECENT_ERRORS', targetId: 'all', description: 'Scan' },
          { type: 'ANALYZE_USAGE_COST', targetId: 'all', description: 'Cost' },
          { type: 'EXPORT_SECURITY_AUDIT_SUMMARY', targetId: 'all', description: 'Audit' },
        ],
      });

      const result = await service.executeActions('sess-1', 'tenant-1', command);
      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(3);
    });

    it('should record audit trail for the execution', async () => {
      const command = makeCommand();
      await service.executeActions('sess-audit', 'tenant-1', command);

      expect(mockAudit.logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          action: 'AI_AGENT_ACTIONS_EXECUTED',
        }),
      );
    });

    it('should handle unknown action types as simulated', async () => {
      const command = makeCommand({
        recommendedActions: [
          { type: 'UNKNOWN_ACTION_XYZ', targetId: 'all', description: 'Mystery' },
        ],
      });

      const result = await service.executeActions('sess-sim', 'tenant-1', command);
      expect(result.results[0].status).toBe('success'); // Simulated = success with mock output
      expect(result.succeeded).toBe(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  Action error handling
  // ═════════════════════════════════════════════════════════════════════

  describe('action error handling', () => {
    it('should mark action as failed on handler error', async () => {
      mockAnalytics.getTenantAnalytics.mockRejectedValue(new Error('DB connection lost'));

      const command = makeCommand({
        recommendedActions: [
          { type: 'SCAN_RECENT_ERRORS', targetId: 'all', description: 'Will fail' },
        ],
      });

      const result = await service.executeActions('sess-err', 'tenant-1', command);
      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].error).toBe('DB connection lost');
      expect(result.failed).toBe(1);
    });

    it('should continue executing remaining actions after one fails', async () => {
      mockAnalytics.getTenantAnalytics.mockRejectedValueOnce(new Error('Fail 1'));
      mockAnalytics.getTenantAnalytics.mockRejectedValueOnce(new Error('Fail 2'));

      const command = makeCommand({
        recommendedActions: [
          { type: 'SCAN_RECENT_ERRORS', targetId: 'all', description: 'Fail' },
          { type: 'SCAN_RECENT_ERRORS', targetId: 'all', description: 'Also fail' },
          { type: 'EXPORT_SECURITY_AUDIT_SUMMARY', targetId: 'all', description: 'OK' },
        ],
      });

      const result = await service.executeActions('sess-chain', 'tenant-1', command);
      expect(result.results.filter((r) => r.status === 'failed')).toHaveLength(2);
      expect(result.results.filter((r) => r.status === 'success')).toHaveLength(1);
      expect(result.failed).toBe(2);
      expect(result.succeeded).toBe(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  Specific action types
  // ═════════════════════════════════════════════════════════════════════

  describe('SCAN_RECENT_ERRORS', () => {
    it('should return scan results with audit events', async () => {
      mockPrisma._seedEvent({ severity: 'CRITICAL', action: 'WORKFLOW_FAILED' });

      const command = makeCommand({
        recommendedActions: [
          { type: 'SCAN_RECENT_ERRORS', targetId: 'all', description: 'Scan errors' },
        ],
      });

      const result = await service.executeActions('sess-scan', 'tenant-1', command);
      const output = result.results[0].output as any;
      expect(output.tenantId).toBe('tenant-1');
      expect(output.scanPeriod).toBe('last 24 hours');
    });
  });

  describe('ANALYZE_USAGE_COST', () => {
    it('should return cost analysis with recommendations', async () => {
      mockBilling.getInvoices.mockResolvedValue([
        { amount: 100, status: 'paid' },
        { amount: 50, status: 'pending' },
      ]);

      const command = makeCommand({
        recommendedActions: [
          { type: 'ANALYZE_USAGE_COST', targetId: 'all', description: 'Cost' },
        ],
      });

      const result = await service.executeActions('sess-cost', 'tenant-1', command);
      const output = result.results[0].output as any;
      expect(output.currency).toBe('VND');
      expect(output.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('RECOMMEND_MODEL_ROUTING', () => {
    it('should return routing policy proposal', async () => {
      const command = makeCommand({
        recommendedActions: [
          { type: 'RECOMMEND_MODEL_ROUTING', targetId: 'all', description: 'Route' },
        ],
      });

      const result = await service.executeActions('sess-route', 'tenant-1', command);
      const output = result.results[0].output as any;
      expect(output.proposedRoutingPolicy).toBeDefined();
      expect(output.proposedRoutingPolicy.smallTasks).toBeDefined();
    });
  });

  describe('REVIEW_ACCESS_POLICY', () => {
    it('should return access policy review', async () => {
      mockPrisma._seedEvent({ action: 'ACCESS_DENIED', severity: 'WARN', actorType: 'API' });
      mockPrisma._seedEvent({ action: 'ROLE_CHANGED', severity: 'CRITICAL', actorType: 'USER' });

      const command = makeCommand({
        recommendedActions: [
          { type: 'REVIEW_ACCESS_POLICY', targetId: 'all', description: 'Review' },
        ],
      });

      const result = await service.executeActions('sess-access', 'tenant-1', command);
      const output = result.results[0].output as any;
      expect(output.reviewPeriod).toBe('last 7 days');
      expect(output.totalAccessEvents).toBeGreaterThanOrEqual(2);
    });
  });

  describe('VALIDATE_CONNECTOR_SCOPE', () => {
    it('should return connector validation', async () => {
      mockPrisma.integrationConnection.findMany.mockResolvedValue([
        { id: 'conn-1', name: 'Slack', provider: 'slack', status: 'ACTIVE', config: { token: 'xxx' } },
      ]);

      const command = makeCommand({
        recommendedActions: [
          { type: 'VALIDATE_CONNECTOR_SCOPE', targetId: 'all', description: 'Validate' },
        ],
      });

      const result = await service.executeActions('sess-conn', 'tenant-1', command);
      const output = result.results[0].output as any;
      expect(output.healthy).toBe(true);
      expect(output.totalConnections).toBe(1);
    });
  });

  describe('MAP_INTEGRATION_REQUIREMENTS', () => {
    it('should return integration plan', async () => {
      const command = makeCommand({
        recommendedActions: [
          { type: 'MAP_INTEGRATION_REQUIREMENTS', targetId: 'all', description: 'Map' },
        ],
      });

      const result = await service.executeActions('sess-map', 'tenant-1', command);
      const output = result.results[0].output as any;
      expect(output.recommendedPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('OPEN_INCIDENT_DRAFT', () => {
    it('should create incident draft with audit', async () => {
      const command = makeCommand({
        recommendedActions: [
          { type: 'OPEN_INCIDENT_DRAFT', targetId: 'wf-critical', description: 'Open incident' },
        ],
      });

      const result = await service.executeActions('sess-inc', 'tenant-1', command);
      const output = result.results[0].output as any;
      expect(output.status).toBe('draft');
      expect(output.source).toBe('ai-agent-core');

      expect(mockAudit.logActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: expect.stringContaining('INCIDENT') }),
      );
    });
  });

  describe('CREATE_AGENT_TASK_DRAFT', () => {
    it('should create agent task draft', async () => {
      const command = makeCommand({
        recommendedActions: [
          { type: 'CREATE_AGENT_TASK_DRAFT', targetId: 'task-123', description: 'Create task' },
        ],
      });

      const result = await service.executeActions('sess-task', 'tenant-1', command, 'user-1');
      const output = result.results[0].output as any;
      expect(output.source).toBe('ai-agent-core');
      expect(output.status).toBe('draft');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  Empty / edge cases
  // ═════════════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('should handle empty actions list', async () => {
      const command = makeCommand({ recommendedActions: [] });

      const result = await service.executeActions('sess-empty', 'tenant-1', command);
      expect(result.total).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should handle userId param propagation', async () => {
      const command = makeCommand({
        recommendedActions: [
          { type: 'REVIEW_ACCESS_POLICY', targetId: 'all', description: 'Review' },
        ],
      });

      await service.executeActions('sess-user', 'tenant-1', command, 'specific-user');
      // audit should have been called
      expect(mockAudit.logActivity).toHaveBeenCalled();
    });
  });
});

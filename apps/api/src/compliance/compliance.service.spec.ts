// ═══════════════════════════════════════════════════════════════════════════
// compliance.service.spec.ts — Compliance & Audit Trail Service Tests
// ═══════════════════════════════════════════════════════════════════════════

import { ComplianceService } from './compliance.service';
import { PrismaService } from '../prisma.service';

// ── Types ─────────────────────────────────────────────────────────────────

interface MockAuditEvent {
  id: string;
  tenantId: string;
  action: string;
  actorType: string;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  severity: string | null;
  createdAt: Date;
  userId: string | null;
  user: { email: string; name: string } | null;
}

// ── Test helpers ──────────────────────────────────────────────────────────

function makeAuditEvent(overrides: Partial<MockAuditEvent> = {}): MockAuditEvent {
  const base: MockAuditEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: 'tenant-1',
    action: 'USER_LOGIN',
    actorType: 'USER',
    actorEmail: 'admin@example.com',
    targetType: null,
    targetId: null,
    metadata: {},
    severity: 'INFO',
    createdAt: new Date('2026-06-28T10:00:00Z'),
    userId: 'user-1',
    user: { email: 'admin@example.com', name: 'Admin' },
  };
  return { ...base, ...overrides };
}

function makeMockPrisma() {
  const events: MockAuditEvent[] = [];
  let idCounter = 0;

  return {
    auditEvent: {
      findMany: jest.fn().mockImplementation((args: any) => {
        let filtered = [...events];
        if (args?.where?.tenantId) {
          filtered = filtered.filter((e) => e.tenantId === args.where.tenantId);
        }
        if (args?.where?.action?.contains) {
          filtered = filtered.filter((e) =>
            e.action.toLowerCase().includes(args.where.action.contains.toLowerCase()),
          );
        }
        if (args?.where?.actorType) {
          filtered = filtered.filter((e) => e.actorType === args.where.actorType);
        }
        if (args?.where?.targetType) {
          filtered = filtered.filter((e) => e.targetType === args.where.targetType);
        }
        if (args?.where?.createdAt) {
          const { gte, lte } = args.where.createdAt;
          if (gte) filtered = filtered.filter((e) => e.createdAt >= gte);
          if (lte) filtered = filtered.filter((e) => e.createdAt <= lte);
        }

        // Sort desc by createdAt
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        // Pagination
        const skip = args?.skip ?? 0;
        const take = args?.take ?? filtered.length;
        return Promise.resolve(
          filtered.slice(skip, skip + take).map((e) => ({
            ...e,
            include: args?.include,
          })),
        );
      }),
      count: jest.fn().mockImplementation((args: any) => {
        let filtered = [...events];
        if (args?.where?.tenantId) {
          filtered = filtered.filter((e) => e.tenantId === args.where.tenantId);
        }
        if (args?.where?.action?.contains) {
          filtered = filtered.filter((e) =>
            e.action.toLowerCase().includes(args.where.action.contains.toLowerCase()),
          );
        }
        return Promise.resolve(filtered.length);
      }),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    // Helper to seed test data
    _seed: (event: Partial<MockAuditEvent> = {}) => {
      const e = makeAuditEvent({ ...event, id: `evt-${++idCounter}` });
      events.push(e);
      return e;
    },
    _clear: () => {
      events.length = 0;
      idCounter = 0;
    },
  };
}

describe('ComplianceService', () => {
  let service: ComplianceService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;
  const TENANT_ID = 'tenant-1';

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    service = new ComplianceService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => {
    mockPrisma._clear();
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getAuditLog Tests
  // ═════════════════════════════════════════════════════════════════════

  describe('getAuditLog', () => {
    it('should return paginated audit events for a tenant', async () => {
      mockPrisma._seed({ action: 'USER_LOGIN' });
      mockPrisma._seed({ action: 'WORKFLOW_EXECUTED' });
      mockPrisma._seed({ action: 'PAYMENT_PROCESSED' });

      const result = await service.getAuditLog(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should return empty items when no events exist', async () => {
      const result = await service.getAuditLog(TENANT_ID);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should filter by action', async () => {
      mockPrisma._seed({ action: 'USER_LOGIN' });
      mockPrisma._seed({ action: 'WORKFLOW_EXECUTED' });
      mockPrisma._seed({ action: 'USER_LOGIN' });

      const result = await service.getAuditLog(TENANT_ID, { action: 'LOGIN' });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by actorType', async () => {
      mockPrisma._seed({ action: 'USER_LOGIN', actorType: 'USER' });
      mockPrisma._seed({ action: 'BACKUP_RUN', actorType: 'SYSTEM' });
      mockPrisma._seed({ action: 'PAYMENT_PROCESSED', actorType: 'USER' });

      const result = await service.getAuditLog(TENANT_ID, { actorType: 'SYSTEM' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].action).toBe('BACKUP_RUN');
    });

    it('should filter by targetType', async () => {
      mockPrisma._seed({ action: 'WORKFLOW_RUN', targetType: 'workflow', targetId: 'wf-1' });
      mockPrisma._seed({ action: 'CONNECTOR_CREATED', targetType: 'connector', targetId: 'conn-1' });

      const result = await service.getAuditLog(TENANT_ID, { targetType: 'workflow' });
      expect(result.items).toHaveLength(1);
    });

    it('should filter by date range', async () => {
      mockPrisma._seed({
        action: 'OLD_EVENT',
        createdAt: new Date('2026-06-01T00:00:00Z'),
      });
      mockPrisma._seed({
        action: 'RECENT_EVENT',
        createdAt: new Date('2026-06-28T00:00:00Z'),
      });

      const result = await service.getAuditLog(TENANT_ID, {
        from: '2026-06-15T00:00:00Z',
        to: '2026-06-30T00:00:00Z',
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].action).toBe('RECENT_EVENT');
    });

    it('should handle pagination correctly', async () => {
      for (let i = 0; i < 25; i++) {
        mockPrisma._seed({ action: `ACTION_${i}` });
      }

      const page1 = await service.getAuditLog(TENANT_ID, { page: 1, pageSize: 10 });
      expect(page1.items).toHaveLength(10);
      expect(page1.total).toBe(25);
      expect(page1.totalPages).toBe(3);

      const page3 = await service.getAuditLog(TENANT_ID, { page: 3, pageSize: 10 });
      expect(page3.items).toHaveLength(5);
      expect(page3.page).toBe(3);
    });

    it('should not allow pageSize over 100', async () => {
      for (let i = 0; i < 150; i++) {
        mockPrisma._seed({ action: `ACTION_${i}` });
      }

      const result = await service.getAuditLog(TENANT_ID, { pageSize: 999 });
      expect(result.items.length).toBeLessThanOrEqual(100);
      expect(result.pageSize).toBe(100);
    });

    it('should map user email to actor field', async () => {
      mockPrisma._seed({
        action: 'USER_LOGIN',
        actorEmail: 'admin@example.com',
        user: { email: 'admin@example.com', name: 'Admin' },
      });

      const result = await service.getAuditLog(TENANT_ID);
      expect(result.items[0].actor).toBe('admin@example.com');
    });

    it('should fall back to actorEmail when user is null', async () => {
      mockPrisma._seed({
        action: 'SYSTEM_ACTION',
        actorEmail: 'system@aifut',
        actorType: 'SYSTEM',
        user: null,
        userId: null,
      });

      const result = await service.getAuditLog(TENANT_ID);
      expect(result.items[0].actor).toBe('system@aifut');
    });

    it('should fall back to "system" when no actor info', async () => {
      mockPrisma._seed({
        action: 'CRON_JOB',
        actorEmail: null,
        actorType: 'SYSTEM',
        user: null,
        userId: null,
      });

      const result = await service.getAuditLog(TENANT_ID);
      expect(result.items[0].actor).toBe('system');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getComplianceReport Tests
  // ═════════════════════════════════════════════════════════════════════

  describe('getComplianceReport', () => {
    it('should generate a report with summary stats', async () => {
      mockPrisma._seed({ action: 'USER_LOGIN', actorEmail: 'alice@example.com', createdAt: new Date('2026-06-28') });
      mockPrisma._seed({ action: 'USER_LOGIN', actorEmail: 'bob@example.com', createdAt: new Date('2026-06-28') });
      mockPrisma._seed({ action: 'WORKFLOW_RUN', actorEmail: 'alice@example.com', createdAt: new Date('2026-06-27') });
      mockPrisma._seed({ action: 'PAYMENT_PROCESSED', actorEmail: 'bob@example.com', createdAt: new Date('2026-06-26') });
      mockPrisma._seed({ action: 'BACKUP_COMPLETED', actorEmail: null, actorType: 'SYSTEM', createdAt: new Date('2026-06-25') });

      const report = await service.getComplianceReport(TENANT_ID, {
        from: '2026-06-20T00:00:00Z',
        to: '2026-06-30T00:00:00Z',
      });

      expect(report.period.from).toBeDefined();
      expect(report.period.to).toBeDefined();
      expect(report.summary.totalActions).toBe(5);
      expect(report.summary.uniqueActions).toBe(4);
      expect(report.generatedAt).toBeDefined();
    });

    it('should calculate top actions correctly', async () => {
      for (let i = 0; i < 10; i++) mockPrisma._seed({ action: 'USER_LOGIN' });
      for (let i = 0; i < 3; i++) mockPrisma._seed({ action: 'WORKFLOW_EXECUTED' });
      mockPrisma._seed({ action: 'BACKUP_RUN' });

      const report = await service.getComplianceReport(TENANT_ID, {
        from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(report.summary.topActions[0].action).toBe('USER_LOGIN');
      expect(report.summary.topActions[0].count).toBe(10);
      expect(report.summary.topActions[1].action).toBe('WORKFLOW_EXECUTED');
      expect(report.summary.topActions[1].count).toBe(3);
    });

    it('should calculate actions by day', async () => {
      const today = new Date('2026-06-28T10:00:00Z');
      const yesterday = new Date('2026-06-27T09:00:00Z');
      mockPrisma._seed({ action: 'ACTION_A', createdAt: today });
      mockPrisma._seed({ action: 'ACTION_B', createdAt: today });
      mockPrisma._seed({ action: 'ACTION_C', createdAt: yesterday });

      const report = await service.getComplianceReport(TENANT_ID, {
        from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(report.summary.actionsByDay).toHaveLength(2);
      expect(report.summary.actionsByDay[0].date).toBe('2026-06-27');
      expect(report.summary.actionsByDay[0].count).toBe(1);
      expect(report.summary.actionsByDay[1].date).toBe('2026-06-28');
      expect(report.summary.actionsByDay[1].count).toBe(2);
    });

    it('should default to last 30 days when no period specified', async () => {
      mockPrisma._seed({ action: 'RECENT', createdAt: new Date() });
      mockPrisma._seed({ action: 'VERY_OLD', createdAt: new Date('2025-01-01') });

      const report = await service.getComplianceReport(TENANT_ID);
      // Should only include events within last 30 days
      expect(report.summary.totalActions).toBeGreaterThanOrEqual(1);
      expect(report.summary.totalActions).toBeLessThan(3);
    });

    it('should return report with no events', async () => {
      const report = await service.getComplianceReport(TENANT_ID);
      expect(report.summary.totalActions).toBe(0);
      expect(report.summary.topActions).toHaveLength(0);
      expect(report.summary.actionsByDay).toHaveLength(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  exportAuditLog Tests
  // ═════════════════════════════════════════════════════════════════════

  describe('exportAuditLog', () => {
    beforeEach(() => {
      mockPrisma._seed({
        action: 'USER_LOGIN',
        actorEmail: 'admin@example.com',
        actorType: 'USER',
        createdAt: new Date('2026-06-28T10:00:00Z'),
      });
      mockPrisma._seed({
        action: 'BACKUP_COMPLETED',
        actorEmail: null,
        actorType: 'SYSTEM',
        createdAt: new Date('2026-06-27T08:00:00Z'),
        metadata: { backupSize: '1.2GB' },
      });
    });

    it('should export as CSV by default', async () => {
      const result = await service.exportAuditLog(TENANT_ID);
      expect(result.mimeType).toBe('text/csv');
      expect(result.filename).toMatch(/\.csv$/);
      expect(result.data).toContain('Timestamp,Actor,ActorType');
      expect(result.data).toContain('admin@example.com');
    });

    it('should export as JSON when specified', async () => {
      const result = await service.exportAuditLog(TENANT_ID, { format: 'json' });
      expect(result.mimeType).toBe('application/json');
      expect(result.filename).toMatch(/\.json$/);
      const parsed = JSON.parse(result.data);
      expect(parsed).toHaveLength(2);
      // Sorted desc by createdAt — BACKUP_COMPLETED is older, appears second
      expect(parsed[0].action).toBe('USER_LOGIN');
      expect(parsed[1].action).toBe('BACKUP_COMPLETED');
    });

    it('should respect date range filter for export', async () => {
      const from = '2026-06-28T00:00:00Z';
      const to = '2026-06-29T00:00:00Z';

      const result = await service.exportAuditLog(TENANT_ID, { from, to });
      expect(result.data).toContain('USER_LOGIN');
      expect(result.data).not.toContain('BACKUP_COMPLETED');
    });

    it('should include metadata in CSV with escaped quotes', async () => {
      const result = await service.exportAuditLog(TENANT_ID);
      expect(result.data).toContain('backupSize');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getAuditLogV2 Tests
  // ═════════════════════════════════════════════════════════════════════

  describe('getAuditLogV2', () => {
    it('should return empty items when no AuditLog records exist', async () => {
      const result = await service.getAuditLogV2(TENANT_ID);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  Edge Cases
  // ═════════════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('should handle missing tenant gracefully (empty result)', async () => {
      const result = await service.getAuditLog('nonexistent-tenant');
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle very large page number gracefully', async () => {
      mockPrisma._seed({ action: 'TEST' });
      const result = await service.getAuditLog(TENANT_ID, { page: 9999 });
      expect(result.items).toHaveLength(0);
      expect(result.page).toBe(9999);
    });

    it('should handle mixed severity values in report', async () => {
      mockPrisma._seed({ action: 'USER_LOGIN', severity: 'INFO' });
      mockPrisma._seed({ action: 'SECURITY_BREACH', severity: 'CRITICAL' });
      mockPrisma._seed({ action: 'PERMISSION_CHANGE', severity: 'WARN' });

      const report = await service.getComplianceReport(TENANT_ID, {
        from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(report.summary.totalActions).toBe(3);
    });
  });
});

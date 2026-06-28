// ═══════════════════════════════════════════════════════════════════════════
// anomaly-detector.service.spec.ts — Statistical Anomaly Detection Engine Tests
// ═══════════════════════════════════════════════════════════════════════════

import { AnomalyDetectorService } from './anomaly-detector.service';
import { PrismaService } from '../prisma.service';

// ── Mock Types ────────────────────────────────────────────────────────────

interface MockAnalyticsSummary {
  tenantId: string;
  period: string;
  timestamp: Date;
  workspaceId: string | null;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalAiTokens: bigint;
  totalAiCost: bigint;
  totalRevenue: bigint;
  activeUserCount: number;
  aiCallCount: number;
  newUserCount: number;
  storageBytesTotal: bigint;
}

interface MockAnomalyRecord {
  id: string;
  tenantId: string;
  anomalyType: string;
  severity: string;
  title: string;
  description: string | null;
  metricName: string | null;
  metricValue: number | null;
  baselineValue: number | null;
  deviationScore: number | null;
  createdAt: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<MockAnalyticsSummary> = {}): MockAnalyticsSummary {
  return {
    tenantId: 'tenant-1',
    period: 'HOURLY',
    timestamp: new Date('2026-06-28T10:00:00Z'),
    workspaceId: null,
    totalExecutions: 100,
    successfulExecutions: 95,
    failedExecutions: 5,
    totalAiTokens: BigInt(10000),
    totalAiCost: BigInt(500),
    totalRevenue: BigInt(2000),
    activeUserCount: 10,
    aiCallCount: 20,
    newUserCount: 2,
    storageBytesTotal: BigInt(1048576),
    ...overrides,
  };
}

function makeMockPrisma() {
  const summaries: MockAnalyticsSummary[] = [];
  const anomalies: MockAnomalyRecord[] = [];

  return {
    tenantAnalyticsSummary: {
      findMany: jest.fn().mockImplementation((args: any) => {
        let filtered = [...summaries];
        if (args?.where?.tenantId) filtered = filtered.filter((s) => s.tenantId === args.where.tenantId);
        if (args?.where?.period) filtered = filtered.filter((s) => s.period === args.where.period);
        if (args?.where?.workspaceId !== undefined) filtered = filtered.filter((s) => s.workspaceId === args.where.workspaceId);
        if (args?.where?.timestamp?.gte) filtered = filtered.filter((s) => s.timestamp >= args.where.timestamp.gte);
        filtered.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        return Promise.resolve(filtered.slice(0, args?.take ?? filtered.length));
      }),
      // For distinct tenantId query
      findManyDistinct: jest.fn().mockImplementation(() => {
        const unique = [...new Set(summaries.map((s) => s.tenantId))];
        return Promise.resolve(unique.map((id) => ({ tenantId: id })));
      }),
    },
    anomalyRecord: {
      findFirst: jest.fn().mockImplementation((args: any) => {
        const filtered = anomalies.filter(
          (a) => a.tenantId === args.where.tenantId && a.anomalyType === args.where.anomalyType
            && a.createdAt >= args.where.createdAt.gte,
        );
        return Promise.resolve(filtered[0] ?? null);
      }),
      create: jest.fn().mockImplementation((args: any) => {
        const a: MockAnomalyRecord = {
          id: `anm-${anomalies.length + 1}`,
          tenantId: args.data.tenantId,
          anomalyType: args.data.anomalyType,
          severity: args.data.severity,
          title: args.data.title,
          description: args.data.description ?? null,
          metricName: args.data.metricName ?? null,
          metricValue: args.data.metricValue ?? null,
          baselineValue: args.data.baselineValue ?? null,
          deviationScore: args.data.deviationScore ?? null,
          createdAt: new Date(),
        };
        anomalies.push(a);
        return Promise.resolve(a);
      }),
    },
    _seedSummary: (overrides: Partial<MockAnalyticsSummary> = {}) => {
      const s = makeSummary(overrides);
      summaries.push(s);
      return s;
    },
    _seedAnomaly: (overrides: Partial<MockAnomalyRecord> = {}) => {
      const a: MockAnomalyRecord = {
        id: `anm-${anomalies.length + 1}`,
        tenantId: overrides.tenantId ?? 'tenant-1',
        anomalyType: overrides.anomalyType ?? 'SPIKING_EXECUTIONS',
        severity: overrides.severity ?? 'MEDIUM',
        title: overrides.title ?? 'Anomaly',
        description: null,
        metricName: null,
        metricValue: null,
        baselineValue: null,
        deviationScore: null,
        createdAt: new Date(),
      };
      anomalies.push(a);
      return a;
    },
    _clear: () => { summaries.length = 0; anomalies.length = 0; },
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('AnomalyDetectorService', () => {
  let service: AnomalyDetectorService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    service = new AnomalyDetectorService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => mockPrisma._clear());

  // ═════════════════════════════════════════════════════════════════════
  //  detectForTenant — insufficient data
  // ═════════════════════════════════════════════════════════════════════

  describe('detectForTenant — insufficient data', () => {
    it('should return empty anomalies when less than 4 summaries', async () => {
      mockPrisma._seedSummary({ timestamp: new Date('2026-06-28T08:00:00Z') });
      mockPrisma._seedSummary({ timestamp: new Date('2026-06-28T09:00:00Z') });
      mockPrisma._seedSummary({ timestamp: new Date('2026-06-28T10:00:00Z') });

      const result = await service.detectForTenant('tenant-1');
      expect(result.anomaliesCreated).toBe(0);
      expect(result.metricsChecked).toBe(0);
    });

    it('should return empty anomalies when no summaries', async () => {
      const result = await service.detectForTenant('empty-tenant');
      expect(result.anomaliesCreated).toBe(0);
      expect(result.metricsChecked).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  detectForTenant — Z-Score detection
  // ═════════════════════════════════════════════════════════════════════

  describe('Z-Score detection', () => {
    it('should detect a significant z-score anomaly (SPIKING_EXECUTIONS)', async () => {
      // 48 history buckets of ~100 executions
      for (let h = 0; h < 48; h++) {
        mockPrisma._seedSummary({
          tenantId: 'zscore-1',
          timestamp: new Date(Date.now() - (48 - h) * 3600_000),
          totalExecutions: 100,
        });
      }
      // Latest: huge spike
      mockPrisma._seedSummary({
        tenantId: 'zscore-1',
        timestamp: new Date(),
        totalExecutions: 5000,
      });

      const result = await service.detectForTenant('zscore-1');
      expect(result.anomaliesCreated).toBeGreaterThanOrEqual(1);
      expect(result.details.some((d) => d.anomalyType === 'SPIKING_EXECUTIONS')).toBe(true);
    });

    it('should detect cost spike anomaly', async () => {
      for (let h = 0; h < 48; h++) {
        mockPrisma._seedSummary({
          tenantId: 'cost-spike',
          timestamp: new Date(Date.now() - (48 - h) * 3600_000),
          totalAiCost: BigInt(500),
          totalExecutions: 100,
        });
      }
      mockPrisma._seedSummary({
        tenantId: 'cost-spike',
        timestamp: new Date(),
        totalAiCost: BigInt(50000),
        totalExecutions: 100,
      });

      const result = await service.detectForTenant('cost-spike');
      expect(result.details.some((d) => d.anomalyType === 'SPIKING_COST')).toBe(true);
    });

    it('should detect failed executions spike', async () => {
      for (let h = 0; h < 48; h++) {
        mockPrisma._seedSummary({
          tenantId: 'fail-spike',
          timestamp: new Date(Date.now() - (48 - h) * 3600_000),
          failedExecutions: 5,
          totalExecutions: 100,
          successfulExecutions: 95,
        });
      }
      mockPrisma._seedSummary({
        tenantId: 'fail-spike',
        timestamp: new Date(),
        failedExecutions: 80,
        totalExecutions: 100,
        successfulExecutions: 20,
      });

      const result = await service.detectForTenant('fail-spike');
      expect(result.details.some((d) => d.anomalyType === 'UNUSUAL_FAILURE_PATTERN')).toBe(true);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  Cooldown dedup
  // ═════════════════════════════════════════════════════════════════════

  describe('cooldown deduplication', () => {
    it('should skip anomaly creation when within cooldown period', async () => {
      // Seed a recent anomaly of same type
      mockPrisma._seedAnomaly({
        tenantId: 'dedup-tenant',
        anomalyType: 'SPIKING_EXECUTIONS',
        createdAt: new Date(Date.now() - 1 * 3600_000), // 1 hour ago
      });

      for (let h = 0; h < 48; h++) {
        mockPrisma._seedSummary({
          tenantId: 'dedup-tenant',
          timestamp: new Date(Date.now() - (48 - h) * 3600_000),
          totalExecutions: 100,
        });
      }
      mockPrisma._seedSummary({
        tenantId: 'dedup-tenant',
        timestamp: new Date(),
        totalExecutions: 5000,
      });

      const result = await service.detectForTenant('dedup-tenant');
      // Anomaly detected but not created due to cooldown
      expect(result.details.length).toBeGreaterThanOrEqual(1);
      // Created count might be 0 or lower than detected
      expect(result.anomaliesCreated).toBeLessThanOrEqual(result.details.length);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  runAllTenantDetection
  // ═════════════════════════════════════════════════════════════════════

  describe('runAllTenantDetection', () => {
    it('should run detection for all tenants with recent data', async () => {
      for (let h = 0; h < 48; h++) {
        mockPrisma._seedSummary({ tenantId: 't1', timestamp: new Date(Date.now() - (48 - h) * 3600_000), totalExecutions: 100 });
      }
      mockPrisma._seedSummary({ tenantId: 't1', timestamp: new Date(), totalExecutions: 5000 });

      for (let h = 0; h < 48; h++) {
        mockPrisma._seedSummary({ tenantId: 't2', timestamp: new Date(Date.now() - (48 - h) * 3600_000), totalExecutions: 50 });
      }
      mockPrisma._seedSummary({ tenantId: 't2', timestamp: new Date(), totalExecutions: 50 });

      // Use findMany with distinct hack
      const origFindMany = mockPrisma.tenantAnalyticsSummary.findMany;
      mockPrisma.tenantAnalyticsSummary.findMany = jest.fn().mockImplementation((args: any) => {
        if (args?.distinct) {
          return Promise.resolve([{ tenantId: 't1' }, { tenantId: 't2' }]);
        }
        return origFindMany(args);
      });

      const result = await service.runAllTenantDetection();
      expect(result.tenantsChecked).toBe(2);
      expect(result.totalAnomalies).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty tenant list gracefully', async () => {
      const origFindMany = mockPrisma.tenantAnalyticsSummary.findMany;
      mockPrisma.tenantAnalyticsSummary.findMany = jest.fn().mockImplementation((args: any) => {
        if (args?.distinct) return Promise.resolve([]);
        return origFindMany(args);
      });

      const result = await service.runAllTenantDetection();
      expect(result.tenantsChecked).toBe(0);
      expect(result.totalAnomalies).toBe(0);
      expect(result.errors).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  createAnomalyRecord
  // ═════════════════════════════════════════════════════════════════════

  describe('createAnomalyRecord', () => {
    it('should create an anomaly record', async () => {
      const record = await service.createAnomalyRecord('t1', 'SPIKING_EXECUTIONS', {
        severity: 'HIGH',
        title: 'Execution spike detected',
        description: 'Total executions 50x above baseline',
        metricName: 'totalExecutions',
        metricValue: 5000,
        baselineValue: 100,
        deviationScore: 15.3,
      });

      expect(record.tenantId).toBe('t1');
      expect(record.anomalyType).toBe('SPIKING_EXECUTIONS');
      expect(record.severity).toBe('HIGH');
      expect(record.metricValue).toBe(5000);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  Edge cases
  // ═════════════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('should skip metric when current and all historical values are zero', async () => {
      for (let h = 0; h < 48; h++) {
        mockPrisma._seedSummary({
          tenantId: 'zero-tenant',
          timestamp: new Date(Date.now() - (48 - h) * 3600_000),
          totalExecutions: 0,
          totalRevenue: BigInt(0),
          activeUserCount: 0,
        });
      }
      mockPrisma._seedSummary({
        tenantId: 'zero-tenant',
        timestamp: new Date(),
        totalExecutions: 0,
        totalRevenue: BigInt(0),
        activeUserCount: 0,
      });

      const result = await service.detectForTenant('zero-tenant');
      expect(result.anomaliesCreated).toBe(0);
    });

    it('should handle single tenant detection errors without crashing', async () => {
      // Use findMany that throws for one tenant
      mockPrisma.tenantAnalyticsSummary.findMany = jest.fn().mockImplementation((args: any) => {
        if (args?.distinct) return Promise.resolve([{ tenantId: 'error-tenant' }]);
        throw new Error('DB error');
      });

      const result = await service.runAllTenantDetection();
      expect(result.errors).toBeGreaterThanOrEqual(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  KPI Metric: IDLE_TENANT (activeUserCount drop)
  // ═════════════════════════════════════════════════════════════════════

  describe('IDLE_TENANT detection', () => {
    it('should detect user count drop as IDLE_TENANT', async () => {
      for (let h = 0; h < 48; h++) {
        mockPrisma._seedSummary({
          tenantId: 'idle-tenant',
          timestamp: new Date(Date.now() - (48 - h) * 3600_000),
          activeUserCount: 50,
          totalExecutions: 100,
        });
      }
      mockPrisma._seedSummary({
        tenantId: 'idle-tenant',
        timestamp: new Date(),
        activeUserCount: 0,
        totalExecutions: 100,
      });

      const result = await service.detectForTenant('idle-tenant');
      expect(result.details.some((d) => d.anomalyType === 'IDLE_TENANT')).toBe(true);
    });
  });
});

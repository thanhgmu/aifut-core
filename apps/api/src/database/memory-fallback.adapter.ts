// ═══════════════════════════════════════════════════════════════════════════
// MemoryDatabaseStore — Lớp bộ nhớ đệm dự phòng (Memory Fallback Adapter)
// Singleton chạy trên RAM, tự động chuyển mạch khi Prisma Engine gãy.
//
// Kích hoạt: RUNTIME_MODE="local-memory" trong .env.local
// Hoặc: Prisma query throw error → auto fallback sang RAM store.
// ═══════════════════════════════════════════════════════════════════════════

export interface FxRateRecord {
  id: string;
  tenantId: string | null; // null = tỷ giá mặc định toàn hệ thống
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  updatedAt: Date;
}

export interface TenantAnalyticsSummaryRecord {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  period: 'HOURLY' | 'DAILY';
  timestamp: Date;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  avgExecutionDurationMs: number;
  totalAiTokens: bigint;
  totalInputTokens: bigint;
  totalOutputTokens: bigint;
  totalAiCost: bigint;
  aiCallCount: number;
  totalRevenue: bigint;
  invoiceCount: number;
  paymentCount: number;
  totalPaymentAmount: bigint;
  activeUserCount: number;
  newUserCount: number;
  newIntegrationCount: number;
  storageBytesTotal: bigint;
  storageBytesDelta: bigint;
  notificationSentCount: number;
  notificationFailedCount: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface BudgetPolicyRecord {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  name: string;
  type: 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'PER_EXECUTION' | 'TOTAL';
  limitAmount: bigint;
  currentSpend: bigint;
  currency: string;
  isActive: boolean;
  notifyAtPercent: number;
  hardCap: boolean;
  actionOnExceed: 'BLOCK' | 'NOTIFY' | 'ESCALATE';
  metricScope: string[];
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

type TableData<T> = Map<string, T>;

export class MemoryDatabaseStore {
  private static instance: MemoryDatabaseStore;

  // ── 3 bảng dữ liệu lưu trữ on-RAM ───────────────────────────────────
  readonly fxRates: TableData<FxRateRecord>;
  readonly tenantAnalytics: TableData<TenantAnalyticsSummaryRecord>;
  readonly budgetPolicies: TableData<BudgetPolicyRecord>;

  private constructor() {
    this.fxRates = new Map<string, FxRateRecord>();
    this.tenantAnalytics = new Map<string, TenantAnalyticsSummaryRecord>();
    this.budgetPolicies = new Map<string, BudgetPolicyRecord>();

    // Seed tỷ giá mặc định khi khởi tạo
    this.seedDefaultFxRates();
  }

  // ── Singleton ────────────────────────────────────────────────────────

  static getInstance(): MemoryDatabaseStore {
    if (!MemoryDatabaseStore.instance) {
      MemoryDatabaseStore.instance = new MemoryDatabaseStore();
    }
    return MemoryDatabaseStore.instance;
  }

  // ── Kiểm tra chế độ runtime ──────────────────────────────────────────

  /** Kiểm tra xem RUNTIME_MODE có đang ở local-memory không */
  static isLocalMemoryMode(): boolean {
    return process.env.RUNTIME_MODE === 'local-memory';
  }

  /** Kiểm tra toàn bộ trạng thái — dùng làm sink cho switch logic */
  static shouldFallback(): boolean {
    return MemoryDatabaseStore.isLocalMemoryMode();
  }

  // ── FxRate operations ────────────────────────────────────────────────

  private seedDefaultFxRates(): void {
    const defaultRates: Array<{
      base: string;
      target: string;
      rate: number;
    }> = [
      { base: 'USD', target: 'VND', rate: 25400 },
      { base: 'USD', target: 'EUR', rate: 0.92 },
      { base: 'EUR', target: 'USD', rate: 1.087 },
      { base: 'USD', target: 'THB', rate: 35.0 },
      { base: 'USD', target: 'IDR', rate: 15700 },
      { base: 'USD', target: 'MYR', rate: 4.4 },
      { base: 'USD', target: 'PHP', rate: 56.0 },
      { base: 'USD', target: 'SGD', rate: 1.33 },
      { base: 'VND', target: 'USD', rate: 1 / 25400 },
    ];

    const now = new Date();
    for (const rate of defaultRates) {
      const key = `sys:${rate.base}:${rate.target}`;
      this.fxRates.set(key, {
        id: key,
        tenantId: null,
        baseCurrency: rate.base,
        targetCurrency: rate.target,
        rate: rate.rate,
        updatedAt: now,
      });
    }
  }

  getFxRate(baseCurrency: string, targetCurrency: string): FxRateRecord | undefined {
    // Ưu tiên tìm tenant-specific trước, fallback system-wide
    const key = `sys:${baseCurrency}:${targetCurrency}`;
    return this.fxRates.get(key);
  }

  setFxRate(record: FxRateRecord): void {
    const key = record.tenantId
      ? `${record.tenantId}:${record.baseCurrency}:${record.targetCurrency}`
      : `sys:${record.baseCurrency}:${record.targetCurrency}`;
    this.fxRates.set(key, { ...record, id: key, updatedAt: new Date() });
  }

  /** Lấy toàn bộ tỷ giá — dùng cho danh sách rates */
  getAllFxRates(): FxRateRecord[] {
    return Array.from(this.fxRates.values());
  }

  /** Lấy tỷ giá theo tenant */
  getFxRatesByTenant(tenantId: string): FxRateRecord[] {
    return Array.from(this.fxRates.values()).filter(
      (r) => r.tenantId === tenantId || r.tenantId === null,
    );
  }

  // ── TenantAnalytics operations ───────────────────────────────────────

  upsertAnalytics(record: TenantAnalyticsSummaryRecord): void {
    const compositeKey = `${record.tenantId}:${record.period}:${record.timestamp.toISOString()}:${record.workspaceId ?? 'null'}`;
    this.tenantAnalytics.set(compositeKey, { ...record, id: compositeKey });
  }

  getAnalyticsByTenant(
    tenantId: string,
    period?: 'HOURLY' | 'DAILY',
    since?: Date,
  ): TenantAnalyticsSummaryRecord[] {
    return Array.from(this.tenantAnalytics.values()).filter((r) => {
      if (r.tenantId !== tenantId) return false;
      if (period && r.period !== period) return false;
      if (since && r.timestamp < since) return false;
      return true;
    });
  }

  // ── BudgetPolicy operations ──────────────────────────────────────────

  upsertBudgetPolicy(record: BudgetPolicyRecord): void {
    this.budgetPolicies.set(record.id, { ...record, updatedAt: new Date() });
  }

  getBudgetPoliciesByTenant(tenantId: string): BudgetPolicyRecord[] {
    return Array.from(this.budgetPolicies.values()).filter(
      (r) => r.tenantId === tenantId,
    );
  }

  getActiveBudgetPolicies(tenantId: string): BudgetPolicyRecord[] {
    return Array.from(this.budgetPolicies.values()).filter(
      (r) => r.tenantId === tenantId && r.isActive,
    );
  }

  /** Reset toàn bộ dữ liệu on-RAM (dùng cho test / soft reset) */
  clearAll(): void {
    this.fxRates.clear();
    this.tenantAnalytics.clear();
    this.budgetPolicies.clear();
    this.seedDefaultFxRates();
  }

  /** Trả về snapshot thống kê dung lượng bộ nhớ */
  getStats(): { fxRates: number; tenantAnalytics: number; budgetPolicies: number } {
    return {
      fxRates: this.fxRates.size,
      tenantAnalytics: this.tenantAnalytics.size,
      budgetPolicies: this.budgetPolicies.size,
    };
  }
}

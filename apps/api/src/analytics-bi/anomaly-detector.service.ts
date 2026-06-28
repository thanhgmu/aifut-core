// ═══════════════════════════════════════════════════════════════════════════
// anomaly-detector.service.ts — Statistical Anomaly Detection Engine
// ═══════════════════════════════════════════════════════════════════════════
// Phát hiện bất thường trên TenantAnalyticsSummary bằng statistical approach:
//   • Z-Score (|z| > 3 = CRITICAL, > 2.5 = HIGH, > 2 = MEDIUM)
//   • IQR Outlier (Q1 - 1.5*IQR hoặc Q3 + 1.5*IQR)
//   • Moving Average deviation (> 2x MA hoặc < 0.5x MA)
//
// Không thêm ML dependency — pure math, local-first.
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

// ── Types ─────────────────────────────────────────────────────────────────

export interface AnomalyDetectionResult {
  tenantId: string;
  anomaliesCreated: number;
  metricsChecked: number;
  durationMs: number;
  details: Array<{
    metricName: string;
    value: number;
    baselineValue: number;
    deviationScore: number;
    anomalyType: string;
    severity: string;
    title: string;
    description: string | null;
  }>;
}

export interface AnomalyDetectionOptions {
  period?: 'HOURLY' | 'DAILY';
  historyWindow?: number;  // Số lượng history buckets để tính baseline
  zScoreThreshold?: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
  };
  iqrMultiplier?: number;
  movingAvgRatio?: {
    upper: number;  // > this * MA = anomaly
    lower: number;  // < this * MA = anomaly
  };
  cooldownHours?: number; // Không tạo trùng anomaly type cho cùng tenant trong khoảng này
}

// ── KPI Metric Definitions ────────────────────────────────────────────────

interface KpiDefinition {
  name: string;
  label: string;
  extractValue: (summary: any) => number;
  anomalyTypeForIncrease: string;
  anomalyTypeForDecrease: string;
  increaseIsAnomaly: boolean;
  decreaseIsAnomaly: boolean;
  checkZScore: boolean;
  checkIqr: boolean;
  checkMovingAvg: boolean;
}

const DEFAULT_KPI_METRICS: KpiDefinition[] = [
  {
    name: 'totalExecutions',
    label: 'Total Workflow Executions',
    extractValue: (s: any) => s.totalExecutions,
    anomalyTypeForIncrease: 'SPIKING_EXECUTIONS',
    anomalyTypeForDecrease: 'IDLE_TENANT',
    increaseIsAnomaly: true,
    decreaseIsAnomaly: true,
    checkZScore: true,
    checkIqr: true,
    checkMovingAvg: true,
  },
  {
    name: 'failedExecutions',
    label: 'Failed Workflow Executions',
    extractValue: (s: any) => s.failedExecutions,
    anomalyTypeForIncrease: 'UNUSUAL_FAILURE_PATTERN',
    anomalyTypeForDecrease: '',
    increaseIsAnomaly: true,
    decreaseIsAnomaly: false,
    checkZScore: true,
    checkIqr: true,
    checkMovingAvg: true,
  },
  {
    name: 'totalAiCost',
    label: 'Total AI Cost (cents)',
    extractValue: (s: any) => Number(s.totalAiCost),
    anomalyTypeForIncrease: 'SPIKING_COST',
    anomalyTypeForDecrease: '',
    increaseIsAnomaly: true,
    decreaseIsAnomaly: false,
    checkZScore: true,
    checkIqr: true,
    checkMovingAvg: true,
  },
  {
    name: 'totalAiTokens',
    label: 'Total AI Tokens',
    extractValue: (s: any) => Number(s.totalAiTokens),
    anomalyTypeForIncrease: 'SPIKING_TOKENS',
    anomalyTypeForDecrease: '',
    increaseIsAnomaly: true,
    decreaseIsAnomaly: false,
    checkZScore: true,
    checkIqr: false,   // Tokens vary widely; z-score + MA is enough
    checkMovingAvg: true,
  },
  {
    name: 'totalRevenue',
    label: 'Total Revenue (cents)',
    extractValue: (s: any) => Number(s.totalRevenue),
    anomalyTypeForIncrease: '',
    anomalyTypeForDecrease: 'ZERO_REVENUE',
    increaseIsAnomaly: false,
    decreaseIsAnomaly: true,
    checkZScore: true,
    checkIqr: false,
    checkMovingAvg: true,
  },
  {
    name: 'activeUserCount',
    label: 'Active User Count',
    extractValue: (s: any) => s.activeUserCount,
    anomalyTypeForIncrease: '',
    anomalyTypeForDecrease: 'IDLE_TENANT',
    increaseIsAnomaly: false,
    decreaseIsAnomaly: true,
    checkZScore: true,
    checkIqr: true,
    checkMovingAvg: true,
  },
  {
    name: 'storageBytesTotal',
    label: 'Total Storage (bytes)',
    extractValue: (s: any) => Number(s.storageBytesTotal),
    anomalyTypeForIncrease: 'STORAGE_GROWTH',
    anomalyTypeForDecrease: '',
    increaseIsAnomaly: true,
    decreaseIsAnomaly: false,
    checkZScore: false,  // Storage grows monotonically; z-score isn't useful
    checkIqr: false,
    checkMovingAvg: true,
  },
];

const DEFAULT_OPTIONS: AnomalyDetectionOptions = {
  period: 'HOURLY',
  historyWindow: 48,  // 48 hours for hourly, 30 days for daily
  zScoreThreshold: {
    LOW: 2.0,
    MEDIUM: 2.5,
    HIGH: 3.0,
    CRITICAL: 4.0,
  },
  iqrMultiplier: 1.5,
  movingAvgRatio: {
    upper: 2.0,   // > 2x moving average
    lower: 0.3,   // < 0.3x moving average
  },
  cooldownHours: 6, // Không lặp lại cảnh báo trong 6h
};

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class AnomalyDetectorService {
  private readonly logger = new Logger(AnomalyDetectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ═════════════════════════════════════════════════════════════════════
  //  PUBLIC API: Run detection for all tenants
  // ═════════════════════════════════════════════════════════════════════

  /**
   * runAllTenantDetection
   * ─────────────────────
   * Gọi từ cron. Duyệt tất cả tenant có dữ liệu analytics gần đây.
   */
  async runAllTenantDetection(
    options: AnomalyDetectionOptions = {},
  ): Promise<{ totalAnomalies: number; tenantsChecked: number; errors: number }> {
    const start = Date.now();
    const opts = { ...DEFAULT_OPTIONS, ...options };
    this.logger.log(`Anomaly detection starting for all tenants (period=${opts.period})`);

    // Lấy danh sách tenant có dữ liệu trong history window
    const since = new Date();
    if (opts.period === 'HOURLY') {
      since.setHours(since.getHours() - (opts.historyWindow ?? 48));
    } else {
      since.setDate(since.getDate() - (opts.historyWindow ?? 30));
    }

    const tenantIds = await this.prisma.tenantAnalyticsSummary.findMany({
      where: {
        period: opts.period,
        timestamp: { gte: since },
      },
      select: { tenantId: true },
      distinct: ['tenantId'],
    });

    const uniqueTenantIds = [...new Set(tenantIds.map((t) => t.tenantId))];
    this.logger.log(`Found ${uniqueTenantIds.length} tenants with recent analytics data`);

    let totalAnomalies = 0;
    let errors = 0;

    for (const tenantId of uniqueTenantIds) {
      try {
        const result = await this.detectForTenant(tenantId, opts);
        totalAnomalies += result.anomaliesCreated;
      } catch (err: any) {
        this.logger.warn(`Detection failed for tenant ${tenantId}: ${err.message}`);
        errors++;
      }
    }

    const durationMs = Date.now() - start;
    this.logger.log(
      `Anomaly detection complete: ${uniqueTenantIds.length} tenants, ` +
      `${totalAnomalies} anomalies, ${errors} errors in ${durationMs}ms`,
    );
    return { totalAnomalies, tenantsChecked: uniqueTenantIds.length, errors };
  }

  /**
   * detectForTenant
   * ───────────────
   * Chạy detection cho một tenant cụ thể. Dùng cho real-time check từ dashboard.
   */
  async detectForTenant(
    tenantId: string,
    options: AnomalyDetectionOptions = {},
  ): Promise<AnomalyDetectionResult> {
    const start = Date.now();
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // ── Lấy history data ────────────────────────────────────────────
    const since = new Date();
    if (opts.period === 'HOURLY') {
      since.setHours(since.getHours() - (opts.historyWindow ?? 48));
    } else {
      since.setDate(since.getDate() - (opts.historyWindow ?? 30));
    }

    const summaries = await this.prisma.tenantAnalyticsSummary.findMany({
      where: {
        tenantId,
        period: opts.period,
        timestamp: { gte: since },
        workspaceId: null, // Chỉ check tenant-level
      },
      orderBy: { timestamp: 'asc' },
      select: {
        timestamp: true,
        totalExecutions: true,
        successfulExecutions: true,
        failedExecutions: true,
        totalAiTokens: true,
        totalAiCost: true,
        totalRevenue: true,
        activeUserCount: true,
        storageBytesTotal: true,
        aiCallCount: true,
        newUserCount: true,
      },
    });

    if (summaries.length < 4) {
      return {
        tenantId,
        anomaliesCreated: 0,
        metricsChecked: 0,
        durationMs: Date.now() - start,
        details: [],
      };
    }

    // ── Latest value is the current bucket ──────────────────────────
    const latestSummary = summaries[summaries.length - 1];
    const historyData = summaries.slice(0, -1); // All except latest

    const details: AnomalyDetectionResult['details'] = [];
    let anomaliesCreated = 0;

    for (const kpi of DEFAULT_KPI_METRICS) {
      const currentValue = kpi.extractValue(latestSummary);
      const historicalValues = historyData.map(kpi.extractValue).filter((v) => v >= 0);

      if (historicalValues.length < 4) continue;

      const detection = this.detectKpi(
        kpi,
        currentValue,
        historicalValues,
        opts,
      );

      if (detection) {
        // ── Dedup: kiểm tra cooldown ──────────────────────────────
        const anomalyType = detection.anomalyType as any;
        const isDuplicate = await this.isDuplicateAnomaly(
          tenantId,
          anomalyType,
          opts.cooldownHours ?? 6,
        );

        if (!isDuplicate) {
          await this.createAnomalyRecord(tenantId, anomalyType, {
            severity: detection.severity,
            title: detection.title,
            description: detection.description,
            metricName: kpi.name,
            metricValue: detection.value,
            baselineValue: detection.baselineValue,
            deviationScore: detection.deviationScore,
          });
          anomaliesCreated++;
        }

        details.push({
          metricName: kpi.name,
          value: detection.value,
          baselineValue: detection.baselineValue,
          deviationScore: detection.deviationScore,
          anomalyType: detection.anomalyType,
          severity: detection.severity,
          title: detection.title,
          description: detection.description,
        });
      }
    }

    return {
      tenantId,
      anomaliesCreated,
      metricsChecked: DEFAULT_KPI_METRICS.length,
      durationMs: Date.now() - start,
      details,
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  DETECTION ENGINE — Statistical Methods
  // ═════════════════════════════════════════════════════════════════════

  /**
   * detectKpi
   * ─────────
   * Chạy 3 phương pháp phát hiện trên một KPI:
   * 1. Z-Score
   * 2. IQR (Interquartile Range)
   * 3. Moving Average Deviation
   * Trả về anomaly đầu tiên match (ưu tiên nghiêm trọng nhất).
   */
  private detectKpi(
    kpi: KpiDefinition,
    currentValue: number,
    historicalValues: number[],
    opts: AnomalyDetectionOptions,
  ): {
    anomalyType: string;
    severity: string;
    title: string;
    description: string | null;
    value: number;
    baselineValue: number;
    deviationScore: number;
  } | null {
    if (currentValue === 0 && historicalValues.every((v) => v === 0)) {
      return null; // Skip if everything is zero (no data, not anomaly)
    }

    const sorted = [...historicalValues].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((s, v) => s + v, 0) / n;
    const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const stddev = Math.sqrt(variance);

    // Moving average (last N/2 values)
    const maWindow = Math.max(4, Math.floor(n / 2));
    const recentValues = historicalValues.slice(-maWindow);
    const movingAvg = recentValues.reduce((s, v) => s + v, 0) / recentValues.length;

    // Z-Score check
    if (kpi.checkZScore && stddev > 0) {
      const zScore = Math.abs((currentValue - mean) / stddev);
      const thresholds = opts.zScoreThreshold!;
      let severity: string | null = null;

      if (zScore >= thresholds.CRITICAL) severity = 'CRITICAL';
      else if (zScore >= thresholds.HIGH) severity = 'HIGH';
      else if (zScore >= thresholds.MEDIUM) severity = 'MEDIUM';
      else if (zScore >= thresholds.LOW) severity = 'LOW';

      if (severity) {
        const isIncrease = currentValue > mean;
        const anomalyType = this.pickAnomalyType(kpi, isIncrease);
        if (!anomalyType) return null;

        return {
          anomalyType,
          severity,
          title: `${kpi.label} — ${isIncrease ? 'Spike' : 'Drop'} Detected (z=${zScore.toFixed(2)})`,
          description: `Current: ${this.formatValue(currentValue, kpi.name)}, ` +
            `Baseline: ${this.formatValue(mean, kpi.name)}, ` +
            `StdDev: ${this.formatValue(stddev, kpi.name)}, Z-Score: ${zScore.toFixed(2)}`,
          value: currentValue,
          baselineValue: mean,
          deviationScore: zScore,
        };
      }
    }

    // IQR check
    if (kpi.checkIqr && n >= 6) {
      const q1Index = Math.floor(n * 0.25);
      const q3Index = Math.floor(n * 0.75);
      const q1 = sorted[q1Index];
      const q3 = sorted[q3Index];
      const iqr = q3 - q1;
      const iqrMultiplier = opts.iqrMultiplier ?? 1.5;
      const lowerBound = q1 - iqrMultiplier * iqr;
      const upperBound = q3 + iqrMultiplier * iqr;

      let isIqrAnomaly = false;
      let iqrDeviated = false;

      if (kpi.increaseIsAnomaly && currentValue > upperBound && upperBound > 0) {
        isIqrAnomaly = true;
        iqrDeviated = true;
      }
      if (kpi.decreaseIsAnomaly && currentValue < lowerBound && lowerBound > 0) {
        // Chỉ detect drop anomaly nếu hiện tại > 0
        if (currentValue > 0 || historicalValues.some((v) => v > 0)) {
          isIqrAnomaly = true;
          iqrDeviated = false;
        }
      }

      if (isIqrAnomaly && upperBound > lowerBound) {
        const deviationScore = iqrDeviated
          ? (currentValue - q3) / iqr
          : (q1 - currentValue) / iqr;
        const isIncrease = currentValue > q3;
        const anomalyType = this.pickAnomalyType(kpi, isIncrease);
        if (!anomalyType) return null;

        return {
          anomalyType,
          severity: deviationScore > 3 ? 'HIGH' : deviationScore > 2 ? 'MEDIUM' : 'LOW',
          title: `${kpi.label} — IQR Outlier (${isIncrease ? 'Above' : 'Below'} Range)`,
          description: `Current: ${this.formatValue(currentValue, kpi.name)}, ` +
            `Q1: ${this.formatValue(q1, kpi.name)}, Q3: ${this.formatValue(q3, kpi.name)}, ` +
            `IQR: ${this.formatValue(iqr, kpi.name)}`,
          value: currentValue,
          baselineValue: median(sorted),
          deviationScore,
        };
      }
    }

    // Moving Average deviation check
    if (kpi.checkMovingAvg && movingAvg > 0) {
      const ratio = currentValue / movingAvg;
      const upperRatio = opts.movingAvgRatio?.upper ?? 2.0;
      const lowerRatio = opts.movingAvgRatio?.lower ?? 0.3;

      let isMaAnomaly = false;
      let isIncrease = false;

      if (kpi.increaseIsAnomaly && ratio > upperRatio) {
        isMaAnomaly = true;
        isIncrease = true;
      }
      if (kpi.decreaseIsAnomaly && ratio < lowerRatio && currentValue > 0) {
        isMaAnomaly = true;
        isIncrease = false;
      }

      if (isMaAnomaly) {
        const anomalyType = this.pickAnomalyType(kpi, isIncrease);
        if (!anomalyType) return null;

        const deviationScore = isIncrease ? ratio : 1 / ratio;
        return {
          anomalyType,
          severity: deviationScore > 4 ? 'HIGH' : deviationScore > 2.5 ? 'MEDIUM' : 'LOW',
          title: `${kpi.label} — ${isIncrease ? 'Spike' : 'Drop'} vs Moving Average (${ratio.toFixed(2)}x)`,
          description: `Current: ${this.formatValue(currentValue, kpi.name)}, ` +
            `Moving Avg (${maWindow} periods): ${this.formatValue(movingAvg, kpi.name)}, ` +
            `Ratio: ${ratio.toFixed(2)}x`,
          value: currentValue,
          baselineValue: movingAvg,
          deviationScore,
        };
      }
    }

    return null;
  }

  // ═════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═════════════════════════════════════════════════════════════════════

  /**
   * pickAnomalyType
   * ───────────────
   * Chọn AnomalyType enum value dựa trên KPI và direction (increase/decrease).
   */
  private pickAnomalyType(kpi: KpiDefinition, isIncrease: boolean): string | null {
    if (isIncrease && kpi.increaseIsAnomaly && kpi.anomalyTypeForIncrease) {
      return kpi.anomalyTypeForIncrease;
    }
    if (!isIncrease && kpi.decreaseIsAnomaly && kpi.anomalyTypeForDecrease) {
      return kpi.anomalyTypeForDecrease;
    }
    return null;
  }

  /**
   * isDuplicateAnomaly
   * ──────────────────
   * Kiểm tra trong cooldown period đã có anomaly cùng type cho tenant chưa.
   */
  private async isDuplicateAnomaly(
    tenantId: string,
    anomalyType: string,
    cooldownHours: number,
  ): Promise<boolean> {
    const cooldownSince = new Date();
    cooldownSince.setHours(cooldownSince.getHours() - cooldownHours);

    const existing = await this.prisma.anomalyRecord.findFirst({
      where: {
        tenantId,
        anomalyType: anomalyType as any,
        createdAt: { gte: cooldownSince },
      },
    });
    return existing !== null;
  }

  /**
   * createAnomalyRecord
   * ───────────────────
   * Tạo AnomalyRecord trong DB với đầy đủ metadata.
   */
  async createAnomalyRecord(
    tenantId: string,
    anomalyType: string,
    data: {
      severity: string;
      title: string;
      description?: string | null;
      metricName?: string | null;
      metricValue?: number | null;
      baselineValue?: number | null;
      deviationScore?: number | null;
    },
  ): Promise<any> {
    return this.prisma.anomalyRecord.create({
      data: {
        tenantId,
        anomalyType: anomalyType as any,
        severity: data.severity as any,
        title: data.title,
        description: data.description ?? null,
        metricName: data.metricName ?? null,
        metricValue: data.metricValue ?? null,
        baselineValue: data.baselineValue ?? null,
        deviationScore: data.deviationScore ?? null,
        detailsJson: Prisma.DbNull,
      },
    });
  }

  /**
   * formatValue
   * ───────────
   * Format number + unit string hiển thị.
   */
  private formatValue(value: number, metricName: string): string {
    switch (metricName) {
      case 'totalAiCost':
        return `$${(value / 100).toFixed(2)}`;
      case 'totalAiTokens':
        return value > 1_000_000
          ? `${(value / 1_000_000).toFixed(2)}M`
          : value > 1_000
            ? `${(value / 1_000).toFixed(1)}K`
            : `${value}`;
      case 'totalRevenue':
        return `$${(value / 100).toFixed(2)}`;
      case 'storageBytesTotal':
        return value > 1_073_741_824
          ? `${(value / 1_073_741_824).toFixed(2)}GB`
          : value > 1_048_576
            ? `${(value / 1_048_576).toFixed(2)}MB`
            : `${value}B`;
      default:
        return `${Math.round(value)}`;
    }
  }
}

// ── Utility: median ───────────────────────────────────────────────────────

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 0) return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return sorted[Math.floor(n / 2)];
}

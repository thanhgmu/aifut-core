// ============================================================
// reconciliation.config.ts — Ngưỡng hằng số & cron intervals
// ============================================================
// Cấu hình tập trung cho Financial Reconciliation Engine.
// Tất cả giá trị tiền tệ lưu ở đơn vị nhỏ nhất (BigInt) để
// tránh sai số dấu phẩy động — đồng bộ với Wallet.balance.
// ============================================================

import type { ReconciliationThresholds } from './reconciliation.types';

/**
 * Ngưỡng mặc định cho audit loop.
 * Có thể override per-tenant qua Entitlement/config trong tương lai.
 */
export const DEFAULT_RECONCILIATION_THRESHOLDS: ReconciliationThresholds = {
  // Sai lệch wallet vs ledger tối đa cho phép trước khi WARNING (1.000 VND)
  balanceToleranceVnd: 1000n,
  // Sai lệch ledger vs invoice tối đa — zero tolerance
  invoiceToleranceVnd: 0n,
  // % hao hụt so với tổng dòng tiền → CRITICAL
  criticalDiscrepancyPercent: 5.0,
  // Số lần lệch liên tiếp trước khi tự động freeze
  consecutiveDiscrepancyThreshold: 3,
  // Thời gian freeze wallet tối đa (giờ)
  walletFreezeHours: 24,
  // Giao dịch lớn hơn ngưỡng này bị đánh dấu SUSPICIOUS (100 triệu VND)
  highValueTransactionThreshold: 100_000_000n,
};

/**
 * Trọng số (score) cho anti-fraud heuristics trong evaluateFreeze().
 * Tổng điểm quyết định mức độ freeze.
 */
export const ANTI_FRAUD_SCORE = {
  /** Heuristic 1: tỷ lệ sai lệch >= criticalDiscrepancyPercent */
  highDiffPercent: 30,
  /** Heuristic 2: >= 3 discrepancy CRITICAL trong 24h gần nhất */
  recentCriticalBurst: 25,
  /** Heuristic 3: debit lớn bất thường > highValueTransactionThreshold */
  highValueDebit: 25,
  /** Heuristic 4: đột biến số lượng giao dịch > 3x trung bình 7 ngày */
  transactionSpike: 10,
  /** Heuristic 5: duplicate reference trong batch */
  duplicateReference: 10,
} as const;

/**
 * Ngưỡng quyết định freeze dựa trên tổng score.
 */
export const FREEZE_DECISION = {
  /** score >= hardFreezeScore → freeze ANTI_FRAUD_TRIGGER, 24h */
  hardFreezeScore: 50,
  hardFreezeHours: 24,
  /** score >= softFreezeScore → freeze SUSPICIOUS_LEDGER_ACTIVITY, 12h */
  softFreezeScore: 30,
  softFreezeHours: 12,
  /** Cooling timer trước khi freeze thực sự (phút) — giảm false positive */
  coolingMinutes: 5,
} as const;

/**
 * Cron intervals cho ReportSchedulerService (5 jobs theo thiết kế mục V).
 * Dùng cron expression chuẩn (NestJS @nestjs/schedule).
 */
export const RECONCILIATION_CRON = {
  /** [1] Financial Audit Loop — mỗi 6 giờ */
  auditLoop: '0 */6 * * *',
  /** [2] Auto-resolve stale INFO/WARNING — mỗi 1 giờ */
  autoResolveStale: '0 * * * *',
  /** [3] Escalate unacknowledged WARNING — mỗi 1 giờ (lệch 15 phút) */
  escalateUnacknowledged: '15 * * * *',
  /** [4] Auto-unfreeze expired wallets — mỗi 30 phút */
  autoUnfreeze: '*/30 * * * *',
  /** [5] Cleanup old export files — mỗi 1 giờ (lệch 30 phút) */
  cleanupExports: '30 * * * *',
} as const;

/**
 * Giới hạn vận hành (xem mục VII — Rủi ro & Giải pháp).
 */
export const RECONCILIATION_LIMITS = {
  /** Số tenants tối đa quét mỗi lần chạy audit loop */
  maxTenantsPerRun: 100,
  /** Batch size khi xử lý song song */
  batchSize: 10,
  /** Timeout mỗi batch (ms) */
  batchTimeoutMs: 30_000,
  /** Số ngày OPEN trước khi auto-dismiss INFO / escalate WARNING */
  staleAfterDays: 7,
  /** Số giờ file export tồn tại trước khi cleanup */
  exportFileTtlHours: 24,
  /** Kích thước file export tối đa (bytes) */
  maxExportFileBytes: 100 * 1024 * 1024,
} as const;

/**
 * Pagination chunk sizes cho report export (cursor-based, tránh OOM).
 */
export const EXPORT_CHUNK_SIZE = {
  ledgerTransaction: 1000,
  invoice: 500,
  paymentTransaction: 500,
  discrepancyRecord: 200,
} as const;

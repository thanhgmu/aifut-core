// ============================================================
// reconciliation.types.ts — Interfaces cho audit & report payload
// ============================================================
// Kiểu dữ liệu dùng chung cho Reconciliation Engine.
// Enum thực tế nằm trong Prisma schema (@prisma/client); ở đây
// chỉ định nghĩa các shape phục vụ luồng xử lý & API payload.
// ============================================================

/** Các ngưỡng cảnh báo cho audit loop */
export interface ReconciliationThresholds {
  /** Sai lệch wallet vs ledger tối đa cho phép trước khi WARNING */
  balanceToleranceVnd: bigint;
  /** Sai lệch ledger vs invoice tối đa */
  invoiceToleranceVnd: bigint;
  /** % hao hụt so với tổng dòng tiền → CRITICAL */
  criticalDiscrepancyPercent: number;
  /** Số lần lệch liên tiếp trước khi tự động freeze */
  consecutiveDiscrepancyThreshold: number;
  /** Thời gian freeze wallet tối đa (giờ) */
  walletFreezeHours: number;
  /** Giá trị giao dịch lớn hơn ngưỡng này bị đánh dấu SUSPICIOUS */
  highValueTransactionThreshold: bigint;
}

/** Snapshot 3 nguồn sự thật tại một thời điểm (read-only transaction) */
export interface FinancialSnapshot {
  tenantId: string;
  /** A = Wallet.balance */
  walletBalance: bigint;
  /** Wallet có tồn tại hay không (tenant chưa có ví) */
  walletExists: boolean;
  /** SUM(LedgerTransaction.amount WHERE type=CREDIT) */
  creditSum: bigint;
  /** SUM(LedgerTransaction.amount WHERE type=DEBIT) */
  debitSum: bigint;
  /** B = creditSum - debitSum */
  ledgerSum: bigint;
  /** C phần thu = SUM(Invoice.amount WHERE status='paid') */
  paidInvoiceSum: bigint;
  /** Refund = SUM(PaymentTransaction.amount WHERE status='refunded') */
  refundSum: bigint;
  /** Tổng số LedgerTransaction (phục vụ heuristic spike) */
  ledgerTxCount: number;
  takenAt: string;
}

/** Một lệch pha phát hiện được, chưa persist (input cho resolver/ghi record) */
export interface DetectedDiscrepancy {
  category: DiscrepancyCategoryLiteral;
  severity: DiscrepancySeverityLiteral;
  title: string;
  description?: string;
  expectedValue?: bigint;
  actualValue?: bigint;
  diffValue?: bigint;
  source: 'wallet' | 'ledger' | 'invoice' | 'all';
  affectedEntity?: string;
  affectedType?: 'Wallet' | 'LedgerTransaction' | 'Invoice';
}

/** Literal mirrors của Prisma enum để dùng trước khi persist */
export type DiscrepancyCategoryLiteral =
  | 'BALANCE_MISMATCH'
  | 'MISSING_LEDGER_CREDIT_FOR_PAID_INVOICE'
  | 'ORPHAN_LEDGER_CREDIT'
  | 'UNMATCHED_DEBIT'
  | 'DUPLICATE_REFERENCE'
  | 'AMOUNT_MISMATCH'
  | 'SUSPICIOUS_ACTIVITY';

export type DiscrepancySeverityLiteral = 'INFO' | 'WARNING' | 'CRITICAL';

export type WalletFreezeReasonLiteral =
  | 'RECONCILIATION_DISCREPANCY'
  | 'SUSPICIOUS_LEDGER_ACTIVITY'
  | 'ANTI_FRAUD_TRIGGER'
  | 'MANUAL_ADMIN';

/** Kết quả một lần audit */
export interface AuditRunResult {
  runId: string;
  tenantId: string;
  timestamp: string;
  walletBalance: string;
  ledgerSum: string;
  diff: string;
  discrepanciesFound: number;
  criticalCount: number;
  warningsCount: number;
  infoCount: number;
  frozeWallet: boolean;
  durationMs: number;
}

/** Đầu vào manual reconciliation */
export interface ManualReconciliationInput {
  tenantId: string;
  expectedWalletBalance?: bigint;
  note?: string;
}

/** Quyết định freeze từ anti-fraud engine */
export interface FreezeDecision {
  frozen: boolean;
  score: number;
  reason: WalletFreezeReasonLiteral | null;
  expiresAt: string | null;
  triggeredHeuristics: string[];
}

/** Tổng hợp sau khi resolver xử lý batch discrepancies */
export interface ResolutionSummary {
  tenantId: string;
  processed: number;
  autoDismissed: number;
  acknowledgedRequired: number;
  escalated: number;
  freezeDecision: FreezeDecision | null;
}

/** Options cho báo cáo xuất */
export interface ReportExportOptions {
  tenantId: string;
  requestedBy: string;
  reportType: 'daily' | 'weekly' | 'monthly' | 'custom';
  format: 'csv' | 'xlsx';
  dateFrom: Date;
  dateTo: Date;
  includeDetails: boolean;
}

/** Thông tin tiến độ export */
export interface ExportProgress {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0–100
  fileUrl: string | null;
  error: string | null;
  createdAt: string;
}

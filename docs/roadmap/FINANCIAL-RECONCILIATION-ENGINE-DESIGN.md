# Financial Ledger Reconciliation & Reporting Engine

> **Phase 3 — Backend `apps/api`**
> Cập nhật: 2026-06-17
> Module mới: `apps/api/src/payments/reconciliation/`
> Thiết kế kiến trúc và cấu trúc dữ liệu

---

## I. TỔNG QUAN

### 1.1 Vấn đề cần giải quyết

Hệ thống tài chính AIFUT hiện tại có 3 nguồn sự thật riêng biệt:

| Nguồn | Model | Mục đích | Chiều dữ liệu |
|-------|-------|----------|--------------|
| **Wallet** | `Wallet.balance` (BigInt) | Số dư khả dụng thực tế của Tenant | Snapshot hiện tại, optimistic lock |
| **LedgerTransaction** | Append-only CREDIT/DEBIT | Lịch sử biến động dòng tiền | Tổng hợp `SUM(CREDIT) - SUM(DEBIT)` |
| **Invoice + PaymentTransaction** | Mệnh giá thanh toán với Gateway | Hóa đơn phải thu/phải trả | Tổng `Invoice.amount WHERE status=paid` |

**Khiếm khuyết hiện tại:**
- Không có cơ chế **đối soát chéo** định kỳ giữa 3 nguồn
- Không phát hiện tự động khi ledger bị lệch so với invoice
- Không có **hệ thống cảnh báo gian lận (anti-fraud)** gắn với wallet
- Không có API **xuất báo cáo tài chính phi đồng bộ** cho tenant

### 1.2 Phạm vi thiết kế

Module **`reconciliation/`** được xây dựng dưới `payments/` (tận dụng PrismaService, LedgerService, AuditLog có sẵn) với 3 thành phần:

1. **`ReconciliationEngine`** — Service lõi, chạy audit loop, phát hiện lệch pha
2. **`DiscrepancyResolver`** — Xử lý và phân loại giao dịch lệch, freeze wallet anti-fraud
3. **`FinancialReportExporter`** — Tạo báo cáo CSV/Excel dạng stream

```
apps/api/src/payments/reconciliation/
├── reconciliation.module.ts
├── reconciliation.config.ts
├── reconciliation.types.ts
├── reconciliation.service.ts          ← Engine lõi
├── reconciliation.controller.ts       ← API endpoints
├── discrepancy-resolver.service.ts    ← Xử lý lệch pha + anti-fraud
├── financial-report-exporter.service.ts  ← Export báo cáo async
├── report-scheduler.service.ts        ← Cron scheduler cho audit loop
└── reconciliation.guard.ts           ← Permission guard cho endpoints tài chính
```

### 1.3 Quyền truy cập

- **OWNER / ADMIN** của tenant: toàn quyền xem báo cáo + chạy reconcile
- **OPERATOR**: chỉ xem báo cáo, không kích hoạt freeze/unfreeze
- **SYSTEM (internal)**: chạy audit loop + auto-freeze

---

## II. KIẾN TRÚC DỮ LIỆU

### 2.1 Prisma Schema bổ sung

```prisma
// ── Thêm vào schema.prisma ─────────────────────────────────

enum DiscrepancySeverity {
  INFO
  WARNING
  CRITICAL
}

enum DiscrepancyCategory {
  // LedgerTransaction tổng ≠ Wallet.balance
  BALANCE_MISMATCH
  // Invoice đã paid nhưng chưa có LedgerTransaction CREDIT tương ứng
  MISSING_LEDGER_CREDIT_FOR_PAID_INVOICE
  // LedgerTransaction có CREDIT nhưng Invoice vẫn pending
  ORPHAN_LEDGER_CREDIT
  // LedgerTransaction không có PaymentTransaction tương ứng
  UNMATCHED_DEBIT
  // Nhiều LedgerTransaction trỏ đến cùng reference
  DUPLICATE_REFERENCE
  // LedgerTransaction amount ≠ Invoice.amount
  AMOUNT_MISMATCH
  // Thuộc tính phát hiện bởi anti-fraud heuristic
  SUSPICIOUS_ACTIVITY
}

enum DiscrepancyResolutionStatus {
  OPEN
  ACKNOWLEDGED
  INVESTIGATING
  RESOLVED_MANUAL
  RESOLVED_AUTO
  DISMISSED
}

enum WalletFreezeReason {
  RECONCILIATION_DISCREPANCY
  SUSPICIOUS_LEDGER_ACTIVITY
  ANTI_FRAUD_TRIGGER
  MANUAL_ADMIN
}

model ReconciliationRun {
  id              String            @id @default(cuid())
  tenantId        String
  trigger         String            // 'scheduled' | 'manual' | 'webhook'
  startedAt       DateTime          @default(now())
  completedAt     DateTime?
  status          String            @default("running") // running | completed | failed | partial
  walletBalance   BigInt?           // wallet.balance tại thời điểm snapshot
  ledgerSum       BigInt?           // SUM(CREDIT) - SUM(DEBIT) tại thời điểm snapshot
  paidInvoiceSum  BigInt?           // SUM(Invoice.amount) WHERE status='paid'
  discrepancyCount Int              @default(0)
  summary         Json?             // JSON báo cáo rút gọn
  error           String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  @@index([tenantId, startedAt])
  @@index([tenantId, status])
}

model DiscrepancyRecord {
  id              String                    @id @default(cuid())
  runId           String?
  tenantId        String
  severity        DiscrepancySeverity       @default(WARNING)
  category        DiscrepancyCategory
  title           String                    // Ngắn gọn, ví dụ: "Wallet lệch -5,000 VND"
  description     String?                   // Chi tiết
  expectedValue   BigInt?
  actualValue     BigInt?
  diffValue       BigInt?
  source          String                    // 'wallet' | 'ledger' | 'invoice' | 'all'
  affectedEntity  String?                   // ID của entity liên quan
  affectedType    String?                   // 'Wallet' | 'LedgerTransaction' | 'Invoice'
  status          DiscrepancyResolutionStatus @default(OPEN)
  resolutionNote  String?
  resolvedBy      String?                   // userId hoặc 'system'
  resolvedAt      DateTime?
  walletFrozen    Boolean                   @default(false)
  freezeReason    WalletFreezeReason?
  freezeExpiresAt DateTime?                 // auto-unfreeze sau 24h
  metadata        Json?
  createdAt       DateTime                  @default(now())
  updatedAt       DateTime                  @updatedAt

  run             ReconciliationRun?        @relation(fields: [runId], references: [id], onDelete: SetNull)

  @@index([tenantId, severity])
  @@index([tenantId, category, status])
  @@index([tenantId, createdAt])
  @@index([runId])
  @@index([walletFrozen])
}

model FinancialReportJob {
  id              String            @id @default(cuid())
  tenantId        String
  requestedBy     String?           // userId
  status          String            @default("pending") // pending | processing | completed | failed
  reportType      String            // 'daily' | 'weekly' | 'monthly' | 'custom'
  format          String            @default("csv") // csv | xlsx
  dateFrom        DateTime
  dateTo          DateTime
  includeDetails  Boolean           @default(false)
  filePath        String?           // Đường dẫn file sau khi export
  fileSize        Int?              // bytes
  expiresAt       DateTime?
  completedAt     DateTime?
  error           String?
  metadata        Json?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  @@index([tenantId, status])
  @@index([tenantId, createdAt])
  @@index([status])
}
```

### 2.2 Enum / Constant Types (`reconciliation.types.ts`)

```typescript
/** Các ngưỡng cảnh báo cho audit loop */
export interface ReconciliationThresholds {
  /** Sai lệch wallet vs ledger tối đa cho phép trước khi WARNING */
  balanceToleranceVnd: bigint;          // default: 1000n
  /** Sai lệch ledger vs invoice tối đa */
  invoiceToleranceVnd: bigint;          // default: 0n (zero tolerance)
  /** % hao hụt so với tổng dòng tiền → CRITICAL */
  criticalDiscrepancyPercent: number;   // default: 5.0 (5%)
  /** Số lần lệch liên tiếp trước khi tự động freeze */
  consecutiveDiscrepancyThreshold: number; // default: 3
  /** Thời gian freeze wallet tối đa (giờ) */
  walletFreezeHours: number;           // default: 24
  /** Giá trị giao dịch lớn hơn ngưỡng này bị đánh dấu SUSPICIOUS */
  highValueTransactionThreshold: bigint; // default: 100_000_000n (100M VND)
}

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
  progress: number;      // 0–100
  fileUrl: string | null;
  error: string | null;
  createdAt: string;
}
```

---

## III. CHI TIẾT 3 HÀM LOGIC CORE

### 3.1 `runFinancialAuditLoop()` — Quét đối soát chéo tự động

**Mô tả:** Chạy định kỳ, lấy snapshot của 3 nguồn sự thật trong cùng một Prisma transaction, so sánh chéo, ghi `ReconciliationRun` + `DiscrepancyRecord` cho từng lệch pha phát hiện.

**File đích:** `reconciliation.service.ts`

```typescript
// ============================================================
// reconciliation.service.ts — Reconciliation Engine Core
// ============================================================
// 3 nguồn dữ liệu đối soát:
//   A = Wallet.balance (số dư thực tế sau cùng)
//   B = SUM(LedgerTransaction.amount WHERE type=CREDIT)
//     - SUM(LedgerTransaction.amount WHERE type=DEBIT)
//   C = SUM(Invoice.amount WHERE status=paid)
//       - SUM(PaymentTransaction.amount WHERE status=refunded OR refund)
//
// Điều kiện lý tưởng: A = B và A ≈ C (với tolerance cho timing)
//
// Anti-fraud rule:
//   Nếu A ≠ B với diff > criticalDiscrepancyPercent của tổng dòng tiền
//   → freeze wallet + tạo DiscrepancyRecord CRITICAL
// ============================================================

export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discrepancyResolver: DiscrepancyResolverService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * runFinancialAuditLoop
   * =======================
   * Hàm core quét đối soát chéo. Gọi cho 1 tenant hoặc ALL tenants.
   *
   * Flow:
   *   [1] Snapshot wallet balance (BigInt)
   *   [2] Tính ledger sum: SUM(CREDIT) - SUM(DEBIT)
   *   [3] Tính paid invoice sum + refund sum
   *   [4] Tạo ReconciliationRun record
   *   [5] So sánh A vs B
   *   [6] So sánh B vs C
   *   [7] Phát hiện các anomaly khác (orphan debit, duplicate ref)
   *   [8] Ghi từng DiscrepancyRecord
   *   [9] Nếu CRITICAL → gọi DiscrepancyResolver.freezeWallet()
   *   [10] Cập nhật ReconciliationRun.completedAt + summary
   *   [11] Trả về AuditRunResult
   *
   * @param tenantId - ID tenant cần audit (hoặc 'all')
   * @returns AuditRunResult
   */
  async runFinancialAuditLoop(tenantId?: string): Promise<AuditRunResult[]>;

  /**
   * runAuditForSingleTenant
   * =========================
   * Audit 1 tenant trong transaction.
   * Tách biệt để dễ test và retry độc lập.
   */
  private async runAuditForSingleTenant(
    tenantId: string,
    thresholds: ReconciliationThresholds,
  ): Promise<AuditRunResult>;
}
```

**Logic chi tiết `runAuditForSingleTenant()`:**

```
1. Snapshot đồng thời (Prisma $transaction read-only):
   a. `prisma.wallet.findUnique({ where: { tenantId } })`
      → walletBalance
   b. `prisma.ledgerTransaction.aggregate({ where: { tenantId }, _sum: { amount }, by: ['type'] })`
      → creditSum, debitSum → ledgerSum = creditSum - debitSum
   c. `prisma.invoice.aggregate({ where: { tenantId, status: 'paid' }, _sum: { amount } })`
      → paidInvoiceSum
   d. `prisma.paymentTransaction.aggregate({ where: { tenantId, status: 'refunded' }, _sum: { amount } })`
      → refundSum

2. Tính diff:
   walletLedgerDiff = walletBalance - ledgerSum
   ledgerInvoiceDiff = ledgerSum - (paidInvoiceSum - refundSum)

3. Phân loại severity dựa trên thresholds:
   - |diff| ≤ balanceToleranceVnd           → INFO (tự động dismiss)
   - |diff| > balanceToleranceVnd
     và diffPercent < criticalPct            → WARNING
   - |diff| > balanceToleranceVnd
     và diffPercent ≥ criticalPct            → CRITICAL
   - consecutiveCount ≥ threshold            → tự escalate lên CRITICAL
     (đọc DiscrepancyRecord gần nhất của tenant)

4. Ghi ReconciliationRun:
   INSERT với walletBalance, ledgerSum, paidInvoiceSum, status

5. Với mỗi category có diff, ghi DiscrepancyRecord riêng:
   - BALANCE_MISMATCH: wallet vs ledger
   - MISSING_LEDGER_CREDIT_FOR_PAID_INVOICE: invoice paid nhưng không có ledger CREDIT
   - ORPHAN_LEDGER_CREDIT: ledger CREDIT mà invoice vẫn pending
   - AMOUNT_MISMATCH: từng invoice amount ≠ payment amount
   - DUPLICATE_REFERENCE: detect từ Prisma unique constraint violation log

6. Nếu CRITICAL → gọi
   `this.discrepancyResolver.evaluateFreeze(tenantId, discrepancies)`
```

---

### 3.2 Discrepancy Resolver — Phân loại và xử lý giao dịch lệch

**Mô tả:** Nhận đầu vào từ audit loop, phân loại độ nghiêm trọng, ghi vào `AuditLog` + `AuditEvent`, tự động đóng băng ví nếu phát hiện bất thường nghiêm trọng.

**File đích:** `discrepancy-resolver.service.ts`

```typescript
// ============================================================
// discrepancy-resolver.service.ts — Discrepancy Resolver
// ============================================================
// Phân loại và xử lý các giao dịch lệch pha với 3 cấp độ:
//
//   LEVEL 1 — INFO (auto-dismiss):
//     Sai lệch trong tolerance cho phép. Ghi audit log,
//     tự động đánh dấu DISMISSED. Không can thiệp gì thêm.
//
//   LEVEL 2 — WARNING (acknowledge + investigate):
//     Sai lệch ngoài tolerance nhưng dưới ngưỡng nguy hiểm.
//     Ghi audit log, gửi notification đến admin tenant.
//     Yêu cầu admin ACKNOWLEDGED trong vòng 7 ngày.
//     Admin có thể DISMISS hoặc RESOLVE_MANUAL.
//     Nếu quá 7 ngày không acknowledge → tự escalate → LEVEL 3.
//
//   LEVEL 3 — CRITICAL (auto-freeze):
//     Sai lệch vượt ngưỡng nguy hiểm + anti-fraud heuristic.
//     Ghi audit log với level CRITICAL.
//     Gọi WalletFreezeService.freezeWallet() (fire-and-forget).
//     Wallet bị freeze 24h, không cho debit.
//     Gửi email + notification real-time đến admin.
//     Admin phải INVESTIGATING → RESOLVE_MANUAL mới unfreeze.
//     DiscrepancyRecord được link với AuditLog entry.
// ============================================================

export class DiscrepancyResolverService {
  /**
   * resolveDiscrepancies
   * =====================
   * Entry point từ ReconciliationService.
   * Phân loại batch discrepancies, xử lý từng cái theo LEVEL.
   *
   * @param discrepancies - List DiscrepancyRecord vừa tạo
   * @param tenantId
   */
  async resolveDiscrepancies(
    discrepancies: DiscrepancyRecord[],
    tenantId: string,
  ): Promise<ResolutionSummary>;

  /**
   * evaluateFreeze
   * ===============
   * Anti-fraud: kiểm tra heuristic trước khi quyết định freeze.
   *
   * Heuristics:
   *   1. Tổng diff > 5% tổng dòng tiền ledger
   *   2. Có ≥ 3 discrepancy CRITICAL trong 24h gần nhất
   *   3. Discrepancy liên quan đến debit lớn > 100M VND
   *   4. Đột biến số lượng giao dịch > 3σ so với trung bình
   *   5. Phát hiện duplicate reference trong cùng 1 batch
   *
   * Nếu ≥ 2 heuristics kích hoạt → freeze wallet.
   */
  async evaluateFreeze(
    tenantId: string,
    criticalItems: DiscrepancyRecord[],
  ): Promise<FreezeDecision>;

  /**
   * unfreezeWallet
   * ===============
   * Admin manual unfreeze. Yêu cầu INVESTIGATING status trước.
   * Ghi AuditLog entry.
   */
  async unfreezeWallet(
    tenantId: string,
    requestedBy: string,
    reason: string,
  ): Promise<void>;

  /**
   * autoUnfreezeExpired
   * =====================
   * Cron job check: mở khóa wallet đã freeze quá freezeExpiresAt.
   * Chạy mỗi 30 phút.
   */
  async autoUnfreezeExpired(): Promise<number>;

  // ── Helper ──

  /**
   * writeAuditTrail
   * ================
   * Ghi vết discrepancy vào AuditLog và AuditEvent.
   * Mỗi discrepancy tạo 1 entry.
   * CRITICAL/WARNING → AuditEvent với actorType=SYSTEM.
   * Luôn ghi AuditLog (append-only).
   */
  private async writeAuditTrail(
    discrepancy: DiscrepancyRecord,
    decision: FreezeDecision | null,
    tenantId: string,
  ): Promise<void>;
}
```

**Anti-fraud system block logic (`evaluateFreeze` chi tiết):**

```
evaluateFreeze(tenantId, criticalItems):
  score = 0

  // Heuristic 1: tỷ lệ sai lệch
  IF maxDiffPercent >= 5% THEN score += 30

  // Heuristic 2: tần suất gần đây
  recentCriticalCount = count DiscrepancyRecord WHERE
    tenantId = $tenantId AND severity = CRITICAL
    AND createdAt > now - 24h
  IF recentCriticalCount >= 3 THEN score += 25

  // Heuristic 3: debit lớn bất thường
  highValueDebits = filter criticalItems WHERE
    affectedType = 'LedgerTransaction'
    AND diffValue > 100_000_000
  IF highValueDebits.length > 0 THEN score += 25

  // Heuristic 4: đột biến số lượng giao dịch
  avgTxLast7d = AVG(count LedgerTransaction per day in 7 days)
  txToday = count LedgerTransaction WHERE createdAt > today
  IF txToday > avgTxLast7d * 3 THEN score += 10

  // Heuristic 5: duplicate reference
  dupCount = count criticalItems WHERE
    category = DUPLICATE_REFERENCE
  IF dupCount > 0 THEN score += 10

  DECISION:
    IF score >= 50 THEN freezeWallet(tenantId, ANTI_FRAUD_TRIGGER, 24h)
    ELSIF score >= 30 THEN freezeWallet(tenantId, SUSPICIOUS_LEDGER_ACTIVITY, 12h)
    ELSE no freeze (ghi chú WARNING vào DiscrepancyRecord)

  freezeWallet():
    1. UPDATE Wallet SET balance = balance WHERE tenantId = $id (no-op lock)
    2. Ghi AuditEvent: actorType=SYSTEM, action='wallet.frozen'
    3. Ghi AuditLog: action='WALLET_FREEZE', metadata={reason, score, discrepancyIds}
    4. UPDATE DiscrepancyRecord SET walletFrozen=true, freezeReason, freezeExpiresAt
    5. Fire notification: admin của tenant
    6. RETURN FreezeDecision {frozen: true, expiresAt, reason}
```

---

### 3.3 API Export báo cáo bất đồng bộ (Async Financial Report Exporter)

**Mô tả:** Endpoint `POST /billing/reconciliation/export` nhận yêu cầu, tạo `FinancialReportJob` pending, xử lý bất đồng bộ, cho phép polling tiến độ và download file kết quả.

**File đích:** `financial-report-exporter.service.ts`

```typescript
// ============================================================
// financial-report-exporter.service.ts — Async Report Export
// ============================================================
// Sinh báo cáo tài chính phi đồng bộ hỗ trợ:
//   - CSV output (streaming để tránh OOM với dữ liệu lớn)
//   - XLSX output (dùng exceljs hoặc openpyxl-like package)
//   - Phân trang lớn (cursor-based fetch, stream từng chunk)
//   - File tạm thời với expiration (24h)
//
// Flow:
//   POST /billing/reconciliation/export
//   → Tạo FinancialReportJob (status=pending)
//   → Trả về { jobId, status: 'pending' }
//   → Xử lý background (process.nextTick hoặc NestJS SchedulerRegistry)
//   → Poll GET /billing/reconciliation/export/:jobId/status
//   → Khi completed: GET /billing/reconciliation/export/:jobId/download
//
// Dữ liệu báo cáo bao gồm:
//   1. Header: tenant info, khoảng thời gian, thời điểm xuất
//   2. Ledger transactions trong kỳ (CREDIT và DEBIT)
//   3. Invoice trong kỳ (từng hóa đơn + trạng thái + payment)
//   4. Payment transactions trong kỳ
//   5. Reconciliation runs gần nhất (tối đa 30)
//   6. Outstanding discrepancies
//   7. Wallet balance snapshot đầu kỳ và cuối kỳ
//   8. Summary: tổng thu, tổng chi, lệch pha
// ============================================================

export class FinancialReportExporterService {
  /**
   * requestReport
   * ==============
   * Tạo job xuất báo cáo mới.
   * Kiểm tra trùng lặp (cùng tenant + cùng kỳ + cùng format):
   *   Nếu có job completed gần đây → trả về job cũ.
   *   Nếu có job pending → trả về job đang chạy.
   *   Nếu không → tạo mới.
   *
   * @returns { jobId, status, createdAt }
   */
  async requestReport(
    options: ReportExportOptions,
  ): Promise<{ jobId: string; status: string; createdAt: string }>;

  /**
   * getJobStatus
   * =============
   * Kiểm tra tiến độ export.
   * Polling từ frontend: mỗi 3 giây.
   *
   * @returns ExportProgress
   */
  async getJobStatus(jobId: string): Promise<ExportProgress>;

  /**
   * getDownloadStream
   * ==================
   * Trả về ReadableStream của file báo cáo đã hoàn thành.
   * Stream trực tiếp từ disk, không load toàn bộ vào memory.
   * HTTP headers: Content-Disposition attachment, Content-Type text/csv
   *
   * @returns { stream: Readable, filename: string, contentType: string }
   * @throws NotFoundException nếu job chưa hoàn thành
   */
  async getDownloadStream(jobId: string): Promise<{
    stream: NodeJS.ReadableStream;
    filename: string;
    contentType: string;
    contentLength: number;
  }>;

  /**
   * processJob
   * ===========
   * Xử lý job trong background (NestJS SchedulerRegistry timeout).
   *
   * Steps:
   *   1. UPDATE FinancialReportJob SET status='processing'
   *   2. Fetch data với cursor-based pagination:
   *      - LedgerTransaction: chunk 1000 records/lần
   *      - Invoice: chunk 500 records/lần
   *      - PaymentTransaction: chunk 500 records/lần
   *      - DiscrepancyRecord: chunk 200 records/lần
   *   3. Stream ghi file tạm thời:
   *      - CSV: write header row + từng chunk
   *      - XLSX: tạo workbook, chunk ghi sheet
   *   4. Nếu lỗi → UPDATE status='failed', ghi error
   *   5. Nếu xong → UPDATE status='completed', filePath, fileSize
   *
   * Cleanup: file tạm bị xóa sau 24h (cron cleanup job).
   */
  async processJob(jobId: string): Promise<void>;

  /**
   * buildCsvStream
   * ===============
   * Xây dựng CSV output với các sheet/section:
   *
   *   # Section 1 — Summary
   *   Period,2026-06-01,2026-06-17
   *   StartBalance,0
   *   EndBalance,25000000
   *   TotalCredit,35000000
   *   TotalDebit,10000000
   *   TotalPaidInvoices,30000000
   *   DiscrepancyCount,0
   *
   *   # Section 2 — Ledger Transactions
   *   ID,Type,Amount,BalanceAfter,ReferenceType,ReferenceID,Description,CreatedAt
   *   tx_001,CREDIT,500000,500000,invoice,inv_001,Nạp tiền,2026-06-15T10:00:00Z
   *   ...
   *
   *   # Section 3 — Invoices
   *   [invoice fields...]
   *
   *   # Section 4 — Discrepancies
   *   [discrepancy fields...]
   *
   *   # Section 5 — Wallet Snapshots
   *   [period start / end + version info]
   */
  private buildCsvStream(
    jobId: string,
    dateFrom: Date,
    dateTo: Date,
    includeDetails: boolean,
  ): NodeJS.ReadableStream;

  /**
   * cleanupExpiredFiles
   * ====================
   * Cron cleanup: xóa file tạm quá 24h và set job status=expired.
   * Chạy mỗi 1 giờ.
   */
  async cleanupExpiredFiles(): Promise<number>;
}
```

---

## IV. API ROUTES

### 4.1 Endpoints tổng thể

| Method | Path | Mô tả | Auth |
|--------|------|-------|------|
| `GET` | `/billing/reconciliation/status` | Trạng thái tổng quan: lần chạy gần nhất, số discrepancy, wallet freeze | OWNER/ADMIN |
| `POST` | `/billing/reconciliation/run` | Kích hoạt audit loop thủ công | OWNER/ADMIN |
| `GET` | `/billing/reconciliation/runs` | Lịch sử các lần chạy (phân trang) | OWNER/ADMIN |
| `GET` | `/billing/reconciliation/runs/:runId` | Chi tiết một run + discrepancies | OWNER/ADMIN |
| `GET` | `/billing/reconciliation/discrepancies` | Danh sách discrepancies + filter | OWNER/ADMIN/OPERATOR |
| `PATCH` | `/billing/reconciliation/discrepancies/:id/resolve` | Cập nhật resolution | OWNER/ADMIN |
| `POST` | `/billing/reconciliation/freeze` | Freeze wallet thủ công | OWNER/ADMIN |
| `POST` | `/billing/reconciliation/unfreeze` | Unfreeze wallet | OWNER/ADMIN |
| `POST` | `/billing/reconciliation/export` | **Tạo job xuất báo cáo bất đồng bộ** | OWNER/ADMIN |
| `GET` | `/billing/reconciliation/export/:jobId/status` | Poll tiến độ job | OWNER/ADMIN |
| `GET` | `/billing/reconciliation/export/:jobId/download` | **Download file báo cáo (stream)** | OWNER/ADMIN |
| `GET` | `/billing/reconciliation/export/jobs` | Danh sách export jobs gần đây | OWNER/ADMIN |

### 4.2 Chi tiết endpoint export

```
POST /billing/reconciliation/export
 Request Body:
 {
   "reportType": "monthly",          // daily | weekly | monthly | custom
   "format": "csv",                  // csv | xlsx
   "dateFrom": "2026-06-01T00:00:00Z",
   "dateTo": "2026-06-17T23:59:59Z",
   "includeDetails": true
 }

 Response (202 Accepted):
 {
   "jobId": "rep_job_abc123",
   "status": "pending",
   "createdAt": "2026-06-17T18:00:00Z"
 }

GET /billing/reconciliation/export/rep_job_abc123/status
 Response:
 {
   "jobId": "rep_job_abc123",
   "status": "processing",           // pending | processing | completed | failed
   "progress": 45,                    // 0–100
   "fileUrl": null,
   "error": null
 }

GET /billing/reconciliation/export/rep_job_abc123/download
 Response Headers:
   Content-Type: text/csv
   Content-Disposition: attachment; filename="financial-report_monthly_2026-06.csv"
   Content-Length: 245829
 Response Body: [binary stream]
```

---

## V. CRON SCHEDULER

### 5.1 Job schedule (`report-scheduler.service.ts`)

```typescript
@Injectable()
export class ReportSchedulerService implements OnModuleInit, OnModuleDestroy {
  /**
   * Các job cron:
   *
   * [1] Financial Audit Loop — mỗi 6 giờ
   *     - Quét tất cả tenants có wallet.active = true
   *     - Gọi ReconciliationService.runFinancialAuditLoop()
   *     - Rate limit: tối đa 100 tenants/lần, batch size 10
   *
   * [2] Auto-resolve stale WARNING — mỗi 1 giờ
   *     - DiscrepancyRecord WHERE status=OPEN AND severity=INFO AND createdAt < now - 7d
   *     → auto DISMISSED
   *
   * [3] Escalate unacknowledged — mỗi 1 giờ
   *     - DiscrepancyRecord WHERE status=OPEN AND severity=WARNING
   *       AND createdAt < now - 7d
   *     → escalate lên CRITICAL (cần admin attention)
   *
   * [4] Auto-unfreeze expired wallets — mỗi 30 phút
   *     - DiscrepancyRecord WHERE walletFrozen=true
   *       AND freezeExpiresAt < now
   *     → gọi DiscrepancyResolver.autoUnfreezeExpired()
   *
   * [5] Cleanup old export files — mỗi 1 giờ
   *     - FinancialReportJob WHERE status=completed
   *       AND createdAt < now - 24h
   *     → xóa file + UPDATE status='expired'
   */
}
```

---

## VI. TÍCH HỢP VỚI HỆ THỐNG HIỆN TẠI

### 6.1 Kết nối với LedgerService hiện có

| Chức năng | LedgerService hiện tại | Reconciliation mới |
|-----------|----------------------|-------------------|
| Debit/Credit | ✅ Giữ nguyên | Đọc từ Prisma aggregate |
| Optimistic Lock | ✅ Version CAS | **Đọc snapshot read-only** (không lock) |
| Idempotency | ✅ Unique constraint | Phát hiện DUPLICATE_REFERENCE |
| Threshold hook | ✅ Low-balance alert | **Trigger cảnh báo từ Reconciliation** |
| Transaction history | ✅ Cursor pagination | **Dùng trong report export** |

### 6.2 Kết nối với AuditLog + AuditEvent

- **AuditLog**: Dùng khi ghi vết discrepancy và freeze decision
  - `action` = `'WALLET_FREEZE'` / `'WALLET_UNFREEZE'` / `'RECONCILIATION_RUN'` / `'DISCREPANCY_RESOLVED'`
  - `entityType` = `'Wallet'` / `'DiscrepancyRecord'` / `'ReconciliationRun'`
  - `metadata` = chứa score, diff, freezeExpiresAt, discrepancyIds

- **AuditEvent**: Dùng cho real-time monitoring
  - `action` = `'financial.reconciliation.completed'` / `'financial.wallet.frozen'`
  - `actorType` = `SYSTEM`

### 6.3 File mapping

```
apps/api/src/payments/reconciliation/
├── reconciliation.module.ts          → Module mới, import PrismaModule + LedgerModule
├── reconciliation.config.ts          → Threshold constants + schedule config
├── reconciliation.types.ts           → TypeScript types/enums/interfaces
├── reconciliation.service.ts         → runFinancialAuditLoop() + helpers
├── reconciliation.controller.ts      → 12 endpoints (status, run, discrepancies, export...)
├── discrepancy-resolver.service.ts   → resolveDiscrepancies(), evaluateFreeze(), freeze/unfreeze
├── financial-report-exporter.service.ts  → requestReport(), processJob(), buildCsvStream()
├── report-scheduler.service.ts       → 5 cron jobs (audit loop, auto-resolve, cleanup)
└── reconciliation.guard.ts           → OWNER/ADMIN/OPERATOR guard
```

### 6.4 Prisma migration

Chạy sau khi schema được cập nhật:
```bash
npx prisma migrate dev --name add_reconciliation_engine
```

---

## VII. RỦI RO & GIẢI PHÁP

| Rủi ro | Giải pháp |
|--------|----------|
| Audit loop chậm với hàng nghìn tenants | Batch processing: 100 tenants/lần, timeout 30s/batch |
| Transaction read snapshot không khớp do concurrent writes | Dùng Prisma `$transaction` với serializable isolation level cho snapshot |
| File export chiếm disk | Cleanup sau 24h, max 100MB/file, compress nếu cần |
| Freeze wallet sai (false positive) | Cho phép admin manual unfreeze + cooling timer 5 phút trước freeze réel |
| Discrepancy record trùng lặp | `@@unique([tenantId, runId, category, affectedEntity])` trên DiscrepancyRecord |
| Lock contention nếu audit loop chạy khi có debit | Chỉ đọc (read-only transaction), không ghi vào wallet/ledger |

---

## VIII. IMPLEMENTATION ORDER

```
Lượt 1 — Schema + Core Engine (critical path)
├── schema.prisma: 3 models mới + 3 enums
├── reconciliation.config.ts
├── reconciliation.types.ts
├── reconciliation.service.ts       ← runFinancialAuditLoop()
├── discrepancy-resolver.service.ts ← freezeWallet(), resolveDiscrepancies()
├── reconciliation.guard.ts
└── reconciliation.module.ts

Lượt 2 — API + Controller
├── reconciliation.controller.ts    ← 12 endpoints
└── Tích hợp vào PaymentsModule (import ReconciliationModule)

Lượt 3 — Async Report Export
├── financial-report-exporter.service.ts
├── report-scheduler.service.ts
└── Cleanup cron
```

**Tổng số file mới:** 10 (7 service/controller + 1 module + 1 config + 1 types)
**File cập nhật:** 2 (`schema.prisma`, `payments.module.ts`)

---

*Thiết kế bởi Minh — 2026-06-17 — Trạng thái: IDLE (chờ Thành review)*

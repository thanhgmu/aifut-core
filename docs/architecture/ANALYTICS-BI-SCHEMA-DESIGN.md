# Cross-Tenant BI Analytics — Schema Design

> **Phase:** 3 (Scale / Reseller Ready)  
> **Trạng thái:** Bản thảo (Draft)  
> **Ngày:** 2026-06-21  
> **Module đề xuất:** `apps/api/src/analytics/`  
> **Prisma schema:** `apps/api/prisma/schema.prisma`

---

## 1. Tổng quan kiến trúc

Phân hệ **Cross-Tenant BI Analytics** thu thập, tổng hợp và phân tích dữ liệu xuyên tenant nhằm:

- Cung cấp dashboard **intra-tenant**: tenant tự xem metric của mình
- Cung cấp dashboard **cross-tenant (admin)**: nền tảng/SRE nhìn toàn cảnh cụm
- **Benchmark đối soát**: so sánh tenant với trung bình ngành (industry percentile)
- **Phát hiện bất thường**: chủ động quét và ghi vết sự kiện tài nguyên bất thường

### 1.1. Luồng dữ liệu tổng quát

```
  Tenant Runtime
       │
       ▼
  [UsageRecord / WorkflowExecution / AiUsageEvent]
       │
       ▼ (Cron aggregator, period: hourly)
  ┌──────────────────────────────┐
  │  TenantAnalyticsSummary      │ ◄── Mỗi tenant/hội tụ metric theo thời gian
  └──────────┬───────────────────┘
             │
             ▼ (Cron aggregator, period: daily)
  ┌──────────────────────────────┐
  │  GlobalPlatformBenchmark     │ ◄── Rolling window toàn sàn
  └──────────┬───────────────────┘
             │
             ▼ (Anomaly scanner, period: every run)
  ┌──────────────────────────────┐
  │  AnomalyRecord               │ ◄── Phát hiện bất thường chủ động
  └──────────────────────────────┘
```

---

## 2. Prisma Models

Tất cả các model được ghi vào file `schema.prisma` hiện tại với tiền tố phân vùng `// ── Cross-Tenant BI Analytics ──────────────────────────────`.

### 2.1. `TenantAnalyticsSummary`

> Lưu dữ liệu tổng hợp (aggregated metrics) theo khung thời gian cố định (hourly, daily) của từng tenant.  
> Mỗi dòng là 1 bucket duy nhất theo `(tenantId, period, timestamp)`.

**Tên bảng vật lý (inferred):** `TenantAnalyticsSummary`

```prisma
// ── Cross-Tenant BI Analytics ──────────────────────────────────────────
// Module: apps/api/src/analytics/

enum AnalyticsPeriod {
  HOURLY
  DAILY
}

model TenantAnalyticsSummary {
  id              String          @id @default(cuid())
  tenantId        String
  tenant          Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  workspaceId     String?         // Null = toàn bộ workspace của tenant

  // ── Phân kỳ ───────────────────────────────────────────────────────
  period          AnalyticsPeriod // HOURLY | DAILY
  timestamp       DateTime        // Bucket start time (UTC): 2026-06-21T00:00:00Z

  // ── Workflow metrics ──────────────────────────────────────────────
  totalExecutions      Int        @default(0)  // Tổng số lần chạy workflow trong kỳ
  successfulExecutions Int        @default(0)  // Workflow kết thúc COMPLETED
  failedExecutions     Int        @default(0)  // Workflow kết thúc FAILED
  avgExecutionDurationMs Int      @default(0)  // Thời gian chạy trung bình (ms)

  // ── AI / Token metrics ────────────────────────────────────────────
  totalAiTokens        BigInt     @default(0)  // Tổng AI tokens tiêu thụ (input + output)
  totalInputTokens     BigInt     @default(0)  // Input tokens
  totalOutputTokens    BigInt     @default(0)  // Output tokens
  totalAiCost          BigInt     @default(0)  // Chi phí AI (VND, BigInt tránh float drift)
  aiCallCount          Int        @default(0)  // Số lần gọi AI provider

  // ── Revenue & billing metrics ─────────────────────────────────────
  totalRevenue         BigInt     @default(0)  // Doanh thu phát sinh trong kỳ (VND, BigInt)
  invoiceCount         Int        @default(0)  // Số invoice được tạo trong kỳ
  paymentCount         Int        @default(0)  // Số giao dịch thanh toán thành công
  totalPaymentAmount   BigInt     @default(0)  // Tổng giá trị thanh toán thành công

  // ── User & activity metrics ───────────────────────────────────────
  activeUserCount      Int        @default(0)  // Số user có session active trong kỳ
  newUserCount         Int        @default(0)  // User mới đăng ký trong kỳ
  newIntegrationCount  Int        @default(0)  // Integration mới kết nối

  // ── Storage ───────────────────────────────────────────────────────
  storageBytesTotal    BigInt     @default(0)  // Dung lượng lưu trữ tenant đang dùng (bytes)
  storageBytesDelta    BigInt     @default(0)  // Thay đổi dung lượng so với kỳ trước (bytes)

  // ── Notification ──────────────────────────────────────────────────
  notificationSentCount Int       @default(0)  // Số notification đã gửi
  notificationFailedCount Int     @default(0)  // Notification gửi thất bại

  // ── Metadata ──────────────────────────────────────────────────────
  metadata            Json?       // Mở rộng — có thể chứa custom metric của từng tenant
  createdAt           DateTime    @default(now())

  // ── Constraints ───────────────────────────────────────────────────
  @@unique([tenantId, period, timestamp, workspaceId])
  @@index([tenantId, period, timestamp])        // Query intra-tenant theo thời gian
  @@index([tenantId, timestamp])                // Query không lọc period
  @@index([workspaceId, period, timestamp])     // Query theo workspace
  @@index([period, timestamp])                  // Admin: quét toàn sàn
  @@index([totalAiCost])                        // Sắp xếp top chi phí
  @@index([totalRevenue])                       // Sắp xếp top doanh thu
}
```

#### ⚠️ IDOR Mitigation

- `tenantId` là `String` bắt buộc, khóa ngoại cascade với `Tenant` → **Prisma schema-level constraint** chống ghi sai tenant.
- Mọi query API bắt buộc filter `WHERE tenantId = currentTenant.id` qua middleware hoặc **RLS-aware Prisma client wrapper** (xem `TenantService` hiện tại).
- `@@unique([tenantId, period, timestamp, workspaceId])` ngăn trùng lặp dòng và buộc mọi ghi phải khớp tenantId.
- `TenantAnalyticsSummary` **không public** endpoint xuyên tenant trừ admin global scope.

---

### 2.2. `GlobalPlatformBenchmark`

> Lưu chỉ số trung bình toàn sàn cho từng tổ hợp (industry, metricName).  
> Mỗi dòng là 1 metric của 1 industry tại thời điểm cập nhật.  
> Dùng làm baseline cho dashboard: "Tenant A đang ở percentile nào so với cùng ngành?"

```prisma
model GlobalPlatformBenchmark {
  id              String    @id @default(cuid())

  // ── Phân loại ─────────────────────────────────────────────────────
  industry        String    // 'general' | 'ecommerce' | 'education' | 'finance' | 'healthcare' | 'real_estate'
  metricName      String    // 'execution_count' | 'ai_token_usage' | 'revenue_per_tenant' | 'avg_workflow_duration_ms'

  // ── Thống kê toàn sàn ────────────────────────────────────────────
  totalTenants    Int       @default(0)    // Số tenant đóng góp vào benchmark này
  avgValue        Float     @default(0)    // Giá trị trung bình
  medianValue     Float     @default(0)    // Median (p50)
  p90Value        Float     @default(0)    // Percentile 90
  p95Value        Float     @default(0)    // Percentile 95
  p99Value        Float     @default(0)    // Percentile 99
  minValue        Float     @default(0)    // Min
  maxValue        Float     @default(0)    // Max
  stdDev          Float     @default(0)    // Độ lệch chuẩn

  // ── Phân kỳ ───────────────────────────────────────────────────────
  windowStartDate DateTime                // Ngày bắt đầu cửa sổ thống kê
  windowEndDate   DateTime                // Ngày kết thúc cửa sổ thống kê (thường là hôm qua)

  // ── Timestamps ────────────────────────────────────────────────────
  updatedAt       DateTime    @updatedAt  // Lần cập nhật benchmark gần nhất
  createdAt       DateTime    @default(now())

  // ── Constraints ───────────────────────────────────────────────────
  @@unique([industry, metricName, windowEndDate])   // 1 metric/industry/window
  @@index([industry])                                // Lọc theo ngành
  @@index([metricName])                              // Lọc theo tên metric
  @@index([industry, metricName])                    // Query chính: benchmark theo (ngành, metric)
  @@index([windowEndDate])                           // Lọc theo window
}
```

#### Cách dùng

```
Ví dụ: "E-commerce tenant có 50,000 AI tokens/tháng, có cao so với mặt bằng không?"

→ SELECT p95Value FROM GlobalPlatformBenchmark
   WHERE industry = 'ecommerce' AND metricName = 'ai_token_usage'
   ORDER BY windowEndDate DESC LIMIT 1

→ Nếu p95 = 120,000 thì tenant này dưới p95 → ổn.
```

#### Xoá dữ liệu cũ

Cron chạy retention policy giữ tối đa **90 ngày** benchmark history, xoá các dòng `windowEndDate < NOW() - 90 days` để kiểm soát dung lượng.

---

### 2.3. `AnomalyRecord`

> Lưu vết các cảnh báo bất thường tài nguyên do hệ thống quét được.  
> Anomaly detector chạy dưới dạng cron job, so sánh metric hiện tại của tenant với:
> - Baseline history của chính tenant đó (self-baseline)
> - GlobalPlatformBenchmark của industry (cross-tenant baseline)

```prisma
enum AnomalyType {
  SPIKING_COST            // Chi phí AI tăng đột biến > 3σ so với baseline
  SPIKING_TOKENS          // Token usage tăng đột biến
  SPIKING_EXECUTIONS      // Workflow execution count tăng đột biến
  DROPPING_SUCCESS_RATE   // Tỷ lệ thành công workflow giảm mạnh
  STORAGE_GROWTH          // Dung lượng lưu trữ tăng bất thường
  CROSSING_BUDGET_THRESHOLD  // Vượt ngưỡng budget config
  IDLE_TENANT             // Tenant không hoạt động > N ngày (churn risk)
  UNUSUAL_FAILURE_PATTERN // Lỗi workflow tăng theo pattern
  ZERO_REVENUE            // Tenant active nhưng không phát sinh doanh thu
  OUTLIER_COMPARED_TO_INDUSTRY // Metric của tenant lệch xa so với industry benchmark
}

enum AnomalySeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

model AnomalyRecord {
  id              String          @id @default(cuid())
  tenantId        String
  tenant          Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // ── Phân loại ─────────────────────────────────────────────────────
  anomalyType     AnomalyType
  severity        AnomalySeverity @default(MEDIUM)

  // ── Mô tả ─────────────────────────────────────────────────────────
  title           String          // Ngắn gọn, ví dụ: "Chi phí AI tăng 340% so với baseline"
  description     String?         // Chi tiết: metric cũ, metric mới, ngưỡng vượt, v.v.
  detailsJson     Json?           // Payload chi tiết có cấu trúc (xem schema dưới)

  // ── Metric snapshot ───────────────────────────────────────────────
  metricName      String?         // Tên metric bị phát hiện bất thường
  metricValue     Float?          // Giá trị hiện tại của metric
  baselineValue   Float?          // Giá trị baseline của chính tenant này
  industryAvg     Float?          // Giá trị trung bình ngành (nếu applicable)
  deviationScore  Float?          // Số sigma lệch so với baseline (z-score)

  // ── Resolved ──────────────────────────────────────────────────────
  isResolved      Boolean         @default(false) // Đã được xử lý?
  resolvedAt      DateTime?
  resolvedBy      String?         // userId hoặc 'system'

  // ── Notification ──────────────────────────────────────────────────
  notifiedAt      DateTime?       // Thời điểm gửi thông báo tới tenant/admin
  acknowledgedAt  DateTime?       // Thời điểm tenant/admin xác nhận đã thấy

  // ── Timestamps ────────────────────────────────────────────────────
  detectedAt      DateTime        @default(now()) // Thời điểm phát hiện
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  // ── Constraints ───────────────────────────────────────────────────
  @@index([tenantId, severity])                     // Filter: tenant + mức độ
  @@index([tenantId, anomalyType])                  // Filter: tenant + loại
  @@index([tenantId, isResolved])                   // Filter: chưa resolved
  @@index([tenantId, detectedAt])                   // Sắp xếp thời gian cho intra-tenant
  @@index([severity, isResolved])                   // Admin: anomaly chưa xử lý
  @@index([anomalyType])                            // Admin: thống kê loại anomaly
  @@index([detectedAt])                             // Admin: sắp xếp thời gian phát hiện
}
```

#### detailsJson — Schema kiến trúc

```typescript
interface AnomalyDetails {
  // Luôn có
  detectionMethod: "z_score" | "percentile" | "threshold" | "pattern";

  // Các metric gốc dùng để tính
  currentPeriodStart: string;    // ISO 8601
  currentPeriodEnd: string;
  previousPeriodStart: string;   // Baseline period
  previousPeriodEnd: string;

  // Self-baseline statistics (30 ngày gần nhất)
  selfBaseline: {
    mean: number;
    stdDev: number;
    zScore: number;
    threshold: number;           // Ngưỡng z-score mặc định 3.0
  };

  // Cross-tenant benchmark (nếu có số liệu ngành)
  industryBenchmark?: {
    industry: string;
    avgValue: number;
    p95Value: number;
    percentileRank: number;      // Tenant này đang ở percentile nào
  };

  // Affected resource identifiers
  affectedResources?: string[];  // workflowId, connectorId, v.v.

  // Trigger history (đếm số lần cùng loại anomaly gần đây)
  occurrenceCount7d: number;     // Số lần xảy ra trong 7 ngày
  lastOccurrenceAt?: string;

  // Auto-remediation hint
  suggestedAction?: string;
  autoRemediationUrl?: string;   // Link đến trang config để fix
}
```

---

## 3. Quy tắc bảo mật tenant / Chống IDOR

Mọi model trong phân hệ BI đều tuân thủ các nguyên tắc sau (source: AGENTS.md / architecture decisions):

1. **`tenantId` luôn bắt buộc** — mọi model đều có `tenantId String` và `@@index([tenantId, ...])`.
2. **Cascade on delete** — `@relation(..., onDelete: Cascade)` → khi tenant bị xoá, analytics data tự động xoá theo, không để orphan data.
3. **No global-read by default** — API endpoint trả dữ liệu phân hệ BI **phải** filter `tenantId` trùng với tenant session. Ngoại lệ: admin dashboard có role `SYSADMIN` được phép cross-tenant query.
4. **Workspace isolation** — `workspaceId` optional hỗ trợ multi-workspace tenant, nếu null thì metric là aggregate của toàn bộ tenant.
5. **Benchmark data (GlobalPlatformBenchmark) chỉ public ở mức tổng hợp** — không lộ metric của từng tenant riêng lẻ.

---

## 4. Cron job & Aggregation schedule

### 4.1. Hourly Aggregator (`TenantAnalyticsSummary` period=HOURLY)

| Cron | Nhiệm vụ |
|------|----------|
| `0 * * * *` | Lấy dữ liệu từ `UsageRecord`, `AiUsageEvent`, `WorkflowExecution`, `PaymentTransaction`, v.v. trong 1h vừa qua, tính toán và upsert `TenantAnalyticsSummary` |

**Công thức upsert chống trùng:**
```sql
INSERT INTO "TenantAnalyticsSummary" (...)
ON CONFLICT ("tenantId", "period", "timestamp", "workspaceId")
DO UPDATE SET
  totalExecutions = TenantAnalyticsSummary.totalExecutions + EXCLUDED.totalExecutions,
  totalAiTokens   = TenantAnalyticsSummary.totalAiTokens   + EXCLUDED.totalAiTokens,
  ...
```

### 4.2. Daily Benchmark Engine (`GlobalPlatformBenchmark`)

| Cron | Nhiệm vụ |
|------|----------|
| `0 3 * * *` | Đọc `TenantAnalyticsSummary` period=DAILY của hôm qua, phân nhóm theo `industry` (lấy từ `Tenant.slug` → business profile), tính thống kê (avg, median, p95, stdDev) và ghi vào `GlobalPlatformBenchmark` |

### 4.3. Anomaly Scanner (`AnomalyRecord`)

| Cron | Nhiệm vụ |
|------|----------|
| `15 * * * *` | Chạy mỗi giờ, so sánh hourly summary của từng tenant với: (1) self-baseline 30 ngày, (2) industry benchmark. Nếu vượt ngưỡng → ghi `AnomalyRecord` (dedup bằng `@@unique` runtime check) |

---

## 5. Module đề xuất trong monorepo

```
apps/api/src/analytics/
├── analytics.module.ts          # NestJS module
├── analytics.service.ts         # Business logic — tổng hợp metric
├── analytics.controller.ts      # REST endpoints (intra-tenant)
├── dto/
│   ├── tenant-analytics.dto.ts
│   ├── benchmark.dto.ts
│   └── anomaly.dto.ts
├── cron/
│   ├── hourly-aggregator.cron.ts     # Cron job 1h
│   ├── daily-benchmark.cron.ts       # Cron job 24h
│   └── anomaly-scanner.cron.ts       # Cron job 1h
├── anomalies/
│   ├── anomaly-detector.service.ts   # Core detection algorithms
│   ├── detectors/
│   │   ├── cost-spike.detector.ts
│   │   ├── success-rate.detector.ts
│   │   ├── storage-growth.detector.ts
│   │   └── idle-tenant.detector.ts
│   └── anomaly-type.enum.ts
└── benchmark/
    ├── benchmark-calculator.service.ts
    └── percentile-calculator.ts       # Online algorithm (TDigest or similar)
```

---

## 6. API Endpoints (Preview)

```
GET  /api/v1/tenants/:id/analytics/summary?period=daily&from=...&to=...
  → Trả về TenantAnalyticsSummary[] cho tenant hiện tại

GET  /api/v1/tenants/:id/analytics/benchmark?industry=ecommerce&metric=ai_token_usage
  → Trả về GlobalPlatformBenchmark cho so sánh

GET  /api/v1/tenants/:id/analytics/anomalies?severity=HIGH&resolved=false
  → Trả về AnomalyRecord[] chưa resolved

GET  /api/v1/admin/analytics/anomalies?severity=CRITICAL&isResolved=false
  → (Admin) Danh sách anomaly chưa xử lý toàn sàn

GET  /api/v1/admin/analytics/benchmark/snapshot?industry=all&date=2026-06-20
  → (Admin) Snapshot benchmark toàn sàn
```

---

## 7. Kế hoạch migration Prisma

```bash
# (Chỉ chạy thủ công, không tự động)
npx prisma migrate dev --name add-analytics-bi-schema --schema apps/api/prisma/schema.prisma
```

**Lưu ý:** Các model mới tương thích ngược (backward-compatible) — không thay đổi bảng cũ, chỉ thêm bảng mới. Migration an toàn song song với production.

---

## 8. Phụ lục: Data retention policy

| Bảng | Retention | Lý do |
|------|-----------|-------|
| `TenantAnalyticsSummary` (HOURLY) | 90 ngày | Chi tiết phân tích giờ |
| `TenantAnalyticsSummary` (DAILY) | 365 ngày | Báo cáo thường niên |
| `GlobalPlatformBenchmark` | 90 ngày window history | Chỉ cần baseline gần nhất |
| `AnomalyRecord` | 365 ngày (resolved) / vô thời hạn (unresolved) | Audit trail an toàn |

---

## 9. Mối quan hệ với các model hiện có

| Model BI | Nguồn dữ liệu gốc | Ghi chú |
|----------|-------------------|---------|
| `TenantAnalyticsSummary.totalExecutions` | `WorkflowExecution` | `WHERE status = 'COMPLETED'` |
| `TenantAnalyticsSummary.totalAiTokens` | `AiUsageEvent` | `SUM(totalTokens)` |
| `TenantAnalyticsSummary.totalAiCost` | `AiBudgetLimit.currentCostSpent` / `AiUsageEvent.estimatedCost` | VND BigInt |
| `TenantAnalyticsSummary.totalRevenue` | `PaymentTransaction` | `WHERE status = 'success'` |
| `TenantAnalyticsSummary.activeUserCount` | `Session.lastSeenAt` | Trong khung thời gian |
| `AnomalyRecord.severity` | Tính toán từ z-score | z > 3 = HIGH, z > 5 = CRITICAL |
| `GlobalPlatformBenchmark.avgValue` | `TenantAnalyticsSummary` | AVG per industry |

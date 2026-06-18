# BACKEND ANALYTICS BATCH 4 — Aggregation Engine & Tenant-Safe API Contract

> **Mode:** AIFUT THINK (thiết kế kiến trúc + cấu trúc dữ liệu, KHÔNG code)
> **Ngày:** 2026-06-18 15:46 GMT+7
> **Phân hệ:** `apps/api` (Backend NestJS 11 + Prisma 7 + PostgreSQL :5432)
> **Đường dẫn module:** `apps/api/src/payments/analytics/`
> **Mục tiêu P0:** Chặn đóng (close-out) hệ thống AI Analytics Aggregate Endpoints — cung cấp 3 endpoint tổng hợp số liệu đồ thị AI, cô lập tenant chống IDOR, không crash JSON parse phía Recharts.

---

## 0. KẾT QUẢ QUÉT CODEBASE (đọc trước khi thiết kế)

### 0.1 Hiện trạng — phân hệ ĐÃ được scaffold ở Batch 1→3

| Thành phần | Trạng thái | File |
|---|:--:|---|
| `AnalyticsService` — 3 aggregate methods | ✅ Có | `analytics.service.ts` |
| `AnalyticsController` — 3 endpoints + capabilities | ✅ Có | `analytics.controller.ts` |
| Domain types (response wrappers) | ✅ Có | `analytics.types.ts` |
| Module wiring | ✅ Có | `analytics.module.ts` |
| Nguồn ghi dữ liệu `recordAiUsage()` | ✅ Có | `ai-billing-meter.service.ts` |

> Route Controller đã được nắn về `@Controller('ai-analytics')` (khớp `/ai-analytics/*` mà Frontend gọi). Gap route mismatch ở bản thiết kế cũ (G1) đã đóng.

### 0.2 Nguồn dữ liệu thật — `UsageRecord` (Prisma)

```prisma
model UsageRecord {
  id          String   @id @default(cuid())
  accountId   String
  tenantId    String
  category    String   // 'ai' | 'storage' | 'workflow' | 'notification'
  metric      String   // 'tokens' | 'cost' | 'mb' | 'executions' | 'messages'
  value       Float
  recordedAt  DateTime
  metadata    Json?
  createdAt   DateTime @default(now())
  account     BillingAccount @relation(...)
  tenant      Tenant         @relation(...)

  @@index([accountId, category])
  @@index([tenantId, recordedAt])   // ← index phục vụ truy vấn aggregate
  @@index([category, recordedAt])
}
```

**Cách `AiBillingMeterService.recordAiUsage()` ghi dữ liệu (xác nhận từ source):**
mỗi lần gọi AI tạo **2 bản ghi** cùng `category:'ai'`:
- `metric:'tokens'`, `value = inputTokens + outputTokens`
- `metric:'cost'`, `value = actualCost ?? estimatedCost`

`metadata` (JSON) hiện ghi: `modelKey`, `inputTokens`, `outputTokens`, `estimatedCost`, `actualCost`, `featureKey`, `taskType`, `cacheHit`.

### 0.3 GAP CÒN LẠI (Critical Path Batch 4)

| # | Gap | Mức | Mô tả |
|---|---|:--:|---|
| **B4-1** | ⚠️ **Meter KHÔNG ghi `latencyMs` và `success`** | **CRITICAL** | `analytics.service.ts` đọc `meta.latencyMs` và `meta.success` để tính **Avg Latency** và **Success Rate**, nhưng `recordAiUsage()` hiện không emit 2 field này. Hậu quả runtime: Avg Latency luôn = `0ms`, Success Rate luôn = `100%`, Scorecard sai số liệu. |
| **B4-2** | ⚠️ **Controller chỉ nhận `x-tenant-slug`** | HIGH | Yêu cầu #4 (P0) đòi resolve `tenantId` qua **`x-tenant-slug` HOẶC `x-tenant-id`**. Phần còn lại của API (`affiliate`, `api-keys`...) đã dùng `x-tenant-id`. Cần hợp nhất resolver để khớp auth-context chung. |
| B4-3 | ℹ️ Anomaly engine 3 tầng | DONE | Đã hiện diện (`computeAnomalyScore`). Giữ nguyên hợp đồng. |
| B4-4 | ℹ️ Auto granularity + model-level display | DONE | Đã hiện diện. Giữ nguyên. |

---

## 1. CẤU TRÚC FILE — KHỞI TẠO MỚI / CẬP NHẬT

```
apps/api/src/payments/analytics/
├── analytics.module.ts        [GIỮ]    Module wiring (controller + service + Prisma)
├── analytics.controller.ts    [UPDATE] Thêm resolver x-tenant-id fallback (B4-2)
├── analytics.service.ts       [GIỮ]    3 aggregate core methods đã đủ logic
├── analytics.types.ts         [GIỮ]    Domain types, đã có totalRequests + anomaly 3 tầng
└── (tùy chọn) analytics.tenant.util.ts  [NEW] Tách resolveTenantId dùng chung (slug|id)

apps/api/src/
└── ai-billing-meter.service.ts [UPDATE] Emit thêm latencyMs + success vào metadata (B4-1)
```

> Nguyên tắc theo AGENTS.md: ưu tiên patch hẹp, tái dụng helper sẵn có, không rewrite cả file. File mới chỉ tạo khi tách concern rõ ràng (resolver dùng chung).

---

## 2. BA HÀM LOGIC CORE

Hợp đồng dữ liệu chung: mọi giá trị VND/token trung chuyển **kép** — `number` (an toàn tính toán) + `*Display: string` (vi-VN rút gọn) để client không mất độ chính xác và không tự format lệch.

### 2.1 `getScorecardMetrics(tenantId, start, end)` → `AnalyticsScorecardView`

**Trách nhiệm:** quét `UsageRecord` (`tenantId`, `category:'ai'`, `recordedAt ∈ [start,end]`), tính KPI kỳ hiện tại và so kỳ liền trước cùng độ dài (`prevStart = start - span`, `prevEnd = start - 1ms`) để xuất `%` change.

**Đại lượng:**
| KPI | Công thức | Nguồn |
|---|---|---|
| `totalCost` (VND) | `Σ extractCost(record)` trên `metric:'cost'` | `metadata.actualCost ?? estimatedCost ?? value` |
| `totalTokens` | `Σ value` trên `metric:'tokens'` | `value` (input+output) |
| `avgLatencyMs` | `Σ meta.latencyMs / count(latency)` | **cần B4-1** |
| `successRate` (%) | `successCount / requestCount × 100`; `success !== false` tính là thành công | **cần B4-1** |
| `totalRequests` | `count(metric:'cost')` (1 cost record = 1 lần gọi canonical) | — |
| `*Change` | `pctChange(cur, prev)`, chia-0-safe (`prev=0 → cur?100:0`) | — |

**Bất biến:** mọi nhánh lỗi trả về object đầy đủ field (fallback `successRate=100`), không bao giờ throw lên client → tránh crash dashboard.

### 2.2 `getCostTrends(tenantId, start, end, granularity, modelKeys)` → `CostTrendPoint[]`

**Trách nhiệm:** bóc tách chuỗi thời gian, gom bucket theo `day | week | month | auto`, breakdown token/cost theo từng `modelKey` phục vụ **biểu đồ cột chồng (stacked)**.

- `granularity:'auto'` → `resolveAutoGranularity`: `≤7 ngày → day`, `≤30 ngày → week`, `>30 ngày → month`.
- `bucketKey`: day = `YYYY-MM-DD`; week = thứ Hai đầu tuần (UTC); month = `YYYY-MM`.
- `modelKeys` rỗng = tất cả model; có giá trị = lọc tập model (qua `Set`).
- Mỗi `CostTrendPoint`: `{ date, label(vi-VN), totalCost, totalCostDisplay, totalTokens, byModel: Record<modelKey,{cost,tokens,costDisplay,tokensDisplay}> }`.
- Sort tăng dần theo `date` để Recharts vẽ đúng trục thời gian.

### 2.3 `getModelMatrix(tenantId, start, end, modelKeys)` → `{ models, anomalyCount, anomalyModels, anomalyThreshold }`

**Trách nhiệm:** ma trận hiệu quả model — gom theo `modelKey`: `totalRequests`, `avgCostPerRequest`, `avgTokensPerRequest`, `avgLatencyMs`, `errorRate`, `cacheHitRate`, và **gắn cờ Anomaly**.

**Anomaly Engine 3 tầng** (`computeAnomalyScore`, composite 0–100):
| Tầng | Trọng số | Trigger |
|---|:--:|---|
| `errorRateScore` | 40% | `errorRate > 5%` (ngưỡng bảo hiểm `ANOMALY_THRESHOLD`) |
| `costSpikeScore` | 35% | `avgCostPerRequest > 1.5×` trung bình toàn cục |
| `volumeAnomalyScore` | 25% | độ lệch `requests` so với trung bình toàn cục |

Gắn cờ `anomaly = score > 30 (ANOMALY_SCORE_THRESHOLD) || errorRate > 5%`; kèm `anomalyReason` mô tả (phục vụ tooltip cảnh báo đỏ Zone 3). Sort `totalCost` giảm dần (model tốn tiền nhất lên đầu).

---

## 3. CHỐNG IDOR — TENANT ISOLATION (Yêu cầu #4, P0)

### 3.1 Nguyên tắc bất biến
- `tenantId` **không bao giờ** nhận trực tiếp từ client query → mọi truy vấn Prisma luôn ràng `where: { tenantId }`.
- Resolver là **biên giới cô lập** duy nhất; resolve từ auth-context header.

### 3.2 Thiết kế resolver hợp nhất (đóng B4-2)
```
resolveTenantId(slug?: x-tenant-slug, id?: x-tenant-id) -> tenantId
  1. Nếu có x-tenant-id  → prisma.tenant.findUnique({ where:{ id }}) ; 404 nếu không tồn tại.
  2. Else nếu x-tenant-slug → prisma.tenant.findUnique({ where:{ slug }}) ; 404 nếu không tồn tại.
  3. Else → BadRequest('x-tenant-slug hoặc x-tenant-id header required').
```
- Cả 3 endpoint (`/ai-analytics/scorecard|trends|matrix`) dùng chung resolver.
- Ưu tiên `x-tenant-id` (định danh chuẩn, khớp auth-context các module khác), fallback `x-tenant-slug` (DX/khả dụng từ FE hiện tại).
- Endpoint không tin `tenantId` trong query/body kể cả khi client gửi → bỏ qua tuyệt đối.

---

## 4. HỢP ĐỒNG ENDPOINT (API CONTRACT)

| Method | Path | Query | Header (≥1 bắt buộc) | Response |
|---|---|---|---|---|
| GET | `/ai-analytics/scorecard` | `startDate?`, `endDate?` | `x-tenant-id` \| `x-tenant-slug` | `ScorecardResponse` |
| GET | `/ai-analytics/trends` | `startDate?`, `endDate?`, `granularity?`, `modelKeys?` | `x-tenant-id` \| `x-tenant-slug` | `CostTrendResponse` |
| GET | `/ai-analytics/matrix` | `startDate?`, `endDate?`, `modelKeys?` | `x-tenant-id` \| `x-tenant-slug` | `ModelMatrixResponse` |
| GET | `/ai-analytics/capabilities` | — | — | capability probe |

**Default range:** `start` = đầu tháng hiện tại (UTC 00:00), `end` = cuối ngày hôm nay (UTC 23:59:59.999). Range đảo ngược (`start > end`) → `BadRequest`. `modelKeys=all` hoặc rỗng → tất cả model. Mọi response gói `tenantId`, `period{start,end}`, `generatedAt(ISO)`.

---

## 5. CẬP NHẬT NGUỒN DỮ LIỆU — `recordAiUsage()` (đóng B4-1)

Để Scorecard có Avg Latency + Success Rate thật, `metadata` của bản ghi `metric:'cost'` phải bổ sung:
```
metadata: {
  ...hiện có (modelKey, inputTokens, outputTokens, estimatedCost, actualCost, featureKey, taskType, cacheHit),
  latencyMs: number,   // thời gian phản hồi của lần gọi AI (ms)
  success:   boolean,  // true = gọi thành công; false = lỗi/timeout
}
```
- `recordAiUsage(input)` nhận thêm `latencyMs?`, `success?` (default `success=true` để backward-compatible với caller cũ).
- `AiUsageMetadata` trong `analytics.types.ts` đã khai báo sẵn `latencyMs?`, `success?` → chỉ cần phía emit ghi vào, **không đổi reader**.
- Bản ghi cũ thiếu field → reader đã null-safe (latency bỏ qua, success mặc định true), không vỡ dữ liệu lịch sử.

---

## 6. HIỆU NĂNG & AN TOÀN

- **Index:** truy vấn bám `@@index([tenantId, recordedAt])` + lọc `category='ai'` — không full scan.
- **Coercion VND-safe:** `toSafeNumber` xử number/bigint/Decimal/string (chống mất độ chính xác khi SUM VND lớn).
- **Null-safe tuyệt đối:** mọi method bọc try/catch trả fallback đầy đủ field → dashboard không crash.
- **Memory footprint:** aggregate in-memory theo bucket/model Map; với volume rất lớn (P3) → roadmap chuyển sang Prisma `groupBy`/raw SQL date_trunc (ghi nhận, chưa làm Batch 4).

---

## 7. CHECKLIST CLOSE-OUT BATCH 4

- [ ] B4-1: `recordAiUsage()` emit `latencyMs` + `success` vào metadata cost-record.
- [ ] B4-2: resolver hợp nhất `x-tenant-id` | `x-tenant-slug` áp cho 3 endpoint.
- [x] 3 aggregate methods (scorecard/trends/matrix) — đã có logic.
- [x] Anomaly engine 3 tầng — đã có.
- [x] Auto granularity + model-level display — đã có.
- [x] Route `@Controller('ai-analytics')` khớp FE — đã nắn.
- [ ] Verify runtime (do người dùng chạy thủ công): `dotenv -e .env -- npm run build` + smoke 3 endpoint với 2 kiểu header.

> Sau khi đóng B4-1 + B4-2 → Batch 4 Backend Analytics đạt P0 close-out, gỡ chặn Phase 2.

---

*Generated in AIFUT THINK mode — design only, no code mutation. Reference: `analytics.service.ts`, `analytics.controller.ts`, `analytics.types.ts`, `ai-billing-meter.service.ts`, `prisma/schema.prisma` (model UsageRecord/Tenant).*

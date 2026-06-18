# AI Analytics Dashboard Design — Cost Analysis & Model Performance Portal

> **Phase 4 (Operator Intelligence) — Frontend `apps/web`**
> Ngày: 2026-06-18
> Module: `apps/web` (Next.js 16 App Router) + `apps/api` (NestJS 11)
> Backend milestone: PayPal backend locked (build pass, full turbo, commit e0dcfbe)

---

## I. TỔNG QUAN & MỤC TIÊU

### 1.1 Bối cảnh
Toàn bộ Monorepo đã build pass Full Turbo và chốt sổ PayPal backend. Phase 4 mở ra với trọng tâm đầu tiên là **Hệ thống Giao diện Phân tích chi phí gọi AI và Thống kê hiệu năng đa mô hình (AI Model Metrics, Cost Analysis & Analytics Dashboard Portal)**.

Hiện tại:
- **Backend `AiBillingMeterService`** đã ghi nhận mỗi lần gọi AI vào `UsageRecord` với metadata gồm: `modelKey`, `inputTokens`, `outputTokens`, `estimatedCost`, `actualCost`, `featureKey`, `taskType`, `cacheHit`.
- Hai bản ghi cho mỗi lần gọi AI: metric='tokens' (value=totalTokens) + metric='cost' (value=estimatedCost/actualCost).
- **Chưa có**: giao diện tenant-level để phân tích chi phí AI, biểu đồ xu hướng, ma trận hiệu năng model, cảnh báo bất thường.
- **Chưa có**: API backend tổng hợp (aggregate) dữ liệu AI usage theo model, thời gian, tỷ lệ lỗi, latency.

### 1.2 Mục tiêu
Phân phối một Dashboard gồm 3 phân khu hiển thị trực quan:
1. **AI Usage Scorecard** — 4 thẻ KPI tổng quan (Cost, Tokens, Latency, Success Rate)
2. **Cost & Token Burn Trend Charts** — Biểu đồ thời gian (Area/Stacked Bar) biến động chi phí và token theo model + filter
3. **Model Efficiency Matrix Table** — Bảng ma trận hiệu năng từng model, cảnh báo khi error rate >5%

### 1.3 Nguyên tắc thiết kế
- **Tenant-level, không phải Platform-level** — mỗi tenant thấy dữ liệu của chính họ
- **Real-time-ish** — dữ liệu cập nhật với mỗi AI call (độ trễ ≤30 giây)
- **Non-technical usability** — dashboard phải dễ hiểu cho operator không rành kỹ thuật
- **Local-first** — dữ liệu được cache phía client, fallback mượt khi offline
- **Revenue-aware** — dashboard phải giúp tenant thấy họ đang đốt bao nhiêu tiền cho AI

---

## II. KIẾN TRÚC TỔNG THỂ

### 2.1 Component Tree

```
apps/web/app/(dashboard)/billing/analytics/          ← Route mới
├── layout.tsx          # Server Component — metadata, layout shell (#6d7cff theme)
└── page.tsx            # Server Component — force-dynamic, render <AiAnalyticsShell />

apps/web/components/billing/
├── ai-analytics-shell.tsx              # [NEW] Client orchestrator shell
│                                       #   - Gọi API load data
│                                       #   - Quản lý filter state (date range, model key)
│                                       #   - Quản lý loading/empty/error states
│                                       #   - Composes zone 1 + 2 + 3
├── ai-usage-scorecard.tsx              # [NEW] Zone 1 — 4 KPI cards
├── ai-cost-token-chart.tsx             # [NEW] Zone 2 — Area/Bar chart + filters
├── ai-model-efficiency-matrix.tsx      # [NEW] Zone 3 — Efficiency table + anomaly badge
├── analytics-filter-bar.tsx            # [NEW] Date range picker + model key multi-select
└── analytics-empty-state.tsx           # [NEW] Empty/error/loading state component

apps/web/types/
└── ai-analytics.ts                     # [NEW] TypeScript interfaces cho AI analytics domain

apps/web/lib/
└── ai-analytics.ts                     # [NEW] API fetch helpers

apps/api/src/
├── ai-analytics/
│   ├── ai-analytics.controller.ts      # [NEW] REST endpoints
│   ├── ai-analytics.service.ts         # [NEW] Aggregation + anomaly business logic
│   └── ai-analytics.module.ts          # [NEW] NestJS module registration
└── prisma/
    └── schema.prisma                   # [UPDATE] Add AiExecutionLog model (nếu cần)
```

### 2.2 Data Flow

```
[AiBillingMeterService.recordAiUsage()]
  │
  ▼
┌──────────────────────┐
│   UsageRecord table  │  ← đã tồn tại, mỗi lần gọi AI tạo 2 records (tokens + cost)
│   + metadata (Json)  │    metadata: { modelKey, inputTokens, outputTokens,
│                      │                 estimatedCost, actualCost, featureKey,
└──────────┬───────────┘                taskType, cacheHit, latencyMs?, success? }
           │
           ▼
┌────────────────────────────────────┐
│  ai-analytics.service.ts           │  ← [NEW] aggregate queries
│  getAiAnalytics(tenantId, filters) │    - Daily/weekly/monthly rollup
│  getAiCostTrend(tenantId, filters) │    - Per-model aggregation
│  getModelEfficiency(tenantId)      │    - Error rate calculation
│  detectModelAnomalies(data)        │    - Threshold check (>5% error)
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│  ai-analytics.controller.ts        │  ← [NEW] REST APIs
│  GET /ai-analytics/scorecard       │
│  GET /ai-analytics/cost-trend      │
│  GET /ai-analytics/model-efficiency│
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│  ai-analytics.ts (lib)             │  ← [NEW] fetch helpers
│  fetchAiScorecard(slug)            │
│  fetchAiCostTrend(slug, filters)   │
│  fetchModelEfficiency(slug)        │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│  ai-analytics-shell.tsx            │  ← [NEW] client orchestrator
│  - Calls 3 fetch functions         │
│  - Manages filter state            │
│  - Distributes data to 3 zones     │
└──────────────┬─────────────────────┘
               │
      ┌────────┼────────┬────────────┐
      ▼        ▼        ▼            ▼
  Scorecard  Chart   Matrix    FilterBar
   (Zone 1)  (Zone 2) (Zone 3)  (controls)
```

### 2.3 Route Placement

```
/(dashboard)/billing/
├── page.tsx              ← Tổng quan Billing (current)
├── analytics/            ← [NEW] AI Cost Analytics Dashboard
├── subscription/         ← Subscription management
├── wallet/               ← Wallet & refund
└── paypal/               ← PayPal top-up
```

Dashboard sidebar sẽ thêm link: `💰 AI Cost Analytics → /billing/analytics`

---

## III. ZONE 1: AI USAGE SCORECARD (Thẻ Tổng Quan Hiệu Năng AI)

### 3.1 Mô tả
Hàng ngang 4 thẻ KPI hiển thị số liệu tổng hợp trong khoảng thời gian được chọn (mặc định: tháng hiện tại).

### 3.2 4 KPI Cards

| Card | Dữ liệu | Format | Màu | Nguồn |
|---|---|---|---|---|
| **Total AI Cost** | Tổng chi phí AI đã tiêu thụ, quy đổi từ BigInt sang VND | `1.234.567₫` | `#34d399` (xanh) | SUM(cost records) |
| **Total Tokens Burned** | Tổng số token Input + Output | `1.2M` | `#6d7cff` (xanh dương) | SUM(tokens records) |
| **Avg Latency** | Thời gian phản hồi trung bình | `1.8s` | `#facc15` (vàng) | AVG(metadata->latencyMs) |
| **Success Rate** | Tỷ lệ gọi thành công | `98.5%` | `#4ade80` / `#f87171` | COUNT(success) / COUNT(total) |

### 3.3 Component: `ai-usage-scorecard.tsx`

```typescript
// Props
interface AiUsageScorecardProps {
  data: AiAnalyticsScorecard;
  periodLabel: string;   // "Tháng 6, 2026" or "7 ngày qua"
}

// Kế thừa pattern từ metric-cards.tsx hiện có:
// - Mỗi card có icon, label, value (format VND/to), change so với kỳ trước
// - Trend indicator ▲ ▼ →
// - Background glow cho giá trị âm/cao bất thường
```

### 3.4 Re-use pattern
Component kế thừa thiết kế từ `metric-cards.tsx` hiện có (glassy card, dark theme, trend arrow) nhưng mở rộng thêm:
- **Sparkline mini chart** bên dưới mỗi card (tùy chọn, nếu có dữ liệu 7 ngày gần nhất)
- **Cost card** có tooltip "Bao gồm estimated cost từ tất cả model AI providers"

---

## IV. ZONE 2: COST & TOKEN BURN TREND CHARTS (Biểu Đồ Xu Hướng)

### 4.1 Mô tả
Biểu đồ thời gian hiển thị biến động chi phí tiêu thụ và token theo ngày/tuần/tháng. Hỗ trợ chế độ xem Area Chart (miền) hoặc Stacked Bar Chart (cột chồng theo model key).

### 4.2 Biểu đồ chính

#### 4.2.1 Cost Trend Area Chart
```
┌──────────────────────────────────────────────────────────┐
│  Cost Trend                                              │
│  ┌──────────────────────────────────────────────────────┐│
│  │    ████                                              ││
│  │   ██████    ███                                      ││
│  │  ████████  ██████████                                ││
│  │ ████████████████████████████████████████              ││
│  └──────────────────────────────────────────────────────┘│
│  Jun 1    Jun 5    Jun 10    Jun 15    Jun 18            │
│  [📅 Date Range: custom] [🔽 Model: All] [🔽 Group: Day]│
└──────────────────────────────────────────────────────────┘
```

#### 4.2.2 Token Burn Stacked Bar (optional, toggle)
```
┌──────────────────────────────────────────────────────────┐
│  Token Burn (by Model)                                   │
│  ┌──────────────────────────────────────────────────────┐│
│  │  ▓▓░░  ▓▓░░  ▓░░░  ▓▓▓░░  ▓░░░  ░░░                 ││
│  │  ▓▓▓░░ ▓▓▓░░ ▓▓░░░ ▓▓▓▓░  ▓▓░░  ░░░░                ││
│  │  ▓▓▓▓░ ▓▓▓▓░ ▓▓▓░░ ▓▓▓▓▓  ▓▓▓░  ░░░░░               ││
│  └──────────────────────────────────────────────────────┘│
│  ▓ gpt-4o  ░ claude-3-5-sonnet  ▒ deepseek-chat          │
│  [📅] [🔽 Model: gpt-4o,claude] [🔽 Group: Day]          │
└──────────────────────────────────────────────────────────┘
```

### 4.3 Filters

| Filter | Type | Mô tả |
|---|---|---|
| **Date Range** | Date Range Picker | Từ/đến, mặc định tháng này |
| **Model Keys** | Multi-select dropdown | Lọc theo model (gpt-4o, claude-3-5-sonnet, deepseek-chat, v.v.) |
| **Granularity** | Toggle button | `Day` / `Week` / `Month` — nhóm dữ liệu theo bucket |
| **Chart Type** | Toggle | `Area` (cost) / `Stacked Bar` (tokens) |

### 4.4 Component: `ai-cost-token-chart.tsx`

```typescript
interface AiCostTokenChartProps {
  costTrend: CostTrendPoint[];       // time-series data
  tokenTrend: TokenTrendPoint[];     // time-series data
  chartType: 'area' | 'stacked-bar';
  selectedModels: string[];
  onToggleChartType: () => void;
}
```

### 4.5 Recharts implementation details
- **Area Chart**: `Recharts AreaChart` với gradient fill #6d7cff → transparent (kế thừa pattern từ `revenue-chart.tsx` hiện có)
- **Stacked Bar**: `Recharts BarChart` với `stackId="stack"`, mỗi model key một `Bar` component
- **Tooltip**: custom tooltip format VND (không dùng formatCompact dollar)
- **Responsive**: `ResponsiveContainer` width 100%, height 360px
- **XAxis**: date labels, `tickFormatter` locale "vi-VN"

---

## V. ZONE 3: MODEL EFFICIENCY MATRIX TABLE (Ma Trận Hiệu Quả Mô Hình)

### 5.1 Mô tả
Bảng thống kê chi tiết hiệu năng của từng dòng model AI, hỗ trợ sắp xếp và cảnh báo thông minh.

### 5.2 Cấu trúc bảng

| Model Key | Total Requests | Avg Cost/Req | Total Cost | Total Tokens | Avg Latency | Error Rate | Status |
|---|---|---|---|---|---|---|---|
| gpt-4o | 1,234 | `42₫` | `51.828₫` | 89.4K | 2.1s | 2.3% | ✅ Normal |
| claude-3-5-sonnet | 892 | `65₫` | `57.980₫` | 67.2K | 1.5s | 1.1% | ✅ Normal |
| deepseek-chat | 2,567 | `8₫` | `20.536₫` | 234.1K | 0.9s | **6.2%** | ⚠️ **Anomaly** |
| gemini-2.0-flash | 445 | `12₫` | `5.340₫` | 31.2K | 1.2s | 0.4% | ✅ Normal |

### 5.3 Columns

| Cột | Type | Format | Sortable | Nguồn dữ liệu |
|---|---|---|---|---|
| Model Key | string | badge (provider color) | ✅ | metadata->modelKey |
| Total Requests | number | `1,234` | ✅ | COUNT(*) |
| Avg Cost/Req | currency | `42₫` | ✅ | SUM(cost) / COUNT(*) |
| Total Cost | currency | `51.828₫` | ✅ | SUM(cost records) |
| Total Tokens | compact | `89.4K` | ✅ | SUM(tokens records) |
| Avg Latency | duration | `2.1s` | ✅ | AVG(metadata->latencyMs) |
| Error Rate | percent | `2.3%` | ✅ | COUNT(error)/COUNT(*) × 100 |
| Status | badge | ✅ Normal / ⚠️ Anomaly | ✅ | errorRate > 5% |

### 5.4 Anomaly Warning Trigger

**Điều kiện:** Error Rate > 5% → model được gắn badge `⚠️ Anomaly`

**Behavior:**
- Badge màu đỏ (`#f87171`) với tooltip: `"Error rate vượt ngưỡng 5%. Khuyến nghị kiểm tra API key hoặc chuyển sang model dự phòng."`
- Hàng được tô nền đỏ nhạt (rgba(248,113,113,0.05))
- ___
- Nếu có ≥2 model bị anomaly, hiển thị banner cảnh báo tổng thể phía trên bảng

### 5.5 Component: `ai-model-efficiency-matrix.tsx`

```typescript
interface AiModelEfficiencyMatrixProps {
  models: ModelEfficiencyRow[];
  anomalyThreshold?: number;  // default 5%
  onModelClick?: (modelKey: string) => void;  // filter chart to model
}
```

### 5.6 Sắp xếp (Sorting)
- Mặc định sort theo `Total Cost` descending (model tốn tiền nhất lên đầu)
- Click header để đảo sort (asc/desc)
- Visual indicator: `↑` hoặc `↓` bên cạnh tên cột

---

## VI. FILTER BAR (Điều Khiển Chung)

### 6.1 Component: `analytics-filter-bar.tsx`

```typescript
interface AnalyticsFilterBarProps {
  dateRange: { start: string; end: string };
  granularity: 'day' | 'week' | 'month';
  selectedModels: string[];
  availableModels: string[];
  onDateRangeChange: (range: { start: string; end: string }) => void;
  onGranularityChange: (g: 'day' | 'week' | 'month') => void;
  onModelsChange: (models: string[]) => void;
}
```

### 6.2 Layout
```
┌──────────────────────────────────────────────────────────────┐
│  📅 Từ [____] đến [____]    📊 Nhóm theo [Day ▼]   🤖 Model [All ▼]  │
│  [Hôm nay] [7 ngày] [30 ngày] [Tháng này] [Custom]            │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 Quick date buttons
5 nút tắt: `Hôm nay` | `7 ngày` | `30 ngày` | `Tháng này` | `Custom`

---

## VII. API CONTRACTS (Backend Endpoints Mới)

### 7.1 GET `/ai-analytics/scorecard`

**Headers:** `x-tenant-slug: <slug>`, `Authorization: Bearer <token>`

**Query params:**
| Param | Type | Default | Mô tả |
|---|---|---|---|
| startDate | ISO date | Đầu tháng | Inclusive |
| endDate | ISO date | Hôm nay | Inclusive |

**Response:**
```json
{
  "tenantId": "clx...",
  "period": { "start": "2026-06-01", "end": "2026-06-18" },
  "scorecard": {
    "totalCost": 135684,
    "totalCostDisplay": "135.684₫",
    "totalCostChange": 12.4,
    "totalTokens": 422100,
    "totalTokensDisplay": "422.1K",
    "totalTokensChange": 8.2,
    "avgLatencyMs": 1650,
    "avgLatencyDisplay": "1.7s",
    "avgLatencyChange": -5.3,
    "successRate": 97.8,
    "successRateDisplay": "97.8%",
    "successRateChange": 0.5
  },
  "generatedAt": "2026-06-18T01:00:00Z"
}
```

### 7.2 GET `/ai-analytics/cost-trend`

**Query params:**
| Param | Type | Default | Mô tả |
|---|---|---|---|
| startDate | ISO date | Đầu tháng | — |
| endDate | ISO date | Hôm nay | — |
| granularity | enum | `day` | `day`, `week`, `month` |
| modelKeys | CSV string | `all` | Lọc model, ví dụ: `gpt-4o,claude-3-5-sonnet` |

**Response:**
```json
{
  "tenantId": "clx...",
  "costTrend": [
    {
      "date": "2026-06-01",
      "label": "01/06",
      "totalCost": 5200,
      "totalTokens": 45000,
      "byModel": {
        "gpt-4o": { "cost": 3200, "tokens": 18000 },
        "deepseek-chat": { "cost": 2000, "tokens": 27000 }
      }
    }
  ],
  "generatedAt": "2026-06-18T01:00:00Z"
}
```

### 7.3 GET `/ai-analytics/model-efficiency`

**Query params:**
| Param | Type | Default | Mô tả |
|---|---|---|---|
| startDate | ISO date | Đầu tháng | — |
| endDate | ISO date | Hôm nay | — |

**Response:**
```json
{
  "tenantId": "clx...",
  "models": [
    {
      "modelKey": "gpt-4o",
      "totalRequests": 1234,
      "totalCost": 51828,
      "avgCostPerRequest": 42,
      "totalTokens": 89400,
      "avgTokensPerRequest": 72.4,
      "avgLatencyMs": 2100,
      "errorCount": 28,
      "errorRate": 2.3,
      "anomaly": false,
      "cacheHitRate": 15.2
    },
    {
      "modelKey": "deepseek-chat",
      "totalRequests": 2567,
      "totalCost": 20536,
      "avgCostPerRequest": 8,
      "totalTokens": 234100,
      "avgTokensPerRequest": 91.2,
      "avgLatencyMs": 900,
      "errorCount": 159,
      "errorRate": 6.2,
      "anomaly": true,
      "anomalyReason": "Error rate 6.2% vượt ngưỡng 5%",
      "cacheHitRate": 8.7
    }
  ],
  "anomalyCount": 1,
  "anomalyModels": ["deepseek-chat"],
  "generatedAt": "2026-06-18T01:00:00Z"
}
```

### 7.4 Backend Implementation Notes

**AiAnalyticsService** cần thực hiện các aggregate query trên `UsageRecord`:
- Lọc theo `tenantId` + `category='ai'` + `recordedAt` trong khoảng
- Với metric='cost': SUM(value) GROUP BY metadata->modelKey
- Với metric='tokens': SUM(value) GROUP BY metadata->modelKey
- Error rate: từ metadata->error (nếu tracking) hoặc dùng `WorkflowExecutionStep` error field
- Latency: cần thêm `latencyMs` vào metadata của `recordAiUsage()`

**Cập nhật Prisma Schema (nếu cần):**
Hiện tại `UsageRecord.metadata` là `Json?` — đủ để chứa `latencyMs` và `success`. Không cần migration mới cho schema, chỉ cần cập nhật `recordAiUsage()` để nhận thêm `latencyMs` và `success` fields.

---

## VIII. TYPE DEFINITIONS (File mới: `types/ai-analytics.ts`)

```typescript
// ============================================================================
// types/ai-analytics.ts
// Domain types for AI Cost Analytics Dashboard
// ============================================================================

/** Granularity for trend aggregation */
export type AiAnalyticsGranularity = "day" | "week" | "month";

/** Core scorecard view-model (Zone 1) */
export interface AiAnalyticsScorecard {
  totalCost: number;
  totalCostDisplay: string;
  totalCostChange: number;       // % change vs previous period
  totalTokens: number;
  totalTokensDisplay: string;
  totalTokensChange: number;
  avgLatencyMs: number;
  avgLatencyDisplay: string;
  avgLatencyChange: number;
  successRate: number;           // 0-100
  successRateDisplay: string;
  successRateChange: number;
}

/** Single time-series point (Zone 2) */
export interface CostTrendPoint {
  date: string;          // ISO date or bucket key
  label: string;         // localised display label (e.g. "01/06")
  totalCost: number;
  totalTokens: number;
  byModel: Record<string, {
    cost: number;
    tokens: number;
  }>;
}

/** Single model efficiency row (Zone 3) */
export interface ModelEfficiencyRow {
  modelKey: string;
  totalRequests: number;
  totalCost: number;
  avgCostPerRequest: number;
  totalTokens: number;
  avgTokensPerRequest: number;
  avgLatencyMs: number;
  errorCount: number;
  errorRate: number;      // 0-100
  anomaly: boolean;
  anomalyReason?: string;
  cacheHitRate: number;   // 0-100
}

/** Full model efficiency response (Zone 3) */
export interface ModelEfficiencyData {
  models: ModelEfficiencyRow[];
  anomalyCount: number;
  anomalyModels: string[];
  generatedAt: string;
}

/** Full dashboard view-model used by AiAnalyticsShell */
export interface AiAnalyticsDashboardData {
  scorecard: AiAnalyticsScorecard;
  costTrend: CostTrendPoint[];
  modelEfficiency: ModelEfficiencyData;
  period: { start: string; end: string };
  generatedAt: string;
}

/** Filter state shared across zones */
export interface AiAnalyticsFilters {
  startDate: string;
  endDate: string;
  granularity: AiAnalyticsGranularity;
  selectedModels: string[];
}
```

---

## IX. API FETCH HELPERS (File mới: `lib/ai-analytics.ts`)

```typescript
// ============================================================================
// lib/ai-analytics.ts
// API fetch helpers for AI Analytics Dashboard
// Mở rộng từ pattern trong lib/billing.ts
// ============================================================================

import { API_BASE, getStoredToken } from "./auth";
import { resolveTenantSlug } from "./billing";
import type {
  AiAnalyticsDashboardData,
  AiAnalyticsFilters,
  AiAnalyticsScorecard,
  CostTrendPoint,
  ModelEfficiencyData,
} from "../types/ai-analytics";

/** Fetch the AI usage scorecard for Zone 1. */
export async function fetchAiScorecard(
  startDate: string,
  endDate: string,
): Promise<AiAnalyticsScorecard | null> {
  const token = getStoredToken();
  if (!token) return null;
  const slug = await resolveTenantSlug();
  if (!slug) return null;

  const res = await fetch(
    `${API_BASE}/ai-analytics/scorecard?startDate=${startDate}&endDate=${endDate}`,
    { headers: { "x-tenant-slug": slug, Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.scorecard;
}

/** Fetch cost/trend time-series for Zone 2. */
export async function fetchAiCostTrend(
  filters: AiAnalyticsFilters,
): Promise<CostTrendPoint[]> {
  const token = getStoredToken();
  if (!token) return [];
  const slug = await resolveTenantSlug();
  if (!slug) return [];

  const params = new URLSearchParams({
    startDate: filters.startDate,
    endDate: filters.endDate,
    granularity: filters.granularity,
  });
  if (filters.selectedModels.length > 0) {
    params.set("modelKeys", filters.selectedModels.join(","));
  }

  const res = await fetch(
    `${API_BASE}/ai-analytics/cost-trend?${params.toString()}`,
    { headers: { "x-tenant-slug": slug, Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.costTrend;
}

/** Fetch model efficiency matrix for Zone 3. */
export async function fetchModelEfficiency(
  startDate: string,
  endDate: string,
): Promise<ModelEfficiencyData | null> {
  const token = getStoredToken();
  if (!token) return null;
  const slug = await resolveTenantSlug();
  if (!slug) return null;

  const res = await fetch(
    `${API_BASE}/ai-analytics/model-efficiency?startDate=${startDate}&endDate=${endDate}`,
    { headers: { "x-tenant-slug": slug, Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) return null;
  return res.json();
}

/** Fetch all dashboard data in parallel. */
export async function fetchAiAnalyticsDashboard(
  filters: AiAnalyticsFilters,
): Promise<AiAnalyticsDashboardData | null> {
  const [scorecard, costTrend, modelEfficiency] = await Promise.all([
    fetchAiScorecard(filters.startDate, filters.endDate),
    fetchAiCostTrend(filters),
    fetchModelEfficiency(filters.startDate, filters.endDate),
  ]);
  if (!scorecard && !costTrend.length && !modelEfficiency) return null;
  return {
    scorecard: scorecard ?? {
      totalCost: 0,
      totalCostDisplay: "0₫",
      totalCostChange: 0,
      totalTokens: 0,
      totalTokensDisplay: "0",
      totalTokensChange: 0,
      avgLatencyMs: 0,
      avgLatencyDisplay: "0s",
      avgLatencyChange: 0,
      successRate: 100,
      successRateDisplay: "100%",
      successRateChange: 0,
    },
    costTrend,
    modelEfficiency: modelEfficiency ?? { models: [], anomalyCount: 0, anomalyModels: [], generatedAt: new Date().toISOString() },
    period: { start: filters.startDate, end: filters.endDate },
    generatedAt: new Date().toISOString(),
  };
}
```

---

## X. CLIENT SHELL (File mới: `components/billing/ai-analytics-shell.tsx`)

### 10.1 State Management

```typescript
type ShellPhase = "loading" | "ready" | "empty" | "error";

interface AiAnalyticsShellState {
  phase: ShellPhase;
  data: AiAnalyticsDashboardData | null;
  filters: AiAnalyticsFilters;
  error: string;
}
```

### 10.2 Lifecycle
1. Mount → set `loading`
2. Gọi `fetchAiAnalyticsDashboard(filters)` — 3 parallel requests
3. Success → set `ready` với data
4. All null/empty → set `empty`
5. Error → set `error` + retry button

### 10.3 Filter updates
- Khi user thay đổi filter (date range, model, granularity)
- Re-fetch dữ liệu từ API
- Giữ lại chart scroll position nếu có

### 10.4 Layout
```
┌──────────────────────────────────────────────────────────────────────┐
│ Header: "AI Cost Analytics" + description                            │
├──────────────────────────────────────────────────────────────────────┤
│ FilterBar                                                             │
├──────────────────────────────────────────────────────────────────────┤
│ Zone 1: Scorecard (4 cards)                                          │
├──────────────────────────────────────────────────────────────────────┤
│ Zone 2: Cost Trend Chart  |  Token Burn Chart (tabs or toggle)      │
├──────────────────────────────────────────────────────────────────────┤
│ Zone 3: Model Efficiency Matrix Table                                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## XI. IMPLEMENTATION PLAN (Thứ Tự Thực Thi)

### Batch 1 — Backend Foundation (ưu tiên trước)
| Step | File | Mô tả |
|---|---|---|
| 1.1 | `apps/api/src/ai-analytics/` | Tạo module mới (module, service, controller) |
| 1.2 | `ai-analytics.service.ts` | Implement 3 aggregate methods query UsageRecord |
| 1.3 | `AiBillingMeterService` | Cập nhật `recordAiUsage()` nhận thêm `latencyMs` + `success` fields |
| 1.4 | `ai-analytics.controller.ts` | 3 endpoints: scorecard, cost-trend, model-efficiency |
| 1.5 | Build test | `npm run build --filter=api` pass |

### Batch 2 — Frontend Types + Lib (dependency cho UI)
| Step | File | Mô tả |
|---|---|---|
| 2.1 | `apps/web/types/ai-analytics.ts` | [NEW] All TypeScript interfaces |
| 2.2 | `apps/web/lib/ai-analytics.ts` | [NEW] 4 fetch helpers |

### Batch 3 — Route + Page Shell
| Step | File | Mô tả |
|---|---|---|
| 3.1 | `apps/web/app/(dashboard)/billing/analytics/layout.tsx` | [NEW] Server layout |
| 3.2 | `apps/web/app/(dashboard)/billing/analytics/page.tsx` | [NEW] Server page rendering `<AiAnalyticsShell />` |

### Batch 4 — Components (Bottom-up)
| Step | File | Mô tả |
|---|---|---|
| 4.1 | `components/billing/analytics-empty-state.tsx` | [NEW] Empty/error/loading states |
| 4.2 | `components/billing/analytics-filter-bar.tsx` | [NEW] Date range + model filter |
| 4.3 | `components/billing/ai-cost-token-chart.tsx` | [NEW] Recharts area + stacked bar |
| 4.4 | `components/billing/ai-model-efficiency-matrix.tsx` | [NEW] Sortable table + anomaly badges |
| 4.5 | `components/billing/ai-usage-scorecard.tsx` | [NEW] 4 KPI cards with sparklines |
| 4.6 | `components/billing/ai-analytics-shell.tsx` | [NEW] Orchestrator composing zones 1-3 |

### Batch 5 — Integration + Polish
| Step | File | Mô tả |
|---|---|---|
| 5.1 | Sidebar nav | Thêm link `/billing/analytics` vào dashboard navigation |
| 5.2 | Feature gate | Gắn `feature='analytics'` gate cho Team plan+ |
| 5.3 | Build full | `npm run build` full turbo — verify pass |

---

## XII. LUỒNG TƯƠNG TÁC NGƯỜI DÙNG

### Scenario 1: Operator muốn xem chi phí AI tháng này
1. Operator click `💰 AI Cost Analytics` ở sidebar
2. Dashboard load với mặc định: tháng hiện tại, tất cả models
3. Scorecard hiển thị: "Tháng này đã tiêu 135.684₫ cho AI"
4. Chart cho thấy chi phí tăng dần theo ngày
5. Bảng Matrix cho thấy deepseek-chat rẻ nhất, gpt-4o đắt nhất

### Scenario 2: Phát hiện model bất thường
1. Operator thấy badge `⚠️ Anomaly` trên model `deepseek-chat`
2. Hover tooltip: "Error rate 6.2% vượt ngưỡng 5%"
3. Operator click model để filter chart → thấy spike lỗi vào ngày 15/06
4. Operator kiểm tra API key, phát hiện rate limit → rotate key

### Scenario 3: So sánh hiệu quả model
1. Operator chọn 7 ngày custom range
2. Chart hiển thị stacked bar theo model
3. Bảng Matrix sort by `Avg Cost/Req` ascending
4. `deepseek-chat` rẻ nhất (8₫/req) nhưng error rate cao hơn
5. `gpt-4o` đắt hơn (42₫/req) nhưng ổn định hơn
6. Operator quyết định chuyển workflow quan trọng sang gpt-4o, workflow batch sang deepseek

---

## XIII. RỦI RO & GIẢI PHÁP

| Rủi ro | Tác động | Giải pháp |
|---|---|---|
| **UsageRecord không có latencyMs/success fields** | Không thể tính avg latency + success rate | Cập nhật `recordAiUsage()` nhận thêm fields, default 100% success |
| **Metadata là Json? — query performance** | Aggregate query chậm khi nhiều records | Đánh index composite `(tenantId, recordedAt, category, metric)` đã có; thêm index trên metadata->modelKey nếu cần |
| **BigInt cost** | Overflow khi SUM lớn | Sử dụng Prisma `Decimal` hoặc JS BigInt; giá trị VND ~ tỷ display an toàn |
| **Recharts performance với nhiều data points** | Lag khi 365+ ngày | Giới hạn granularity phù hợp: >90 ngày auto-group thành week |
| **Không có dữ liệu AI usage** | Empty state chiếm toàn màn hình | Hiển thị empty state với CTA "Tạo workflow AI đầu tiên" |

---

## XIV. METRICS THÀNH CÔNG

| Metric | Target | Đo lường |
|---|---|---|
| Thời gian load dashboard | <2s (first paint) | Lighthouse / manual test |
| Số model hiển thị chính xác | 100% khớp UsageRecord | Unit test backend aggregate |
| Anomaly detection delay | <30s từ lúc ghi nhận | End-to-end integration test |
| Filter responsiveness | <500ms re-render | React DevTools profiler |
| Empty state | Luôn hiển thị thay vì crash | Component test |
| Build pass | Full turbo (api + web) | `npm run build` |

---

*"Một dashboard không chỉ hiển thị số — nó phải kể câu chuyện về tiền bạc và hiệu năng."*

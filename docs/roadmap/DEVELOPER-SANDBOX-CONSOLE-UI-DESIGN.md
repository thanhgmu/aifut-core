# DEVELOPER SANDBOX & WEBHOOK INSPECTOR — CONSOLE UI DESIGN

> **Phân hệ:** `apps/web` (Next.js 16 App Router + React 19 + `@repo/ui`)
> **Nhánh:** `feature/phase3-developer-sandbox`
> **Bản thiết kế:** v1.0 — Frontend Console cho Backend Sandbox Engine + Webhook Inspector
> **Người thiết kế:** Minh (Claude Opus 4.8 — AIFUT THINK)
> **Cập nhật:** 2026-06-19
> **Trạng thái Backend:** ĐÃ COMMIT (sandbox.controller + webhook-inspector.controller live trên nhánh)

---

## 0. Bối cảnh & Nguyên tắc thiết kế

Backend `apps/api` đã hoàn thiện 2 cụm endpoint (xác minh từ source thực tế):

### 0.1. Endpoint Sandbox — prefix `/v1/sandbox`
| Method | Path | Mô tả | Header bắt buộc |
|---|---|---|---|
| POST | `/v1/sandbox/sessions` | Tạo phiên sandbox mới | `x-tenant-id` (UUID) |
| GET | `/v1/sandbox/sessions?page&pageSize` | List phiên phân trang (clamp 1–100) | `x-tenant-id` |
| POST | `/v1/sandbox/execute` | Thực thi action cô lập + ghi trace | `x-tenant-id` |

### 0.2. Endpoint Webhook Inspector — prefix `/v1/developer`
| Method | Path | Mô tả | Header bắt buộc |
|---|---|---|---|
| GET | `/v1/developer/webhook-logs?page&pageSize&direction&method&status` | List nhật ký webhook phân trang | `x-tenant-id` |

### 0.3. Contract dữ liệu thực tế (trích từ backend, KHÔNG suy diễn)

`SandboxSessionResponse`:
```ts
{ id: string; tenantId: string; name: string; isActive: boolean;
  createdAt: Date; updatedAt: Date; traceCount: number }
```

`SandboxTraceResponse`:
```ts
{ id: string; sessionId: string; actionType: string;
  inputPayload: unknown; outputPayload: unknown;
  latencyMs: number; isSuccess: boolean; errorMessage?: string;
  virtualCostBigInt: string;   // BigInt serialize ra string — KHÔNG parse thành Number ở UI
  createdAt: Date }
```

`PaginatedSessionsResponse`:
```ts
{ data: SandboxSessionResponse[]; total: number; page: number;
  pageSize: number; totalPages: number }
```

`ExecuteSandboxResult`: `{ trace: SandboxTraceResponse; session: SandboxSessionResponse }`

Webhook log (suy ra từ `CreateWebhookLogDto` + filter, response phân trang):
```ts
WebhookLog = {
  id: string; tenantId: string; endpointId?: string | null;
  method: string; headers: Record<string,string>; payload: string;
  responseStatus?: number; responseBody?: string;
  durationMs: number; direction: 'INBOUND' | 'OUTBOUND'; createdAt: Date }
```

### 0.4. 4 nguyên tắc bất biến của tầng UI
1. **Tenant context qua header** — UI luôn cấy `x-tenant-id` + `x-aifut-sandbox: true`. KHÔNG bao giờ nhét tenantId vào query/body (đồng bộ chống IDOR của backend).
2. **BigInt-safe** — `virtualCostBigInt` luôn xử lý dạng `string`/`BigInt`, KHÔNG ép `Number` (tránh mất chính xác > 2^53). Format hiển thị qua helper riêng.
3. **Phân trang cứng** — pageSize clamp 1–100 ở client trước khi gọi (mirror backend), tránh round-trip lỗi 400.
4. **Phi kỹ thuật vẫn dùng được** — empty state có hướng dẫn, nút hành động rõ ràng, tooltip tiếng Việt; chế độ "raw" cho dev nâng cao.

> **Lưu ý kiến trúc quan trọng:** Module phân tích hiện hữu (`lib/analytics.ts`) dùng header `x-tenant-slug`. Cụm Sandbox/Webhook backend dùng `x-tenant-id` (UUID). Đây là **2 contract khác nhau** — tầng `lib/sandbox.ts` PHẢI có resolver riêng `resolveTenantId()` trả về UUID, không tái dùng `resolveTenantSlug()`.

---

## 1. CÂY CẤU TRÚC FILE

### 1.1. File khởi tạo MỚI
```
apps/web/
├── types/
│   └── sandbox.ts                          [NEW] Mirror toàn bộ contract backend
├── lib/
│   ├── sandbox.ts                          [NEW] API helpers Sandbox + Webhook + header injector
│   └── sandbox-format.ts                   [NEW] formatVirtualCost (BigInt-safe), formatLatency, statusColor
├── components/
│   └── developer/
│       ├── sandbox-session-dashboard.tsx   [NEW] KHỐI 1 — bảng session + nút tạo phiên
│       ├── sandbox-session-table.tsx        [NEW] Table thuần (presentational)
│       ├── sandbox-trace-list.tsx           [NEW] List tiến trình ngầm (virtualCost + latency)
│       ├── create-session-button.tsx        [NEW] Nút + modal tạo phiên mới
│       ├── webhook-inspector.tsx            [NEW] KHỐI 2 — wrapper 2 cột
│       ├── webhook-log-viewer.tsx           [NEW] Cột trái — danh sách gói tin
│       ├── webhook-log-row.tsx              [NEW] 1 dòng log (Method/Path/Status/Direction badge)
│       ├── webhook-detail-panel.tsx         [NEW] Cột phải — wrapper Headers + Payload
│       ├── json-tree-viewer.tsx             [NEW] Tree viewer đệ quy (collapse/expand)
│       ├── direction-badge.tsx              [NEW] Badge INBOUND/OUTBOUND
│       └── status-code-badge.tsx            [NEW] Badge mã HTTP theo dải màu (2xx/3xx/4xx/5xx)
└── app/
    └── developer/
        └── sandbox/
            └── page.tsx                    [UPDATE] Lắp 3 khối vào layout console
```

### 1.2. File CẬP NHẬT
```
apps/web/app/developer/sandbox/page.tsx     — thay placeholder bằng <SandboxConsole/>
apps/web/lib/auth.ts                        — (nếu cần) export API_BASE đã có sẵn, tái dùng
```

> Các component cũ `components/sandbox-*.tsx` (env-form, logs, workspace) là tài sản giai đoạn trước — **giữ nguyên**, không trộn. Console mới nằm gọn trong `components/developer/`.

---

## 2. KHỐI 1 — SANDBOX SESSION DASHBOARD

### 2.1. Mục tiêu
Bảng danh sách `SandboxSession` phân trang cứng + nút kích hoạt phiên mới + danh sách tiến trình chạy ngầm (trace) hiển thị `virtualCostBigInt` và `latencyMs`.

### 2.2. Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│  Sandbox Sessions                        [ + Tạo phiên mới ]          │  ← header + CTA
├─────────────────────────────────────────────────────────────────────┤
│  TÊN PHIÊN          │ TRẠNG THÁI │ SỐ TRACE │ TẠO LÚC    │ THAO TÁC    │
│  Test VNPay flow    │ ● Active   │ 12       │ 2 phút trước│ [Xem trace] │
│  Connector dry-run  │ ○ Idle     │ 3        │ Hôm qua     │ [Xem trace] │
│  ...                                                                   │
├─────────────────────────────────────────────────────────────────────┤
│         ‹ Trước │ Trang 1/4 (total 67) │ Sau ›    [pageSize: 20 ▾]    │  ← phân trang cứng
└─────────────────────────────────────────────────────────────────────┘
         │ (khi click "Xem trace" → mở panel/route con bên dưới)
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Tiến trình chạy ngầm — Phiên "Test VNPay flow"                       │
│  ─────────────────────────────────────────────────────────────────   │
│  ✓ AI_ROUTING    │ latency 142ms │ cost 1,250 vCU │ 10:42:01          │
│  ✓ CONNECTOR_EXEC│ latency 310ms │ cost 4,000 vCU │ 10:42:03          │
│  ✗ WORKFLOW_RUN  │ latency 58ms  │ cost 0 vCU     │ 10:42:05 (lỗi…)   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3. Component breakdown
- **`sandbox-session-dashboard.tsx`** (`'use client'`): state `page`, `pageSize`, `sessions`, `selectedSessionId`, `loading`. Gọi `fetchSandboxSessions(page, pageSize)` khi mount/đổi trang. Render `<SandboxSessionTable/>` + `<SandboxTraceList/>` (chỉ khi có `selectedSessionId`).
- **`sandbox-session-table.tsx`** (presentational, nhận props): cột Tên / Trạng thái (`isActive` → `<DirectionBadge>`-style dot) / `traceCount` / `createdAt` (định dạng relative `vi-VN`) / nút "Xem trace". Phân trang cứng: nút Trước/Sau disable ở biên, dropdown pageSize [10,20,50,100].
- **`sandbox-trace-list.tsx`**: nhận `sessionId`, gọi backend execute history qua trace của session response. Mỗi dòng:
  - `actionType` (icon theo loại: AI/Connector/Workflow)
  - `latencyMs` → `formatLatency(ms)` ("142ms" / "1.7s")
  - `virtualCostBigInt` → `formatVirtualCost(str)` ("1,250 vCU") — **BigInt-safe**
  - `isSuccess` → tick xanh / chéo đỏ + `errorMessage` tooltip
- **`create-session-button.tsx`**: nút + modal nhập `name` (validate min 1 / max 256 ký tự — mirror backend), POST `/v1/sandbox/sessions`, optimistic prepend vào list.

### 2.4. Hành vi phân trang cứng
- Client clamp `pageSize ∈ [1,100]`, `page ≥ 1` trước khi gửi (tránh 400 thừa).
- Dùng `total` + `totalPages` từ response để render "Trang X/Y (total N)".
- KHÔNG infinite-scroll — phân trang nút bấm tường minh (đồng bộ với clamp backend, chống quét dữ liệu).

---

## 3. KHỐI 2 — WEBHOOK TRAFFIC INSPECTOR UI

### 3.1. Mục tiêu
Log Viewer 2 cột: **trái** = danh sách gói tin (Method / Path / Status / Direction), **phải** = JSON Tree Viewer (Headers + Payload thô) của log được chọn.

### 3.2. Layout master-detail
```
┌───────────────────────────────┬───────────────────────────────────────┐
│  WEBHOOK LOGS (cột trái)       │  DETAIL PANEL (cột phải)                │
│  [Filter: Dir▾ Method▾ Status▾]│  ┌─ Tab: [Headers] [Payload] [Response]│
│  ─────────────────────────────│  ─────────────────────────────────────  │
│ ▸POST /hook/vnpay  200 INBOUND│  ▾ headers                               │
│ ▸POST /out/notify  500 OUTBND │     ├─ content-type: "application/json"  │
│ ▸GET  /hook/zalo   204 INBOUND│     ├─ x-signature: "HMAC-SHA256…"        │
│  (selected highlight)         │     └─ user-agent: "AIFUT/1.0"           │
│  ...                          │  ▾ payload                               │
│                               │     ├─ orderId: "OD-2026-0042"           │
│  ‹ Trang 1/9 (total 173) ›    │     └─ amount: 250000                     │
└───────────────────────────────┴───────────────────────────────────────┘
```

### 3.3. Component breakdown
- **`webhook-inspector.tsx`** (`'use client'` wrapper): state `logs`, `selectedLogId`, `filters {direction, method, status}`, `page`, `pageSize`. Layout flex/grid 2 cột (`grid-template-columns: minmax(360px, 40%) 1fr`). Responsive: < 1024px → cột phải thành overlay drawer.
- **`webhook-log-viewer.tsx`** (cột trái): thanh filter (3 select: direction INBOUND/OUTBOUND, method GET/POST/…, status 1xx–5xx), list `<WebhookLogRow/>`, phân trang cứng. Auto-refresh tùy chọn (polling interval, mặc định OFF để tiết kiệm — bật bằng toggle "Realtime ⟳").
- **`webhook-log-row.tsx`**: 1 dòng = `<StatusCodeBadge status>` + method mono + path truncate + `<DirectionBadge direction>` + `durationMs`. Click → set `selectedLogId`, highlight active.
- **`webhook-detail-panel.tsx`** (cột phải): 3 tab (Headers / Payload / Response). Parse `payload` & `responseBody` — nếu JSON hợp lệ → `<JsonTreeViewer/>`; nếu không → hiển thị raw mono có nút "Copy raw". Header luôn render bằng tree.
- **`json-tree-viewer.tsx`**: đệ quy render object/array, mỗi node collapse/expand, màu theo type (string/number/bool/null), nút copy theo node + copy toàn bộ. Guard độ sâu (max depth ~12) + giới hạn kích thước (truncate payload > 256KB kèm cảnh báo) tránh treo DOM.
- **`direction-badge.tsx`** / **`status-code-badge.tsx`**: badge màu — INBOUND xanh dương / OUTBOUND tím; 2xx xanh lá, 3xx xám, 4xx vàng, 5xx đỏ.

### 3.4. "Realtime" nghĩa là gì ở đây
Backend hiện tại expose **GET phân trang**, chưa có SSE/WebSocket. UI mô phỏng realtime bằng **polling có kiểm soát**:
- Toggle "⟳ Realtime" → `setInterval` gọi lại `fetchWebhookLogs(page=1, filters)` mỗi 3–5s (cấu hình được).
- Chỉ poll khi đang ở trang 1 + không có log đang mở detail (tránh nhảy lựa chọn).
- Tự dừng polling khi tab ẩn (`document.visibilityState`) để tiết kiệm token/tài nguyên.
- **Đường nâng cấp tương lai:** khi backend bổ sung `GET /v1/developer/webhook-logs/stream` (SSE), thay lớp polling bằng `EventSource` — interface `useWebhookStream()` đã tách sẵn để swap không đụng UI.

---

## 4. KHỐI 3 — API HELPERS & CONTEXT HEADER (`lib/sandbox.ts`)

### 4.1. Header injector trung tâm
```ts
// lib/sandbox.ts
import { API_BASE, getStoredToken } from './auth';

/** Resolver UUID tenant (KHÁC resolveTenantSlug của analytics). */
async function resolveTenantId(): Promise<string | null> { /* lấy từ session/profile */ }

/** Trung tâm cấy header — đồng bộ lớp chặn IDOR + sandbox guard backend. */
async function sandboxHeaders(extra?: Record<string,string>): Promise<HeadersInit | null> {
  const token = getStoredToken();
  const tenantId = await resolveTenantId();
  if (!token || !tenantId) return null;
  return {
    'x-tenant-id': tenantId,          // ← IDOR guard
    'x-aifut-sandbox': 'true',        // ← cờ môi trường sandbox (đồng bộ AIFUT_SANDBOX backend)
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}
```

### 4.2. Các hàm API public (mirror endpoint backend)
```ts
// ── Sandbox ──────────────────────────────────────────────
fetchSandboxSessions(page=1, pageSize=20): Promise<PaginatedSessionsResponse | null>
//   GET /v1/sandbox/sessions?page&pageSize   (clamp 1..100 trước khi gọi)
createSandboxSession(name: string): Promise<SandboxSessionResponse | null>
//   POST /v1/sandbox/sessions  { name }      (validate 1..256 ký tự)
executeSandbox(sessionId, action, input?): Promise<ExecuteSandboxResult | null>
//   POST /v1/sandbox/execute   { sessionId, action, input }

// ── Webhook Inspector ────────────────────────────────────
fetchWebhookLogs(filter: WebhookQueryFilterDto): Promise<PaginatedWebhookLogs | null>
//   GET /v1/developer/webhook-logs?page&pageSize&direction&method&status
```

### 4.3. Quy ước xử lý lỗi & an toàn
- Mọi hàm trả `null`/`[]` khi thiếu token/tenant (không throw) — UI hiển thị empty/login state.
- `cache: 'no-store'` cho mọi call (dữ liệu telemetry động).
- Clamp tham số phân trang ở client = mirror backend → giảm 400 round-trip.
- **BigInt-safe** trong `lib/sandbox-format.ts`:
  ```ts
  formatVirtualCost(raw: string): string  // dùng BigInt(raw), nhóm 3 số, hậu tố " vCU"
  formatLatency(ms: number): string        // <1000 → "Xms", ≥1000 → "X.Ys"
  statusColor(code?: number): 'green'|'gray'|'amber'|'red'
  ```
- Validate `direction ∈ {INBOUND,OUTBOUND}`, `status ∈ [100,599]` trước khi gắn query (mirror backend, fail-fast ở UI).

---

## 5. TYPES — `types/sandbox.ts` (nguồn chân lý frontend)

```ts
export type SandboxActionType = 'AI_ROUTING' | 'CONNECTOR_EXEC' | 'WORKFLOW_RUN';
export type WebhookDirection = 'INBOUND' | 'OUTBOUND';

export interface SandboxSession { id; tenantId; name; isActive; createdAt; updatedAt; traceCount }
export interface SandboxTrace   { id; sessionId; actionType; inputPayload; outputPayload;
                                  latencyMs; isSuccess; errorMessage?; virtualCostBigInt; createdAt }
export interface PaginatedSessions { data: SandboxSession[]; total; page; pageSize; totalPages }
export interface ExecuteResult  { trace: SandboxTrace; session: SandboxSession }

export interface WebhookLog { id; tenantId; endpointId?; method; headers; payload;
                              responseStatus?; responseBody?; durationMs; direction; createdAt }
export interface WebhookQueryFilter { page; pageSize; direction?; method?; status? }
export interface PaginatedWebhookLogs { data: WebhookLog[]; total; page; pageSize; totalPages }
```
> Date có thể là string ISO sau JSON serialize — UI khai báo `string | Date` và parse khi format.

---

## 6. LẮP RÁP CONSOLE — `app/developer/sandbox/page.tsx`

```tsx
// 'use client' container hoặc server shell + client islands
export default function SandboxConsolePage() {
  return (
    <ConsoleShell title="Developer Sandbox Console">
      <Tabs>
        <Tab id="sessions" label="Sessions & Trace">
          <SandboxSessionDashboard />        {/* KHỐI 1 */}
        </Tab>
        <Tab id="webhooks" label="Webhook Inspector">
          <WebhookInspector />               {/* KHỐI 2 */}
        </Tab>
      </Tabs>
    </ConsoleShell>
  );
}
```
- 2 khối tách tab để tải lười (mỗi tab tự fetch khi active → tiết kiệm).
- Dùng `@repo/ui` primitives (Button, Badge, Table, Modal, Tabs) cho nhất quán design system.
- Đặt link điều hướng từ sidebar Developer hiện hữu (`app/developer`).

---

## 7. THỨ TỰ TRIỂN KHAI ĐỀ XUẤT (cho lane code kế tiếp)

| Bước | File | Phụ thuộc |
|---|---|---|
| 1 | `types/sandbox.ts` | — |
| 2 | `lib/sandbox-format.ts` | types |
| 3 | `lib/sandbox.ts` | types, auth, format |
| 4 | `components/developer/{direction,status-code}-badge.tsx` | — |
| 5 | `components/developer/json-tree-viewer.tsx` | — |
| 6 | Khối 1: session-table → trace-list → create-button → dashboard | lib, badge |
| 7 | Khối 2: log-row → log-viewer → detail-panel → inspector | lib, json-tree, badge |
| 8 | `app/developer/sandbox/page.tsx` (lắp ráp + tab) | tất cả |

**Kiểm thử thủ công (do người dùng chạy, không tự build):**
`x-tenant-id` UUID hợp lệ → tạo phiên → execute 1 action → thấy trace với latency/vCU → mở webhook tab → click log → tree render Headers/Payload.

---

## 8. RỦI RO & GHI CHÚ KIẾN TRÚC

- **Mismatch header tenant:** analytics dùng `x-tenant-slug`, sandbox dùng `x-tenant-id`. Phải có resolver UUID riêng — đừng tái dùng nhầm sẽ 400/IDOR fail.
- **BigInt overflow:** tuyệt đối không `Number(virtualCostBigInt)` — dùng `BigInt()` + format string.
- **JSON Tree treo DOM:** payload lớn cần guard depth + size truncate.
- **Realtime giả lập:** polling tốn request; mặc định OFF, auto-pause khi tab ẩn; tách hook để swap sang SSE sau.
- **Phi kỹ thuật:** mọi empty state cần hướng dẫn ("Chưa có phiên nào — bấm Tạo phiên mới để bắt đầu thử nghiệm connector an toàn").

---

_Hết bản thiết kế. Backend contract đã verify trực tiếp từ source `sandbox.controller.ts`, `sandbox.service.ts`, `webhook-inspector.controller.ts`, `webhook-inspector.types.ts` trên nhánh `feature/phase3-developer-sandbox`._

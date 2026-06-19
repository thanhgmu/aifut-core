# Developer Sandbox Environment & Webhook Inspector Subsystem

> **Phase:** 2 (Operator Ready) — Developer tooling
> **Status:** Design Proposal
> **Date:** 2026-06-19
> **Commit Base:** `dd3a51b`
> **Author:** Claude Architecture Scan

---

## 1. Hiện trạng Codebase (Codebase Scan tại `dd3a51b`)

### 1.1 `apps/api/src/sandbox/` — Đã có, in-memory, đơn luồng

| File | Vai trò | Ghi chú |
|---|---|---|
| `sandbox.constants.ts` | Hằng số, template env, error codes | Có `SANDBOX_DEFAULT_ENV`, `SANDBOX_ENV_TEMPLATES`, `SANDBOX_ERRORS` |
| `sandbox.service.ts` | Core logic — CRUD sandbox, execute simulated connector | **In-memory `Map<string, SandboxInstance>`**, không có DB persistence |
| `sandbox.controller.ts` | REST endpoints: CRUD + env + execute + traces | Dùng `X-Tenant-Id` header, đã có check tenant cơ bản nhưng chưa guard chính thức |
| `sandbox.module.ts` | NestJS module | Export `SandboxService`, không import Prisma |

**Hạn chế hiện tại:**
- **Volatile:** Toàn bộ sandbox state sống trong RAM — mất khi process restart
- **Không có webhook inspector:** Không theo dõi traffic webhook đầu vào/đầu ra
- **Không có Ledger guard:** `executeConnector()` mô phỏng mù, không phân biệt sandbox hay production touchpoint
- **Không có phân trang log:** `listRunTraces()` trả toàn bộ mảng, không hỗ trợ `offset`/`limit`
- **Thiếu DB schema:** Không có model Prisma cho sandbox hay webhook log
- **Không có cleanup TTL daemon:** Sandbox tự expire theo timestamp nhưng không có cron sweep xoá

### 1.2 `apps/api/src/developer/` — Portal tĩnh, thiếu inspector

| File | Vai trò | Ghi chú |
|---|---|---|
| `developer.constants.ts` | AIS spec, roadmap, certification checklist | Tĩnh, hardcoded |
| `developer.service.ts` | Trả spec, SDK info, webhook docs, API stats | Chỉ đọc, không có inspector |
| `developer.controller.ts` | GET endpoints docs/ais-spec/sdks/webhooks/... | Read-only |
| `developer.module.ts` | NestJS module | Không export service nào |

**Hạn chế hiện tại:**
- `getWebhookDocs()` chỉ trả về documentation tĩnh, không có real-time webhook log
- Không có endpoint đề xuất, query log webhook thực tế
- Không có kết nối giữa `DeveloperModule` và `SandboxModule`

### 1.3 Webhook hiện có trong `apps/api/src/payments/`

| File | Vai trò |
|---|---|
| `payments/payments-webhook.service.ts` | Xử lý Stripe/MoMo webhook thật — signature verification, IPN handling |
| `payments/stripe-webhook.controller.ts` | Stripe webhook receiver endpoint |
| `payments/ledger/refund-webhook.router.ts` | Refund webhook routing |
| `integrations/zalo/zalo-webhook.controller.ts` | Zalo OA webhook receiver |
| `integrations/zalo/zalo-webhook.service.ts` | Zalo OA webhook processing |

**Nhận xét:** Các webhook thật đã có infrastructure tốt (signature verify, retry, idempotency). Sandbox webhook inspector sẽ intercept và log chúng, không thay thế.

### 1.4 Prisma Schema liên quan

Các model gần với sandbox/webhook:
- `ZaloWebhookEvent` — đã lưu raw payload webhook Zalo
- `WorkflowExecution`, `WorkflowExecutionStep` — có thể gắn trace
- `NotificationLog` — có logs gửi webhook notification
- `AuditEvent` — audit trail sẵn

**Không có model nào cho:**
- `SandboxSession` — trạng thái sandbox persist
- `SandboxRunTrace` — trace execution persist
- `WebhookInspectionLog` — webhook traffic inspection records
- `WebhookMockEndpoint` — mock webhook receiver cho sandbox testing

---

## 2. Kiến trúc mới: Sandbox Environment & Webhook Inspector

### 2.1 Tổng quan

```
┌─────────────────────────────────────────────────────────────────┐
│                    Developer Console UI                         │
│  (apps/web → /developer/sandbox, /developer/webhooks)           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP
┌──────────────────────────▼──────────────────────────────────────┐
│                   sandbox/ + developer/ Controllers              │
│  • sandbox.controller.ts (mở rộng)                              │
│  • developer.controller.ts (mở rộng — thêm webhook-inspect)     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    Sandbox Service Layer                         │
│                                                                  │
│  sandbox.service.ts          webhook-inspector.service.ts        │
│  ┌──────────────────────┐   ┌───────────────────────────────┐   │
│  │ executeConnector()   │   │ inspectWebhookTraffic()       │   │
│  │ executeSandbox       │   │ listInspectedWebhooks()       │   │
│  │   Isolation() ★     │   │ getWebhookDetail()            │   │
│  │ createSandbox()     │   │ replayWebhook()               │   │
│  │ cleanupExpired()    │   │ registerMockEndpoint()        │   │
│  └──────────┬───────────┘   └───────────────┬───────────────┘   │
│             │                               │                   │
│  ┌──────────▼───────────────────────────────▼───────────────┐   │
│  │            Prisma Persistence Layer                       │   │
│  │  SandboxSession | SandboxTrace | WebhookInspectionLog    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Background Jobs (via cron/scheduler)            │   │
│  │  • sandbox-cleanup — purge expired sessions + traces     │   │
│  │  • webhook-log-retention — purge logs quá hạn           │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Luồng dữ liệu chi tiết

```
Developer tạo sandbox mới
        │
        ▼
POST /api/sandbox
  │  tenantId từ X-Tenant-Id header
  │  Guard: TenantGuard kiểm tra quyền
  ▼
sandbox.service.createSandbox()
  │  Prisma: INSERT SandboxSession
  │  TTL mặc định: 30 phút, configurable
  │  Env: mặc định + template + custom (tối đa 256 keys)
  ▼
SandboxSession created (persisted)

─────────────────────────────────────────────────────────────

Developer execute connector trong sandbox
        │
        ▼
POST /api/sandbox/:id/execute
  │  Guard: verify tenantId === sandbox.tenantId (IDOR prevention)
  │  Guard: kiểm tra sandbox active && chưa expired
  ▼
sandbox.service.executeConnector()
  │  1. Load sandbox session từ DB
  │  2. Kiểm tra action type
  │  3. Nếu action chạm Ledger → redirect qua LedgerGuard
  │     LedgerGuard tạo FakeLedgerContext thay vì LedgerTransaction thật
  │  4. Tạo SandboxTrace + SandboxExecutionResult
  │  5. Mọi HTTP outbound đều đi qua WebhookInterceptionProxy
  │     → log request/response vào WebhookInspectionLog
  ▼
Trả về SandboxRunTrace + WebhookInspectionLog[]

─────────────────────────────────────────────────────────────

Webhook được gửi đến sandbox mock endpoint
        │
        ▼
POST /api/sandbox/:id/webhooks/mock
  │  Guard: verify tenantId
  ▼
webhook-inspector.service.handleMockWebhook()
  │  1. Record raw payload (headers, body, query, timestamp)
  │  2. Record response status code + timing
  │  3. INSERT WebhookInspectionLog
  │  4. Trả về mock response cho connector
  ▼
WebhookInspectionLog persisted

─────────────────────────────────────────────────────────────

Developer xem log webhook real-time
        │
        ▼
GET /api/sandbox/:id/webhooks?page=1&limit=20&status=200
  │  Guard: verify tenantId
  │  Filter: status, eventType, from, to
  ▼
webhook-inspector.service.listInspectedWebhooks()
  │  Prisma: paginated query
  │  Trả về: { data: WebhookInspectionLog[], meta: { total, page, limit } }
```

---

## 3. Chi tiết 3 hàm logic core

### 3.1 `executeSandboxIsolation()` — Cơ chế cô lập Sandbox

**File đích:** `apps/api/src/sandbox/sandbox.service.ts` (mở rộng từ `executeConnector()` hiện tại)

**Chữ ký:**
```typescript
async executeSandboxIsolation(
  sandboxId: string,
  tenantId: string,
  input: ExecuteConnectorInput,
): Promise<IsolatedExecutionResult>
```

**Thiết kế:** Hàm này là phiên bản nâng cấp của `executeConnector()` hiện tại, bổ sung:

#### a) LedgerGuard — Ngăn chạm Ledger thật

```
executeSandboxIsolation()
  │
  ├─ Phát hiện: action === 'ais.action.invoke' && payload có reference đến
  │  LedgerTransaction / Wallet / Invoice / BillingAccount
  │
  ├─ Nếu có Ledger touchpoint:
  │   │
  │   ├─ Tạo FakeLedgerContext (không ghi vào DB Prisma LedgerTransaction)
  │   │   • balanceAfter = sandbox.env['MOCK_LEDGER_BALANCE'] ?? 100000000
  │   │   • type = LedgerTransactionType.CREDIT (luôn CREDIT trong sandbox)
  │   │   • referenceId = `sandbox:${sandboxId}:${runId}`
  │   │   • description = `[SANDBOX] ${input.payload?.action_key} — no-op`
  │   │
  │   └─ Ghi log cảnh báo: "SANDBOX ISOLATION: Ledger mutation blocked"
  │      (không throw — sandbox vẫn chạy, chỉ không ghi ledger thật)
  │
  └─ Nếu không có Ledger touchpoint:
      → Chạy execution bình thường như `executeConnector()` hiện tại
```

**Luồng xử lý:**
1. Load `SandboxSession` từ DB
2. Parse `input.action` và `input.payload` để detect Ledger touchpoint
3. Nếu detect → tạo `FakeLedgerContext` (object in-memory, không persist)
4. Chạy simulation (giữ nguyên delay + mock response pattern hiện tại)
5. Mọi HTTP outbound (nếu `input.baseUrl` được set) đều routing qua `WebhookInterceptionProxy`
6. Ghi `SandboxTrace` vào DB
7. Trả về `IsolatedExecutionResult` gồm: result + fakeLedgerContext + webhookLogs[]

**Ledger Touchpoint Detection:**
```typescript
private static readonly LEDGER_SENSITIVE_KEYS = [
  'ledger', 'wallet', 'balance', 'transaction', 'invoice',
  'payment', 'payout', 'commission', 'refund', 'credit', 'debit',
  'billing_account', 'payment_method',
];

private hasLedgerTouchpoint(payload: any): boolean {
  const payloadStr = JSON.stringify(payload ?? {}).toLowerCase();
  return LEDGER_SENSITIVE_KEYS.some(key => payloadStr.includes(key));
}
```

**Dữ liệu trả về mở rộng:**
```typescript
interface IsolatedExecutionResult {
  trace: SandboxRunTrace;
  isolated: boolean;                    // true = LedgerGuard đã active
  ledgerGuard: {
    blocked: boolean;
    reason?: string;
    fakeContext?: FakeLedgerContext;     // chỉ khi blocked === true
  };
  webhookInspections: WebhookInspectionEntry[];
}
```

---

### 3.2 `inspectWebhookTraffic()` — Trình thanh tra Webhook

**File đích:** `apps/api/src/developer/webhook-inspector.service.ts` (mới)

**Chữ ký:**
```typescript
async inspectWebhookTraffic(
  sandboxId: string | null,      // null = platform-wide (admin)
  tenantId: string,
  options: WebhookInspectionFilter,
): Promise<PaginatedResult<WebhookInspectionLog>>
```

**Thiết kế:**

#### a) Cơ chế ghi nhận — Interception Proxy Pattern

```
Connector gửi webhook (thật hoặc sandbox)
  │
  ├─ Nếu sandbox mode:
  │   → POST /api/sandbox/:id/webhooks/mock
  │   → webhook-inspector ghi nhận payload + headers + timestamp
  │   → Trả về mock response (có thể cấu hình)
  │
  ├─ Nếu production mode:
  │   → WebhookInspectorMiddleware (NestJS middleware)
  │   → Chặn raw body + headers trước khi forward đến handler thật
  │   → Ghi nhận INCOMING
  │   → Handler xử lý, ghi response
  │   → Ghi nhận OUTGOING response
  │
  └─ Cả 2 mode → INSERT WebhookInspectionLog vào DB
```

#### b) Schema ghi nhận (Prisma model mới)

```prisma
model WebhookInspectionLog {
  id              String   @id @default(cuid())
  tenantId        String
  sandboxId       String?             // null = production webhook, NOT sandbox

  // ── Webhook metadata ─────────────────────────────────────────
  eventType       String              // 'workflow.completed', 'connector.error', ...
  source          String              // 'sandbox' | 'production' | 'mock'
  direction       String              // 'incoming' | 'outgoing'

  // ── Request capture ───────────────────────────────────────────
  requestMethod   String              // GET | POST | PUT | ...
  requestUrl      String              // Full URL
  requestHeaders  Json                // Raw headers (redacted Authorization)
  requestPayload  Json                // Raw payload JSON
  requestQuery    Json                // Query parameters

  // ── Response capture ──────────────────────────────────────────
  responseStatus  Int                 // HTTP status code
  responseHeaders Json                // Response headers
  responsePayload Json?               // Response body (nếu có)
  responseTimeMs  Int                 // Round-trip time (ms)

  // ── Verification ──────────────────────────────────────────────
  signatureValid  Boolean?            // HMAC signature verification result
  signatureAlgo   String?             // 'HMAC-SHA256', 'none'
  retryCount      Int      @default(0)

  // ── Timestamps ────────────────────────────────────────────────
  receivedAt      DateTime            // When the webhook was received
  completedAt     DateTime?           // When processing completed
  createdAt       DateTime  @default(now())

  @@index([tenantId, sandboxId, receivedAt])
  @@index([tenantId, eventType])
  @@index([tenantId, responseStatus])
  @@index([tenantId, receivedAt])
  @@index([sandboxId, receivedAt])
}
```

#### c) WebhookInspectionFilter — Bộ lọc toàn diện

```typescript
interface WebhookInspectionFilter {
  sandboxId?: string;                  // Lọc theo sandbox (null = tất cả)
  eventType?: string;                  // Lọc theo event type
  source?: 'sandbox' | 'production' | 'mock';
  direction?: 'incoming' | 'outgoing';
  statusMin?: number;                  // Status code >=
  statusMax?: number;                  // Status code <=
  statusCodes?: number[];              // Exact status codes
  signatureValid?: boolean;            // Lọc theo verification result
  dateFrom?: string;                   // ISO-8601
  dateTo?: string;                     // ISO-8601
  searchPayload?: string;              // Full-text search trong payload (JSON)
  page: number;                        // 1-indexed
  limit: number;                       // max 100
  sortBy?: 'receivedAt' | 'responseTimeMs' | 'responseStatus';
  sortOrder?: 'asc' | 'desc';
}
```

#### d) Các phương thức chính

| Method | Input | Output | Mô tả |
|---|---|---|---|
| `inspectWebhookTraffic()` | filter | `PaginatedResult<WebhookInspectionLog>` | Tra cứu lịch sử webhook với filter và phân trang |
| `getWebhookDetail(id, tenantId)` | id | `WebhookInspectionLog` | Chi tiết một webhook log (bao gồm raw payload) |
| `replayWebhook(id, tenantId)` | id | `WebhookReplayResult` | Gửi lại webhook vào sandbox (test retry) |
| `registerMockEndpoint(sandboxId, tenantId, config)` | config | `MockEndpoint` | Tạo mock endpoint cho sandbox |
| `handleMockWebhook(sandboxId, endpoint, rawRequest)` | raw | `MockResponse` | Xử lý webhook đến sandbox mock endpoint |
| `getWebhookStats(sandboxId, tenantId, period)` | period | `WebhookStats` | Thống kê: success rate, avg response time, distribution |

---

### 3.3 API điều phối và Console (Developer Sandbox API Endpoints)

**Thiết kế endpoints tại `sandbox/` và `developer/`:**

#### a) Sandbox Endpoints — Mở rộng từ controller hiện tại

**File đích:** `apps/api/src/sandbox/sandbox.controller.ts` (mở rộng)

| Method | Path | Mô tả | Auth | Query Params |
|---|---|---|---|---|
| `POST` | `/api/sandbox` | Tạo sandbox mới | Tenant | `{ label, ttlMs, env, template }` |
| `GET` | `/api/sandbox` | Danh sách sandbox của tenant | Tenant | `?page=1&limit=20&active=true` |
| `GET` | `/api/sandbox/:id` | Chi tiết sandbox | Tenant | — |
| `DELETE` | `/api/sandbox/:id` | Xoá sandbox | Tenant | — |
| `PATCH` | `/api/sandbox/:id/extend` | Gia hạn TTL sandbox | Tenant | `{ ttlMs }` |
| `GET` | `/api/sandbox/:id/env` | Danh sách env | Tenant | — |
| `PUT` | `/api/sandbox/:id/env` | Set/merge env | Tenant | `{ env, mode }` |
| `POST` | `/api/sandbox/:id/execute` | Execute connector (isolated) | Tenant | `{ action, payload, ... }` |
| `GET` | `/api/sandbox/:id/traces` | Danh sách run traces | Tenant | `?page=1&limit=20&action=ais.discovery` |
| `GET` | `/api/sandbox/:id/traces/:runId` | Chi tiết một run trace | Tenant | — |
| `GET` | `/api/sandbox/:id/webhooks` | Webhook inspection logs | Tenant | `?page=1&limit=20&eventType=&statusMin=&dateFrom=&dateTo=` |
| `GET` | `/api/sandbox/:id/webhooks/:inspectionId` | Chi tiết webhook log | Tenant | — |
| `POST` | `/api/sandbox/:id/webhooks/replay/:inspectionId` | Replay webhook | Tenant | — |
| `POST` | `/api/sandbox/:id/webhooks/mock` | Mock webhook receiver | Tenant | — |
| `GET` | `/api/sandbox/:id/webhooks/stats` | Thống kê webhook | Tenant | `?period=24h\|7d\|30d` |
| `POST` | `/api/sandbox/:id/mock-endpoints` | Tạo mock endpoint | Tenant | `{ method, path, responseStatus, responseBody, delayMs }` |
| `GET` | `/api/sandbox/:id/mock-endpoints` | Danh sách mock endpoints | Tenant | — |

#### b) Developer Endpoints — Webhook Inspector (mở rộng)

**File đích:** `apps/api/src/developer/developer.controller.ts` (mở rộng)

| Method | Path | Mô tả | Auth | Query |
|---|---|---|---|---|
| `GET` | `/api/developer/webhooks` | Platform-wide webhook logs | Tenant | `?page=1&limit=20&eventType=&status=&sandboxId=` |
| `GET` | `/api/developer/webhooks/:id` | Chi tiết webhook log | Tenant | — |
| `POST` | `/api/developer/webhooks/:id/replay` | Replay production webhook vào sandbox | Tenant | `{ targetSandboxId }` |
| `GET` | `/api/developer/webhooks/stats` | Platform-wide webhook stats | Tenant | `?period=24h\|7d\|30d` |
| `GET` | `/api/developer/sandboxes` | Cross-reference: list sandbox+traces+webhooks | Tenant | `?page=1&limit=20&status=` |

#### c) IDOR Protection — Thiết kế Guard nghiêm ngặt

```typescript
// apps/api/src/common/guards/sandbox-tenant.guard.ts (MỚI)

@Injectable()
export class SandboxTenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.headers['x-tenant-id'];
    const sandboxId = request.params.id;

    if (!tenantId || !sandboxId) {
      throw new ForbiddenException('Missing tenant or sandbox context');
    }

    // Load sandbox từ DB — nếu không tồn tại hoặc tenant khác → 403
    const sandbox = await this.prisma.sandboxSession.findUnique({
      where: { id: sandboxId },
      select: { tenantId: true },
    });

    if (!sandbox || sandbox.tenantId !== tenantId) {
      // Không tiết lộ sandbox có tồn tại hay không
      throw new ForbiddenException('Access denied to sandbox resource');
    }

    return true;
  }
}
```

```typescript
// apps/api/src/sandbox/sandbox.controller.ts — guard gắn trên từng endpoint

@Controller('sandbox')
@UseGuards(SandboxTenantGuard) // Mặc định toàn controller
export class SandboxController {
  // POST, GET, DELETE, PATCH đều được guard qua sandbox ID
  // IDOR: Nếu tenant A cố tình truy cập sandbox của tenant B → 403
}
```

#### d) Paginated Response Format

```typescript
interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}
```

Tất cả endpoints `GET` danh sách đều áp dụng format này với filter pipeline:
```
Query params → ValidationPipe → Build Prisma where clause → Paginated query → Response
```

---

## 4. Cấu trúc files — Khởi tạo mới & Cập nhật

### 4.1 Files mới cần tạo

```
apps/api/src/
├── sandbox/
│   ├── sandbox.constants.ts          [CẬP NHẬT — thêm WEBHOOK, MOCK, PAGINATION_CONSTANTS]
│   ├── sandbox.service.ts            [CẬP NHẬT — thêm executeSandboxIsolation(), cleanupExpired(), LedgerGuard integration]
│   ├── sandbox.controller.ts         [CẬP NHẬT — thêm webhook endpoints, mock endpoints, pagination, extend, stats]
│   ├── sandbox.module.ts             [CẬP NHẬT — import WebhookInspectorModule, PrismaModule]
│   ├── dto/
│   │   ├── create-sandbox.dto.ts     [MỚI — validation DTOs tách rời khỏi service types]
│   │   ├── execute-connector.dto.ts  [MỚI]
│   │   ├── set-env.dto.ts            [MỚI]
│   │   ├── extend-sandbox.dto.ts     [MỚI]
│   │   ├── pagination-query.dto.ts   [MỚI — reusable pagination query DTO]
│   │   ├── create-mock-endpoint.dto.ts [MỚI]
│   │   └── webhook-filter.dto.ts     [MỚI]
│   ├── guards/
│   │   └── sandbox-tenant.guard.ts   [MỚI — IDOR prevention guard]
│   └── interfaces/
│       ├── sandbox.interface.ts      [MỚI — types tách rời service]
│       ├── isolated-execution.interface.ts [MỚI]
│       └── paginated-result.interface.ts [MỚI — generic type]
│
├── developer/
│   ├── developer.service.ts          [CẬP NHẬT — inject WebhookInspectorService, thêm webhook log methods]
│   ├── developer.controller.ts       [CẬP NHẬT — thêm webhook log endpoints, stats]
│   ├── developer.module.ts           [CẬP NHẬT — import WebhookInspectorModule]
│   └── dto/
│       └── dev-webhook-filter.dto.ts [MỚI]
│
├── developer/webhook-inspector/      [MỚI — thư mục con cho Webhook Inspector subsystem]
│   ├── webhook-inspector.service.ts  [MỚI — core: inspectWebhookTraffic(), replayWebhook(), getWebhookStats()]
│   ├── webhook-inspector.controller.ts [MỚI — REST endpoints cho inspector operations]
│   ├── webhook-inspector.module.ts   [MỚI — exports service]
│   ├── webhook-inspector.constants.ts [MỚI — mock response templates, status codes]
│   ├── interceptors/
│   │   └── webhook-capture.interceptor.ts [MỚI — NestJS interceptor bắt request/response tự động]
│   ├── guards/
│   │   └── webhook-tenant.guard.ts   [MỚI — tenant isolation cho webhook logs]
│   ├── dto/
│   │   ├── webhook-inspection-filter.dto.ts [MỚI]
│   │   ├── mock-webhook.dto.ts       [MỚI]
│   │   └── mock-endpoint-config.dto.ts [MỚI]
│   └── interfaces/
│       ├── webhook-inspection.interface.ts [MỚI]
│       ├── mock-endpoint.interface.ts [MỚI]
│       └── webhook-stats.interface.ts [MỚI]
│
└── common/
    └── guards/
        └── tenant-resource.guard.ts  [MỚI — generic tenant resource guard, có thể tái sử dụng]
```

### 4.2 Files cần cập nhật

| File | Thay đổi |
|---|---|
| `apps/api/prisma/schema.prisma` | Thêm 3 models: `SandboxSession`, `SandboxTrace`, `WebhookInspectionLog` |
| `apps/api/src/app.module.ts` | Import `WebhookInspectorModule` |
| `apps/api/src/sandbox/sandbox.constants.ts` | Thêm `SANDBOX_WEBHOOK_MOCK_TIMEOUT`, `SANDBOX_MOCK_ENDPOINTS_MAX`, `PAGINATION_MAX_LIMIT`, `PAGINATION_DEFAULT_LIMIT` |
| `apps/api/src/sandbox/sandbox.service.ts` | Thêm `executeSandboxIsolation()`, `cleanupExpired()`, `extendSandbox()`, `getWebhookStats()`, tích hợp LedgerGuard |
| `apps/api/src/sandbox/sandbox.controller.ts` | Thêm 8+ endpoints mới (webhook, mock, extend, pagination) |
| `apps/api/src/sandbox/sandbox.module.ts` | Import `PrismaModule`, `WebhookInspectorModule` |
| `apps/api/src/developer/developer.service.ts` | Inject `WebhookInspectorService`, thêm `getWebhookLogs()`, `getWebhookStats()` |
| `apps/api/src/developer/developer.controller.ts` | Thêm 4+ endpoints mới |
| `apps/api/src/developer/developer.module.ts` | Import `WebhookInspectorModule` |

### 4.3 Prisma Schema — 3 Models mới

```prisma
// ── Developer Sandbox — Persistent Sessions ──────────────────────

model SandboxSession {
  id              String          @id @default(cuid())
  tenantId        String
  label           String
  createdAt       DateTime        @default(now())
  expiresAt       DateTime
  env             Json            // Record<string, string>
  active          Boolean         @default(true)
  nodeEnv         String          @default("development")

  traces          SandboxTrace[]
  inspectionLogs  WebhookInspectionLog[]
  mockEndpoints   SandboxMockEndpoint[]

  @@index([tenantId, active, expiresAt])
  @@index([tenantId, createdAt])
  @@index([expiresAt])   // cleanup cron query
}

model SandboxTrace {
  id              String          @id @default(cuid())
  sandboxId       String
  tenantId        String
  action          String          // 'ais.discovery', 'ais.action.invoke', ...
  payload         Json            // Input payload
  result          Json            // SandboxExecutionResult
  isolated        Boolean         @default(true)   // LedgerGuard active?
  ledgerBlocked   Boolean         @default(false)
  logs            Json            // string[] — execution logs
  startedAt       DateTime
  completedAt     DateTime
  durationMs      Int
  envSnapshot     Json            // Snapshot env tại thời điểm chạy

  session         SandboxSession  @relation(fields: [sandboxId], references: [id], onDelete: Cascade)

  @@index([sandboxId, startedAt])
  @@index([tenantId, startedAt])
  @@index([tenantId, action])
  @@index([sandboxId, action])
}

model WebhookInspectionLog {
  id              String              @id @default(cuid())
  tenantId        String
  sandboxId       String?             // null = production

  eventType       String
  source          String              // 'sandbox' | 'production' | 'mock'
  direction       String              // 'incoming' | 'outgoing'
  requestMethod   String
  requestUrl      String
  requestHeaders  Json
  requestPayload  Json
  requestQuery    Json
  responseStatus  Int
  responseHeaders Json
  responsePayload Json?
  responseTimeMs  Int

  signatureValid  Boolean?
  signatureAlgo   String?
  retryCount      Int                 @default(0)

  receivedAt      DateTime
  completedAt     DateTime?
  createdAt       DateTime            @default(now())

  session         SandboxSession?     @relation(fields: [sandboxId], references: [id], onDelete: Cascade)

  @@index([tenantId, sandboxId, receivedAt])
  @@index([tenantId, eventType])
  @@index([tenantId, responseStatus])
  @@index([tenantId, receivedAt])
  @@index([sandboxId, receivedAt])
  @@index([sandboxId, eventType])
  @@index([sandboxId, responseStatus])
  @@index([sandboxId, source])
  @@index([createdAt])
}

model SandboxMockEndpoint {
  id                  String    @id @default(cuid())
  sandboxId           String
  tenantId            String
  method              String    // GET | POST | PUT | DELETE | PATCH
  path                String    // e.g. "/api/webhook/receiver"
  responseStatus      Int       @default(200)
  responseHeaders     Json?     // Response headers mặc định
  responseBody        Json?     // Template response body (có thể chứa {{placeholder}})
  delayMs             Int       @default(0)    // Simulated delay
  enabled             Boolean   @default(true)
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  session             SandboxSession @relation(fields: [sandboxId], references: [id], onDelete: Cascade)

  @@unique([sandboxId, method, path])
  @@index([sandboxId, enabled])
}
```

---

## 5. Chi tiết triển khai 3 hàm core

### 5.1 `executeSandboxIsolation()` — Chi tiết mã giả

```typescript
// File: apps/api/src/sandbox/sandbox.service.ts

async executeSandboxIsolation(
  sandboxId: string,
  tenantId: string,
  input: ExecuteConnectorInput,
): Promise<IsolatedExecutionResult> {
  const startMs = Date.now();

  // 1. Load sandbox từ DB (không phải in-memory)
  const session = await this.prisma.sandboxSession.findUnique({
    where: { id: sandboxId },
  });
  if (!session || session.tenantId !== tenantId) {
    throw new NotFoundException({ code: 'SANDBOX_NOT_FOUND' });
  }
  if (!session.active || new Date(session.expiresAt) < new Date()) {
    throw new BadRequestException({ code: 'SANDBOX_EXPIRED' });
  }

  const runId = randomUUID();
  const traceId = crypto.randomUUID();

  // 2. Detect Ledger touchpoint
  const hasLedgerTouch = this.hasLedgerTouchpoint(input.payload);
  const isolated = hasLedgerTouch;  // LedgerGuard active

  // 3. Chạy isolated execution
  const executionResult = await this.runIsolatedAction(
    session,
    input,
    { isolated, startMs },
  );

  // 4. Nếu có intercept webhook → ghi log
  const webhookLogs: WebhookInspectionEntry[] = [];
  if (input.baseUrl) {
    // WebhookInterceptionProxy không gọi thật, chỉ ghi nhận
    webhookLogs.push({
      direction: 'outgoing',
      method: input.method ?? 'POST',
      url: `${input.baseUrl}${input.endpoint ?? ''}`,
      headers: input.headers ?? {},
      payload: input.payload,
      status: executionResult.result.statusCode ?? 200,
      responseTimeMs: executionResult.result.durationMs,
      simulated: true,
    });
  }

  // 5. Persist trace xuống DB
  await this.prisma.sandboxTrace.create({
    data: {
      id: traceId,
      sandboxId,
      tenantId,
      action: input.action,
      payload: input.payload ?? {},
      result: executionResult.result,
      isolated,
      ledgerBlocked: isolated && hasLedgerTouch,
      logs: executionResult.logs,
      startedAt: executionResult.startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      envSnapshot: session.env,
    },
  });

  // 6. Persist webhook logs nếu có
  for (const wl of webhookLogs) {
    await this.prisma.webhookInspectionLog.create({
      data: {
        tenantId,
        sandboxId,
        eventType: `sandbox.execute.${input.action}`,
        source: 'sandbox',
        direction: wl.direction as any,
        requestMethod: wl.method,
        requestUrl: wl.url,
        requestHeaders: wl.headers ?? {},
        requestPayload: wl.payload ?? {},
        requestQuery: {},
        responseStatus: wl.status,
        responseHeaders: {},
        responsePayload: {},
        responseTimeMs: wl.responseTimeMs,
        receivedAt: new Date(executionResult.startedAt),
        completedAt: new Date(),
      },
    });
  }

  // 7. Trả về isolated result
  return {
    trace: {
      runId,
      action: input.action,
      payload: input.payload,
      result: executionResult.result,
      startedAt: executionResult.startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      envSnapshot: session.env as Record<string, string>,
      logs: executionResult.logs,
    },
    isolated,
    ledgerGuard: {
      blocked: isolated && hasLedgerTouch,
      reason: isolated && hasLedgerTouch
        ? 'Sandbox isolation: Ledger mutation blocked. Use real ledger in production.'
        : undefined,
      fakeContext: isolated && hasLedgerTouch
        ? { balanceAfter: 100_000_000, type: 'CREDIT', referenceId: `sandbox:${sandboxId}:${runId}` }
        : undefined,
    },
    webhookInspections: webhookLogs,
  };
}

private hasLedgerTouchpoint(payload: any): boolean {
  // Scan sâu JSON keys để detect Ledger/Wallet/Invoice reference
  const sensitiveKeys = [
    'ledger', 'wallet', 'balance', 'transaction', 'invoice',
    'payment', 'payout', 'commission', 'refund', 'credit', 'debit',
    'billing_account', 'payment_method', 'subscription',
  ];
  const str = JSON.stringify(payload ?? {}).toLowerCase();
  return sensitiveKeys.some(k => str.includes(k));
}
```

### 5.2 `inspectWebhookTraffic()` — Chi tiết mã giả

```typescript
// File: apps/api/src/developer/webhook-inspector/webhook-inspector.service.ts

async inspectWebhookTraffic(
  sandboxId: string | null,
  tenantId: string,
  filter: WebhookInspectionFilter,
): Promise<PaginatedResult<WebhookInspectionLog>> {
  const where: Prisma.WebhookInspectionLogWhereInput = {
    tenantId,
    ...(sandboxId ? { sandboxId } : {}),
    ...(filter.eventType ? { eventType: filter.eventType } : {}),
    ...(filter.source ? { source: filter.source } : {}),
    ...(filter.direction ? { direction: filter.direction } : {}),
    ...(filter.signatureValid !== undefined
      ? { signatureValid: filter.signatureValid }
      : {}),
    ...(filter.statusCodes && filter.statusCodes.length > 0
      ? { responseStatus: { in: filter.statusCodes } }
      : {}),
    ...(filter.statusMin !== undefined || filter.statusMax !== undefined
      ? {
          responseStatus: {
            ...(filter.statusMin !== undefined
              ? { gte: filter.statusMin }
              : {}),
            ...(filter.statusMax !== undefined
              ? { lte: filter.statusMax }
              : {}),
          },
        }
      : {}),
    ...(filter.dateFrom || filter.dateTo
      ? {
          receivedAt: {
            ...(filter.dateFrom ? { gte: new Date(filter.dateFrom) } : {}),
            ...(filter.dateTo ? { lte: new Date(filter.dateTo) } : {}),
          },
        }
      : {}),
  };

  const page = Math.max(1, filter.page);
  const limit = Math.min(100, Math.max(1, filter.limit));
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    this.prisma.webhookInspectionLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        [filter.sortBy ?? 'receivedAt']: filter.sortOrder ?? 'desc',
      },
      select: {
        id: true,
        eventType: true,
        source: true,
        direction: true,
        requestMethod: true,
        requestUrl: true,
        responseStatus: true,
        responseTimeMs: true,
        receivedAt: true,
        sandboxId: true,
        // KHÔNG trả về full payload trong list view
        // → dùng getWebhookDetail() để xem chi tiết
      },
    }),
    this.prisma.webhookInspectionLog.count({ where }),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: skip + limit < total,
      hasPrevious: page > 1,
    },
  };
}
```

### 5.3 Mock Webhook Handler

```typescript
// File: apps/api/src/developer/webhook-inspector/webhook-inspector.service.ts

async handleMockWebhook(
  sandboxId: string,
  tenantId: string,
  rawRequest: MockWebhookRequest,
): Promise<MockWebhookResponse> {
  const startMs = Date.now();

  // 1. Verify tenant
  const session = await this.prisma.sandboxSession.findUnique({
    where: { id: sandboxId },
    select: { tenantId: true },
  });
  if (!session || session.tenantId !== tenantId) {
    throw new ForbiddenException();
  }

  // 2. Find matching mock endpoint
  const endpoint = await this.prisma.sandboxMockEndpoint.findUnique({
    where: {
      sandboxId_method_path: {
        sandboxId,
        method: rawRequest.method ?? 'POST',
        path: rawRequest.path,
      },
    },
  });

  let responseStatus = 200;
  let responseBody: any = { received: true, sandbox: sandboxId };
  let delayMs = 0;

  if (endpoint && endpoint.enabled) {
    responseStatus = endpoint.responseStatus;
    delayMs = endpoint.delayMs;
    responseBody = endpoint.responseBody ?? responseBody;
  }

  // 3. Simulate delay
  if (delayMs > 0) {
    await new Promise(r => setTimeout(r, delayMs));
  }

  const responseTimeMs = Date.now() - startMs;

  // 4. Record inspection log
  await this.prisma.webhookInspectionLog.create({
    data: {
      tenantId,
      sandboxId,
      eventType: rawRequest.eventType ?? 'mock.webhook',
      source: 'mock',
      direction: 'incoming',
      requestMethod: rawRequest.method ?? 'POST',
      requestUrl: `/sandbox/${sandboxId}/webhooks/mock${rawRequest.path ?? ''}`,
      requestHeaders: rawRequest.headers ?? {},
      requestPayload: rawRequest.payload ?? {},
      requestQuery: rawRequest.query ?? {},
      responseStatus,
      responseHeaders: {},
      responsePayload: responseBody,
      responseTimeMs,
      receivedAt: new Date(startMs),
      completedAt: new Date(),
    },
  });

  return {
    statusCode: responseStatus,
    body: responseBody,
    responseTimeMs,
  };
}
```

---

## 6. Background Jobs (Cleanup & Maintenance)

### 6.1 Sandbox Expiry Cleanup

```typescript
// File: apps/api/src/sandbox/sandbox.service.ts

/**
 * Cron job: chạy mỗi 5 phút, sweep sandbox hết hạn.
 * Soft-delete: set active=false, không xoá hard (giữ traces cho audit).
 */
async cleanupExpired(): Promise<number> {
  const now = new Date();
  const result = await this.prisma.sandboxSession.updateMany({
    where: {
      active: true,
      expiresAt: { lt: now },
    },
    data: { active: false },
  });
  return result.count;
}
```

### 6.2 Webhook Log Retention

```typescript
// File: apps/api/src/developer/webhook-inspector/webhook-inspector.service.ts

/**
 * Cron job: chạy mỗi 24h, purge webhook logs quá 90 ngày.
 * Retention period configurable qua env WEBHOOK_LOG_RETENTION_DAYS.
 */
async purgeOldLogs(retentionDays: number = 90): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const result = await this.prisma.webhookInspectionLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
```

---

## 7. WebhookCaptureInterceptor — Production Webhook Auto-Log

**File đích:** `apps/api/src/developer/webhook-inspector/interceptors/webhook-capture.interceptor.ts`

### 7.1 Thiết kế

Interceptor NestJS auto-bắt tất cả webhook request gửi đến các endpoint `/webhooks/*` (hữu ích cho production monitoring):

```
Request → WebhookCaptureInterceptor
  │
  ├─ Clone request stream (để đọc raw body)
  │
  ├─ Record: method, url, headers, body, timestamp
  │
  ├─ next.handle() → response
  │
  ├─ Record: statusCode, response body, duration
  │
  └─ Upsert WebhookInspectionLog (async, không block)
```

### 7.2 Integration

Interceptor này optional — chỉ active khi `WEBHOOK_CAPTURE_ENABLED=true`.
Gắn vào webhook controllers thông qua NestJS `APP_INTERCEPTOR` hoặc controller-scoped.

---

## 8. Security Design — Anti-IDOR & Tenant Isolation

### 8.1 Nguyên tắc

1. **Mọi request endpoint đều có tenant context** — từ `X-Tenant-Id` header hoặc JWT
2. **Không tin tưởng input client** — `sandboxId` trong URL phải thuộc tenant
3. **Phản hồi 403 đồng nhất** — không tiết lộ resource có tồn tại hay không
4. **Rate limiting** — sandbox execute endpoints có rate limit riêng (tránh abuse compute)

### 8.2 Guard Chain

```
Request → TenantGuard (xác thực) → SandboxTenantGuard (resource ownership)
         → RateLimitGuard (optional) → Handler
```

### 8.3 Webhook Payload Redaction

Khi log webhook payload, tự động redact các field nhạy cảm:

```typescript
private static readonly REDACTED_FIELDS = [
  'password', 'secret', 'token', 'apiKey', 'api_key',
  'authorization', 'cookie', 'set-cookie',
];

private redactSensitiveHeaders(headers: Record<string, any>): Record<string, any> {
  const redacted = { ...headers };
  for (const key of Object.keys(redacted)) {
    if (REDACTED_FIELDS.some(f => key.toLowerCase().includes(f))) {
      redacted[key] = '***REDACTED***';
    }
  }
  return redacted;
}
```

---

## 9. Integration với hệ thống hiện tại

### 9.1 WebhookInspectorService ↔ PaymentsWebhookService

```typescript
// webhook-inspector.service.ts — capture production payment webhook

@Injectable()
export class WebhookInspectorService {
  // Gọi từ payments-webhook.service.ts khi production webhook đến
  async captureProductionWebhook(
    eventType: string,
    request: IncomingRequest,
    response: OutgoingResponse,
    durationMs: number,
  ): Promise<void> {
    // Ghi log không blocking
    this.prisma.webhookInspectionLog.create({
      data: {
        tenantId: request.tenantId,
        eventType,
        source: 'production',
        direction: 'incoming',
        requestMethod: request.method,
        requestUrl: request.url,
        requestHeaders: this.redactSensitiveHeaders(request.headers),
        requestPayload: request.body ?? {},
        requestQuery: request.query ?? {},
        responseStatus: response.statusCode,
        responseHeaders: response.headers ?? {},
        responsePayload: response.body ?? {},
        responseTimeMs: durationMs,
        receivedAt: new Date(),
        completedAt: new Date(),
      },
    }).catch(err => this.logger.warn('Failed to capture webhook log', err));
  }
}
```

### 9.2 DeveloperService ↔ WebhookInspectorService

```typescript
// developer.service.ts — expose webhook logs qua developer API

@Injectable()
export class DeveloperService {
  constructor(
    private readonly webhookInspector: WebhookInspectorService,
  ) {}

  async getWebhookLogs(
    tenantId: string,
    filter: DevWebhookFilterDto,
  ): Promise<PaginatedResult<WebhookInspectionLog>> {
    return this.webhookInspector.inspectWebhookTraffic(null, tenantId, filter);
  }

  async getWebhookStats(
    tenantId: string,
    period: '24h' | '7d' | '30d',
  ): Promise<WebhookStats> {
    return this.webhookInspector.getWebhookStats(null, tenantId, period);
  }
}
```

---

## 10. Roadmap triển khai

### Phase 1 — Core (ưu tiên cao, 3-5 sessions)

| Task | Files | Phụ thuộc |
|---|---|---|
| 1. Prisma migration — 3 models mới | `schema.prisma` | — |
| 2. SandboxSession CRUD — từ in-memory lên DB | `sandbox.service.ts`, `sandbox.controller.ts` | (1) |
| 3. Pagination DTO + Generic response | `dto/*`, `interfaces/*` | — |
| 4. SandboxTenantGuard (IDOR prevention) | `guards/sandbox-tenant.guard.ts` | (1) |
| 5. executeSandboxIsolation() | `sandbox.service.ts` | (1)(2)(3) |
| 6. WebhookInspectorService — log + query | `webhook-inspector/*` | (1) |
| 7. Mock webhook endpoints | `webhook-inspector/*`, `sandbox.controller.ts` | (1)(6) |
| 8. Developer API mở rộng | `developer/*` | (6) |

### Phase 2 — Nâng cao (sau Phase 1)

| Task | Mô tả |
|---|---|
| 9. WebhookCaptureInterceptor — production auto-log | Intercept production webhook controllers |
| 10. Webhook replay | Gửi lại webhook log vào sandbox |
| 11. Webhook stats dashboard API | Aggregation queries |
| 12. Background cron: cleanup + retention | Sandbox expiry sweep + webhook log purge |
| 13. Rate limiting cho sandbox execute | Tránh abuse compute |

---

## 11. Rủi ro & Mitigation

| Rủi ro | Impact | Mitigation |
|---|---|---|
| **Ledger isolation miss** — sandbox code vô tình ghi ledger thật | Critical — dữ liệu tài chính sai | `executeSandboxIsolation()` detect và block mọi Ledger/Wallet/Invoice reference. Thêm integration test verify không có Prisma write đến ledger models |
| **Webhook log storage explosion** — product webhook log chiếm nhiều DB | High — chi phí storage | Retention cron purge 90 ngày. Index tối ưu. Có thể archive sang cold storage (S3) cho Phase 2 |
| **IDOR bypass** — tenant A đọc webhook log của tenant B | Critical — data leak | `SandboxTenantGuard` trên mọi endpoint. `WebhookTenantGuard` trên webhook logs. Double-check trong service layer |
| **Performance** — sandbox execute ghi DB đồng bộ | Medium — latency tăng | Webhook log ghi async (fire-and-forget với error catch). Trace ghi sync vì cần trả về response |
| **Migration từ in-memory lên DB** — mất sandbox state hiện tại | Low | In-memory sandbox chỉ dùng dev. Production build sẽ chỉ dùng DB path |

---

## 12. Kết luận

Hệ thống Developer Sandbox Environment & Webhook Inspector Subsystem mở rộng từ codebase hiện tại (`sandbox/` + `developer/`) thành một subsystem hoàn chỉnh với:

1. **Persistent Sandbox Sessions** — không còn in-memory volatile, có cleanup cron
2. **LedgerGuard Isolation** — chặn sandbox code chạm ledger/wallet/invoice thật
3. **Webhook Inspector** — log chi tiết request/response, replay, filter, pagination
4. **IDOR Protection** — guard chain đảm bảo tenant isolation
5. **Production Webhook Capture** — optional interceptor cho production monitoring
6. **Clean Architecture** — DTO riêng, interface riêng, guard riêng, module riêng

**Tổng số files mới:** ~20 files TypeScript + 3 Prisma models
**Tổng số files cập nhật:** 8 files hiện có
**Critical path:** Phase 1 (8 tasks) — 3-5 session code liên tục.

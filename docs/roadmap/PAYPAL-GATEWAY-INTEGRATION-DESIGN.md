# PayPal Gateway SDK — Thiết kế kiến trúc tích hợp
> Phase 3 — Cổng thanh toán quốc tế & Global Currency Settlements
> Cập nhật: 2026-06-17 | Target milestone: Phase 3 Critical Path

---

## I. TỔNG QUAN & VỊ TRÍ CHIẾN LƯỢC

### 1.1 Bối cảnh

AIFUT đã có:
- **VNPay** — Cổng nội địa Việt Nam (VND), dùng HMAC-SHA512, redirect flow
- **MoMo** — Ví điện tử Việt Nam (VND), dùng HMAC-SHA256, REST API
- **Stripe** — Quốc tế (USD/25+ currencies), webhook signed events
- **Ledger** — Wallet nội bộ (BigInt/VND*100), Optimistic Lock CAS
- **Multi-currency** — 7 currencies (VND, USD, THB, IDR, MYR, PHP, SGD)
- **SubscriptionActivator** — Shared activation path cho mọi gateway

**Khoảng trống:** Thiếu PayPal — cổng thanh toán quốc tế phổ biến nhất, đặc biệt quan trọng cho:
- Khách hàng nước ngoài mua Local License / template packs
- Reseller quốc tế thanh toán commission
- Marketplace cho developer global
- Tính năng auto-recharge wallet (top-up)
- Payout cho affiliate/reseller ra thẻ Visa/Mastercard

### 1.2 Phạm vi Phase 3

| Module | Mô tả | Priority |
|---|---|---|
| **PayPal Order API** | Tạo đơn + capture server-side (one-time payments) | P0 |
| **PayPal Webhook** | Xác thực webhook events + 3-layer idempotency | P0 |
| **PayPal Order Verification** | Active reconciliation phòng mất webhook | P0 |
| Multi-currency settlement | Quy đổi USD → BigInt nội bộ với spread control | P1 |
| PayPal Vault / Subscriptions | Lưu payment method + subscription billing | P2 |
| PayPal Payouts | Mass payout cho affiliate/reseller | P2 |

### 1.3 Nguyên tắc kiến trúc

1. **Follow existing pattern** — Cấu trúc module giống hệt VNPay/MoMo (`config.ts`, `service.ts`, `controller.ts`, `ipn.guard.ts`, `types.ts`, `result-codes.ts`)
2. **3-layer idempotency guard** — Clone pattern từ `VnpayIpnGuard` / `MomoIpnGuard` đã proven
3. **Graceful unconfigured** — Module boot OK khi thiếu env vars, fail chỉ khi dùng thực tế
4. **Shared activator** — Gọi `SubscriptionActivatorService` và `LedgerService` thay vì tự activate
5. **BigInt safe** — Mọi amount PayPal phải quy đổi an toàn từ decimal (USD) → BigInt (smallest unit)

---

## II. CẤU TRÚC FILE & MODULE

### 2.1 Sơ đồ file

```
apps/api/src/payments/
├── paypal/                              ← THƯ MỤC MỚI
│   ├── paypal.config.ts                 ← Env-sourced credentials + OAuth2 token cache
│   ├── paypal.module.ts                 ← NestJS module declaration
│   ├── paypal.service.ts                ← Core service: createOrder, captureOrder, verifyWebhook, queryOrder
│   ├── paypal.controller.ts             ← HTTP endpoints dưới /payments/paypal
│   ├── paypal.ipn.guard.ts              ← 3-layer idempotency guard (pattern clone VnpayIpnGuard)
│   ├── paypal.types.ts                  ← TypeScript interfaces cho PayPal REST API
│   └── paypal.utils.ts                  ← HMAC helpers, OAuth2 token refresh, currency conversion
│
├── payments.module.ts                   ← ĐÃ CÓ — thêm PayPalModule vào imports
├── payments.types.ts                    ← ĐÃ CÓ — thêm 'paypal' vào PaymentGateway union
└── billing/
    └── billing.constants.ts             ← ĐÃ CÓ — thêm PayPal vào gateway list, PAYPAL_SPREAD_RATE
```

### 2.2 Module tree (dependency injection)

```
PaymentsModule
├── MomoModule (đã có)
├── VnpayModule (đã có)
├── LedgerModule (đã có)
├── SubscriptionModule (đã có)
├── PayPalModule ← MỚI
│   ├── PayPalConfig          ← singleton, cache OAuth2 token
│   ├── PayPalService         ← singleton, inject config + Prisma + ledger
│   ├── PayPalIpnGuard        ← singleton, inject Prisma
│   ├── PayPalController      ← controller, @UseGuards(PayPalIpnGuard) trên webhook
│   ├── SubscriptionActivatorService ← shared from parent module
│   └── PrismaService         ← shared from parent module
│
└── PaymentsWebhookService (đã có — thêm PayPal handler)
```

---

## III. CHI TIẾT 3 HÀM LOGIC CORE

### 3.1 Hàm #1 — `createPayPalOrder()`

**File:** `paypal.service.ts`
**Mô tả:** Tạo đơn hàng PayPal (Order intent = CAPTURE), xử lý quy đổi tiền tệ, trả về approval URL cho frontend redirect.

#### Luồng xử lý

```typescript
async createPayPalOrder(input: PayPalCreateOrderInput): Promise<PayPalCreateOrderResult>
```

```
┌─────────────────────────────────────────────────────────────────┐
│ Input: { tenantId, amount (BigInt, internal smallest unit),     │
│          currency ('USD'|'THB'|...), description, returnUrl }   │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. VALIDATE & CONVERT                                           │
│    - amount > 0 && BigInt.isFinite                               │
│    - convertUnit: internal BigInt → PayPal decimal (divide      │
│      by UNIT_SCALE for USD-cents-spaced internal, or by 100 for │
│      USD-dollar-store... see §VII for canonical design decision)│
│    - Apply unit spread (±1% max) → tránh mất mát do làm tròn    │
│    - Kiểm tra supported currency (25+ PayPal currencies)        │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. GET OAUTH2 ACCESS TOKEN                                      │
│    - POST /v1/oauth2/token với Basic Auth (client_id:secret)    │
│    - Cache token trong memory (expires_in - 60s safety margin)  │
│    - Nếu cached token còn hạn → reuse, không gọi lại            │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. CREATE ORDER (POST /v2/checkout/orders)                      │
│    Headers: Authorization: Bearer <token>                       │
│             Content-Type: application/json                      │
│             PayPal-Request-Id: <uuid> → idempotency key          │
│    Body: {                                                      │
│      intent: 'CAPTURE',                                         │
│      purchase_units: [{                                         │
│        reference_id: orderId (internal),                         │
│        description: trunced 127 chars,                          │
│        amount: { currency_code, value: decimal converted },     │
│        custom_id: tenantId (định danh tra ngược)                │
│      }],                                                        │
│      payment_source: { paypal: { experience_context: {          │
│        return_url, cancel_url, user_action: 'PAY_NOW' }}}      │
│    }                                                            │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. HANDLE RESPONSE                                              │
│    - Success: lấy order.id (PayPal Order ID),                   │
│      lấy approval URL từ links[].rel='payer-action' href,       │
│      lưu mapping: internal orderId ↔ PayPal orderId             │
│      trong PaymentTransaction.metadata                          │
│    - Error: parse PayPal error body → friendly message           │
│    - Return { success, paypalOrderId, approvalUrl, amount,      │
│               currency }                                        │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
            RETURN RESULT
```

#### Signature (chi tiết)

```typescript
interface PayPalCreateOrderInput {
  /** Internal order ID (AIFUT-xxx). */
  orderId: string;
  /** Tenant requesting payment. */
  tenantId: string;
  /** Amount in smallest internal unit (BigInt). */
  amount: bigint;
  /** ISO 4217 currency code (USD, THB, VND…). */
  currency: string;
  /** Human-readable description (truncated to 127 chars). */
  description: string;
  /** URL to redirect user after PayPal approves. Must be HTTPS in production. */
  returnUrl: string;
  /** URL to redirect if user cancels. */
  cancelUrl: string;
  /** Originating client IP (for risk analysis). */
  ipAddress: string;
}

interface PayPalCreateOrderResult {
  success: boolean;
  /** PayPal Order ID (e.g. "7XH12345678901234"). */
  paypalOrderId?: string;
  /** URL to redirect the user's browser for PayPal approval. */
  approvalUrl?: string;
  /** Echoed amount in internal smallest unit. */
  amount: bigint;
  /** Echoed currency. */
  currency: string;
  /** Internal order ID for reconciliation. */
  orderId: string;
  errorMessage?: string;
}
```

#### Đặc thù PayPal so với VNPay/MoMo

1. **OAuth2 token — cần cache**: Gọi `POST /v1/oauth2/token` với `grant_type=client_credentials`, Basic Auth (base64 của `client_id:secret`). Token hết hạn sau 9 giờ → cache với safety margin 60s.
2. **Idempotency key**: Gửi header `PayPal-Request-Id: <uuid>` — nếu gọi trùng requestId trong 1 giờ, PayPal trả về order cũ thay vì tạo mới. Output: idempotency.
3. **Approval flow hai bước**: (1) Create Order → lấy approvalUrl, (2) User approve ở browser PayPal, (3) Server capture. KHÔNG redirect thẳng đến PayPal.
4. **Decimal amount**: PayPal nhận amount dạng string `"19.99"` — phải chuyển từ BigInt nội bộ an toàn.

---

### 3.2 Hàm #2 — `handlePayPalWebhook()`

**File:** `paypal.service.ts` (logic xác thực) + `paypal.ipn.guard.ts` (idempotency) + `paypal.controller.ts` (endpoint)
**Mô tả:** Endpoint nhận webhook event từ PayPal, xác thực chữ ký số, bóc tách PAYMENT.CAPTURE.COMPLETED, kiểm tra số tiền, gài 3-layer idempotency guard.

#### Kiến trúc xác thực webhook PayPal

PayPal webhook verification KHÁC với VNPay/MoMo (vốn dùng HMAC signature đơn giản):
- PayPal gửi 4 headers: `PayPal-Transmission-Id`, `PayPal-Transmission-Sig`, `PayPal-Cert-Url`, `PayPal-Auth-Algo`
- Server phải **POST ngược lại** `POST /v1/notifications/verify-webhook-signature` để PayPal xác nhận tính hợp lệ
- Cần `WEBHOOK_ID` từ PayPal Developer Dashboard để verify

#### Luồng xử lý

```typescript
async handlePayPalWebhook(headers: PayPalWebhookHeaders, body: any): Promise<PayPalWebhookResult>
```

```
┌─────────────────────────────────────────────────────────────────┐
│ INCOMING WEBHOOK: POST /payments/paypal/webhook                │
│ Headers: PayPal-Transmission-Id, PayPal-Transmission-Sig,      │
│          PayPal-Cert-Url, PayPal-Auth-Algo                     │
│ Body: JSON event (event_type, resource, ...)                   │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: VERIFY SIGNATURE (POST back to PayPal)                 │
│    - Lấy OAuth2 token (reuse từ cache hoặc refresh)            │
│    - POST /v1/notifications/verify-webhook-signature           │
│      Body: {                                                   │
│        auth_algo: PayPal-Auth-Algo header,                     │
│        cert_url: PayPal-Cert-Url header,                      │
│        transmission_id: PayPal-Transmission-Id header,         │
│        transmission_sig: PayPal-Transmission-Sig header,       │
│        transmission_time: current ISO timestamp,               │
│        webhook_id: configured WEBHOOK_ID,                     │
│        webhook_event: raw body JSON (object, not stringified) │
│      }                                                         │
│    - Check response.verification_status === 'SUCCESS'          │
│    - FAIL → log + return 403 (PayPal retry)                    │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: PARSE EVENT TYPE                                       │
│    event_type string:                                          │
│      'PAYMENT.CAPTURE.COMPLETED' ← MỤC TIÊU CHÍNH             │
│      'PAYMENT.CAPTURE.DENIED'                                  │
│      'CHECKOUT.ORDER.APPROVED' (intermediate, ignore)          │
│      'PAYMENT.CAPTURE.REFUNDED'                                │
│      'PAYMENT.CAPTURE.REVERSED'                                │
│    - Extract resource.id (captureId), resource.amount,         │
│      resource.custom_id (tenantId), resource.invoice_id        │
│      (internal orderId từ purchase_unit.reference_id)          │
│    - Ignore events không liên quan đến payment capture         │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: EXTRACT & VERIFY AMOUNT                                │
│    - Lấy amount.value (string decimal) từ resource.amount      │
│    - Lấy currency_code (e.g. 'USD')                           │
│    - Chuyển decimal PayPal → BigInt nội bộ:                   │
│        bigintAmount = BigInt(Math.round(decimal * UNIT_SCALE)) │
│    - LẤY GHI CHÉO (cross-verify) seller_receivable_breakdown: │
│        net_amount (what we actually receive, after fee)        │
│        paypal_fee (the fee PayPal charged)                    │
│    - LƯU cả gross_amount và net_amount trong metadata          │
│    - Sau đó tìm PaymentTransaction trong DB, kiểm tra:        │
│        Math.abs(dbAmount - bigintAmount) <= TOLERANCE         │
│      với TOLERANCE = max(1%, 1 smallest unit)                │
│    - MISMATCH → log + return 200 (nhưng không settle)         │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: IDEMPOTENCY CLAIM (3-LAYER GUARD)                      │
│    - Gọi PayPalIpnGuard.claim(resource.invoice_id, captureId,  │
│      bigintAmount)                                             │
│    - Layer 1: fast pre-check (DB read terminal?)               │
│    - Layer 2: CAS updateMany pending→processing                │
│    - Layer 3: Serializable settle transaction                  │
│    - (Chi tiết §V dưới đây)                                    │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: SETTLE + ACTIVATE                                      │
│    - settled = guard.settle(transactionId, 'success', patch)   │
│    - If success → activator.activateByOrderId(...)             │
│    - Enqueue invoice mail                                      │
│    - Return 200 OK (PayPal expects 2xx to stop retry)          │
└─────────────────────────────────────────────────────────────────┘
```

#### Handle các webhook event type

| PayPal Event Type | Action |
|---|---|
| `PAYMENT.CAPTURE.COMPLETED` | ✅ Settle → activate subscription |
| `PAYMENT.CAPTURE.DENIED` | ✅ Mark failed, refund pending |
| `PAYMENT.CAPTURE.REFUNDED` | ✅ Route to `RefundWebhookRouter.syncRefundStatus()` |
| `PAYMENT.CAPTURE.REVERSED` | ✅ Route to refund handler |
| `CHECKOUT.ORDER.APPROVED` | ⏭️ Ignore (intermediate state) |
| `BILLING.SUBSCRIPTION.*` | 🟡 Phase 3.2 implementation |

#### Signature (chi tiết)

```typescript
interface PayPalWebhookHeaders {
  'paypal-transmission-id': string;
  'paypal-transmission-sig': string;
  'paypal-cert-url': string;
  'paypal-auth-algo': string;
}

interface PayPalWebhookEvent {
  id: string;            // Webhook event ID
  event_type: string;    // e.g. 'PAYMENT.CAPTURE.COMPLETED'
  event_version: string; // '1.0'
  resource_type: string; // 'capture'
  resource: PayPalCaptureResource;
  summary?: string;
  create_time: string;
}

interface PayPalCaptureResource {
  id: string;                     // Capture ID
  status: 'COMPLETED' | 'DENIED' | 'REFUNDED' | 'REVERSED';
  amount: { currency_code: string; value: string };
  seller_receivable_breakdown: {
    gross_amount: { currency_code: string; value: string };
    paypal_fee: { currency_code: string; value: string };
    net_amount: { currency_code: string; value: string };
  };
  custom_id?: string;             // tenantId
  invoice_id?: string;            // internal orderId
  create_time: string;
  update_time: string;
}

interface PayPalWebhookResult {
  received: boolean;
  eventType: string;
  matched: boolean;       // Found matching transaction
  settled: boolean;       // Successfully settled
  activated: boolean;     // Subscription activated
}
```

---

### 3.3 Hàm #3 — `verifyPayPalOrder()`

**File:** `paypal.service.ts`
**Mô tả:** Tra cứu chủ động trạng thái đơn hàng / capture trực tiếp từ PayPal REST API — safety net khi webhook thất bại hoặc delay.

#### Two-level verification

Cần 2 API calls vì Order và Capture là hai resources riêng biệt:

```typescript
async verifyPayPalOrder(paypalOrderId: string): Promise<PayPalVerificationResult>
```

```
┌─────────────────────────────────────────────────────────────────┐
│ Input: paypalOrderId (từ PayPal)                               │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ LEVEL 1: GET ORDER STATUS                                      │
│    GET /v2/checkout/orders/{paypalOrderId}                     │
│    Header: Authorization: Bearer <token>                       │
│    Response: { id, status, purchase_units[], ... }            │
│    Order status values:                                        │
│      'CREATED' → user chưa approve                             │
│      'APPROVED' → user đã approve, đợi capture                 │
│      'COMPLETED' → đã capture thành công                       │
│      'VOIDED' → đã hủy                                        │
│    - Nếu status !== 'COMPLETED' → return { status, reason }    │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ LEVEL 2: GET CAPTURE DETAILS (nếu order COMPLETED)            │
│    Với mỗi purchase_unit[].payments.captures[].id:            │
│    GET /v2/payments/captures/{captureId}                      │
│    Response: { id, status, amount,                             │
│                seller_receivable_breakdown, ... }              │
│    Capture status: 'COMPLETED', 'DENIED', 'REFUNDED', ...     │
│    - Lấy gross_amount, net_amount, paypal_fee                │
│    - So sánh với internal PaymentTransaction.amount           │
│    - Tolerance ±2% cho tỷ giá + phí cross-border              │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ RECONCILE WITH INTERNAL STATE                                  │
│    - Tìm PaymentTransaction qua metadata.paypalOrderId         │
│    - Nếu transaction còn pending + PayPal status COMPLETED     │
│      → Gọi guard.claim() → guard.settle() → activate          │
│    - Nếu transaction đã success → báo duplicate               │
│    - Nếu transaction không tồn tại → support ticket           │
│    - Log discrepancy nếu amount không khớp                    │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
            RETURN RESULT
```

#### Signature (chi tiết)

```typescript
interface PayPalVerificationResult {
  verified: boolean;
  paypalOrderId: string;
  paypalOrderStatus: string;    // CREATED | APPROVED | COMPLETED | VOIDED
  captureStatus?: string;       // COMPLETED | DENIED | REFUNDED
  grossAmount?: string;         // PayPal decimal string
  netAmount?: string;           // After PayPal fee
  paypalFee?: string;           // PayPal transaction fee
  currency?: string;
  internalAmount?: bigint;      // Internal BigInt representation
  amountMatch: boolean;         // gross matches internal within tolerance
  reconciled: boolean;          // Successfully reconciled internal state
  errorMessage?: string;
}
```

#### Use cases

1. **Dashboard admin** gọi `POST /payments/paypal/verify/:orderId` để kiểm tra thủ công
2. **Background cron job** mỗi 30 phút quét các PaymentTransaction `status='pending' AND gateway='paypal' AND created_at > 1h ago` → gọi verify cho từng order
3. **Return page** — sau khi user approve ở PayPal, browser redirect về return URL → gọi verify để cập nhật UI real-time

---

## IV. CHI TIẾT TỪNG FILE

### 4.1 `paypal.config.ts` — OAuth2 Token Cache

```typescript
// 4 env vars cần cấu hình:
//   PAYPAL_CLIENT_ID     — PayPal REST API client ID
//   PAYPAL_CLIENT_SECRET — PayPal REST API secret
//   PAYPAL_WEBHOOK_ID    — Webhook ID từ PayPal Developer Dashboard
//   PAYPAL_MODE          — 'sandbox' | 'live' (default: sandbox)
//   PAYPAL_CURRENCY      — Default currency (default: 'USD')

interface PayPalCredentials {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  baseUrl: string;           // https://api-m.sandbox.paypal.com | https://api-m.paypal.com
  defaultCurrency: string;
}
```

**Caching OAuth2 token:** `PayPalConfig` lưu `{ accessToken, expiresAt }` trong memory. `PayPalService.getAccessToken()` kiểm tra: nếu `expiresAt - 60s > now` thì reuse, nếu không thì gọi `POST /v1/oauth2/token`. Thread-safe với mutex đơn giản (chặn concurrent refresh).

### 4.2 `paypal.service.ts` — Core Service

```typescript
@Injectable()
export class PayPalService {
  constructor(
    private readonly config: PayPalConfig,
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  // ── Core 3 Functions ───────────────────────────────────────────
  async createPayPalOrder(input: PayPalCreateOrderInput): Promise<PayPalCreateOrderResult>
  async handlePayPalWebhook(headers: PayPalWebhookHeaders, body: any): Promise<PayPalWebhookResult>
  async verifyPayPalOrder(paypalOrderId: string): Promise<PayPalVerificationResult>

  // ── Internal helpers ───────────────────────────────────────────
  private async getAccessToken(): Promise<string>         // OAuth2 + cache
  private async verifyWebhookSignature(headers, body): Promise<boolean>
  private async postJson<T>(url, body, token?): Promise<T>
  private async getJson<T>(url, token): Promise<T>
  private bigIntToPayPalDecimal(amount: bigint): string   // BigInt → "19.99"
  private payPalDecimalToBigInt(amount: string): bigint   // "19.99" → BigInt
}
```

### 4.3 `paypal.ipn.guard.ts` — 3-Layer Idempotency Guard

Clone chính xác pattern từ `VnpayIpnGuard` và `MomoIpnGuard`:

```typescript
// Layer 1 — Pre-check: đọc PaymentTransaction từ DB
//   Tìm theo (gateway='paypal', metadata.paypalCaptureId) hoặc (gateway='paypal', gatewayTxId)
//   Nếu terminal state (success/failed/refunded) → duplicate
//   Kiểm tra amount match với tolerance ±2% (cross-currency spread)

// Layer 2 — CAS row-lock: updateMany({id, status:'pending'}, {status:'processing'})
//   count===0 → lost claim: re-read → duplicate | in-progress

// Layer 3 — Serializable transaction:
//   $transaction(isolationLevel.Serializable) {
//     re-validate row.status === 'processing'
//     update → success | failed
//   }
//   Fail → release back to 'pending' để PayPal retry recovery
```

**Điểm khác biệt so với VNPay/MoMo:**
- Lookup key: `gateway='paypal'` + metadata.paypalOrderId hoặc metadata.paypalCaptureId
- Amount tolerance: ±2% (thay vì exact match) vì PayPal có thể trừ phí cross-border
- Lưu `gross_amount`, `net_amount`, `paypal_fee` vào metadata khi settle

### 4.4 `paypal.controller.ts` — HTTP Endpoints

| Method | Route | Handler | Auth |
|---|---|---|---|
| `POST` | `/payments/paypal/create-order` | `createOrder` | Tenant JWT |
| `POST` | `/payments/paypal/capture-order/:paypalOrderId` | `captureOrder` | Tenant JWT |
| `POST` | `/payments/paypal/webhook` | `handleWebhook` | None (PayPal IP) |
| `GET` | `/payments/paypal/return` | `handleReturn` | None (browser redirect) |
| `GET` | `/payments/paypal/verify/:paypalOrderId` | `verifyOrder` | Admin JWT |
| `POST` | `/payments/paypal/reconcile` | `reconcile` | Admin JWT |

**Giải thích các endpoints:**

1. **`POST /create-order`**: Frontend gọi → `createPayPalOrder()` → trả về approval URL → frontend redirect user đến PayPal
2. **`POST /capture-order/:paypalOrderId`**: (OPTIONAL) Server-side capture sau khi user approve — dùng khi frontend không tự capture được. Gọi `POST /v2/checkout/orders/{id}/capture`
3. **`POST /webhook`**: PayPal gửi webhook events đến đây → `handlePayPalWebhook()`
4. **`GET /return`**: Browser redirect sau khi user approve/cancel ở PayPal → hiển thị status page
5. **`GET /verify/:orderId`**: Admin gọi để kiểm tra trạng thái → `verifyPayPalOrder()`
6. **`POST /reconcile`**: Safety net — giống VNPay `/reconcile`, force reconcile từ internal state

### 4.5 `paypal.types.ts` — TypeScript Interfaces

```typescript
// ── OAuth2 ────────────────────────────────────────────────────
interface PayPalOAuthToken {
  accessToken: string;
  expiresAt: Date;  // determined from expires_in
}

// ── Create Order ──────────────────────────────────────────────
interface PayPalCreateOrderInput { /* see §3.1 */ }
interface PayPalCreateOrderResult { /* see §3.1 */ }

// ── Webhook ───────────────────────────────────────────────────
interface PayPalWebhookHeaders { /* see §3.2 */ }
interface PayPalWebhookEvent { /* see §3.2 */ }
interface PayPalCaptureResource { /* see §3.2 */ }
interface PayPalWebhookResult { /* see §3.2 */ }

// ── Verification ──────────────────────────────────────────────
interface PayPalVerificationResult { /* see §3.3 */ }

// ── PayPal REST API response types (raw, để parse) ────────────
interface PayPalApiOrderResponse {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED';
  purchase_units: PayPalPurchaseUnit[];
  links: { href: string; rel: string; method: string }[];
  create_time: string;
  update_time: string;
}

interface PayPalPurchaseUnit {
  reference_id: string;
  amount: { currency_code: string; value: string };
  payee: { email_address: string; merchant_id: string };
  payments: {
    captures: { id: string; status: string; amount: { currency_code: string; value: string }; seller_receivable_breakdown: any }[];
  };
  custom_id?: string;
  invoice_id?: string;
}

interface PayPalApiCaptureResponse {
  id: string;
  status: 'COMPLETED' | 'DENIED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED';
  amount: { currency_code: string; value: string };
  seller_receivable_breakdown: {
    gross_amount: { currency_code: string; value: string };
    paypal_fee: { currency_code: string; value: string };
    net_amount: { currency_code: string; value: string };
    [key: string]: any;
  };
  custom_id: string;
  invoice_id: string;
  create_time: string;
  update_time: string;
  [key: string]: any;
}

// ── Verify webhook response ───────────────────────────────────
interface PayPalVerifyWebhookResponse {
  verification_status: 'SUCCESS' | 'FAILURE';
}

// ── Error ──────────────────────────────────────────────────────
interface PayPalApiError {
  name: string;
  message: string;
  details: { issue: string; field?: string; description?: string }[];
  debug_id: string;
}
```

### 4.6 `paypal.module.ts` — Module Registration

```typescript
@Module({
  controllers: [PayPalController],
  providers: [
    PayPalService,
    PayPalConfig,
    PayPalIpnGuard,
    SubscriptionActivatorService,
    PrismaService,
  ],
  exports: [PayPalService, PayPalConfig],
})
export class PayPalModule {}
```

**Cập nhật `payments.module.ts`:** Thêm `PayPalModule` vào imports.

**Cập nhật `payments.types.ts`:** Thêm `'paypal'` vào union type `PaymentGateway`.

### 4.7 `paypal.utils.ts` — Currency Conversion Helpers

```typescript
/**
 * UNIT_SCALE: hệ số quy đổi giữa BigInt nội bộ và decimal của PayPal.
 *
 * Wallet nội bộ dùng BigInt (VND * 100 → đơn vị nhỏ nhất)
 * PayPal giao dịch bằng USD/THB/... decimal
 *
 * Quy tắc chuyển đổi:
 *   internalToPayPal(amount: bigint, currency: string): string
 *     → chia UNIT_SCALE, round 2 decimals, return "19.99"
 *
 *   payPalToInternal(amount: string, currency: string): bigint
 *     → nhân UNIT_SCALE, round to BigInt, return 1999n
 *
 * Spread: phí chênh lệch tỷ giá (0.5-1%)
 *   Sử dụng spread khi convert từ VND nội bộ → USD PayPal
 *   PayPal spread_rate = 0.01 (1%) configurable
 */
const UNIT_SCALE = 100;           // Phù hợp với Wallet.balance (VND * 100)
const PAYPAL_SPREAD_RATE = 0.01;  // 1% spread cho cross-currency

function internalToPayPalDecimal(amount: bigint): string {
  // amount(199900n) → "1999.00"
  const whole = amount / BigInt(100);
  const frac = amount % BigInt(100);
  return `${whole}.${String(frac).padStart(2, '0')}`;
}

function payPalDecimalToInternal(value: string): bigint {
  // "19.99" → 1999n
  const [w, f = '00'] = value.split('.');
  const padded = f.padEnd(2, '0').slice(0, 2);
  return BigInt(w) * BigInt(100) + BigInt(padded);
}
```

---

## V. 3-LAYER IDEMPOTENCY GUARD CHI TIẾT

Clone trực tiếp từ `VnpayIpnGuard` với các điều chỉnh cho PayPal:

### Layer 1 — Fast Pre-check

```typescript
// Lookup key: (gateway='paypal', metadata.paypalCaptureId = captureId)
// Fallback: (gateway='paypal', metadata.paypalOrderId = orderId)
// Nếu terminal → duplicate
// Nếu amount mismatch ±2% tolerance → amount-mismatch
// Nếu không tìm thấy → not-found (có thể webhook đến trước transaction record)
//   Trong trường hợp not-found: trả về 200 OK (ko retry) + log warning
```

### Layer 2 — CAS Row-lock

```typescript
// updateMany({ id, status: 'pending' }, { status: 'processing' })
// count=0 → re-read:
//   terminal → duplicate (processed by another worker) 
//   processing → in-progress (still being processed)
// count=1 → claimed, proceed to settle
```

### Layer 3 — Serializable Transaction

```typescript
// Ghi nhận gross_amount, net_amount, paypal_fee, exchange_rate
// vào metadata (không ghi vào amount vì phí là của PayPal)
// success → activate subscription qua SubscriptionActivatorService
// failed → rollback status về 'pending' để retry recovery
```

**Điểm khác VNPay/MoMo:**

| Aspect | VNPay | MoMo | PayPal |
|---|---|---|---|
| Amount match | Exact (VND) | Exact (VND) | ±2% tolerance (cross-currency) |
| Lookup key | vnp_TxnRef | orderId | paypalCaptureId → paypalOrderId |
| Webhook format | GET query params | POST JSON body | POST JSON body + headers |
| Signature | HMAC-SHA512 in-params | HMAC-SHA256 in-params | POST-back verification API |
| Idempotency key | N/A | N/A | `PayPal-Request-Id` header |

---

## VI. MULTI-CURRENCY SETTLEMENT

### 6.1 Quy đổi tiền tệ

```
Internal (BigInt)              PayPal (decimal)
─────────────────────          ─────────────────
Wallet.balance: 199900n    ↔   PayPal amount: "19.99" USD
(đơn vị: VND * 100)           (đơn vị: USD dollar)

Luồng create order:
  VND (internal) → USD (PayPal) → convert qua EXCHANGE_RATES
  + spread 1% cho cross-currency risk

Luồng webhook capture:
  USD (PayPal) → VND (internal) → convert qua EXCHANGE_RATES
  Lưu seller_receivable_breakdown.gross_amount và net_amount
```

### 6.2 Spread và phí

| Thành phần | Tỷ lệ | Ghi chú |
|---|---|---|
| PayPal processing fee | 2.49-4.49% + $0.49 | Tùy country, không control được |
| Cross-currency spread | 1% | AIFUT control, bù rủi ro tỷ giá |
| Total | 3.49-5.49%+$0.49 | Pass-through cho tenant (giá đã bao gồm) |

### 6.3 Lưu trữ trong metadata

```json
{
  "paypalOrderId": "7XH12345678901234",
  "paypalCaptureId": "8XS98765432109876",
  "grossAmount": "19.99",
  "paypalFee": "0.79",
  "netAmount": "19.20",
  "currency": "USD",
  "exchangeRateToVND": 25400,
  "spreadApplied": 0.01,
  "internalAmountBeforeSpread": 499900,
  "internalAmountApplied": 504899,
  "sellerBreakdown": { ... }
}
```

---

## VII. CẬP NHẬT CÁC FILE HIỆN CÓ

### 7.1 `payments.types.ts` — Thêm PayPal gateway type

```typescript
export type PaymentGateway = 'vnpay' | 'momo' | 'stripe' | 'paypal' | 'manual';
```

### 7.2 `payments.module.ts` — Import PayPalModule

```typescript
import { PayPalModule } from './paypal/paypal.module';

@Module({
  imports: [
    MomoModule, VnpayModule, PayPalModule,  // ← added PayPalModule
    LedgerModule, SubscriptionModule,
  ],
  // ... controllers, providers unchanged
})
export class PaymentsModule {}
```

### 7.3 `billing.constants.ts` — Thêm PayPal gateway config

```typescript
export const PAYMENT_GATEWAYS = [
  { key: 'vnpay', name: 'VNPay', currencies: ['VND'] },
  { key: 'momo', name: 'MoMo', currencies: ['VND'] },
  { key: 'stripe', name: 'Stripe', currencies: SUPPORTED_CURRENCIES },
  { key: 'paypal', name: 'PayPal', currencies: SUPPORTED_CURRENCIES },  // ← MỚI
] as const;

export const PAYPAL_SPREAD_RATE = 0.01;  // 1% spread cho cross-currency
```

### 7.4 `payments-webhook.service.ts` — Thêm PayPal handler

```typescript
// Trong PaymentsWebhookService:
// handlePayPalWebhook() — gọi PayPalService.handlePayPalWebhook()
// Và route PAYMENT.CAPTURE.REFUNDED → RefundWebhookRouter
```

### 7.5 `.env.example` — Thêm PayPal env vars

```env
# PayPal Gateway
PAYPAL_CLIENT_ID=sb_your_sandbox_client_id
PAYPAL_CLIENT_SECRET=sb_your_sandbox_secret
PAYPAL_WEBHOOK_ID=your_webhook_id_from_paypal_dashboard
PAYPAL_MODE=sandbox  # sandbox | live
PAYPAL_CURRENCY=USD   # default currency for PayPal transactions
```

---

## VIII. KIỂM TRA & EDGE CASES

### 8.1 Positive test cases

| Test | Expected |
|---|---|
| `createPayPalOrder(19900n, 'USD')` | Returns approvalUrl, PayPal order ID |
| Webhook `PAYMENT.CAPTURE.COMPLETED` signature hợp lệ | Settle + activate subscription |
| `verifyPayPalOrder` cho order đã COMPLETED | Returns capture details + reconciled=true |
| User cancel ở PayPal browser | Handle return với trạng thái cancelled |

### 8.2 Edge cases

| Edge case | Xử lý |
|---|---|
| **Webhook đến trước khi transaction record được tạo** | Không tìm thấy record → log + return 200 (PayPal sẽ retry). Transaction tạo sau → webhook retry thành công |
| **Webhook signature verification timeout** | Timeout retry 3 lần, sau đó trả 503, PayPal retry sau |
| **OAuth2 token refresh thất bại** | Clear cache + retry, nếu vẫn fail → trả lỗi (PayPal API call fail gracefully) |
| **Amount mismatch do cross-border fee** | Tolerance 2% — nếu mismatch >2% → block + log + manual review |
| **Concurrent webhook + active reconcile** | Layer 2 CAS lock — một trong hai claim được, không double-settle |
| **PayPal gửi webhook event trùng** | `idempotency_key` check + Layer 1 duplicate detection |
| **Currency không hỗ trợ** | Check against SUPPORTED_CURRENCIES, trả lỗi sớm |
| **PayPal API rate limit (429)** | Exponential backoff + log |
| **PayPal sandbox → live migration** | `PAYPAL_MODE` env var toggle, không thay đổi code |

### 8.3 Security checklist

- [ ] **Không log OAuth2 access token** — mask token khi log
- [ ] **Không log client_secret** — chỉ reference từ env
- [ ] **Không gửi secret lên GitHub** — .env.example chứa placeholder
- [ ] **Rate limit webhook endpoint** — tránh replay attack
- [ ] **Verify PayPal IP** — (optional) whitelist PayPal IP range cho webhook endpoint
- [ ] **HTTPS only** — PayPal từ chối gọi webhook HTTP (production)

---

## IX. SCHEDULE & IMPLEMENTATION

### Ước tính effort

| Task | Files | Estimated effort |
|---|---|---|
| `paypal.config.ts` | 1 file mới | ~30 phút |
| `paypal.types.ts` | 1 file mới | ~45 phút |
| `paypal.service.ts` — OAuth2 + createOrder | 1 file mới | ~1.5 giờ |
| `paypal.service.ts` — webhook verify | (cùng file) | ~1 giờ |
| `paypal.service.ts` — verify order | (cùng file) | ~30 phút |
| `paypal.ipn.guard.ts` | 1 file mới | ~45 phút (clone + adapt) |
| `paypal.controller.ts` | 1 file mới | ~1 giờ |
| `paypal.module.ts` | 1 file mới | ~15 phút |
| Update `payments.module.ts` | 1 file sửa | ~5 phút |
| Update `payments.types.ts` | 1 file sửa | ~2 phút |
| Update `billing.constants.ts` | 1 file sửa | ~5 phút |
| Total | **10 file mới + 3 file sửa** | **~6 giờ** |

### Thứ tự implement

```
Day 1: config.ts + types.ts + utils.ts + result-codes.ts (nền tảng)
Day 2: paypal.service.ts — createPayPalOrder + getAccessToken
Day 3: paypal.service.ts — handlePayPalWebhook
Day 4: paypal.service.ts — verifyPayPalOrder
Day 5: paypal.ipn.guard.ts
Day 6: paypal.controller.ts + paypal.module.ts
Day 7: Update paymments.module.ts + types + test + build pass
```

**Khởi động khi Thành nói "AIFUT GO" — implement ngay 10 file từ config → module, không hỏi.**

---

## X. MA TRẬN SO SÁNH GATEWAY

```
┌─────────────┬──────────┬─────────┬──────────┬────────────────┐
│ Tính năng   │ VNPay    │ MoMo    │ Stripe   │ PayPal (MỚI)   │
├─────────────┼──────────┼─────────┼──────────┼────────────────┤
│ Auth        │ HashSecret│ HMAC    │ Webhook  │ OAuth2 token   │
│             │ + TMNCode │ + key   │ secret   │ + client_id    │
├─────────────┼──────────┼─────────┼──────────┼────────────────┤
│ Flow        │ Redirect │ API     │ Payment  │ Order→Approve  │
│             │ + IPN    │ create  │Intent    │ →Capture       │
├─────────────┼──────────┼─────────┼──────────┼────────────────┤
│ Currencies  │ VND only │ VND only│ 25+      │ 25+            │
├─────────────┼──────────┼─────────┼──────────┼────────────────┤
│ Webhook     │ GET query│ POST    │ POST     │ POST + verify  │
│             │ params   │ JSON    │ JSON     │ POST-back API  │
├─────────────┼──────────┼─────────┼──────────┼────────────────┤
│ Idempotency │ 3-layer  │ 3-layer │ Idem key │ 3-layer +      │
│             │ guard    │ guard   │ + guard  │ PayPal-Request │
├─────────────┼──────────┼─────────┼──────────┼────────────────┤
│ Refund      │ Query    │ Refund  │ Native   │ Native (POST   │
│             │ API call │ API call│ webhook  │ /v2/payments/  │
│             │          │         │          │ captures/captureId│
│             │          │         │          │ /refund)       │
├─────────────┼──────────┼─────────┼──────────┼────────────────┤
│ Ready       │ ✅ Live  │ ✅ Live │ ✅ Live  │ 🟡 Thiết kế   │
└─────────────┴──────────┴─────────┴──────────┴────────────────┘
```

---

*Thiết kế này được xây dựng dựa trên phân tích codebase hiện tại:*
- *Pattern module từ `VnpayModule` / `MomoModule`*
- *Pattern 3-layer guard từ `VnpayIpnGuard` / `MomoIpnGuard`*
- *Pattern config từ `VnpayConfig` / `MomoConfig`*
- *Currency infrastructure từ `billing.constants.ts`*
- *BigInt wallet từ `ledger.service.ts`*
- *Subscription activation từ `subscription-activator.service.ts`*

*Sẵn sàng implement khi Thành gõ "AIFUT GO".*

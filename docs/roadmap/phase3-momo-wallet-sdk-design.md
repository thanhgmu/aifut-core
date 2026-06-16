# Phase 3 — MoMo Wallet SDK Integration Design
> Thiết kế kiến trúc cổng nạp tiền + đối soát giao dịch qua MoMo Wallet
> Ngày: 2026-06-16 | Dựa trên codebase hiện tại (commit build pass)

---

## I. HIỆN TRẠNG & GAPS

### ✅ Có sẵn trong codebase
| Thành phần | File | Ghi chú |
|---|---|---|
| `MomoGateway` class | `apps/api/src/payments/momo.gateway.ts` | Injectable, có `createPayment()` + `handleIpn()` nhưng signature sai spec |
| `PaymentTransaction` schema | Prisma schema L780 | `id, invoiceId, accountId, tenantId, gateway, gatewayTxId, amount, currency, status, paidAt, metadata` |
| `PaymentsService` | `apps/api/src/payments/payments.service.ts` | Orchestration: gọi gateway → save transaction → activate |
| `PaymentsWebhookService` | `apps/api/src/payments/payments-webhook.service.ts` | Async IPN handler + Stripe webhook + activator delegate |
| `SubscriptionActivatorService` | `apps/api/src/payments/subscription-activator.service.ts` | Activation single source-of-truth |
| `PaymentsController` | `apps/api/src/payments/payments.controller.ts` | `POST /payments/momo/ipn`, `GET /payments/momo/return` |
| `.env.payments.example` | `apps/api/.env.payments.example` | `MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, MOMO_SECRET_KEY` |

### ❌ Gaps kỹ thuật critical
| Gap | Mô tả | Hậu quả |
|---|---|---|
| **Signature sai spec** | `createPayment()` lồng `ipnUrl` + `redirectUrl` vào raw HMAC — MoMo spec chỉ gồm 7 field: `accessKey, amount, extraData, orderId, orderInfo, partnerCode, requestId, requestType` | MoMo từ chối signature → giao dịch không thể tạo |
| **IPN chưa xác thực HMAC** | `handleIpn()` chỉ check `if (raw['signature'])` — không reconstruct và so sánh HMAC từ IPN payload | IPN giả mạo có thể activate subscription trái phép |
| **Thiếu idempotency key** | IPN đến trùng lặp — không có guard → transaction được update nhiều lần, thậm chí activate subscription nhiều lần | Double activation, user được free thời gian |
| **Không có queryStatus** | Không có hàm gọi `POST /query` của MoMo để tra cứu khi IPN thất bại | Mất gói tin → mất doanh thu vô hình |
| **Không có MoMo-specific controller** | Endpoint `/momo/ipn` chung trong `PaymentsController`, không có riêng module momo | Khó mở rộng, khó test isolation |
| **Không có response code map** | MoMo trả về `resultCode` nhưng không map ra message tiếng Việt + HTTP status tương ứng | UX kém, khó debug |

---

## II. CẤU TRÚC FILE MỚI CẦN KHỞI TẠO

```
apps/api/src/payments/momo/
├── momo.config.ts                  # MoMo SDK config + env mapping
├── momo.types.ts                   # MoMo-specific type definitions
├── momo.service.ts                 # Core business logic (3 hàm chính)
├── momo.controller.ts              # HTTP endpoints
├── momo.module.ts                  # NestJS module (standalone)
├── momo.ipn.guard.ts               # Idempotency guard decorator/service
├── momo.reconciliation.service.ts  # Batch reconciliation runner
├── momo.result-codes.ts            # resultCode → message mapping
└── __tests__/
    ├── momo.service.spec.ts
    └── momo.ipn.spec.ts
```

### File-dependency graph
```
momo.config.ts ← reads env (MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, MOMO_SECRET_KEY...)
      ↓
momo.types.ts ← pure types, zero deps
      ↓
momo.result-codes.ts ← zero deps
      ↓
momo.service.ts ← depends on momo.config, momo.types, momo.result-codes, crypto
      ↓
momo.controller.ts ← depends on momo.service, momo.ipn.guard
      ↓
momo.module.ts ← wires controller + service + guard
```

### Integration vào PaymentsModule hiện tại
- `MomoModule` import vào `PaymentsModule.imports`
- Controller cũ `POST /payments/momo/ipn` được tách về `MomoController`
- `PaymentsService` vẫn giữ vai trò orchestration (tạo `PaymentTransaction` trước, sau đó gọi `MomoService.createPayment`)
- `MomoGateway` cũ (flat file) được **thay thế** bằng `MomoService`

#### Phân luồng route cuối:
| HTTP Method | Path | Handler | Chức năng |
|---|---|---|---|
| `POST` | `/payments/momo/create` | `MomoController.createPayment` | Tạo giao dịch + trả payUrl |
| `POST` | `/payments/momo/ipn` | `MomoController.handleIpn` | Nhận IPN từ MoMo |
| `GET` | `/payments/momo/return` | `MomoController.handleReturn` | User redirect sau khi thanh toán |
| `POST` | `/payments/momo/query` | `MomoController.queryStatus` | Tra cứu chủ động |
| `POST` | `/payments/momo/reconcile` | `MomoController.reconcile` | Batch đối soát (admin) |

---

## III. CHI TIẾT 3 HÀM LOGIC CORE

### 1. `MomoService.createPayment()` — Khởi tạo giao dịch nạp tiền

**Endpoint:** `POST /payments/momo/create`

**Input (MomoCreatePaymentRequest):**
```typescript
interface MomoCreatePaymentRequest {
  amount: number;          // VND, nguyên
  orderInfo: string;       // Mô tả giao dịch (≤100 ký tự)
  returnUrl: string;       // URL redirect sau khi user thanh toán
  notifyUrl: string;       // URL IPN (thường config sẵn từ env)
  extraData?: string;      // Base64-encoded JSON, default ""
  requestType?: string;    // "captureWallet" (default) | "payWithATM" | "payWithCC"
  lang?: string;           // "vi" (default) | "en"
}
```

**Logic flow (đúng spec MoMo v2):**

```
1. Generate requestId = "MOMO-{tenantId}-{Date.now()}-{random8}"
2. Generate orderId   = "AIFUT-{Date.now()}-{random6}"  (tái dùng với PaymentTransaction.orderId)
3. Xây rawSignature (theo MoMo spec):
   rawSignature = [
     `accessKey=${config.accessKey}`,
     `amount=${Math.round(request.amount)}`,
     `extraData=${extraData}`,
     `orderId=${orderId}`,
     `orderInfo=${encodeURIComponent(request.orderInfo).slice(0,100)}`,
     `partnerCode=${config.partnerCode}`,
     `requestId=${requestId}`,
     `requestType=${requestType}`,
   ].join('&')
4. signature = HMAC-SHA256(rawSignature, config.secretKey)
5. POST JSON lên MoMo API: config.endpoint với body:
   {
     partnerCode, partnerName: "AIFUT",
     requestId, amount,
     orderId, orderInfo,
     redirectUrl: request.returnUrl || config.returnUrl,
     ipnUrl: request.notifyUrl || config.ipnUrl,
     requestType, extraData, lang, signature
   }
6. Parse response từ MoMo:
   - success: payUrl (Web redirect) và qrCodeUrl (optional)
   - fail: resultCode ≠ 0 → map sang momo.result-codes.ts
7. Lưu PaymentTransaction (status: 'pending') vào DB
8. Trả về: { payUrl, qrCodeUrl, transactionId: requestId, amount, description }
```

**⚠️ Khác biệt với code hiện tại:**
| Mục | Code hiện tại | Code mới (đúng spec) |
|---|---|---|
| Raw signature fields | `accessKey, amount, extraData, ipnUrl, orderId, orderInfo, partnerCode, redirectUrl, requestId, requestType` (10 fields - SAI) | `accessKey, amount, extraData, orderId, orderInfo, partnerCode, requestId, requestType` (8 fields - ĐÚNG) |
| Signature algorithm | `crypto.createHmac('sha256', secretKey)` | Giữ nguyên (đúng) |
| Gọi MoMo API | Chỉ tạo payload, không POST thực tế, trả về URL giả | POST thực tế đến `config.endpoint`, parse response |
| Response | `paymentUrl: ${endpoint}?orderId=${orderId}` (placeholder) | `payUrl` + `qrCodeUrl` từ MoMo response thực |

**Crypto implementation (pseudocode):**
```typescript
private signRequest(params: Record<string, string | number>): string {
  const sortedKeys = ['accessKey', 'amount', 'extraData', 'orderId',
                      'orderInfo', 'partnerCode', 'requestId', 'requestType'];
  const raw = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHmac('sha256', this.config.secretKey)
               .update(raw)
               .digest('hex');
}
```

---

### 2. `MomoController.handleIpn()` / `MomoService.handleIpn()` — IPN Handler

**Endpoint:** `POST /payments/momo/ipn`

**MoMo gửi IPN payload:**
```typescript
interface MomoIpnPayload {
  partnerCode: string;
  orderId: string;
  requestId: string;
  amount: number;
  orderInfo: string;
  orderType: string;
  transId: string;          // MoMo transaction ID
  resultCode: number;       // 0 = success
  message: string;
  payType: string;          // "qr", "wallet", "atm"
  responseTime: number;     // epoch ms
  extraData: string;
  signature: string;
}
```

**Logic flow:**

```
1. IDEMPOTENCY CHECK (first line of defense):
   - Lấy 'orderId' từ IPN payload
   - Query PaymentTransaction WHERE gatewayTxId = orderId AND gateway = 'momo'
   - IF transaction.status === 'success' → return HTTP 200 { status: 0, message: "Already processed" }
     (MoMo sẽ không retry, nhưng nếu có duplicate, ta không xử lý lại)
   
2. XÁC THỰC CHỮ KÝ (reverse check):
   - Tách raw signature từ payload (field 'signature')
   - Xây rawVerifyString từ 13 field IPN (theo MoMo IPN spec):
     rawVerifyString = [
       `accessKey=${config.accessKey}`,
       `amount=${payload.amount}`,
       `extraData=${payload.extraData}`,
       `message=${payload.message}`,
       `orderId=${payload.orderId}`,
       `orderInfo=${payload.orderInfo}`,
       `orderType=${payload.orderType}`,
       `partnerCode=${payload.partnerCode}`,
       `payType=${payload.payType}`,
       `requestId=${payload.requestId}`,
       `responseTime=${payload.responseTime}`,
       `resultCode=${payload.resultCode}`,
       `transId=${payload.transId}`,
     ].join('&')
   - expectedSignature = HMAC-SHA256(rawVerifyString, secretKey)
   - IF receivedSignature !== expectedSignature → return HTTP 403, log security event

3. KIỂM TRA KẾT QUẢ:
   - IF payload.resultCode !== 0 → update transaction status = 'failed'
     Ghi errorMessage = MomoResultCodes[resultCode]
     Return HTTP 200 { status: 1, message: errorMessage }
     (MoMo vẫn cần HTTP 200 để biết đã nhận, dù giao dịch thất bại)

4. XỬ LÝ GIAO DỊCH THÀNH CÔNG:
   - Update PaymentTransaction:
     SET status = 'success',
         gatewayTxId = payload.transId,
         paidAt = new Date(payload.responseTime),
         paymentMethod = payload.payType,
         metadata = JSONB payload raw
   
5. ACTIVATE SUBSCRIPTION (qua SubscriptionActivatorService):
   - Gọi activator.activateByOrderId({
       orderId: payload.orderId,
       gateway: 'momo',
       gatewayTxId: String(payload.transId),
       paidAt: new Date(payload.responseTime),
       ipnPayload: rawPayload
     })
   - Activator tìm PaymentTransaction → tìm invoice → activate subscription plan-aware

6. ENQUEUE E-INVOICE (tái dùng PaymentsWebhookService.finalize logic):
   - Nếu transaction có invoiceId → enqueue invoice mail

7. TRẢ VỀ HTTP 200 (MoMo yêu cầu, body tùy ý):
   { status: 0, message: "Success" }
```

**⚠️ Idempotency chi tiết:**
| Lớp | Cơ chế | Chống |
|---|---|---|
| L1 — Transaction-level | `SELECT ... WHERE status='success'` trước khi update | Cùng IPN đến 2 lần |
| L2 — DB unique constraint | Thêm index `@@unique([gateway, gatewayTxId])` trên `PaymentTransaction` | Cùng transId từ MoMo |
| L3 — Application-level | Update `WHERE status='pending' AND id=tx.id` → check affected rows | Race condition giữa 2 IPN đồng thời |

**Note:** Level 3 cần migration thêm hoặc dùng Prisma transaction với `updateMany` + check `count > 0`.

---

### 3. `MomoService.queryStatus()` — Đối soát chủ động (Query Transaction)

**Endpoint:** `POST /payments/momo/query`

Mục đích: Khi IPN từ MoMo bị mất (timeout, network issue), hệ thống chủ động gọi MoMo API để kiểm tra trạng thái.

**Input:**
```typescript
interface QueryStatusRequest {
  orderId: string;      // orderId gốc khi tạo giao dịch
  requestId?: string;   // requestId gốc (optional, fallback)
}
```

**MoMo Query API:** `POST https://test-payment.momo.vn/v2/gateway/api/query`

**Logic flow:**

```
1. Validate: orderId không được empty
2. Lấy transaction từ DB:
   const tx = await prisma.paymentTransaction.findFirst({
     where: { gatewayTxId: orderId, gateway: 'momo' }
   })
   IF !tx → return { found: false, message: "Transaction not found" }

   IF tx.status === 'success' → return { found: true, status: 'success' }
   (đã xử lý rồi, không cần query MoMo)

3. Xây rawSignature cho query API (MoMo spec khác với create):
   rawSignature = `accessKey=${config.accessKey}&orderId=${orderId}&partnerCode=${config.partnerCode}&requestId=${requestId||orderId}`
   signature = HMAC-SHA256(rawSignature, config.secretKey)

4. POST JSON lên MoMo Query endpoint:
   {
     partnerCode: config.partnerCode,
     requestId: requestId || orderId,
     orderId: orderId,
     lang: 'vi',
     signature: signature
   }

5. Parse MoMo response:
   - resultCode === 0 → transaction success
   - resultCode !== 0 && !== 0 → transaction pending/failed

6. Nếu MoMo báo success nhưng IPN chưa xử lý:
   - Tự động gọi lại handleIpn logic (tái dùng MomoService.finalizePayment)
   - Hoặc đánh dấu transaction và enqueue job xử lý sau

7. Trả về kết quả reconcile:
   {
     found: true,
     moMoStatus: resultCode,
     localStatus: tx.status,
     match: (resultCode === 0) === (tx.status === 'success'),
     transactionId: tx.id,
     gatewayTxId: response.transId,
     amount: response.amount,
     paidAt: response.responseTime ? new Date(response.responseTime) : null,
   }
```

**Use case reconciliation định kỳ (CRON trigger):**
- Chạy mỗi 30 phút qua job scheduler
- Query tất cả `PaymentTransaction WHERE gateway='momo' AND status='pending' AND createdAt > now() - 24h`
- Với mỗi transaction pending quá 15 phút → gọi `queryStatus()`
- Nếu MoMo báo success → tự động activate subscription
- Log kết quả vào `AuditLog` để audit

---

## IV. MoMo ENV / CONFIG FILE

### `momo.config.ts` structure
```typescript
export interface MomoConfig {
  partnerCode: string;      // MOMO_PARTNER_CODE
  accessKey: string;        // MOMO_ACCESS_KEY
  secretKey: string;        // MOMO_SECRET_KEY
  endpoint: string;         // MOMO_ENDPOINT (default: test-payment.momo.vn/v2/gateway/api/create)
  queryEndpoint: string;    // MOMO_QUERY_ENDPOINT (default: test-payment.momo.vn/v2/gateway/api/query)
  returnUrl: string;        // MOMO_RETURN_URL
  ipnUrl: string;           // MOMO_IPN_URL
  partnerName: string;      // "AIFUT" (hardcode)
}

export function loadMomoConfig(): MomoConfig | null {
  const partnerCode = process.env['MOMO_PARTNER_CODE'];
  const accessKey = process.env['MOMO_ACCESS_KEY'];
  const secretKey = process.env['MOMO_SECRET_KEY'];
  if (!partnerCode || !accessKey || !secretKey) return null;
  return {
    partnerCode, accessKey, secretKey,
    endpoint: process.env['MOMO_ENDPOINT'] || 'https://test-payment.momo.vn/v2/gateway/api/create',
    queryEndpoint: process.env['MOMO_QUERY_ENDPOINT'] || 'https://test-payment.momo.vn/v2/gateway/api/query',
    returnUrl: process.env['MOMO_RETURN_URL'] || 'http://localhost:3000/payment/return',
    ipnUrl: process.env['MOMO_IPN_URL'] || 'http://localhost:3002/payments/momo/ipn',
    partnerName: 'AIFUT',
  };
}
```

### `.env.payments.example` additions
```bash
# ── MoMo Wallet SDK (v2 API) ──────────────────────────────────────────────
# MOMO_PARTNER_CODE   — Cấp bởi MoMo Developer
# MOMO_ACCESS_KEY     — Cấp bởi MoMo Developer
# MOMO_SECRET_KEY     — Cấp bởi MoMo Developer
MOMO_PARTNER_CODE=MOMOBKUN20250321
MOMO_ACCESS_KEY=
MOMO_SECRET_KEY=
# MOMO_ENDPOINT       = https://test-payment.momo.vn/v2/gateway/api/create       (test)
# MOMO_QUERY_ENDPOINT = https://test-payment.momo.vn/v2/gateway/api/query        (test)
# MOMO_RETURN_URL     = http://localhost:3000/payment/return
# MOMO_IPN_URL        = http://localhost:3002/payments/momo/ipn
```

---

## V. PRISMA SCHEMA THAY ĐỔI

### Migration cần chạy

```prisma
// Bổ sung unique constraint cho idempotency
model PaymentTransaction {
  ...
  @@unique([gateway, gatewayTxId])  // Chống duplicate từ MoMo transId
}

// Bổ sung index cho reconciliation query
model PaymentTransaction {
  ...
  @@index([gateway, status, createdAt])  // Query đối soát nhanh
}
```

> **Lưu ý:** `gatewayTxId` là `String?` (nullable) vì khi tạo transaction thì `gatewayTxId` chỉ là `orderId` nội bộ. Sau IPN mới có `transId` từ MoMo. Cần handle non-null collision:
> - Migration: `ALTER TABLE PaymentTransaction ADD CONSTRAINT uq_gateway_txid UNIQUE (gateway, gatewayTxId)` nhưng **để nullable** bằng partial index: `CREATE UNIQUE INDEX uq_gateway_txid ON "PaymentTransaction" (gateway, gatewayTxId) WHERE gatewayTxId IS NOT NULL` (PostgreSQL partial unique index).

---

## VI. SECURITY & EDGE CASES

| Risk | Mitigation |
|---|---|
| **IPN replay attack** | Idempotency guard L1-L3 + timestamp trong IPN có `responseTime`, reject nếu lệch > 5 phút so với server time |
| **Signature forgery** | HMAC-SHA256 verify với `crypto.timingSafeEqual` (constant-time) — không dùng `===` |
| **Mất IPN** | CRON reconciliation 30 phút với `queryStatus()` cho pending transaction > 15 phút |
| **Race condition (2 IPN đồng thời)** | Update `WHERE status='pending' AND id=tx.id` trong Prisma transaction → kiểm tra `count > 0` |
| **User cancel giữa chừng** | `GET /payments/momo/return` với `resultCode` ≠ 0 → transaction `status='failed'` |
| **QrCode dính content injection** | `orderInfo` bị `encodeURIComponent` + `slice(0,100)` trước khi put vào signature |

---

## VII. INTEGRATION MAP (toàn bộ flow)

```
User (Web/Mobile)
  │
  ├─ POST /payments/momo/create
  │   └─ MomoController.createPayment()
  │       └─ MomoService.createPayment()
  │           ├─ Tạo requestId, orderId
  │           ├─ HMAC-SHA256 rawSignature (8 field đúng spec)
  │           ├─ POST → MoMo API /v2/gateway/api/create
  │           ├─ Lưu PaymentTransaction (status: pending)
  │           └─ Return { payUrl, qrCodeUrl }
  │
  ├─ User redirect → MoMo App (thanh toán)
  │
  ├─ MoMo Server ──(IPN POST)──→ /payments/momo/ipn
  │   └─ MomoController.handleIpn()
  │       └─ MomoService.handleIpn()
  │           ├─ [L1] Idempotency check (DB status=success)
  │           ├─ [L2] HMAC verify reverse (13 field)
  │           ├─ [L3] resultCode === 0 ?
  │           ├─ Update PaymentTransaction → status=success
  │           └─ SubscriptionActivatorService.activateByOrderId()
  │               └─ activate subscription → plan-aware expiry
  │               └─ enqueue e-Invoice mail
  │
  ├─ MoMo redirect → returnUrl (GET)
  │   └─ MomoController.handleReturn()
  │       └─ Verify signature (tương tự IPN verify)
  │       └─ IF success → redirect /payment/success
  │       └─ IF fail    → redirect /payment/failed?reason={resultCode}
  │
  └─ CRON ──(30 phút)──→ query pending momo transactions
      └─ MomoService.queryStatus() cho mỗi pending > 15 phút
          └─ POST → MoMo Query API
          └─ Nếu MoMo success → finalizePayment (tái dùng IPN logic)
```

---

## VIII. FILE MIGRATION CHECKLIST

| Step | File hành động | Mô tả |
|---|---|---|
| 1 | CREATE `apps/api/src/payments/momo/momo.config.ts` | Config loader từ env |
| 2 | CREATE `apps/api/src/payments/momo/momo.types.ts` | Types (MomoCreateRequest, MomoIpnPayload, MomoQueryRequest, MomoApiResponse...) |
| 3 | CREATE `apps/api/src/payments/momo/momo.result-codes.ts` | Map `{ 0: "Giao dịch thành công", 1: "...", ... }` |
| 4 | CREATE `apps/api/src/payments/momo/momo.service.ts` | 3 core functions (create, handleIpn, queryStatus) + helper sign + http caller |
| 5 | CREATE `apps/api/src/payments/momo/momo.ipn.guard.ts` | Idempotency guard decorator / interceptor |
| 6 | CREATE `apps/api/src/payments/momo/momo.controller.ts` | 5 endpoints (create, ipn, return, query, reconcile) |
| 7 | CREATE `apps/api/src/payments/momo/momo.module.ts` | Module registration + export |
| 8 | MODIFY `apps/api/src/payments/payments.module.ts` | Import `MomoModule`, remove old `MomoGateway` from providers |
| 9 | DELETE `apps/api/src/payments/momo.gateway.ts` | Replaced by momo.service.ts |
| 10 | MIGRATION `prisma/schema.prisma` | Thêm partial unique index + index |
| 11 | UPDATE `.env.payments.example` | Thêm MOMO_QUERY_ENDPOINT |
| 12 | CREATE test files | Unit + integration tests cho signature, ipn, idempotency |

---

> **Thiết kế này đưa MoMo integration từ "stub có lỗi HMAC" lên production-grade với đầy đủ:**
> - HMAC signature đúng spec MoMo v2 (cả tạo giao dịch và IPN reverse check)
> - Idempotency 3 lớp (DB unique, transaction status guard, application race check)
> - Reconciliation chủ động định kỳ (CRON queryStatus)
> - Integration đầy đủ vào SubscriptionActivatorService + e-Invoice pipeline hiện có
> - Security: timing-safe compare, replay protection, input sanitization

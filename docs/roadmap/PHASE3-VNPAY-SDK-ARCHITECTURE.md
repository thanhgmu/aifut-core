# Phase 3 — VNPay Gateway SDK Architecture Design

> **Date:** 2026-06-16 | **Status:** DESIGN (IDLE — chờ implement) | **Scope:** `apps/api/src/payments/vnpay/`

---

## I. HIỆN TRẠNG & VẤN ĐỀ CẦN GIẢI QUYẾT

### 1a. Hiện trạng

Tồn tại `apps/api/src/payments/vnpay.gateway.ts` — một file flat chứa class `VnpayGateway` triển khai interface `PaymentGateway` với 2 phương thức:
- `createPayment()` — sinh URL thanh toán, đã có HMAC-SHA512
- `handleIpn()` — xác thực IPN, check signature

Linkage với hệ thống hiện tại qua:
- `payments.controller.ts`: route `POST /payments/vnpay/ipn` gọi `payments.handleVnpayIpn()` inline
- `payments.service.ts`: `handleVnpayIpn()` tự update transaction + gọi `activator.activateFromInvoice()`
- `payments.module.ts`: provider chứa `VnpayGateway`

### 1b. Vấn đề

| # | Vấn đề | Mức độ |
|---|--------|--------|
| 1 | **Không có VnpayController riêng** — logic VNPay lẫn trong `PaymentsController` generic | 🔴 Cao |
| 2 | **Hash data bị URL-encode sai** — VNPay yêu cầu RAW value trong hash string, không được encode | 🔴 Cao |
| 3 | **IPN qua GET, không phải POST** — VNPay gửi IPN là GET request với query params | 🟠 Trung |
| 4 | **Không có IPN idempotency guard** — transaction state machine dùng updateMany đơn giản, race-prone | 🟠 Trung |
| 5 | **Không có result-code map** — VNPay có ~20 mã phản hồi, không có file tra cứu | 🟡 Thấp |
| 6 | **Không có config provider** — config đọc trực tiếp từ env trong `onModuleInit` | 🟡 Thấp |
| 7 | **Không có typed interfaces** — dùng `Record<string, any>` tràn lan | 🟡 Thấp |

---

## II. KIẾN TRÚC ĐÍCH (Target Architecture)

### 2a. Cấu trúc thư mục mới

```
apps/api/src/payments/vnpay/
├── vnpay.module.ts           # NestJS Module (đăng ký controller + providers)
├── vnpay.controller.ts       # HTTP Controller (5 endpoints)
├── vnpay.service.ts          # Core logic: create URL, HMAC-SHA512, IPN verify
├── vnpay.config.ts           # Configuration provider (env vars → typed config)
├── vnpay.types.ts            # Type definitions (VNPay-specific interfaces)
├── vnpay.ipn.guard.ts        # Idempotency Guard (3-layer, giống MomoIpnGuard)
└── vnpay.result-codes.ts     # VNPay response code lookup
```

### 2b. Module Dependency Graph

```
PaymentsModule
├── MomoModule          (đã có)
├── VnpayModule         (MỚI)
├── EInvoiceModule      (đã có — qua subscription-activator)
├── SubscriptionActivatorService  (dùng chung)
└── PrismaService       (dùng chung)

VnpayModule
├── VnpayController         → routes /payments/vnpay/*
├── VnpayService            → HMAC-SHA512 logic
├── VnpayConfig             → env credentials resolver
├── VnpayIpnGuard           → 3-layer idempotency
├── SubscriptionActivatorService  → activate workspace quota
└── PrismaService           → transaction CRUD
```

### 2c. Thay đổi file hiện tại

| File | Thay đổi |
|------|----------|
| `payments/vnpay.gateway.ts` | **🗑️ XÓA** — class `VnpayGateway` không còn, logic chuyển vào `VnpayService` |
| `payments/payments.module.ts` | Thêm `VnpayModule` vào `imports`, xoá `VnpayGateway` khỏi `providers` |
| `payments/payments.controller.ts` | Xoá route `POST /payments/vnpay/ipn` và `GET /payments/vnpay/return` (chuyển vào VnpayController) |
| `payments/payments.service.ts` | **🗑️ XOÁ** `handleVnpayIpn()` — flow IPN qua VnpayController → VnpayIpnGuard → VnpayService → SubscriptionActivatorService |

---

## III. CHI TIẾT 3 HÀM LOGIC CORE

### 3a. Hàm #1: `VnpayService.createPaymentUrl()`

**Endpoint:** `GET /payments/vnpay/create-url`

**Luồng xử lý:**

```
Client                          API Server                        VNPay Sandbox
  │                                │                                  │
  │  GET /payments/vnpay/create-url│                                  │
  │  ?amount=150000                │                                  │
  │  &orderId=AIFUT-xxx            │                                  │
  │  &orderInfo=...                │                                  │
  │  &locale=vn                    │                                  │
  │  &ipAddress=...                │                                  │
  │                                │                                  │
  │◄─── 200 { payUrl, txnRef } ────│                                  │
  │                                │                                  │
  │  Redirect browser ─────────────┼──────────── payUrl ──────────────►│
  │                                │                                  │
```

**Cấu trúc tham số VNPay:**

| Tham số | Giá trị | Nguồn |
|---------|---------|-------|
| `vnp_Version` | `2.1.0` | Hard-coded |
| `vnp_Command` | `pay` | Hard-coded |
| `vnp_TmnCode` | `process.env.VNPAY_TMN_CODE` | Config |
| `vnp_Amount` | `amount * 100` (VND × 100) | Input |
| `vnp_CreateDate` | `yyyyMMddHHmmss` | Server time |
| `vnp_CurrCode` | `VND` | Hard-coded |
| `vnp_IpAddr` | Client IP | `x-forwarded-for` / `req.ip` |
| `vnp_Locale` | `vn` (hoặc `en`) | Input |
| `vnp_OrderInfo` | `Mô tả đơn hàng` (max 100 chars) | Input |
| `vnp_OrderType` | `190000` (other) | Hard-coded |
| `vnp_ReturnUrl` | `process.env.VNPAY_RETURN_URL` | Config |
| `vnp_ExpireDate` | `createDate + 15 phút` | Compute |
| `vnp_TxnRef` | Mã giao dịch duy nhất (AIFUT-xxx) | Input |
| `vnp_SecureHash` | HMAC-SHA512(hashData, HashSecret) | Compute |

**⚠️ QUAN TRỌNG — Cách build hash đúng theo VNPay spec:**

```
Bước 1: Tạo hashData = sorted keys, mỗi cặp key=VALUE_RAW (KHÔNG URL-encode)
  hashFields = [vnp_Amount, vnp_Command, vnp_CreateDate, vnp_CurrCode, ...]
  hashFields.sort()  // alphabetically by key
  hashData = hashFields.map(k => `${k}=${params[k]}`).join('&')
  // LƯU Ý: params[k] là RAW value, KHÔNG gọi encodeURIComponent()

Bước 2: HMAC-SHA512
  secureHash = crypto.createHmac('sha512', hashSecret).update(hashData).digest('hex')

Bước 3: Build URL (query string URL-encode)
  queryFields = [...hashFields, vnp_SecureHash]
  queryString = queryFields.sort().map(k => {
    const val = k === 'vnp_SecureHash' ? secureHash : params[k]
    return `${k}=${encodeURIComponent(String(val))}`
  }).join('&')
  payUrl = `${vnp_Url}?${queryString}`
```

**Sai lầm trong code hiện tại (vnpay.gateway.ts, dòng 74):**
```typescript
// ❌ SAI: encodeURIComponent trong hash data
const hashData = sortedKeys.map((key) => `${key}=${encodeURIComponent(params[key])}`).join('&');
// ✅ ĐÚNG: RAW value cho hash, encodeURIComponent chỉ cho URL
```

**Signature Method Contract:**
```typescript
private buildHashData(params: Record<string, string>, keys: string[]): string {
  return keys.map(k => `${k}=${params[k]}`).join('&');
  // RAW values — KHÔNG encodeURIComponent
}

private buildQueryString(params: Record<string, string>, keys: string[]): string {
  return keys.map(k => `${k}=${encodeURIComponent(String(params[k]))}`).join('&');
  // URL-encode cho query string
}

private sign(raw: string, hashSecret: string): string {
  return crypto.createHmac('sha512', hashSecret).update(raw, 'utf8').digest('hex');
}
```

**Response shape:**
```typescript
interface VnpayCreateUrlResult {
  success: boolean;
  payUrl?: string;           // URL redirect đến VNPay
  txnRef?: string;           // vnp_TxnRef (orderId)
  amount?: number;
  errorMessage?: string;
}
```

---

### 3b. Hàm #2: `VnpayService.verifyIpn()` + `VnpayIpnGuard`

**Endpoint:** `GET /payments/vnpay/ipn`

**⚠️ VNPay gửi IPN qua GET** (query string, không phải POST body).

**Luồng xử lý:**

```
VNPay Server                  API Server                         DB
  │                              │                                │
  │  GET /payments/vnpay/ipn     │                                │
  │  ?vnp_Amount=15000000        │                                │
  │  &vnp_ResponseCode=00        │                                │
  │  &vnp_TransactionNo=...      │                                │
  │  &vnp_SecureHash=abc...      │                                │
  │                              │                                │
  │  ──► VnpayController         │                                │
  │      .handleIpn(query)       │                                │
  │                              │                                │
  │  ──► Step 1: Extract hash    │                                │
  │      receivedHash =          │                                │
  │        query.vnp_SecureHash   │                                │
  │      params = {...query}     │                                │
  │      delete vnp_SecureHash   │                                │
  │      delete vnp_SecureHashType│                                │
  │                              │                                │
  │  ──► Step 2: Build hashData  │                                │
  │      sortedKeys =            │                                │
  │        Object.keys(params).sort()                             │
  │      hashData = sortedKeys   │                                │
  │        .map(k => `${k}=${params[k]}`).join('&')              │
  │      // RAW value, không URL-encode                          │
  │                              │                                │
  │  ──► Step 3: Compute HMAC    │                                │
  │      computed = HMAC-SHA512  │                                │
  │        (hashData, hashSecret)│                                │
  │      if computed !== received│                                │
  │        → RspCode=97          │                                │
  │                              │                                │
  │  ──► Step 4: Check response  │                                │
  │      if vnp_ResponseCode !== '00'                             │
  │        → RspCode=99          │                                │
  │                              │                                │
  │  ──► Step 5: VnpayIpnGuard   │                                │
  │      .claim(orderId, txnNo,  │                                │
  │              amount)         │                                │
  │      ─────────► Layer 1 ────►│ SELECT * WHERE ...             │
  │      (fast pre-check)        │◄───── row or null ────────────│
  │                              │                                │
  │      ─────────► Layer 2 ────►│ UPDATE status='processing'     │
  │      (atomic claim)          │  WHERE id=tx.id                │
  │                              │  AND status='pending'          │
  │                              │◄───── count===1? ─────────────│
  │                              │                                │
  │  ──► Step 6: Settle (nếu    │                                │
  │      claimed)                │                                │
  │      .settle(txId, patch)    │                                │
  │      ──── Serializable TX ──►│ BEGIN; SELECT FOR UPDATE;     │
  │                              │ UPDATE status='success';       │
  │                              │ COMMIT;                        │
  │                              │◄───── committed ──────────────│
  │                              │                                │
  │  ──► Step 7: Activate sub    │                                │
  │      .activateByOrderId({    │                                │
  │        orderId,              │                                │
  │        gateway: 'vnpay',     │                                │
  │        gatewayTxId: txnNo,   │                                │
  │        ipnPayload: {...}     │                                │
  │      })                      │                                │
  │              │               │                                │
  │  ◄── RspCode=00 ─────────────│                                │
  │      Message=Confirm Success │                                │
```

**VNPay IPN Response Code Mapping:**

| Mã | Ý nghĩa | Khi nào dùng |
|----|---------|--------------|
| `00` | Confirm Success | IPN xử lý thành công, giao dịch hợp lệ |
| `97` | Invalid Signature | Hash không khớp — request giả mạo |
| `99` | Unknown Error | Lỗi xử lý nội bộ |
| `02` | Order already confirmed | Idempotent — đã xử lý trước đó |

**Cấu trúc `VnpayIpnGuard` (mirror `MomoIpnGuard`):**

```typescript
@Injectable()
class VnpayIpnGuard {
  // Layer 1 — Fast pre-check:
  //   PaymentTransaction.findFirst({ gateway: 'vnpay', metadata.orderId === orderId })
  //   Nếu status terminal → 'duplicate' (RspCode=02)

  // Layer 2 — Atomic claim:
  //   updateMany({ id: tx.id, status: 'pending' }, { status: 'processing' })
  //   count===0 → race lost → re-read → 'duplicate'/'in-progress'

  // Layer 3 — Serializable settle:
  //   $transaction(async tx => {
  //     const row = tx.paymentTransaction.findUnique({ id, select: { status } })
  //     if (row.status !== 'processing') return false  // fence
  //     tx.paymentTransaction.update({ id, data: { status: 'success', ... } })
  //     return true
  //   }, { isolationLevel: Serializable })

  // Amount integrity check trước Layer 2:
  //   Math.round(tx.amount) !== Math.round(ipnAmount/100) → 'amount-mismatch'
}
```

**VNPay IPN Controller Handler:**
```typescript
@Get('ipn')
async handleIpn(@Query() query: Record<string, string>): Promise<VnpayIpnResponse> {
  // 1. Verify HMAC-SHA512 signature
  const verified = this.vnpayService.verifyIpn(query);
  if (!verified.signatureValid) {
    return { RspCode: '97', Message: 'Invalid Signature' };
  }

  // 2. Check response code
  if (verified.responseCode !== '00') {
    return { RspCode: '99', Message: 'Payment not successful' };
  }

  // 3. Idempotency guard
  const claim = await this.vnpayIpnGuard.claim(
    verified.orderId, verified.transactionNo, verified.amount,
  );
  if (claim.decision !== 'claimed') {
    return { RspCode: '02', Message: 'Order already confirmed' };
  }

  // 4. Settle transaction (Serializable)
  const settled = await this.vnpayIpnGuard.settle(
    claim.transactionId!, 'success', {
      gatewayTxId: verified.transactionNo,
      gateway: 'vnpay',
      metadata: { orderId: verified.orderId, ipnResponse: query },
    },
  );
  if (!settled) {
    return { RspCode: '99', Message: 'Settle conflict' };
  }

  // 5. Activate subscription
  await this.subscriptionActivator.activateByOrderId({
    orderId: verified.orderId,
    gateway: 'vnpay',
    gatewayTxId: verified.transactionNo,
    ipnPayload: query,
  }).catch(err => this.logger.warn(`Activate warning: ${err.message}`));

  return { RspCode: '00', Message: 'Confirm Success' };
}
```

---

### 3c. Hàm #3: `VnpayService.verifyIpn()` & SubscriptionActivator Linkage

**Hàm verifyIpn() — xác thực gói tin IPN:**

```typescript
interface VnpayIpnVerification {
  valid: boolean;              // signature OK + responseCode === '00'
  signatureValid: boolean;     // HMAC khớp
  responseCode: string;        // vnp_ResponseCode
  transactionNo: string;       // vnp_TransactionNo
  amount: number;              // vnp_Amount / 100 → VND
  orderId: string;             // vnp_TxnRef
  bankCode: string;            // vnp_BankCode
  payDate: string;             // vnp_PayDate
  reason?: string;
}

verifyIpn(raw: Record<string, string>): VnpayIpnVerification {
  const receivedHash = raw['vnp_SecureHash'];
  const params = { ...raw };
  delete params['vnp_SecureHash'];
  delete params['vnp_SecureHashType'];

  const sortedKeys = Object.keys(params).sort();
  const hashData = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
  // ⚠️ RAW values, KHÔNG URL-encode

  const computedHash = crypto
    .createHmac('sha512', this.config.vnp_HashSecret)
    .update(hashData, 'utf8')
    .digest('hex');

  const signatureValid = crypto.timingSafeEqual(
    Buffer.from(computedHash, 'hex'),
    Buffer.from(receivedHash, 'hex'),
  );

  const responseCode = params['vnp_ResponseCode'] as string;
  return {
    valid: signatureValid && responseCode === '00',
    signatureValid,
    responseCode,
    transactionNo: params['vnp_TransactionNo'] as string,
    amount: parseInt(params['vnp_Amount'] as string, 10) / 100,
    orderId: params['vnp_TxnRef'] as string,
    bankCode: params['vnp_BankCode'] as string,
    payDate: params['vnp_PayDate'] as string,
    reason: !signatureValid ? 'Invalid HMAC-SHA512 signature' :
            responseCode !== '00' ? `VNPay responseCode=${responseCode}` :
            undefined,
  };
}
```

**SubscriptionActivatorService — đã tồn tại, không cần sửa:**

`SubscriptionActivatorService.activateByOrderId()` hiện tại đã hỗ trợ:
1. Tra cứu `PaymentTransaction` qua `metadata.orderId` hoặc `gatewayTxId`
2. Update transaction → `status: 'success'`, `paidAt`, `gatewayTxId`
3. Nếu `tx.invoiceId` tồn tại → `activateFromInvoice(invoiceId)` → mark invoice paid
4. Nếu `invoice.subscriptionId` tồn tại → `activateBySubscriptionId(subId)` → compute plan-aware expiry
5. Kích hoạt subscription với plan interval-aware expiry (MONTHLY→+1m, YEARLY→+12m, ONE_TIME→null)

Không cần thay đổi gì ở `SubscriptionActivatorService` — VNPay IPN chỉ cần gọi đúng method.

---

## IV. FILE-BY-FILE SPECIFICATION

### File 1: `vnpay.config.ts`

```
MỚI    apps/api/src/payments/vnpay/vnpay.config.ts

Providers: VnpayConfig (Injectable)
Pattern:  Giống MomoConfig:
          - onModuleInit() → load()
          - load() → process.env.* → typed VnpayCredentials
          - require() → throw | return credentials
          - tryGet() → credentials | null
          - isConfigured → boolean

Env vars:
  VNPAY_TMN_CODE          — Mã website merchant
  VNPAY_HASH_SECRET       — Chuỗi bí mật HMAC-SHA512
  VNPAY_URL               — https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
  VNPAY_RETURN_URL        — http://localhost:3000/payment/return
  VNPAY_IPN_URL           — http://localhost:3002/payments/vnpay/ipn

Interface VnpayCredentials:
  vnp_TmnCode: string
  vnp_HashSecret: string
  vnp_Url: string
  vnp_ReturnUrl: string
  vnp_IpnUrl: string
```

### File 2: `vnpay.types.ts`

```
MỚI    apps/api/src/payments/vnpay/vnpay.types.ts

Exports:
  VnpayCreateUrlInput     — đầu vào cho createPaymentUrl()
  VnpayCreateUrlResult    — kết quả (payUrl, txnRef, amount, errorMessage)
  VnpayIpnPayload         — raw IPN params (Record<string, string>)
  VnpayIpnVerification    — kết quả verifyIpn()
  VnpayIpnResponse        — response về VNPay ({ RspCode, Message })
  VnpayResultCode          — type '00'|'97'|'99'|'02'
```

### File 3: `vnpay.service.ts`

```
MỚI    apps/api/src/payments/vnpay/vnpay.service.ts

Dependencies: VnpayConfig

Methods:
  ✅ createPaymentUrl(input: VnpayCreateUrlInput): VnpayCreateUrlResult
     - Build params object (15 fields)
     - Build raw hash string (sorted, RAW values)
     - HMAC-SHA512 sign
     - Build payUrl (sorted, URL-encoded values + vnp_SecureHash)
     - Return { success, payUrl, txnRef, amount }

  ✅ verifyIpn(raw: Record<string, string>): VnpayIpnVerification
     - Extract vnp_SecureHash
     - Remove vnp_SecureHash, vnp_SecureHashType
     - Sort remaining keys
     - Build hash string (RAW values)
     - HMAC-SHA512 compare (timingSafeEqual)
     - Return { valid, signatureValid, responseCode, ... }

Private helpers:
  - buildHashData(params, sortedKeys): string
  - buildQueryString(params, sortedKeys): string
  - sign(raw: string): string
  - formatDate(date: Date): string  → yyyyMMddHHmmss
  - timingSafeEqual(a: string, b: string): boolean
```

### File 4: `vnpay.controller.ts`

```
MỚI    apps/api/src/payments/vnpay/vnpay.controller.ts

Routes:
  GET  /payments/vnpay/create-url  → createPaymentUrl()
       Query: amount, orderId, orderInfo, locale, bankCode?
       Headers: x-forwarded-for (ip)
       Logic:
         1. Validate required params
         2. Check config.isConfigured
         3. Save PaymentTransaction (status: pending) via Prisma
         4. Call vnpayService.createPaymentUrl()
         5. Return { success, payUrl, txnRef }

  GET  /payments/vnpay/ipn         → handleIpn()
       Query: All VNPay IPN params
       Logic:
         1. vnpayService.verifyIpn(query)
         2. Check verification.valid
         3. vnpayIpnGuard.claim()
         4. vnpayIpnGuard.settle()
         5. subscriptionActivator.activateByOrderId()
         6. Return { RspCode, Message }

  GET  /payments/vnpay/return      → handleReturn()
       Query: All VNPay return params
       Logic:
         1. Verify signature + responseCode
         2. Return structured result cho frontend
         3. ⚠️ Không activate subscription từ return URL

  GET  /payments/vnpay/query/:txnRef  → queryTransaction()
       Logic:
         1. Prisma findFirst({ gateway: 'vnpay', metadata.orderId === txnRef })
         2. Return transaction status

  POST /payments/vnpay/reconcile    → reconcile()
       Body: { orderId: string }
       Logic:
         1. Safety net cho IPN bị drop
         2. subscriptionActivator.activateByOrderId()
         3. Return activation status
```

### File 5: `vnpay.ipn.guard.ts`

```
MỚI    apps/api/src/payments/vnpay/vnpay.ipn.guard.ts

Pattern: Mirror MomoIpnGuard hoàn chỉnh

3-layer idempotency:
  Layer 1 — Fast pre-check read
  Layer 2 — Atomic claim (compare-and-swap)  
  Layer 3 — Serializable settle (transaction + FOR UPDATE fence)

Exports:
  IdempotencyDecision = 'claimed' | 'duplicate' | 'in-progress' | 'not-found' | 'amount-mismatch'
  IdempotencyClaim { decision, transactionId?, currentStatus?, reason? }

Methods:
  claim(orderId, gatewayTxId?, amount): Promise<IdempotencyClaim>
  settle(transactionId, finalStatus, patch): Promise<boolean>
```

### File 6: `vnpay.result-codes.ts`

```
MỚI    apps/api/src/payments/vnpay/vnpay.result-codes.ts

Exports:
  resolveVnpayResultCode(code: string): { status, message }

Map (các mã phổ biến):
  '00' → Giao dịch thành công
  '01' → Giao dịch chưa được khởi tạo
  '02' → Giao dịch bị lỗi
  '04' → Giao dịch đảo (Refund)
  '05' → Giao dịch không thành công (Sai thông tin)
  '07' → Trừ tiền thành công 
  '09' → Giao dịch thất bại (thẻ không hợp lệ)
  '10' → Giao dịch phát sinh lỗi xác thực
  '11' → Timeout
  '12' → Thẻ bị khóa
  '13' → Sai mã OTP
  '24' → Khách hàng hủy giao dịch
  '51' → Tài khoản không đủ số dư
  '65' → Tài khoản vượt quá hạn mức
  '75' → Ngân hàng bảo trì
  '79' → Sai mật khẩu thanh toán
  '97' → Chữ ký không hợp lệ
  '99' → Lỗi không xác định
```

### File 7: `vnpay.module.ts`

```
MỚI    apps/api/src/payments/vnpay/vnpay.module.ts

imports: []
controllers: [VnpayController]
providers: [VnpayService, VnpayConfig, VnpayIpnGuard, SubscriptionActivatorService, PrismaService]
exports: [VnpayService, VnpayConfig, VnpayIpnGuard]
```

---

## V. THAY ĐỔI CÁC FILE HIỆN TẠI

### 5a. `payments.module.ts` — Thay đổi

```typescript
// BEFORE:
import { VnpayGateway } from './vnpay.gateway';
// ...
@Module({
  imports: [MomoModule],
  providers: [PaymentsService, VnpayGateway, /* ... */],
})

// AFTER:
import { VnpayModule } from './vnpay/vnpay.module';
// ...
@Module({
  imports: [MomoModule, VnpayModule],   // ← thêm VnpayModule
  providers: [PaymentsService, /* ... */],  // ← xoá VnpayGateway
  exports: [PaymentsService, SubscriptionActivatorService, PaymentsWebhookService, InvoiceMailerService],
})
```

### 5b. `payments.controller.ts` — Xoá VNPay routes

Xoá 2 methods:
- `vnpayIpn()` — chuyển vào VnpayController
- `vnpayReturn()` — chuyển vào VnpayController

Giữ nguyên các route khác: `capabilities`, `create`, `momo/ipn`, `momo/return`, `history`

### 5c. `payments.service.ts` — Xoá `handleVnpayIpn()`

Xoá method `handleVnpayIpn()` (và xoá import `VnpayGateway`).

### 5d. `vnpay.gateway.ts` — 🗑️ XOÁ

File cũ bị xoá hoàn toàn, logic chuyển vào `VnpayService`.

---

## VI. ENV VARIABLES (cập nhật)

```bash
# .env — VNPay Gateway
VNPAY_TMN_CODE=YOUR_TMN_CODE
VNPAY_HASH_SECRET=YOUR_HASH_SECRET
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://localhost:3000/payment/return
VNPAY_IPN_URL=http://localhost:3002/payments/vnpay/ipn
```

---

## VII. SEQUENCE DIAGRAM — Full IPN Flow (text)

```
VNPay                  VnpayController          VnpayService         VnpayIpnGuard        Prisma           SubscriptionActivator
  │                         │                       │                    │                   │                     │
  │──GET /ipn?params───────►│                       │                    │                   │                     │
  │                         │──verifyIpn(query)────►│                    │                   │                     │
  │                         │◄──{valid,code,txnNo}──│                    │                   │                     │
  │                         │                       │                    │                   │                     │
  │                         │──claim(orderId)───────┼───────────────────►│                   │                     │
  │                         │                       │                    │──SELECT──────────►│                     │
  │                         │                       │                    │◄──row─────────────│                     │
  │                         │                       │                    │                   │                     │
  │                         │                       │                    │──UPDATE──────────►│(pending→processing) │
  │                         │                       │                    │◄──count=1─────────│                     │
  │                         │◄──{decision:claimed}──┼───────────────────│                   │                     │
  │                         │                       │                    │                   │                     │
  │                         │──settle(txId)─────────┼───────────────────►│                   │                     │
  │                         │                       │                    │──BEGIN TX────────►│                     │
  │                         │                       │                    │──SELECT FOR UPDATE►│                     │
  │                         │                       │                    │──UPDATE──────────►│(processing→success)│
  │                         │                       │                    │──COMMIT──────────►│                     │
  │                         │◄──true────────────────┼───────────────────│                   │                     │
  │                         │                       │                    │                   │                     │
  │                         │──activateByOrderId()──┼───────────────────────────────────────┼────────────────────►│
  │                         │                       │                    │                   │──find→update───────│
  │                         │                       │                    │                   │──activateFromInv──►│
  │                         │◄──{matched,activated}─┼───────────────────────────────────────┼────────────────────│
  │                         │                       │                    │                   │                     │
  │◄──{RspCode:'00', Msg}───│                       │                    │                   │                     │
```

---

## VIII. CHECKLIST IMPLEMENTATION

| # | Task | File | Phụ thuộc |
|---|------|------|-----------|
| 1 | Tạo `VnpayConfig` | `vnpay.config.ts` | — |
| 2 | Tạo `VnpayTypes` | `vnpay.types.ts` | — |
| 3 | Tạo `VnpayResultCodes` | `vnpay.result-codes.ts` | — |
| 4 | Tạo `VnpayService` | `vnpay.service.ts` | 1 |
| 5 | Tạo `VnpayIpnGuard` | `vnpay.ipn.guard.ts` | — |
| 6 | Tạo `VnpayController` | `vnpay.controller.ts` | 1, 4, 5 |
| 7 | Tạo `VnpayModule` | `vnpay.module.ts` | 6 |
| 8 | Sửa `PaymentsModule` | `payments.module.ts` | 7 |
| 9 | Sửa `PaymentsController` | `payments.controller.ts` | — |
| 10 | Sửa `PaymentsService` | `payments.service.ts` | — |
| 11 | Xoá `VnpayGateway` | `vnpay.gateway.ts` | 7 |
| 12 | Verify build `npx tsc --noEmit` | — | 7–11 |

---

## IX. PRODUCTION NOTES

1. **VNPay IPN là GET request** — controller dùng `@Query()`, không phải `@Body()`.
2. **VNPay response bắt buộc format `{ RspCode, Message }`** — KHÔNG trả JSON khác.
3. **Không activate subscription từ `/return`** — chỉ từ `/ipn` để tránh double-activate.
4. **HashSecret là HMAC-SHA512**, không phải SHA256 như MoMo.
5. **Amount ×100** — VNPay tính amount = số tiền × 100 (ví dụ 150.000 VND → 15000000).
6. **ExpireDate = CreateDate + 15 phút** — VNPay từ chối giao dịch quá hạn.
7. **Return URL phải là HTTP(S) public** — không dùng localhost nếu VNPay không gọi được.

---

## ⏸️ IDLE — BẢN THIẾT KẾ HOÀN THÀNH

Phiên chat chuyển về trạng thái IDLE theo yêu cầu. 

Khi sẵn sàng implement, gõ **`AIFUT GO`** để kick-off code generation.

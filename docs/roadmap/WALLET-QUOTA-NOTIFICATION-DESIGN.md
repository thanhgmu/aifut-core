# WALLET QUOTA THRESHOLD & LOW BALANCE NOTIFICATION SERVICE
## Bản thiết kế kiến trúc — Phase 3, Phân hệ Backend apps/api

| Mục | Giá trị |
|---|---|
| Module | `apps/api/src/payments/ledger` |
| Tác vụ gốc | Wallet Ledger Quota Threshold Hook + Low Balance Notification Dispatcher |
| Phụ thuộc | `LedgerService`, `NotificationService`, `LEDGER_CONFIG`, Prisma `NotificationLog` |
| Ngày | 2026-06-17 |
| Trạng thái | Thiết kế (Design) — chờ triển khai |

---

## 1. TỔNG QUAN KIẾN TRÚC

Luồng xử lý hiện tại: `debitBalance()` → cập nhật wallet + ghi LedgerTransaction → return result.

Luồng mong muốn: `debitBalance()` → cập nhật wallet + ghi LedgerTransaction → **[THRESHOLD HOOK]** → so sánh `balanceAfter` với `lowBalanceWarningThreshold` → nếu dưới ngưỡng → **[THROTTLE GUARD]** → kiểm tra 24h cooldown → **[DISPATCHER]** → ghi `NotificationLog` (PENDING) → Outbox Processor gửi email/Zalo/SMS thực tế.

```
User/System
    │
    ▼
debitBalance(input)                     ← LedgerService.existing
    │
    ├── CAS cập nhật Wallet
    ├── Ghi LedgerTransaction
    │
    ▼
[THRESHOLD CHECK HOOK]                  ← *** MỚI ***
    │  if balanceAfter < lowBalanceWarningThreshold
    │
    ▼
[THROTTLE GUARD]                        ← *** MỚI ***
    │  if sent_low_balance_alert in last 24h → skip
    │
    ▼
[DISPATCHER]                            ← *** MỚI ***
    │  Ghi NotificationLog (PENDING, channel=EMAIL)
    │
    ▼
InvoiceOutboxProcessor (poller)         ← Existing
    │
    ▼
InvoiceMailerService.send()             ← Existing
    │
    ▼
SMTP → Tenant Email
```

---

## 2. CẤU TRÚC FILE

### 2.1 File mới: `apps/api/src/payments/ledger/ledger-notification.service.ts`
Service chính — chứa cả 3 hàm logic core.

### 2.2 File mới: `apps/api/src/payments/ledger/ledger-notification.types.ts`
Định nghĩa types, interfaces, constants cho module cảnh báo.

### 2.3 File cập nhật: `apps/api/src/payments/ledger/ledger.config.ts`
Bổ sung các hằng số cấu hình cho throttling và dispatcher.

### 2.4 File cập nhật: `apps/api/src/payments/ledger/ledger.service.ts`
Gắn hook gọi `LedgerNotificationService.handleThresholdCheck()` sau debit.

### 2.5 File cập nhật: `apps/api/src/payments/ledger/ledger.module.ts`
Import + provide `LedgerNotificationService`.

### 2.6 File mới (optional): `apps/api/src/payments/ledger/ledger-notification.processor.ts`
Outbox processor riêng cho low-balance alerts (nếu muốn tách queue khỏi invoice mailer). **Khuyến nghị:** tái sử dụng `InvoiceOutboxProcessor` hiện có bằng cách ghi `NotificationLog` (channel=EMAIL) — đỡ tốn một poller mới.

---

## 3. CHI TIẾT 3 HÀM LOGIC CORE

### 3.1 HÀM 1 — `handleThresholdCheck(tenantId, balanceAfter, debitInput)`
**Mục đích:** Hook bọc sau `debitBalance()` thành công, kiểm tra nếu `balanceAfter < lowBalanceWarningThreshold` thì kích hoạt chuỗi cảnh báo.

**Chữ ký (signature):**
```typescript
async handleThresholdCheck(
  tenantId: string,
  balanceAfter: bigint,
  debitInput: DebitInput,        // context cho dispatcher
  threshold?: bigint,             // override threshold, mặc định LEDGER_CONFIG.lowBalanceWarningThreshold
): Promise<{ alerted: boolean; reason?: 'below_threshold' | 'throttled' | 'above_threshold' }>
```

**Logic chi tiết:**
```
1. threshold = threshold ?? LEDGER_CONFIG.lowBalanceWarningThreshold
2. Nếu balanceAfter >= threshold → return { alerted: false, reason: 'above_threshold' }
3. Nếu balanceAfter < threshold → gọi ThrottleGuard (Hàm 2)
4. Nếu throttled → return { alerted: false, reason: 'throttled' }
5. Nếu không throttled → gọi Dispatcher (Hàm 3) → return { alerted: true, reason: 'below_threshold' }
```

**Vị trí gọi trong `ledger.service.ts`:**
Sau dòng cập nhật wallet + ghi LedgerTransaction thành công, trước `return`:

```typescript
// Sau khi debitBalance() thành công (trong $transaction)
this.ledgerNotificationService
  .handleThresholdCheck(input.tenantId, newBalance, input)
  .catch((err) => this.logger.warn(`Threshold check failed (non-blocking): ${err.message}`));
```

**Quan trọng:** Hook là **fire-and-forget**, không block response. Nếu lỗi → chỉ warning log.

---

### 3.2 HÀM 2 — `checkThrottle(tenantId): ThrottleResult`
**Mục đích:** Đảm bảo mỗi tenant chỉ nhận tối đa 1 cảnh báo low-balance trong 24 giờ, tránh spam khi balance dao động quanh ngưỡng.

**Thiết kế: Database query (không cần Redis).**

**Chữ ký:**
```typescript
interface ThrottleResult {
  allowed: boolean;           // true = được gửi, false = bị throttle
  lastAlertAt: Date | null;   // thời điểm gửi cảnh báo gần nhất
  nextAllowedAt: Date | null; // thời điểm được gửi tiếp theo
  cooldownWindowMs: number;   // thời gian cooldown (mặc định 24h)
}

async checkThrottle(
  tenantId: string,
  cooldownWindowMs?: number,   // override, mặc định LEDGER_CONFIG.lowBalanceAlertCooldownMs
): Promise<ThrottleResult>
```

**Logic chi tiết (DB-only, không cache):**
```
1. windowMs = cooldownWindowMs ?? LEDGER_CONFIG.lowBalanceAlertCooldownMs (mặc định 24h = 86,400,000 ms)
2. cutoffTime = now - windowMs
3. Query NotificationLog:
     SELECT id, createdAt 
     FROM NotificationLog 
     WHERE tenantId = ? 
       AND channel = 'EMAIL' 
       AND status IN ('SENT', 'PENDING') 
       AND createdAt > cutoffTime
       AND JSON_EXTRACT(metadata, '$.alertType') = 'low_balance'
     ORDER BY createdAt DESC 
     LIMIT 1
4. Nếu có kết quả → lastAlertAt = result.createdAt, allowed = false
5. Nếu không → allowed = true
6. nextAllowedAt = lastAlertAt ? lastAlertAt + windowMs : null
7. Return { allowed, lastAlertAt, nextAllowedAt, cooldownWindowMs: windowMs }
```

**Giải thích lựa chọn DB-only:**
- Chưa có Redis/cache module trong codebase
- Query đơn giản, chỉ 1 index scan (tenantId + channel + status + createdAt)
- Thêm index phủ cho `alertType` trong metadata nếu cần
- Không cần dependency mới — Prisma + PostgreSQL đủ
- Nếu sau này có Redis, có thể thêm cache layer mà không break interface

**Index cần có:**
```prisma
@@index([tenantId, channel, status, createdAt])
```

---

### 3.3 HÀM 3 — `dispatchLowBalanceAlert(tenantId, context)`
**Mục đích:** Tạo bản ghi `NotificationLog` (PENDING, channel=EMAIL) với template low-balance, đẩy vào Outbox Queue để `InvoiceOutboxProcessor` xử lý bất đồng bộ.

**Chữ ký:**
```typescript
interface LowBalanceContext {
  currentBalance: bigint;
  threshold: bigint;
  currency: string;            // mặc định 'VND'
  lastDebitAmount: bigint;     // amount của debit vừa thực hiện
  lastDebitReason: string;     // description từ debit
  tenantEmail?: string;        // email tenant (nếu biết)
  tenantName?: string;         // tên tenant
}

interface DispatchResult {
  logId: string;
  channel: string;
  status: 'PENDING' | 'ALREADY_SENT';
}

async dispatchLowBalanceAlert(
  tenantId: string,
  context: LowBalanceContext,
  preferredChannel?: NotificationChannel,  // mặc định EMAIL
): Promise<DispatchResult>
```

**Logic chi tiết:**
```
1. Tìm email của tenant từ User / Membership / cấu hình tenant:
     SELECT u.email FROM User u 
     JOIN Membership m ON m.userId = u.id 
     WHERE m.tenantId = ? AND m.role IN ('OWNER', 'ADMIN')
     LIMIT 1
   (hoặc dùng context.tenantEmail nếu được truyền)
2. Nếu không tìm thấy email → trả về { status: 'NO_RECIPIENT' }
3. Tạo subject + body từ template (renderInline hoặc hardcoded)
4. Ghi NotificationLog:
     INSERT INTO NotificationLog (
       tenantId, channel, to, subject, renderedBody, status,
       metadata
     ) VALUES (
       tenantId,
       preferredChannel ?? 'EMAIL',
       email,
       subject,
       bodyHTML,
       'PENDING',
       JSON({
         alertType: 'low_balance',
         currentBalance: context.currentBalance.toString(),
         threshold: context.threshold.toString(),
         currency: context.currency,
         lastDebitAmount: context.lastDebitAmount.toString(),
         lastDebitReason: context.lastDebitReason,
         tenantName: context.tenantName,
         cooldownWindowsMs: LEDGER_CONFIG.lowBalanceAlertCooldownMs,
       })
     )
5. Trả về { logId, channel, status: 'PENDING' }
```

**Template email khẩn cấp (HTML hardcoded fallback):**
```html
<h2>[AIFUT] Cảnh báo: Số dư ví thấp</h2>
<p>Xin chào <strong>{{tenantName}}</strong>,</p>
<p>Số dư ví AIFUT của bạn hiện còn <strong>{{currentBalance}} {{currency}}</strong>,
dưới ngưỡng cảnh báo <strong>{{threshold}} {{currency}}</strong>.</p>
<p>Giao dịch gần nhất: {{lastDebitReason}} ({{lastDebitAmount}} {{currency}})</p>
<p>Để tránh gián đoạn dịch vụ, vui lòng <a href="https://app.aifut.dev/billing/wallet">nạp thêm tiền</a>.</p>
<hr>
<small>Email này được gửi tự động bởi hệ thống AIFUT. Tối đa 1 cảnh báo mỗi 24 giờ.</small>
```

**Chỉ gửi khi có email hợp lệ:** Nếu tenant không có email nào (chưa có user hoặc chỉ có user email = null), bỏ qua không ghi NotificationLog để tránh PENDING outbox chết vô hạn.

---

## 4. CẤU HÌNH MỚI (BỔ SUNG VÀO `ledger.config.ts`)

```typescript
/** Ngưỡng cảnh báo số dư thấp */
lowBalanceWarningThreshold: BigInt(10000),  // 10,000 VND (đã có)

/** Cooldown giữa 2 cảnh báo low-balance (ms) */
lowBalanceAlertCooldownMs: 86_400_000,     // 24 giờ

/** Ngưỡng cảnh báo "critical" — gửi cảnh báo cấp bách hơn (email + Zalo nếu có) */
criticalBalanceThreshold: BigInt(1000),    // 1,000 VND

/** Cooldown cho cảnh báo critical (ngắn hơn) */
criticalAlertCooldownMs: 3_600_000,        // 1 giờ

/** Kênh ưu tiên gửi cảnh báo (mặc định EMAIL) */
defaultAlertChannel: 'EMAIL' as const,

/** Bật/tắt hoàn toàn hệ thống cảnh báo */
enableLowBalanceAlert: true,

/** Bật/tắt cảnh báo critical */
enableCriticalBalanceAlert: true,
```

---

## 5. KIẾN TRÚC MODULE (`ledger.module.ts` — BẢN CẬP NHẬT)

```typescript
@Global()
@Module({
  controllers: [LedgerController],
  providers: [
    LedgerService,
    LedgerDebitInterceptor,
    LedgerNotificationService,   // ← MỚI
    PrismaService,
  ],
  exports: [
    LedgerService,
    LedgerNotificationService,   // ← MỚI
    LedgerDebitInterceptor,
  ],
})
export class LedgerModule {}
```

**Lưu ý:** `LedgerNotificationService` gọi `PrismaService` trực tiếp (không qua `NotificationService`) để tránh circular dependency và giảm coupling. `NotificationLog` ghi ở mức PENDING — `InvoiceOutboxProcessor` hoặc `LedgerNotificationProcessor` sẽ gửi thực tế.

---

## 6. SƠ ĐỒ TUẦN TỰ (SEQUENCE DIAGRAM)

```
LedgerService               LedgerNotificationService          Prisma (NotificationLog)    InvoiceOutboxProcessor    SMTP
    │                               │                               │                           │                       │
    │ debitBalance(input)           │                               │                           │                       │
    │───────┐                       │                               │                           │                       │
    │       │ CAS wallet            │                               │                           │                       │
    │       │ create LedgerTx       │                               │                           │                       │
    │<──────┘                       │                               │                           │                       │
    │                               │                               │                           │                       │
    │ handleThresholdCheck(...)     │                               │                           │                       │
    │──────────────────────────────>│                               │                           │                       │
    │                               │ balanceAfter < threshold?     │                           │                       │
    │                               │───────┐                       │                           │                       │
    │                               │<──────┘ YES                   │                           │                       │
    │                               │                               │                           │                       │
    │                               │ checkThrottle(tenantId)       │                           │                       │
    │                               │──────────────────────────────>│                           │                       │
    │                               │   SELECT ... WHERE            │                           │                       │
    │                               │   alertType=low_balance       │                           │                       │
    │                               │   AND createdAt > cutoff      │                           │                       │
    │                               │<──────────────────────────────│                           │                       │
    │                               │                               │                           │                       │
    │                               │ [if allowed]                  │                           │                       │
    │                               │ dispatchLowBalanceAlert(...)  │                           │                       │
    │                               │──────────────────────────────>│                           │                       │
    │                               │   INSERT NotificationLog      │                           │                       │
    │                               │   (PENDING, channel=EMAIL)    │                           │                       │
    │                               │<──────────────────────────────│                           │                       │
    │                               │                               │                           │                       │
    │<── return { alerted: true }───│                               │                           │                       │
    │                               │                               │                           │                       │
    │ [trả về LedgerResult]         │                               │                           │                       │
    │                               │                               │                           │                       │
    │                               │                               │   poll() mỗi 5s           │                       │
    │                               │                               │<──────────────────────────│                       │
    │                               │                               │   query PENDING            │                       │
    │                               │                               │──────────────────────────>│                       │
    │                               │                               │                           │                       │
    │                               │                               │                           │ sendMail()            │
    │                               │                               │                           │──────────────────────>│
    │                               │                               │                           │<──────────────────────│
    │                               │                               │ update → SENT/FAILED      │                       │
    │                               │                               │<──────────────────────────│                       │
```

---

## 7. MA TRẬN TÁC ĐỘNG (IMPACT ANALYSIS)

| File | Hành động | Mức độ |
|---|---|---|
| `apps/api/src/payments/ledger/ledger-notification.service.ts` | ✨ Tạo mới | ⭐ Trung tâm |
| `apps/api/src/payments/ledger/ledger-notification.types.ts` | ✨ Tạo mới | ⭐ Trung tâm |
| `apps/api/src/payments/ledger/ledger.config.ts` | ✏️ Bổ sung config keys | 🟢 Nhẹ |
| `apps/api/src/payments/ledger/ledger.service.ts` | ✏️ Thêm 2 dòng hook sau debit | 🟢 Rất nhẹ |
| `apps/api/src/payments/ledger/ledger.module.ts` | ✏️ Thêm 1 provider | 🟢 Rất nhẹ |
| `apps/api/prisma/schema.prisma` | 📋 Có thể thêm index (optional) | 🟡 Trung bình |
| `apps/api/src/notifications/notification.service.ts` | Không đụng | Không |
| `apps/api/src/payments/e-invoice/invoice-outbox.processor.ts` | Không đụng (tái sử dụng) | Không |

---

## 8. CÁC QUYẾT ĐỊNH KIẾN TRÚC (ARCHITECTURAL DECISION RECORDS)

### ADR-1: Tại sao không gọi NotificationService.deliver() trực tiếp?
- **Quyết định:** Ghi NotificationLog (PENDING) thay vì gọi `NotificationService.deliver()` đồng bộ.
- **Lý do:** 
  - Giữ debit atomic — không block response chờ SMTP
  - Tái sử dụng outbox pattern + retry backoff đã có sẵn
  - Nếu SMTP chậm hoặc lỗi, không ảnh hưởng đến luồng debit
  - Idempotent qua `checkThrottle` — nếu throttle guard pass, log chỉ được ghi 1 lần

### ADR-2: DB-only throttle thay vì Redis?
- **Quyết định:** Query NotificationLog bằng Prisma thay vì dùng cache.
- **Lý do:**
  - Chưa có Redis module; thêm dependency mới cho 1 query là over-engineering
  - Index trên (tenantId, channel, status, createdAt) cover query hoàn toàn
  - 24h window = 1 bản ghi cảnh báo/tenant/ngày → tần suất query thấp
  - Khi hệ thống scale, có thể thêm cache layer mà không đổi interface

### ADR-3: Hook fire-and-forget hay await?
- **Quyết định:** Fire-and-forget (`.catch()` thay vì `await`).
- **Lý do:**
  - Threshold check KHÔNG được block luồng debit
  - Nếu throttle query chậm (DB load), debit vẫn return nhanh
  - Lỗi hook không ảnh hưởng đến kết quả debit

### ADR-4: Một template hardcoded hay NotificationTemplate?
- **Quyết định:** Hardcoded HTML body trong service + option template key.
- **Lý do:**
  - Cảnh báo low-balance là system alert — không cần tenant customize
  - Không cần migration mới cho seed template
  - Vẫn cho phép sau này truyền template key nếu muốn override

---

## 9. KẾ HOẠCH TRIỂN KHAI (NEXT STEPS)

```yaml
steps:
  - id: create-types
    file: apps/api/src/payments/ledger/ledger-notification.types.ts
    estimate: small

  - id: create-service
    file: apps/api/src/payments/ledger/ledger-notification.service.ts
    estimate: medium
    contains:
      - handleThresholdCheck()
      - checkThrottle()
      - dispatchLowBalanceAlert()

  - id: update-config
    file: apps/api/src/payments/ledger/ledger.config.ts
    estimate: tiny

  - id: inject-hook
    file: apps/api/src/payments/ledger/ledger.service.ts
    estimate: tiny
    change: 2 dòng sau debit

  - id: register-module
    file: apps/api/src/payments/ledger/ledger.module.ts
    estimate: tiny

  - id: add-db-index
    file: apps/api/prisma/schema.prisma
    estimate: small
    change: @@index trên NotificationLog

  - id: run-migration
    command: npx prisma migrate dev --name add_notificationlog_alert_index
    estimate: small

  - id: verify-build
    command: npm run build --filter=api
    estimate: small
```

---

## 10. CHECKLIST CHẤT LƯỢNG

- [ ] Hook không block luồng debit
- [ ] Throttle guard chính xác: 1 alert/24h/tenant
- [ ] Dispatcher không ghi NotificationLog nếu không có email tenant
- [ ] Template HTML hiển thị tốt trên email client phổ biến
- [ ] Không tạo NotificationLog trùng do race condition (throttle query bảo vệ)
- [ ] Index mới được verify bằng `EXPLAIN ANALYZE`
- [ ] Build pass với `--filter=api`
- [ ] Config keys được export type-safe
- [ ] Metadata JSON chứa đủ context cho debug

---

> **Trạng thái:** 📄 Bản thiết kế đã hoàn thành. Sẵn sàng chuyển sang triển khai.
> **Lưu ý:** Đây là Phase 3 — tách biệt với critical path Phase 2 hiện tại.

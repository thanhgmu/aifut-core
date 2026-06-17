# WALLET REFUND ENGINE — Bản thiết kế kiến trúc

> **Phase 3 · Internal Wallet Refund Engine & Credit Reversal Service**
> Module: `apps/api/src/payments/ledger`
> Trạng thái: THIẾT KẾ (chưa implement) — chế độ `AIFUT THINK`
> Cập nhật: 2026-06-17
> Tác giả: Minh (Claude) — quét codebase tại commit `b3b4b61`

---

## 0. Bối cảnh & nguyên tắc kế thừa

Refund Engine **không xây mới ledger** — nó tái sử dụng nền tảng đã build pass FULL TURBO:

| Thành phần đã có | Vai trò với Refund |
|---|---|
| `Wallet { balance BigInt, version Int }` | Cộng hoàn trả + optimistic lock CAS |
| `LedgerTransaction` (append-only, `@@unique([tenantId, referenceType, referenceId])`) | Ghi bút toán hoàn tiền + idempotency cứng |
| `LedgerService.creditBalance()` | Cơ chế CREDIT + CAS retry + idempotent sẵn có |
| `LedgerReferenceTypes.REFUND = 'refund'` | Mã phân loại đặc biệt — **đã tồn tại trong `ledger.types.ts`** |
| `PaymentsWebhookService.finalize()` | Khuôn mẫu router webhook Stripe/MoMo bất đồng bộ |
| `PaymentTransaction.status` (có `'refunded'`) | Đồng bộ trạng thái gateway |

**Nguyên tắc bất biến áp dụng:**
1. **Append-only** — không sửa/xóa bút toán gốc; refund là một CREDIT mới đảo dòng.
2. **Idempotent tuyệt đối** — mọi webhook có thể bắn trùng N lần; số dư chỉ biến động đúng 1 lần.
3. **Anti-over-refund** — tổng hoàn ≤ số đã debit tại bút toán gốc.
4. **BigInt-only** — không float, mọi số dư là smallest unit (đồng VND).
5. **Tenant sovereignty** — mọi truy vấn scope theo `tenantId`.

> **Lưu ý kiến trúc lock:** ledger hiện tại dùng **Optimistic Lock (version-CAS)** qua `updateWalletWithCas()`. Yêu cầu Phase 3 là **Row-level Lock (pessimistic, `SELECT ... FOR UPDATE`)** cho luồng refund vì refund phải đọc-rồi-ghi nhiều bảng (LedgerTransaction gốc + sổ refund + Wallet) trong một transaction nhất quán, nơi serialize cứng quan trọng hơn throughput. Thiết kế dưới đây **kết hợp cả hai**: pessimistic lock cho integrity check + ghi refund, vẫn giữ tương thích version-CAS của Wallet (tăng `version` khi update).

---

## 1. Cấu trúc file — TẠO MỚI / CẬP NHẬT

### 1.1. File TẠO MỚI

```
apps/api/src/payments/ledger/
├── ledger-refund.service.ts        ★ Core service — 3 hàm logic chính
├── ledger-refund.types.ts          ★ Types: RefundInput, RefundResult, RefundIntegrity
├── ledger-refund.controller.ts     ★ REST: POST /ledger/refund (manual/admin refund)
└── ledger-refund.guard.ts          ★ Idempotency + role guard cho endpoint refund

apps/api/src/payments/refund/
├── refund-webhook.router.ts        ★ Chuẩn hóa event Stripe/MoMo → RefundInput
└── refund-reconciliation.service.ts ★ Cron đối soát refund treo (PENDING > T)
```

### 1.2. File CẬP NHẬT

```
apps/api/prisma/schema.prisma
  + model RefundRecord            ★ Sổ refund (idempotency key + audit + trạng thái)
  + enum  RefundStatus            ★ PENDING | COMPLETED | REJECTED | OVER_REFUND_BLOCKED

apps/api/src/payments/ledger/ledger.types.ts
  + interface RefundInput / RefundResult (hoặc re-export từ ledger-refund.types.ts)
  + LedgerReferenceTypes.REFUND đã có — KHÔNG đổi

apps/api/src/payments/ledger/ledger.module.ts
  + providers: LedgerRefundService, RefundReconciliationService
  + controllers: LedgerRefundController
  + exports: LedgerRefundService

apps/api/src/payments/payments-webhook.service.ts
  + handleStripeEvent(): nhận 'charge.refunded' / 'refund.updated' → refundRouter
  + handleMomoIpn(): nhận resultCode hoàn tiền → refundRouter

apps/api/src/payments/stripe-webhook.controller.ts
  + route nhánh refund event tới RefundWebhookRouter

apps/api/src/payments/ledger/ledger.config.ts
  + REFUND_CONFIG: maxRefundWindowDays, allowPartialRefund, reconcileIntervalMs
```

---

## 2. Mô hình dữ liệu mới (Prisma)

```prisma
enum RefundStatus {
  PENDING              // đã nhận yêu cầu, chưa ghi sổ xong
  COMPLETED            // đã credit hoàn trả thành công
  REJECTED             // bị từ chối (gateway báo fail / không hợp lệ)
  OVER_REFUND_BLOCKED  // chặn vì vượt số đã debit (anti-over-refund)
}

/// Sổ refund — nguồn sự thật cho idempotency + audit hoàn tiền.
/// Mỗi yêu cầu hoàn tiền (theo gateway refundId) là 1 dòng duy nhất.
model RefundRecord {
  id                  String       @id @default(cuid())
  tenantId            String

  // --- Khóa idempotency ---
  // gateway refundId (Stripe re_xxx / MoMo refundTransId) — duy nhất toàn cục.
  externalRefundId    String
  gateway             String       // 'stripe' | 'momo' | 'manual'

  // --- Truy vết về bút toán gốc đã bị debit ---
  originalReferenceType String     // vd 'invoice'
  originalReferenceId   String     // = referenceId của LedgerTransaction DEBIT gốc
  originalLedgerTxId    String?    // id LedgerTransaction gốc (resolve được thì gắn)

  // --- Số tiền (BigInt, smallest unit) ---
  requestedAmount     BigInt       // số tiền gateway yêu cầu hoàn
  appliedAmount       BigInt       @default(0) // số thực credit vào ví

  // --- Bút toán CREDIT refund được sinh ra ---
  refundLedgerTxId    String?      @unique // id LedgerTransaction(type=CREDIT, ref=refund)

  status              RefundStatus @default(PENDING)
  reason              String?
  metadata            Json?
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt

  tenant              Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // Idempotency cứng: 1 refundId từ 1 gateway chỉ xử lý đúng 1 lần.
  @@unique([gateway, externalRefundId])
  // Truy vấn tổng đã hoàn theo bút toán gốc (anti-over-refund).
  @@index([tenantId, originalReferenceType, originalReferenceId])
  @@index([tenantId, status])
}
```

**Vì sao cần `RefundRecord` riêng thay vì chỉ dựa vào `LedgerTransaction`:**
- `LedgerTransaction` idempotency key là `(tenantId, referenceType, referenceId)`. Nếu lấy `referenceId = externalRefundId` thì đủ chặn ghi sổ trùng, **nhưng** ta cần một bản ghi trung gian giữ trạng thái `PENDING → COMPLETED/REJECTED` (refund gateway là bất đồng bộ, có thể fail sau khi nhận). `RefundRecord` là sổ điều phối; `LedgerTransaction` là bút toán bất biến cuối cùng.
- `RefundRecord` cho phép truy vấn nhanh `SUM(appliedAmount)` theo bút toán gốc → nền tảng cho anti-over-refund.

---

## 3. Ba hàm logic core (chi tiết)

### 3.1. `processRefundCredit()` — Đảo ngược dòng tiền

**Chữ ký:**
```ts
async processRefundCredit(input: RefundInput): Promise<RefundResult>
```

**`RefundInput` (`ledger-refund.types.ts`):**
```ts
interface RefundInput {
  tenantId: string;
  gateway: 'stripe' | 'momo' | 'manual';
  externalRefundId: string;          // idempotency key từ gateway
  originalReferenceType: LedgerReferenceType; // vd 'invoice'
  originalReferenceId: string;       // referenceId của DEBIT gốc
  amount: bigint;                    // số yêu cầu hoàn (BigInt, > 0)
  reason?: string;
  metadata?: Record<string, unknown>;
}
```

**Luồng xử lý (Prisma interactive transaction + Row-level Lock):**

```
processRefundCredit(input):
  1. validateAmount(input.amount)                  // > 0, ≤ maxBalance
  2. FAST-PATH idempotency (ngoài transaction):
       rec = RefundRecord.findUnique({gateway, externalRefundId})
       if rec && rec.status == COMPLETED   → return buildResult(rec, idempotent=true)
       if rec && rec.status == OVER_REFUND_BLOCKED → return blocked result
       // PENDING/REJECTED → cho phép vào transaction xử lý lại an toàn

  3. prisma.$transaction(async tx => {            // interactive, isolation = Serializable
       // --- ROW-LEVEL LOCK trên ví (pessimistic) ---
       // Khóa hàng wallet trước, mọi refund/debit song song của tenant này xếp hàng.
       walletRows = await tx.$queryRaw`
         SELECT id, balance, version
         FROM "Wallet"
         WHERE "tenantId" = ${input.tenantId}
         FOR UPDATE`;
       wallet = walletRows[0] ?? await ensureWallet(tx, input.tenantId, lock=true);

       // --- GỌI INTEGRITY CHECK (mục 3.2) — bên trong cùng lock ---
       integrity = await checkRefundIntegrity(tx, input, lockedWallet=wallet);
       if (!integrity.allowed) {
          upsert RefundRecord {status: OVER_REFUND_BLOCKED, appliedAmount: 0}
          throw OverRefundException(integrity.reason)   // → rollback, ghi sổ blocked riêng
       }
       applied = integrity.allowedAmount;   // = min(requested, remainingRefundable)

       // --- Upsert RefundRecord (PENDING) — chiếm khóa idempotency ---
       refundRec = await tx.refundRecord.upsert({
         where: {gateway_externalRefundId: {...}},
         create: {... status: PENDING, requestedAmount: input.amount},
         update: {status: PENDING}
       });

       // --- Cộng hoàn trả vào Wallet (CREDIT) + giữ version-CAS ---
       newBalance = wallet.balance + applied;          // BigInt
       if (newBalance > LEDGER_CONFIG.maxBalance) throw BadRequest;
       await tx.wallet.update({                          // an toàn vì đã FOR UPDATE
         where: {id: wallet.id},
         data: {balance: newBalance, version: wallet.version + 1}
       });

       // --- Ghi LedgerTransaction CREDIT / ref=REFUND (append-only) ---
       ledgerTx = await tx.ledgerTransaction.create({data: {
         tenantId: input.tenantId,
         type: 'CREDIT',
         amount: applied,
         balanceAfter: newBalance,
         referenceType: LedgerReferenceTypes.REFUND,   // 'refund'
         referenceId: input.externalRefundId,          // idempotency key thứ 2 (DB unique)
         description: `REFUND ⇐ ${input.originalReferenceType}:${input.originalReferenceId}`,
         metadata: {
           classification: 'REFUND',
           gateway: input.gateway,
           originalReferenceId: input.originalReferenceId,
           originalLedgerTxId: integrity.originalLedgerTxId,
           requestedAmount: input.amount.toString(),
           reason: input.reason ?? null,
         },
       }});

       // --- Hoàn tất RefundRecord (COMPLETED) ---
       await tx.refundRecord.update({where:{id: refundRec.id}, data:{
         status: 'COMPLETED', appliedAmount: applied,
         refundLedgerTxId: ledgerTx.id, originalLedgerTxId: integrity.originalLedgerTxId,
       }});

       return {ledgerTxId: ledgerTx.id, applied, balanceAfter: newBalance};
     }, { isolationLevel: 'Serializable', timeout: 15000 });

  4. POST-COMMIT (fire-and-forget):
       - ledgerNotificationService: thông báo "đã hoàn X vào ví"
       - đồng bộ PaymentTransaction.status = 'refunded' (mục 3.3)
  5. return RefundResult{success, ledgerTxId, appliedAmount, balanceAfter, idempotent:false}
```

**Điểm thiết kế then chốt:**
- **Hai lớp idempotency:** (a) `RefundRecord @@unique([gateway, externalRefundId])`, (b) `LedgerTransaction @@unique([tenantId, 'refund', externalRefundId])`. Webhook bắn trùng → lớp (a) trả COMPLETED ngay; nếu race vào transaction → lớp (b) ném `P2002`, bắt lại và trả idempotent (giống pattern `creditBalance` hiện có).
- **Row-level lock** (`FOR UPDATE`) serialize mọi refund/debit cùng tenant → integrity check đọc số dư & tổng đã hoàn trong trạng thái nhất quán, không bị race với debit AI-core interceptor.
- Vẫn **tăng `version`** của Wallet để không phá vỡ optimistic-lock invariant mà các path khác (`debitBalance`) đang dựa vào.
- Refund **không bao giờ** đi qua `debitBalance`; nó là CREDIT thuần với phân loại REFUND.

---

### 3.2. `checkRefundIntegrity()` — Chốt kiểm tra toàn vẹn (anti-over-refund)

**Chữ ký:**
```ts
private async checkRefundIntegrity(
  tx: Prisma.TransactionClient,
  input: RefundInput,
  lockedWallet: WalletRow,
): Promise<RefundIntegrity>
```

**`RefundIntegrity`:**
```ts
interface RefundIntegrity {
  allowed: boolean;
  allowedAmount: bigint;        // số được phép credit (≤ requested)
  originalDebitAmount: bigint;  // tổng đã debit tại bút toán gốc
  alreadyRefunded: bigint;      // tổng đã hoàn trước đó
  remainingRefundable: bigint;  // originalDebit - alreadyRefunded
  originalLedgerTxId: string | null;
  reason?: string;              // lý do khi !allowed
}
```

**Thuật toán:**
```
checkRefundIntegrity(tx, input, lockedWallet):
  // 1) Định vị bút toán DEBIT gốc theo originalReferenceId (idempotency key gốc).
  originalTx = await tx.ledgerTransaction.findUnique({
     where: { tenantId_referenceType_referenceId: {
        tenantId: input.tenantId,
        referenceType: input.originalReferenceType,
        referenceId: input.originalReferenceId } } });

  if (!originalTx)        → {allowed:false, reason:'ORIGINAL_TX_NOT_FOUND'}
  if (originalTx.type !== 'DEBIT')
                          → {allowed:false, reason:'ORIGINAL_NOT_DEBIT'}  // chỉ hoàn cái đã thu

  originalDebit = originalTx.amount;   // BigInt dương

  // 2) Tổng đã hoàn trước đó cho bút toán gốc này (chỉ tính COMPLETED).
  agg = await tx.refundRecord.aggregate({
     _sum: { appliedAmount: true },
     where: {
        tenantId: input.tenantId,
        originalReferenceType: input.originalReferenceType,
        originalReferenceId: input.originalReferenceId,
        status: 'COMPLETED',
        // loại trừ chính refund đang xử lý nếu retry (cùng externalRefundId)
        NOT: { gateway: input.gateway, externalRefundId: input.externalRefundId },
     } });
  alreadyRefunded = agg._sum.appliedAmount ?? 0n;

  remaining = originalDebit - alreadyRefunded;     // BigInt

  // 3) GUARD: không cho hoàn vượt phần còn lại.
  if (remaining <= 0n)
       → {allowed:false, remainingRefundable:0n, reason:'FULLY_REFUNDED'}

  if (input.amount > remaining):
       if (REFUND_CONFIG.allowPartialClamp):
            allowedAmount = remaining        // kẹp về mức tối đa hợp lệ
       else
            → {allowed:false, reason:'OVER_REFUND', remainingRefundable: remaining}
  else:
       allowedAmount = input.amount;

  // 4) (tùy chọn) cửa sổ thời gian hoàn: createdAt gốc trong maxRefundWindowDays.
  if (now - originalTx.createdAt > REFUND_CONFIG.maxRefundWindowDays)
       → {allowed:false, reason:'REFUND_WINDOW_EXPIRED'}

  return {allowed:true, allowedAmount, originalDebitAmount: originalDebit,
          alreadyRefunded, remainingRefundable: remaining,
          originalLedgerTxId: originalTx.id};
```

**Bất biến được bảo vệ:**
- `Σ appliedAmount(refunds COMPLETED của 1 originalReference) ≤ originalDebit`. Bất đẳng thức luôn đúng vì check chạy **bên trong** transaction đã `FOR UPDATE` ví → không có refund song song nào chen vào giữa aggregate và create.
- Toàn bộ phép tính bằng **BigInt** — không sai số.
- Idempotent với chính nó: khi retry cùng `externalRefundId`, mệnh đề `NOT` loại bản ghi của chính nó khỏi `alreadyRefunded`, tránh tự cộng dồn gây false OVER_REFUND.

---

### 3.3. `syncRefundStatus()` — Đồng bộ trạng thái & đấu nối Webhook

**Hai phần:** (A) đồng bộ trạng thái sau refund; (B) router webhook bất đồng bộ Stripe/MoMo.

#### (A) Đồng bộ trạng thái (post-commit, trong `LedgerRefundService`)
```ts
private async syncRefundStatus(refundRec: RefundRecord, result: RefundResult): Promise<void>
```
```
syncRefundStatus:
  1. Cập nhật PaymentTransaction gốc (nếu map được qua originalReferenceId):
       - tìm PaymentTransaction theo invoice/metadata.orderId
       - nếu appliedAmount == originalDebit → status = 'refunded'
       - nếu 0 < applied < originalDebit   → status = 'partially_refunded' (giá trị metadata)
  2. ledgerNotificationService.notifyRefund(tenantId, applied, balanceAfter)
  3. Audit log (enableAuditLog) — append vào audit sink hiện có
  // Tất cả fire-and-forget: lỗi chỉ warning, KHÔNG rollback bút toán đã commit.
```

#### (B) Router Webhook bất đồng bộ (`refund-webhook.router.ts`)

Đấu nối vào `PaymentsWebhookService` đã có — **tái dùng verify chữ ký hiện hữu** (`verifyStripeSignature`, `momoService.verifyIpn`), chỉ thêm nhánh refund:

```
// stripe-webhook.controller → PaymentsWebhookService.handleStripeEvent
REFUND_EVENTS_STRIPE = { 'charge.refunded', 'refund.updated', 'charge.refund.updated' }

handleStripeEvent(event):
  if (REFUND_EVENTS_STRIPE.has(event.type)):
     refundObj = event.data.object;              // charge hoặc refund object
     // chỉ xử lý khi refund đã succeeded
     if (refundObj.status === 'succeeded' || event.type === 'charge.refunded'):
        input = RefundWebhookRouter.fromStripe(event)   // chuẩn hóa → RefundInput
        return ledgerRefundService.processRefundCredit(input)
     return {received:true, refunded:false}

RefundWebhookRouter.fromStripe(event) → RefundInput:
   tenantId              = metadata.tenantId         (bắt buộc — reject nếu thiếu)
   gateway               = 'stripe'
   externalRefundId      = refundObj.id              // re_xxx (idempotency)
   originalReferenceType = metadata.originalReferenceType ?? 'invoice'
   originalReferenceId   = metadata.invoiceId ?? metadata.orderId
   amount                = BigInt(refundObj.amount)  // Stripe trả smallest unit sẵn
   reason                = refundObj.reason
```

```
// MoMo: handleMomoIpn — MoMo refund qua /refund API trả callback resultCode=0
handleMomoIpn(payload):
  if (payload.requestType === 'refund' || payload.transType === 'refund'):
     verify chữ ký (momoService.verifyIpn) — tái dùng
     if (resultCode === 0):
        input = RefundWebhookRouter.fromMomo(payload)
        return ledgerRefundService.processRefundCredit(input)

RefundWebhookRouter.fromMomo(payload) → RefundInput:
   externalRefundId = String(payload.transId)        // MoMo refund transId
   amount           = BigInt(payload.amount)         // VND nguyên → smallest unit
   originalReferenceId = payload.orderId             // map về invoice/order gốc
```

**Tính bất đồng bộ & an toàn webhook:**
- Mọi route refund đi qua **verify chữ ký trước** (đã có sẵn) → chống giả mạo/replay (`STRIPE_TOLERANCE_SEC = 300`).
- Webhook **trả `200` ngay cả khi idempotent/blocked** (received:true) để gateway không retry vô hạn; chỉ trả lỗi 5xx khi thật sự lỗi hệ thống (đáng retry).
- Mọi xử lý số dư nằm sau hàng rào idempotency → webhook bắn trùng tuyệt đối an toàn.
- `RefundReconciliationService` (cron): quét `RefundRecord.status = PENDING` quá ngưỡng → gọi lại gateway query API để chốt COMPLETED/REJECTED, xử lý trường hợp callback mất.

---

## 4. Sơ đồ luồng tổng thể

```
[Stripe/MoMo refund] ──webhook──> [stripe-webhook.controller / momo IPN]
        │ verify signature (đã có)
        ▼
[PaymentsWebhookService] ──refund branch──> [RefundWebhookRouter.fromStripe/fromMomo]
        │ chuẩn hóa → RefundInput
        ▼
[LedgerRefundService.processRefundCredit]
        │  $transaction(Serializable)
        │   ├─ SELECT Wallet ... FOR UPDATE        (row-level lock)
        │   ├─ checkRefundIntegrity()              (anti-over-refund, BigInt)
        │   ├─ RefundRecord.upsert(PENDING)        (idempotency #1)
        │   ├─ Wallet.update(balance+, version++)
        │   ├─ LedgerTransaction.create(CREDIT, ref='refund')  (idempotency #2, append-only)
        │   └─ RefundRecord.update(COMPLETED)
        ▼ post-commit (fire-and-forget)
[syncRefundStatus] → PaymentTransaction.status='refunded' + notify ví + audit
        ▲
[RefundReconciliationService cron] ── quét PENDING treo → query gateway → chốt
```

---

## 5. Ma trận test cần phủ (khi implement)

| Tình huống | Kỳ vọng |
|---|---|
| Webhook refund bắn 3 lần cùng `externalRefundId` | Ví +1 lần duy nhất, 2 lần sau trả `idempotent:true` |
| Hoàn > số đã debit gốc | `OVER_REFUND_BLOCKED`, ví không đổi, RefundRecord ghi blocked |
| Hoàn từng phần nhiều lần, tổng = debit | Cho tới khi `remaining=0`; lần kế tiếp `FULLY_REFUNDED` |
| Refund khi không tìm thấy DEBIT gốc | `ORIGINAL_TX_NOT_FOUND`, reject |
| 2 refund song song cùng tenant | Row-level lock serialize, tổng vẫn ≤ debit |
| Refund của bút toán không phải DEBIT | `ORIGINAL_NOT_DEBIT`, reject |
| Chữ ký webhook sai | Reject trước khi chạm ledger |
| Callback PENDING mất | Cron reconciliation chốt trạng thái |

---

## 6. Checklist triển khai (thứ tự an toàn)

1. `schema.prisma`: thêm `RefundRecord` + `enum RefundStatus` → migration.
2. `ledger-refund.types.ts`: `RefundInput`, `RefundResult`, `RefundIntegrity`.
3. `ledger-refund.service.ts`: 3 hàm core (3.1 → 3.2 → 3.3A).
4. `refund-webhook.router.ts`: `fromStripe` / `fromMomo`.
5. Nối nhánh refund vào `PaymentsWebhookService` (Stripe + MoMo).
6. `ledger-refund.controller.ts` + guard (manual/admin refund).
7. `refund-reconciliation.service.ts` (cron đối soát).
8. `ledger.module.ts`: đăng ký providers/controllers/exports.
9. `ledger.config.ts`: `REFUND_CONFIG`.
10. Test ma trận mục 5 → build FULL TURBO → commit.

> **Tuân thủ AGENTS.md:** thiết kế này KHÔNG tự chạy build/test/migration ngầm. Việc build & `prisma migrate` do người dùng thực thi thủ công (nạp `.env` qua `dotenv -e .env --`).

---

*Kết thúc bản thiết kế — WALLET REFUND ENGINE v1 (THINK mode).*

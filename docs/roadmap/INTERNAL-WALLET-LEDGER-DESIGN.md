# INTERNAL WALLET LEDGER & CREDIT/DEBIT SERVICE — KIẾN TRÚC THIẾT KẾ

> Phase 3 · Backend `apps/api` · Phân hệ `payments/ledger`
> Tác giả: Minh (Claude / aifut-core architect) · Cập nhật: 2026-06-17
> Chế độ: AIFUT THINK (chỉ thiết kế, không viết code thực thi)

---

## 0. BỐI CẢNH & GAP HIỆN TẠI (kết quả quét codebase)

Sau khi quét `apps/api/src` và `apps/api/prisma/schema.prisma`, hiện trạng:

| Thành phần đã có | Vai trò | Khoảng trống (gap) |
|---|---|---|
| `BillingAccount.balance Float` | Đang lưu 1 số dư phẳng trên tài khoản | Không có lịch sử biến động, không atomic, dễ race condition khi nhiều API gọi song song |
| `AiUsageEvent` | Log từng lần gọi AI (token, cost) | Chỉ là log thống kê — **không trừ tiền**, không liên kết với số dư ví |
| `AiBudgetPolicy` | Giới hạn token/budget theo tenant | Chặn theo hạn mức, **không phải trừ tiền thực** |
| `PaymentTransaction` | Giao dịch cổng thanh toán (VNPay/MoMo/Stripe) | Là nạp tiền vào, không phải sổ cái nội bộ ví |

**Kết luận gap:** Hệ thống có thể *nạp tiền vào* (qua VNPay/MoMo) và *đo lường usage* (AiUsageEvent), nhưng **thiếu lớp ví nội bộ (Wallet)** đóng vai trò "single source of truth" về số dư, cùng **sổ cái bất biến (LedgerTransaction)** để đối soát từng đồng và **cơ chế trừ phí atomic** chống ghi đè số dư.

**Nguyên tắc thiết kế cốt lõi:**
1. **Single source of truth = LedgerTransaction (immutable append-only)**. `Wallet.balance` chỉ là materialized cache của tổng ledger, luôn được cập nhật cùng transaction với dòng ledger mới (không bao giờ lệch).
2. **Mọi biến động số dư phải đi qua một dòng ledger.** Không update `balance` trực tiếp ở bất kỳ đâu khác.
3. **Atomicity bắt buộc:** dùng Prisma interactive transaction + Row-level Lock (`SELECT ... FOR UPDATE`) để serialize ghi đồng thời lên cùng một ví.
4. **Idempotency:** mỗi giao dịch trừ/nạp gắn `referenceId` unique để chống double-charge khi retry/replay webhook.
5. **Tenant sovereignty:** ví thuộc về `tenantId`, cô lập tuyệt đối giữa các tenant (nguyên tắc bất biến #1).

---

## 1. CẤU TRÚC FILE — KHỞI TẠO MỚI / CẬP NHẬT

### 1.1. Thư mục mới: `apps/api/src/payments/ledger/`

```
apps/api/src/payments/ledger/
├── ledger.module.ts            # NestJS module, đăng ký service + controller
├── ledger.service.ts           # ★ Core logic: credit/debit/balance/history (atomic)
├── ledger.controller.ts        # ★ REST endpoints: /billing/wallet/*
├── ledger.constants.ts         # Enum LedgerTransactionType, mã lỗi, reason codes
├── ledger.types.ts             # DTO/interface: CreditInput, DebitInput, WalletBalanceView, LedgerHistoryRow
└── dto/
    ├── debit.dto.ts            # Validation class-validator cho request trừ tiền nội bộ
    └── credit.dto.ts           # Validation cho request nạp/hoàn tiền
```

### 1.2. File cập nhật (existing)

| File | Thay đổi |
|---|---|
| `apps/api/prisma/schema.prisma` | Thêm `model Wallet`, `model LedgerTransaction`, `enum LedgerTransactionType`, `enum LedgerEntryStatus`; thêm relation vào `model Tenant` |
| `apps/api/prisma/schema.local.prisma` | Mirror schema cho chế độ SQLite local-first (giữ đồng bộ — lưu ý SQLite **không hỗ trợ `FOR UPDATE`**, xem §3.4) |
| `apps/api/src/billing/billing.service.ts` | `BillingService` ủy quyền tính số dư cho `LedgerService`; **deprecate** việc ghi trực tiếp `BillingAccount.balance` |
| `apps/api/src/payments/payments-webhook.service.ts` | Sau khi nạp tiền thành công (VNPay/MoMo IPN) → gọi `ledger.creditBalance()` thay vì cộng float thủ công |
| `apps/api/src/payments/payments.module.ts` hoặc `app.module.ts` | Import `LedgerModule` |
| Module tiêu thụ AI (workflow/AI executor) | Tại điểm phát sinh chi phí AI → gọi `ledger.debitBalance()` với `referenceId = aiUsageEvent.eventKey` |
| Migration mới | `apps/api/prisma/migrations/<timestamp>_add_internal_wallet_ledger/migration.sql` |

---

## 2. PRISMA SCHEMA — `Wallet` & `LedgerTransaction`

> Quy ước đã có trong repo: `id String @id @default(cuid())`, `tenantId String`, relation `Tenant ... onDelete: Cascade`. Tiền lưu dạng số nguyên **minor unit** (xu/đồng nhỏ nhất) để tránh sai số float — đây là nâng cấp so với `BillingAccount.balance Float` hiện tại.

```prisma
enum LedgerTransactionType {
  CREDIT   // Nạp tiền vào ví (nạp từ cổng TT, hoàn tiền, thưởng, điều chỉnh tăng)
  DEBIT    // Trừ tiền khỏi ví (phí gọi AI, phí dịch vụ, điều chỉnh giảm)
}

enum LedgerEntryStatus {
  POSTED      // Đã ghi sổ, ảnh hưởng số dư (mặc định)
  REVERSED    // Đã bị đảo (hoàn tác) bởi một bút toán đối ứng
  PENDING     // Giữ chỗ (authorization hold) chưa quyết toán — dự phòng tương lai
}

model Wallet {
  id            String   @id @default(cuid())
  tenantId      String   @unique           // mỗi tenant 1 ví chính
  currency      String   @default("VND")
  // Số dư là materialized cache của tổng ledger. Lưu minor-unit (BigInt) chống sai số float.
  balance       BigInt   @default(0)
  // Tổng đã từng nạp / đã từng trừ — phục vụ đối soát nhanh & dashboard
  totalCredited BigInt   @default(0)
  totalDebited  BigInt   @default(0)
  status        String   @default("active") // active | frozen | closed
  version       Int      @default(0)         // optimistic-lock counter (phòng tuyến 2)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  tenant        Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  transactions  LedgerTransaction[]

  @@index([status])
}

model LedgerTransaction {
  id            String                @id @default(cuid())
  walletId      String
  tenantId      String                                  // denormalized: query/đối soát theo tenant không cần join
  transactionType LedgerTransactionType
  amount        BigInt                                  // luôn DƯƠNG; chiều biến động xác định bởi transactionType
  currency      String                @default("VND")
  // Số dư SAU khi áp dụng bút toán này — snapshot bất biến phục vụ audit/đối soát
  balanceAfter  BigInt
  description   String?
  // ★ Khóa idempotency & truy vết nguồn gốc (vd: aiUsageEvent.eventKey, paymentTx.id, refund:<id>)
  referenceId   String
  referenceType String?                                 // 'ai_usage' | 'topup' | 'refund' | 'adjustment' | 'service_fee'
  status        LedgerEntryStatus     @default(POSTED)
  // Liên kết bút toán đảo (nếu có): reversedBy trỏ tới bút toán đối ứng
  reversedById  String?               @unique
  metadata      Json                  @default("{}")
  createdAt     DateTime              @default(now())

  wallet        Wallet                @relation(fields: [walletId], references: [id], onDelete: Cascade)

  // ★ RÀNG BUỘC UNIQUE CHỐNG DOUBLE-CHARGE:
  // cùng một (tenant, referenceType, referenceId) chỉ được ghi sổ MỘT lần.
  @@unique([tenantId, referenceType, referenceId], name: "uq_ledger_idempotency")
  @@index([walletId, createdAt])      // history phân trang theo ví
  @@index([tenantId, createdAt])      // đối soát theo tenant
  @@index([transactionType])
  @@index([referenceId])
}
```

Bổ sung relation ngược trong `model Tenant`:

```prisma
model Tenant {
  // ... các field hiện có ...
  wallet            Wallet?              // 1-1
  ledgerTransactions LedgerTransaction[]
}
```

**Ghi chú ràng buộc chặt:**
- `@@unique([tenantId, referenceType, referenceId])` là tuyến phòng thủ idempotency cấp DB — nếu webhook/retry gửi trùng `referenceId`, lệnh INSERT thứ 2 ném `P2002` (unique constraint) → service bắt và trả về kết quả của giao dịch gốc thay vì trừ tiền lần nữa.
- `balanceAfter` lưu cứng giúp đối soát: duyệt ledger theo `createdAt`, `balanceAfter` của dòng N phải = `balanceAfter` dòng N-1 ± `amount`. Lệch = báo động toàn vẹn.
- `BigInt` minor-unit: VND lưu nguyên đồng (currency 0 chữ số thập phân); USD lưu cents. Tránh hoàn toàn lỗi cộng dồn float của `Float`.

---

## 3. BA HÀM LOGIC CORE

### 3.1. `creditBalance()` — Nạp tiền an toàn (atomic + idempotent)

**Mục đích:** Cộng tiền vào ví khi nạp qua cổng TT, hoàn tiền, thưởng, điều chỉnh.

**Chữ ký:**
```ts
async creditBalance(input: {
  tenantId: string;
  amount: bigint;            // > 0, minor-unit
  referenceId: string;       // idempotency key
  referenceType: string;     // 'topup' | 'refund' | 'adjustment' | ...
  description?: string;
  metadata?: Record<string, unknown>;
}): Promise<LedgerTransaction>
```

**Luồng logic (trong 1 Prisma interactive `$transaction`, isolation `Serializable`):**
1. Validate `amount > 0` → nếu không ném `BadRequestException('amount must be positive')`.
2. Kiểm tra idempotency sớm: `findUnique` theo `uq_ledger_idempotency` → nếu đã tồn tại, trả về bút toán cũ (no-op, an toàn cho retry).
3. **Lock ví:** `SELECT ... FOR UPDATE` (raw, xem §3.3) để serialize với mọi debit/credit đồng thời. Tự tạo ví nếu chưa có (race-safe bằng `upsert` + unique `tenantId`).
4. `newBalance = wallet.balance + amount`.
5. `INSERT LedgerTransaction { type: CREDIT, amount, balanceAfter: newBalance, ... }`.
6. `UPDATE Wallet SET balance = newBalance, totalCredited += amount, version += 1`.
7. Commit. Nếu bước 5 ném `P2002` (trùng referenceId do request song song) → nuốt lỗi, trả về bút toán đã tồn tại.

### 3.2. `debitBalance()` — Trừ phí an toàn ★ (Row-level Lock chống race + chặn âm)

**Mục đích:** Trừ tiền khi tenant gọi API tốn phí (AI call, service fee). Đây là hàm nhạy cảm nhất — phải tuyệt đối chống race condition và chống số dư âm.

**Chữ ký:**
```ts
async debitBalance(input: {
  tenantId: string;
  amount: bigint;            // > 0, minor-unit
  referenceId: string;       // vd aiUsageEvent.eventKey — idempotency key
  referenceType: string;     // 'ai_usage' | 'service_fee' | ...
  description?: string;
  metadata?: Record<string, unknown>;
}): Promise<LedgerTransaction>
```

**Luồng logic (Prisma interactive `$transaction`, `Serializable`, có `timeout`/`maxWait` để tránh lock kẹt):**
```
BEGIN
  1. validate amount > 0
  2. idempotency check: findUnique(uq_ledger_idempotency)
        → nếu tồn tại: return bút toán cũ (KHÔNG trừ lần 2)
  3. ★ ROW-LEVEL LOCK:
        rows = $queryRaw`SELECT id, balance, status FROM "Wallet"
                         WHERE "tenantId" = ${tenantId} FOR UPDATE`
        // FOR UPDATE giữ khóa hàng ví đến hết transaction →
        // mọi debit song song lên cùng ví bị xếp hàng tuần tự, KHÔNG đọc số dư cũ.
  4. nếu không có ví HOẶC status != 'active' → ConflictException('wallet_unavailable')
  5. ★ CHẶN ÂM:
        if (wallet.balance < amount)
            throw new ConflictException('INSUFFICIENT_FUNDS', { balance, required: amount })
  6. newBalance = wallet.balance - amount   // đảm bảo >= 0
  7. INSERT LedgerTransaction { type: DEBIT, amount, balanceAfter: newBalance, referenceId, ... }
  8. UPDATE Wallet SET balance = newBalance, totalDebited += amount, version += 1
            WHERE id = wallet.id   // (kèm version check = phòng tuyến optimistic phụ)
COMMIT
catch P2002 → return bút toán đã tồn tại (idempotent replay)
catch P2034 (serialization/deadlock) → retry tối đa 3 lần với backoff
```

**Vì sao chống được race condition (kịch bản 2 API song song trên ví có 100đ, mỗi request trừ 80đ):**
- Không có lock: cả 2 đọc balance=100, cả 2 thấy đủ tiền, cả 2 trừ → balance sai (20 hoặc -60). **LỖI.**
- Có `FOR UPDATE`: request A khóa hàng ví, trừ còn 20, commit, nhả khóa. Request B lúc này mới đọc được balance=20 (sau khi A commit), thấy 20 < 80 → ném `INSUFFICIENT_FUNDS`. **ĐÚNG.**

### 3.3. Triển khai Row-level Lock với Prisma (lưu ý kỹ thuật)

Prisma Client chưa có API `FOR UPDATE` khai báo, nên dùng `$queryRaw` **bên trong** interactive transaction:
```ts
return this.prisma.$transaction(async (tx) => {
  // Khóa hàng ví; Prisma raw chạy trên cùng connection của transaction → khóa hợp lệ
  const locked = await tx.$queryRaw<Array<{ id: string; balance: bigint; status: string }>>`
    SELECT id, balance, status FROM "Wallet"
    WHERE "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  // ... bước 4-8 dùng tx.ledgerTransaction.create / tx.wallet.update ...
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000, maxWait: 5_000 });
```

### 3.4. Tương thích Local-First (SQLite — `schema.local.prisma`)

SQLite **không hỗ trợ `SELECT ... FOR UPDATE`**. Chiến lược local-mode:
- SQLite ghi tuần tự (database-level write lock) nên race trong tiến trình đơn ít xảy ra; vẫn cần idempotency.
- Fallback: dùng **optimistic locking qua `version`** — `UPDATE Wallet SET balance=?, version=version+1 WHERE id=? AND version=?`; nếu `affectedRows = 0` → có ghi xen → retry đọc lại. Kết hợp `BEGIN IMMEDIATE`.
- `LedgerService` phát hiện provider (Postgres vs SQLite) qua biến môi trường/datasource và chọn nhánh `FOR UPDATE` (PG) hoặc `version-CAS` (SQLite). Cùng một interface công khai.

---

## 4. API ENDPOINTS ĐỐI SOÁT (`ledger.controller.ts`)

Tiền tố `/billing/wallet`. Bảo vệ bằng guard auth + tenant-scope hiện có (lấy `tenantId` từ context, **không** nhận từ client để chống IDOR).

### 4.1. `GET /billing/wallet/balance`
Trả số dư hiện tại + tổng quan đối soát nhanh.
```jsonc
// 200 OK
{
  "tenantId": "tnt_...",
  "currency": "VND",
  "balance": 1250000,            // minor-unit
  "balanceDisplay": "1.250.000₫",
  "totalCredited": 5000000,
  "totalDebited": 3750000,
  "status": "active",
  "asOf": "2026-06-17T02:36:00.000Z"
}
```

### 4.2. `GET /billing/wallet/history`
Lịch sử dòng tiền, phân trang (cursor theo `createdAt,id`), phục vụ đổ lên UI.
Query params: `?limit=50&cursor=<id>&type=DEBIT&referenceType=ai_usage&from=...&to=...`
```jsonc
// 200 OK
{
  "items": [
    {
      "id": "ltx_...",
      "type": "DEBIT",
      "amount": 1500,
      "amountDisplay": "-1.500₫",
      "balanceAfter": 1250000,
      "description": "AI call — gpt-4o-mini",
      "referenceType": "ai_usage",
      "referenceId": "evt_...",
      "status": "POSTED",
      "createdAt": "2026-06-17T02:35:10.000Z"
    }
  ],
  "nextCursor": "ltx_...",
  "hasMore": true
}
```

### 4.3. (Nội bộ — không expose public) `creditBalance` / `debitBalance`
Không phải REST endpoint công khai cho client tự gọi. Được gọi **server-to-server**:
- `creditBalance` ← `payments-webhook.service` sau IPN nạp tiền thành công.
- `debitBalance` ← AI executor / workflow runtime tại điểm phát sinh chi phí.
- (Tùy chọn) `POST /billing/wallet/adjust` chỉ cho ADMIN role (điều chỉnh thủ công, ghi `referenceType:'adjustment'`, bắt buộc `description`).

---

## 5. ĐỐI SOÁT & TOÀN VẸN (Reconciliation)

1. **Bất biến số dư:** `Wallet.balance == SUM(CREDIT.amount) - SUM(DEBIT.amount)` của các dòng `POSTED`. Job định kỳ (cron) đối chiếu — lệch → cảnh báo.
2. **Chuỗi balanceAfter:** duyệt ledger theo thời gian, mỗi dòng `balanceAfter` phải khớp dồn tích → phát hiện chèn/sửa trái phép.
3. **Ledger ↔ AiUsageEvent:** mỗi `AiUsageEvent` tính phí phải có đúng 1 `LedgerTransaction` `referenceType='ai_usage', referenceId=eventKey`. Job đối soát phát hiện usage chưa trừ tiền (rò rỉ doanh thu) hoặc trừ trùng.
4. **Ledger ↔ PaymentTransaction:** mỗi nạp tiền `succeeded` có đúng 1 dòng CREDIT tương ứng.
5. **Append-only:** không `UPDATE`/`DELETE` dòng ledger. Sửa sai = ghi bút toán đảo (`REVERSED` + bút toán đối ứng trỏ qua `reversedById`).

---

## 6. THỨ TỰ TRIỂN KHAI ĐỀ XUẤT (cho lần code thực thi sau)

1. Cập nhật `schema.prisma` + `schema.local.prisma` (Wallet, LedgerTransaction, enums, relation Tenant).
2. Tạo migration `add_internal_wallet_ledger` (chạy thủ công qua `dotenv -e .env -- npx prisma migrate dev` — **do người dùng chạy tay** theo Điều 1 AGENTS.md).
3. `ledger.constants.ts` + `ledger.types.ts` + DTO.
4. `ledger.service.ts`: `creditBalance` → `debitBalance` (FOR UPDATE + chặn âm + idempotency + retry P2034) → `getBalance` → `getHistory`.
5. `ledger.controller.ts` + `ledger.module.ts`; wire vào `AppModule`.
6. Tích hợp điểm gọi: webhook nạp tiền → `creditBalance`; AI executor → `debitBalance`.
7. Migrate dữ liệu: backfill `Wallet` từ `BillingAccount.balance` hiện có (1 bút toán CREDIT `referenceType='migration'` mỗi tenant), rồi deprecate field cũ.
8. Cron đối soát toàn vẹn (§5).

---

## 7. RỦI RO & QUYẾT ĐỊNH CẦN XÁC NHẬN

| Vấn đề | Đề xuất | Cần Thành quyết? |
|---|---|---|
| `Float → BigInt` minor-unit | Nên đổi để chống sai số tiền tệ | Có — ảnh hưởng migration `BillingAccount.balance` cũ |
| Đa tiền tệ trong 1 ví | Giai đoạn 1: mỗi tenant 1 ví 1 currency cố định | Có thể mở rộng đa-ví sau |
| Authorization hold (`PENDING`) | Đã chừa enum, chưa triển khai | Để Phase sau |
| SQLite không có `FOR UPDATE` | Fallback optimistic `version` CAS | Đã có hướng |

---

*Hết bản thiết kế. Không có thay đổi mã nguồn thực thi nào được thực hiện trong phiên THINK này — chỉ tạo tài liệu thiết kế.*

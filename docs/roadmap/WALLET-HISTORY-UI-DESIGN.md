# Wallet Ledger History UI & Refund Portal — Thiết kế kiến trúc giao diện

> **Thuộc Phase 3 (Operator Ready) — Phân hệ Frontend `apps/web`**
> Backend Refund Engine đã build pass FULL TURBO và commit thành công.
> Tài liệu này định hình cấu trúc file, API contract binding, vùng hiển thị
> và luồng dữ liệu cho Giao diện Lịch sử ví và Cổng hoàn tiền.

---

## Mục lục

1. [Tổng quan & Vị trí UI](#1-tổng-quan--vị-trí-ui)
2. [Cấu trúc file](#2-cấu-trúc-file)
3. [API Contract Backend hiện có](#3-api-contract-backend-hiện-có)
4. [Khu vực 1: Wallet Balance Widget](#4-khu-vực-1-wallet-balance-widget)
5. [Khu vực 2: Ledger Transaction List](#5-khu-vực-2-ledger-transaction-list)
6. [Khu vực 3: Refund Request Modal](#6-khu-vực-3-refund-request-modal)
7. [Luồng dữ liệu tổng thể](#7-luồng-dữ-liệu-tổng-thể)
8. [Trạng thái UI & Xử lý lỗi](#8-trạng-thái-ui--xử-lý-lỗi)
9. [Checklist triển khai](#9-checklist-triển-khai)

---

## 1. Tổng quan & Vị trí UI

Giao diện Wallet & Refund Portal được đặt dưới route `/billing/wallet`
trong route group `(dashboard)`:

```
apps/web/app/(dashboard)/billing/
├── layout.tsx                     ← Server Component layout (đã tồn tại)
├── page.tsx                       ← Server Component entry (đã tồn tại, dashboard tổng)
└── wallet/
    ├── layout.tsx                 ← Server Component layout mới (kế thừa dark theme)
    └── page.tsx                   ← Server Component entry mới → WalletClientShell
```

Thành phần:

| File / Route | Vai trò |
|---|---|
| `app/(dashboard)/billing/wallet/layout.tsx` | Layout con cho /billing/wallet (metadata, padding) |
| `app/(dashboard)/billing/wallet/page.tsx` | Server Component entry, render `<WalletClientShell />` |
| `components/billing/wallet-client-shell.tsx` | Client orchestration shell (loading/ready/error) |
| `components/billing/wallet-balance-card.tsx` | Widget số dư + nạp tiền + gửi refund |
| `components/billing/wallet-history-table.tsx` | Bảng lịch sử với cursor pagination + filter type |
| `components/billing/refund-request-modal.tsx` | Modal gửi yêu cầu hoàn tiền |
| `types/wallet.ts` | Type definitions cho wallet UI |
| `lib/wallet.ts` | API helper functions cho wallet/ledger/refund |
| `lib/format.ts` | Format utilities (nếu chưa có) hoặc mở rộng `lib/billing.ts` |

---

## 2. Cấu trúc file

### 2.1. Route page — `app/(dashboard)/billing/wallet/page.tsx`

```tsx
// Server Component
// dynamic = "force-dynamic" (luôn fetch dữ liệu mới)
// Render: header + <WalletClientShell />
```

### 2.2. Route layout — `app/(dashboard)/billing/wallet/layout.tsx`

```tsx
// Kế thừa dark theme (#0b1020 background)
// Metadata: title "Wallet & Refund · AIFUT"
// Container: maxWidth 1040px
```

### 2.3. Shell chính — `components/billing/wallet-client-shell.tsx`

```
"use client"

State machine: loading → ready | empty | error

Trạng thái:
  loading:  PanelMessage tone="muted" "Loading wallet…"
  error:    PanelMessage tone="error" + Retry button
  empty:    PanelMessage tone="muted" "No wallet data yet"
  ready:    <WalletBalanceCard /> + <WalletHistoryTable />
```

### 2.4. Types mới — `types/wallet.ts`

```ts
// ─── Wallet Info ─────────────────────────────────────
export interface WalletInfo {
  tenantId: string;
  balance: string;          // BigInt as string (e.g. "150000")
  currency: string;         // "VND"
  status: 'active' | 'locked';
}

// ─── Ledger Transaction ──────────────────────────────
export type LedgerTxTypeUI = 'CREDIT' | 'DEBIT';
export type LedgerRefTypeUI =
  | 'invoice' | 'payout' | 'commission' | 'topup'
  | 'refund' | 'adjustment' | 'affiliate_commission'
  | 'affiliate_payout' | 'reseller_commission' | 'system_credit';

export interface LedgerTransactionItem {
  id: string;
  type: LedgerTxTypeUI;
  amount: string;            // BigInt as string
  balanceAfter: string;      // BigInt as string
  referenceType: LedgerRefTypeUI;
  referenceId: string;
  description: string | null;
  createdAt: string;         // ISO string
}

export interface LedgerHistoryResponse {
  items: LedgerTransactionItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── Refund ──────────────────────────────────────────
export interface RefundRequestPayload {
  originalReferenceId: string;
  amount: number;            // VND, positive
  description?: string;
}

export interface RefundResponse {
  success: boolean;
  refundRecordId: string;
  transactionId: string;
  amount: string;
  status: string;
  error?: string;
}

export interface RefundIntegrityResult {
  pass: boolean;
  originalAmount: string;
  totalRefunded: string;
  requestedAmount: string;
  remainingAvailable: string;
  details: string[];
}

// ─── Wallet Dashboard View-Model ─────────────────────
export interface WalletDashboardData {
  wallet: WalletInfo;
  history: LedgerTransactionItem[];
  nextCursor: string | null;
  hasMore: boolean;
  typeFilter?: LedgerTxTypeUI;
}
```

### 2.5. Lib mới — `lib/wallet.ts`

```ts
// Tập hợp các API call cho wallet/ledger/refund
// Dùng chung API_BASE + getStoredToken từ lib/auth.ts

export async function fetchWalletBalance(): Promise<WalletInfo | null>
  // GET /billing/wallet/balance
  // Headers: Authorization Bearer <token>

export async function fetchWalletHistory(
  opts: { cursor?: string; limit?: number; type?: LedgerTxTypeUI }
): Promise<LedgerHistoryResponse>
  // GET /billing/wallet/history?cursor=&limit=&type=
  // Headers: Authorization Bearer <token>

export async function checkRefundIntegrity(
  payload: RefundRequestPayload
): Promise<RefundIntegrityResult>
  // POST /billing/refund/check
  // Headers: Authorization Bearer <token>

export async function submitRefundRequest(
  payload: RefundRequestPayload
): Promise<RefundResponse>
  // POST /billing/refund/request
  // Headers: Authorization Bearer <token>

// ─── Format helpers ──────────────────────────────────

/** Format BigInt string → human-readable VND (e.g. "150.000₫") */
export function formatWalletAmount(amount: string): string
  // Input:  "150000"
  // Output: "150.000₫"

/** Format BigInt string → compact (e.g. "1,5tr", "500k") */
export function compactWalletAmount(amount: string): string

/** Format ISO date → "14/06/2026 09:30" */
export function formatLedgerDate(iso: string): string

/** Map referenceType → human-readable label + icon */
export function referenceTypeMeta(type: LedgerRefTypeUI): { label: string; icon: string; color: string }

/** Map CREDIT/DEBIT → color + sign */
export function txTypeMeta(type: LedgerTxTypeUI): { sign: '+' | '−'; color: string; bgColor: string }
```

---

## 3. API Contract Backend hiện có

Các API sau đã tồn tại và build pass, frontend chỉ việc kết nối:

| Endpoint | Method | Dữ liệu gửi | Dữ liệu nhận | Ghi chú |
|---|---|---|---|---|
| `/billing/wallet/balance` | GET | — (auth context) | `{ tenantId, balance: string, currency: "VND" }` | Anti-IDOR. Cần thêm trường `status` nếu muốn locked. **Tạm thời mặc định active.** |
| `/billing/wallet/history` | GET | `?cursor=&limit=&type=` | `{ items[], nextCursor, hasMore }` | Cursor pagination, limit 1-100 (mặc định 20) |
| `/billing/refund/check` | POST | `{ originalReferenceId, amount, description? }` | `{ pass, originalAmount, totalRefunded, requestedAmount, remainingAvailable, details[] }` | Chỉ đọc, pre-check |
| `/billing/refund/request` | POST | `{ originalReferenceId, amount, description? }` | `{ success, refundRecordId, transactionId, amount, status }` | Ghi CREDIT wallet, anti-over-refund |

> ⚠️ Lưu ý: Backend trả BigInt dạng string trong trường `amount` và `balance`.
> Frontend cần format lại trước khi hiển thị.

---

## 4. Khu vực 1: Wallet Balance Widget

**Component:** `components/billing/wallet-balance-card.tsx`

### 4.1. Layout & Bố cục

```
┌─────────────────────────────────────────────────────────────┐
│  VÍ ĐIỆN TỬ (caption)                                        │
│                                                              │
│  150.000₫                          [● Active]               │
│  Số dư khả dụng                                              │
│                                                              │
│  ┌─────────────┐  ┌─────────────────────┐                    │
│  │ 💳 Nạp tiền  │  │ ↩️ Yêu cầu hoàn trả │                  │
│  └─────────────┘  └─────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2. Thành phần UI

| Element | Loại | Mô tả |
|---|---|---|
| Caption | `<div>` | "VÍ ĐIỆN TỬ" — uppercase, 11px, color #9fb0ff |
| Balance | `<span>` | Font 36px, bold 800, white. Format: `formatWalletAmount(balance)` |
| Sub-label | `<div>` | "Số dư khả dụng" — 13px, color #c8d2ff |
| Status pill | `<span>` | Badge: "Active" (#80e0a0) / "Locked" (#ff6b6b) |
| Nút Nạp tiền | `<button>` | Link đến `/payment` hoặc mở modal top-up |
| Nút Hoàn trả | `<button>` | Mở `<RefundRequestModal />` |

### 4.3. Props

```ts
interface WalletBalanceCardProps {
  wallet: WalletInfo;
  onRefundClick: () => void;  // mở modal
}
```

### 4.4. Style token

```ts
const STYLE = {
  wrapper: {
    padding: 24,
    borderRadius: 20,
    background: "linear-gradient(135deg, rgba(109,124,255,0.12), rgba(109,124,255,0.03))",
    border: "1px solid rgba(109,124,255,0.2)",
  },
  btnTopup: {
    padding: "12px 20px",
    borderRadius: 12,
    background: "#6d7cff",
    color: "white", fontWeight: 700, border: "none", cursor: "pointer",
  },
  btnRefund: {
    padding: "12px 20px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.05)",
    color: "#c8d2ff", fontWeight: 700, border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
  },
};
```

---

## 5. Khu vực 2: Ledger Transaction List

**Component:** `components/billing/wallet-history-table.tsx`

### 5.1. Layout & Bố cục

```
┌─────────────────────────────────────────────────────────────┐
│  LỊCH SỬ GIAO DỊCH  [CREDIT ▼]  [Tải thêm ↓]              │
├─────────────────────────────────────────────────────────────┤
│  MÃ GD      LOẠI     SỐ TIỀN     SỐ DƯ SAU   NGÀY    MÔ TẢ │
├─────────────────────────────────────────────────────────────┤
│  abc123  + CREDIT   +50.000₫     150.000₫   14/06   Nạp... │
│  def456  − DEBIT    −30.000₫     100.000₫   13/06   Thanh.. │
│  ghi789  + CREDIT   +80.000₫     130.000₫   12/06   Hoàn... │
│  ...                                                         │
│                                                              │
│  [< Trang trước]  Trang 1  [Trang sau >]                    │
│  Đang hiển thị 15/42 giao dịch                               │
└─────────────────────────────────────────────────────────────┘
```

### 5.2. Các thành phần

| Sub-component | File | Vai trò |
|---|---|---|
| TxTypeBadge | (inline) | Hiển thị +CREDIT (xanh) / −DEBIT (đỏ) với icon |
| ReferenceTypeChip | (inline) | Badge nhỏ: "Hoàn tiền", "Nạp VNPay", "Hoa hồng" |
| PaginationBar | (inline) | Nút Previous/Next, đếm items, cursor state |

### 5.3. Props

```ts
interface WalletHistoryTableProps {
  items: LedgerTransactionItem[];
  nextCursor: string | null;
  hasMore: boolean;
  typeFilter?: LedgerTxTypeUI;
  onLoadMore: (cursor: string) => Promise<void>;
  onFilterChange: (type?: LedgerTxTypeUI) => void;
  loading?: boolean;
}
```

### 5.4. State nội bộ

```ts
const [filter, setFilter] = useState<LedgerTxTypeUI | ''>('');
const [items, setItems] = useState<LedgerTransactionItem[]>([]);
const [cursor, setCursor] = useState<string | null>(null);
const [hasMore, setHasMore] = useState(true);
const [loading, setLoading] = useState(false);
```

### 5.5. Cursor Pagination Flow

```
1. Initial load: fetchWalletHistory({ limit: 15 })
   → setItems(result.items), setCursor(result.nextCursor), setHasMore(result.hasMore)

2. Load More: onClick → fetchWalletHistory({ cursor, limit: 15 })
   → setItems(prev => [...prev, ...result.items]), setCursor(result.nextCursor)

3. Filter change: onClick(type)
   → setItems([]), setCursor(null), setHasMore(true)
   → fetchWalletHistory({ type: filter, limit: 15 })

4. No more pages: hasMore = false → disable "Tải thêm" button
```

### 5.6. Định dạng dòng

| Cột | Nội dung | Style |
|---|---|---|
| Mã GD | `tx.id` (cắt 8 ký tự đầu + "...") | monospace, color #9fb0ff, 12px |
| Loại | `+ CREDIT` / `− DEBIT` | CREDIT: #80e0a0 bold; DEBIT: #ff6b6b bold |
| Số tiền | `formatWalletAmount(amount)` | như trên + prefix +/− |
| Số dư sau | `formatWalletAmount(balanceAfter)` | color #c8d2ff |
| Ngày | `formatLedgerDate(createdAt)` | color #9fb0ff, 13px |
| Mô tả | `description` + `referenceTypeChip` | description normal, chip mini |

---

## 6. Khu vực 3: Refund Request Modal

**Component:** `components/billing/refund-request-modal.tsx`

### 6.1. Bố cục Modal

```
┌─────────────────────────────────────────────────┐
│  YÊU CẦU HOÀN TIỀN                          [✕] │
├─────────────────────────────────────────────────┤
│                                                 │
│  Mã giao dịch gốc *                              │
│  ┌─────────────────────────────────────────┐    │
│  │ [PAY-********]                          │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Số tiền hoàn (VND) *                           │
│  ┌─────────────────────────────────────────┐    │
│  │ 50.000                                   │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Lý do hoàn tiền                                │
│  ┌─────────────────────────────────────────┐    │
│  │ Khách hàng yêu cầu hủy đơn hàng...       │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  ┌────────────────────────────────────────────┐ │
│  │ ✅ Kiểm tra tính hợp lệ            (pre)  │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  Kết quả kiểm tra:                              │
│  • Giao dịch gốc: 150.000₫                      │
│  • Đã hoàn: 0₫                                  │
│  • Khả dụng: 150.000₫                           │
│  • ✅ Anti-over-refund: PASS                    │
│                                                 │
│  ┌─────────────┐  ┌──────────────────────┐      │
│  │   Hủy bỏ    │  │  ✅ Gửi yêu cầu      │      │
│  └─────────────┘  └──────────────────────┘      │
└─────────────────────────────────────────────────┘
```

### 6.2. State nội bộ & Client-side validation

```ts
interface RefundFormData {
  originalReferenceId: string;
  amount: string;          // input string, parse → number → BigInt
  description: string;
}

interface RefundFormErrors {
  originalReferenceId?: string;
  amount?: string;
  general?: string;
}

// State machine
type FormPhase =
  | 'idle'           // form sạch, sẵn sàng nhập
  | 'checking'       // đang gọi POST /billing/refund/check
  | 'checked_ok'     // integrity pass, nút Submit sáng
  | 'checked_fail'   // integrity fail, show lỗi chi tiết
  | 'submitting'     // đang gọi POST /billing/refund/request
  | 'success'        // hoàn tiền thành công
  | 'error';         // lỗi không recover được
```

### 6.3. Validation Rules

```
originalReferenceId:
  - required, non-empty string
  - nếu bỏ trống → "Vui lòng nhập mã giao dịch gốc"

amount:
  - required, parsable number
  - > 0 → "Số tiền phải lớn hơn 0"
  - nếu > balance → "Số tiền không được vượt quá số dư"
  - phải là số nguyên (không có phần nghìn/thập phân)

description:
  - optional, max 500 ký tự
  - nếu > 500 → "Lý do hoàn tiền không quá 500 ký tự"
```

### 6.4. Flow submit an toàn (Client-side guard)

```
1. User nhập form
2. User click "Kiểm tra tính hợp lệ"
   → Client validations cơ bản (required, positive, integer)
   → POST /billing/refund/check
   → Show integrity result panel
3. Nếu pass → nút "Gửi yêu cầu" enabled
4. User click "Gửi yêu cầu"
   → POST /billing/refund/request
   → Nếu 200: modal → success state + refresh wallet/ledger
   → Nếu 4xx: show lỗi từ backend (anti-over-refund, invalid tx)
   → Nếu 5xx: show "Lỗi hệ thống, vui lòng thử lại sau"
```

### 6.5. Anti-over-refund visual indicator

Kết quả từ `POST /billing/refund/check` hiển thị thanh progress:

```
┌─────────────────────────────────────────────────┐
│  Đã hoàn: 30.000₫ / 150.000₫                    │
│  ████████████░░░░░░░░░░░░░░░░  20%              │
│  Còn lại: 120.000₫                               │
└─────────────────────────────────────────────────┘
```

### 6.6. Props

```ts
interface RefundRequestModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;    // refresh wallet/ledger sau khi thành công
}
```

---

## 7. Luồng dữ liệu tổng thể

### 7.1. Sơ đồ luồng

```
/billing/wallet/page.tsx (RSC)
  └─ <WalletClientShell /> (client)
       ├─ useEffect → fetchWalletBalance() + fetchWalletHistory()
       │    ├─ GET /billing/wallet/balance
       │    └─ GET /billing/wallet/history?limit=15
       │
       ├─ <WalletBalanceCard wallet={data.wallet} onRefundClick={openModal} />
       │
       ├─ <WalletHistoryTable
       │     items={data.history}
       │     nextCursor={data.nextCursor}
       │     hasMore={data.hasMore}
       │     onLoadMore={loadMore}
       │     onFilterChange={handleFilter}
       │  />
       │
       └─ <RefundRequestModal
             open={modalOpen}
             onClose={closeModal}
             onSuccess={handleRefundSuccess}  // refresh cả wallet + history
           />
            ├─ integrity check → POST /billing/refund/check
            └─ submit refund  → POST /billing/refund/request
```

### 7.2. Data refresh sau refund

```ts
async function handleRefundSuccess() {
  // 1. Close modal
  // 2. Refresh wallet balance
  const wallet = await fetchWalletBalance();
  // 3. Reset history (load page 1 mới)
  const history = await fetchWalletHistory({ limit: 15 });
  // 4. Update state
  setData({ wallet, ...history });
}
```

---

## 8. Trạng thái UI & Xử lý lỗi

### 8.1. Wallet Balance Card

| Trạng thái | Hiển thị |
|---|---|
| Loading | Card skeleton (animated shimmer: 36px bar + 2 button placeholders) |
| Loaded | Số dư + status pill + 2 nút action |
| Error | Card tone error + "Không thể tải số dư. [Thử lại]" |
| Balance = 0 | Số dư "0₫" + không disabled, vẫn cho nạp |
| Wallet locked | Badge "Locked" (#ff6b6b) + disabled nút Refund |

### 8.2. Ledger Transaction List

| Trạng thái | Hiển thị |
|---|---|
| Loading (initial) | 5 skeleton rows (shimmer) |
| Loaded có data | Table đầy đủ |
| Loaded không data | Empty state: "Chưa có giao dịch nào" + icon |
| Error load | Retry button |
| Loading more (append) | Spinner nhỏ ở cuối table ("Đang tải thêm…") |
| No more pages | "Đã hiển thị tất cả" (text nhỏ, disabled load-more) |
| Filter active + empty | "Không có giao dịch {type} nào" |

### 8.3. Refund Request Modal

| Trạng thái | Hiển thị |
|---|---|
| idle | Form trống, nút "Kiểm tra" enabled, "Gửi" disabled |
| checking | Nút "Kiểm tra" → spinner + "Đang kiểm tra…" |
| checked_ok | Panel green: "✅ Hợp lệ" + thanh progress + nút "Gửi" enabled |
| checked_fail | Panel red: chi tiết lỗi integrity (anti-over-refund) |
| submitting | Nút "Gửi" → spinner + "Đang xử lý…", form disabled |
| success | Panel green: "✅ Hoàn tiền thành công!" + nút "Đóng" |
| error (network) | Panel red: "Lỗi kết nối, vui lòng thử lại" |
| error (validation) | Inline errors dưới từng field |

---

## 9. Checklist triển khai

### Phase A — Types & Lib (nền tảng)

- [ ] `types/wallet.ts` — tất cả interface
- [ ] `lib/wallet.ts` — 4 API functions + format helpers
- [ ] `lib/format.ts` hoặc mở rộng `lib/billing.ts` — formatWalletAmount, compactWalletAmount, referenceTypeMeta, txTypeMeta

### Phase B — Wallet Shell & Balance Card

- [ ] `app/(dashboard)/billing/wallet/layout.tsx` — layout con
- [ ] `app/(dashboard)/billing/wallet/page.tsx` — server entry
- [ ] `components/billing/wallet-client-shell.tsx` — orchestration
- [ ] `components/billing/wallet-balance-card.tsx` — widget số dư

### Phase C — Ledger History Table

- [ ] `components/billing/wallet-history-table.tsx` — table component
  - [ ] Header + filter type dropdown
  - [ ] Row render (tx code, type badge, amount, date, description)
  - [ ] Cursor load-more button
  - [ ] Type filter logic
  - [ ] Loading skeleton / empty / error states

### Phase D — Refund Request Modal

- [ ] `components/billing/refund-request-modal.tsx` — modal component
  - [ ] Form UI (originalReferenceId, amount, description)
  - [ ] Client-side validation
  - [ ] Integrity check flow (POST /billing/refund/check)
  - [ ] Submit flow (POST /billing/refund/request)
  - [ ] Success callback (refresh wallet + history)
  - [ ] Anti-over-refund progress visual
  - [ ] Form phase state machine (7 trạng thái)
  - [ ] Modal overlay + animation

### Phase E — Integration & Edge Cases

- [ ] Kết nối WalletClientShell vào route
- [ ] Test cursor pagination với empty result / 1 page / many pages
- [ ] Test filter type: all, CREDIT, DEBIT
- [ ] Test refund integrity pass → submit → refresh
- [ ] Test refund integrity fail (over-refund)
- [ ] Test 401/403 → redirect login
- [ ] Test network error → retry
- [ ] Test wallet balance 0
- [ ] Cross-browser / responsive (mobile: balance card + table stack)

---

## Phụ lục A: Mối quan hệ với kiến trúc hiện tại

### A.1. Các file cần TẠO MỚI (10 files)

```
apps/web/
├── app/(dashboard)/billing/wallet/
│   ├── layout.tsx
│   └── page.tsx
├── components/billing/
│   ├── wallet-client-shell.tsx
│   ├── wallet-balance-card.tsx
│   ├── wallet-history-table.tsx
│   └── refund-request-modal.tsx
├── types/
│   └── wallet.ts
└── lib/
    └── wallet.ts
```

### A.2. Các file cần CẬP NHẬT (0 files — pure additive)

Tất cả đều là file mới. Không sửa file hiện tại.

### A.3. Backend API đã có (dùng lại, không sửa)

| File backend | Endpoint |
|---|---|
| `apps/api/src/payments/ledger/ledger.controller.ts` | `GET /billing/wallet/balance`, `GET /billing/wallet/history` |
| `apps/api/src/payments/ledger/ledger-refund.controller.ts` | `POST /billing/refund/request`, `POST /billing/refund/check` |

### A.4. Style pattern nhất quán (kế thừa từ billing dashboard)

```
Nền:      #0b1020
Chữ:      #f5f7ff / #c8d2ff / #9fb0ff
Accent:   #6d7cff (nút, link)
Border:   rgba(255,255,255,0.06) / rgba(109,124,255,0.2)
Border radius: 12px–20px
Padding:  22–24px
Font:     Arial, sans-serif (kế thừa từ layout)
```

Inline styles (`React.CSSProperties`) — giữ pattern hiện tại của codebase, không dùng CSS modules hay Tailwind trong module này.

---

> **Tác giả:** Claude (phân tích dựa trên codebase backend Refund Engine + billing frontend pattern)
> **Trạng thái:** DESIGN COMPLETE — sẵn sàng phase execution
> **Kế tiếp:** Sau khi Thành duyệt → chạy AIFUT GO để implement toàn bộ 10 files

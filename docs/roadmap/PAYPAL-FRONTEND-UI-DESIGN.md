# PayPal Frontend UI Design — Payment Buttons & Currency Portal

> **Phase 3 (Operator Ready) — Frontend apps/web**
> Ngày: 2026-06-17
> Module: `apps/web` (Next.js 16 App Router)
> Backend API tương ứng: `apps/api/src/payments/paypal/`

---

## I. MỤC TIÊU

Xây dựng giao diện Nạp tiền quốc tế qua PayPal Smart Buttons cho phép người dùng:

1. Nhập số tiền VND muốn nạp vào Ví Ledger
2. Xem tỷ giá quy đổi USD/VND thực tế (bao gồm spread cấu hình)
3. Thanh toán qua PayPal Smart Buttons (Popup) với luồng `createOrder` → `onApprove`
4. Xem trạng thái thanh toán (Loading / Success / Cancel / Error) theo State Machine

**Thay thế hoàn toàn** `app/payment/page.tsx` cũ (demo form thô) bằng luồng chuyên biệt.

---

## II. CẤU TRÚC FILE

### 2.1. Route mới

```
apps/web/app/(dashboard)/billing/paypal/
├── layout.tsx          # Server Component — metadata, layout shell
└── page.tsx            # Server Component — force-dynamic, render <PayPalTopupShell />
```

**Giải thích:** Route `GET /billing/paypal` được đặt trong route group `(dashboard)` để kế thừa theme và layout chung. Không tạo route con vì toàn bộ luồng (nhập số tiền → chọn phương thức → xác nhận → kết quả) là single-page UI.

### 2.2. Component tree mới

```
apps/web/components/billing/
├── paypal-topup-shell.tsx          # [NEW] Client Shell — State Machine orchestrator
├── paypal-topup-form.tsx           # [NEW] Form input số tiền + nút "Nạp qua PayPal"
├── paypal-buttons.tsx              # [NEW] PayPal Smart Buttons wrapper (createOrder / onApprove)
├── paypal-exchange-rate-card.tsx   # [NEW] Exchange Rate Widget (USD/VND + spread)
├── paypal-status-screen.tsx        # [NEW] Payment Status Screen (State Machine panels)
└── paypal-provider.tsx             # [NEW] React Context: API helper + state management
```

### 2.3. File types mới

```
apps/web/types/
└── paypal.ts                       # [NEW] TypeScript interfaces cho PayPal top-up UI
```

### 2.4. File lib mới

```
apps/web/lib/
└── paypal.ts                       # [NEW] API helpers (create-paypal-order, verify, get-fx-rate)
```

---

## III. KIẾN TRÚC STATE MACHINE

### 3.1. Các phase (ShellPhase)

```
   ┌──────────┐
   │  FORM    │ ← Người dùng nhập số tiền, xem tỷ giá, click "Nạp qua PayPal"
   └────┬─────┘
        │
   ┌────▼─────┐
   │ LOADING  │ ← PayPal SDK loading, create-order in flight
   └────┬─────┘
        │
   ┌────▼──────┐
   │  BUTTONS  │ ← PayPal Smart Buttons render (createOrder → onApprove)
   └────┬──────┘
        │  ┌─────────┐      ┌──────────┐
        ├──► SUCCESS  │  or  │  CANCEL   │
        │  └─────────┘      └──────────┘
        │  ┌──────────┐
        └──►  ERROR   │
           └──────────┘
```

### 3.2. TypeScript type

```typescript
type PayPalTopupPhase =
  | "form"        // Màn hình nhập số tiền + tỷ giá
  | "loading"     // Đang tạo order / load SDK
  | "buttons"     // PayPal Smart Buttons đã sẵn sàng
  | "success"     // Thanh toán thành công
  | "cancel"      // Người dùng hủy trên PayPal Popup
  | "error";      // Lỗi (network / server / PayPal)
```

### 3.3. Context state shape

```typescript
interface PayPalTopupState {
  phase: PayPalTopupPhase;
  vndAmount: bigint;            // Số VND user muốn nạp (smallest unit * 100)
  usdAmount: string;            // Số USD PayPal sẽ charge (decimal string)
  fxRate: number;               // Tỷ giá hiện tại (VND per 1 USD)
  spreadRate: number;           // Spread cấu hình (vd: 0.01 = 1%)
  fiatReceived: string;         // Số VND thực nhận sau spread (BigInt string)
  paypalOrderId: string | null; // PayPal Order ID (7XH...)
  approvalUrl: string | null;   // URL approve (fallback cho popup-blocked)
  errorMessage: string | null;  // Thông báo lỗi
  transactionId: string | null; // Internal PaymentTransaction ID
  countdown: number;            // Auto-redirect countdown (success screen)
}
```

---

## IV. KHU VỰC 1 — Bộ nút bấm thông minh PayPal (Smart Buttons Component)

### 4.1. File: `paypal-buttons.tsx`

**Mô tả:** Component gốc tích hợp PayPal JS SDK theo phương pháp Client-side REST. Load SDK động qua `<script>` tag khi component mount, sau đó gọi `paypal.Buttons()`.

**Luồng xử lý:**

```
┌─────────────────────────────────────────────────────────────────┐
│ paypal-buttons.tsx                                              │
│                                                                 │
│  1. componentDidMount:                                          │
│     - Gọi loadPayPalSDK(clientId, currency)                     │
│     - Inject <script src="https://www.paypal.com/sdk/js       │
│         ?client-id={clientId}                                   │
│         &currency=USD&intent=capture" />                        │
│     - Promise-based loader (onload / onerror)                   │
│                                                                 │
│  2. SDK ready → paypal.Buttons({                                │
│       createOrder: () =>                                        │
│         fetch POST /payments/paypal/create-order                │
│           body: { amount, orderId, returnUrl, cancelUrl }       │
│         → return paypalOrderId                                  │
│                                                                 │
│       onApprove: (data) =>                                      │
│         → gọi verify GET /payments/paypal/verify/{orderId}      │
│         → nếu success → setPhase("success")                     │
│         → nếu pending → retry 3× (cách 2s) → fallback verify   │
│                                                                 │
│       onCancel: () =>                                           │
│         → setPhase("cancel")                                    │
│                                                                 │
│       onError: (err) =>                                         │
│         → setPhase("error")                                     │
│     }).render('#paypal-button-container')                       │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2. API contract với backend

| Thao tác | Endpoint | Method | Request Body | Response (success) |
|---|---|---|---|---|
| Tạo order | `/payments/paypal/create-order` | POST | `{ orderId, amount, currency, description, returnUrl, cancelUrl }` | `{ success, data: { paypalOrderId, approvalUrl, orderId, amount, currency } }` |
| Xác minh | `/payments/paypal/verify/:paypalOrderId` | GET | — | `{ success, data: { paypalOrderStatus, captureStatus, reconciled, grossAmount, netAmount } }` |

### 4.3. Xử lý edge cases

- **Popup blocked:** Hiển thị fallback link `approvalUrl` và hướng dẫn click thủ công.
- **SDK load fail:** Show error + nút "Thử lại", không crash UI.
- **createOrder timeout (15s):** Gọi lại tối đa 2 lần, nếu fail thì setPhase("error").
- **onApprove nhưng webhook chưa kịp:** Retry verify mỗi 2s × 3 lần, sau đó gọi `/payments/paypal/reconcile`.
- **Double-click:** Disable nút ngay sau click đầu tiên.

---

## V. KHU VỰC 2 — Thẻ hiển thị tỷ giá quy đổi (Exchange Rate Widget)

### 5.1. File: `paypal-exchange-rate-card.tsx`

**Mô tả:** Widget hiển thị bảng tính tỷ giá USD/VND sống động, cập nhật real-time khi người dùng thay đổi số tiền.

**Layout:**

```
┌──────────────────────────────────────────────┐
│  💱 TỶ GIÁ NẠP TIỀN                       │
│                                              │
│  Số tiền nạp:     [ 1.000.000 ₫    ]       │
│                                              │
│  ┌──────┬──────────┬──────────┬───────────┐ │
│  │      │ Tỷ giá   │ Số USD   │ Spread    │ │
│  │      │ gốc      │ charge   │ (1%)      │ │
│  ├──────┼──────────┼──────────┼───────────┤ │
│  │ USD  │ 25.400   │ $40,00  │ $0,40     │ │
│  │ VND  │ —        │ —        │ -40.000₫ │ │
│  └──────┴──────────┴──────────┴───────────┘ │
│                                              │
│  ═══════════════════════════════════════════ ►
│  Số dư sau nạp: 900.000₫ + 960.000₫        │
│  (1.860.000₫)                                │
│                                              │
│  💡 Phí spread 1% được áp dụng cho giao     │
│     dịch quốc tế qua PayPal.                │
└──────────────────────────────────────────────┘
```

### 5.2. Công thức tính

```typescript
// Inputs:
const vndAmount = 1_000_000n;       // 1.000.000 VND (smallest unit * 100)
const fxRate = 25_400;               // Tỷ giá VND/USD gốc từ server
const spreadRate = 0.01;             // 1% spread từ PAYPAL_SPREAD_RATE

// Bước 1: Tính USD charge (chưa spread)
//   usdRaw = vndAmount / fxRate × (1 + spreadRate)
//   = 1.000.000 / 25.400 × 1.01 ≈ 0.039763... → $39,76
//   → Làm tròn đến 2 chữ số thập phân (unit scale = 100)

// Bước 2: Spread riêng
//   spreadAmount = vndAmount × spreadRate
//   = 1.000.000 × 0.01 = 10.000 VND (= 10.000₫ mất đi do spread)

// Bước 3: Số VND thực nhận vào Ledger
//   vndReceived = vndAmount × (1 - spreadRate)
//   = 1.000.000 × 0,99 = 990.000 VND
//
//   ====> Số dư wallet tăng thêm: 990.000₫
//   ====> User trả qua PayPal: ~$39,76 USD

// Bước 4: Hiển thị chi tiết
//   Bảng quy đổi:
//     USD gốc:         $39,37    (= 1.000.000 / 25.400)
//     Spread (1%):     $0,39     (= $39,37 × 0,01)
//     USD charge:      $39,76    (= $39,37 × 1,01)
//     Spread (VND):    -10.000₫  (= 1.000.000 × 0,01)
//     VND nhận được:   990.000₫  (= 1.000.000 × 0,99)
```

### 5.3. Nguồn tỷ giá

**Chiến lược 2 lớp:**

| Lớp | Nguồn | Cache | Fallback |
|---|---|---|---|
| **Lớp 1** | Server endpoint mới: `GET /payments/paypal/fx-rate` | 5 phút | Sang lớp 2 |
| **Lớp 2** | Client-side fetch từ free API (exchangerate-api.com) | 10 phút | Hardcode 25.400 |

Server endpoint `GET /payments/paypal/fx-rate` trả về:
```json
{
  "fxRate": 25400,
  "spreadRate": 0.01,
  "spreadLabel": "1%",
  "currencyPair": "USD/VND",
  "updatedAt": "2026-06-17T10:00:00Z",
  "source": "open-exchange-rates"
}
```

### 5.4. Input validation

| Điều kiện | Hành vi |
|---|---|
| `vndAmount < 10.000` | Ẩn nút "Nạp qua PayPal", hiển thị "Số tiền tối thiểu: 10.000₫" |
| `vndAmount > 100.000.000` | Cảnh báo "Giao dịch lớn, vui lòng liên hệ admin" + vẫn cho phép |
| `vndAmount % 1000 !== 0` | Tự động làm tròn xuống bội số của 1.000₫ |
| `walletBalance === "locked"` | Ẩn hoàn toàn form, hiển thị "Ví đang bị khóa" |

---

## VI. KHU VỰC 3 — Khối điều phối trạng thái nạp tiền (Payment Status Screen)

### 6.1. File: `paypal-status-screen.tsx`

**Các màn hình State Machine:**

#### 6.1.1. Phase: `loading`

```
┌──────────────────────────────────────┐
│                                      │
│         🔄 ĐANG XỬ LÝ               │
│                                      │
│     Đang kết nối cổng thanh toán    │
│     PayPal...                        │
│                                      │
│     ┌──────────────────────────┐     │
│     │  ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░  │     │
│     │  35%                     │     │
│     └──────────────────────────┘     │
│                                      │
│     Vui lòng không đóng trang       │
│                                      │
└──────────────────────────────────────┘
```

**Nội dung:**
- Spinner (CSS animation hoặc shimmer tương tự `WalletClientShell`)
- Thanh progress bar (ước lượng: 0→50% loading SDK, 50→70% createOrder, 70→100% render buttons)
- Text "Vui lòng không đóng trang này"
- Nút **"Hủy"** (chỉ active khi phase === "loading" và chưa gửi createOrder)

#### 6.1.2. Phase: `success`

```
┌──────────────────────────────────────┐
│          ✅ NẠP TIỀN THÀNH CÔNG      │
│                                      │
│   ┌──────────────────────────────┐   │
│   │  ● ● ● ● ● ● ● ● ● ● ● ●   │   │
│   │   Số dư đã được cập nhật     │   │
│   └──────────────────────────────┘   │
│                                      │
│   Số tiền nạp:   +990.000₫          │
│   Số dư hiện tại: 1.860.000₫        │
│   Mã giao dịch: AIFUT-PP-20260617   │
│                                      │
│   Tự động chuyển về Ví sau 5s...     │
│                                      │
│   ┌──────────────┐ ┌──────────────┐  │
│   │  Về Ví       │ │  Xem hóa đơn │  │
│   └──────────────┘ └──────────────┘  │
│                                      │
└──────────────────────────────────────┘
```

**Nội dung:**
- Icon checkmark animation (CSS keyframes scale + opacity)
- Số tiền nạp (màu xanh `#80e0a0`, dấu +)
- Số dư mới (lấy từ `GET /billing/wallet/balance` sau confirm)
- Mã giao dịch (copy-able)
- Countdown timer (5s) → auto-redirect về `/billing/wallet`
- 2 nút hành động: "Về Ví" và "Xem hóa đơn"

#### 6.1.3. Phase: `cancel`

```
┌──────────────────────────────────────┐
│          ↩️ ĐÃ HỦY GIAO DỊCH         │
│                                      │
│   Bạn đã hủy thanh toán qua PayPal.  │
│   Không có khoản phí nào bị trừ.     │
│                                      │
│   ┌──────────────────────────────┐   │
│   │    Nạp tiền lại              │   │
│   └──────────────────────────────┘   │
│                                      │
└──────────────────────────────────────┘
```

#### 6.1.4. Phase: `error`

```
┌──────────────────────────────────────┐
│          ❌ NẠP TIỀN THẤT BẠI        │
│                                      │
│   {errorMessage}                     │
│                                      │
│   ┌──────────────┐ ┌──────────────┐  │
│   │  Thử lại     │ │  Liên hệ hỗ  │  │
│   │              │ │  trợ         │  │
│   └──────────────┘ └──────────────┘  │
│                                      │
└──────────────────────────────────────┘
```

**Mã lỗi frontend mapping:**

| Lỗi backend | Màn hình | Gợi ý hành động |
|---|---|---|
| `PayPal gateway chưa được cấu hình` | error | Liên hệ admin |
| `amount must be a positive number` | error (validation) | Kiểm tra số tiền nhập |
| `Không lấy được token xác thực PayPal` | error | Thử lại sau 30s |
| Network timeout | error | Kiểm tra kết nối + Thử lại |
| SDK load fail | error | Tải lại trang |
| `PAYPAL_CURRENCY mismatch` | error | Chọn USD (PayPal chỉ hỗ trợ USD) |
| verify pending > 3 retry | error → warning | Giao dịch đang xử lý, kiểm tra Ví sau |

---

## VII. ORCHESTRATOR — Client Shell (`paypal-topup-shell.tsx`)

### 7.1. Luồng tổng thể

```
┌─────────────────────────────────────────────────────────────────────┐
│ paypal-topup-shell.tsx                                              │
│                                                                     │
│  State: PayPalTopupState  (useState + useCallback)                  │
│  Phase: PayPalTopupPhase   (form → loading → buttons → terminal)   │
│                                                                     │
│  Render theo phase:                                                 │
│    form    → <PaypalTopupForm /> + <PaypalExchangeRateCard />       │
│    loading → <PaypalStatusScreen phase="loading" />                 │
│    buttons → <PaypalButtons />                                      │
│    success → <PaypalStatusScreen phase="success" />                 │
│    cancel  → <PaypalStatusScreen phase="cancel" />                  │
│    error   → <PaypalStatusScreen phase="error" />                   │
│                                                                     │
│  Hooks:                                                             │
│    - usePaypalOrder(): tạo order, quản lý retry                     │
│    - usePaypalVerification(): verify + reconcile sau onApprove      │
│    - useWalletRefresh(): fetch balance sau success                  │
│    - useAutoRedirect(dest, delay): countdown + navigate             │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2. Props interface

```typescript
interface PayPalTopupShellProps {
  // Không có props — mọi state đều nội bộ
  // Hoặc: onBalanceUpdated?: (newBalance: string) => void
}
```

---

## VIII. SERVER COMPONENT — Route Entry

### 8.1. `app/(dashboard)/billing/paypal/layout.tsx`

```typescript
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Nạp tiền PayPal · AIFUT",
  description: "Nạp tiền vào Ví Ledger qua PayPal Smart Buttons.",
};

export default function PayPalTopupLayout({ children }: { children: ReactNode }) {
  return <div style={{ paddingTop: 4 }}>{children}</div>;
}
```

### 8.2. `app/(dashboard)/billing/paypal/page.tsx`

```typescript
import { PayPalTopupShell } from "../../../../components/billing/paypal-topup-shell";

export const dynamic = "force-dynamic";

export default function PayPalTopupPage() {
  return (
    <>
      <header style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1 }}>
          AIFUT Billing
        </div>
        <h1 style={{ fontSize: 36, margin: "8px 0 4px" }}>Nạp tiền quốc tế</h1>
        <p style={{ color: "#c8d2ff", fontSize: 16, margin: 0 }}>
          Nạp tiền vào Ví Ledger bằng USD qua PayPal. Hỗ trợ thẻ tín dụng/quốc tế.
        </p>
      </header>
      <PayPalTopupShell />
    </>
  );
}
```

---

## IX. FILE `types/paypal.ts` — Type Definitions

```typescript
// ─────────────── Phases ───────────────
export type PayPalTopupPhase =
  | "form"
  | "loading"
  | "buttons"
  | "success"
  | "cancel"
  | "error";

// ─────────────── Exchange Rate ─────────
export interface PayPalFxRate {
  fxRate: number;           // VND per 1 USD (e.g. 25400)
  spreadRate: number;       // 0.01 = 1%
  spreadLabel: string;      // "1%"
  currencyPair: string;     // "USD/VND"
  updatedAt: string;        // ISO string
  source: string;           // "open-exchange-rates"
}

// ─────────────── Create Order ─────────
export interface PayPalCreateOrderPayload {
  orderId: string;
  amount: string;           // BigInt as string (VND * 100)
  currency: string;         // "USD"
  description: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface PayPalCreateOrderResponse {
  success: boolean;
  data?: {
    paypalOrderId: string;
    approvalUrl: string;
    orderId: string;
    amount: string;
    currency: string;
  };
  error?: string;
}

// ─────────────── Verify ───────────────
export interface PayPalVerifyResponse {
  success: boolean;
  data?: {
    paypalOrderId: string;
    paypalOrderStatus: string;
    captureStatus?: string;
    reconciled: boolean;
    grossAmount?: string;
    netAmount?: string;
    currency?: string;
  };
  error?: string;
}

// ─────────────── UI State ─────────────
export interface PayPalTopupState {
  phase: PayPalTopupPhase;
  vndInput: string;                     // Raw user input (e.g. "1.000.000")
  vndBigInt: bigint;                    // Parsed BigInt (e.g. 1000000n)
  usdCharge: string;                    // USD charge (e.g. "39.76")
  vndReceived: string;                  // VND actually credited after spread
  fxRate: PayPalFxRate | null;
  paypalOrderId: string | null;
  approvalUrl: string | null;
  orderId: string | null;               // AIFUT internal order ID
  errorMessage: string | null;
  currentBalance: string | null;        // After success refresh
  countdown: number;
}
```

---

## X. FILE `lib/paypal.ts` — API Helpers

```typescript
import { API_BASE, getStoredToken } from "./auth";
import type {
  PayPalFxRate,
  PayPalCreateOrderPayload,
  PayPalCreateOrderResponse,
  PayPalVerifyResponse,
} from "../types/paypal";
import { generateOrderId } from "./order-id"; // TBD

function authHeaders(json = false): Record<string, string> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

// ── GET /payments/paypal/fx-rate ───────────────────────
export async function fetchPayPalFxRate(): Promise<PayPalFxRate> {
  const res = await fetch(`${API_BASE}/payments/paypal/fx-rate`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    // Fallback: 25.400 với spread 1%
    return {
      fxRate: 25400,
      spreadRate: 0.01,
      spreadLabel: "1%",
      currencyPair: "USD/VND",
      updatedAt: new Date().toISOString(),
      source: "fallback-hardcoded",
    };
  }
  return res.json();
}

// ── POST /payments/paypal/create-order ──────────────────
export async function createPayPalOrder(
  vndAmount: bigint,
  fxRate: number,
  spreadRate: number,
): Promise<PayPalCreateOrderResponse> {
  // Tính USD charge = vndAmount / fxRate * (1 + spreadRate)
  const usdRaw = (Number(vndAmount) / fxRate) * (1 + spreadRate);
  const usdCharge = Math.round(usdRaw * 100) / 100; // 2 decimal places

  const payload: PayPalCreateOrderPayload = {
    orderId: generateOrderId(),
    amount: vndAmount.toString(),
    currency: "USD",
    description: `Nạp tiền Ví AIFUT (${vndAmount.toString()} VND ~ $${usdCharge.toFixed(2)} USD)`,
    returnUrl: `${window.location.origin}/billing/paypal`,
    cancelUrl: `${window.location.origin}/billing/paypal`,
  };

  const res = await fetch(`${API_BASE}/payments/paypal/create-order`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });

  return res.json();
}

// ── GET /payments/paypal/verify/:orderId ────────────────
export async function verifyPayPalOrder(
  paypalOrderId: string,
  retries = 3,
  delayMs = 2000,
): Promise<PayPalVerifyResponse> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(
      `${API_BASE}/payments/paypal/verify/${paypalOrderId}`,
      { headers: authHeaders(), cache: "no-store" },
    );
    const data: PayPalVerifyResponse = await res.json();

    if (data.success && data.data?.reconciled) {
      return data;
    }

    if (i < retries - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Last attempt → reconcile
  const res = await fetch(
    `${API_BASE}/payments/paypal/reconcile`,
    {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ paypalOrderId }),
    },
  );
  return res.json();
}

// ── POST /payments/paypal/reconcile (fallback) ──────────
export async function reconcilePayPalOrder(
  paypalOrderId: string,
): Promise<PayPalVerifyResponse> {
  const res = await fetch(`${API_BASE}/payments/paypal/reconcile`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ paypalOrderId }),
  });
  return res.json();
}

// ── Helper: generate internal order ID ──────────────────
function generateOrderId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PP-${ts}${rand}`;
}
```

---

## XI. FILE `components/billing/paypal-provider.tsx` — React Context

```typescript
"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { PayPalTopupPhase, PayPalTopupState, PayPalFxRate } from "../../types/paypal";
import { fetchPayPalFxRate, createPayPalOrder, verifyPayPalOrder } from "../../lib/paypal";
import { fetchWalletBalance } from "../../lib/wallet";

interface PayPalTopupContextValue {
  state: PayPalTopupState;
  setVndAmount: (raw: string) => void;
  startPayment: () => Promise<void>;
  onApprove: (paypalOrderId: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
  reset: () => void;
  refreshBalance: () => Promise<void>;
}

const DEFAULT_STATE: PayPalTopupState = {
  phase: "form",
  vndInput: "",
  vndBigInt: 0n,
  usdCharge: "0.00",
  vndReceived: "0",
  fxRate: null,
  paypalOrderId: null,
  approvalUrl: null,
  orderId: null,
  errorMessage: null,
  currentBalance: null,
  countdown: 5,
};

const PayPalTopupCtx = createContext<PayPalTopupContextValue | null>(null);

export function PayPalTopupProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PayPalTopupState>(DEFAULT_STATE);

  const setVndAmount = useCallback((raw: string) => {
    // Parse + validate → update vndInput, vndBigInt, usdCharge, vndReceived
    // khi fxRate đã có
  }, [state.fxRate]);

  const startPayment = useCallback(async () => {
    setState(prev => ({ ...prev, phase: "loading", errorMessage: null }));

    try {
      // 1. Fetch FX rate nếu chưa có
      let fxRate = state.fxRate;
      if (!fxRate) {
        fxRate = await fetchPayPalFxRate();
        setState(prev => ({ ...prev, fxRate }));
      }

      // 2. Tính toán & tạo order
      const result = await createPayPalOrder(
        state.vndBigInt,
        fxRate.fxRate,
        fxRate.spreadRate,
      );

      if (!result.success || !result.data) {
        setState(prev => ({
          ...prev,
          phase: "error",
          errorMessage: result.error ?? "Không thể tạo đơn hàng PayPal",
        }));
        return;
      }

      // 3. Chuyển sang phase buttons
      setState(prev => ({
        ...prev,
        phase: "buttons",
        paypalOrderId: result.data!.paypalOrderId,
        approvalUrl: result.data!.approvalUrl,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        phase: "error",
        errorMessage: err instanceof Error ? err.message : "Lỗi kết nối",
      }));
    }
  }, [state.fxRate, state.vndBigInt]);

  const onApprove = useCallback(async (paypalOrderId: string) => {
    // 1. Verify + retry
    const verifyResult = await verifyPayPalOrder(paypalOrderId);

    if (verifyResult.success && verifyResult.data?.reconciled) {
      // 2. Refresh wallet balance
      const wallet = await fetchWalletBalance();

      setState(prev => ({
        ...prev,
        phase: "success",
        currentBalance: wallet?.balance ?? null,
      }));

      // 3. Start countdown auto-redirect
    } else {
      setState(prev => ({
        ...prev,
        phase: "error",
        errorMessage: verifyResult.error ?? "Không thể xác nhận giao dịch",
      }));
    }
  }, []);

  const onCancel = useCallback(() => {
    setState(prev => ({ ...prev, phase: "cancel" }));
  }, []);

  const onError = useCallback((message: string) => {
    setState(prev => ({ ...prev, phase: "error", errorMessage: message }));
  }, []);

  const reset = useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const wallet = await fetchWalletBalance();
      if (wallet) {
        setState(prev => ({ ...prev, currentBalance: wallet.balance }));
      }
    } catch {
      // Silent
    }
  }, []);

  return (
    <PayPalTopupCtx.Provider
      value={{ state, setVndAmount, startPayment, onApprove, onCancel, onError, reset, refreshBalance }}
    >
      {children}
    </PayPalTopupCtx.Provider>
  );
}

export function usePayPalTopup(): PayPalTopupContextValue {
  const ctx = useContext(PayPalTopupCtx);
  if (!ctx) throw new Error("usePayPalTopup must be used within PayPalTopupProvider");
  return ctx;
}
```

---

## XII. THỨ TỰ IMPLEMENT (Build Order)

| Bước | File | Mô tả | Phụ thuộc |
|---|---|---|---|
| **1** | `types/paypal.ts` | Định nghĩa type | — |
| **2** | `lib/paypal.ts` | API helpers (fetch fx-rate, create-order, verify, reconcile) | Bước 1 |
| **3** | `paypal-exchange-rate-card.tsx` | Widget tỷ giá + form input | Bước 1, Bước 2 |
| **4** | `paypal-status-screen.tsx` | 4 màn hình trạng thái (loading/success/cancel/error) | Bước 1 |
| **5** | `paypal-buttons.tsx` | PayPal SDK loader + Smart Buttons wrapper | Bước 2 |
| **6** | `paypal-provider.tsx` | React Context state machine | Bước 1–5 |
| **7** | `paypal-topup-shell.tsx` | Client Shell — orchestrate tất cả component | Bước 3–6 |
| **8** | Route: `billing/paypal/layout.tsx` | Server Component layout | — |
| **9** | Route: `billing/paypal/page.tsx` | Server Component page | Bước 7, Bước 8 |
| **10** | _(tùy chọn)_ Backend: `GET /payments/paypal/fx-rate` | Endpoint tỷ giá server | — |

---

## XIII. BACKEND DEPENDENCY — FX Rate Endpoint

Hiện tại backend chưa có endpoint tỷ giá riêng. Cần bổ sung:

**File mới hoặc mở rộng:** `apps/api/src/payments/paypal/paypal.controller.ts`

```typescript
@Get('fx-rate')
async getFxRate(): Promise<{
  fxRate: number;
  spreadRate: number;
  spreadLabel: string;
  currencyPair: string;
  updatedAt: string;
  source: string;
}> {
  const spreadRate = resolveSpreadRate();
  const fxRate = await this.fetchExchangeRate(); // USD/VND từ API ngoài
  return {
    fxRate,
    spreadRate,
    spreadLabel: `${(spreadRate * 100).toFixed(0)}%`,
    currencyPair: 'USD/VND',
    updatedAt: new Date().toISOString(),
    source: 'open-exchange-rates', // hoặc cache
  };
}
```

**Cache strategy:** Lưu fxRate trong memory 5 phút (dùng Map đơn giản hoặc cache-manager) để tránh gọi API ngoài quá thường xuyên.

**API nguồn gợi ý:**
- `https://open.er-api.com/v6/latest/USD` (free, no key, ~1.400 requests/tháng)
- `https://api.exchangerate-api.com/v4/latest/USD` (free, 1.500 requests/tháng)
- Cache local 5 phút hoặc env var `PAYPAL_FX_RATE_OVERRIDE` để dev/test

---

## XIV. TÍCH HỢP VÀO NAVIGATION

### 14.1. Billing Dashboard — Thêm link

Trong `app/(dashboard)/billing/page.tsx`, thêm card/link:

```typescript
<Link
  href="/billing/paypal"
  style={{
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "10px 18px",
    borderRadius: 10,
    background: "rgba(0,150,255,0.12)",
    border: "1px solid rgba(0,150,255,0.25)",
    color: "#0096ff",
    fontWeight: 700,
    fontSize: 14,
    textDecoration: "none",
  }}
>
  🌍 Nạp tiền quốc tế →
</Link>
```

### 14.2. Wallet Balance Card — Nút "Nạp tiền" redirect

Trong `wallet-balance-card.tsx`, `onTopupClick` đã có sẵn. Cần connect:

```typescript
// Trong WalletClientShell:
const handleTopupClick = useCallback(() => {
  window.location.href = "/billing/paypal";
}, []);
```

---

## XV. TÓM TẮT

| Khu vực | File | Server/Client | Dòng ước tính |
|---|---|---|---|
| **Route** | `billing/paypal/layout.tsx` | Server | ~20 |
| **Route** | `billing/paypal/page.tsx` | Server | ~40 |
| **Types** | `types/paypal.ts` | Shared | ~80 |
| **Lib** | `lib/paypal.ts` | Client | ~130 |
| **Provider** | `paypal-provider.tsx` | Client | ~160 |
| **Exchange Rate** | `paypal-exchange-rate-card.tsx` | Client | ~180 |
| **Status Screens** | `paypal-status-screen.tsx` | Client | ~200 |
| **Smart Buttons** | `paypal-buttons.tsx` | Client | ~200 |
| **Shell** | `paypal-topup-shell.tsx` | Client | ~80 |
| **Tổng** | **9 file** | | **~1.090 dòng** |

**Tổng quan flow:**

```
User mở /billing/paypal
  → Server Component layout.tsx + page.tsx render <PayPalTopupShell />
    → Shell đọc PayPalFxRate từ Provider
      → Phase "form": <PaypalExchangeRateCard /> (input + bảng tỷ giá)
        → User nhập số tiền → setVndAmount() → tính USD charge + VND received real-time
        → Click "Nạp qua PayPal"
          → Phase "loading": <PaypalStatusScreen phase="loading" />
            → createPayPalOrder() → POST /payments/paypal/create-order
              → Phase "buttons": <PaypalButtons />
                → SDK load → render Smart Buttons
                  → User click PayPal Popup → approve
                    → onApprove → verifyPayPalOrder (retry × 3)
                      → Phase "success": <PaypalStatusScreen phase="success" />
                        → refreshBalance() → balance UI
                        → countdown 5s → redirect /billing/wallet
```

---

*End of design document. Khi implement xong cần kiểm tra các edge case: popup blocked, SDK timeout, webhook chậm, double-click, wallet locked. Tất cả 9 file phải build pass `npm run build` trước khi commit.*

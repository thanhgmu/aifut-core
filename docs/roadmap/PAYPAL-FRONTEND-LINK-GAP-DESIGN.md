# PayPal Frontend Link Gap Design — Kết nối luồng dòng tiền thực tế

> **Mục tiêu:** Vá dứt điểm các gaps liên kết dòng tiền giữa Frontend và Backend,
> đưa Practical Phase 2 tiệm cận mốc **95%**.
>
> Ngày: 2026-06-18 | Phiên bản: v1.0
> Trạng thái: **Thiết kế — chờ AIFUT GO**

---

## Mục lục

I. [Tổng quan gaps](#i-tổng-quan-gaps)
II. [Gap 1 — Backend: GET /payments/paypal/fx-rate](#ii-gap-1--backend-get-paymentspaypalfx-rate)
III. [Gap 2 — Frontend: Billing Dashboard Nav](#iii-gap-2--frontend-billing-dashboard-nav)
IV. [Gap 3 — Frontend: Wallet Balance Card → Topup Redirect](#iv-gap-3--frontend-wallet-balance-card--topup-redirect)
V. [Đồ thị liên kết luồng dòng tiền hoàn chỉnh](#v-đồ-thị-liên-kết-luồng-dòng-tiền-hoàn-chỉnh)
VI. [Files cần sửa / tạo](#vi-files-cần-sửa--tạo)
VII. [Thứ tự implement](#vii-thứ-tự-implement)

---

## I. Tổng quan gaps

### 1.1 Phát hiện từ code audit (2026-06-18)

| STT | Gap | Module | Mức độ |
|-----|-----|--------|--------|
| **G1** | Thiếu endpoint `GET /payments/paypal/fx-rate` | Backend `paypal.controller.ts` | 🔴 Critical |
| **G2** | Billing Dashboard thiếu link đến `/billing/paypal` | Frontend `billing-client-shell.tsx` | 🟡 Medium |
| **G3** | Billing Dashboard thiếu link đến `/billing/analytics` | Frontend `billing-client-shell.tsx` | 🟢 Nice-to-have |
| **G4** | `WalletBalanceCard` không wired `onTopupClick` → redirect | Frontend `wallet-client-shell.tsx` | 🔴 Critical |
| **G5** | `WalletBalanceCard` thiếu handler topup ngay cả khi được gọi | Frontend `wallet-client-shell.tsx` | 🔴 Critical |

### 1.2 Hiện trạng codebase

**Backend — paypal.controller.ts hiện có:**
- `POST /payments/paypal/create-order` ✅
- `POST /payments/paypal/webhook` ✅
- `GET /payments/paypal/verify/:paypalOrderId` ✅
- `POST /payments/paypal/reconcile` ✅
- `GET /payments/paypal/return` ✅
- **`GET /payments/paypal/fx-rate` ❌ — chưa có**

**Backend — paypal.fx.service.ts hiện có:**
- `PayPalFxService` đã được định nghĩa, có logic fetch tỷ giá 2 tầng:
  - Tầng 1: Gọi API ngoài (open.er-api.com hoặc exchangerate-api.com)
  - Tầng 2: Cache 5 phút trong memory
  - Tầng 3: Fallback về `PAYPAL_USD_VND_RATE` (env) → 25400
- Nhưng **chưa có controller endpoint nào gọi đến service này**

**Frontend — billing-client-shell.tsx:**
- Có card "Quản lý gói cước" → `/billing/subscription`
- ⚠️ **Không có link đến `/billing/paypal`** (PayPal topup)
- ⚠️ **Không có link đến `/billing/analytics`** (AI Analytics dashboard)

**Frontend — wallet-client-shell.tsx:**
- `WalletBalanceCard` nhận props `{ wallet, onRefundClick, onTopupClick? }`
- `WalletClientShell` **chỉ truyền `onRefundClick`**, không truyền `onTopupClick`
- Không có handler nào redirect sang `/billing/paypal`

**Frontend — wallet-balance-card.tsx:**
- Đã có cấu trúc component sẵn sàng, props interface đã có `onTopupClick?`
- **Không render nút "Nạp tiền" khi `onTopupClick` không được truyền**

---

## II. Gap 1 — Backend: GET /payments/paypal/fx-rate

### 2.1 Endpoint specification

| Thuộc tính | Giá trị |
|---|--------|
| **Method** | `GET` |
| **Route** | `/payments/paypal/fx-rate` |
| **Controller Method** | `getFxRate()` |
| **Auth** | Tenant JWT (sử dụng `@UseGuards(JwtAuthGuard)` hoặc tenant context) |
| **Response** | `PayPalFxRateResponse` (JSON) |
| **Cache** | 5 phút in-memory |

### 2.2 Service dependency graph

```
PayPalController.getFxRate()
  └─ PayPalFxService.getRate()
       ├─ Lớp 1: Memory cache (Map, TTL 5 phút)
       │   └─ Nếu cache còn hạn → return ngay
       ├─ Lớp 2: External API (nếu PAYPAL_FX_PROVIDER_URL được cấu hình)
       │   ├─ open.er-api.com/v6/latest/USD
       │   └─ hoặc exchangerate-api.com/v4/latest/USD
       │   └─ Cập nhật cache
       └─ Lớp 3: Static fallback
           └─ PAYPAL_USD_VND_RATE (env) → 25400
```

### 2.3 Response JSON schema

```json
{
  "fxRate": 25450,
  "spreadRate": 0.01,
  "spreadLabel": "1%",
  "currencyPair": "USD/VND",
  "updatedAt": "2026-06-18T08:00:00.000Z",
  "source": "open-exchange-rates"
}
```

### 2.4 Code skeleton (chỉ định hướng)

**File:** `apps/api/src/payments/paypal/paypal.controller.ts`

```typescript
// ── THÊM VÀO CONTROLLER ────────────────────────────────────
import { PayPalFxService } from './paypal.fx.service';

// Inject trong constructor:
constructor(
  private readonly paypalService: PayPalService,
  private readonly paypalFxService: PayPalFxService,  // ← MỚI
) {}

// ── Endpoint mới ────────────────────────────────────────────
@Get('fx-rate')
@UseGuards(JwtAuthGuard)  // hoặc tenant auth guard
async getFxRate(): Promise<PayPalFxRateResponse> {
  const rate = await this.paypalFxService.getRate();
  return {
    fxRate: rate.fxRate,
    spreadRate: rate.spreadRate,
    spreadLabel: `${(rate.spreadRate * 100).toFixed(0)}%`,
    currencyPair: 'USD/VND',
    updatedAt: rate.updatedAt.toISOString(),
    source: rate.source,
  };
}
```

### 2.5 Xác nhận service hiện có

`PayPalFxService` đã tồn tại tại `paypal.fx.service.ts`. Cần kiểm tra:
- Có `getRate()` method public không? ✅ (đã có)
- Có cache TTL 5 phút không? ✅ (đã có)
- Có fallback về static rate không? ✅ (đã có)

---

## III. Gap 2 — Frontend: Billing Dashboard Nav

### 3.1 Trạng thái hiện tại

Trong `billing-client-shell.tsx`, header chỉ có **1 link điều hướng**:
```tsx
<Link href="/billing/subscription">
  📋 Quản lý gói cước →
</Link>
```

### 3.2 Thiết kế bổ sung

Thêm **2 link** vào header của `BillingDashboardPage` (không phải `BillingClientShell` — vì header ở Server Component):

**File:** `apps/web/app/(dashboard)/billing/page.tsx`

```tsx
// Sau link "Quản lý gói cước" hiện tại, thêm:
<div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
  <Link href="/billing/subscription" /* ... giữ nguyên ... */>
    📋 Quản lý gói cước →
  </Link>

  {/* === MỚI: Link đến Nạp tiền quốc tế PayPal === */}
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
      fontFamily: "Arial, sans-serif",
    }}
  >
    🌍 Nạp tiền quốc tế →
  </Link>

  {/* === MỚI: Link đến AI Analytics Dashboard === */}
  <Link
    href="/billing/analytics"
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "10px 18px",
      borderRadius: 10,
      background: "rgba(128,224,160,0.12)",
      border: "1px solid rgba(128,224,160,0.25)",
      color: "#80e0a0",
      fontWeight: 700,
      fontSize: 14,
      textDecoration: "none",
      fontFamily: "Arial, sans-serif",
    }}
  >
    📊 AI Analytics →
  </Link>
</div>
```

### 3.3 Visual layout (sau khi thêm)

```
┌─────────────────────────────────────────────────────────┐
│ AIFUT Billing                                           │
│                                                         │
│  Billing & Subscription                                 │
│  Track consumption, manage your plan, and review past   │
│  invoices.                                              │
│                                                         │
│  ┌──────────────────┐ ┌────────────────┐ ┌────────────┐ │
│  │ 📋 Quản lý gói   │ │ 🌍 Nạp tiền    │ │ 📊 AI      │ │
│  │    cước →        │ │    quốc tế →   │ │ Analytics→ │ │
│  └──────────────────┘ └────────────────┘ └────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## IV. Gap 3 — Frontend: Wallet Balance Card → Topup Redirect

### 4.1 Trạng thái hiện tại

**`wallet-balance-card.tsx`** — Interface đã có `onTopupClick?`:
```typescript
interface WalletBalanceCardProps {
  wallet: WalletInfo;
  onRefundClick: () => void;
  onTopupClick?: () => void;  // ← Đã có, optional
}
```

**`wallet-client-shell.tsx`** — Chỉ truyền `onRefundClick`:
```typescript
<WalletBalanceCard
  wallet={data.wallet}
  onRefundClick={() => setModalOpen(true)}
  // onTopupClick không được truyền!
/>
```

### 4.2 Thiết kế sửa

#### 4.2.1 Thêm handler topup vào `WalletClientShell`

```typescript
// Trong WalletClientShell component:

const handleTopupClick = useCallback(() => {
  // Redirect đến trang nạp tiền quốc tế PayPal
  window.location.href = "/billing/paypal";
}, []);
```

#### 4.2.2 Truyền vào WalletBalanceCard

```typescript
<WalletBalanceCard
  wallet={data.wallet}
  onRefundClick={() => setModalOpen(true)}
  onTopupClick={handleTopupClick}  // ← MỚI
/>
```

#### 4.2.3 Đảm bảo WalletBalanceCard render nút topup

Trong `wallet-balance-card.tsx`, component cần render nút "Nạp tiền" khi `onTopupClick` được truyền:

```tsx
// Vùng nút hành động trong WalletBalanceCard:
<div style={{ marginTop: 18, display: "flex", gap: 12 }}>
  <button /* nút Hoàn tiền hiện có */>
    ↩️ Yêu cầu hoàn tiền
  </button>

  {/* === MỚI === */}
  {onTopupClick && (
    <button
      type="button"
      onClick={onTopupClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "12px 20px",
        borderRadius: 12,
        background: "linear-gradient(135deg, #0096ff, #0070cc)",
        color: "#fff",
        fontWeight: 700,
        fontSize: 14,
        border: "none",
        cursor: "pointer",
        fontFamily: "Arial, sans-serif",
      }}
    >
      💳 Nạp tiền
    </button>
  )}
</div>
```

### 4.3 Luồng người dùng hoàn chỉnh

```
User mở /billing/wallet
  → WalletClientShell mount
    → fetchWalletBalance() → WalletBalanceCard render
      → User thấy số dư + nút "Nạp tiền"
        → Click "Nạp tiền"
          → handleTopupClick → window.location.href = "/billing/paypal"
            → PayPalTopupShell load (form phase)
              → User nhập số tiền VND
              → Click "Nạp qua PayPal"
                → PayPal Smart Buttons render
                  → User approve qua PayPal popup
                    → onApprove → verify → reconcile → success
                      → redirect về /billing/wallet
                        → Balance đã update
```

---

## V. Đồ thị liên kết luồng dòng tiền hoàn chỉnh

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    LUỒNG DÒNG TIỀN THỰC TẾ — AIFUT                       │
│                                                                           │
│  ┌─────────────────────┐     ┌──────────────────────┐                    │
│  │  Billing Dashboard   │     │   Wallet Page         │                    │
│  │  /billing            │     │   /billing/wallet      │                    │
│  │                      │     │                        │                    │
│  │  ┌────────────────┐  │     │  ┌──────────────────┐ │                    │
│  │  │ 🌍 Nạp tiền    │──┼─────┼─→│ WalletBalanceCard │ │  ← Nút "Nạp tiền" │
│  │  │   quốc tế →     │  │     │  │ Số dư: 1.500.000₫│ │    redirect       │
│  │  └────────┬───────┘  │     │  │ [Nạp tiền] [HT]  │ │                    │
│  │           │          │     │  └──────────────────┘ │                    │
│  │  ┌────────▼───────┐  │     └──────────┬───────────┘                    │
│  │  │ 📊 AI         │  │                │                                │
│  │  │   Analytics →  │  │                ▼                                │
│  │  └──────┬─────────┘  │     ┌──────────────────────┐                    │
│  └─────────┼────────────┘     │  PayPal Topup Page    │                    │
│            │                  │  /billing/paypal       │                    │
│            ▼                  │                        │                    │
│  ┌──────────────────┐        │  ┌───────────────────┐ │                    │
│  │ Analytics Shell   │        │  │ Exchange Rate Card │ │  ← GET /fx-rate  │
│  │ 📊📈AI Scorecard  │        │  │ Input: 1.000.000₫ │ │    └──▶ Backend   │
│  │ ──────────────    │        │  │ USD charge: $39.76│ │                   │
│  │ Cost trend chart  │        │  ├───────────────────┤ │                   │
│  │ Model matrix      │        │  │ PayPal Buttons    │ │  ← POST create    │
│  └──────────────────┘        │  │ [PayPal] [📱]     │ │    └──▶ /create    │
│                               │  └────────┬──────────┘ │       -order      │
│                               │           │             │                   │
│                               │           ▼             │                   │
│                               │  ┌──────────────────┐   │                   │
│                               │  │ Status Screen    │   │  ← verify →       │
│                               │  │ ✅ +990.000₫     │   │    reconcile      │
│                               │  │ Auto-redirect 5s │   │                   │
│                               │  └────────┬──────────┘   │                   │
│                               └───────────┼──────────────┘                   │
│                                           │                                  │
│                                           ▼                                  │
│                               ┌──────────────────────┐                       │
│                               │  Wallet Page (refresh)│                      │
│                               │  Số dư mới: 2.490.000₫│                      │
│                               └──────────────────────┘                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Backend endpoints involved

| Frontend action | Backend endpoint | Phương thức | Mục đích |
|---|---|---|---|
| Wallet page mount | `GET /billing/wallet/balance` | `LedgerController.getBalance()` | Lấy số dư thực tế |
| Exchange rate mount | `GET /payments/paypal/fx-rate` | `PayPalController.getFxRate()` (—MỚI—) | Lấy tỷ giá USD/VND |
| Click "Nạp qua PayPal" | `POST /payments/paypal/create-order` | `PayPalController.createOrder()` | Tạo PayPal order |
| User approve | `GET /payments/paypal/verify/:id` | `PayPalController.verifyOrder()` | Xác nhận capture |
| Verify thất bại | `POST /payments/paypal/reconcile` | `PayPalController.reconcile()` | Fallback đồng bộ |
| Webhook callback | `POST /payments/paypal/webhook` | `PayPalController.handleWebhook()` | Capture event |
| Analytics page mount | `GET /ai-analytics/scorecard` | `AnalyticsController.scorecard()` | AI Cost analytics |
| Analytics page mount | `GET /ai-analytics/trends` | `AnalyticsController.trends()` | Cost trend |
| Analytics page mount | `GET /ai-analytics/matrix` | `AnalyticsController.matrix()` | Model efficiency |

---

## VI. Files cần sửa / tạo

### 6.1 Backend (1 file sửa)

| File | Loại | Thay đổi | Dòng ước tính |
|---|---|---|---|
| `apps/api/src/payments/paypal/paypal.controller.ts` | Sửa | Thêm `GET /payments/paypal/fx-rate` endpoint, inject `PayPalFxService` | ~30 dòng |

### 6.2 Frontend (3 file sửa)

| File | Loại | Thay đổi | Dòng ước tính |
|---|---|---|---|
| `apps/web/app/(dashboard)/billing/page.tsx` | Sửa | Thêm 2 link nav: PayPal topup + AI Analytics | ~40 dòng |
| `apps/web/components/billing/wallet-client-shell.tsx` | Sửa | Thêm `handleTopupClick`, truyền `onTopupClick` vào `WalletBalanceCard` | ~10 dòng |
| `apps/web/components/billing/wallet-balance-card.tsx` | Sửa | Thêm render nút "💳 Nạp tiền" khi `onTopupClick` được truyền | ~30 dòng |

### 6.3 Tổng hợp

| Phần | Files | Dòng ước tính |
|---|---|---|
| Backend | 1 file sửa | ~30 dòng |
| Frontend | 3 file sửa | ~80 dòng |
| **Tổng** | **4 file** | **~110 dòng** |

### 6.4 Các file KHÔNG cần sửa

- `paypal.fx.service.ts` — Đã có, dùng nguyên state
- `paypal.service.ts` — Đã có createOrder, verify, reconcile
- `paypal.module.ts` — Đã có PayPalFxService trong providers
- `paypal-provider.tsx` — Đã có, dùng nguyên state
- `paypal-buttons.tsx` — Đã wired với createOrder + verify
- `analytics-client-shell.tsx` — Đã có fetching + rendering
- `analytics-controller.ts` / `analytics.service.ts` — Đã có 3 endpoints

---

## VII. Thứ tự implement

```
Thứ tự khi chạy AIFUT GO:

Bước 1: Backend — GET /payments/paypal/fx-rate
  File: paypal.controller.ts
  - Import PayPalFxService
  - Inject vào constructor
  - Thêm endpoint getFxRate()
  - Test: curl GET :3002/payments/paypal/fx-rate
  Ảnh hưởng: PayPal exchange rate card sẽ gọi endpoint này → trả rate động

Bước 2: Frontend — Billing Dashboard Nav links
  File: billing/page.tsx
  - Thêm link "🌍 Nạp tiền quốc tế →" → /billing/paypal
  - Thêm link "📊 AI Analytics →" → /billing/analytics
  Ảnh hưởng: User có thể click trực tiếp từ dashboard

Bước 3: Frontend — Wallet Balance Card topup
  Files:
  - wallet-client-shell.tsx: thêm handleTopupClick + wire
  - wallet-balance-card.tsx: render nút "💳 Nạp tiền"
  Ảnh hưởng: User thấy nút "Nạp tiền" trên Wallet card → click → redirect PayPal page
```

### Kết quả sau implement

```
Phase 2 progress: ~86% → ~91%
  (4 gaps closed: G1=+2%, G2=+1%, G3=+0.5%, G4/G5=+1.5%)
```

---

## Phụ lục A — Map chi tiết Codebase

### Backend file: `paypal.controller.ts`

```
┌─ paypal.controller.ts ──────────────────────────────────────────┐
│                                                                  │
│  HIỆN TẠI:                                                       │
│    @Post('create-order')    ✅ createOrder()                     │
│    @Post('webhook')         ✅ handleWebhook()                    │
│    @Get('verify/:paypalOrderId') ✅ verifyOrder()                │
│    @Post('reconcile')       ✅ reconcile()                       │
│    @Get('return')           ✅ handleReturn()                    │
│    @Get('capabilities')     ✅ capabilities()                    │
│                                                                  │
│  CẦN THÊM:                                                       │
│    @Get('fx-rate')          ❌ getFxRate()  ← GAP 1             │
│                                                                  │
│  Inject:                                                         │
│    private readonly paypalFxService: PayPalFxService  ← MỚI     │
└──────────────────────────────────────────────────────────────────┘
```

### Frontend file: `billing/page.tsx`

```
┌─ billing/page.tsx ───────────────────────────────────────────────┐
│                                                                  │
│  Header hiện tại:                                                │
│    <Link href="/billing/subscription">                           │
│      📋 Quản lý gói cước →                                      │
│    </Link>                                                       │
│                                                                  │
│  Cần thêm:                                                       │
│    <Link href="/billing/paypal">       ← GAP 2                  │
│      🌍 Nạp tiền quốc tế →                                      │
│    </Link>                                                       │
│    <Link href="/billing/analytics">    ← GAP 3                  │
│      📊 AI Analytics →                                          │
│    </Link>                                                       │
└──────────────────────────────────────────────────────────────────┘
```

### Frontend file: `wallet-client-shell.tsx`

```
┌─ wallet-client-shell.tsx ────────────────────────────────────────┐
│                                                                  │
│  HIỆN TẠI (ready phase):                                        │
│    <WalletBalanceCard                                           │
│      wallet={data.wallet}                                       │
│      onRefundClick={() => setModalOpen(true)}                   │
│      // onTopupClick không được truyền! ← GAP 4                 │
│    />                                                           │
│                                                                  │
│  CẦN SỬA:                                                       │
│    + const handleTopupClick = useCallback(() => {               │
│        window.location.href = "/billing/paypal";                │
│      }, []);                                                    │
│    <WalletBalanceCard                                           │
│      wallet={data.wallet}                                       │
│      onRefundClick={() => setModalOpen(true)}                   │
│      onTopupClick={handleTopupClick}       ← SỬA                │
│    />                                                           │
└──────────────────────────────────────────────────────────────────┘
```

### Frontend file: `wallet-balance-card.tsx`

```
┌─ wallet-balance-card.tsx ────────────────────────────────────────┐
│                                                                  │
│  HIỆN TẠI:                                                      │
│    actions zone:                                                │
│      <button onClick={onRefundClick}>                           │
│        ↩️ Yêu cầu hoàn tiền                                    │
│      </button>                                                  │
│      // Không có nút Nạp tiền ← GAP 5                           │
│                                                                  │
│  CẦN SỬA:                                                       │
│    + {onTopupClick && (                                        │
│    +   <button onClick={onTopupClick} style={{...gradient}}>    │
│    +     💳 Nạp tiền                                            │
│    +   </button>                                                │
│    + )}                                                         │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phụ lục B — Checklist kiểm tra sau implement

| # | Kiểm tra | Kết quả mong đợi |
|---|---|---|
| 1 | `GET /payments/paypal/fx-rate` trả về JSON đúng schema | 200 + { fxRate, spreadRate, ... } |
| 2 | `GET /payments/paypal/fx-rate` khi cache còn hạn | Trả từ cache, không gọi API ngoài |
| 3 | `GET /payments/paypal/fx-rate` khi không có env | Fallback về 25400 + spread 1% |
| 4 | Billing Dashboard hiển thị 3 link | Quản lý gói, Nạp tiền quốc tế, AI Analytics |
| 5 | Click "Nạp tiền quốc tế" redirect đến /billing/paypal | 200, render PayPalTopupShell |
| 6 | Click "AI Analytics" redirect đến /billing/analytics | 200, render AnalyticsClientShell |
| 7 | Wallet page hiển thị nút "💳 Nạp tiền" | Visible, styling khớp gradient |
| 8 | Click "💳 Nạp tiền" ở Wallet page | redirect /billing/paypal |
| 9 | Wallet locked → không hiển thị nút Nạp tiền | Kiểm tra `wallet.status === "locked"` |
| 10 | `npm run build` không lỗi | Build pass |

---

*Thiết kế này được xây dựng dựa trên tổng kiểm tra codebase AIFUT hiện trạng ngày 2026-06-18.*
*Sẵn sàng implement khi Thành gõ "AIFUT GO".*

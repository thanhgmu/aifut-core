# BACKEND PAYMENT GAP-FIX DESIGN

> **Mode:** AIFUT THINK (thiết kế, không code)
> **Ngày:** 2026-06-18
> **Phạm vi:** Vá lỗ hổng 5 endpoint backend phục vụ trực tiếp dữ liệu cho 2 màn hình Frontend đã deploy: **PayPal UI** và **Subscription UI**.
> **Nguyên tắc bảo mật xuyên suốt:** Chống IDOR tuyệt đối — `tenantId` LUÔN phân giải từ auth/header context (`x-tenant-id` / `x-tenant-slug`), KHÔNG BAO GIỜ nhận từ `query`/`body`.

---

## 0. KẾT QUẢ QUÉT CODEBASE HIỆN TRẠNG (Quan trọng — đọc trước)

Sau khi quét `apps/api/src/payments/`, hiện trạng thực tế khác với giả định ban đầu:

| # | Endpoint yêu cầu | Trạng thái thực tế | Hành động |
|---|---|---|---|
| 1 | `GET /payments/paypal/fx-rate` | ❌ **CHƯA CÓ** | **Vá mới** (thiết kế §2) |
| 2 | `POST /payments/paypal/create-order` | ✅ **ĐÃ CÓ** (`paypal.controller.ts` + `paypal.service.createPayPalOrder`) | Giữ nguyên, đối chiếu §3.0 |
| 3 | `POST /payments/paypal/capture-order` | ❌ **CHƯA CÓ** (chỉ có `webhook` + `verify` + `reconcile`) | **Vá mới** (thiết kế §3) |
| 4 | `GET /billing/subscription/current` | ✅ **ĐÃ CÓ ĐẦY ĐỦ** (`subscription.controller.getCurrent`) | Xác nhận §4.1, không cần code |
| 5 | `GET /billing/subscription/plans` | ✅ **ĐÃ CÓ ĐẦY ĐỦ** (`subscription.controller.getPlans`) | Xác nhận §4.2, không cần code |
| 6 | `GET /billing/subscription/prorate` | ✅ **ĐÃ CÓ ĐẦY ĐỦ** (`subscription.controller.getProrate`) | Xác nhận §4.3, không cần code |

> **Kết luận:** Khối Subscription (3 endpoint) đã hoàn chỉnh, bọc IDOR đúng chuẩn qua `resolveTenantId(tenantIdHeader, tenantSlugHeader)`. **Chỉ còn 2 endpoint PayPal thực sự cần implement: `fx-rate` và `capture-order`.** Đây là phần thiết kế trọng tâm.

---

## 1. KIẾN TRÚC TỔNG THỂ & TÀI SẢN TÁI SỬ DỤNG

### 1.1. Module hiện có (tái dùng, không tạo trùng)
- `PayPalController` (`paypal/paypal.controller.ts`) — đã có `resolveTenantId(req)` đọc từ `req.user.tenantId ?? x-tenant-id`. **Nâng cấp** helper này để hỗ trợ thêm `x-tenant-slug` cho đồng bộ với Subscription.
- `PayPalService` (`paypal/paypal.service.ts`) — đã có `getAccessToken()`, `postJson/getJson`, `createPayPalOrder()`, `handlePayPalWebhook()`, `verifyPayPalOrder()`.
- `PayPalConfig` (`paypal/paypal.config.ts`) — nguồn credentials + OAuth2 token cache.
- `PayPalIpnGuard` (`paypal/paypal.ipn.guard.ts`) — guard idempotency 3 lớp (`claim()` + `settle()`), tái dùng cho capture path.
- `LedgerService` (`ledger/ledger.service.ts`) — `creditBalance()` idempotent (CAS + interactive `$transaction`), `getOrCreateWallet()`.
- `paypal.utils.ts` — `internalToPayPalDecimal`, `payPalDecimalToInternal`, `applySpreadToPayPalAmount`, `resolveSpreadRate` (đọc `PAYPAL_SPREAD_RATE`, mặc định 1%), `isAmountWithinTolerance`.
- `SubscriptionActivatorService` — `activateByOrderId()` cho luồng kích hoạt gói.

### 1.2. Quy ước tiền tệ bất biến (giữ nguyên)
- Nội bộ: `BigInt` đơn vị nhỏ nhất, `UNIT_SCALE = 100` (VND × 100).
- PayPal: chuỗi decimal 2 chữ số (`"19.99"`). Ranh giới chuyển đổi duy nhất = `paypal.utils.ts`.
- Spread 1% chỉ áp **chiều ra** (internal → PayPal charge), KHÔNG áp chiều vào (capture reconcile dùng tolerance ±2%).

---

## 2. ENDPOINT MỚI #1 — `GET /payments/paypal/fx-rate`

### 2.1. Mục đích
Bóc tách tỷ giá USD/VND thực tế phục vụ PayPal UI hiển thị "Bạn sẽ bị tính ~X USD cho Y VND". Bọc spread 1% cấu hình để khớp với số tiền `create-order` sẽ thực thu.

### 2.2. Nguồn tỷ giá (FX rate source) — chiến lược 2 tầng
1. **Tầng cấu hình (mặc định, deterministic):** đọc `PAYPAL_USD_VND_RATE` từ env (VND per 1 USD, ví dụ `25400`). Đây là nguồn "định nghĩa" ổn định, không phụ thuộc mạng — phù hợp local-first.
2. **Tầng provider (tùy chọn, khi bật):** nếu `PAYPAL_FX_PROVIDER_URL` được set, gọi provider (ví dụ exchangerate host) với cache TTL (mặc định 1 giờ) để tránh gọi lặp. Lỗi provider → fallback về tầng cấu hình (không bao giờ ném lỗi làm hỏng UI).

> **Quyết định kiến trúc:** Mặc định dùng tầng cấu hình để giữ tính bất biến + local-first. Provider chỉ là enhancement opt-in. Không thêm dependency nặng.

### 2.3. Bổ sung vào `PayPalConfig`
```ts
// paypal.config.ts — thêm vào PayPalCredentials
export interface PayPalCredentials {
  // ...giữ nguyên các field hiện có...
  /** Tỷ giá VND per 1 USD (định nghĩa tĩnh). Đọc từ PAYPAL_USD_VND_RATE. */
  usdVndRate: number;
  /** URL provider FX tùy chọn. Đọc từ PAYPAL_FX_PROVIDER_URL (rỗng = tắt). */
  fxProviderUrl: string;
}

// load(): bổ sung
const usdVndRate = Number(process.env['PAYPAL_USD_VND_RATE'] || '25400');
// validate: Number.isFinite && > 0, else fallback 25400
```

### 2.4. Service mới — `paypal.fx.service.ts` (file mới, tách trách nhiệm)
```ts
@Injectable()
export class PayPalFxService {
  private cache: { rate: number; fetchedAt: number } | null = null;
  private static readonly TTL_MS = 60 * 60 * 1000; // 1h

  constructor(private readonly config: PayPalConfig) {}

  /**
   * Trả về tỷ giá hiệu lực: { baseRate, spreadRate, effectiveRate }.
   * baseRate     = VND per 1 USD (provider hoặc env).
   * spreadRate   = resolveSpreadRate() (mặc định 0.01).
   * effectiveRate= baseRate * (1 + spreadRate)  // tỷ giá user thực chịu (VND/USD)
   */
  async getUsdVndRate(): Promise<FxRateResult> {
    const creds = this.config.require();
    const spreadRate = resolveSpreadRate();
    let baseRate = creds.usdVndRate;
    let source: 'config' | 'provider' = 'config';

    if (creds.fxProviderUrl) {
      const live = await this.fetchProviderRate(creds.fxProviderUrl).catch(() => null);
      if (live && Number.isFinite(live) && live > 0) {
        baseRate = live; source = 'provider';
      }
    }
    const effectiveRate = Math.round(baseRate * (1 + spreadRate) * 100) / 100;
    return { base: 'USD', quote: 'VND', baseRate, spreadRate,
             effectiveRate, source, asOf: new Date().toISOString() };
  }

  private async fetchProviderRate(url: string): Promise<number | null> {
    // Cache TTL guard
    if (this.cache && Date.now() - this.cache.fetchedAt < PayPalFxService.TTL_MS) {
      return this.cache.rate;
    }
    // fetchWithTimeout(url) → parse → cache → return
    // Lỗi/parse fail → return null (caller fallback config)
  }
}
```

### 2.5. Type mới (`paypal.types.ts`)
```ts
export interface FxRateResult {
  base: 'USD';
  quote: 'VND';
  /** VND per 1 USD trước spread. */
  baseRate: number;
  /** Spread áp dụng (0.01 = 1%). */
  spreadRate: number;
  /** VND per 1 USD sau khi cộng spread — số user thực chịu. */
  effectiveRate: number;
  source: 'config' | 'provider';
  asOf: string;
}
```

### 2.6. Controller — thêm route vào `PayPalController`
```ts
@Get('fx-rate')
async getFxRate(@Req() req: Request): Promise<PayPalApiResponse> {
  resolveTenantId(req);                  // CHỐNG IDOR: bắt buộc tenant context
  if (!this.paypalConfig.isConfigured) {
    throw new BadRequestException('PayPal gateway chưa được cấu hình.');
  }
  const fx = await this.paypalFxService.getUsdVndRate();
  return {
    success: true,
    data: {
      base: fx.base, quote: fx.quote,
      baseRate: fx.baseRate,
      spreadRate: fx.spreadRate,
      spreadPercentDisplay: `${(fx.spreadRate * 100).toFixed(2)}%`,
      effectiveRate: fx.effectiveRate,
      source: fx.source,
      asOf: fx.asOf,
    },
  };
}
```
- **DI:** thêm `PayPalFxService` vào `providers` của `PayPalModule` và constructor `PayPalController`.
- **IDOR:** gọi `resolveTenantId(req)` ngay đầu — read-only nhưng vẫn yêu cầu tenant context theo yêu cầu bọc chặt cả 5 endpoint. Không nhận tham số FX từ query.

---

## 3. ENDPOINT MỚI #2 — `POST /payments/paypal/capture-order`

### 3.1. Mục đích
Khóa và đối soát lệnh capture do client gửi sau khi user approve trên PayPal (luồng JS SDK `onApprove`). Tự động nạp `BigInt` balance vào **Wallet** + **Ledger** qua **interactive transaction**, hoặc kích hoạt subscription nếu order gắn với gói.

> **Phân biệt với webhook:** `webhook` là server-to-server bị động (PayPal đẩy). `capture-order` là chủ động do client gọi — bắt buộc cho luồng PayPal JS SDK Smart Buttons. Cả hai hội tụ về cùng `PayPalIpnGuard.claim()/settle()` để đảm bảo idempotency (không nạp ví 2 lần).

### 3.0. Đối chiếu `create-order` hiện có (đã đúng, giữ nguyên)
`createPayPalOrder()` đã: validate amount BigInt, lấy OAuth token, `POST /v2/checkout/orders` intent=CAPTURE, trả `approvalUrl`, persist mapping `paypalOrderId` vào `PaymentTransaction.metadata`. `tenantId` lấy từ `resolveTenantId(req)` (chống IDOR) — **không sửa**.

### 3.2. DTO & Controller route
```ts
interface CaptureOrderDto {
  /** PayPal Order ID nhận từ create-order (KHÔNG phải orderId nội bộ). */
  paypalOrderId: string;
  /** orderId nội bộ (tùy chọn — đối soát chéo, không tin tuyệt đối). */
  orderId?: string;
}

@Post('capture-order')
@HttpCode(HttpStatus.OK)
async captureOrder(
  @Body() dto: CaptureOrderDto,
  @Req() req: Request,
): Promise<PayPalApiResponse> {
  if (!dto.paypalOrderId || typeof dto.paypalOrderId !== 'string') {
    throw new BadRequestException('paypalOrderId is required');
  }
  const tenantId = resolveTenantId(req);          // CHỐNG IDOR
  if (!this.paypalConfig.isConfigured) {
    throw new BadRequestException('PayPal gateway chưa được cấu hình.');
  }
  const result = await this.paypalService.capturePayPalOrder({
    paypalOrderId: dto.paypalOrderId,
    tenantId,                                       // tenant từ context, KHÔNG từ body
    expectedOrderId: dto.orderId,
  });
  if (!result.success) {
    return { success: false, error: result.errorMessage ?? 'Capture thất bại' };
  }
  return {
    success: true,
    data: {
      paypalOrderId: result.paypalOrderId,
      captureId: result.captureId,
      captureStatus: result.captureStatus,
      grossAmount: result.grossAmount,
      netAmount: result.netAmount,
      paypalFee: result.paypalFee,
      currency: result.currency,
      walletCredited: result.walletCredited,
      newBalanceDisplay: result.newBalanceDisplay,
      ledgerTransactionId: result.ledgerTransactionId,
      subscriptionActivated: result.subscriptionActivated,
    },
  };
}
```

### 3.3. Input/Result types (`paypal.types.ts`)
```ts
export interface PayPalCaptureOrderInput {
  paypalOrderId: string;
  /** Tenant phân giải từ context (IDOR-safe). */
  tenantId: string;
  /** orderId nội bộ kỳ vọng (đối soát chéo). */
  expectedOrderId?: string;
}

export interface PayPalCaptureOrderResult {
  success: boolean;
  paypalOrderId: string;
  captureId?: string;
  captureStatus?: string;       // COMPLETED | DECLINED | PENDING
  grossAmount?: string;
  netAmount?: string;
  paypalFee?: string;
  currency?: string;
  /** internal BigInt đã nạp (smallest unit). */
  internalAmount?: bigint;
  walletCredited: boolean;
  newBalanceDisplay?: string;
  ledgerTransactionId?: string;
  subscriptionActivated: boolean;
  errorMessage?: string;
}
```

### 3.4. Service mới — `PayPalService.capturePayPalOrder()`
```ts
async capturePayPalOrder(
  input: PayPalCaptureOrderInput,
): Promise<PayPalCaptureOrderResult> {
  const { paypalOrderId, tenantId, expectedOrderId } = input;
  const base = { success: false, paypalOrderId,
                 walletCredited: false, subscriptionActivated: false };

  // 1. OAuth token
  let token: string;
  try { token = await this.getAccessToken(); }
  catch { return { ...base, errorMessage: 'Không lấy được token PayPal.' }; }

  const creds = this.config.require();

  // 2. POST /v2/checkout/orders/{id}/capture  (idempotent qua PayPal-Request-Id)
  let cap: PayPalApiOrderResponse;
  try {
    cap = await this.postJson<PayPalApiOrderResponse>(
      `${creds.baseUrl}${ORDERS_PATH}/${paypalOrderId}/capture`,
      {},                                  // body rỗng
      token,
      { 'PayPal-Request-Id': `cap-${paypalOrderId}` }, // idempotency PayPal-side
    );
  } catch (err) {
    return { ...base, errorMessage: this.friendlyError(err) };
  }

  // 3. Bóc tách capture resource
  const pu = cap.purchase_units?.[0];
  const capture = pu?.payments?.captures?.[0];
  if (!capture || capture.status !== 'COMPLETED') {
    return { ...base, captureStatus: capture?.status ?? cap.status,
             errorMessage: 'Capture chưa COMPLETED.' };
  }
  const captureId = capture.id;
  const grossAmount = capture.amount?.value ?? '0.00';
  const currency    = capture.amount?.currency_code ?? 'USD';
  const netAmount   = capture.seller_receivable_breakdown?.net_amount?.value ?? grossAmount;
  const paypalFee   = capture.seller_receivable_breakdown?.paypal_fee?.value ?? '0.00';

  // orderId nội bộ ưu tiên từ PayPal echo (invoice_id/custom_id), KHÔNG tin body
  const orderId = pu?.invoice_id ?? pu?.reference_id ?? expectedOrderId ?? paypalOrderId;

  let internalAmount: bigint;
  try { internalAmount = payPalDecimalToInternal(grossAmount); }
  catch { return { ...base, captureId, errorMessage: 'Sai định dạng số tiền capture.' }; }

  // 4. Idempotency claim (chống nạp ví 2 lần — dùng chung guard với webhook)
  const claim = await this.ipnGuard.claim(orderId, captureId, internalAmount);

  // 4a. Đã xử lý trước đó → trả về thành công idempotent
  if (claim.decision === 'duplicate' && claim.currentStatus === 'success') {
    return { ...base, success: true, captureId, captureStatus: 'COMPLETED',
             grossAmount, netAmount, paypalFee, currency,
             walletCredited: true, subscriptionActivated: true,
             errorMessage: 'Idempotent: giao dịch đã được xử lý.' };
  }
  if (claim.decision !== 'claimed' || !claim.transactionId) {
    return { ...base, captureId, captureStatus: 'COMPLETED',
             errorMessage: `Không claim được giao dịch (decision=${claim.decision}).` };
  }

  // 5. Settle PaymentTransaction = success (Serializable tx trong guard)
  const settled = await this.ipnGuard.settle(claim.transactionId, 'success', {
    gatewayTxId: captureId, gateway: 'paypal',
    metadata: { paypalOrderId, paypalCaptureId: captureId,
                grossAmount, netAmount, paypalFee, currency,
                source: 'client-capture',
                capturedAt: new Date().toISOString() },
  } as any);
  if (!settled) {
    return { ...base, captureId, captureStatus: 'COMPLETED',
             errorMessage: 'Settle race lost — đang được xử lý bởi luồng khác.' };
  }

  // 6. NẠP VÍ qua LedgerService.creditBalance (interactive tx + CAS + idempotent)
  //    Idempotent key = (tenantId, referenceType=topup, referenceId=captureId)
  let walletCredited = false;
  let ledgerTransactionId: string | undefined;
  let newBalanceDisplay: string | undefined;
  try {
    const ledgerRes = await this.ledger.creditBalance({
      tenantId,
      amount: internalAmount,                       // BigInt smallest unit
      referenceType: LedgerReferenceTypes.TOPUP,    // 'topup'
      referenceId: captureId,                       // idempotency key
      description: `PayPal capture nạp ví: ${grossAmount} ${currency}`,
      metadata: { paypalOrderId, captureId, grossAmount, netAmount, paypalFee, currency },
    });
    walletCredited = ledgerRes.success;
    ledgerTransactionId = ledgerRes.transactionId;
    newBalanceDisplay = `${(Number(ledgerRes.balanceAfter) / 100).toLocaleString('vi-VN')}₫`;
  } catch (err) {
    this.logger.error(`Wallet credit fail order=${orderId}: ${(err as Error).message}`);
    // Không rollback settle: tiền PayPal đã capture. Ghi log để reconcile cron xử lý.
  }

  // 7. Kích hoạt subscription nếu order gắn gói (best-effort, non-fatal)
  let subscriptionActivated = false;
  try {
    const act = await this.subscriptionActivator.activateByOrderId({
      orderId, gateway: 'paypal', gatewayTxId: captureId,
      paidAt: new Date(capture.create_time ?? Date.now()),
      ipnPayload: { source: 'client-capture', paypalOrderId, captureId },
    });
    subscriptionActivated = !!act.activated;
  } catch (err) {
    this.logger.warn(`Activation warning order=${orderId}: ${(err as Error).message}`);
  }

  return {
    success: true, paypalOrderId, captureId, captureStatus: 'COMPLETED',
    grossAmount, netAmount, paypalFee, currency, internalAmount,
    walletCredited, newBalanceDisplay, ledgerTransactionId, subscriptionActivated,
  };
}
```

### 3.5. Điểm bảo mật & nhất quán then chốt
- **IDOR:** `tenantId` chỉ từ `resolveTenantId(req)`. Ví được nạp đúng tenant đó; `orderId` ưu tiên lấy từ PayPal echo (`invoice_id`/`custom_id`) — không tin `dto.orderId`.
- **Idempotency 2 lớp:** (a) `PayPal-Request-Id` chống double-capture phía PayPal; (b) `PayPalIpnGuard.claim()` + `LedgerService.creditBalance` idempotent theo `captureId` → webhook + capture-order trùng nhau vẫn chỉ nạp ví 1 lần.
- **Interactive transaction:** `creditBalance()` đã chạy `prisma.$transaction` + optimistic lock CAS (`version`) — đúng yêu cầu "nạp BigInt balance qua interactive transaction".
- **Không rollback tiền đã capture:** nếu credit ví lỗi sau khi PayPal đã COMPLETED, KHÔNG ném lỗi mất tiền — ghi log để `reconciliation` cron/`verifyPayPalOrder` bù trừ (an toàn tài chính hơn rollback ảo).
- **`LedgerReferenceTypes.TOPUP`** đã tồn tại trong `ledger.types.ts` — không cần thêm enum.

### 3.6. Cập nhật `PayPalModule`
- Thêm `PayPalFxService` vào `providers`.
- `LedgerService` đã có trong providers → `capturePayPalOrder` inject sẵn (`this.ledger`).
- Không thêm controller mới — cả `fx-rate` và `capture-order` thêm route vào `PayPalController` hiện hữu.

---

## 4. KHỐI SUBSCRIPTION — XÁC NHẬN ĐÃ ĐẠT (không code)

### 4.1. `GET /billing/subscription/current` ✅
- Đã trả `{ subscription, usage, planDefinition }`. `usage` tổng hợp thực tế từ `usageRecord.aggregate` (ai/storage) + `workflowTemplate.count`, tất cả ràng buộc `tenantId`.
- IDOR: `resolveTenantId(x-tenant-id, x-tenant-slug)` (bắt buộc). Mọi aggregate đều `where: { tenantId }`.

### 4.2. `GET /billing/subscription/plans` ✅
- Map từ `PLAN_DEFINITIONS` (qua `getActivePlans()`) → `PlanColumnView`. `currentPlanKey` suy từ subscription active (cho phép tenant rỗng cho trang marketing — `required=false`).

### 4.3. `GET /billing/subscription/prorate` ✅
- Gọi thuần `subscriptionService.calculateProratedPricing()` (pure, không mutate). Subscription tải kèm ràng buộc `tenantId` → không prorate được trên sub của tenant khác.

> **Khuyến nghị nhỏ (tùy chọn, không bắt buộc):** Cân nhắc thống nhất helper `resolveTenantId` giữa PayPalController (đọc `req.user.tenantId ?? x-tenant-id`) và SubscriptionController (đọc + verify `x-tenant-id`/`x-tenant-slug` qua DB). Hiện PayPal chưa verify slug; nâng cấp ở §2/§3 để parity.

---

## 5. CHECKLIST IMPLEMENT (khi Thành ra lệnh AIFUT GO)

**Chỉ 2 file chức năng + 3 file sửa nhỏ:**

1. `paypal/paypal.fx.service.ts` — **TẠO MỚI** (`PayPalFxService`).
2. `paypal/paypal.config.ts` — thêm field `usdVndRate`, `fxProviderUrl` + parse env.
3. `paypal/paypal.types.ts` — thêm `FxRateResult`, `PayPalCaptureOrderInput`, `PayPalCaptureOrderResult`.
4. `paypal/paypal.service.ts` — thêm method `capturePayPalOrder()` + import `LedgerReferenceTypes`.
5. `paypal/paypal.controller.ts` — thêm route `GET fx-rate`, `POST capture-order`; nâng `resolveTenantId` hỗ trợ `x-tenant-slug`; inject `PayPalFxService`.
6. `paypal/paypal.module.ts` — thêm `PayPalFxService` vào `providers`.

**ENV mới (tùy chọn, có fallback):**
- `PAYPAL_USD_VND_RATE` (mặc định `25400`)
- `PAYPAL_FX_PROVIDER_URL` (rỗng = tắt, dùng config tĩnh)
- `PAYPAL_SPREAD_RATE` (đã có, mặc định `0.01`)

**Không đụng:** toàn bộ khối Subscription (đã đạt), `webhook`, `verify`, `reconcile`, `return`, `LedgerService`, `PayPalIpnGuard`.

---

## 6. RỦI RO & GUARDRAIL
- **FX provider down:** fallback config tĩnh, không bao giờ ném lỗi UI.
- **Double-capture:** chặn bởi `PayPal-Request-Id` + IPN guard + ledger idempotent key (`captureId`).
- **Credit ví lỗi sau capture:** không rollback, log + để reconcile cron bù — tránh mất đối soát tiền thật.
- **IDOR:** cả 5 endpoint đều phân giải tenant từ context; tuyệt đối không nhận tenant từ query/body.
- **BigInt precision:** mọi số tiền qua `paypal.utils` (BigInt math), chỉ FX multiply dùng Number rồi round về.

---

_Thiết kế hoàn tất. Không thực thi build/test. Chuyển phiên về trạng thái IDLE._

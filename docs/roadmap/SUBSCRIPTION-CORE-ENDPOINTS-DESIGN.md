# Subscription Core Endpoints — Bản thiết kế kiến trúc P0

> **Trạng thái:** Design Document — codebase scan hoàn tất (2026-06-18)
> **Module gốc:** `apps/api/src/payments/subscription/`
> **Module kế thừa:** `apps/api/src/billing/` (sẽ được merge)
> **Tham chiếu schema:** `apps/api/prisma/schema.prisma` → `Subscription`, `SubscriptionPlan`, `UsageRecord`, `Wallet`, `BillingAccount`, `Invoice`, `PaymentTransaction`
> **Runtime:** NestJS 11 + Prisma 7 + PostgreSQL 16

---

## I. TỔNG QUAN — Current State Assessment

### ✅ Đã tồn tại và hoạt động

| STT | File | Vai trò | Cần giữ |
|-----|------|---------|---------|
| 1 | `subscription.service.ts` | `upgradeSubscriptionPlan()` + `calculateProratedPricing()` + `cancelWithRefund()` — tất cả là mutation | ✅ Giữ, thêm read-only methods |
| 2 | `subscription.controller.ts` | 5 endpoints: `upgrade`, `cancel`, `current` (GET), `plans` (GET), `prorate` (GET) | ✅ Giữ, tách riêng **sub-controller họ READ** |
| 3 | `subscription.types.ts` | `UpgradeResult`, `ProrationDetail`, `CancelResult`, `SubscriptionRecord`, constants | ✅ Giữ, thêm `SubscriptionCurrentView`, `PlanColumnView`, `ProrationPreviewView` |
| 4 | `plan.config.ts` | `PLAN_DEFINITIONS` — single source of truth cho 4 gói | ✅ Giữ nguyên |
| 5 | `plan.decorator.ts` | `@PlanLimit({resource, action})` — metadata decorator | ✅ Giữ nguyên |
| 6 | `plan.guard.ts` | PlanGuard — CanActivate kiểm tra hạn ngạch | ✅ Giữ nguyên |
| 7 | `subscription.module.ts` | Module registration (import LedgerModule) | ✅ Giữ nguyên |
| 8 | `billing.service.ts` | Legacy: `subscribe()`, `subscribeAndPay()`, usage recording, invoices | ⚠️ Giữ nhưng **không merge vào subscription** |

### ❌ Thiếu / Cần nâng cấp

| Vấn đề | Hiện trạng | Yêu cầu |
|--------|-----------|---------|
| **getCurrentSubscriptionDetails()** | `GET /billing/subscription/current` hiện có nhưng chỉ đếm 3 resource (ai, storage, workflow) + thiếu planDefinition đầy đủ + thiếu billingCycle từ subscription | Phải trả về **mảng thống kê usageStats[]** cho 7+ resource, đối chiếu từng quota, kèm full planDefinition + tính năng tự động detect billingCycle |
| **getAvailableSaaSPlans()** | `GET /billing/subscription/plans` hiện có, đã gọi được `getActivePlans()` + `toPlanColumnView()` | Cần thêm: sort theo sortOrder, đánh dấu recommended plan, tính yearly discount % chính xác, handle empty state, support multi-currency display |
| **getPreviewProratedQuote()** | `GET /billing/subscription/prorate` hiện có, đã gọi `calculateProratedPricing()` + wallet balance check | Cần thêm: display string chuẩn (kèm formatVND cho từng field), hiển thị shortfall nếu không đủ ví, tính tỷ lệ discount khi cross-cycle (monthly→yearly), cache hint |
| **IDOR Protection** | Controller hiện tại check `x-tenant-id` header cho mutation, dùng `resolveTenantId()` cho read-only | Cần **chuẩn hóa** thành một guard/method duy nhất để không có lỗ hổng. Thêm `x-tenant-slug` resolution mặc định. |
| **Phân tách Controller** | 2 endpoints mutate + 3 endpoints read-only chung 1 controller | Tách thành: `SubscriptionMutationController` (POST) + `SubscriptionQueryController` (GET) — rõ ràng quyền hạn |

---

## II. CẤU TRÚC FILE MỚI / CẬP NHẬT

### 2.1 File cần khởi tạo **mới**

```
apps/api/src/payments/subscription/
├── subscription.query.controller.ts   ← [MỚI] Controller cho GET endpoints (current + plans + prorate)
├── subscription.idor.provider.ts      ← [MỚI] Provider bóc tách tenantId từ header context
```

### 2.2 File cần **cập nhật** (edit in-place)

```
apps/api/src/payments/subscription/
├── subscription.service.ts            ← [CẬP NHẬT] Thêm 3 method read-only core
├── subscription.types.ts              ← [CẬP NHẬT] Thêm view model types
├── subscription.module.ts             ← [CẬP NHẬT] Thêm provider + controller mới
├── subscription.controller.ts         ← [CẬP NHẬT] Giữ nguyên endpoint mutation 2 POST
```

### 2.3 File **KHÔNG** cần động tới

```
apps/api/src/billing/billing.service.ts   ← Legacy, không merge
apps/api/src/billing/billing.controller.ts ← Legacy (dùng x-tenant-slug, sẽ tồn tại song song đến Phase 2 cleanup)
apps/api/src/payments/subscription/plan.config.ts    ← Ổn định
apps/api/src/payments/subscription/plan.decorator.ts ← Ổn định
apps/api/src/payments/subscription/plan.guard.ts     ← Ổn định
```

---

## III. CHI TIẾT 3 HÀM LOGIC CORE

### 3.1 `getCurrentSubscriptionDetails()` — Gói hiện tại + Usage Stats

#### Định danh

```typescript
// subscription.service.ts (thêm mới)

async getCurrentSubscriptionDetails(
  tenantId: string,
  targetCurrency?: Currency,   // optional: multi-currency support fallback
): Promise<SubscriptionCurrentView>
```

#### Flow xử lý

```
1. Tenant identity guard → đã resolve từ IDOR provider
2. Prisma: findFirst Subscription WHERE tenantId + status IN ('active','trialing')
   → ORDER BY createdAt DESC
3. Nếu NULL → return { subscription: null, usage: null, planDefinition: null }
4. parse planKey → getPlan() từ PLAN_DEFINITIONS
5. detect billingCycle: xem expiresAt - startedAt, nếu ≈ 365 ngày thì yearly
6. Xây dựng mảng usageStats[] (loop qua tất cả resource có trong PlanLimits):
   [
     { resource: 'ai_calls',     used: X, limit: Y, percent: Z, unit: '/tháng', icon: '🤖' },
     { resource: 'storage_gb',   used: X, limit: Y, percent: Z, unit: 'GB',     icon: '💾' },
     { resource: 'workflows',    used: X, limit: Y, percent: Z, unit: 'mẫu',    icon: '🔧' },
     { resource: 'connectors',   used: X, limit: Y, percent: Z, unit: 'kết nối', icon: '🔗' },
     { resource: 'users',        used: X, limit: Y, percent: Z, unit: 'người',  icon: '👥' },
     { resource: 'workspaces',   used: X, limit: Y, percent: Z, unit: 'nơi',    icon: '📦' },
     { resource: 'bandwidth_gb', used: X, limit: Y, percent: Z, unit: 'GB',     icon: '🌐' },
   ]
7. Tính periodDetails: daysRemaining, totalDaysInCycle, periodStart, periodEnd, utilizationRate
8. Return { subscription, usageStats[], planDefinition (PlanColumnView), periodDetails }
```

#### Query Prisma cho từng resource

```typescript
// pattern chuẩn hóa — dùng Promise.all cho parallel
private async collectUsageStats(
  tenantId: string,
  periodStart: Date,
  plan: PlanDefinition,
): Promise<UsageStatItem[]> {
  const limits = plan.limits;
  const mStart = this.currentMonthStart(); // fallback nếu periodStart khác tháng

  const [aiAgg, storageAgg, workflowCount, connCount, memberCount, wsCount, bwAgg] =
    await Promise.all([
      // AI calls từ đầu cycle
      this.prisma.usageRecord.aggregate({
        _sum: { value: true },
        where: { tenantId, category: 'ai', recordedAt: { gte: periodStart } },
      }),
      // Storage (MB → GB)
      this.prisma.usageRecord.aggregate({
        _sum: { value: true },
        where: { tenantId, category: 'storage' },
      }),
      // Workflow templates
      this.prisma.workflowTemplate.count({ where: { tenantId } }),
      // Integration connections
      this.prisma.integrationConnection.count({ where: { tenantId } }),
      // Members
      this.prisma.membership.count({ where: { tenantId } }),
      // Workspaces
      this.prisma.workspace.count({ where: { tenantId } }),
      // Bandwidth (từ đầu tháng)
      this.prisma.usageRecord.aggregate({
        _sum: { value: true },
        where: { tenantId, category: 'bandwidth', recordedAt: { gte: mStart } },
      }),
    ]);

  return this.buildStatArray(limits, {
    aiCallsUsed: Math.round(aiAgg._sum.value ?? 0),
    storageUsedGB: Math.round(((storageAgg._sum.value ?? 0) / 1024) * 100) / 100,
    activeWorkflows: workflowCount,
    activeConnectors: connCount,
    activeMembers: memberCount,
    activeWorkspaces: wsCount,
    bandwidthUsedGB: Math.round((bwAgg._sum.value ?? 0) / 1024),
  });
}
```

#### Response type (`SubscriptionCurrentView`)

```typescript
interface SubscriptionCurrentView {
  subscription: {
    id: string;
    planKey: PlanKey;
    status: string;
    billingCycle: BillingCycle;
    startedAt: string | null;
    expiresAt: string | null;
    trialEndsAt: string | null;
    autoRenew: boolean;
    daysRemaining: number;
    totalDaysInCycle: number;
  } | null;

  usageStats: UsageStatItem[] | null;    // ← MỚI: mảng so sánh từng quota

  planDefinition: PlanColumnView | null; // ← MỚI: view model đầy đủ

  periodDetails: {                        // ← MỚI: thông số chu kỳ
    periodStart: string;
    periodEnd: string;
    utilizationRate: number;             // % hoàn thành chu kỳ (ngày đã qua / tổng ngày)
    nextBillingDate: string;
  } | null;
}

interface UsageStatItem {
  resource: string;       // 'ai_calls' | 'storage_gb' | 'workflows' | ...
  label: string;          // 'AI Calls' | 'Lưu trữ' | 'Workflow' | ...
  icon: string;           // '🤖' | '💾' | '🔧' | ...
  used: number;
  limit: number;
  limitDisplay: string;   // '5.000' | 'Không giới hạn'
  percent: number;        // 0–100 (0 khi unlimited)
  unit: string;           // '/tháng' | 'GB' | 'mẫu' | ...
  unlimited: boolean;
  overLimitAction: string | null; // 'block' | 'warn' | 'billable' — từ OverLimitPolicy
}
```

#### Rationale thiết kế

- **Mảng usageStats thay vì object**: Frontend cần render danh sách đồng bộ, dễ loop `.map()`. Object `{ aiCalls: {...}, storage: {...} }` không bảo toàn thứ tự hiển thị.
- **percent = 0 khi unlimited**: Tránh chia 0 trên frontend. 0% == "unlimited usage" không phải "chưa dùng gì".
- **overLimitAction kèm theo**: Frontend có thể hiển thị badge warning khi resource đang ở policy `'warn'` hoặc `'billable'` và gần đạt limit → proactive upsell.

---

### 3.2 `getAvailableSaaSPlans()` — Ma trận gói cước so sánh

#### Định danh

```typescript
// subscription.service.ts (thêm mới)

async getAvailableSaaSPlans(
  tenantId?: string,                     // optional: để xác định currentPlanKey
  targetCurrency?: Currency,             // optional: multi-currency
): Promise<AvailablePlansView>
```

#### Flow xử lý

```
1. Gọi getActivePlans() từ plan.config → PlanDefinition[] (sorted by sortOrder)
2. Nếu có tenantId:
   → findFirst Subscription active/trialing → lấy currentPlanKey
3. Với mỗi plan → toPlanColumnView(plan.key, currentPlanKey, targetCurrency)
4. Tính toán:
   - recommendedKey: plan có tag === 'Phổ biến' (pro, trong config)
   - monthly total: sum of monthly prices
   - cheapestMonthlyPrice: min monthly price (thường là free=0)
5. Return { plans[], currentPlanKey, metadata }
```

#### Nâng cấp `toPlanColumnView()` với multi-currency

```typescript
// THÊM THAM SỐ targetCurrency
private toPlanColumnView(
  key: PlanKey,
  currentPlanKey: PlanKey | null,
  targetCurrency?: Currency,
): PlanColumnView {
  const plan = PLAN_DEFINITIONS[key];

  // Giá monthly/yearly
  const monthlyTier = plan.prices.find((p) => p.billingCycle === 'monthly');
  const yearlyTier = plan.prices.find((p) => p.billingCycle === 'yearly');
  const monthlyPrice = monthlyTier?.priceVnd ?? 0;
  const yearlyPrice = yearlyTier?.priceVnd ?? 0;

  // Multi-currency conversion (nếu targetCurrency ! = VND)
  const conversion = targetCurrency && targetCurrency !== 'VND'
    ? this.billingService?.convertPrice ?? ((vnd: number) => vnd)
    : (vnd: number) => vnd;

  const monthlyDisplay = targetCurrency
    ? this.formatForeignCurrency(conversion(monthlyPrice), targetCurrency)
    : this.formatVnd(monthlyPrice);

  // … (phần limits + features giữ nguyên từ controller hiện tại)

  // CTA type nâng cấp
  let ctaType: 'current' | 'upgrade' | 'downgrade' | 'trial' | 'contact' = 'upgrade';
  if (isCurrent) ctaType = 'current';
  else if (key === 'enterprise') ctaType = 'contact';
  else if (currentPlanKey) {
    ctaType = comparePlanKeys(currentPlanKey, key) === 'downgrade' ? 'downgrade' : 'upgrade';
  } else if ((monthlyTier?.trialDays ?? 0) > 0) {
    ctaType = 'trial';
  }

  return {
    key,
    name, nameEn, description, tag, sortOrder,
    monthlyPrice, monthlyPriceDisplay: monthlyDisplay,
    yearlyPrice, yearlyPriceDisplay: /* format */,
    yearlyDiscountPercent: yearlyTier?.discountPercent ?? 0,
    trialDays: monthlyTier?.trialDays ?? 0,
    limits, features, isCurrent,
    highlighted: key === 'pro',
    ctaType, ctaLabel: this.ctaLabelFor(ctaType, plan),
  };
}
```

#### Response type (`AvailablePlansView`)

```typescript
interface AvailablePlansView {
  plans: PlanColumnView[];
  currentPlanKey: PlanKey | null;
  metadata: {
    recommendedKey: PlanKey | null;           // 'pro'
    planCount: number;
    monthlyTotal: number;                     // tổng monthly prices
    cheapestMonthly: number;                  // min monthly price
    currency: string;
    currencySymbol: string;
  };
}

interface PlanColumnView {
  key: PlanKey;
  name: string;
  nameEn: string;
  description: string;
  tag: string | null;                        // 'Phổ biến', null
  sortOrder: number;
  monthlyPrice: number;
  monthlyPriceDisplay: string;
  yearlyPrice: number;
  yearlyPriceDisplay: string;
  yearlyDiscountPercent: number;             // 0 | 17
  trialDays: number;
  limits: ResourceLimitDisplay[];            // ← đã có
  features: FeatureDisplay[];                // ← đã có
  isCurrent: boolean;
  highlighted: boolean;                      // pro = true
  ctaType: 'current' | 'upgrade' | 'downgrade' | 'trial' | 'contact';
  ctaLabel: string;
}
```

#### Rationale thiết kế

- **Không đọc DB cho mỗi plan**: PLAN_DEFINITIONS là static config, không cần truy vấn DB. Chỉ 1 query duy nhất để lấy currentPlanKey (nếu có tenantId).
- **Map toàn bộ field của PlanColumnView ở backend**: Frontend không cần logic compare/render phức tạp. Backend trả view model ready-to-render.
- **metadata block**: Frontend cần recommendedKey để bôi xanh gói "Best Value", cheapestMonthly để hiển thị "Bắt đầu từ X₫/tháng".

---

### 3.3 `getPreviewProratedQuote()` — Engine xem trước chi phí

#### Định danh

```typescript
// subscription.service.ts (thêm mới)

async getPreviewProratedQuote(
  tenantId: string,
  subscriptionId: string,
  targetPlanKey: PlanKey,
  targetCycle: BillingCycle,
  immediate: boolean,
): Promise<ProrationPreviewView>
```

#### Flow xử lý

```
1. IDOR guard → tenantId đã resolve từ header
2. Validation: targetPlanKey tồn tại trong PLAN_DEFINITIONS → BadRequest nếu không
3. Load subscription với ràng buộc WHERE tenantId (chống IDOR):
   - subscription = findFirst({ id: subscriptionId, tenantId, status IN ['active','trialing'] })
   - Nếu null → 404 hoặc BadRequest
4. Parse oldPlanKey = sub.planKey
5. Gọi calculateProratedPricing() PURE FUNCTION (đã có trong service):
   - Input: oldPlanKey, newPlanKey, oldCycle (auto-detect), newCycle, periodStart, periodEnd, now
   - Output: ProrationDetail { chargeAmount, creditAmount, effectiveFrom, newExpiresAt, ... }
6. Lấy wallet balance (read-only, ràng buộc tenantId):
   - wallet = prisma.wallet.findUnique({ tenantId })
   - balanceVND = Number(wallet.balance) / 100
7. Tính toán display fields:
   - direction: comparePlanKeys()
   - isCharged: chargeAmount > 0
   - isCredited: creditAmount > 0
   - sufficientBalance: balanceVND >= chargeAmount
   - shortfallAmount: max(0, chargeAmount - balanceVND)
   - Tất cả amount → formatVnd()
   - Tất cả Date → formatDate()
8. Trả về ProrationPreviewView
```

#### Response type (`ProrationPreviewView`)

```typescript
interface ProrationPreviewView {
  // Identification
  currentPlanKey: PlanKey;
  currentPlanName: string;
  targetPlanKey: PlanKey;
  targetPlanName: string;
  direction: 'upgrade' | 'downgrade' | 'crossgrade' | 'same';

  // Proration details
  oldPlanRemainingDays: number;
  oldPlanTotalDays: number;
  oldPlanRemainingValue: number;
  oldPlanRemainingDisplay: string;         // "45.500₫"

  newPlanTotalPrice: number;
  newPlanTotalDisplay: string;             // "490.000₫"
  newPlanProratedPrice: number;
  newPlanProratedDisplay: string;          // "120.000₫"

  chargeAmount: number;
  chargeDisplay: string;                   // "74.500₫"
  creditAmount: number;
  creditDisplay: string;                   // "0₫"

  // Effective timeline
  effectiveFrom: string;                   // ISO string
  effectiveFromDisplay: string;            // "24 Thg 6, 2026"
  newExpiresAt: string;                    // ISO string
  newExpiresAtDisplay: string;             // "24 Thg 7, 2026"

  // Wallet check
  walletBalance: number;
  walletBalanceDisplay: string;            // "500.000₫"
  sufficientBalance: boolean;
  shortfallAmount: number;
  shortfallDisplay: string;                // "0₫" or "74.500₫"

  // Upgrade memo (cho immediate=false)
  scheduled: boolean;
  scheduledNextPeriodStartDisplay: string | null;
}
```

#### Cache hint cho frontend

```typescript
// Response headers
@Header('Cache-Control', 'private, max-age=30')
// Proration preview là ephemeral — giá trị thay đổi theo thời gian thực
// Cache 30s: đủ tránh reload spam, không đủ lâu để outdated
```

#### Biểu đồ quyết định thu/hoàn

```
                    ┌─────────────┐
                    │ direction = │
                    │ compareKeys │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
     upgrade           downgrade       crossgrade/same
          │                │                │
          ▼                ▼                ▼
  newProrated >       oldRemain >      charge=0
  oldRemain?          newProrated?     credit=0
   ───── YES ───      ─── YES ───
  chargeAmount =      creditAmount =
  newProrated -       oldRemain -
  oldRemain           newProrated
```

---

## IV. KIẾN TRÚC IDOR PROTECTION — Lớp bảo vệ thống nhất

### 4.1 `subscription.idor.provider.ts` — Singleton Provider

```typescript
// [MỚI] subscription.idor.provider.ts

@Injectable()
export class SubscriptionIdorProvider {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * resolveTenantId() — Bóc tách tenantId từ header context.
   *
   * Ưu tiên:
   *   1) x-tenant-id (ưu tiên cao nhất) — UUID của tenant
   *   2) x-tenant-slug — slug của tenant (tra cứu Tenant.slug → Tenant.id)
   *   3) Nếu không có header nào → throw UnauthorizedException
   *
   * CHỐNG IDOR: tenantId KHÔNG BAO GIỜ lấy từ body, query, params.
   * Mọi truy vấn DB sau đó đều ràng buộc WHERE tenantId = resolvedValue.
   * Tenant A không thể đọc data của Tenant B dù có đoán đúng subscriptionId.
   */
  async resolveTenantId(
    headers: Record<string, string | string[] | undefined>,
    required = true,
  ): Promise<string> {
    const headerId = extractFirst(headers['x-tenant-id']);
    if (headerId && isValidUUID(headerId)) {
      const t = await this.prisma.tenant.findUnique({
        where: { id: headerId },
        select: { id: true },
      });
      if (t) return t.id;
    }

    const slug = extractFirst(headers['x-tenant-slug']);
    if (slug) {
      const t = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (t) return t.id;
    }

    if (required) {
      throw new UnauthorizedException(
        'x-tenant-id or x-tenant-slug header is required',
      );
    }
    return '';
  }
}
```

### 4.2 Áp dụng cho tất cả Controller

**Mutation Controller** (`POST` endpoints — giữ nguyên subscription.controller.ts):
- `@Headers('x-tenant-id') tenantIdHeader?` — required
- Gọi `IdorProvider.resolveTenantId()` ngay đầu handler
- KHÔNG cho phép slug nếu không muốn (mutation nghiêm ngặt hơn)

**Query Controller** (`GET` endpoints — subscription.query.controller.ts mới):
- `@Headers('x-tenant-id') tenantIdHeader?` + `@Headers('x-tenant-slug') slugHeader?`
- Gọi `IdorProvider.resolveTenantId({ 'x-tenant-id': header, 'x-tenant-slug': slug })` — required cho read
- Mọi Prisma query đều thêm `where: { tenantId: resolvedId }`

---

## V. CẤU TRÚC CONTROLLER MỚI — Phân tách rõ quyền

### 5.1 `subscription.query.controller.ts` (mới)

```typescript
@Controller('billing/subscription')
export class SubscriptionQueryController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly idor: SubscriptionIdorProvider,
  ) {}

  // ────────── READ-ONLY ENDPOINTS ──────────

  @Get('current')
  @Header('Cache-Control', 'private, max-age=60')
  async getCurrent(
    @Headers() headers: Record<string, any>,
  ): Promise<SubscriptionCurrentView> {
    const tenantId = await this.idor.resolveTenantId(headers);
    return this.subscriptionService.getCurrentSubscriptionDetails(tenantId);
  }

  @Get('plans')
  @Header('Cache-Control', 'public, max-age=300, s-maxage=600')
  async getPlans(
    @Headers() headers: Record<string, any>,
    @Query('currency') currency?: string,
  ): Promise<AvailablePlansView> {
    // Tenant optional — nếu có header thì resolve lấy currentPlanKey
    const tenantId = await this.idor.resolveTenantId(headers, false);
    return this.subscriptionService.getAvailableSaaSPlans(
      tenantId || undefined,
      (currency as Currency) || undefined,
    );
  }

  @Get('prorate')
  @Header('Cache-Control', 'private, max-age=30')
  async getProrate(
    @Query('subscriptionId') subscriptionId: string,
    @Query('targetPlanKey') targetPlanKey: string,
    @Query('targetCycle') targetCycle: string,
    @Query('immediate') immediate?: string,
    @Headers() headers?: Record<string, any>,
  ): Promise<ProrationPreviewView> {
    if (!subscriptionId) throw new BadRequestException('subscriptionId is required');
    if (!targetPlanKey) throw new BadRequestException('targetPlanKey is required');

    const tenantId = await this.idor.resolveTenantId(headers ?? {});
    const cycle: BillingCycle = targetCycle === 'yearly' ? 'yearly' : 'monthly';
    const imm = immediate === 'true';

    return this.subscriptionService.getPreviewProratedQuote(
      tenantId,
      subscriptionId,
      targetPlanKey as PlanKey,
      cycle,
      imm,
    );
  }
}
```

### 5.2 Cập nhật `subscription.module.ts`

```typescript
@Module({
  imports: [LedgerModule],
  controllers: [
    SubscriptionController,           // mutation: POST upgrade + cancel
    SubscriptionQueryController,      // [MỚI] query: GET current + plans + prorate
  ],
  providers: [
    SubscriptionService,
    PlanGuard,
    SubscriptionIdorProvider,         // [MỚI]
    PrismaService,
  ],
  exports: [SubscriptionService, PlanGuard],
})
export class SubscriptionModule {}
```

### 5.3 Route map tổng thể

| Method | Endpoint | Controller | File | IDOR Check |
|--------|----------|-----------|------|-----------|
| POST | `/billing/subscription/upgrade` | `SubscriptionController` | `subscription.controller.ts` | x-tenant-id |
| POST | `/billing/subscription/cancel` | `SubscriptionController` | `subscription.controller.ts` | x-tenant-id |
| **GET** | **`/billing/subscription/current`** | **`SubscriptionQueryController`** [MỚI] | **`subscription.query.controller.ts`** [MỚI] | x-tenant-id \| x-tenant-slug |
| **GET** | **`/billing/subscription/plans`** | **`SubscriptionQueryController`** [MỚI] | **`subscription.query.controller.ts`** [MỚI] | optional |
| **GET** | **`/billing/subscription/prorate`** | **`SubscriptionQueryController`** [MỚI] | **`subscription.query.controller.ts`** [MỚI] | x-tenant-id \| x-tenant-slug |

---

## VI. TYPE DEFINITIONS BỔ SUNG (subscription.types.ts)

```typescript
// ================================================================
// READ-ONLY VIEW MODELS — phục vụ Subscription UI
// ================================================================

// ── getCurrentSubscriptionDetails() ─────────────────────────────

export interface SubscriptionCurrentView {
  subscription: CurrentSubscriptionInfo | null;
  usageStats: UsageStatItem[] | null;
  planDefinition: PlanColumnView | null;
  periodDetails: PeriodDetail | null;
}

export interface CurrentSubscriptionInfo {
  id: string;
  planKey: PlanKey;
  status: string;
  billingCycle: BillingCycle;
  startedAt: string | null;
  expiresAt: string | null;
  trialEndsAt: string | null;
  autoRenew: boolean;
  daysRemaining: number;
  totalDaysInCycle: number;
}

export interface UsageStatItem {
  resource: string;
  label: string;
  icon: string;
  used: number;
  limit: number;
  limitDisplay: string;
  percent: number;
  unit: string;
  unlimited: boolean;
  overLimitAction: string | null;
}

export interface PeriodDetail {
  periodStart: string;
  periodEnd: string;
  utilizationRate: number;
  nextBillingDate: string;
}

// ── getAvailableSaaSPlans() ─────────────────────────────────────

export interface AvailablePlansView {
  plans: PlanColumnView[];
  currentPlanKey: PlanKey | null;
  metadata: {
    recommendedKey: PlanKey | null;
    planCount: number;
    monthlyTotal: number;
    cheapestMonthly: number;
    currency: string;
    currencySymbol: string;
  };
}

// Lưu ý: PlanColumnView đã có sẵn trong controller — cần
// chuyển vào types.ts để dùng chung giữa service + controller.

export interface PlanColumnView {
  key: PlanKey;
  name: string;
  nameEn: string;
  description: string;
  tag: string | null;
  sortOrder: number;
  monthlyPrice: number;
  monthlyPriceDisplay: string;
  yearlyPrice: number;
  yearlyPriceDisplay: string;
  yearlyDiscountPercent: number;
  trialDays: number;
  limits: ResourceLimitDisplay[];
  features: FeatureDisplay[];
  isCurrent: boolean;
  highlighted: boolean;
  ctaType: 'current' | 'upgrade' | 'downgrade' | 'trial' | 'contact';
  ctaLabel: string;
}

export interface ResourceLimitDisplay {
  key: string;
  label: string;
  icon: string;
  displayValue: string;
  rawValue: number;
  unlimited: boolean;
}

export interface FeatureDisplay {
  key: string;
  value: boolean;
}

// ── getPreviewProratedQuote() ───────────────────────────────────

export interface ProrationPreviewView {
  currentPlanKey: PlanKey;
  currentPlanName: string;
  targetPlanKey: PlanKey;
  targetPlanName: string;
  direction: 'upgrade' | 'downgrade' | 'crossgrade' | 'same';

  oldPlanRemainingDays: number;
  oldPlanTotalDays: number;
  oldPlanRemainingValue: number;
  oldPlanRemainingDisplay: string;
  newPlanTotalPrice: number;
  newPlanTotalDisplay: string;
  newPlanProratedPrice: number;
  newPlanProratedDisplay: string;
  chargeAmount: number;
  chargeDisplay: string;
  creditAmount: number;
  creditDisplay: string;

  effectiveFrom: string;
  effectiveFromDisplay: string;
  newExpiresAt: string;
  newExpiresAtDisplay: string;

  walletBalance: number;
  walletBalanceDisplay: string;
  sufficientBalance: boolean;
  shortfallAmount: number;
  shortfallDisplay: string;

  scheduled: boolean;
  scheduledNextPeriodStartDisplay: string | null;
}
```

---

## VII. DEPENDENCY GRAPH — Subscription Core

```
SubscriptionQueryController (mới)          SubscriptionController (hiện có)
         │                                          │
         ├── SubscriptionIdorProvider (mới)         ├── PlanGuard
         │         └── PrismaService                │         └── PrismaService
         │                                          │
         └── SubscriptionService                    └── SubscriptionService
                   │                                          │
                   ├── calculateProratedPricing()             ├── upgradeSubscriptionPlan()
                   ├── getCurrentSubscriptionDetails() [MỚI] ├── cancelWithRefund()
                   ├── getAvailableSaaSPlans()        [MỚI]  │
                   └── getPreviewProratedQuote()      [MỚI]  └── LedgerService
                                                                            │
                                                                    Wallet / LedgerTransaction
```

---

## VIII. EDGE CASES & XỬ LÝ

### `getCurrentSubscriptionDetails()`

| Edge case | Hành vi |
|-----------|---------|
| Tenant chưa có subscription nào | Return `{ subscription: null, usageStats: null, planDefinition: null, periodDetails: null }` |
| Subscription đã hết hạn nhưng chưa có mới | status filter 'active'|'trialing' sẽ loại — return null |
| periodStart = null (legacy data) | Fallback về `sub.createdAt` |
| UsageRecord category chưa có data | `aggregate._sum.value` = null → `Math.round(null ?? 0)` = 0 |
| limit = -1 (unlimited) | percent = 0, limitDisplay = 'Không giới hạn', overLimitAction = null |
| Chu kỳ 0 ngày (vừa tạo) | `totalDaysInCycle` = 1 (tránh chia 0 cho utilizationRate) |

### `getAvailableSaaSPlans()`

| Edge case | Hành vi |
|-----------|---------|
| Tenant chưa login (no header) | `resolveTenantId(required=false)` → '' → currentPlanKey = null |
| Không còn plan nào active | `plans: []`, nhưng PLAN_DEFINITIONS luôn có ít nhất free active |
| Currency không hỗ trợ | Fallback về VND, ghi log.warn |
| yearly tier không có | Fallback về tính yearlyPrice = monthlyPrice * 12 * (1 - discountPercent / 100) |

### `getPreviewProratedQuote()`

| Edge case | Hành vi |
|-----------|---------|
| subscriptionId không thuộc tenant | `findFirst` WHERE tenantId trả null → BadRequest |
| targetPlanKey không tồn tại | `getPlan()` trả null → BadRequest |
| upgrade lên cùng gói | `direction = 'same'` → charge=0, credit=0 → return ProrationPreviewView với direction='same' |
| immediate=false + upgrade | `chargeAmount = newPlanTotalPrice`, tính nợ đủ full price kỳ sau |
| wallet không tồn tại (chưa topup) | `walletBalanceDisplay = "0₫"`, sufficientBalance = (charge === 0) |
| Chu kỳ yearly → monthly | `oldCycle` detect = 'yearly', `newCycle` = 'monthly' → cross-cycle proration chính xác |
| periodEnd < now (subscription quá hạn) | `remainingDays = 0` → charge = full newPlan | credit = 0 |

---

## IX. IMPLEMENTATION ORDER (Recommended)

```
Step 1: subscription.types.ts        — thêm view model types (5 phút)
Step 2: subscription.idor.provider.ts — tạo mới (5 phút)
Step 3: subscription.service.ts      — thêm 3 method read-only (25 phút)
Step 4: subscription.query.controller.ts — tạo mới (10 phút)
Step 5: subscription.module.ts       — cập nhật registration (2 phút)
Step 6: subscription.controller.ts   — xoá 3 GET handlers cũ (1 phút)
```

**Tổng thời gian ước tính:** ~48 phút implementation + 15 phút verify build.

---

## X. KẾT LUẬN

Hệ thống Subscription Core Endpoints đã có nền tảng vững chắc:

- ✅ `PLAN_DEFINITIONS` single source of truth — không cần thay đổi
- ✅ `calculateProratedPricing()` pure function — đã testable, chỉ cần gọi lại
- ✅ `PlanGuard` resource enforcement — giữ nguyên
- ✅ 2 mutation endpoints (upgrade + cancel) — hoàn chỉnh, giữ nguyên

Cần nâng cấp 3 read-only endpoints, phân tách controller theo quyền hạn (mutation vs query), chuẩn hóa IDOR protection, và thêm view model types.

**Kiến trúc được thiết kế để frontend chỉ cần `fetch()` và render — zero business logic ở client phía subscription.**

---

*Tài liệu này được sinh ra từ codebase scan thực tế. Mọi đường dẫn và schema reference đều khớp với code hiện tại.*

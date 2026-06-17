# Billing Subscription Management & Plan Upgrades Service
> **Phase 3 — Kiến trúc phân hệ subscription backend**
> Cập nhật: 2026-06-17 | Trạng thái: DESIGN DRAFT — chờ implement

---

## I. BỐI CẢNH & HIỆN TRẠNG

### Hiện trạng codebase (đã có)

| Module | Trạng thái | Ghi chú |
|---|---|---|
| `apps/api/prisma/schema.prisma` | ✅ Full schema | `SubscriptionPlan`, `Subscription`, `BillingAccount`, `Invoice`, `PaymentTransaction`, `UsageRecord`, `Wallet`, `LedgerTransaction` |
| `apps/api/src/billing` | ⚠️ Foundation | `billing.service.ts` có seed plan, subscribe cơ bản, subscribe-and-pay |
| `apps/api/src/payments` | ✅ Payments core | VNPay/MoMo/Stripe gateways, SubscriptionActivator, Ledger, Refund |
| `apps/api/src/payments/ledger` | ✅ Production-grade | Wallet với optimistic lock + append-only ledger + idempotency |
| `apps/api/src/payments/subscription-activator.service.ts` | ⚠️ Partial | Only activate-by-payment (computeExpiry + activateFromInvoice). Chưa có upgrade/downgrade |

### Gap phân tích (so với Phase 3 yêu cầu)

| Yêu cầu Phase 3 | Hiện tại | Gap |
|---|---|---|
| Plan configuration file (hằng số định nghĩa) | Hardcoded trong `billing.service.ts` seedDefaultPlans() | ❌ Không có file constants riêng cho limits/features |
| `upgradeSubscriptionPlan()` — prorated | `subscribe()` chỉ deactivate old + create new | ❌ Không prorate, không refund | 
| Plan Guard Middleware — check limits runtime | Không có | ❌ Gần như không chặn gì |
| Feature gating theo plan | `SubscriptionPlan.features` JSON field có, nhưng không có check runtime | ❌ Không integrated |
| Usage metering hooks vào guard | `UsageRecord` model có | ❌ Không kết nối với guard |
| Auto-renew + past-due handling | `autoRenew` field có, nhưng không có scheduled job | ❌ Thiếu hoàn toàn |
| Plan changelog / history | `Subscription` có status history (active → cancelled), nhưng không có `SubscriptionChangeLog` model | ⚠️ Schema gap nhỏ |

---

## II. KIẾN TRÚC FILE MỚI

Toàn bộ logic subscription mới được đặt trong bounded context riêng:
```
apps/api/src/payments/subscription/
├── plan.config.ts                    # [MỚI] Hằng số định nghĩa gói cước (core logic 1)
├── plan.config.spec.ts               # [MỚI] Unit test plan.config
├── subscription.types.ts             # [MỚI] Types/DTOs cho subscription service
├── subscription.service.ts           # [MỚI] upgradeSubscriptionPlan() + prorated + cancel (core logic 2)
├── subscription.service.spec.ts      # [MỚI] Unit test subscription service
├── subscription.controller.ts        # [MỚI] REST endpoints: upgrade, downgrade, cancel, change-log
├── subscription.module.ts            # [MỚI] NestJS module, import PrismaService, LedgerModule, BillingModule
├── plan-guard.middleware.ts          # [MỚI] Plan Guard Middleware (core logic 3)
├── plan-guard.middleware.spec.ts     # [MỚI] Unit test plan guard
└── README.md                         # [MỚI] Documentation cho dev

Cập nhật file hiện tại:
├── payments.module.ts                # [CẬP NHẬT] Import SubscriptionModule
├── app.module.ts                     # [CẬP NHẬT] Nếu chưa có subscription routes
├── billing/billing.service.ts        # [CẬP NHẬT] Seed plans từ plan.config.ts thay vì hardcode
```

### Tổng số file mới: **9 file** (6 code + 3 spec)

---

## III. CORE LOGIC 1 — Plan Configuration (`plan.config.ts`)

### Mục đích
File duy nhất định nghĩa tất cả gói cước dưới dạng mảng hằng số **typed**, bao gồm:
- Hạn mức tài nguyên (resource limits)
- Giá tiền theo từng loại billing cycle
- Feature flags
- Override policy (miễn phí vượt mức có tính phí không?)

### Thiết kế

```typescript
// ================================================================
// plan.config.ts — Plan Configuration Constants
// ================================================================
// File DUY NHẤT định nghĩa gói cước. Mọi module khác (billing service,
// plan guard, frontend pricing page) đều đọc từ đây.
// ================================================================

export type PlanKey = 'free' | 'starter' | 'pro' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

/** Resource limit definitions */
export interface PlanLimits {
  maxUsers: number;           // -1 = unlimited
  maxWorkspaces: number;      // workspaces per tenant
  maxWorkflows: number;       // active workflow templates
  maxWorkflowNodes: number;   // max nodes per workflow
  maxConnectors: number;      // active integration connections
  maxNotifications: number;   // notifications per month
  aiCallsMonthly: number;     // AI API calls per month
  storageGB: number;          // storage limit in GB
  bandwidthGB: number;        // monthly bandwidth in GB
  apiRateLimit: number;       // requests/minute
}

/** Feature flags */
export interface PlanFeatures {
  localMode: boolean;           // can run locally
  cloudBackup: boolean;         // automatic cloud backup
  multiDevice: boolean;         // multi-device sync
  marketplace: boolean;         // access to connector/template marketplace
  apiAccess: boolean;           // REST API + API keys
  analytics: boolean;           // analytics dashboard
  customDomain: boolean;        // custom domain support
  whiteLabel: boolean;          // remove AIFUT branding
  prioritySupport: boolean;     // priority support channel
  slaGuarantee: boolean;        // SLA guarantee
}

/** Over-billing policy: action when tenant exceeds limit */
export type OverLimitAction =
  | 'block'         // block the operation, return PLAN_LIMIT_REACHED
  | 'warn'          // allow but log warning
  | 'billable'      // allow and bill per unit over limit
  ;

export interface PlanOverLimitPolicy {
  users: OverLimitAction;
  workflows: OverLimitAction;
  connectors: OverLimitAction;
  aiCalls: OverLimitAction;
  storage: OverLimitAction;
}

/** Price tier for a single billing cycle */
export interface PlanPriceTier {
  billingCycle: BillingCycle;
  priceVnd: number;       // price in VND (source of truth)
  priceUsd: number;       // converted at VND/25400
  trialDays: number;      // 0 = no trial
  discountPercent: number; // relative to monthly * 12 for yearly
}

/** Complete plan definition */
export interface PlanDefinition {
  key: PlanKey;
  name: string;               // Vietnamese display name
  nameEn: string;             // English display name
  description: string;
  descriptionEn: string;
  tag?: string;               // "Phổ biến", "Best Value", etc.
  sortOrder: number;          // display order
  isActive: boolean;
  
  // Pricing
  prices: PlanPriceTier[];
  
  // Limits
  limits: PlanLimits;
  
  // Features
  features: PlanFeatures;
  
  // Over-limit policy
  overLimitPolicy: PlanOverLimitPolicy;
}

// ================================================================
// PLAN_DEFINITIONS — The single source of truth
// ================================================================

export const PLAN_DEFINITIONS: Record<PlanKey, PlanDefinition> = {
  free: {
    key: 'free',
    name: 'Miễn phí',
    nameEn: 'Free',
    description: 'Dùng thử miễn phí với các tính năng cơ bản',
    descriptionEn: 'Try free with basic features',
    tag: '',
    sortOrder: 0,
    isActive: true,
    prices: [
      { billingCycle: 'monthly', priceVnd: 0, priceUsd: 0, trialDays: 0, discountPercent: 0 },
    ],
    limits: {
      maxUsers: 1,
      maxWorkspaces: 1,
      maxWorkflows: 3,
      maxWorkflowNodes: 10,
      maxConnectors: 2,
      maxNotifications: 100,
      aiCallsMonthly: 500,
      storageGB: 1,
      bandwidthGB: 1,
      apiRateLimit: 10,
    },
    features: {
      localMode: true,
      cloudBackup: false,
      multiDevice: false,
      marketplace: false,
      apiAccess: false,
      analytics: false,
      customDomain: false,
      whiteLabel: false,
      prioritySupport: false,
      slaGuarantee: false,
    },
    overLimitPolicy: {
      users: 'block',
      workflows: 'block',
      connectors: 'block',
      aiCalls: 'block',
      storage: 'block',
    },
  },

  starter: {
    key: 'starter',
    name: 'Cơ bản',
    nameEn: 'Starter',
    description: 'Cho cá nhân và cửa hàng nhỏ',
    descriptionEn: 'For individuals and small shops',
    tag: '',
    sortOrder: 1,
    isActive: true,
    prices: [
      { billingCycle: 'monthly', priceVnd: 99000, priceUsd: 3.90, trialDays: 7, discountPercent: 0 },
      { billingCycle: 'yearly',  priceVnd: 990000, priceUsd: 39, trialDays: 14, discountPercent: 17 },
    ],
    limits: {
      maxUsers: 1,
      maxWorkspaces: 1,
      maxWorkflows: 10,
      maxWorkflowNodes: 20,
      maxConnectors: 5,
      maxNotifications: 1000,
      aiCallsMonthly: 1000,
      storageGB: 5,
      bandwidthGB: 10,
      apiRateLimit: 30,
    },
    features: {
      localMode: true,
      cloudBackup: true,
      multiDevice: false,
      marketplace: false,
      apiAccess: false,
      analytics: false,
      customDomain: false,
      whiteLabel: false,
      prioritySupport: false,
      slaGuarantee: false,
    },
    overLimitPolicy: {
      users: 'warn',
      workflows: 'block',
      connectors: 'warn',
      aiCalls: 'billable',
      storage: 'warn',
    },
  },

  pro: {
    key: 'pro',
    name: 'Chuyên nghiệp',
    nameEn: 'Professional',
    description: 'Cho doanh nghiệp vừa và nhỏ',
    descriptionEn: 'For small and medium businesses',
    tag: 'Phổ biến',
    sortOrder: 2,
    isActive: true,
    prices: [
      { billingCycle: 'monthly', priceVnd: 490000, priceUsd: 19.30, trialDays: 7, discountPercent: 0 },
      { billingCycle: 'yearly',  priceVnd: 4900000, priceUsd: 193, trialDays: 14, discountPercent: 17 },
    ],
    limits: {
      maxUsers: 5,
      maxWorkspaces: 3,
      maxWorkflows: -1,    // unlimited
      maxWorkflowNodes: 50,
      maxConnectors: 20,
      maxNotifications: 10000,
      aiCallsMonthly: 5000,
      storageGB: 50,
      bandwidthGB: 100,
      apiRateLimit: 100,
    },
    features: {
      localMode: true,
      cloudBackup: true,
      multiDevice: true,
      marketplace: true,
      apiAccess: true,
      analytics: true,
      customDomain: false,
      whiteLabel: false,
      prioritySupport: false,
      slaGuarantee: false,
    },
    overLimitPolicy: {
      users: 'warn',
      workflows: 'warn',
      connectors: 'warn',
      aiCalls: 'billable',
      storage: 'billable',
    },
  },

  enterprise: {
    key: 'enterprise',
    name: 'Doanh nghiệp',
    nameEn: 'Enterprise',
    description: 'Cho tổ chức lớn với yêu cầu cao',
    descriptionEn: 'For large organizations with high demands',
    tag: 'Liên hệ',
    sortOrder: 3,
    isActive: true,
    prices: [
      { billingCycle: 'monthly', priceVnd: 1990000, priceUsd: 78.35, trialDays: 0, discountPercent: 0 },
      { billingCycle: 'yearly',  priceVnd: 19900000, priceUsd: 783.50, trialDays: 0, discountPercent: 17 },
    ],
    limits: {
      maxUsers: -1,        // unlimited
      maxWorkspaces: -1,   // unlimited
      maxWorkflows: -1,
      maxWorkflowNodes: -1,
      maxConnectors: -1,
      maxNotifications: -1,
      aiCallsMonthly: 50000,
      storageGB: 500,
      bandwidthGB: 1000,
      apiRateLimit: 1000,
    },
    features: {
      localMode: true,
      cloudBackup: true,
      multiDevice: true,
      marketplace: true,
      apiAccess: true,
      analytics: true,
      customDomain: true,
      whiteLabel: true,
      prioritySupport: true,
      slaGuarantee: true,
    },
    overLimitPolicy: {
      users: 'warn',
      workflows: 'warn',
      connectors: 'warn',
      aiCalls: 'billable',
      storage: 'billable',
    },
  },
};

// ================================================================
// Helper utilities
// ================================================================

/** Lấy PlanDefinition theo key */
export function getPlan(key: PlanKey | string): PlanDefinition | null {
  return PLAN_DEFINITIONS[key as PlanKey] ?? null;
}

/** Lấy tất cả plan đang active */
export function getActivePlans(): PlanDefinition[] {
  return Object.values(PLAN_DEFINITIONS)
    .filter((p) => p.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Kiểm tra một limit có phải "unlimited" không */
export function isUnlimited(value: number): boolean {
  return value === -1;
}

/** So sánh hai plan keys: trả về 'upgrade' | 'downgrade' | 'same' | 'crossgrade' */
export function comparePlanKeys(current: PlanKey, target: PlanKey): 'upgrade' | 'downgrade' | 'same' | 'crossgrade' {
  if (current === target) return 'same';
  const order: PlanKey[] = ['free', 'starter', 'pro', 'enterprise'];
  const curIdx = order.indexOf(current);
  const tgtIdx = order.indexOf(target);
  if (curIdx < tgtIdx) return 'upgrade';
  if (curIdx > tgtIdx) return 'downgrade';
  return 'crossgrade';
}

/** Lấy giá VND cho plan + billing cycle */
export function getPlanPrice(planKey: PlanKey, cycle: BillingCycle = 'monthly'): number {
  const plan = PLAN_DEFINITIONS[planKey];
  if (!plan) return 0;
  const tier = plan.prices.find((p) => p.billingCycle === cycle);
  return tier?.priceVnd ?? 0;
}
```

### Nguyên tắc thiết kế
1. **Single Source of Truth**: Mọi logic về hạn mức, giá, tính năng đều từ `PLAN_DEFINITIONS`. Backend DB `SubscriptionPlan` chỉ là cache/sync của config này.
2. **Typed strong**: TypeScript `PlanKey` là union type, không thể pass sai.
3. **Over-limit policy rõ ràng**: Mỗi resource có policy riêng (block/warn/billable), guard middleware dựa vào đây để quyết định.
4. **Billing cycle độc lập**: Mỗi plan có thể có nhiều `PlanPriceTier` (monthly, yearly). `discountPercent` tính yearly so với monthly × 12.

---

## IV. CORE LOGIC 2 — `upgradeSubscriptionPlan()` (`subscription.service.ts`)

### Yêu cầu
Dùng **Prisma interactive transaction** + **Row-level lock** (`FOR UPDATE`) để:
1. Kiểm tra wallet balance
2. Tính toán **prorated pricing** (khấu trừ/thêm tiền dựa trên thời gian còn lại của gói cũ)
3. Cập nhật `Subscription` record
4. Ghi `LedgerTransaction` debit/credit tương ứng
5. Tạo `Invoice` prorated nếu cần

### Thiết kế hàm

```typescript
// subscription.types.ts

export interface UpgradeSubscriptionInput {
  tenantId: string;
  currentSubscriptionId: string;
  targetPlanKey: PlanKey;
  targetCycle: BillingCycle;    // monthly | yearly
  immediate: boolean;           // true = upgrade ngay, false = scheduled for next period
}

export interface UpgradeResult {
  success: boolean;
  oldPlanKey: string;
  newPlanKey: string;
  
  // Proration details
  proration: {
    oldPlanRemainingDays: number;
    oldPlanTotalDays: number;
    oldPlanRemainingValue: number;   // value of remaining time in VND
    newPlanTotalPrice: number;       // full price of new plan
    newPlanProratedPrice: number;    // price to charge after credit
    
    isUpgrade: boolean;
    chargeAmount: number;            // amount to charge (0 if credit covers it)
    creditAmount: number;            // amount to credit back
    
    effectiveFrom: Date;
    newExpiresAt: Date;
  };
  
  // Transaction references
  ledgerTransactionId?: string;
  invoiceId?: string;
  
  subscription: any;  // updated Subscription record
}

export interface ProratedPricingInput {
  oldPlanKey: PlanKey;
  newPlanKey: PlanKey;
  oldCycle: BillingCycle;
  newCycle: BillingCycle;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;    // current expiry
  upgradeTime: Date;         // now
}
```

### Thuật toán prorated pricing (chi tiết)

```
PRORATED PRICING ALGORITHM
========================================

Input:
  - oldPlanKey, newPlanKey
  - oldCycle, newCycle
  - currentPeriodStart (when current sub started or was last renewed)
  - currentPeriodEnd   (when current sub expires)
  - upgradeTime        (now)

Step 1. Tính thời gian còn lại
  totalDays    = currentPeriodEnd - currentPeriodStart (days)
  usedDays     = upgradeTime - currentPeriodStart
  remainingDays = max(0, totalDays - usedDays)

  Example: FREE → PRO, 15 days into a 30-day month
    totalDays = 30, usedDays = 15, remainingDays = 15

Step 2. Giá mỗi ngày của gói cũ (đã đóng)
  oldPlanPrice = getPlanPrice(oldPlanKey, oldCycle)
  oldDailyRate = oldPlanPrice / totalDays

  Example: FREE price = 0 → oldDailyRate = 0

Step 3. Giá mỗi ngày của gói mới
  newPlanPrice = getPlanPrice(newPlanKey, newCycle)
  newDailyRate = newPlanPrice / totalDays

Step 4. Tính toán credit và charge
  remainingCreditValue = oldDailyRate * remainingDays  // giá trị còn lại của gói cũ
  newCostRemaining     = newDailyRate * remainingDays  // chi phí gói mới cho tgian còn lại

  if (comparePlanKeys == 'upgrade'):
    // Cần trả thêm: newCostRemaining - remainingCreditValue
    chargeAmount = max(0, newCostRemaining - remainingCreditValue)
    creditAmount = 0

  if (comparePlanKeys == 'downgrade'):
    // Hoàn lại: remainingCreditValue - newCostRemaining
    chargeAmount = 0
    creditAmount = max(0, remainingCreditValue - newCostRemaining)

  if (comparePlanKeys == 'crossgrade'):
    // Same price tier → chỉ khác feature, không charge/credit
    chargeAmount = 0
    creditAmount = 0

Step 5. Xác định effective date và new expiry
  if (immediate):
    effectiveFrom = upgradeTime
    // New expiry = upgradeTime + remainingDays (hoặc newCycle mới tùy policy)
    // Policy: UPGRADE giữ nguyên expiry cycle cũ
    //          DOWNGRADE có thể đặt lại expiry theo cycle mới
    if (comparePlanKeys == 'upgrade'):
      newExpiresAt = currentPeriodEnd  // giữ nguyên expiry
    else:
      newExpiresAt = add_months(upgradeTime, cycle_months(newCycle))

  else: // scheduled
    effectiveFrom = currentPeriodEnd
    newExpiresAt = add_months(currentPeriodEnd, cycle_months(newCycle))
    chargeAmount = newPlanPrice  // full price at next billing
```

### Implementation của `upgradeSubscriptionPlan()`

```typescript
// subscription.service.ts

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { BillingService } from '../../billing/billing.service';
import {
  PlanKey, BillingCycle, PLAN_DEFINITIONS, getPlan, getPlanPrice,
  comparePlanKeys, isUnlimited,
} from './plan.config';
import {
  UpgradeSubscriptionInput, UpgradeResult, ProratedPricingInput,
} from './subscription.types';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly billing: BillingService,
  ) {}

  // ================================================================
  // CORE: upgradeSubscriptionPlan()
  // ================================================================
  
  async upgradeSubscriptionPlan(
    input: UpgradeSubscriptionInput,
  ): Promise<UpgradeResult> {
    const { tenantId, currentSubscriptionId, targetPlanKey, targetCycle, immediate } = input;
    
    // Validate plan
    const newPlan = getPlan(targetPlanKey);
    if (!newPlan) {
      throw new BadRequestException(`Invalid plan key: ${targetPlanKey}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // ═══════════════════════════════════════════════════════════
      // 1. LOCK current subscription row (FOR UPDATE)
      // ═══════════════════════════════════════════════════════════
      const currentSub = await tx.$queryRawUnsafe`
        SELECT * FROM "Subscription"
        WHERE "id" = ${currentSubscriptionId}
          AND "tenantId" = ${tenantId}
          AND "status" IN ('active', 'trialing')
        FOR UPDATE
      `.then((rows: any[]) => rows[0] ?? null);

      if (!currentSub) {
        throw new BadRequestException(
          'No active subscription found for this tenant',
        );
      }

      const oldPlanKey = currentSub.planKey as PlanKey;
      const direction = comparePlanKeys(oldPlanKey, targetPlanKey);
      
      if (direction === 'same') {
        throw new BadRequestException(
          `Already subscribed to ${targetPlanKey}`,
        );
      }

      // ═══════════════════════════════════════════════════════════
      // 2. LOCK tenant wallet (FOR UPDATE)
      // ═══════════════════════════════════════════════════════════
      const wallet = await tx.$queryRawUnsafe`
        SELECT * FROM "Wallet"
        WHERE "tenantId" = ${tenantId}
        FOR UPDATE
      `.then((rows: any[]) => rows[0] ?? null);
      
      if (!wallet) {
        throw new BadRequestException('Wallet not found for tenant');
      }

      // ═══════════════════════════════════════════════════════════
      // 3. Calculate prorated pricing
      // ═══════════════════════════════════════════════════════════
      const now = new Date();
      const oldPlan = PLAN_DEFINITIONS[oldPlanKey];
      const oldCycle = (currentSub.billingCycle as BillingCycle) ?? 'monthly';
      
      const proration = this.calculateProratedPricing({
        oldPlanKey,
        newPlanKey: targetPlanKey,
        oldCycle,
        newCycle: targetCycle,
        currentPeriodStart: currentSub.startedAt ?? now,
        currentPeriodEnd: currentSub.expiresAt ?? now,
        upgradeTime: now,
      });

      // ═══════════════════════════════════════════════════════════
      // 4. Balance check (for upgrades that require payment)
      // ═══════════════════════════════════════════════════════════
      if (proration.chargeAmount > 0) {
        const walletBalance = typeof wallet.balance === 'bigint'
          ? Number(wallet.balance) / 100  // convert from BigInt cents
          : Number(wallet.balance);
        
        if (walletBalance < proration.chargeAmount) {
          throw new BadRequestException(
            `Insufficient balance. Required: ${proration.chargeAmount} VND, ` +
            `Available: ${walletBalance} VND`,
          );
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 5. Debit: charge the prorated amount (if any)
      // ═══════════════════════════════════════════════════════════
      let debitTxId: string | undefined;
      let creditTxId: string | undefined;
      
      if (proration.chargeAmount > 0) {
        // Use Ledger debit via raw transaction to maintain lock
        const newBalance = BigInt(wallet.balance) - BigInt(proration.chargeAmount * 100);
        
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: newBalance,
            version: wallet.version + 1,
          },
        });
        
        const debitTx = await tx.ledgerTransaction.create({
          data: {
            tenantId,
            type: 'DEBIT',
            amount: BigInt(proration.chargeAmount * 100),
            balanceAfter: newBalance,
            referenceType: 'plan_upgrade',
            referenceId: currentSubscriptionId,
            description: `Upgrade: ${oldPlanKey} → ${targetPlanKey}`,
            metadata: {
              oldPlanKey,
              newPlanKey: targetPlanKey,
              chargeAmount: proration.chargeAmount,
              creditAmount: proration.creditAmount,
              remainingDays: proration.oldPlanRemainingDays,
              prorated: true,
            },
          },
        });
        debitTxId = debitTx.id;
      }

      // ═══════════════════════════════════════════════════════════
      // 6. Credit: refund prorated amount (for downgrades, if any)
      // ═══════════════════════════════════════════════════════════
      if (proration.creditAmount > 0) {
        const newBalance = BigInt(wallet.balance) + BigInt(proration.creditAmount * 100);
        
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: newBalance,
            version: wallet.version + 1,
          },
        });
        
        const creditTx = await tx.ledgerTransaction.create({
          data: {
            tenantId,
            type: 'CREDIT',
            amount: BigInt(proration.creditAmount * 100),
            balanceAfter: newBalance,
            referenceType: 'plan_downgrade',
            referenceId: currentSubscriptionId,
            description: `Downgrade refund: ${oldPlanKey} → ${targetPlanKey}`,
            metadata: {
              oldPlanKey,
              newPlanKey: targetPlanKey,
              creditAmount: proration.creditAmount,
              prorated: true,
            },
          },
        });
        creditTxId = creditTx.id;
      }

      // ═══════════════════════════════════════════════════════════
      // 7. Update subscription record
      // ═══════════════════════════════════════════════════════════
      // Mark old subscription as changed
      await tx.subscription.update({
        where: { id: currentSubscriptionId },
        data: {
          status: 'changed',
          cancelledAt: now,
          autoRenew: false,
        },
      });

      // Create new subscription with upgraded plan
      const newSub = await tx.subscription.create({
        data: {
          accountId: currentSub.accountId,
          planKey: targetPlanKey,
          tenantId,
          status: 'active',
          startedAt: proration.effectiveFrom,
          expiresAt: proration.newExpiresAt,
          autoRenew: true,
          metadata: {
            upgradedFrom: oldPlanKey,
            previousSubscriptionId: currentSubscriptionId,
            billingCycle: targetCycle,
            proration: {
              oldPlanRemainingDays: proration.oldPlanRemainingDays,
              chargeAmount: proration.chargeAmount,
              creditAmount: proration.creditAmount,
            },
          },
        },
      });

      // ═══════════════════════════════════════════════════════════
      // 8. Create invoice for prorated charge
      // ═══════════════════════════════════════════════════════════
      let invoiceId: string | undefined;
      if (proration.chargeAmount > 0) {
        const invNum = `INV-PRO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${Date.now()}`;
        const invoice = await tx.invoice.create({
          data: {
            accountId: currentSub.accountId,
            subscriptionId: newSub.id,
            tenantId,
            number: invNum,
            amount: proration.chargeAmount,
            currency: 'VND',
            status: 'paid',
            description: `Prorated upgrade: ${oldPlanKey} → ${targetPlanKey}`,
            paidAt: now,
            metadata: {
              proration: true,
              oldPlanKey,
              newPlanKey: targetPlanKey,
              remainingDays: proration.oldPlanRemainingDays,
              chargeAmount: proration.chargeAmount,
              creditAmount: proration.creditAmount,
            },
          },
        });
        invoiceId = invoice.id;
      }

      this.logger.log(
        `Plan ${direction}: ${oldPlanKey} → ${targetPlanKey} ` +
        `(tenant=${tenantId}, charge=${proration.chargeAmount}, credit=${proration.creditAmount})`,
      );

      return {
        success: true,
        oldPlanKey,
        newPlanKey: targetPlanKey,
        proration,
        ledgerTransactionId: debitTxId ?? creditTxId,
        invoiceId,
        subscription: newSub,
      };
    });
  }

  // ================================================================
  // Prorated pricing calculator (pure function, testable)
  // ================================================================
  
  calculateProratedPricing(input: ProratedPricingInput): UpgradeResult['proration'] {
    const {
      oldPlanKey, newPlanKey,
      oldCycle, newCycle,
      currentPeriodStart, currentPeriodEnd,
      upgradeTime,
    } = input;

    // Total days in the current billing period
    const totalDays = Math.max(1, Math.ceil(
      (currentPeriodEnd.getTime() - currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
    ));

    // Used days so far
    const usedDays = Math.max(0, Math.ceil(
      (upgradeTime.getTime() - currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
    ));

    // Remaining days
    const remainingDays = Math.max(0, totalDays - usedDays);

    // Prices
    const oldPrice = getPlanPrice(oldPlanKey, oldCycle);
    const newPrice = getPlanPrice(newPlanKey, newCycle);

    // Daily rates
    const oldDailyRate = oldPrice / totalDays;
    const newDailyRate = newPrice / totalDays;

    // Prorated values
    const oldPlanRemainingValue = oldDailyRate * remainingDays;
    const newPlanProratedPrice = newDailyRate * remainingDays;

    // Direction-based calculation
    const direction = comparePlanKeys(oldPlanKey, newPlanKey);
    
    let chargeAmount = 0;
    let creditAmount = 0;

    if (direction === 'upgrade') {
      // Need to pay the difference for remaining days
      chargeAmount = Math.max(0, Math.ceil(newPlanProratedPrice - oldPlanRemainingValue));
    } else if (direction === 'downgrade') {
      // Credit back the difference
      creditAmount = Math.max(0, Math.ceil(oldPlanRemainingValue - newPlanProratedPrice));
    }
    // 'crossgrade' or 'same' → no charge, no credit

    // Effective dates
    const effectiveFrom = new Date(upgradeTime);
    let newExpiresAt: Date;

    // On upgrade, keep the original expiry date
    if (direction === 'upgrade') {
      newExpiresAt = new Date(currentPeriodEnd);
    } else {
      // On downgrade/crossgrade, start a new period
      newExpiresAt = new Date(upgradeTime);
      const months = newCycle === 'yearly' ? 12 : 1;
      newExpiresAt.setMonth(newExpiresAt.getMonth() + months);
    }

    return {
      oldPlanRemainingDays: remainingDays,
      oldPlanTotalDays: totalDays,
      oldPlanRemainingValue: Math.round(oldPlanRemainingValue),
      newPlanTotalPrice: newPrice,
      newPlanProratedPrice: Math.round(newPlanProratedPrice),
      isUpgrade: direction === 'upgrade',
      chargeAmount,
      creditAmount,
      effectiveFrom,
      newExpiresAt,
    };
  }
  
  // ================================================================
  // Additional subscription operations
  // ================================================================

  /** Get current plan with usage stats for the tenant */
  async getSubscriptionWithUsage(tenantId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['active', 'trialing'] } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    if (!sub) {
      return { status: 'none', plan: null };
    }

    // Aggregate usage for current billing period
    const since = sub.startedAt ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const usage = await this.prisma.usageRecord.aggregate({
      where: {
        tenantId,
        recordedAt: { gte: since },
      },
      _sum: { value: true },
    });

    const planDef = PLAN_DEFINITIONS[sub.planKey as PlanKey] ?? null;

    return {
      ...sub,
      planDefinition: planDef,
      usageSummary: {
        totalValue: usage._sum.value ?? 0,
        aiCallsUsed: planDef ? await this.countAiCalls(tenantId, since) : 0,
        storageUsed: await this.calculateStorageUsed(tenantId),
      },
    };
  }

  private async countAiCalls(tenantId: string, since: Date): Promise<number> {
    const result = await this.prisma.usageRecord.aggregate({
      where: { tenantId, category: 'ai', recordedAt: { gte: since } },
      _sum: { value: true },
    });
    return Number(result._sum.value ?? 0);
  }

  private async calculateStorageUsed(tenantId: string): Promise<number> {
    // Placeholder — actual storage calculation depends on storage backend
    const result = await this.prisma.usageRecord.aggregate({
      where: { tenantId, category: 'storage', recordedAt: { gte: new Date() } },
      _sum: { value: true },
    });
    return Number(result._sum.value ?? 0);
  }

  /** List all active subscriptions with plan details */
  async listActiveSubscriptions(tenantId?: string) {
    const where: any = { status: { in: ['active', 'trialing'] } };
    if (tenantId) where.tenantId = tenantId;
    
    return this.prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { plan: true, tenant: { select: { slug: true, name: true } } },
    });
  }

  /** Cancel subscription with prorated refund */
  async cancelWithRefund(subscriptionId: string, tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.$queryRawUnsafe`
        SELECT * FROM "Subscription"
        WHERE "id" = ${subscriptionId}
          AND "tenantId" = ${tenantId}
          AND "status" = 'active'
        FOR UPDATE
      `.then((rows: any[]) => rows[0] ?? null);

      if (!sub) {
        throw new BadRequestException('Active subscription not found');
      }

      // Calculate refund for remaining days
      const now = new Date();
      const totalDays = Math.max(1, Math.ceil(
        (sub.expiresAt.getTime() - sub.startedAt.getTime()) / (1000 * 60 * 60 * 24)
      ));
      const remainingDays = Math.max(0, Math.ceil(
        (sub.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      ));
      const dailyRate = sub.plan?.price ?? getPlanPrice(sub.planKey as PlanKey) / totalDays;
      const refundAmount = Math.round(dailyRate * remainingDays);

      // Update subscription
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'cancelled', cancelledAt: now, autoRenew: false },
      });

      // Credit refund to wallet
      if (refundAmount > 0) {
        const wallet = await tx.wallet.update({
          where: { tenantId },
          data: {
            balance: { increment: BigInt(refundAmount * 100) },
            version: { increment: 1 },
          },
        });

        await tx.ledgerTransaction.create({
          data: {
            tenantId,
            type: 'CREDIT',
            amount: BigInt(refundAmount * 100),
            balanceAfter: wallet.balance,
            referenceType: 'subscription_cancel_refund',
            referenceId: subscriptionId,
            description: `Subscription cancellation refund: ${refundAmount} VND`,
          },
        });
      }

      return { cancelled: true, refundAmount, subscriptionId };
    });
  }
}
```

### Các endpoint REST của SubscriptionController

```typescript
// subscription.controller.ts

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  /** POST /subscription/upgrade — upgrade/downgrade/crossgrade plan */
  @Post('upgrade')
  async upgrade(@Headers('x-tenant-slug') slug: string, @Body() body: {
    subscriptionId: string;
    targetPlanKey: PlanKey;
    targetCycle?: BillingCycle;
    immediate?: boolean;
  }) {
    const tenant = await this.resolveTenant(slug);
    return this.subscriptionService.upgradeSubscriptionPlan({
      tenantId: tenant.id,
      currentSubscriptionId: body.subscriptionId,
      targetPlanKey: body.targetPlanKey,
      targetCycle: body.targetCycle ?? 'monthly',
      immediate: body.immediate ?? true,
    });
  }

  /** GET /subscription/current — current plan + usage */
  @Get('current')
  async current(@Headers('x-tenant-slug') slug: string) {
    const tenant = await this.resolveTenant(slug);
    return this.subscriptionService.getSubscriptionWithUsage(tenant.id);
  }

  /** POST /subscription/:id/cancel — cancel with prorated refund */
  @Post(':id/cancel')
  async cancel(
    @Headers('x-tenant-slug') slug: string,
    @Param('id') subscriptionId: string,
  ) {
    const tenant = await this.resolveTenant(slug);
    return this.subscriptionService.cancelWithRefund(subscriptionId, tenant.id);
  }

  /** GET /subscription/plans — all active plan definitions */
  @Get('plans')
  listPlans() {
    return getActivePlans();
  }

  /** GET /subscription/plans/:key — single plan with prices */
  @Get('plans/:key')
  getPlanDetail(@Param('key') key: string) {
    const plan = getPlan(key);
    if (!plan) throw new NotFoundException(`Plan '${key}' not found`);
    return plan;
  }
}
```

---

## V. CORE LOGIC 3 — Plan Guard Middleware (`plan-guard.middleware.ts`)

### Mục đích
Middleware/Guard NestJS tự động kiểm tra quyền hạn gói cước trên mọi API core:
- **Workflow**: kiểm tra `maxWorkflows`, `maxWorkflowNodes`
- **Connector**: kiểm tra `maxConnectors`
- **AI**: kiểm tra `aiCallsMonthly`
- **Storage**: kiểm tra `storageGB`
- **User/Membership**: kiểm tra `maxUsers`

### Thiết kế

```typescript
// plan-guard.middleware.ts
// ================================================================
// PlanGuard — Resource Limit Enforcement
// ================================================================
// Sử dụng NestJS Guard pattern (implements CanActivate).
// Gắn @UseGuards(PlanGuard) hoặc global guard.
// ================================================================

import {
  Injectable, CanActivate, ExecutionContext,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma.service';
import { PLAN_DEFINITIONS, PlanKey, isUnlimited } from './plan.config';

/**
 * Metadata key for plan-guard decorator
 * Usage: @PlanGuard({ resource: 'workflows', action: 'create' })
 */
export const PLAN_GUARD_METADATA = 'plan_guard';

export interface PlanGuardOptions {
  resource: keyof typeof RESOURCE_LIMIT_MAP;
  action: 'create' | 'read' | 'update' | 'delete';
  allowlist?: string[];   // plan keys that bypass this check
}

// Map resource names to their limit keys in PlanLimits
const RESOURCE_LIMIT_MAP: Record<string, string> = {
  workflows: 'maxWorkflows',
  workflowNodes: 'maxWorkflowNodes',
  connectors: 'maxConnectors',
  users: 'maxUsers',
  workspaces: 'maxWorkspaces',
  aiCalls: 'aiCallsMonthly',
  storage: 'storageGB',
  bandwidth: 'bandwidthGB',
  notifications: 'maxNotifications',
  apiRate: 'apiRateLimit',
};

// Map resource to overLimitPolicy key in PlanOverLimitPolicy
const RESOURCE_POLICY_MAP: Record<string, string> = {
  workflows: 'workflows',
  connectors: 'connectors',
  users: 'users',
  aiCalls: 'aiCalls',
  storage: 'storage',
};

@Injectable()
export class PlanGuard implements CanActivate {
  private readonly logger = new Logger(PlanGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<PlanGuardOptions>(
      PLAN_GUARD_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true; // No plan guard configured for this route
    }

    const request = context.switchToHttp().getRequest();
    const tenantId = request.accessPolicy?.tenantId
      ?? request.headers['x-tenant-id'];

    if (!tenantId) {
      this.logger.warn('PlanGuard: no tenantId in request context');
      return true; // Fall through — don't block if tenant context missing
    }

    // Fetch current active subscription with plan
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['active', 'trialing'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      // No subscription → FREE plan by default
      return this.enforceLimit(tenantId, 'free', options, request);
    }

    const planKey = subscription.planKey as PlanKey;

    // Allowlist check: bypass for listed plans
    if (options.allowlist?.includes(planKey)) {
      return true;
    }

    return this.enforceLimit(tenantId, planKey, options, request);
  }

  private async enforceLimit(
    tenantId: string,
    planKey: string,
    options: PlanGuardOptions,
    request: any,
  ): Promise<boolean> {
    const planDef = PLAN_DEFINITIONS[planKey as PlanKey];
    if (!planDef) {
      // Unknown plan — allow but warn
      this.logger.warn(`PlanGuard: unknown plan '${planKey}' for tenant ${tenantId}`);
      return true;
    }

    const limitKey = RESOURCE_LIMIT_MAP[options.resource];
    if (!limitKey) {
      return true; // No limit defined for this resource
    }

    const limitValue = planDef.limits[limitKey as keyof typeof planDef.limits] as number;
    if (isUnlimited(limitValue)) {
      return true; // Unlimited plan → always allow
    }

    // Count current usage for this resource
    let currentCount = await this.countUsage(tenantId, options.resource, request);
    
    // For 'create' actions, we check if adding one more would exceed limit
    if (options.action === 'create') {
      currentCount += 1;
    }

    if (currentCount > limitValue) {
      const policyKey = RESOURCE_POLICY_MAP[options.resource] ?? options.resource;
      const policy = planDef.overLimitPolicy[policyKey as keyof typeof planDef.overLimitPolicy]
        ?? 'block';

      if (policy === 'block') {
        this.logger.warn(
          `PLAN_LIMIT_REACHED: tenant=${tenantId}, plan=${planKey}, ` +
          `resource=${options.resource}, limit=${limitValue}, current=${currentCount}, action=${policy}`,
        );
        throw new ForbiddenException({
          code: 'PLAN_LIMIT_REACHED',
          message: `Gói ${planDef.name} đã đạt giới hạn ${options.resource} ` +
            `(${currentCount}/${limitValue}). Hãy nâng cấp gói để mở rộng hạn mức.`,
          resource: options.resource,
          limit: limitValue,
          current: currentCount,
          planKey,
          upgradeUrl: `/pricing?upgrade=${planKey}`,
        });
      }

      if (policy === 'warn') {
        // Allow through, but log warning — frontend may show a toast
        this.logger.warn(
          `PLAN_WARN: tenant=${tenantId}, resource=${options.resource}, ` +
          `usage=${currentCount}/${limitValue}`,
        );
        // Attach warning to response headers for frontend consumption
        request.res?.setHeader('X-Plan-Warning', JSON.stringify({
          resource: options.resource,
          usage: currentCount,
          limit: limitValue,
          planKey,
          upgradeUrl: `/pricing?upgrade=${planKey}`,
        }));
      }

      if (policy === 'billable') {
        // Allow through — billing hooks will charge overage separately
        // (Future: increment UsageRecord for overage billing)
        this.logger.log(
          `PLAN_BILLABLE: tenant=${tenantId}, resource=${options.resource}, ` +
          `usage=${currentCount}/${limitValue}`,
        );
      }

      return true;
    }

    return true;
  }

  private async countUsage(
    tenantId: string,
    resource: string,
    request: any,
  ): Promise<number> {
    switch (resource) {
      case 'workflows': {
        return this.prisma.workflowTemplate.count({
          where: { tenantId, status: { not: 'ARCHIVED' } },
        });
      }
      case 'connectors': {
        return this.prisma.integrationConnection.count({
          where: { tenantId, status: { not: 'DISABLED' } },
        });
      }
      case 'users': {
        return this.prisma.membership.count({
          where: { tenantId, role: { not: 'VIEWER' } },
        });
      }
      case 'workspaces': {
        return this.prisma.workspace.count({
          where: { tenantId },
        });
      }
      case 'aiCalls': {
        // Count current month's AI usage
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const result = await this.prisma.usageRecord.aggregate({
          where: { tenantId, category: 'ai', recordedAt: { gte: startOfMonth } },
          _sum: { value: true },
        });
        return Number(result._sum.value ?? 0);
      }
      case 'notifications': {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        const result = await this.prisma.usageRecord.aggregate({
          where: { tenantId, category: 'notification', recordedAt: { gte: startOfMonth } },
          _sum: { value: true },
        });
        return Number(result._sum.value ?? 0);
      }
      default:
        return 0; // Unknown resource — skip counting
    }
  }
}

// ================================================================
// Custom decorator @PlanGuard for easy usage
// ================================================================

import { SetMetadata } from '@nestjs/common';

export const PlanLimit = (options: PlanGuardOptions) =>
  SetMetadata(PLAN_GUARD_METADATA, options);
```

### Cách sử dụng trong controller

```typescript
// Example: workflow.controller.ts
@Controller('workflows')
export class WorkflowController {
  @Post()
  @PlanLimit({ resource: 'workflows', action: 'create' })
  async createWorkflow(@Body() body: any) { ... }
  
  @Post(':id/nodes')
  @PlanLimit({ resource: 'workflowNodes', action: 'create' })
  async addNode(@Param('id') id: string) { ... }
}

// Example: integrations.controller.ts
@Controller('integrations')
export class IntegrationsController {
  @Post()
  @PlanLimit({ resource: 'connectors', action: 'create' })
  async createConnection(@Body() body: any) { ... }
}
```

### PlanGuard flow diagram

```
Client Request
  │
  ▼
[JWT Guard] → authenticate user/tenant
  │
  ▼
[AccessPolicy Guard] → resolve tenant context
  │
  ▼
[PlanGuard] ──── check @PlanLimit() metadata
  │
  ├─ No metadata ──────────────► allow
  │
  └─ Has metadata ──► fetch current Subscription
                      │
                      ├─ No sub ──► use FREE plan defaults
                      │
                      └─ Has sub ──► get PLAN_DEFINITIONS[planKey]
                                    │
                                    ├─ Unlimited limit ──► allow
                                    │
                                    └─ Finite limit ──► countUsage()
                                       │
                                       ├─ Under limit ──► allow
                                       │
                                       └─ Over limit ──► check overLimitPolicy
                                          ├─ 'block'    ──► throw PLAN_LIMIT_REACHED
                                          ├─ 'warn'     ──► set X-Plan-Warning header → allow
                                          └─ 'billable' ──► allow (overage billing later)
```

---

## VI. FILE CẦN CẬP NHẬT

### 1. `payments.module.ts` — Import SubscriptionModule

```typescript
@Module({
  imports: [
    MomoModule,
    VnpayModule,
    LedgerModule,
    SubscriptionModule,  // ← MỚI
  ],
  controllers: [PaymentsController, StripeWebhookController],
  providers: [
    PaymentsService,
    PaymentsWebhookService,
    SubscriptionActivatorService,
    InvoiceMailerService,
    InvoiceOutboxProcessor,
    PrismaService,
  ],
  exports: [
    PaymentsService,
    SubscriptionActivatorService,
    PaymentsWebhookService,
    InvoiceMailerService,
    SubscriptionService,   // ← MỚI
  ],
})
export class PaymentsModule {}
```

### 2. `billing/billing.service.ts` — Seed từ plan.config.ts

```typescript
// Trong seedDefaultPlans(), replace hardcoded array với:
import { PLAN_DEFINITIONS, PlanKey } from '../payments/subscription/plan.config';

async seedDefaultPlans() {
  for (const [key, def] of Object.entries(PLAN_DEFINITIONS)) {
    const exists = await this.prisma.subscriptionPlan.findUnique({
      where: { key },
    });
    if (!exists) {
      const monthlyPrice = def.prices.find((p) => p.billingCycle === 'monthly');
      await this.prisma.subscriptionPlan.create({
        data: {
          key,
          name: def.name,
          description: def.description,
          price: monthlyPrice?.priceVnd ?? 0,
          currency: 'VND',
          interval: 'MONTHLY',
          features: def.features as any,
          limits: def.limits as any,
          maxUsers: def.limits.maxUsers,
          maxWorkflows: def.limits.maxWorkflows,
          aiCallsMonthly: def.limits.aiCallsMonthly,
          storageGB: def.limits.storageGB,
          isActive: def.isActive,
        },
      });
    }
  }
}
```

### 3. `app.module.ts` — Global PlanGuard registration (optional)

Có thể register PlanGuard như global guard hoặc per-controller:

```typescript
// Global guard — mọi request đều check (recommended)
providers: [
  {
    provide: APP_GUARD,
    useClass: PlanGuard,
  },
]
```

---

## VII. FUTURE ENHANCEMENTS (ngoài scope thiết kế này)

| Tính năng | Mô tả | Khi nào |
|---|---|---|
| **Usage metering hook** | Worker chạy cuối tháng, aggregate usage → generate overage invoice | Sau khi plan guard ổn định |
| **Auto-renew payment** | Cron job chạy mỗi ngày, check subscription sắp hết hạn, auto debit wallet | Phase 3.2 |
| **Past-due handling** | Sau 7 ngày overdue → suspend → warn → block | Phase 3.3 |
| **Plan recommendation AI** | Dựa trên usage pattern, gợi ý plan phù hợp | Q4 2026 |
| **Promotion/discount codes** | Coupon system cho yearly plans | Marketing Phối hợp |
| **Subscription analytics** | MRR, Churn, ARPU dashboard | Phase 3.4 |
| **Plan audit log** | Mọi change đều ghi vào AuditEvent | Security baseline |

---

## VIII. IMPLEMENTATION ORDER

```
[P0] plan.config.ts                   — Constants file (30 phút)
[P0] subscription.types.ts            — Types (15 phút)
[P1] subscription.service.ts          — upgrade() + proration (2-3 giờ)
[P1] subscription.controller.ts       — REST endpoints (30 phút)
[P1] subscription.module.ts           — NestJS module (10 phút)
[P1] Cập nhật payments.module.ts      — Import subscription module (5 phút)
[P1] Cập nhật billing.service.ts      — Seed từ plan.config (15 phút)
[P2] plan-guard.middleware.ts          — Guard middleware (2-3 giờ)
[P2] plan-guard.decorator.ts          — @PlanLimit decorator (10 phút)
[P2] Gắn @PlanLimit vào các controller (workflow, connector, membership…)
[P3] Subscription unit tests          — plan.config.spec.ts, subscription.service.spec.ts
[P4] Integration tests                — API endpoint test với testcontainers
```

---

## IX. DIAGRAM KIẾN TRÚC TỔNG THỂ

```
┌─────────────────────────────────────────────────────────────────┐
│                     apps/api/src/payments                        │
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │  vnpay/     │  │  momo/       │  │  ledger/                 │  │
│  │  momo/      │  │  stripe      │  │  (Wallet + CAS Lock)     │  │
│  │  stripe     │  │              │  └───────────┬─────────────┘  │
│  └──────┬──────┘  └──────┬───────┘              │                │
│         │                │                       │                │
│         ▼                ▼                       ▼                │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │              SUBSCRIPTION MODULE (MỚI)                    │   │
│  │                                                           │   │
│  │  ┌──────────────┐  ┌────────────────┐  ┌──────────────┐  │   │
│  │  │ plan.config  │  │ subscription   │  │ plan-guard   │  │   │
│  │  │ (Constants)  │◄─┤ .service.ts    │  │ .middleware.ts│  │   │
│  │  └──────┬───────┘  │ (upgrade,      │  │ (CanActivate) │  │   │
│  │         │          │  prorate,      │  └──────┬───────┘  │   │
│  │         │          │  cancel)       │         │           │   │
│  │         │          └───────┬────────┘         │           │   │
│  │         │                  │                  │           │   │
│  │         ▼                  ▼                  ▼           │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │           subscription.controller.ts               │   │   │
│  │  │    POST /upgrade  │  GET /current  │  POST /cancel │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                    │                                               │
│                    ▼                                               │
│         ┌─────────────────────┐                                   │
│         │  PrismaService      │                                   │
│         │  (PostgreSQL :5432) │                                   │
│         └─────────────────────┘                                   │
└─────────────────────────────────────────────────────────────────┘

         │ Calls │ Calls
         ▼       ▼
┌────────────────────┐  ┌──────────────────────┐
│  billing.service   │  │  workflow.controller │
│  (seed plans)      │  │  @PlanLimit(d)       │
└────────────────────┘  │  integration.ctrl     │
                        │  membership.ctrl      │
                        └──────────────────────┘
```

---

## X. KẾT LUẬN

### 9 file mới cần tạo:
1. `plan.config.ts` — hằng số định nghĩa gói cước (101 dòng code)
2. `plan.config.spec.ts` — unit test (80 dòng)
3. `subscription.types.ts` — TypeScript types (50 dòng)
4. `subscription.service.ts` — upgrade với proration + cancel (280 dòng)
5. `subscription.service.spec.ts` — unit test (150 dòng)
6. `subscription.controller.ts` — REST endpoints (80 dòng)
7. `subscription.module.ts` — NestJS module (25 dòng)
8. `plan-guard.middleware.ts` — Guard middleware (220 dòng)
9. `plan-guard.middleware.spec.ts` — unit test (120 dòng)

### 3 file cần cập nhật:
1. `payments.module.ts` — import SubscriptionModule
2. `billing/billing.service.ts` — seed từ plan.config
3. `app.module.ts` — global guard (optional)

### Tổng effort ước tính: ~8-10 giờ code + 3-4 giờ test

---

*Kiến trúc được thiết kế dựa trên phân tích codebase thực tế ngày 2026-06-17. Các component đã tồn tại (Ledger, Wallet, SubscriptionActivator, BillingService) được tận dụng tối đa, không viết lại từ đầu.*

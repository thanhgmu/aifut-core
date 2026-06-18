# Anti-Drain Budget Caps — Cost Limits & Automated Budget Enforcement Subsystem

> **Phase 4 — Backend `apps/api`**
> Ngày: 2026-06-18
> Module: `apps/api/src/payments/budget/`
> Thiết kế dựa trên scan codebase hiện tại: AI Analytics Dashboard vừa build pass full turbo (commit e0dcfbe)
> Trạng thái runtime: PG :5432 running, API :3002 / Web :3000 ready

---

## I. TỔNG QUAN & BỐI CẢNH

### 1.1 Vấn đề

Hệ thống hiện tại đã có:
- **`LedgerDebitInterceptor`** — kiểm tra wallet balance > 0 trước mỗi lần gọi AI (HTTP 402 nếu hết tiền)
- **`AiBudgetPolicy`** — hạn mức **token-based** theo tháng (monthlyTokenBudget, hardMonthlyTokenLimit, blockOnHardLimit)
- **`Wallet` + `LedgerTransaction`** — ghi nợ nguyên tử sau mỗi lần gọi AI thành công

**Nhưng thiếu hoàn toàn:**
1. ❌ **Periodic cost-based budget cap** — không có "tháng này chỉ được xài 5 triệu cho AI, nếu vượt 4 triệu thì cảnh báo, 5 triệu thì chặn"
2. ❌ **DAILY / WEEKLY / MONTHLY period** — `AiBudgetPolicy` chỉ có monthly (token), không có daily/weekly cost
3. ❌ **Auto-reset** — không có cơ chế tự động reset `currentCostSpent` về 0 khi hết kỳ
4. ❌ **SOFT_LOCKED / HARD_LOCKED state machine** — không có trạng thái intermediate trước khi block hoàn toàn
5. ❌ **Budget Guard (NestJS Guard)** — kiểm tra trước request thay vì trong interceptor

### 1.2 Mục tiêu

Xây dựng subsystem **Anti-Drain Budget Caps** với 3 năng lực cốt lõi:

| # | Năng lực | Mô tả |
|---|---|---|
| 1 | **Periodic Cost Budget** | Tenant cấu hình hạn mức chi phí theo DAILY/WEEKLY/MONTHLY (VND) |
| 2 | **Real-time Guard** | NestJS Guard gác các API gọi AI, chặn ngay nếu budget đã cạn |
| 3 | **Auto Accumulator + Cron Reset** | Tích lũy chi phí sau mỗi lần gọi AI; reset về 0 khi sang kỳ mới |

### 1.3 Nguyên tắc kiến trúc

- **Không phá vỡ module hiện có**: `budget/` là module độc lập, không sửa `LedgerDebitInterceptor` hay `AiGovernancePersistenceService`
- **Tenant-level isolation**: mọi budget record gắn với tenantId
- **Cost-based, không phải token-based**: `AiBudgetPolicy` đã lo token — subsystem này lo cost VND
- **Two-tier locking**: SOFT_LOCKED (cho phép đọc/query/analytics, chặn tạo mới) → HARD_LOCKED (chặn hoàn toàn)
- **Alert threshold**: % configurable (mặc định 80%) để bắn notification trước khi lock

---

## II. KIẾN TRÚC FILE MAP

### 2.1 Files cần khởi tạo MỚI

```text
apps/api/src/payments/budget/
├── budget.module.ts              # [NEW] NestJS module — register service, guard, controller, scheduler
├── budget.service.ts             # [NEW] Core business logic — CRUD budget limit + state machine
├── budget.guard.ts               # [NEW] NestJS Guard — check budget BEFORE AI request
├── budget.controller.ts          # [NEW] REST endpoints — CRUD budget limits, get current usage
├── budget.types.ts               # [NEW] TypeScript types enums interfaces
├── budget.config.ts              # [NEW] Config constants defaults
├── budget-accumulator.service.ts # [NEW] Async cost accumulator + state transition
├── budget-scheduler.service.ts   # [NEW] Cron job — periodic currentCostSpent reset
├── budget-alert.service.ts       # [NEW] Alert threshold notification (email/notification log)
│
apps/api/src/payments/payments.module.ts  # [UPDATE] Import BudgetModule
apps/api/prisma/schema.prisma             # [UPDATE] Add AiBudgetLimit model
```

### 2.2 Files KHÔNG cần sửa (giữ nguyên)

```text
apps/api/src/payments/ledger/ledger-debit.interceptor.ts   # Giữ nguyên — wallet balance check + post-call debit
apps/api/src/ai-governance.module.ts                        # Giữ nguyên — token-based budget policy
apps/api/src/payments/ledger/ledger.service.ts              # Giữ nguyên — wallet ledger
```

### 2.3 Tổng quan data flow

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                                                                    │
│   [AI Request]                                                                    │
│       │                                                                          │
│       ▼                                                                          │
│   ┌──────────────────────┐                                                       │
│   │  BUDGET GUARD (guard) │  ◄── Kiểm TRA TRƯỚC — chặn ngay nếu HARD_LOCKED    │
│   │  budget.guard.ts     │       hoặc SOFT_LOCKED + request không ưu tiên       │
│   └──────┬───────────────┘                                                       │
│          │ pass                                                                  │
│          ▼                                                                       │
│   ┌──────────────────────┐                                                       │
│   │  LedgerDebitInterceptor │  ◄── Kiểm tra wallet balance + debit sau call      │
│   └──────┬───────────────┘                                                       │
│          │ pass                                                                  │
│          ▼                                                                       │
│   ┌──────────────────────┐                                                       │
│   │  AI Handler          │  ◄── Xử lý request AI thực tế                         │
│   └──────┬───────────────┘                                                       │
│          │ response (success)                                                     │
│          ▼                                                                       │
│   ┌──────────────────────────────┐                                                │
│   │  COST ACCUMULATOR (async)   │  ◄── Sau call thành công, cộng dồn cost       │
│   │  budget-accumulator.service │       vào currentCostSpent + check threshold  │
│   └──────┬──────────────────────┘                                                │
│          │ state change?                                                          │
│          ▼                                                                       │
│   ┌──────────────────────┐                                                       │
│   │  State Machine       │  ◄── ACTIVE → SOFT_LOCKED → HARD_LOCKED              │
│   │  + Alert Service     │       + NotificationLog khi vượt alertThreshold      │
│   └──────────────────────┘                                                       │
│                                                                                   │
│   ┌──────────────────────────────┐                                               │
│   │  CRON SCHEDULER (scheduled) │  ◄── Chạy mỗi giờ / nửa đêm, reset             │
│   │  budget-scheduler.service   │       currentCostSpent = 0 nếu period mới      │
│   └──────────────────────────────┘                                               │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## III. THIẾT KẾ CHI TIẾT

### 3.1 Cấu trúc bảng AiBudgetLimit (Prisma Model)

```prisma
// ============================================================
// apps/api/prisma/schema.prisma — Thêm model mới
// ============================================================
// Anti-Drain Budget Caps: hạn mức chi phí theo period (DAILY/WEEKLY/MONTHLY)
// Mỗi tenant chỉ có 1 bản ghi ACTIVE tại một thời điểm.
// Lưu ý: Đây là cost-based (VND), KHÔNG phải token-based.
// Token-based budget đã có ở AiBudgetPolicy.

enum BudgetPeriod {
  DAILY
  WEEKLY
  MONTHLY
}

enum BudgetLimitStatus {
  ACTIVE          // Còn hạn mức, mọi request được phép
  SOFT_LOCKED     // Đã vượt alertThreshold (mặc định 80%), chặn AI request mới
                  //   nhưng cho phép analytics/dashboard/đọc dữ liệu
  HARD_LOCKED     // Đã vượt maxCostAmount, chặn HOÀN TOÀN mọi request AI
                  //   (bao gồm cả premium execution được approval)
}

model AiBudgetLimit {
  id                String            @id @default(cuid())
  tenantId          String
  tenant            Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // ── Cấu hình hạn mức ─────────────────────────────────────────────
  maxCostAmount     BigInt            // Số tiền tối đa (VND, lưu dạng BigInt tránh mất precision)
  currency          String            @default("VND")
  period            BudgetPeriod      // DAILY | WEEKLY | MONTHLY

  // ── Trạng thái luỹ kế ────────────────────────────────────────────
  currentCostSpent  BigInt            @default(0) // Tiền đã tiêu luỹ kế trong kỳ hiện tại
  status            BudgetLimitStatus @default(ACTIVE)

  // ── Ngưỡng cảnh báo ─────────────────────────────────────────────
  alertThreshold    Float             @default(0.8) // 0.0 – 1.0, mặc định 80%
  // ── Timestamps period ─────────────────────────────────────────────
  periodStart       DateTime          // Thời điểm bắt đầu kỳ hiện tại (VD: đầu ngày/đầu tuần/đầu tháng)
  periodEnd         DateTime          // Thời điểm kết thúc kỳ hiện tại
  lastResetAt       DateTime?         // Lần reset gần nhất (null nếu chưa reset)
  softLockedAt      DateTime?         // Thời điểm chuyển sang SOFT_LOCKED (null nếu chưa)
  hardLockedAt      DateTime?         // Thời điểm chuyển sang HARD_LOCKED (null nếu chưa)

  // ── Notification ────────────────────────────────────────────────
  lastAlertSentAt   DateTime?         // Tránh spam: chỉ gửi alert khi lần cuối > 1 giờ

  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  @@unique([tenantId, period])
  @@index([tenantId, status])
  @@index([periodEnd])                // Cho cron: tìm bản ghi cần reset
}

// Lưu ý: Mỗi tenant có thể có tối đa 3 bản ghi (DAILY + WEEKLY + MONTHLY).
// Các bản ghi hoạt động độc lập. Guard kiểm tra TẤT CẢ period đang ACTIVE
// của tenant — nếu bất kỳ period nào ở HARD_LOCKED thì chặn request.
```

**Giải thích thiết kế fields:**

| Field | Kiểu | Lý do |
|---|---|---|
| `maxCostAmount` | BigInt | Tránh mất precision với VND (có thể lên đến hàng tỷ). `BigInt` tương thích với `Wallet.balance` |
| `currentCostSpent` | BigInt | Luỹ kế bất biến, chỉ reset khi period mới. Không dùng aggregate query vì cần real-time + tránh load DB |
| `alertThreshold` | Float | 0.8 = 80%. So sánh `currentCostSpent / maxCostAmount >= alertThreshold` |
| `periodStart` / `periodEnd` | DateTime | Cho phép cron biết chính xác khi nào cần reset. Tính bằng UTC |
| `softLockedAt` / `hardLockedAt` | DateTime? | Audit trail: biết chính xác khi nào lock xảy ra |

### 3.2 Budget Types (`budget.types.ts`)

```typescript
// ============================================================
// payments/budget/budget.types.ts
// Domain types cho Anti-Drain Budget Caps subsystem
// ============================================================

export enum BudgetPeriod {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export enum BudgetLimitStatus {
  ACTIVE = 'ACTIVE',
  SOFT_LOCKED = 'SOFT_LOCKED',
  HARD_LOCKED = 'HARD_LOCKED',
}

/** Input để tạo/Cập nhật hạn mức budget */
export interface UpsertBudgetLimitInput {
  tenantId: string;
  maxCostAmount: bigint; // VND, BigInt
  currency?: string;
  period: BudgetPeriod;
  alertThreshold?: number; // 0.0 - 1.0, mặc định 0.8
}

/** Kết quả kiểm tra budget trước request */
export interface BudgetCheckResult {
  allowed: boolean;
  status: BudgetLimitStatus;
  currentCostSpent: bigint;
  maxCostAmount: bigint;
  usagePercent: number; // 0.0 - 100.0
  blockReason: string | null;
  blockedByPeriods: Array<{
    period: BudgetPeriod;
    status: BudgetLimitStatus;
    currentCostSpent: bigint;
    maxCostAmount: bigint;
  }>;
}

/** Payload cho accumulator — ghi nhận cost sau AI call */
export interface CostAccumulateInput {
  tenantId: string;
  cost: bigint; // VND, số tiền thực tế đã tiêu
  requestId: string; // reference ID để idempotency
  modelKey?: string;
  description?: string;
}

/** Kết quả của accumulator (sau khi cập nhật) */
export interface CostAccumulateResult {
  success: boolean;
  tenantId: string;
  previousSpent: bigint;
  currentSpent: bigint;
  statusBefore: BudgetLimitStatus;
  statusAfter: BudgetLimitStatus;
  alertsTriggered: string[]; // list các alert message đã gửi
  periods: Array<{
    period: BudgetPeriod;
    status: BudgetLimitStatus;
  }>;
}

/** View trả về cho API GET /budget-limits */
export interface BudgetLimitView {
  id: string;
  tenantId: string;
  maxCostAmount: string; // string representation của BigInt
  maxCostAmountDisplay: string; // VD: "5.000.000₫"
  currency: string;
  period: BudgetPeriod;
  currentCostSpent: string;
  currentCostSpentDisplay: string;
  usagePercent: number; // 0.0 - 100.0
  status: BudgetLimitStatus;
  alertThreshold: number;
  periodStart: string; // ISO
  periodEnd: string;
  lastResetAt: string | null;
  softLockedAt: string | null;
  hardLockedAt: string | null;
  lastAlertSentAt: string | null;
}

/** Input để config scheduler */
export interface ResetCandidatesQuery {
  now: Date;
}
```

### 3.3 Hàm Core #1: `BudgetService` — CRUD & State Machine

**File:** `apps/api/src/payments/budget/budget.service.ts`

```typescript
@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetAlertService: BudgetAlertService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // CRUD
  // ─────────────────────────────────────────────────────────────

  /**
   * Tạo hoặc cập nhật hạn mức budget cho tenant.
   * Nếu đã tồn tại bản ghi cho (tenantId, period), cập nhật maxCostAmount + alertThreshold.
   * Khi maxCostAmount thay đổi, recalculate status (có thể tự un-lock nếu nâng limit).
   *
   * Logic:
   *   1. Tính periodStart / periodEnd từ thời điểm hiện tại + period
   *   2. Upsert bản ghi AiBudgetLimit
   *   3. Re-evaluate status dựa trên currentCostSpent vs maxCostAmount mới
   *   4. Nếu tenant muốn un-lock, gọi transitionStatus()
   */
  async upsertBudgetLimit(input: UpsertBudgetLimitInput): Promise<BudgetLimitView> { /* ... */ }

  /**
   * Lấy danh sách budget limits của tenant.
   */
  async getBudgetLimits(tenantId: string): Promise<BudgetLimitView[]> { /* ... */ }

  /**
   * Xoá budget limit (chỉ khi tenant huỷ cấu hình).
   * Không xoá vật lý — set status = 'DISABLED', giữ audit trail.
   */
  async disableBudgetLimit(tenantId: string, period: BudgetPeriod): Promise<void> { /* ... */ }

  // ─────────────────────────────────────────────────────────────
  // BUDGET CHECK (gọi từ Guard & internal)
  // ─────────────────────────────────────────────────────────────

  /**
   * Kiểm tra tổng thể budget của tenant TRƯỚC khi cho phép request AI.
   * Kiểm tra TẤT CẢ period đang ACTIVE (DAILY + WEEKLY + MONTHLY).
   *
   * Quy tắc:
   *   - Nếu BẤT KỲ period nào có status = HARD_LOCKED → BLOCK
   *   - Nếu BẤT KỲ period nào có status = SOFT_LOCKED → BLOCK (trừ request ưu tiên)
   *   - Priority request (executionLane = 'premium-model') chỉ bị chặn nếu HARD_LOCKED
   *
   * @param tenantId - Tenant ID
   * @param isPriority - Request có được ưu tiên không (premium lane)
   * @returns BudgetCheckResult
   */
  async checkBudget(tenantId: string, isPriority = false): Promise<BudgetCheckResult> {
    // 1. Query tất cả AiBudgetLimit active của tenant
    // 2. Với mỗi period:
    //    a. Tính usagePercent = currentCostSpent / maxCostAmount * 100
    //    b. Nếu HARD_LOCKED → blocked = true
    //    c. Nếu SOFT_LOCKED && !isPriority → blocked = true (chỉ chặn non-priority)
    // 3. Tổng hợp blockReason
    // 4. Trả về BudgetCheckResult
  }

  // ─────────────────────────────────────────────────────────────
  // STATE TRANSITION
  // ─────────────────────────────────────────────────────────────

  /**
   * Chuyển trạng thái của budget limit dựa trên currentCostSpent hiện tại.
   *
   * State Machine:
   *
   *   ACTIVE ──(vượt alertThreshold)──→ SOFT_LOCKED
   *   ACTIVE ──(chạm maxCostAmount)────→ HARD_LOCKED
   *   SOFT_LOCKED ──(chạm maxCostAmount)──→ HARD_LOCKED
   *   SOFT_LOCKED ──(giảm spent/reset)──→ ACTIVE (unlock)
   *   HARD_LOCKED ──(reset period)──→ ACTIVE
   *
   * @param tenantId
   * @param period - PERIOD cần đánh giá
   * @param reason - Lý do transition (dùng cho log)
   */
  async transitionStatus(
    tenantId: string,
    period: BudgetPeriod,
    reason: string,
  ): Promise<BudgetLimitStatus> {
    // 1. Đọc bản ghi hiện tại
    // 2. Tính usagePercent = currentCostSpent / maxCostAmount * 100
    // 3. Logic chuyển trạng thái:
    //    usagePercent >= 100% → HARD_LOCKED
    //    usagePercent >= alertThreshold * 100 → SOFT_LOCKED (nếu chưa lock)
    //    else → ACTIVE (unlock nếu đã lock)
    // 4. Nếu có chuyển trạng thái:
    //    a. Update DB (transaction)
    //    b. Gọi budgetAlertService.handleTransition() — gửi notification
    //    c. Ghi AuditEvent
    // 5. Trả về status mới
  }
}
```

#### State Machine chi tiết

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                      START                              │
                    │                (period mới, spent=0)                    │
                    └────────────────────────┬────────────────────────────────┘
                                             │
                                             ▼
                                   ┌─────────────────┐
                                   │     ACTIVE       │
                                   │  spent < alert%  │
                                   └────────┬─────────┘
                                            │
                          ┌─────────────────┼──────────────────┐
                          │                 │                   │
                          ▼                 ▼                   ▼
              ┌────────────────────┐  ┌──────────────┐   ┌────────────────────┐
              │  spent >= alert%  │  │ spent >= 100 │   │   Reset period     │
              │  → SOFT_LOCKED    │  │ → HARD_LOCKED│   │   (spent = 0)      │
              └────────┬──────────┘  └──────┬───────┘   └─────────┬──────────┘
                       │                    │                      │
                       ▼                    ▼                      │
              ┌────────────────────┐  ┌──────────────┐             │
              │   SOFT_LOCKED      │  │ HARD_LOCKED  │             │
              │   chặn non-priority│  │ chặn ALL AI  │             │
              └────────┬──────────┘  └──────┬───────┘             │
                       │                    │                      │
                       │  spent >= 100%     │                      │
                       └────────────────────┘                      │
                                  │                                │
                                  ▼                                │
                          ┌──────────────┐                         │
                          │ HARD_LOCKED  │◄────────────────────────┘
                          │ (final state │     Reset period
                          │  cho period) │
                          └──────────────┘
```

### 3.4 Hàm Core #2: `BudgetGuard` — NestJS Guard thời gian thực

**File:** `apps/api/src/payments/budget/budget.guard.ts`

```typescript
// ============================================================
// payments/budget/budget.guard.ts
// NestJS Guard gài trước các API gọi AI.
//
// Luồng xử lý:
//   1. Lấy tenantId từ request context (giống LedgerDebitInterceptor)
//   2. Gọi BudgetService.checkBudget(tenantId, isPriority)
//   3. Nếu allowed = true → cho request đi tiếp (next.handle())
//   4. Nếu allowed = false → throw HttpException 403 BUDGET_LIMIT_EXCEEDED
//
// Decorator mở rộng:
//   @RequireBudget({ bypassPriority: true }) — cho phép request ưu tiên
//   pass qua SOFT_LOCKED (chỉ chặn HARD_LOCKED)
// ============================================================

@Injectable()
export class BudgetGuard implements CanActivate {
  constructor(
    private readonly budgetService: BudgetService,
    private readonly reflector: Reflector,
    private readonly logger: Logger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = this.getRequest(context);
    const tenantId = this.resolveTenantId(req);

    // Không có tenant → cho qua (các route public)
    if (!tenantId) {
      return true;
    }

    // Kiểm tra có bypass priority không
    const bypassPriority = this.reflector.get<boolean>(
      'budget:bypassPriority',
      context.getHandler(),
    ) ?? false;

    // Gọi checkBudget
    const result = await this.budgetService.checkBudget(tenantId, bypassPriority);

    if (result.allowed) {
      return true;
    }

    // Không cho phép → throw 403
    this.logger.warn(
      `Budget limit exceeded | tenant=${tenantId} | ` +
      `spent=${result.currentCostSpent} | max=${result.maxCostAmount} | ` +
      `usage=${result.usagePercent.toFixed(1)}% | ` +
      `status=${result.status}`,
    );

    throw new HttpException(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: 'BUDGET_LIMIT_EXCEEDED',
        message: `Hạn mức chi phí AI đã đạt ngưỡng tối đa. ` +
                 `Trạng thái: ${result.status}. ` +
                 `Đã tiêu: ${result.currentCostSpent} / ${result.maxCostAmount} VND.`,
        details: {
          status: result.status,
          currentCostSpent: result.currentCostSpent.toString(),
          maxCostAmount: result.maxCostAmount.toString(),
          usagePercent: result.usagePercent,
          blockedByPeriods: result.blockedByPeriods.map(p => ({
            period: p.period,
            status: p.status,
            currentCostSpent: p.currentCostSpent.toString(),
            maxCostAmount: p.maxCostAmount.toString(),
          })),
        },
      },
      HttpStatus.FORBIDDEN,
    );
  }

  private getRequest(context: ExecutionContext): Request {
    return context.switchToHttp().getRequest();
  }

  private resolveTenantId(req: Request): string | null {
    const ctx = (req as RequestWithContext).context;
    return ctx?.tenant?.id ?? null;
  }
}
```

**Decorator companion:**

```typescript
// ============================================================
// budget.decorator.ts (trong cùng folder)
// ============================================================

export const BUDGET_PRIORITY_KEY = 'budget:bypassPriority';

/**
 * Cho phép request bypass SOFT_LOCKED (chỉ bị chặn nếu HARD_LOCKED).
 * Dùng cho các API premium / admin override.
 */
export const RequireBudgetPriority = () => SetMetadata(BUDGET_PRIORITY_KEY, true);
```

**Cách gài vào controller:**

```typescript
// Trong AI controller (VD: ai-governance.controller.ts hoặc ai-gateway.controller.ts)

@Post('chat/completions')
@UseGuards(AccessPolicyGuard, BudgetGuard)  // BudgetGuard chạy SAU AccessPolicyGuard
@RequireAccessPolicy({ minimumRole: MembershipRole.OPERATOR, scope: 'operator-control' })
async chatCompletion(@Body() body: ChatCompletionRequest) {
  // ... xử lý AI call
}

// Đối với route premium:
@Post('chat/completions/premium')
@UseGuards(AccessPolicyGuard, BudgetGuard)
@RequireAccessPolicy({ minimumRole: MembershipRole.ADMIN, scope: 'tenant-admin' })
@RequireBudgetPriority()  // Bypass SOFT_LOCKED
async premiumChatCompletion(@Body() body: ChatCompletionRequest) {
  // ... xử lý premium AI call
}
```

### 3.5 Hàm Core #3: `CostAccumulatorService` + `BudgetSchedulerService`

**File:** `apps/api/src/payments/budget/budget-accumulator.service.ts`

```typescript
// ============================================================
// payments/budget/budget-accumulator.service.ts
// Core logic: cập nhật currentCostSpent bất đồng bộ sau mỗi AI call thành công.
// ============================================================

@Injectable()
export class BudgetAccumulatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetService: BudgetService,
    private readonly budgetAlertService: BudgetAlertService,
    private readonly logger: Logger,
  ) {}

  /**
   * Cộng dồn chi phí sau mỗi request AI thành công.
   *
   * Quy trình:
   *   1. Đọc tất cả AiBudgetLimit ACTIVE của tenant
   *   2. Với mỗi period, cộng cost vào currentCostSpent
   *   3. Kiểm tra ngưỡng: nếu vượt alertThreshold hoặc maxCostAmount
   *   4. Chuyển trạng thái nếu cần (ACTIVE → SOFT_LOCKED → HARD_LOCKED)
   *   5. Gửi alert nếu vừa vượt threshold
   *
   * Idempotent: nếu requestId đã được xử lý, bỏ qua (kiểm tra qua metadata
   * hoặc referenceId trong AiUsageEvent).
   *
   * @param input - CostAccumulateInput
   * @returns CostAccumulateResult
   */
  async accumulate(input: CostAccumulateInput): Promise<CostAccumulateResult> {
    const { tenantId, cost, requestId, modelKey, description } = input;

    // ====== KIỂM TRA IDEMPOTENCY ======
    // Nếu request này đã được accumulate rồi, bỏ qua
    // Cơ chế: dùng prisma findFirst với transaction reference
    if (await this.isAlreadyAccumulated(tenantId, requestId)) {
      this.logger.debug(`Skipping duplicate accumulation: ${requestId}`);
      return {
        success: true, // KHÔNG phải lỗi — idempotent contract
        tenantId,
        previousSpent: BigInt(0),
        currentSpent: BigInt(0),
        statusBefore: BudgetLimitStatus.ACTIVE,
        statusAfter: BudgetLimitStatus.ACTIVE,
        alertsTriggered: [],
        periods: [],
      };
    }

    // ====== TRANSACTION ATOMIC ======
    // Dùng Prisma $transaction để đảm bảo tính toàn vẹn giữa update + log
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Lấy tất cả budget limits ACTIVE của tenant
      const limits = await tx.aiBudgetLimit.findMany({
        where: {
          tenantId,
          status: { in: [BudgetLimitStatus.ACTIVE, BudgetLimitStatus.SOFT_LOCKED] },
        },
      });

      if (limits.length === 0) {
        return {
          previousSpent: BigInt(0),
          currentSpent: BigInt(0),
          statusBefore: BudgetLimitStatus.ACTIVE,
          statusAfter: BudgetLimitStatus.ACTIVE,
          transitions: [],
          periods: [],
        };
      }

      const alerts: string[] = [];
      const transitions: Array<{ period: BudgetPeriod; from: BudgetLimitStatus; to: BudgetLimitStatus }> = [];

      // 2. Cộng dồn vào mỗi period
      for (const limit of limits) {
        const previousSpent = limit.currentCostSpent;
        const newSpent = previousSpent + cost;

        // Cập nhật currentCostSpent
        await tx.aiBudgetLimit.update({
          where: { id: limit.id },
          data: { currentCostSpent: newSpent },
        });

        // 3. Tính ngưỡng
        const maxAmount = limit.maxCostAmount;
        const alertAt = BigInt(Math.floor(Number(maxAmount) * limit.alertThreshold));
        const previousPct = Number(previousSpent) / Number(maxAmount);
        const newPct = Number(newSpent) / Number(maxAmount);

        // Chưa lock → kiểm tra có cần transition không
        if (limit.status === BudgetLimitStatus.ACTIVE) {
          // HARD_LOCKED: vượt quá maxCostAmount
          if (newSpent >= maxAmount) {
            await tx.aiBudgetLimit.update({
              where: { id: limit.id },
              data: {
                status: BudgetLimitStatus.HARD_LOCKED,
                hardLockedAt: new Date(),
              },
            });
            transitions.push({
              period: limit.period as BudgetPeriod,
              from: BudgetLimitStatus.ACTIVE,
              to: BudgetLimitStatus.HARD_LOCKED,
            });
            alerts.push(
              `[${limit.period}] HARD_LOCKED: Đã đạt hạn mức tối đa ${this.formatVnd(maxAmount)}. Mọi request AI bị chặn.`,
            );
          }
          // SOFT_LOCKED: vượt alertThreshold
          else if (newSpent >= alertAt && previousPct < Number(limit.alertThreshold)) {
            await tx.aiBudgetLimit.update({
              where: { id: limit.id },
              data: {
                status: BudgetLimitStatus.SOFT_LOCKED,
                softLockedAt: new Date(),
              },
            });
            transitions.push({
              period: limit.period as BudgetPeriod,
              from: BudgetLimitStatus.ACTIVE,
              to: BudgetLimitStatus.SOFT_LOCKED,
            });
            alerts.push(
              `[${limit.period}] SOFT_LOCKED: Đã sử dụng ${(newPct * 100).toFixed(1)}% hạn mức (${this.formatVnd(newSpent)} / ${this.formatVnd(maxAmount)}). Chặn request AI không ưu tiên.`,
            );
          }
        }
        // SOFT_LOCKED → HARD_LOCKED
        else if (limit.status === BudgetLimitStatus.SOFT_LOCKED && newSpent >= maxAmount) {
          await tx.aiBudgetLimit.update({
            where: { id: limit.id },
            data: {
              status: BudgetLimitStatus.HARD_LOCKED,
              hardLockedAt: new Date(),
            },
          });
          transitions.push({
            period: limit.period as BudgetPeriod,
            from: BudgetLimitStatus.SOFT_LOCKED,
            to: BudgetLimitStatus.HARD_LOCKED,
          });
          alerts.push(
            `[${limit.period}] HARD_LOCKED (từ SOFT): Đã đạt hạn mức tối đa.`,
          );
        }

        // Ghi nhận thông báo threshold nếu vừa vượt lần đầu
        if (newPct >= Number(limit.alertThreshold) && previousPct < Number(limit.alertThreshold)) {
          alerts.push(
            `[${limit.period}] Cảnh báo: Đã sử dụng ${(newPct * 100).toFixed(1)}% hạn mức AI.`,
          );
        }
      }

      return {
        previousSpent: limits[0]?.currentCostSpent ?? BigInt(0),
        currentSpent: limits[0]?.currentCostSpent + cost,
        statusBefore: limits[0]?.status as BudgetLimitStatus ?? BudgetLimitStatus.ACTIVE,
        statusAfter: transitions.length > 0
          ? transitions[transitions.length - 1].to
          : (limits[0]?.status as BudgetLimitStatus ?? BudgetLimitStatus.ACTIVE),
        transitions,
        periods: limits.map(l => ({
          period: l.period as BudgetPeriod,
          status: transitions.find(t => t.period === (l.period as BudgetPeriod))?.to ?? (l.status as BudgetLimitStatus),
        })),
      };
    });

    // ====== POST-TRANSACTION HOOKS (fire-and-forget) ======
    // KHÔNG block accumulator — gửi alert và ghi log bất đồng bộ

    // Ghi nhận idempotency marker
    await this.recordAccumulation(tenantId, requestId, cost, description).catch((err) =>
      this.logger.warn(`Failed to record idempotency marker: ${err.message}`),
    );

    // Gửi alert notification (nếu có)
    for (const alertMsg of result.alertsTriggered) {
      this.budgetAlertService.sendAlert(tenantId, alertMsg, result.periods).catch((err) =>
        this.logger.warn(`Failed to send budget alert: ${err.message}`),
      );
    }

    // Ghi AuditEvent cho mỗi transition
    for (const t of result.transitions) {
      this.logAuditEvent(tenantId, t.period, t.from, t.to).catch((err) =>
        this.logger.warn(`Failed to log budget audit: ${err.message}`),
      );
    }

    // Logging
    if (result.transitions.length > 0) {
      this.logger.warn(
        `Budget state transition | tenant=${tenantId} | ` +
        `transitions=${result.transitions.map(t => `${t.period}: ${t.from}→${t.to}`).join(', ')}`,
      );
    }

    return {
      success: true,
      tenantId,
      previousSpent: result.previousSpent,
      currentSpent: result.currentSpent,
      statusBefore: result.statusBefore,
      statusAfter: result.statusAfter,
      alertsTriggered: result.alertsTriggered,
      periods: result.periods,
    };
  }

  // ─── HELPERS ─────────────────────────────────────────────

  private formatVnd(amount: bigint): string {
    return `${Number(amount).toLocaleString('vi-VN')}₫`;
  }

  /**
   * Kiểm tra idempotency: requestId đã được accumulate chưa?
   * Dùng bảng riêng (BudgetAccumulationLog) hoặc metadata của AiUsageEvent.
   */
  private async isAlreadyAccumulated(tenantId: string, requestId: string): Promise<boolean> {
    // Sử dụng Prisma đọc reference ID từ budget accumulation tracking
    // Có thể dùng bảng LedgerTransaction với referenceType = 'budget-accumulate'
    // hoặc dùng bảng đệm trong transaction
    const existing = await this.prisma.budgetAccumulationLog.findUnique({
      where: { requestId_tenantId: { requestId, tenantId } },
    });
    return existing !== null;
  }

  /**
   * Ghi nhận idempotency marker.
   */
  private async recordAccumulation(
    tenantId: string,
    requestId: string,
    cost: bigint,
    description?: string,
  ): Promise<void> {
    // Upsert vào BudgetAccumulationLog để tránh duplicate
    await this.prisma.budgetAccumulationLog.upsert({
      where: { requestId_tenantId: { requestId, tenantId } },
      create: {
        tenantId,
        requestId,
        cost,
        description,
      },
      update: {}, // Nếu đã tồn tại, không làm gì thêm
    });
  }

  private async logAuditEvent(
    tenantId: string,
    period: BudgetPeriod,
    from: BudgetLimitStatus,
    to: BudgetLimitStatus,
  ): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        tenantId,
        action: 'BUDGET_STATE_TRANSITION',
        actorType: 'SYSTEM',
        targetType: 'AiBudgetLimit',
        targetId: `${tenantId}:${period}`,
        metadata: {
          period,
          from,
          to,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }
}
```

**File:** `apps/api/src/payments/budget/budget-scheduler.service.ts`

```typescript
// ============================================================
// payments/budget/budget-scheduler.service.ts
// Cron Job: tự động reset currentCostSpent về 0 khi bước sang
// ngày/tuần/tháng mới.
// ============================================================

@Injectable()
export class BudgetSchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetAlertService: BudgetAlertService,
    private readonly logger: Logger,
  ) {}

  /**
   * Cron handler — chạy mỗi 15 phút (cấu hình qua @Cron hoặc ScheduleModule).
   *
   * Logic:
   *   1. Tìm tất cả AiBudgetLimit có periodEnd < now (đã hết kỳ)
   *   2. Với mỗi bản ghi:
   *      a. Reset currentCostSpent = 0
   *      b. Tính periodStart / periodEnd mới
   *      c. Set status = ACTIVE
   *      d. Clear softLockedAt / hardLockedAt
   *      e. Set lastResetAt = now
   *   3. Ghi AuditEvent cho mỗi reset
   *   4. Gửi notification nếu budget đã được reset từ HARD_LOCKED
   *
   * Công thức tính period mới:
   *   DAILY  → periodStart = 00:00:00 UTC hôm nay, periodEnd = 23:59:59 UTC hôm nay
   *   WEEKLY → periodStart = 00:00:00 UTC thứ Hai tuần này, periodEnd = 23:59:59 UTC Chủ nhật
   *   MONTHLY→ periodStart = 01 00:00:00 UTC tháng này, periodEnd = cuối tháng 23:59:59 UTC
   */
  async resetExpiredPeriods(): Promise<{
    resetCount: number;
    hardLockedResetCount: number;
  }> {
    const now = new Date();
    const expiredLimits = await this.prisma.aiBudgetLimit.findMany({
      where: {
        periodEnd: { lt: now },
        // Chỉ reset các bản ghi có periodEnd trước now (đã hết kỳ)
        // KHÔNG reset các bản ghi đã bị DISABLED
      },
    });

    let resetCount = 0;
    let hardLockedResetCount = 0;

    for (const limit of expiredLimits) {
      const period = limit.period as BudgetPeriod;
      const wasHardLocked = limit.status === BudgetLimitStatus.HARD_LOCKED;

      // Tính period mới
      const { periodStart, periodEnd } = this.computeNewPeriod(period, now);

      // Reset
      await this.prisma.aiBudgetLimit.update({
        where: { id: limit.id },
        data: {
          currentCostSpent: BigInt(0),
          status: BudgetLimitStatus.ACTIVE,
          periodStart,
          periodEnd,
          lastResetAt: now,
          softLockedAt: null,
          hardLockedAt: null,
        },
      });

      resetCount++;
      if (wasHardLocked) hardLockedResetCount++;

      // Ghi audit
      await this.prisma.auditEvent.create({
        data: {
          tenantId: limit.tenantId,
          action: 'BUDGET_PERIOD_RESET',
          actorType: 'SYSTEM',
          targetType: 'AiBudgetLimit',
          targetId: `${limit.tenantId}:${period}`,
          metadata: {
            period,
            wasHardLocked,
            lastPeriodEnd: limit.periodEnd.toISOString(),
            newPeriodStart: periodStart.toISOString(),
            newPeriodEnd: periodEnd.toISOString(),
          },
        },
      });

      // Nếu vừa reset từ HARD_LOCKED, gửi thông báo
      if (wasHardLocked) {
        this.budgetAlertService.sendPeriodResetNotification(
          limit.tenantId,
          period,
        ).catch((err) =>
          this.logger.warn(`Failed to send period reset notification: ${err.message}`),
        );
      }

      this.logger.log(
        `Budget period reset | tenant=${limit.tenantId} | period=${period} | ` +
        `wasHardLocked=${wasHardLocked} | newEnd=${periodEnd.toISOString()}`,
      );
    }

    if (resetCount > 0) {
      this.logger.log(
        `Budget scheduler: reset ${resetCount} periods (${hardLockedResetCount} from HARD_LOCKED)`,
      );
    }

    return { resetCount, hardLockedResetCount };
  }

  /**
   * Tính periodStart / periodEnd mới dựa trên thời điểm hiện tại.
   *
   * DAILY:
   *   start = 2026-06-18T00:00:00.000Z
   *   end   = 2026-06-18T23:59:59.999Z
   *
   * WEEKLY:
   *   start = 2026-06-15T00:00:00.000Z (thứ Hai)
   *   end   = 2026-06-21T23:59:59.999Z (Chủ nhật)
   *
   * MONTHLY:
   *   start = 2026-06-01T00:00:00.000Z
   *   end   = 2026-06-30T23:59:59.999Z
   */
  private computeNewPeriod(
    period: BudgetPeriod,
    now: Date,
  ): { periodStart: Date; periodEnd: Date } {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const date = now.getUTCDate();
    const dayOfWeek = now.getUTCDay(); // 0 = CN, 1 = T2, ..., 6 = T7

    switch (period) {
      case 'DAILY': {
        const start = new Date(Date.UTC(year, month, date, 0, 0, 0, 0));
        const end = new Date(Date.UTC(year, month, date, 23, 59, 59, 999));
        return { periodStart: start, periodEnd: end };
      }
      case 'WEEKLY': {
        // Thứ Hai = dayOfWeek 1 (ISO), nếu CN = 0 thì lùi 6 ngày
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(Date.UTC(year, month, date + mondayOffset));
        const sunday = new Date(Date.UTC(year, month, date + mondayOffset + 6, 23, 59, 59, 999));
        return { periodStart: monday, periodEnd: sunday };
      }
      case 'MONTHLY': {
        const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
        return { periodStart: start, periodEnd: end };
      }
      default:
        throw new Error(`Unsupported budget period: ${period}`);
    }
  }
}
```

### 3.6 Budget Controller (`budget.controller.ts`)

```typescript
// ============================================================
// payments/budget/budget.controller.ts
// REST API cho Anti-Drain Budget Caps CRUD + monitoring
// ============================================================

@Controller('budget-limits')
@UseGuards(AccessPolicyGuard)
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  // ── CRUD ─────────────────────────────────────────────────

  /**
   * GET /budget-limits
   * Lấy danh sách budget limits của tenant hiện tại.
   */
  @Get()
  @RequireAccessPolicy({ minimumRole: MembershipRole.OPERATOR, scope: 'operator-control' })
  async getBudgetLimits(
    @Headers('x-tenant-id') tenantId: string,
  ): Promise<{ budgetLimits: BudgetLimitView[] }> {
    const limits = await this.budgetService.getBudgetLimits(tenantId);
    return { budgetLimits: limits };
  }

  /**
   * POST /budget-limits
   * Tạo hoặc cập nhật budget limit.
   */
  @Post()
  @RequireAccessPolicy({ minimumRole: MembershipRole.ADMIN, scope: 'tenant-admin' })
  async upsertBudgetLimit(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: UpsertBudgetLimitRequestBody,
  ): Promise<{ budgetLimit: BudgetLimitView }> {
    const limit = await this.budgetService.upsertBudgetLimit({
      tenantId,
      maxCostAmount: BigInt(body.maxCostAmount),
      currency: body.currency ?? 'VND',
      period: body.period as BudgetPeriod,
      alertThreshold: body.alertThreshold ?? 0.8,
    });
    return { budgetLimit: limit };
  }

  /**
   * DELETE /budget-limits/:period
   * Vô hiệu hoá budget limit (soft delete).
   */
  @Delete(':period')
  @RequireAccessPolicy({ minimumRole: MembershipRole.ADMIN, scope: 'tenant-admin' })
  async disableBudgetLimit(
    @Headers('x-tenant-id') tenantId: string,
    @Param('period') period: string,
  ): Promise<{ success: boolean }> {
    await this.budgetService.disableBudgetLimit(tenantId, period as BudgetPeriod);
    return { success: true };
  }

  // ── Usage / Status ───────────────────────────────────────

  /**
   * GET /budget-limits/usage
   * Xem nhanh tình trạng sử dụng budget hiện tại (cho dashboard).
   */
  @Get('usage')
  @RequireAccessPolicy({ minimumRole: MembershipRole.OPERATOR, scope: 'operator-control' })
  async getCurrentUsage(
    @Headers('x-tenant-id') tenantId: string,
  ): Promise<{ usage: BudgetCheckResult }> {
    const result = await this.budgetService.checkBudget(tenantId, false);
    return { usage: result };
  }

  /**
   * GET /budget-limits/:period/history
   * Lấy lịch sử accumulate (cho audit dashboard).
   */
  @Get(':period/history')
  @RequireAccessPolicy({ minimumRole: MembershipRole.ADMIN, scope: 'tenant-admin' })
  async getAccumulationHistory(
    @Headers('x-tenant-id') tenantId: string,
    @Param('period') period: string,
  ): Promise<{ history: unknown[] }> {
    // Query từ BudgetAccumulationLog hoặc AuditLog
    const history = await this.queryAccumulationHistory(tenantId, period);
    return { history };
  }
}
```

**Request body type cho upsert:**

```typescript
interface UpsertBudgetLimitRequestBody {
  maxCostAmount: string; // BigInt-safe: nhận string, parse trong controller
  currency?: string;
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  alertThreshold?: number; // 0.0 - 1.0
}
```

### 3.7 Budget Alert Service (`budget-alert.service.ts`)

```typescript
// ============================================================
// payments/budget/budget-alert.service.ts
// Xử lý gửi thông báo khi budget vượt ngưỡng.
// ============================================================

@Injectable()
export class BudgetAlertService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService, // nếu có
    private readonly logger: Logger,
  ) {}

  /**
   * Gửi alert khi budget vượt threshold.
   * Kiểm tra lastAlertSentAt để tránh spam (chỉ gửi lại sau 1 giờ).
   *
   * Các kênh gửi:
   *   1. Ghi NotificationLog (sẵn sàng cho UI dashboard)
   *   2. [Future] Gửi email / Zalo / Webhook nếu tenant đã cấu hình
   */
  async sendAlert(
    tenantId: string,
    message: string,
    periods: Array<{ period: BudgetPeriod; status: BudgetLimitStatus }>,
  ): Promise<void> {
    // Kiểm tra lastAlertSentAt
    const limits = await this.prisma.aiBudgetLimit.findMany({
      where: { tenantId, period: { in: periods.map(p => p.period) } },
    });

    const now = new Date();
    const cooldownMs = 60 * 60 * 1000; // 1 giờ

    for (const limit of limits) {
      if (limit.lastAlertSentAt) {
        const elapsedMs = now.getTime() - limit.lastAlertSentAt.getTime();
        if (elapsedMs < cooldownMs) {
          this.logger.debug(`Skipping alert (cooldown): tenant=${tenantId} period=${limit.period}`);
          return; // Cooldown chưa hết → bỏ qua
        }
      }
    }

    // Ghi NotificationLog
    await this.prisma.notificationLog.create({
      data: {
        tenantId,
        channel: 'LOG',
        to: tenantId,
        subject: '[AI Budget] Cảnh báo hạn mức chi phí AI',
        renderedBody: message,
        status: 'SENT',
        metadata: {
          type: 'BUDGET_ALERT',
          periods: periods.map(p => ({ period: p.period, status: p.status })),
        },
      },
    });

    // Update lastAlertSentAt
    for (const limit of limits) {
      await this.prisma.aiBudgetLimit.update({
        where: { id: limit.id },
        data: { lastAlertSentAt: now },
      });
    }

    this.logger.log(`Budget alert sent | tenant=${tenantId} | message=${message}`);
  }

  /**
   * Gửi thông báo khi period được reset (đặc biệt từ HARD_LOCKED → ACTIVE).
   */
  async sendPeriodResetNotification(
    tenantId: string,
    period: BudgetPeriod,
  ): Promise<void> {
    const message =
      `[${period}] Hạn mức chi phí AI đã được tự động reset. ` +
      `Bạn có thể tiếp tục sử dụng dịch vụ AI bình thường.`;

    await this.prisma.notificationLog.create({
      data: {
        tenantId,
        channel: 'LOG',
        to: tenantId,
        subject: '[AI Budget] Hạn mức đã được reset',
        renderedBody: message,
        status: 'SENT',
        metadata: {
          type: 'BUDGET_PERIOD_RESET',
          period,
        },
      },
    });
  }

  /**
   * Gửi thông báo khi budget sắp đạt ngưỡng (optional, gọi từ accumulator).
   */
  async sendApproachingLimitWarning(
    tenantId: string,
    period: BudgetPeriod,
    usagePercent: number,
  ): Promise<void> {
    if (usagePercent >= 80 && usagePercent < 100) {
      await this.sendAlert(
        tenantId,
        `[${period}] Cảnh báo: Đã sử dụng ${usagePercent.toFixed(1)}% hạn mức AI. ` +
        `Vui lòng kiểm tra hoặc nâng hạn mức.`,
        [{ period, status: BudgetLimitStatus.ACTIVE }],
      );
    }
  }
}
```

### 3.8 Budget Module (`budget.module.ts`)

```typescript
// ============================================================
// payments/budget/budget.module.ts
// NestJS Module — đăng ký tất cả providers + controller + scheduler
// ============================================================

@Module({
  imports: [
    TenancyModule,
    // ScheduleModule.forRoot() — đã có ở app.module.ts
  ],
  controllers: [BudgetController],
  providers: [
    BudgetService,
    BudgetGuard,
    BudgetAccumulatorService,
    BudgetSchedulerService,
    BudgetAlertService,
    // Đăng ký cron job
    {
      provide: 'BUDGET_RESET_CRON',
      useFactory: (scheduler: BudgetSchedulerService) => {
        const job = new CronJob('*/15 * * * *', () => scheduler.resetExpiredPeriods());
        job.start();
        return job;
      },
      inject: [BudgetSchedulerService],
    },
  ],
  exports: [
    BudgetGuard,
    BudgetAccumulatorService,
    BudgetService,
  ],
})
export class BudgetModule {}
```

### 3.9 Budget Config (`budget.config.ts`)

```typescript
// ============================================================
// payments/budget/budget.config.ts
// Config constants cho Anti-Drain Budget Caps
// ============================================================

export const BUDGET_CONFIG = {
  /** Ngưỡng cảnh báo mặc định (% của maxCostAmount) */
  defaultAlertThreshold: 0.8, // 80%

  /** Đơn vị tiền tệ mặc định */
  defaultCurrency: 'VND',

  /** Cooldown giữa các lần gửi alert (ms) */
  alertCooldownMs: 60 * 60 * 1000, // 1 giờ

  /** Cron schedule: kiểm tra reset mỗi 15 phút */
  resetCronExpression: '*/15 * * * *',

  /** Số tiền tối thiểu cho maxCostAmount (VND) */
  minimumBudgetAmount: BigInt(10000), // 10,000 VND

  /** Kích thước batch tối đa cho mỗi lần accumulate */
  maxAccumulateBatch: 100,
};
```

### 3.10 Prisma Schema Update — BudgetAccumulationLog

```prisma
// ============================================================
// Thêm model phụ trợ: BudgetAccumulationLog (idempotency tracking)
// ============================================================

model BudgetAccumulationLog {
  id          String   @id @default(cuid())
  tenantId    String
  requestId   String   // reference đến AI request
  cost        BigInt
  description String?
  createdAt   DateTime @default(now())

  @@unique([requestId, tenantId])
  @@index([tenantId, createdAt])
}
```

---

## IV. API CONTRACTS

### 4.1 REST API Endpoints

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| `GET` | `/budget-limits` | OPERATOR | Danh sách budget limits của tenant |
| `POST` | `/budget-limits` | ADMIN | Tạo/cập nhật budget limit |
| `DELETE` | `/budget-limits/:period` | ADMIN | Vô hiệu hoá budget limit |
| `GET` | `/budget-limits/usage` | OPERATOR | Tình trạng sử dụng budget hiện tại |
| `GET` | `/budget-limits/:period/history` | ADMIN | Lịch sử accumulate |

### 4.2 Error Codes

| HTTP Status | Error Code | Mô tả |
|---|---|---|
| `403` | `BUDGET_LIMIT_EXCEEDED` | Budget đã đạt hoặc vượt ngưỡng cho phép |
| `403` | `BUDGET_SOFT_LOCKED` | Budget đã vượt alertThreshold (chỉ non-priority bị chặn) |
| `403` | `BUDGET_HARD_LOCKED` | Budget đã chạm maxCostAmount (mọi request bị chặn) |
| `400` | `INVALID_BUDGET_AMOUNT` | maxCostAmount < minimumBudgetAmount |
| `409` | `BUDGET_CONFLICT` | Conflict khi accumulate song song (rare, CAS sẽ xử lý) |

### 4.3 Integration với hệ thống hiện tại

**Luồng gọi AI hoàn chỉnh (sau khi tích hợp Anti-Drain):**

```
Client
  │
  ▼
AccessPolicyGuard (kiểm tra quyền)
  │
  ▼
BudgetGuard (kiểm tra budget cap)         ◄── [NEW] BUDGET LIMIT CHECK
  │  ├── HARD_LOCKED → 403 FORBIDDEN
  │  └── SOFT_LOCKED + non-priority → 403 FORBIDDEN
  │
  ▼
LedgerDebitInterceptor (kiểm tra wallet)   ◄── [EXISTING] WALLET BALANCE CHECK
  │  └── balance = 0 → 402 PAYMENT_REQUIRED
  │
  ▼
AI Handler (thực thi AI call)
  │
  ▼
LedgerDebitInterceptor (debit sau call)
  │
  ▼
BudgetAccumulatorService.accumulate()      ◄── [NEW] COST ACCUMULATION
     ├── Cộng currentCostSpent
     ├── Kiểm tra threshold → state transition
     └── Gửi alert nếu cần
```

---

## V. GIẢI THÍCH THIẾT KẾ & RỦI RO

### 5.1 Tại sao không dùng `AiBudgetPolicy` hiện tại?

`AiBudgetPolicy` đang lưu:
- `monthlyTokenBudget` — **token**, không phải cost
- `hardMonthlyTokenLimit` — **token**
- `blockOnHardLimit` — boolean

**Vấn đề:** Token không tương đương cost. Cùng số lượng token nhưng model khác nhau (GPT-4 vs GPT-3.5) có cost khác nhau gấp 10-20 lần. Một tenant có thể dùng hết $200 budget trong khi mới dùng 30% token limit.

**Giải pháp:** Xây module riêng `budget/` dựa trên cost (VND BigInt), period linh hoạt (DAILY/WEEKLY/MONTHLY), state machine 3 trạng thái.

Hai hệ thống tồn tại song song:
- `AiBudgetPolicy` → token-based routing decision (downgrade lane khi gần hết token)
- `AiBudgetLimit` → cost-based blocking decision (chặn hoàn toàn khi hết tiền)

### 5.2 Tại sao dùng Guard thay vì Interceptor?

| Ưu điểm | Guard | Interceptor (hiện tại) |
|---|---|---|
| Thời điểm chạy | **TRƯỚC** handler | Bao handler (trước + sau) |
| Mục đích | Authorization / Access control | Logging / Transformation |
| Fail-fast | ✅ Ném lỗi NGAY, không tốn tài nguyên | Phải chạy qua pipeline |
| Phân tách concern | Budget check riêng, wallet check riêng | Gộp chung debit + check |

**Kết luận:** Budget check là **authorization concern** (có được phép xài AI không?) → Guard. Wallet debit là **post-processing concern** (ghi nợ sau khi dùng) → Interceptor.

### 5.3 Idempotency & Race Condition

**Vấn đề:** Nếu 2 request AI cùng lúc của cùng tenant đều pass guard (chưa lock), cả 2 đều accumulate → có thể vượt quá limit.

**Giải pháp:**
1. **Prisma interactive transaction** — update `currentCostSpent` trong transaction
2. **Optimistic lock** — dùng version field (giống `LedgerService`)
3. **BudgetAccumulationLog** — idempotency marker để tránh accumulate 2 lần cho cùng requestId

### 5.4 Tính toán BigInt

VND có thể lên đến hàng tỷ (VD: maxCostAmount = 10,000,000,000₫). Dùng `Float` sẽ mất precision. Tất cả cost fields đều dùng `BigInt` (tương thích với `Wallet.balance` và `LedgerTransaction.amount`).

**Chú ý:** Prisma hỗ trợ BigInt native (prisma-client-js). TypeScript cần handle BigInt → string khi trả về qua JSON API.

---

## VI. FILE TREE & IMPLEMENTATION ORDER

### Implementation batches

```
Batch 1 — Schema + Types + Config (fundamental layer)
  [1] apps/api/prisma/schema.prisma           → Thêm AiBudgetLimit + BudgetAccumulationLog
  [2] apps/api/src/payments/budget/budget.types.ts
  [3] apps/api/src/payments/budget/budget.config.ts

Batch 2 — Core Service + State Machine
  [4] apps/api/src/payments/budget/budget.service.ts
  [5] apps/api/src/payments/budget/budget-alert.service.ts

Batch 3 — Guard + Controller + REST API
  [6] apps/api/src/payments/budget/budget.guard.ts
  [7] apps/api/src/payments/budget/budget.decorator.ts
  [8] apps/api/src/payments/budget/budget.controller.ts

Batch 4 — Accumulator + Scheduler + Module wiring
  [9] apps/api/src/payments/budget/budget-accumulator.service.ts
  [10] apps/api/src/payments/budget/budget-scheduler.service.ts
  [11] apps/api/src/payments/budget/budget.module.ts
  [12] apps/api/src/payments/payments.module.ts  → Import BudgetModule

Batch 5 — Guard integration vào AI routes
  [13] Các AI controller: thêm @UseGuards(BudgetGuard)
  [14] Premium routes: thêm @RequireBudgetPriority()
```

**Tổng cộng:** 12 files mới + 2 files update = **14 files**.

---

## VII. KẾT LUẬN

Subsystem Anti-Drain Budget Caps cung cấp 3 năng lực cốt lõi:

| # | Chức năng | File | Input → Output |
|---|---|---|---|
| 1 | **Budget Limit CRUD** | `budget.service.ts` | Upsert/get/disable budget limit với BigInt VND + 3 period types |
| 2 | **Real-time Budget Guard** | `budget.guard.ts` | Guard → budgetCheck → 403 BUDGET_LIMIT_EXCEEDED hoặc cho qua |
| 3 | **Cost Accumulator + Cron Reset** | `budget-accumulator.service.ts` + `budget-scheduler.service.ts` | Sau AI call → accumulate cost → state transition → cron reset period |

Subsystem này **không thay thế** bất kỳ module nào hiện có:
- `LedgerDebitInterceptor` vẫn giữ nguyên (kiểm wallet balance + debit)
- `AiBudgetPolicy` vẫn giữ nguyên (token-based routing decision)
- `BillingAccount` / `Wallet` vẫn giữ nguyên

---

*Thiết kế hoàn thành: 2026-06-18*
*Phase 4 — Anti-Drain Budget Caps Subsystem*
*Trạng thái: 🟡 Design ready — chờ AIFUT GO để implement*

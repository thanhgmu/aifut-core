# Multi-tenant Activity Logs & Security Audit Trail — Backend Design

> **Phase:** Phase 2 (Operator Ready)
> **Trạng thái:** DESIGN ONLY — dừng lại ở bản thiết kế, chưa implement
> **HEAD hiện tại:** `e0dcfbe` — Phase 1 hoàn thành, Phase 2 ~86%
> **Người thiết kế:** Claude opus (XHigh) — 2026-06-18
> **Lệnh:** `AIFUT THINK` — xuất design xong → IDLE

---

## I. TỔNG QUAN & MỤC TIÊU

### 1.1 Hiện trạng

Backend `apps/api` đã có nền tảng audit cơ bản:

| Thành phần | Trạng thái | Chi tiết |
|---|---|---|
| `AuditEvent` model (Prisma) | ✅ Có | 9 fields: id, tenantId, userId, actorType, action, targetType, targetId, metadata, createdAt |
| `AuditLog` model (Prisma) | ⚠️ Legacy | Model cũ, ít fields, không dùng cho production audit |
| `AuditEventsService` | ✅ Có | `write()`, `listRecent()`, `findById()`, `listAiGovernanceApprovalDispatchResumes()` |
| `AuditController` | ✅ Có | `POST /audit/events`, `GET /audit/events`, `GET /audit/events/:eventId` |
| `AuditModule` | ✅ Có | Wire cơ bản, import TenancyModule |
| `audit.constants.ts` | ✅ Có | `AUDIT_FOUNDATION_ROADMAP` |
| `audit-events.service.spec.ts` | ⚠️ Partial | Chỉ test 1 case |
| `AuditActorType` enum | ✅ Có | `USER │ SYSTEM │ SERVICE` |

### 1.2 Khoảng trống (Gaps) cần giải quyết

| # | Gap | Mức độ | Mô tả |
|---|---|---|---|
| 1 | Thiếu `actorEmail`, `ipAddress`, `userAgent` trong AuditEvent model | 🔴 Critical | Không thể trace ai đã làm gì từ đâu |
| 2 | Thiếu `oldValue` / `newValue` (diff payload) | 🔴 Critical | Không thể biết dữ liệu thay đổi thế nào |
| 3 | Không có `@AuditEvent()` decorator + Interceptor | 🔴 Critical | Mọi controller phải gọi service thủ công |
| 4 | `listRecent()` dùng offset pagination | 🟡 Medium | Không scale được cho audit trail lớn |
| 5 | Không có cursor pagination | 🟡 Medium | Cần cho production workload |
| 6 | File audit nằm flat ở `src/` | 🟢 Low | Nên có `src/audit/` subdirectory |
| 7 | Thiếu bộ lọc nâng cao (action, date range) | 🟡 Medium | Chỉ filter được theo workspace slug |
| 8 | `AuditLog` model song song không dùng | 🟢 Low | Có thể drop hoặc clean up sau |

### 1.3 Mục tiêu thiết kế

1. **Bất biến (Immutable):** Mỗi bản ghi audit khi đã ghi là không thể sửa/xóa — append-only
2. **Đa thuê nhà (Multi-tenant):** tenantId bọc chặt mọi bản ghi, IDOR-proof
3. **Không block luồng (Fire-and-forget):** Decorator/Interceptor ghi log bất đồng bộ
4. **Tra cứu mạnh (Rich Query):** Cursor pagination, filter dynamic, export
5. **Chi tiết đầy đủ:** actorEmail, ipAddress, userAgent, oldValue/newValue diff

---

## II. KIẾN TRÚC THƯ MỤC (FILE STRUCTURE)

### 2.1 Cấu trúc audit/ subdirectory (MỚI)

```
apps/api/src/audit/
├── audit.module.ts                  # UPDATE — move vào subdirectory
├── audit.controller.ts              # UPDATE — thêm endpoint audit-logs
├── audit.service.ts                 # NEW — service mới, enhanced
├── audit.interceptor.ts             # NEW — AuditEventInterceptor
├── audit.decorator.ts               # NEW — @AuditEvent() custom decorator
├── audit.constants.ts               # MOVE — từ src/audit.constants.ts vào đây
├── audit.types.ts                   # NEW — type definitions
├── audit.dto.ts                     # NEW — DTOs cho query/response
├── audit.guard.ts                   # NEW — Guard kiểm tra retention/chính sách
└── __tests__/
    ├── audit.service.spec.ts        # NEW
    ├── audit.interceptor.spec.ts    # NEW
    └── audit.controller.spec.ts     # NEW
```

### 2.2 File hiện tại cần sửa đổi

| File | Thao tác | Lý do |
|---|---|---|
| `apps/api/src/audit-events.service.ts` | Giữ nguyên (legacy bridge) | Module orchestration đang import |
| `apps/api/src/audit.controller.ts` | Giữ nguyên (legacy bridge) | Giữ backward compat |
| `apps/api/src/audit.module.ts` | Giữ nguyên (legacy bridge) | Re-export audit.service từ submodule |
| `apps/api/src/audit.constants.ts` | MOVE vào `audit/audit.constants.ts` | Chuẩn hóa |
| `apps/api/src/app.module.ts` | UPDATE import path | Trỏ vào `AuditModule` mới |
| `apps/api/prisma/schema.prisma` | UPDATE model `AuditEvent` | Thêm fields mới |

---

## III. MÔ HÌNH DỮ LIỆU (PRISMA SCHEMA)

### 3.1 Model AuditEvent — Enhanced

```prisma
// ───┬────────────────────────────────────────────────────────────────────
//     │ AuditEvent: Bản ghi kiểm toán bất biến, append-only, multi-tenant
//     │ Mỗi event ghi nhận một hành động của user/system lên resource
// ────┴────────────────────────────────────────────────────────────────────

model AuditEvent {
  id            String          @id @default(cuid())
  tenantId      String
  tenant        Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // ── Actor identity ─────────────────────────────────────────────────
  userId        String?
  user          User?           @relation(fields: [userId], references: [id], onDelete: SetNull)
  actorType     AuditActorType  // USER │ SYSTEM │ SERVICE
  actorEmail    String?         // NEW — snapshot email tại thời điểm ghi (dù user bị xóa sau này)

  // ── Action metadata ────────────────────────────────────────────────
  action        String          // "member.invite", "apiKey.create", "workflow.deploy", ...
  targetType    String?         // "Member", "ApiKey", "Workflow", "Tenant", ...
  targetId      String?         // ID cụ thể của resource bị tác động

  // ── Context (mới) ───────────────────────────────────────────────────
  ipAddress     String?         // NEW — client IP từ request
  userAgent     String?         // NEW — User-Agent header
  sessionId     String?         // NEW — session ID nếu có

  // ── Payload diff (mới) ──────────────────────────────────────────────
  oldValue      Json?           // NEW — dữ liệu trước khi thay đổi
  newValue      Json?           // NEW — dữ liệu sau khi thay đổi

  // ── Metadata mở rộng ────────────────────────────────────────────────
  metadata      Json?           // Existing — extra context (workspaceSlug, membershipRole, hostname...)
  severity      AuditSeverity?  // NEW — INFO │ WARN │ CRITICAL

  // ── Timestamps ─────────────────────────────────────────────────────
  createdAt     DateTime        @default(now())  // Immutable — không có updatedAt

  // ── Indices ────────────────────────────────────────────────────────
  @@index([tenantId, action])
  @@index([tenantId, createdAt])
  @@index([tenantId, userId])
  @@index([tenantId, actorEmail])
  @@index([tenantId, severity])
  @@index([tenantId, targetType, targetId])
  @@index([action])
  @@index([actorEmail])
  @@index([sessionId])
  @@index([createdAt])
}
```

### 3.2 Enum AuditSeverity (MỚI)

```prisma
enum AuditSeverity {
  INFO
  WARN
  CRITICAL
}
```

### 3.3 Lưu ý migration

- Thêm các field `actorEmail`, `ipAddress`, `userAgent`, `sessionId`, `oldValue`, `newValue`, `severity` vào model hiện tại — **tất cả đều optional** để không break dữ liệu cũ
- Thêm index composite `[tenantId, createdAt]` cho cursor pagination
- `AuditLog` model (line 602) giữ nguyên, không xóa — có thể clean up ở Phase 3

---

## IV. CORE LOGIC — 3 HÀM CHÍNH

### 4.1 `logActivity()` — Hạ tầng ghi vết bất biến

**File:** `apps/api/src/audit/audit.service.ts`
**Method:** `AuditService.logActivity()`

```
┌─────────────────────────────────────────────────────────────┐
│ logActivity(input: LogActivityInput): Promise<AuditEvent>  │
├─────────────────────────────────────────────────────────────┤
│ Input:                                                      │
│   tenantId:       string         (bắt buộc)                │
│   userId:         string         (bắt buộc)                │
│   actorEmail:     string         (bắt buộc)                │
│   actorType:      AuditActorType (mặc định: USER)          │
│   action:         string         (bắt buộc, chuẩn hóa)     │
│   resource:       string         (bắt buộc — targetType)   │
│   resourceId:     string?        (targetId)                │
│   ipAddress:      string?        (từ request)              │
│   userAgent:      string?        (từ request)              │
│   sessionId:      string?                                   │
│   oldValue:       Json?          (dữ liệu cũ)              │
│   newValue:       Json?          (dữ liệu mới)             │
│   metadata:       Json?          (extra context)           │
│   severity:       AuditSeverity? (mặc định: INFO)          │
├─────────────────────────────────────────────────────────────┤
│ Logic:                                                      │
│   1. Validate input (action không rỗng, tenantId tồn tại)   │
│   2. Chuẩn hóa action string → lowercase.dot.notation      │
│   3. Tạo bản ghi AuditEvent với Prisma.create()            │
│   4. Không throw exception khi ghi lỗi (fire-and-forget     │
│      safe mode — log lỗi ra console, không crash request)   │
│   5. Trả về event ID + createdAt                            │
├─────────────────────────────────────────────────────────────┤
│ Output: { id, tenantId, action, createdAt }                │
└─────────────────────────────────────────────────────────────┘
```

**Chi tiết action naming convention:**
```
<module>.<verb>    — "member.invite", "apiKey.create"
<module>.<verb>.<sub> — "workflow.execution.start", "payment.invoice.void"
```

**Tích hợp với Prisma transaction:**
```typescript
// Option A: Trong cùng transaction với business logic
await this.prisma.$transaction(async (tx) => {
  // business logic...
  await tx.auditEvent.create({ data: { ... } });
});

// Option B: Fire-and-forget (cho interceptor)
this.prisma.auditEvent.create({ data: { ... } })
  .catch((err) => this.logger.warn('Audit write failed', err));
```

### 4.2 `@AuditEvent()` Decorator + Interceptor — Bộ gài bẫy tự động

#### 4.2.1 Custom Decorator — `@AuditEvent()`

**File:** `apps/api/src/audit/audit.decorator.ts`

```typescript
/**
 * @AuditEvent() — Custom decorator gắn metadata cho AuditEventInterceptor
 *
 * Cách dùng:
 *   @AuditEvent({ action: 'member.invite', resource: 'Member' })
 *   @Post('invite')
 *   async inviteMember() { ... }
 *
 *   @AuditEvent({ action: 'workflow.deploy' })  // resource tự suy từ class name
 *   @Post('deploy')
 *   async deploy() { ... }
 *
 * Với oldValue/newValue từ body khớp pattern:
 *   @AuditEvent({ action: 'settings.update', oldKey: 'body.oldSettings', newKey: 'body.newSettings' })
 */
export const AuditEvent = (options: AuditEventOptions): MethodDecorator => {
  return (target, propertyKey, descriptor) => {
    Reflect.defineMetadata(AUDIT_EVENT_METADATA_KEY, options, descriptor.value);
    return descriptor;
  };
};
```

**Type definition:**
```typescript
export interface AuditEventOptions {
  action: string;                              // action name (vd: 'member.invite')
  resource?: string;                           // targetType (mặc định: class name)
  extractResourceId?: string;                  // path trong body/param để lấy targetId
  oldKey?: string;                             // path để extract oldValue (VD: 'body.previous')
  newKey?: string;                             // path để extract newValue (VD: 'body')
  severity?: AuditSeverity;                    // severity override
  skipPaths?: string[];                        // skip nếu body chứa field nhạy cảm
}
```

#### 4.2.2 Interceptor — `AuditEventInterceptor`

**File:** `apps/api/src/audit/audit.interceptor.ts`

```
┌──────────────────────────────────────────────────────────────┐
│ AuditEventInterceptor implements NestInterceptor             │
├──────────────────────────────────────────────────────────────┤
│ intercept(context, next): Observable<any>                    │
├──────────────────────────────────────────────────────────────┤
│ Logic:                                                       │
│   1. Đọc @AuditEvent() metadata từ handler                  │
│   2. Nếu không có metadata → next.handle() (bỏ qua)          │
│   3. Extract request context:                                 │
│      - tenantId từ x-tenant-slug header                     │
│      - userId + actorEmail từ JWT token + resolveAuthUserId  │
│      - ipAddress từ x-forwarded-for hoặc req.ip             │
│      - userAgent từ user-agent header                       │
│      - sessionId từ x-session-id header (nếu có)            │
│   4. Capture oldValue nếu oldKey được chỉ định               │
│   5. next.handle() → pipe(response):                         │
│      - KHI response thành công:                              │
│        a. Extract newValue nếu newKey được chỉ định          │
│        b. Gọi auditService.logActivity() (fire-and-forget)   │
│        c. Không await — không block response                 │
│        d. Nếu lỗi audit → console.warn, không throw          │
│      - KHI response lỗi:                                     │
│        a. Ghi audit với severity = WARN/CRITICAL             │
│        b. Không block error propagation                     │
└──────────────────────────────────────────────────────────────┘
```

**Flow chi tiết:**

```
Request → [Guard] → [AuditEventInterceptor]
                         │
                         ├─ metadata? → NO → next.handle() → Response
                         │
                         ├─ metadata? → YES
                         │     │
                         │     ├─ Capture oldValue (nếu oldKey)
                         │     │
                         │     └─ next.handle() → Observable
                         │           │
                         │           ├─ success → extract newValue
                         │           │           → auditService.logActivity()
                         │           │             (fire-and-forget, không await)
                         │           │           → trả response
                         │           │
                         │           └─ error  → auditService.logActivity()
                         │                       (severity: WARN/CRITICAL)
                         │                     → throw error gốc
                         │
                         └─ Response
```

**Nguyên tắc fire-and-forget:**

```typescript
// KHÔNG await — promise chạy nền
this.auditService.logActivity(input).catch((err) => {
  this.logger.warn({
    message: 'Audit interceptor: async write failed',
    error: err.message,
    action: input.action,
  });
});
```

### 4.3 API Tra cứu — Query Audit Trail (Cursor Pagination)

**Endpoint mới:** `GET /audit-logs`

#### 4.3.1 Request DTO

```
GET /audit-logs
  Headers:
    Authorization: Bearer <token>              (bắt buộc)
    x-tenant-slug: <slug>                      (bắt buộc)
    x-workspace-slug: <slug>                   (tùy chọn)

  Query parameters:
    cursor?: string                             (opaque cursor string)
    limit?: number                              (1-100, default 20)
    action?: string                             (filter: "member.invite")
    actionPrefix?: string                       (filter: "member.*")
    userId?: string                             (filter)
    actorEmail?: string                         (filter)
    resource?: string                           (filter: "Member")
    resourceId?: string                         (filter)
    severity?: AuditSeverity                    (filter)
    dateFrom?: ISO8601                          (filter: "2026-06-01T00:00:00Z")
    dateTo?: ISO8601                            (filter: "2026-06-18T23:59:59Z")
    includeMetadata?: boolean                   (default false — tiết kiệm payload)
    sort?: 'asc' | 'desc'                       (default 'desc')
```

#### 4.3.2 Response DTO

```json
{
  "data": [
    {
      "id": "cuid123",
      "action": "member.invite",
      "actorEmail": "admin@acme.com",
      "actorType": "USER",
      "targetType": "Member",
      "targetId": "cuid456",
      "ipAddress": "203.0.113.1",
      "userAgent": "Mozilla/5.0 ...",
      "severity": "INFO",
      "oldValue": null,
      "newValue": { "email": "newuser@acme.com", "role": "MEMBER" },
      "createdAt": "2026-06-18T06:30:00Z"
    }
  ],
  "pagination": {
    "nextCursor": "eyJpZCI6ImN1aWQxMjMiLCJjcmVhdGVkQXQiOiIyMDI2LTA2LTE4VDA2OjMwOjAwWiJ9",
    "hasMore": true,
    "totalEstimate": 1247
  },
  "meta": {
    "tenantId": "tenant-cuid",
    "workspaceSlug": "default",
    "filterApplied": {
      "actionPrefix": "member.*",
      "dateFrom": "2026-06-01T00:00:00Z"
    }
  }
}
```

#### 4.3.3 Cursor Pagination Logic

```typescript
// apps/api/src/audit/audit.service.ts

async query(input: QueryAuditLogInput): Promise<PaginatedAuditResult> {
  const { tenantId: resolvedTenantId } = await this.resolveTenant(input.tenantSlug);

  // ── Bảo mật: CHỈ query trong tenantId từ header ─────────────
  const where: Prisma.AuditEventWhereInput = {
    tenantId: resolvedTenantId,
  };

  // ── Dynamic filters ──────────────────────────────────────────
  if (input.action)          where.action = input.action;
  if (input.actionPrefix)    where.action = { startsWith: input.actionPrefix };
  if (input.userId)          where.userId = input.userId;
  if (input.actorEmail)      where.actorEmail = input.actorEmail;
  if (input.resource)        where.targetType = input.resource;
  if (input.resourceId)      where.targetId = input.resourceId;
  if (input.severity)        where.severity = input.severity;
  if (input.dateFrom || input.dateTo) {
    where.createdAt = {};
    if (input.dateFrom) where.createdAt.gte = new Date(input.dateFrom);
    if (input.dateTo)   where.createdAt.lte = new Date(input.dateTo);
  }

  // ── Cursor decode ────────────────────────────────────────────
  const cursor = input.cursor
    ? this.decodeCursor(input.cursor)
    : null;

  const take = Math.min(Math.max(input.limit ?? 20, 1), 100);

  const events = await this.prisma.auditEvent.findMany({
    where,
    orderBy: { createdAt: input.sort === 'asc' ? 'asc' : 'desc' },
    take: take + 1,  // fetch 1 extra để biết hasMore
    ...(cursor
      ? {
          cursor: { id: cursor.id },
          skip: 1,  // skip cursor record
        }
      : {}),
    select: input.includeMetadata
      ? undefined
      : {
          id: true, action: true, actorType: true, actorEmail: true,
          targetType: true, targetId: true, ipAddress: true, userAgent: true,
          severity: true, oldValue: true, newValue: true, createdAt: true,
          // exclude metadata khi không cần
        },
  });

  const hasMore = events.length > take;
  if (hasMore) events.pop();

  const nextCursor = hasMore
    ? this.encodeCursor(events[events.length - 1])
    : null;

  return {
    data: events,
    pagination: {
      nextCursor,
      hasMore,
      totalEstimate: await this.prisma.auditEvent.count({ where }),
    },
    meta: { tenantId: resolvedTenantId, filterApplied: { ... } },
  };
}
```

**Cursor encoding (opaque):**
```typescript
private encodeCursor(event: { id: string; createdAt: Date }): string {
  return Buffer.from(JSON.stringify({
    id: event.id,
    t: event.createdAt.toISOString(),
  })).toString('base64url');
}

private decodeCursor(cursor: string): { id: string } {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString());
}
```

#### 4.3.4 Bảo mật chống IDOR

```
┌──────────────────────────────────────────────────────┐
│ IDOR PROTECTION RULES                                │
├──────────────────────────────────────────────────────┤
│ 1. TENANT BẮT BUỘC:                                  │
│    Mọi query WHERE tenantId = resolvedTenantId        │
│    tenantId chỉ lấy từ x-tenant-slug header           │
│    KHÔNG cho phép tenantId trong query params         │
│                                                       │
│ 2. ROLE CHECK:                                        │
│    MEMBER → chỉ xem audit logs của chính mình         │
│    OPERATOR → xem tất cả trong tenant                 │
│    ADMIN/OWNER → xem tất cả + export                  │
│                                                       │
│ 3. VIEWER:                                            │
│    VIEWER role → không có quyền xem audit logs        │
│    Trả về 403 Forbidden                               │
│                                                       │
│ 4. WORKSPACE SCOPE:                                   │
│    Nếu có workspaceSlug trong header                  │
│    → chỉ query events trong workspace đó             │
│    (filter qua metadata['actorContext.workspaceSlug']) │
└──────────────────────────────────────────────────────┘
```

---

## V. CHI TIẾT CÁC FILE CẦN TẠO/CẬP NHẬT

### 5.1 File MỚI — `apps/api/src/audit/audit.service.ts`

```typescript
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actorContext: ActorContextService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly logger: Logger,
  ) {}

  // ── Core write (immutable, append-only) ────────────────
  async logActivity(input: LogActivityInput): Promise<LogActivityResult> { ... }

  // ── Query with cursor pagination ───────────────────────
  async query(input: QueryAuditLogInput): Promise<PaginatedAuditResult> { ... }

  // ── Get single event by ID (tenant-scoped) ──────────────
  async getById(input: { tenantSlug: string; eventId: string }): Promise<AuditEvent> { ... }

  // ── Export (CSV/JSON for admin) ─────────────────────────
  async export(input: ExportAuditInput): Promise<string> { ... }  // Phase 3

  // ── Retention policy ────────────────────────────────────
  async applyRetentionPolicy(tenantId: string, days: number): Promise<number> { ... }

  // ── Statistics ──────────────────────────────────────────
  async getStats(input: { tenantSlug: string; dateFrom?: Date }): Promise<AuditStats> { ... }
}
```

### 5.2 File MỚI — `apps/api/src/audit/audit.decorator.ts`

```typescript
export const AUDIT_EVENT_METADATA_KEY = 'audit:event';

export interface AuditEventOptions {
  action: string;
  resource?: string;
  extractResourceId?: string;
  oldKey?: string;
  newKey?: string;
  severity?: AuditSeverity;
  skipPaths?: string[];
}

export const AuditEvent = (options: AuditEventOptions): MethodDecorator => {
  return Reflect.metadata(AUDIT_EVENT_METADATA_KEY, options);
};
```

### 5.3 File MỚI — `apps/api/src/audit/audit.interceptor.ts`

```typescript
@Injectable()
export class AuditEventInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const options = this.reflector.get<AuditEventOptions>(
      AUDIT_EVENT_METADATA_KEY,
      context.getHandler(),
    );

    if (!options) return next.handle();

    const request = context.switchToHttp().getRequest();
    const auditContext = this.extractAuditContext(request, options);

    // Capture oldValue trước khi handler chạy
    if (options.oldKey) {
      auditContext.oldValue = this.resolveDeep(request, options.oldKey);
    }

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          // Sau response thành công: capture newValue, ghi audit
          if (options.newKey) {
            auditContext.newValue = this.resolveDeep(responseBody, options.newKey);
          }

          this.auditService.logActivity(auditContext).catch((err) => {
            this.logger.warn('Audit interceptor: async write failed', err.message);
          });
        },
        error: (error) => {
          // Khi response lỗi: ghi audit với severity cao hơn
          this.auditService.logActivity({
            ...auditContext,
            severity: AuditSeverity.WARN,
            metadata: { ...auditContext.metadata, error: error.message },
          }).catch((err) => {
            this.logger.warn('Audit interceptor: error write failed', err.message);
          });
        },
      }),
    );
  }
}
```

### 5.4 File MỚI — `apps/api/src/audit/audit.dto.ts`

```typescript
// Request DTOs
export class QueryAuditLogDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() actionPrefix?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() actorEmail?: string;
  @IsOptional() @IsString() resource?: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @IsEnum(AuditSeverity) severity?: AuditSeverity;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsBoolean() includeMetadata?: boolean;
  @IsOptional() @IsEnum(['asc', 'desc']) sort?: 'asc' | 'desc';
}

// Response DTOs
export class AuditLogEntryDto { ... }
export class PaginationMetaDto { ... }
export class PaginatedAuditResponseDto { ... }
export class AuditStatsDto { ... }
```

### 5.5 File MỚI — `apps/api/src/audit/audit.types.ts`

```typescript
export interface LogActivityInput {
  tenantId: string;
  userId: string;
  actorEmail: string;
  actorType?: AuditActorType;
  action: string;
  resource?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  severity?: AuditSeverity;
}

export interface LogActivityResult {
  id: string;
  tenantId: string;
  action: string;
  createdAt: Date;
}

export interface PaginatedAuditResult {
  data: AuditLogEntryDto[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    totalEstimate: number;
  };
  meta: {
    tenantId: string;
    workspaceSlug?: string;
    filterApplied: Record<string, unknown>;
  };
}

export interface AuditStats {
  total: number;
  byAction: Record<string, number>;
  bySeverity: Record<string, number>;
  byActor: Record<string, number>;
  timeRange: { from: Date; to: Date };
}
```

### 5.6 File CẬP NHẬT — `apps/api/src/audit/audit.controller.ts` (MỚI trong subdirectory)

Endpoint cũ giữ nguyên (backward compat), THÊM endpoint mới:

```typescript
@Controller()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // ── Legacy (giữ nguyên) ────────────────────────────────
  @Post('audit/events')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({ ... })
  async write(@Body() body, @Headers() headers) { ... }

  @Get('audit/events')
  async listRecent(@Query() query, @Headers() headers) { ... }

  @Get('audit/events/:eventId')
  async byId(@Param('eventId') eventId, @Headers() headers) { ... }

  // ── MỚI: Query với cursor pagination ──────────────────
  @Get('audit-logs')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  async queryAuditLogs(
    @Query() query: QueryAuditLogDto,
    @Headers('x-tenant-slug') tenantSlug: string,
    @Headers('x-workspace-slug') workspaceSlug?: string,
  ) {
    return this.auditService.query({
      ...query,
      tenantSlug,
      workspaceSlug,
    });
  }

  // ── MỚI: Stats dashboard ──────────────────────────────
  @Get('audit-logs/stats')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.ADMIN,
    scope: 'tenant-admin',
  })
  async getStats(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Query('dateFrom') dateFrom?: string,
  ) {
    return this.auditService.getStats({ tenantSlug, dateFrom: dateFrom ? new Date(dateFrom) : undefined });
  }

  // ── MỚI: Export ────────────────────────────────────────
  @Get('audit-logs/export')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.ADMIN,
    scope: 'tenant-admin',
  })
  async export(@Query() query, @Headers() headers) {
    // Trả về CSV/JSON download
  }
}
```

### 5.7 File CẬP NHẬT — `apps/api/src/audit/audit.module.ts`

```typescript
@Module({
  imports: [TenancyModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditEventsService,       // legacy bridge
    AuditEventInterceptor,    // global-scoped interceptor
  ],
  exports: [AuditService, AuditEventsService],
})
export class AuditModule {}
```

### 5.8 File CẬP NHẬT — `apps/api/prisma/schema.prisma`

Thêm fields vào model `AuditEvent`:

```diff
model AuditEvent {
   id            String          @id @default(cuid())
   tenantId      String
   tenant        Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
   userId        String?
   user          User?           @relation(fields: [userId], references: [id], onDelete: SetNull)
   actorType     AuditActorType
+  actorEmail    String?
   action        String
   targetType    String?
   targetId      String?
+  ipAddress     String?
+  userAgent     String?
+  sessionId     String?
+  oldValue      Json?
+  newValue      Json?
+  severity      AuditSeverity?
   metadata      Json?
   createdAt     DateTime        @default(now())

   @@index([tenantId, action])
   @@index([userId])
+  @@index([tenantId, createdAt])
+  @@index([tenantId, actorEmail])
+  @@index([tenantId, severity])
+  @@index([tenantId, targetType, targetId])
+  @@index([sessionId])
   @@index([createdAt])
}

+enum AuditSeverity {
+  INFO
+  WARN
+  CRITICAL
+}
```

---

## VI. LUỒNG XỬ LÝ ĐẦY ĐỦ (END-TO-END FLOW)

### 6.1 Flow 1: Controller gọi thủ công

```
User Action
    │
    ├─ Controller handler
    │     ├─ Resolve context (auth header → tenantId, userId, email)
    │     ├─ Thực hiện business logic (update DB)
    │     ├─ Gọi auditService.logActivity()  ← await hoặc fire-and-forget
    │     └─ Trả response
    │
    └─ AuditService.logActivity()
          ├─ Validate input
          ├─ Prisma.auditEvent.create()
          ├─ Ghi log nếu lỗi (không crash)
          └─ Trả event ID
```

### 6.2 Flow 2: Decorator + Interceptor (tự động)

```
User Request → POST /workspaces/:id/settings
    │
    ├─ AccessPolicyGuard (check role, tenant resolution)
    │
    ├─ AuditEventInterceptor
    │     ├─ Đọc @AuditEvent({ action: 'settings.update', ... })
    │     ├─ Extract request context
    │     ├─ Capture oldValue (nếu có)
    │     │
    │     └─ next.handle() → Controller Handler
    │           │
    │           ├─ Success → tap() gọi logActivity() fire-and-forget
    │           │              → Trả response (không chờ audit ghi xong)
    │           │
    │           └─ Error → tap({ error }) gọi logActivity() với severity WARN
    │                        → throw error gốc
    │
    └─ Response gửi về client
```

### 6.3 Flow 3: Tra cứu audit trail

```
User Request → GET /audit-logs?actionPrefix=member.&cursor=xxx
    │
    ├─ AccessPolicyGuard (check role >= OPERATOR)
    │
    ├─ AuditController.queryAuditLogs()
    │     └─ AuditService.query()
    │           ├─ Lấy tenantId từ x-tenant-slug (IDOR protection)
    │           ├─ Build where clause với dynamic filters
    │           ├─ Decode cursor → Prisma cursor pagination
    │           ├─ Fetch take+1 records
    │           ├─ Encode nextCursor nếu hasMore
    │           └─ Trả về PaginatedAuditResult
    │
    └─ Response với data + pagination meta
```

---

## VII. RÀNG BUỘC & AN TOÀN

### 7.1 Bất biến (Immutability)

- `AuditEvent` là **append-only**: không có `update`, không có `delete`
- Không có `updatedAt` field — chỉ có `createdAt`
- Không expose API xóa/sửa audit events (kể cả admin)
- Retention policy: xóa vật lý sau N ngày (cron job riêng)

### 7.2 Multi-tenant Isolation (IDOR)

- Mọi query phải bao gồm `tenantId` từ auth context
- KHÔNG cho phép client tự truyền `tenantId` trong body/query
- `findFirst` thay vì `findUnique` (thêm lớp kiểm tra tenantId)
- Composite index `[tenantId, createdAt]` là bắt buộc

### 7.3 Fire-and-forget Safety

- Audit interceptor KHÔNG bao giờ block response
- Lỗi audit write chỉ log warning, không throw exception
- Timeout cho mỗi audit write: 5 giây (prisma query timeout)
- Nếu database down, audit events bị mất — cần queue mechanism cho production (Phase 3)

### 7.4 Rate Limiting

- `GET /audit-logs` bị giới hạn theo tenant: 100 req/min
- Export: 10 req/min (admin only)
- Write (POST /audit/events): 1000 req/min

---

## VIII. VÍ DỤ SỬ DỤNG CỤ THỂ

### 8.1 Ghi audit thủ công trong service

```typescript
// Trong MemberService
async inviteMember(tenantId: string, invitedByUserId: string, input: InviteInput) {
  const member = await this.prisma.member.create({ data: { ... } });

  // Ghi audit — await để đảm bảo ghi thành công trong transaction
  await this.auditService.logActivity({
    tenantId,
    userId: invitedByUserId,
    actorEmail: invitedByEmail,
    action: 'member.invite',
    resource: 'Member',
    resourceId: member.id,
    newValue: { email: input.email, role: input.role },
    severity: AuditSeverity.INFO,
  });

  return member;
}
```

### 8.2 Ghi audit tự động qua Decorator

```typescript
@Controller('api-keys')
export class ApiKeyController {
  @Post()
  @AuditEvent({
    action: 'apiKey.create',
    resource: 'ApiKey',
    newKey: 'body',
    severity: AuditSeverity.INFO,
  })
  async createApiKey(@Body() body: CreateApiKeyDto) {
    // Business logic — interceptor tự động ghi audit
    return this.apiKeyService.create(body);
  }

  @Delete(':id')
  @AuditEvent({
    action: 'apiKey.revoke',
    resource: 'ApiKey',
    extractResourceId: 'params.id',
    severity: AuditSeverity.WARN,
  })
  async revokeApiKey(@Param('id') id: string) {
    return this.apiKeyService.revoke(id);
  }
}
```

### 8.3 Tra cứu audit trail

```bash
# Liệt kê 20 event gần nhất (page 1)
curl -H "Authorization: Bearer <token>" \
     -H "x-tenant-slug: acme" \
     "http://localhost:3002/audit-logs"

# Lọc theo action prefix + date range (page 2)
curl -H "Authorization: Bearer <token>" \
     -H "x-tenant-slug: acme" \
     "http://localhost:3002/audit-logs?actionPrefix=apiKey.&dateFrom=2026-06-01T00:00:00Z&dateTo=2026-06-18T23:59:59Z&limit=50"

# Cursor-based pagination (page N)
curl -H "Authorization: Bearer <token>" \
     -H "x-tenant-slug: acme" \
     "http://localhost:3002/audit-logs?cursor=eyJpZCI6ImN1aWQxMjMiLCJ0IjoiMjAyNi0wNi0xOFQwNjozMDowMFoifQ"

# Thống kê
curl -H "Authorization: Bearer <token>" \
     -H "x-tenant-slug: acme" \
     "http://localhost:3002/audit-logs/stats?dateFrom=2026-06-01T00:00:00Z"
```

---

## IX. LỘ TRÌNH TRIỂN KHAI (IMPLEMENTATION ORDER)

| Bước | File | Mô tả | Phụ thuộc |
|---|---|---|---|
| 1 | `schema.prisma` | Thêm fields + enum vào AuditEvent model | None |
| 2 | `audit/audit.types.ts` | Type definitions mới | Step 1 |
| 3 | `audit/audit.dto.ts` | DTOs cho query/response | Step 2 |
| 4 | `audit/audit.decorator.ts` | @AuditEvent() decorator | None |
| 5 | `audit/audit.service.ts` | AuditService với logActivity() + query() + getById() + getStats() | Steps 1-3 |
| 6 | `audit/audit.interceptor.ts` | AuditEventInterceptor | Steps 4-5 |
| 7 | `audit/audit.constants.ts` | Move từ src/audit.constants.ts | None |
| 8 | `audit/audit.module.ts` | Module mới trong subdirectory | Steps 1-7 |
| 9 | `audit/audit.controller.ts` | Controller mới trong subdirectory + endpoint audit-logs | Steps 5, 8 |
| 10 | `app.module.ts` | Cập nhật import path | Step 8 |
| 11 | Test files | Unit tests cho service, interceptor, controller | Steps 1-10 |

---

## X. KẾT LUẬN

### Tóm tắt

| Khía cạnh | Hiện tại | Sau thiết kế |
|---|---|---|
| File cấu trúc | Flat (5 files ở src/) | Modular (8+ files trong src/audit/) |
| Model fields | 9 fields, thiếu context | 16 fields, đầy đủ actor + network + diff |
| Ghi log | Thủ công mỗi controller | Decorator + Interceptor tự động |
| Tra cứu | Offset pagination, filter basic | Cursor pagination, dynamic filters |
| Bảo mật | Tenant scope qua header | IDOR-proof + role-based access |
| Production readiness | Development-grade | Cursor scale, rate limit, retention |

### Tác động đến hệ thống hiện tại

- **Zero breaking change**: Tất cả field mới đều optional
- **Legacy bridge**: `AuditEventsService` và controller cũ vẫn hoạt động
- **DB migration**: Non-destructive, chỉ thêm column mới
- **Module import**: AppModule chỉ cần update path

---

> **End of design document. Trạng thái: IDLE.**
> **Lệnh tiếp theo để implement:** `AIFUT GO` (khi sẵn sàng)

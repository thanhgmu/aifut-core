# AIFUT — GAP ANALYSIS vs 3 GIAI ĐOẠN CHIẾN LƯỢC
> Cập nhật: 2026-06-14 | So sánh trạng thái kỹ thuật hiện tại vs yêu cầu chiến lược

---

## I. TRẠNG THÁI HIỆN TẠI (Baseline)

### ✅ Đã có — Nền tảng thực sự
| Module | Trạng thái | Ghi chú |
|---|---|---|
| Multi-tenancy kernel | ✅ Có | Tenant isolation, domain resolution, storage policy |
| Auth / Access policy | ⚠️ Partial | Guard/JWT có, nhưng login + workspace endpoint trả 404 |
| AI integration drafting | ✅ Có | NL intent → preview blueprint (preview-only, chưa execute) |
| AI governance | ✅ Có | Routing policy, budget policy, usage event |
| Orchestration runtime | ✅ Có | Snapshot, event, auth-context |
| Audit log | ✅ Có | AuditEvent, AuditLog model |
| Tenant domain + storage policy | ✅ Có | Domain binding, hostname enforcement |
| Entitlements | ⚠️ Partial | Model + controller có, chưa business logic đầy đủ |
| Connector/Integration | ⚠️ Partial | IntegrationConnection model, AI draft, diagnostics — chưa execute |
| Web dashboard | ⚠️ Partial | Backup Center UI, integration preview UI — chưa production-grade |

### ❌ Chưa có — Thiếu theo Prisma schema
Toàn bộ schema hiện tại:
`Tenant, Workspace, User, Membership, Session, IntegrationConnection, Entitlement, AuditEvent, TenantDomain, TenantStoragePolicy, TenantPackageAssignment, OrchestrationRuntimeSnapshot, OrchestrationRuntimeEvent, AiRoutingPolicy, AiBudgetPolicy, AiUsageEvent, AuditLog`

**Không có trong schema — thiếu hoàn toàn:**
- `Workflow` / `WorkflowTemplate` / `WorkflowNode`
- `WorkflowExecution` / `WorkflowRun` / `WorkflowStep`
- `ConnectorDefinition` / `ConnectorListing` (Marketplace)
- `BackupSchedule` / `BackupJob` / `BackupTarget` (chỉ có preview logic)
- `BillingAccount` / `Subscription` / `Invoice` / `UsageRecord`
- `ResellerAccount` / `ResellerTenant` / `Commission`
- `AffiliateLink` / `AffiliateConversion`
- `NotificationChannel` / `NotificationTemplate` / `NotificationLog`
- `WorkflowMarketplaceListing` / `WorkflowDownload`
- `TenantOnboardingSession` / `WizardProgress`

---

## II. GAP ANALYSIS — GIAI ĐOẠN 1: `BECOME INDISPENSABLE`

### 🎯 Mục tiêu: Data lock-in + Network effects + NL→Deploy

| Yêu cầu chiến lược | Trạng thái | Gap cụ thể |
|---|---|---|
| **Auth end-to-end hoạt động** | ❌ Blocker | login + /workspaces trả 404; duplicate auth ownership chưa resolve |
| **Tenant isolation hoàn chỉnh** | ⚠️ 60% | Storage topology logic có, nhưng backup execution còn preview-only |
| **Membership / Roles** | ⚠️ 40% | Model có, business logic chưa đầy đủ |
| **NL → Deploy production workflow** | ❌ 20% | NL drafting có (preview), nhưng không có workflow execution engine |
| **Workflow execution engine** | ❌ 0% | Không có WorkflowExecution schema hay runtime |
| **Connector execution thực sự** | ❌ 0% | Mọi connector đang ở preview-only |
| **Notification channels (Zalo, email, SMS)** | ❌ 0% | Không có NotificationChannel, không có template engine |
| **Backup execution thực sự** | ❌ 0% | Tất cả backup logic là preview/checklist, chưa có BackupJob thực |
| **Connector Marketplace** | ❌ 0% | Không có gì |
| **Workflow Template Library** | ❌ 0% | Không có gì |
| **Reseller Portal** | ❌ 0% | Không có gì |
| **Affiliate/Commission system** | ❌ 0% | Không có gì |
| **Billing/Subscription** | ❌ 0% | Không có gì |
| **Tenant onboarding wizard** | ❌ 0% | Không có gì |

### 🔴 Critical Path cho Giai đoạn 1 (thứ tự ưu tiên):

```
[1] Fix auth end-to-end (login, workspace, session)
    → Không có auth hoạt động = không có gì khác hoạt động được
    
[2] Workflow execution engine
    → Schema: WorkflowTemplate, WorkflowExecution, WorkflowStep
    → Runtime: execute nodes, handle triggers, retry logic
    → Đây là engine cho NL→Real System
    
[3] Connector execution (thực sự chạy, không chỉ preview)
    → REST connector executor
    → Webhook receiver
    → Event bus internal
    
[4] Notification system
    → NotificationChannel (email, Zalo, SMS, webhook)
    → Template engine (multilingual)
    → Delivery log
    
[5] Backup execution thực sự
    → BackupSchedule, BackupJob, BackupTarget schema
    → Scheduler integration
    → Restore execution
    
[6] Billing/Subscription foundation
    → BillingAccount, Subscription, Invoice
    → Usage metering hooks
    
[7] Marketplace v1 (Connector + Template)
    → ConnectorListing, WorkflowTemplate listing
    → Install/uninstall mechanism
    
[8] Reseller v1
    → ResellerAccount, Commission tracking
    → Sub-tenant management
```

---

## III. GAP ANALYSIS — GIAI ĐOẠN 2: `OWN THE STANDARD`

> Tiền đề: Giai đoạn 1 hoàn thành

| Yêu cầu chiến lược | Gap cụ thể |
|---|---|
| **AIFUT Integration Standard (AIS) spec** | Cần design + publish open spec; integration contract hiện tại là internal-only |
| **AIFUT AI Workflow Language (AWL)** | Cần thiết kế DSL schema, interpreter, AI translator |
| **Developer portal + SDK** | Không có; cần public API docs, SDK (Python/Node), sandbox env |
| **Connector certification program** | Không có; cần certification flow, badge system |
| **50+ industry workflow templates** | Cần template authoring system + community contribution model |
| **Multi-currency billing** | Không có; cần currency layer trên billing foundation |
| **Localization engine** | `globalization` module có placeholder; cần full i18n + AI prompt localization |
| **Jurisdiction compliance module** | Không có; cần tax/data-residency/consent framework |
| **Multi-country ops** | Không có; cần multi-region deployment config |

---

## IV. GAP ANALYSIS — GIAI ĐOẠN 3: `CONTROL THE INTELLIGENCE LAYER`

> Tiền đề: Giai đoạn 2 hoàn thành

| Yêu cầu chiến lược | Gap cụ thể |
|---|---|
| **Cross-tenant analytics engine** | Không có; cần anonymization pipeline + aggregation layer |
| **Tenant benchmark dashboard** | Không có; cần cohort analysis + percentile engine |
| **Per-tenant AI operator agent** | Không có; cần persistent agent runtime, proactive trigger system |
| **Anomaly detection** | Không có; cần KPI monitoring + ML anomaly pipeline |
| **Predictive recommendation** | Không có; cần ML model serving layer |
| **Ecosystem economy (developer revenue share)** | Không có; cần marketplace economy + payment split |
| **Consultant/expert directory** | Không có |
| **Data marketplace** | Không có; cần consent management + data product packaging |
| **On-premise / air-gapped deployment** | Không có; cần deployment packaging + license management |
| **Government/compliance tier** | Không có; cần full audit trail + regulatory reporting |

---

## V. ROADMAP KỸ THUẬT TỔNG HỢP

```
2026 Q2–Q3 (Ngay bây giờ) — FOUNDATION COMPLETION
├── Fix auth (login, workspace, roles)           [BLOCKER - ưu tiên #1]
├── Workflow execution engine                    [CORE ENGINE]
├── Connector execution runtime                  [CORE ENGINE]  
├── Notification system                          [INDISPENSABLE]
└── Backup execution thực sự                     [DATA LOCK-IN]

2026 Q3–Q4 — PHASE 1 COMPLETION
├── Billing/Subscription foundation              [REVENUE]
├── Marketplace v1 (connector + template)        [NETWORK EFFECTS]
├── Reseller v1                                  [DISTRIBUTION]
├── NL → Deploy production (full flow)           [KILLER FEATURE]
└── Tenant onboarding wizard                     [USABILITY]

2027 Q1–Q2 — PHASE 2 FOUNDATION  
├── AWL (AIFUT Workflow Language) design         [STANDARD]
├── AIS open spec publish                        [STANDARD]
├── Developer portal + SDK                       [ECOSYSTEM]
├── Multi-currency + localization                [MULTI-COUNTRY]
└── 20+ industry templates                       [NETWORK EFFECTS]

2027 Q3–2028 — PHASE 2 COMPLETION
├── Connector certification program              [STANDARD]
├── 50+ templates + community model             [NETWORK EFFECTS]
├── Jurisdiction compliance module               [SOVEREIGNTY]
└── Multi-country ops                            [SCALE]

2028+ — PHASE 3
├── Cross-tenant analytics                       [INTELLIGENCE]
├── AI operator agents                           [INTELLIGENCE]
├── Ecosystem economy                            [PLATFORM]
└── On-premise / sovereign tier                  [SOVEREIGNTY]
```

---

## VI. ĐÁNH GIÁ TỔNG QUAN

| Chiều | Điểm hiện tại | Cần đạt (Phase 1) | Khoảng cách |
|---|---|---|---|
| Auth & Security | 40% | 90% | 🔴 Lớn |
| Workflow Engine | 5% | 80% | 🔴 Rất lớn |
| Connector Execution | 10% | 75% | 🔴 Rất lớn |
| Notification | 0% | 70% | 🔴 Rất lớn |
| Multi-tenancy Isolation | 65% | 90% | 🟡 Trung bình |
| Marketplace / Network Effects | 0% | 40% | 🔴 Lớn |
| Reseller / Distribution | 0% | 30% | 🔴 Lớn |
| Billing / Revenue | 0% | 50% | 🔴 Lớn |
| NL Usability | 30% | 70% | 🟡 Trung bình |
| AI Governance | 60% | 70% | 🟢 Nhỏ |

**Ước tính tổng thể Phase 1:** ~15-20% hoàn thành
**Ước tính foundation kernel:** ~55-60% (theo MEMORY.md)

> ⚠️ Giải thích sự chênh lệch: kernel/foundation (multi-tenancy, auth scaffold, AI drafting, orchestration, governance) đạt 55-60%, nhưng **business execution layer** (workflow chạy được, connector chạy được, notification, billing, marketplace) gần như 0% — đây là phần tạo ra tính "indispensable" thực sự.

---

## VII. NEXT IMMEDIATE ACTION

**Ưu tiên tuyệt đối:** Fix auth end-to-end trước mọi thứ khác.
Lý do: Không có auth hoạt động → không có session → không có tenant context → không có gì khác chạy được trong production.

**Sau auth:** Workflow execution engine — đây là backbone cho mọi thứ trong Phase 1.

---
*File này được Minh tự đọc khi cần gap analysis vs chiến lược. Cập nhật khi milestone lớn hoàn thành.*

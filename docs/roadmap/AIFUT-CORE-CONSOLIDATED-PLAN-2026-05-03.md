# AIFUT-core consolidated plan — 2026-05-03

## Strategic lock

AIFUT-core is the main product and the only kernel/control-plane/commercial truth. It is a SaaS/operator stack for one-person or ultra-lean businesses, designed so a business can coordinate apps, data, workflows, AI, commerce, community, and operations from one control layer.

Connected products such as NexovaFlow/Perfex, MagicAI, Affiliate Management System, n8n, OpenClaw, UltimatePOS, CRM/ecommerce/LMS tools, hosting/domain providers, AI providers, and user-owned apps are adapters/capability providers only.

## Product thesis

AIFUT-core should become necessary not by lock-in, but because it becomes the user's daily operating layer:

- one control room for apps, workflows, AI, CRM, marketplace, analytics, and community
- topology freedom: shared AIFUT resources, provider/affiliate-hosted resources, or user's own local/VPS resources
- natural-language/voice command to build parent workflows and specialist agent teams
- safe automation with approval/autonomy levels
- cost-aware AI/token routing
- marketplace and affiliate monetization
- behavior memory/personalization with explicit consent
- free/near-free participation path to reduce adoption friction

## Current completion snapshot

| Area | Current % | Basic-operation target | Status |
|---|---:|---:|---|
| Phase 0 — Alignment/control | 40% | 80% | Repo is locked; deploy/runtime path and local↔VPS flow still need final lock. |
| Phase 1 — Platform kernel foundation | 80% | 90% | Tenant/context/auth/health/orchestration draft exist; shared contracts and final hardening remain. |
| Phase 2 — Control plane & tenant operations | 62% | 80% | Domain/storage/package/workspace write paths are strong; fuller tenant CRUD/settings/operator actions remain. |
| Phase 3 — Integration & workflow substrate | 45% | 70% | Connector registry and orchestration surfaces exist; event bus, execution records, mapping depth remain. |
| Phase 4 — Monetization/ecosystem | 18% | 50% | Package guardrails and free/near-free economic model are defined; real listing/approval/coupon/commission flows remain. |
| Phase 5 — Intelligence/operator leverage | 17% | 35% | Behavior-memory/localization/AI cost strategy are documented; implementation primitives remain. |
| Tenancy/domain/storage/package hardening | 74% | 88% | Best-developed subtrack; tests are dense and passing. |
| Orchestration execution-contract hardening | 65% | 82% | Draft/submission/guardrails exist; real stored execution and runner dispatch remain. |
| NexovaFlow/Perfex bridge | 20% | 55% | Boundary is clear; real CRM adapter/action contract still needs build. |
| MagicAI audit/sandbox | 8% | 40% | Direction only; requires purchased assets/audit/sandbox before real integration. |
| Marketplace/affiliate commercialization | 12% | 45% | AIFUT-owned truth decided; data model and flows remain. |
| Community/social retention loop | 12% | 35% | Strategy defined: profiles, templates, case studies, challenges, earning dashboard; product primitives not yet built. |
| Agent-team / natural-language agency builder | 20% | 45% | Pattern documented; needs agent capability model, runtime adapter, CRM actions, approval/cost gates. |
| AI model/token governance | 18% | 50% | Commercial and BYO token model documented; provider catalog, quota, metering, dashboard not yet implemented. |
| AI token cost optimization | 18% | 45% | Strategy documented: routing, BYO, local/open-source, cache, compaction, batching, limits; router/meter not yet built. |
| Free/near-free ecosystem model | 15% | 40% | Economic model documented; package flags, ads policy, consent, usage attribution remain. |
| Security/audit/access policy | 58% | 80% | Foundations exist; must continue as non-negotiable gate across all phases. |
| Web/operator/user console | 20% | 55% | API ahead of UI; minimal console must follow stable contracts. |

## Minimum system for basic operation

AIFUT-core can enter basic operation when these exist:

1. Tenant/workspace/user context
   - create/manage tenant and workspace
   - resolve actor/role/context reliably
   - package/entitlement gates active

2. Topology control
   - shared AIFUT storage/database mode
   - provider/affiliate-hosted dedicated mode
   - local/self-hosted/VPS mode
   - domain/subdomain/local route settings
   - backup/restore policy metadata

3. AI/token governance
   - AIFUT-managed AI quota per package
   - BYO AI key option per package
   - token usage meter and report
   - cost-aware model routing rule foundation
   - user/admin visibility of used/remaining tokens or credits

4. Connector foundation
   - at least one real attached app: NexovaFlow/Perfex bridge first
   - credential reference and health check
   - simple mapping profile

5. Orchestration MVP
   - natural-language intent becomes a parent workflow draft
   - child workflow/action contracts are generated
   - approval/autonomy level is enforced
   - execution records and reports exist

6. Minimal control UI
   - admin/operator panel for tenants, packages, topology, connectors, AI quota/token policy, health
   - user panel for connected apps, workflows, storage/domain choices, BYO keys, token usage

7. Commercial/free ecosystem MVP
   - free/near-free package using BYO infrastructure/API keys plus limited AIFUT credits
   - package/add-on/usage display
   - demo/trial expiry policy
   - marketplace listing skeleton
   - commission ledger skeleton
   - community/template entry point

8. Security baseline
   - access policy checks
   - audit trail
   - credential isolation
   - behavior consent controls
   - no destructive/high-risk action without approval policy

## Free / near-free operating model

AIFUT should let users participate almost free if they reduce AIFUT's cost and accept ecosystem monetization conditions:

- user stores database/backups on local/VPS/own cloud
- user uses own domain/local route
- user connects own AI/API keys or uses cheap/local models
- user connects owned apps/services instead of consuming AIFUT-hosted resources
- user opts in to behavior/personalization memory with clear controls
- user accepts tasteful ads/sponsored recommendations

AIFUT can still earn from:

- hosting/domain/VPS/API affiliate commissions
- marketplace commissions
- setup/support packages
- premium automation limits
- premium AI/token resale
- optional storage/backup fees
- ads/sponsored placements
- upgrades when user workflow volume grows

## AI/token commercial model

AIFUT needs two modes:

1. AIFUT-managed AI tokens
   - AIFUT buys/provider-routes AI usage and resells it through packages, add-ons, top-ups, and overage.
   - Operator CPanel configures model catalog, cost, markup, quota, package limits, model allowlist, and routing.

2. BYO AI/API keys
   - Tenant/user provides their own keys.
   - AIFUT still meters usage for visibility, abuse control, and workflow cost estimation.
   - AIFUT may charge no token fee, or only a platform/orchestration fee depending on package.

Cost reduction requirements:

- route simple tasks to cheap/local models
- reserve strong models for complex/high-risk tasks
- cache repeated outputs/templates/docs
- compact memory instead of resending long history
- batch small jobs
- show cost preview before expensive workflows
- enforce daily/monthly caps and downgrade/pause rules

## Agent team / Sales Division / CRM model

AIFUT should be able to create specialist agent teams by natural language.

Example:

> "Tạo Sales AI Team để tìm lead, chấm điểm, nhập NexovaFlow/Perfex CRM, nhắc follow-up, và báo cáo doanh thu hằng ngày."

AIFUT converts this into:

- parent workflow owned by AIFUT
- child agents: Sales Strategist, Lead Research, CRM Operator, Follow-up Coordinator, Reporting Analyst, Approval Guard
- CRM actions executed through NexovaFlow/Perfex bridge
- approval/autonomy levels per action
- token/cost limits per task
- CRM reports shown in NexovaFlow/Perfex and/or AIFUT dashboard

## Timeline estimate

Assuming focused one-operator execution from current repo state:

| Milestone | Minimum ETA | Safer ETA | What it means |
|---|---:|---:|---|
| Internal technical MVP | 4 weeks | 4-6 weeks | Kernel, topology, orchestration, tests, no polished commercial UX yet. |
| Basic operational MVP | 6 weeks | 6-8 weeks | Minimal UI + NexovaFlow/Perfex bridge + AI/token usage visibility + one working CRM workflow. |
| Revenue-capable MVP | 8 weeks | 8-10 weeks | Packages, BYO/AIFUT token modes, marketplace skeleton, MagicAI sandbox if assets available. |
| Marketplace/affiliate-capable MVP | 10 weeks | 10-12 weeks | Listing/approval/demo/commission ledger/payout skeleton. |
| Strong community/intelligence layer | 12 weeks | 12-16 weeks | Behavior memory, personalization, community loop, ads/sponsor logic, smarter recommendations. |

Fastest credible path to basic operation: about 4 weeks only if scope is tightly limited to kernel + one CRM bridge + minimal UI + manual-assisted commercial/community flows.

Recommended practical target: 6-8 weeks for a basic operational product that can be shown, tested, and used with early users.

## Sprint execution order

### Sprint 1 — Kernel closeout, 5-7 working days
- finish domain/storage/package hardening
- add shared contract package
- lock deploy/runtime path
- stabilize tenant/workspace/operator actions
- keep API tests green

### Sprint 2 — Orchestration execution MVP, 7-10 working days
- persist workflow execution records
- add event/action contract
- add approval dispatch semantics
- add runner adapter abstraction
- support parent workflow -> child workflow graph

### Sprint 3 — AI/token governance foundation, 5-8 working days
- add AI provider/model catalog
- add package quota fields
- add BYO credential mode
- add usage event meter
- add cost estimate and quota enforcement rules
- expose admin/user report contract

### Sprint 4 — Connector + NexovaFlow/Perfex bridge, 7-10 working days
- define CRM action contract
- implement lead/contact/task/note/report actions
- add credential/health/mapping UI scaffolds
- make Sales Division agent workflow write/read CRM through bridge

### Sprint 5 — Minimal console + package/topology UI, 7-10 working days
- operator dashboard
- tenant/user dashboard
- domain/storage/token/package configuration
- BYO AI/API key setup
- workflow health and action log views

### Sprint 6 — Commercial/community/free wedge, 7-10 working days
- free/near-free package flags
- template library
- basic marketplace listing/approval
- demo/trial expiry
- commission ledger skeleton
- public profile/community entry points
- behavior consent controls
- tasteful ad/sponsored placement policy skeleton

### Sprint 7 — MagicAI sandbox + AI packages, 5-8 working days after assets
- audit MagicAI
- deploy sandbox
- connect through adapter
- create 1-2 differentiated AI packages using AIFUT orchestration, not MagicAI alone

## Immediate next implementation move

Continue current repo work in this order:

1. finish orchestration runtime-binding and execution-contract persistence semantics
2. add execution/action records
3. add AI provider/model/token usage contracts
4. define NexovaFlow/Perfex CRM action contract
5. create Sales Division parent workflow example using CRM read/write/report actions
6. update status after each verified slice

## Verification at this checkpoint

Focused API verification is green:

`npm test -- --runInBand tenancy.controller.spec.ts tenancy-operations.service.spec.ts orchestration.controller.spec.ts orchestration.service.spec.ts`

Result: 4 test suites passed, 140 tests passed.

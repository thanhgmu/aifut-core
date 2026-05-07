# AIFUT Status

## Current direction
AIFUT is actively being built as a Model C SaaS/operator-stack platform kernel, not as a CRM or ecommerce monolith.

Current architectural emphasis:
- tenant and workspace context
- integration control plane
- domain and storage routing
- data sovereignty readiness
- operator-efficient observability
- future hosting-affiliate and token-governance boundaries

## Latest confirmed milestones
- working tree milestone: add execution runtime activation bridge
- `01aaa60` feat(api): add projected mutation contract
- `fef83f6` feat(api): add execution transition policies
- `9de75ae` feat(api): add projected execution outcomes
- `6a12d09` feat(api): add projected execution mutations
- `d0fd382` feat(api): add execution dispatch projections
- `7b08e42` feat(api): add execution transition hints
- `af55a70` feat(api): add execution run task state
- `81f81c2` feat(api): link execution actions to runners
- `8db5c1a` feat(api): add execution action planning
- `c3a988e` feat(api): add ai token governance foundation
- `174d4fa` feat(api): add execution contract draft
- `09355dc` feat(api): add workflow graph draft
- `b9fce41` feat(api): add optimization summary draft
- `0136782` feat(api): add dataflow draft
- `193b89d` feat(api): add app coordination draft
- `024f613` feat(api): add roadmap interpretation draft
- `9893015` feat(api): add orchestration draft service
- `bc1dfb0` feat(api): guard domain demotion and scope rebinding
- `e6c5b76` feat(tenancy): add guarded tenant operations surfaces
- `0b80bc1` docs(architecture): lock control-plane topology model

## Current API foundation surfaces
- health and root platform status
- tenancy summary, current context, host resolution, and guarded tenant operations for workspaces/domains/storage policies
- auth context foundation
- current actor and access boundary endpoints
- membership resolution foundation
- request-level access-policy guard foundation
- guarded integration, entitlement, and audit write paths
- policy scopes now distinguish tenant-admin, operator-control, and workspace-member actions
- service-layer access invariants now backstop guarded write paths
- connector registry and integration templates
- integration infrastructure profile
- connection instance persistence foundation
- credential reference blueprint/preview foundation
- guarded connection verification foundation
- domain routing foundation
- storage routing foundation
- package option commercialization and entitlement sync foundation
- AI token-governance service foundation for provider/model policy, package quota/BYO-key rules, usage estimation, markup/platform-fee separation, included-quota coverage before AIFUT-managed overage charging, BYO platform-fee separation, and hard monthly quota enforcement
- AI usage-estimation orchestration endpoint foundation so token/cost previews can resolve tenant/workspace context before package quota enforcement and model-routing work
- orchestration draft surfaces for roadmap interpretation, app coordination, dataflow, optimization summary, workflow graph, and execution contract, now including execution-action records/batches, concrete execution run records, approval task records, action/run/task topology derived from approval-gated versus ready runner states, execution transition hints/policies, dispatch projections, projected execution mutations/outcomes, projected mutation contracts for downstream write-path planning, a first execution-runtime activation bridge that materializes approval-dispatch and runner-dispatch integration records plus live mutation batches, initial runtime write paths for applying approval decisions and dispatching execution runs against that materialized state, a first persistence-oriented runtime snapshot/event-record boundary for carrying those flows toward stored execution history, and an initial best-effort Prisma-backed runtime history store for snapshots/events
- globalization, orchestration, audit, entitlements capability roadmaps

## Build status
- Prisma generate: passing
- API targeted verification: `npm test -- --runInBand ai-token-governance.service.spec.ts tenancy.controller.spec.ts tenancy-operations.service.spec.ts orchestration.controller.spec.ts orchestration.service.spec.ts` passing
- Focused AI/orchestration verification remains green after adding the tenant/workspace-aware AI usage-estimation endpoint: `npm test -- --runInBand ai-token-governance.service.spec.ts orchestration.controller.spec.ts orchestration.service.spec.ts` passing
- Expanded focused API verification remains green after correcting AI usage-estimation semantics so included AIFUT-managed quota is consumed before user overage charges are estimated and proportional overage is covered, and after tightening storage-mode normalization typing so build remains green: `npm test -- --runInBand ai-token-governance.service.spec.ts tenancy.controller.spec.ts tenancy-operations.service.spec.ts orchestration.controller.spec.ts orchestration.service.spec.ts` passing
- Additional focused tenancy verification remains green after the latest domain-governance slice: `npm test -- --runInBand tenancy.controller.spec.ts tenancy-operations.service.spec.ts` passing
- A further focused controller verification pass remains green after extending affiliate-domain body-fallback governance coverage plus header-precedence governance continuity when affiliate-domain override flags are supplied, after explicitly preserving body-supplied storage-policy and package-assignment payload fields while header tenant/user/workspace context still wins, after explicitly preserving falsy storage-policy payload fields such as `meteringEnabled: false` under the same header-precedence flow, after explicitly preserving falsy domain-governance flags (`allowPrimaryDemotion: false`, `allowScopeRebinding: false`) when header tenant/user/workspace context wins, and after mirroring that falsy-governance continuity coverage for affiliate-domain writes under header precedence: `npm test -- --runInBand tenancy.controller.spec.ts` passing
- Focused tenancy service verification remains green after extending non-primary affiliate-domain scope-rebinding coverage, explicit primary affiliate-domain demotion/rebinding coverage, explicit affiliate-domain promotion collision coverage so workspace-scoped affiliate primaries surface the same demotion/reassignment governance semantics when they displace an existing scope primary, package-assignment provisioning-state normalization/guard coverage so spaced or mixed-case `active` still enforces selected-option requirements before persistence, storage-policy mode normalization coverage so spaced or mixed-case storage modes still validate/persist consistently, explicit trimming coverage for optional storage-policy fields before persistence, explicit trimming coverage for hybrid backup targets before persistence, explicit source-field normalization coverage for package assignments including whitespace-only -> `null`, and explicit billing-snapshot passthrough coverage so structured commercial metadata persists without unintended normalization: `npm test -- --runInBand tenancy-operations.service.spec.ts` passing
- A focused orchestration controller verification pass remains green after extending execution-contract header-precedence response continuity for both draft and submission, adding query-over-body context precedence for both submission and draft paths when headers are absent, and preserving body-supplied execution-contract structures even when draft/query context wins or when full body fallback is used: `npm test -- --runInBand orchestration.controller.spec.ts` passing
- Focused orchestration service verification remains green after tightening the guardrail that approval-required child workflows cannot rely on optional-only approval contracts, explicitly rejecting optional approval contracts at submission time until full optional-approval semantics exist, rejecting escalation contracts that loop back to the same required approval role on the same checkpoint, rejecting rollback contracts that do not map to at least one approval-required child workflow on the same checkpoint and target system, scoping rollback linkage to child workflows that match both checkpoint and target system, rejecting duplicate escalation/rollback routes that would otherwise create ambiguous execution paths, rejecting duplicate child-workflow routes on the same workflow/runtime/system path, and rejecting execution-contract submissions that do not declare at least one child workflow contract: `npm test -- --runInBand orchestration.service.spec.ts` passing
- Combined orchestration verification remains green after the latest execution-contract guardrail, execution-action planning, runner/action cross-linking, execution run / approval task state slices, execution projection slices, the runtime-activation bridge, the runtime write-path slice, and the new controller/API surfaces for those write paths, including query-over-body context precedence for both draft and submission paths, scoped rollback linkage, transition hints/policies, dispatch projections, projected mutation/outcome summaries, projected mutation contract coverage, service-level runtime materialization coverage, approval-decision application coverage, execution-run dispatch coverage, and controller-level approval/dispatch runtime endpoint coverage: `npm test -- --runInBand orchestration.controller.spec.ts orchestration.service.spec.ts` passing.
- API build: passing (`npm run build` in `apps/api`) after adding controller/API surfaces for runtime approval-decision and execution-dispatch flows.
- API build was rechecked after the AI token-governance and storage-mode typing updates; the TypeScript gate is passing again.
- Working tree: dirty beyond latest checked local HEAD `01aaa60`, currently carrying uncommitted orchestration runtime activation/write-path slices, the first persistence-oriented runtime snapshot/event-record boundary, a hand-written Prisma migration scaffold for runtime history tables, plus the matching status refresh.
- Behavior-memory and localized interaction architecture is now explicitly documented in `docs/architecture/behavior-memory-and-localized-interaction.md`, locking a three-layer memory model (live context, compacted summaries, raw/archive logs) plus voice/localization direction without yet claiming implementation completion.

## Current best next steps
1. Apply and verify the new Prisma migration scaffold for `OrchestrationRuntimeSnapshot` and `OrchestrationRuntimeEvent`, then confirm persisted runtime history end-to-end instead of relying on best-effort fallback.
2. Expand shared DTO/model boundaries around execution runs, approval tasks, action state transitions, dispatch outcomes, and projected mutation artifacts so controller/API surfaces can move cleanly onto persistence-backed records.
3. Wire the new AI token-governance foundation into package/admin/user surfaces after the current orchestration checkpoint.
4. Persist verification history and richer health state so integrations can be monitored over time instead of only checked ad hoc.
5. Expand tenant operations from admin-only surfaces into fuller provisioning flows, including default-owner/bootstrap handling where needed.
6. Keep NexovaFlow aligned as a tenant-app connector pattern, not a control-plane dependency.
7. Convert the new behavior-memory / localization architecture lock into concrete event, profile, and retention primitives after the current orchestration-hardening checkpoint.

## Notes
- Authoritative editable repo: `C:\Users\PC\.openclaw\workspace\aifut-core`
- Latest checked local HEAD remains `01aaa60` (`feat(api): add projected mutation contract`); the current runtime-activation bridge is still in the working tree and not yet committed.
- Current checkpoint note: after the execution projection chain (`7b08e42` -> `01aaa60`), the orchestration layer now also exposes `materializeExecutionRuntime(...)` plus `POST /orchestration/plans/:planId/execution-runtime/activate`, materializing approval-dispatch integrations, runner-dispatch integrations, and live mutation batches from submitted execution contracts. The working tree now extends that bridge with initial `applyApprovalDecision(...)` and `dispatchExecutionRun(...)` write paths plus matching controller/API surfaces for approval-decision and run-dispatch actions, now emits a first persistence-oriented runtime snapshot/event-record boundary, now includes a best-effort Prisma-backed `OrchestrationRuntimeHistoryService` plus schema models for runtime snapshots/events, and now also carries a first hand-written Prisma migration scaffold so stored execution history can start landing once migration/apply verification is completed.
- Older paths should not be treated as primary unless explicitly re-aligned.


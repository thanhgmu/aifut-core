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
- orchestration draft surfaces for roadmap interpretation, app coordination, dataflow, optimization summary, workflow graph, and execution contract, now including execution-action records/batches, concrete execution run records, approval task records, and action/run/task topology derived from approval-gated versus ready runner states
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
- Combined orchestration verification remains green after the latest execution-contract guardrail, execution-action planning, runner/action cross-linking, and execution run / approval task state slices, including query-over-body context precedence for both draft and submission paths, escalation no-op rejection for same-role approval loops, scoped rollback linkage, action records/batches for approval dispatch versus ready child-workflow dispatch, runner/action topology cross-links, execution run topology, approval task queue, and run/task readiness summary counts: `npm test -- --runInBand orchestration.controller.spec.ts orchestration.service.spec.ts` passing with 2 suites / 62 tests.
- API build: passing (`npm run build` in `apps/api`) after the execution run / approval task state slice.
- API build was rechecked after the AI token-governance and storage-mode typing updates; the TypeScript gate is passing again.
- Working tree: clean at latest checked local HEAD `af55a70` after execution run / approval task state checkpoint.
- Behavior-memory and localized interaction architecture is now explicitly documented in `docs/architecture/behavior-memory-and-localized-interaction.md`, locking a three-layer memory model (live context, compacted summaries, raw/archive logs) plus voice/localization direction without yet claiming implementation completion.

## Current best next steps
1. Carry execution-contract semantics from concrete run/task scaffolds into live approval-dispatch and execution-runner integrations.
2. Add persistence-oriented DTO/model boundaries for execution runs, approval tasks, action state transitions, and dispatch outcomes.
3. Wire the new AI token-governance foundation into package/admin/user surfaces after the current orchestration checkpoint.
4. Persist verification history and richer health state so integrations can be monitored over time instead of only checked ad hoc.
5. Expand tenant operations from admin-only surfaces into fuller provisioning flows, including default-owner/bootstrap handling where needed.
6. Keep NexovaFlow aligned as a tenant-app connector pattern, not a control-plane dependency.
7. Convert the new behavior-memory / localization architecture lock into concrete event, profile, and retention primitives after the current orchestration-hardening checkpoint.

## Notes
- Authoritative editable repo: `C:\Users\PC\.openclaw\workspace\aifut-core`
- Latest checked local HEAD: `af55a70` (`feat(api): add execution run task state`).
- Current checkpoint note: `8db5c1a` added orchestration execution-action records/batches derived from runner readiness so submitted contracts expose the next operational action (`dispatch-required-approval`, `dispatch-child-workflow`, or runtime-binding resolution). `81f81c2` added runner/action topology cross-links so API consumers can navigate from runners to next actions and from actions back to runners/contracts. `af55a70` then added concrete execution run records, approval task records, run/task batches, run/task topology, and readiness summary counts as the next bridge toward persisted approval-dispatch and runner execution.
- Older paths should not be treated as primary unless explicitly re-aligned.


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
- `3537bd7` feat(api): persist runtime snapshot recorded timestamps
- working tree milestone: persist orchestration runtime snapshot `recordedAt` and sort history by recorded time
- `c35e4da` merge origin/main into main
- `d23844c` feat(api): harden orchestration runtime persistence
- `c591bfb` feat(api): persist orchestration runtime history scaffold
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
- orchestration draft surfaces for roadmap interpretation, app coordination, dataflow, optimization summary, workflow graph, and execution contract, now including execution-action records/batches, concrete execution run records, approval task records, action/run/task topology derived from approval-gated versus ready runner states, execution transition hints/policies, dispatch projections, projected execution mutations/outcomes, projected mutation contracts for downstream write-path planning, a first execution-runtime activation bridge that materializes approval-dispatch and runner-dispatch integration records plus live mutation batches, initial runtime write paths for applying approval decisions and dispatching execution runs against that materialized state, a first persistence-oriented runtime snapshot/event-record boundary for carrying those flows toward stored execution history, an initial best-effort Prisma-backed runtime history store for snapshots/events, and a first persisted runtime-history read surface so execution runtime history can now be queried back through the orchestration API/service layer instead of existing only as write-side persistence
- globalization, orchestration, audit, entitlements capability roadmaps

## Build status
- Prisma generate: passing
- API targeted verification: `npm test -- --runInBand ai-token-governance.service.spec.ts tenancy.controller.spec.ts tenancy-operations.service.spec.ts orchestration.controller.spec.ts orchestration.service.spec.ts` passing
- Focused AI/orchestration verification remains green after adding the tenant/workspace-aware AI usage-estimation endpoint: `npm test -- --runInBand ai-token-governance.service.spec.ts orchestration.controller.spec.ts orchestration.service.spec.ts` passing
- Expanded focused API verification remains green after correcting AI usage-estimation semantics so included AIFUT-managed quota is consumed before user overage charges are estimated and proportional overage is covered, and after tightening storage-mode normalization typing so build remains green: `npm test -- --runInBand ai-token-governance.service.spec.ts tenancy.controller.spec.ts tenancy-operations.service.spec.ts orchestration.controller.spec.ts orchestration.service.spec.ts` passing
- Additional focused tenancy verification remains green after the latest domain-governance slice: `npm test -- --runInBand tenancy.controller.spec.ts tenancy-operations.service.spec.ts` passing
- A further focused controller verification pass remains green after extending affiliate-domain body-fallback governance coverage plus header-precedence governance continuity when affiliate-domain override flags are supplied, after explicitly preserving body-supplied storage-policy and package-assignment payload fields while header tenant/user/workspace context still wins, after explicitly preserving falsy storage-policy payload fields such as `meteringEnabled: false` under the same header-precedence flow, after explicitly preserving falsy domain-governance flags (`allowPrimaryDemotion: false`, `allowScopeRebinding: false`) when header tenant/user/workspace context wins, after mirroring that falsy-governance continuity coverage for affiliate-domain writes under header precedence, after explicitly preserving body-supplied workspace scope for custom-domain writes when tenant/user headers are present but no workspace header is supplied, after explicitly preserving custom-domain governance flags plus managed-domain provisioning fields when tenant/user/workspace headers override body context, after explicitly proving the same custom-domain path preserves both body workspace scope and governance flags together when tenant/user headers are present but no workspace header is supplied, and now after proving the same combined no-workspace-header behavior for affiliate-domain writes so scope precedence and governance flags stay aligned across both domain kinds: `npm test -- --runInBand tenancy.controller.spec.ts` passing
- Focused tenancy service verification remains green after extending non-primary affiliate-domain scope-rebinding coverage, explicit primary affiliate-domain demotion/rebinding coverage, explicit affiliate-domain promotion collision coverage so workspace-scoped affiliate primaries surface the same demotion/reassignment governance semantics when they displace an existing scope primary, explicit primary-domain scope-rebinding coverage so an existing tenant-scope primary can be rebound into workspace scope while remaining primary and correctly demoting the target-scope primary, package-assignment provisioning-state normalization/guard coverage so spaced or mixed-case `active` still enforces selected-option requirements before persistence, storage-policy mode normalization coverage so spaced or mixed-case storage modes still validate/persist consistently, explicit trimming coverage for optional storage-policy fields before persistence, explicit trimming coverage for hybrid backup targets before persistence, explicit source-field normalization coverage for package assignments including whitespace-only -> `null`, and explicit billing-snapshot passthrough coverage so structured commercial metadata persists without unintended normalization: `npm test -- --runInBand tenancy-operations.service.spec.ts` passing
- A focused orchestration controller verification pass remains green after extending execution-contract header-precedence response continuity for both draft and submission, adding query-over-body context precedence for both submission and draft paths when headers are absent, and preserving body-supplied execution-contract structures even when draft/query context wins or when full body fallback is used: `npm test -- --runInBand orchestration.controller.spec.ts` passing
- Focused orchestration service verification remains green after tightening the guardrail that approval-required child workflows cannot rely on optional-only approval contracts, explicitly rejecting optional approval contracts at submission time until full optional-approval semantics exist, rejecting escalation contracts that loop back to the same required approval role on the same checkpoint, rejecting rollback contracts that do not map to at least one approval-required child workflow on the same checkpoint and target system, scoping rollback linkage to child workflows that match both checkpoint and target system, rejecting duplicate escalation/rollback routes that would otherwise create ambiguous execution paths, rejecting duplicate child-workflow routes on the same workflow/runtime/system path, rejecting execution-contract submissions that do not declare at least one child workflow contract, explicitly allowing `dispatchExecutionRun(...)` to proceed when persisted approval history has already advanced the run to `queued-for-dispatch`, and now explicitly rejecting `applyApprovalDecision(...)` when persisted approval-task history already shows the task has left `awaiting-decision` so stale/double decision application cannot silently reapply: `npm test -- --runInBand orchestration.service.spec.ts` passing (now 48/48 with the persisted-history dispatch and approval-decision regression coverage covered).
- Combined orchestration verification remains green after the latest execution-contract guardrail, execution-action planning, runner/action cross-linking, execution run / approval task state slices, execution projection slices, the runtime-activation bridge, the runtime write-path slice, the new controller/API surfaces for those write paths, the persisted runtime-history read/query surface, the newer batched persisted-mutation lookup path for approval/dispatch progression, a follow-on snapshot-summary typing slice so persisted/runtime snapshots now expose explicit summary contracts by snapshot type instead of falling back to generic records, a newer persisted-history decision guard so stale approval-task state cannot be re-decided after history already advanced it, and now the follow-on persistence fix that stores runtime snapshot `recordedAt` explicitly and orders snapshot history by recorded time instead of relying only on row creation order: `npm test -- --runInBand orchestration.controller.spec.ts orchestration.service.spec.ts orchestration-runtime-history.service.spec.ts` passing (focused combined pass green again after the recorded-time persistence slice).
- API build: passing (`npm run build` in `apps/api`) after adding controller/API surfaces for runtime approval-decision and execution-dispatch flows, after tightening Prisma JSON typing in `OrchestrationRuntimeHistoryService`, after the persisted-runtime progression fix, after the persisted runtime-history read surface, after the batched persisted-mutation lookup slice plus the follow-on summary/query typing fixes, and again after merging `origin/main` so the runtime lane and incoming web/auth surface coexist cleanly.
- Prisma runtime-history migration verification is now real, not just scaffolded: `npm exec prisma migrate deploy -- --schema .\prisma\schema.prisma` reports no pending migrations, and `npm run runtime-history:check` confirms both `OrchestrationRuntimeSnapshot` and `OrchestrationRuntimeEvent` tables plus required columns exist in the local `aifut` database. The next migration slice now extends snapshot persistence with an explicit `recordedAt` column so snapshot ordering can follow runtime event time rather than only `createdAt`.
- Prisma 7 runtime adapter plumbing is now wired into both `PrismaService` and the runtime-history schema-check script via `@prisma/adapter-pg` + `pg`, closing the earlier constructor-level runtime failure for direct `PrismaClient` startup under engine type `client`.
- Live end-to-end runtime persistence is now proven against the local database: after seeding the smallest valid actor context (`tenant` `acme`, user `ops@acme.test`, workspace `ops`, `ADMIN` membership), `POST /orchestration/plans/:planId/execution-runtime/activate`, `POST /.../approval-decision`, and `POST /.../dispatch-run` were exercised successfully against the booted API, and local persistence inspection confirmed three stored snapshots (`materialized-runtime`, `approval-decision`, `run-dispatch`) plus matching runtime events for plan `plan:acme:ops:live-runtime`.
- The earlier dirty working-tree runtime lane is now safely committed in `d23844c` and merged with `origin/main` in `c35e4da`, preserving the Prisma runtime adapter enablement (`apps/api/src/prisma.service.ts`, root/app package manifests + lockfiles), runtime-history JSON-input typing fixes in `apps/api/src/orchestration-runtime-history.service.ts`, the runtime-history schema check script under `apps/api/scripts/`, the local runtime seed/exercise/inspection scripts under `apps/api/scripts/`, the Prisma migration folder + `migration_lock.toml`, additional `OrchestrationRuntimeHistoryService` negative-path verification, the persisted-history execution-dispatch regression coverage in `apps/api/src/orchestration.service.spec.ts`, extra degraded-domain governance/readiness coverage in both `tenancy-operations.service.spec.ts` and `tenancy.controller.spec.ts`, targeted tenant-scope primary-domain governance coverage, the shared runtime-DTO tightening passes across runtime models/service/history normalization, the typed-response and persisted-mutation lookup expansions, plus the incoming web/auth/homepage surface from `origin/main`. Local and remote are now synchronized cleanly after the merge/push recovery.
- Behavior-memory and localized interaction architecture is now explicitly documented in `docs/architecture/behavior-memory-and-localized-interaction.md`, locking a three-layer memory model (live context, compacted summaries, raw/archive logs) plus voice/localization direction without yet claiming implementation completion.

## Current best next steps
1. Continue the next lane now that the orchestration runtime-hardening checkpoint is foundation-locked: expand shared runtime DTO/model coverage from topology/queue/history into more explicit transition/state-hint/projection contracts so controller/API surfaces move further away from rematerialized-only ad-hoc shapes.
2. Push persistence-first progression deeper so later runtime actions and follow-on reads depend even less on the latest-snapshot bridge and more on persisted target-state truth.
3. Broaden failure/recovery/conflict/degraded-path verification from the now-completed checkpoint into the next orchestration lane so persisted runtime behavior stays reliable as the contract surface widens.
4. Wire the new AI token-governance foundation into package/admin/user surfaces after the current orchestration contract-expansion lane.
5. Persist verification history and richer health state so integrations can be monitored over time instead of only checked ad hoc.
6. Expand tenant operations from admin-only surfaces into fuller provisioning flows, including default-owner/bootstrap handling where needed.
7. Keep NexovaFlow aligned as a tenant-app connector pattern, not a control-plane dependency.
8. Convert the new behavior-memory / localization architecture lock into concrete event, profile, and retention primitives after the current orchestration contract-expansion lane.

## Notes
- Authoritative editable repo: `C:\Users\PC\.openclaw\workspace\aifut-core`
- Latest checked local HEAD: `3537bd7` (`feat(api): persist runtime snapshot recorded timestamps`).
- Git safety checkpoint: the large local runtime lane was protected with backup branch `backup/2026-05-21-pre-sync` and tag `safety-pre-sync-2026-05-21` before sync; local and `origin/main` are now aligned.
- Current checkpoint note: after the execution projection chain (`7b08e42` -> `01aaa60`), the orchestration layer now also exposes `materializeExecutionRuntime(...)` plus `POST /orchestration/plans/:planId/execution-runtime/activate`, materializing approval-dispatch integrations, runner-dispatch integrations, and live mutation batches from submitted execution contracts. That bridge is now extended with committed `applyApprovalDecision(...)` and `dispatchExecutionRun(...)` write paths plus matching controller/API surfaces for approval-decision and run-dispatch actions, a persistence-oriented runtime snapshot/event-record boundary, a Prisma-backed `OrchestrationRuntimeHistoryService`, schema models for runtime snapshots/events, a committed Prisma migration scaffold, a working runtime-history schema check entrypoint, verified local tables/columns for the runtime-history store, Prisma adapter plumbing for engine-type `client`, live local seed/exercise scripts, an explicit persisted-history progression fix so dispatch can honor the approval state already stored in runtime history, a `GET /orchestration/plans/:planId/execution-runtime/history` read surface that resolves tenant/workspace context before returning persisted snapshots/events, explicit typed-response coverage for materialized-runtime and persisted-history surfaces, per-target persisted-mutation lookup, batched persisted-mutation lookup for approval/dispatch progression, and focused test/build proof. This runtime-hardening checkpoint is now foundation-locked; the active next lane is deeper shared runtime DTO/contract expansion plus further persistence-first progression.
- Older paths should not be treated as primary unless explicitly re-aligned.


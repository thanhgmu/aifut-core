# AIFUT Status

## 2026-05-31 local production runtime entry checkpoint
- Commit `2e9146f` (`fix(api): align production runtime entry`) is pushed to GitHub.
- `npm run start:prod --workspace apps/api` now runs the actual Nest build entry `dist/src/main.js` instead of stale `dist/main`.
- Verification: API build, real `start:prod` boot, live `GET /` returning `200`, PostgreSQL runtime verifier `ok: true` with seeded counts `2/2/2/2`, and clean port `3002` teardown after proof.
- Next: continue HQ domain-routing visibility or the next narrow low-collision domain-governance slice.

## 2026-05-31 shared domain-readiness evaluator checkpoint
- Commit `c829525` (`refactor(api): centralize domain readiness evaluation`) is pushed to GitHub.
- New pure utility `evaluateTenantDomainReadiness(...)` is shared by hostname runtime reads and domain write responses, removing duplicated readiness semantics without changing schema, auth, or policy boundaries.
- Existing domain write guardrail messages remain stable, while write responses now expose the same bounded `reasons` as hostname resolution.
- Verification: targeted domain specs `119/119`, API build, full API Jest `25/25` suites and `330/330` tests, local runtime verifier `ok: true`, and live HTTP write/read parity proof returning `routeReady: false` with `certificate-status:pending`.
- The follow-up production entry drift was repaired in `2e9146f`.

## 2026-05-31 domain runtime-readiness diagnostics checkpoint
- Commit `9c86250` (`feat(api): align domain runtime readiness diagnostics`) is pushed to GitHub.
- Domain host resolution now evaluates runtime readiness against the current write contract and explains legacy drift through bounded reasons: missing DNS target, pending certificate, missing affiliate provisioning mode, or missing managed provider.
- Platform subdomains remain ready without tenant-managed DNS metadata, while an explicitly pending certificate correctly keeps them non-ready.
- The domain upsert response now uses the same certificate-readiness semantics as runtime host resolution.
- Verification: targeted domain specs `75/75`, API build, full API Jest `24/24` suites and `327/327` tests, local runtime verifier `ok: true`, and live HTTP proof returning `routeReady: false` with `certificate-status:pending`.

## 2026-05-31 domain workspace-routing visibility checkpoint
- Commit `26ca3ff` (`feat(api): clarify domain workspace routing visibility`) is pushed to GitHub.
- `TenantDomainResolutionService.resolveHostname(...)` now distinguishes a non-enforced workspace mismatch from a real fallback by reporting `workspace-request-mismatch`.
- Host-resolution governance now exposes requested, hostname-bound, and effective workspace slugs plus an explicit mismatch flag so HQ/runtime diagnostics can explain routing scope without changing routing behavior.
- Verification: targeted domain-resolution spec `5/5`, API build, full API Jest `24/24` suites and `324/324` tests, local runtime verifier `ok: true`, and live HTTP proof with a workspace-bound proof domain (`ops`) requested through mismatched workspace `sales`.

## 2026-05-31 domain lifecycle enum normalization checkpoint
- Commit `328b8d9` (`feat(api): normalize domain lifecycle enums`) is pushed to GitHub.
- `TenancyOperationsService.upsertDomain(...)` now normalizes and explicitly validates domain `kind` and `status` values before Prisma persistence.
- Mixed-case or whitespace-padded values are accepted when they map to valid enums; invalid values return bounded bad-request failures instead of low-level persistence errors.
- Verification: targeted tenancy operations service spec `67/67`, API build, full API Jest `24/24` suites and `324/324` tests, local runtime verifier `ok: true`, and live HTTP proof with padded lowercase values persisted as `PLATFORM_SUBDOMAIN` / `ACTIVE`.

## 2026-05-31 Web UI HQ bounded-read checkpoint
- Commit `35c86cf` (`feat(web): surface bounded HQ read failures`) is pushed to GitHub.
- `getJsonResult(...)` now preserves HTTP status or unreachable-API failures while the existing nullable `getJson(...)` wrapper remains compatible for current callers.
- The operator preview surfaces a bounded read-status panel only when a preview dependency is unavailable and distinguishes guarded `401/403` access denial from API connectivity failures.
- Verification: web typecheck and web production build pass. Focused ESLint is still blocked by the repo baseline because ESLint 9 cannot find an `eslint.config.*` file.

## 2026-05-31 local runtime exercise alignment
- Legacy runtime persistence and transition exercise scripts now use `NEXT_PUBLIC_API_URL` with the canonical `http://127.0.0.1:3002` fallback instead of hard-coding stale port `4000`.
- Both scripts now order persisted snapshots by runtime `recordedAt` and expose that timestamp in proof output.
- Verification: both scripts pass `node --check`, stale port/order patterns are absent from `apps/api/scripts`, and API build passes.
- Live execution was not run because the local API was intentionally offline during this heartbeat.

## 2026-05-31 one-command approved replay proof
- Commit `6ffbb83` (`feat(dev): add approved replay proof helper`) is pushed to GitHub.
- Run `npm run local:exercise-approved-replay --workspace apps/api` while local API is available.
- The helper creates a unique plan, applies approval-requiring AI routing, activates the runtime, approves its task, dispatches with AI-governance approval, and verifies persisted history plus diagnostics.
- Live execution returned `ok: true`, approval history `count: 1`, diagnostics `approvedResumedCount: 1`, and latest outcome `approved-resumed`.
- Regression gates remain green: full API Jest `321/321`, API build, runtime-history check, and runtime verifier.

## 2026-05-31 runtime progression checkpoint
- Commit `f16df5b` (`fix(api): preserve runtime progression during transitions`) is pushed to GitHub.
- Approval-decision and dispatch transition commands no longer persist a fresh materialized baseline before reading latest persisted mutation state.
- This prevents a cleared run from being moved backward to `awaiting-approval`.
- Real local proof succeeded: activate -> approve -> AI-governance approved dispatch -> audit persistence -> approval-history `count: 1` -> diagnostics latest outcome `approved-resumed` -> Web UI HQ production render `200` with persisted actor evidence.
- Verification: targeted orchestration/audit `87/87`, full API Jest `24/24` suites and `321/321` tests, API build, web typecheck/build, runtime-history check `ok: true`, runtime verifier `ok: true`.

## 2026-05-31 runtime read guard checkpoint
- Commit `5c21615` (`feat(api): guard orchestration runtime reads`) is pushed to GitHub.
- Execution runtime history, diagnostics, and approval-history reads now require the existing `operator-control` access policy with `OPERATOR` minimum role and workspace context.
- Metadata coverage verifies the three route contracts.
- Local PostgreSQL was brought up to committed migration truth with `20260521075800_add_runtime_snapshot_recorded_at` and `20260530184200_add_ai_governance_persistence`.
- Verification: targeted `33/33`, full API Jest `24/24` suites and `321/321` tests, API build, Prisma migration status clean, runtime-history check `ok: true`, runtime verifier `ok: true`, and all three guarded local read routes returning `200` for seeded operator context.

## 2026-05-31 Web UI HQ approval replay checkpoint
- Commit `76d83be` (`feat(web): surface ai approval replay diagnostics`) is pushed to GitHub.
- The operator preview now consumes live plan-scoped approval replay history plus recent AI dispatch outcomes (`held`, `approved-resumed`, `blocked`, `auto-dispatched`).
- The preview shows replay count, recent persisted resumes, actor/lane/reason/usage evidence when present, and explicit empty states when data is absent.
- Local sample context was aligned to seeded truth: `ops@acme.test` and `plan:acme:ops:live-runtime`.
- Verification: web typecheck, web production build, API build, full API Jest `24/24` suites and `320/320` tests, PostgreSQL-backed runtime verifier, live approval-history API `200`, live diagnostics API `200`, and local HQ route render `200`.
- Follow-up hardening: apply operator-control guards to HQ read routes and correct the snapshot `recordedAt` expectation in `runtime-history:check`.

## 2026-05-31 Wave 2 approval-history checkpoint
- `GET /orchestration/plans/:planId/execution-runtime/approval-history` now exposes compact plan-filtered AI-governance approval replay audit history.
- The query stays tenant/workspace-scoped, returns only `ai-governance.approval-dispatch-resumed` execution-run events, and accepts a bounded `limit`.
- Verification: targeted audit/controller tests `32/32`, full API Jest `24/24` suites and `320/320` tests, API build, and local runtime verifier all passing.

## 2026-05-31 Wave 2 approval audit checkpoint
- Approved AI-governance replay dispatches now persist a first-class `ai-governance.approval-dispatch-resumed` audit event after dispatch and usage-ledger recording succeed.
- The audit record stores tenant/workspace actor context plus plan/run, approval attribution, policy outcome, selected lane, credential mode, approval reason, and linked usage-event key.
- Verification is green: targeted orchestration controller tests `29/29`, API build, full API Jest `23/23` suites and `314/314` tests, and local runtime verification against `http://127.0.0.1:3002`.

## 2026-05-31 Wave 2 approval-resume checkpoint
- The current orchestration runtime working tree adds the first small replay path for AI-governance-held execution runs.
- `POST /orchestration/plans/:planId/execution-runtime/dispatch-run` now re-checks the live AI gateway decision on every attempt and only resumes an approval-required run when `aiGovernance.approval.decision = approve` is supplied.
- Resume attribution comes from the resolved actor context, successful approved replays use the ledger source `orchestration-dispatch-run-approved`, and the response status becomes `execution-run-dispatched-after-ai-governance-approval`.
- The dispatch endpoint is now explicitly guarded by the existing `operator-control` policy at `OPERATOR` minimum role.
- Verification is green: targeted orchestration controller tests `29/29`, API build, full API Jest `23/23` suites and `314/314` tests, and local runtime verification against `http://127.0.0.1:3002`.

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
- `a5a3b6d` docs(architecture): assess perfex nexovaflow v1
- working tree milestone: lock the first concrete Perfex / NexovaFlow application assessment so the CRM lane is now explicitly constrained to a summary-first, task/note/lead-safe adapter path instead of drifting toward platform-core ownership
- `9190817` docs(architecture): add adapter plan v1
- working tree milestone: lock the first cross-system adapter implementation order and minimum slice boundaries for OpenClaw, n8n, MagiCA, aff.nexovaflow, and Perfex / NexovaFlow so the next integration work can stay structurally lean and capability-contract-first
- `538c259` docs(architecture): add starter schema and fast path
- working tree milestone: add the first execution-ready canonical object starter schema plus the fastest-safe operational path so immediate implementation can stay data-lean without losing control-plane discipline
- working tree milestone: add a lightweight execution-runtime diagnostics surface so operators can inspect persisted runtime status, latest snapshot/event refs, and mutation counts without pulling the full snapshot/event history payload
- `2aa7ff4` fix(api): clear remaining local build blockers
- working tree milestone: restore `apps/api` local build green status by reconciling actor-context/seed/auth/dev-middleware paths with the current Prisma 7 + adapter setup, then prove the booted local API can resolve seeded actor context and serve the AI routing-preview endpoint end-to-end
- `abc0c1a` fix(api): reduce local build blockers around actor context typing
- working tree milestone: collapse widespread `context.user` / `context.tenant` / runtime-history typing fallout into a smaller Prisma/auth/dev-runtime blocker set by explicitly typing actor-context resolution and unblocking runtime-history calls against current generated types
- `51eebe4` feat(api): add ai routing preview foundation
- working tree milestone: add a tenant/workspace-aware AI routing-preview orchestration surface so task/risk/quality/cost/quota signals can now be normalized into a cheapest-sufficient lane recommendation before broader AI control-tower execution governance lands
- `7702d63` docs(architecture): add ai cost orchestration policy
- working tree milestone: lock the governed AI cost-orchestration stance in repo docs so cheapest-sufficient routing, cache/reuse, budget enforcement, BYOK handling, and policy-visible escalation are explicit architecture guidance rather than only implied by service foundations
- `c7498a0` feat(api): align runtime lookup ordering with recorded time
- working tree milestone: align latest runtime snapshot/mutation lookups to `recordedAt` ordering instead of `createdAt` fallback
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
- AI routing-preview orchestration endpoint foundation so task/risk/quality/cost/quota signals can now be normalized into a cheapest-sufficient lane recommendation before broader package/admin/user control-surface work lands
- orchestration draft surfaces for roadmap interpretation, app coordination, dataflow, optimization summary, workflow graph, and execution contract, now including execution-action records/batches, concrete execution run records, approval task records, action/run/task topology derived from approval-gated versus ready runner states, execution transition hints/policies, dispatch projections, projected execution mutations/outcomes, projected mutation contracts for downstream write-path planning, a first execution-runtime activation bridge that materializes approval-dispatch and runner-dispatch integration records plus live mutation batches, initial runtime write paths for applying approval decisions and dispatching execution runs against that materialized state, a first persistence-oriented runtime snapshot/event-record boundary for carrying those flows toward stored execution history, an initial best-effort Prisma-backed runtime history store for snapshots/events, a first persisted runtime-history read surface so execution runtime history can now be queried back through the orchestration API/service layer instead of existing only as write-side persistence, and now a lighter execution-runtime diagnostics surface for quick persisted-state health checks without fetching the full history payload
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
- Combined orchestration verification remains green after the latest execution-contract guardrail, execution-action planning, runner/action cross-linking, execution run / approval task state slices, execution projection slices, the runtime-activation bridge, the runtime write-path slice, the new controller/API surfaces for those write paths, the persisted runtime-history read/query surface, the newer batched persisted-mutation lookup path for approval/dispatch progression, a follow-on snapshot-summary typing slice so persisted/runtime snapshots now expose explicit summary contracts by snapshot type instead of falling back to generic records, a newer persisted-history decision guard so stale approval-task state cannot be re-decided after history already advanced it, the persistence fix that stores runtime snapshot `recordedAt` explicitly and orders snapshot history by recorded time instead of relying only on row creation order, and now the follow-on consistency fix that also makes `findLatestSnapshot(...)` and batched/latest mutation lookup paths honor `recordedAt` ordering instead of still leaning on `createdAt`: `npm test -- --runInBand orchestration.controller.spec.ts orchestration.service.spec.ts orchestration-runtime-history.service.spec.ts` passing (focused combined pass green again after the recorded-time lookup-alignment slice).
- API build: passing (`npm run build` in `apps/api`) after the newer actor-context typing repair, the runtime-history typing unblock, the seed/auth/dev-middleware Prisma-alignment fix, the follow-on AI governance validation hardening that now returns explicit 400s for missing package/model policy inputs instead of leaking 500s during local routing-preview verification, and the new execution-runtime diagnostics surface.
- Prisma runtime-history migration verification is now real, not just scaffolded: `npm exec prisma migrate deploy -- --schema .\prisma\schema.prisma` reports no pending migrations, and `npm run runtime-history:check` confirms both `OrchestrationRuntimeSnapshot` and `OrchestrationRuntimeEvent` tables plus required columns exist in the local `aifut` database. The next migration slice now extends snapshot persistence with an explicit `recordedAt` column so snapshot ordering can follow runtime event time rather than only `createdAt`.
- Prisma 7 runtime adapter plumbing is now wired into both `PrismaService` and the runtime-history schema-check script via `@prisma/adapter-pg` + `pg`, closing the earlier constructor-level runtime failure for direct `PrismaClient` startup under engine type `client`.
- Live end-to-end runtime persistence is now proven against the local database: after seeding the smallest valid actor context (`tenant` `acme`, user `ops@acme.test`, workspace `ops`, `ADMIN` membership), `POST /orchestration/plans/:planId/execution-runtime/activate`, `POST /.../approval-decision`, and `POST /.../dispatch-run` were exercised successfully against the booted API, and local persistence inspection confirmed three stored snapshots (`materialized-runtime`, `approval-decision`, `run-dispatch`) plus matching runtime events for plan `plan:acme:ops:live-runtime`.
- Local AI routing preview is now also proven against the booted API: after seeding `tenant` `aifut-core`, user `admin@aifut.local`, and workspace `default`, `POST /orchestration/ai/routing-preview` successfully returned a `model-inference-lane` recommendation (`gpt-4.1-mini`, fallback `gpt-4.1`) for a balanced `workflow_draft` scenario, and the same endpoint now returns a clear `400` (`AI package policy is required.`) when required policy inputs are omitted.
- Local execution-runtime diagnostics is now proven against the booted API too: `GET /orchestration/plans/:planId/execution-runtime/diagnostics` resolves tenant/workspace context and returns a compact persisted-state summary (`historyStatus`, `diagnosticsSummary`, `latestSnapshot`, `latestEvent`) even when the plan currently has no stored runtime history.
- The earlier dirty working-tree runtime lane is now safely committed in `d23844c` and merged with `origin/main` in `c35e4da`, preserving the Prisma runtime adapter enablement (`apps/api/src/prisma.service.ts`, root/app package manifests + lockfiles), runtime-history JSON-input typing fixes in `apps/api/src/orchestration-runtime-history.service.ts`, the runtime-history schema check script under `apps/api/scripts/`, the local runtime seed/exercise/inspection scripts under `apps/api/scripts/`, the Prisma migration folder + `migration_lock.toml`, additional `OrchestrationRuntimeHistoryService` negative-path verification, the persisted-history execution-dispatch regression coverage in `apps/api/src/orchestration.service.spec.ts`, extra degraded-domain governance/readiness coverage in both `tenancy-operations.service.spec.ts` and `tenancy.controller.spec.ts`, targeted tenant-scope primary-domain governance coverage, the shared runtime-DTO tightening passes across runtime models/service/history normalization, the typed-response and persisted-mutation lookup expansions, plus the incoming web/auth/homepage surface from `origin/main`. Local and remote are now synchronized cleanly after the merge/push recovery.
- Behavior-memory and localized interaction architecture is now explicitly documented in `docs/architecture/behavior-memory-and-localized-interaction.md`, locking a three-layer memory model (live context, compacted summaries, raw/archive logs) plus voice/localization direction without yet claiming implementation completion.
- AI cost orchestration architecture is now explicitly documented in `docs/architecture/ai-cost-orchestration-architecture.md`, making the gateway/classifier/router/context/validation/cache/ledger/budget stack a named architectural requirement before broader natural-language and package-commercial AI expansion.

## Current best next steps
1. Continue the next lane now that the orchestration runtime-hardening checkpoint is foundation-locked: expand shared runtime DTO/model coverage from topology/queue/history into more explicit transition/state-hint/projection contracts so controller/API surfaces move further away from rematerialized-only ad-hoc shapes.
2. Push persistence-first progression deeper so later runtime actions and follow-on reads depend even less on the latest-snapshot bridge and more on persisted target-state truth.
3. Continue the adapter/app-definition lane now that the first shared adapter interface definitions exist: link those interfaces more explicitly into the first persisted `AppDefinition` seed path and later connection-instance/runtime binding flow for the five primary systems.
4. Broaden failure/recovery/conflict/degraded-path verification from the now-completed checkpoint into the next orchestration lane so persisted runtime behavior stays reliable as the contract surface widens.
5. Wire the new AI token-governance foundation into package/admin/user surfaces after the current orchestration contract-expansion lane.
6. Persist verification history and richer health state so integrations can be monitored over time instead of only checked ad hoc.
7. Expand tenant operations from admin-only surfaces into fuller provisioning flows, including default-owner/bootstrap handling where needed.
8. Keep NexovaFlow aligned as a tenant-app connector pattern, not a control-plane dependency.
9. Convert the new behavior-memory / localization architecture lock into concrete event, profile, and retention primitives after the current orchestration contract-expansion lane.

## Notes
- Authoritative editable repo: `C:\Users\PC\.openclaw\workspace\aifut-core`
- Latest checked local HEAD: `754d985` (`docs(status): refresh latest checked head`).
- Git safety checkpoint: the large local runtime lane was protected with backup branch `backup/2026-05-21-pre-sync` and tag `safety-pre-sync-2026-05-21` before sync; local and `origin/main` are now aligned.
- Current checkpoint note: after the execution projection chain (`7b08e42` -> `01aaa60`), the orchestration layer now also exposes `materializeExecutionRuntime(...)` plus `POST /orchestration/plans/:planId/execution-runtime/activate`, materializing approval-dispatch integrations, runner-dispatch integrations, and live mutation batches from submitted execution contracts. That bridge is now extended with committed `applyApprovalDecision(...)` and `dispatchExecutionRun(...)` write paths plus matching controller/API surfaces for approval-decision and run-dispatch actions, a persistence-oriented runtime snapshot/event-record boundary, a Prisma-backed `OrchestrationRuntimeHistoryService`, schema models for runtime snapshots/events, a committed Prisma migration scaffold, a working runtime-history schema check entrypoint, verified local tables/columns for the runtime-history store, Prisma adapter plumbing for engine-type `client`, live local seed/exercise scripts, an explicit persisted-history progression fix so dispatch can honor the approval state already stored in runtime history, a `GET /orchestration/plans/:planId/execution-runtime/history` read surface that resolves tenant/workspace context before returning persisted snapshots/events, explicit typed-response coverage for materialized-runtime and persisted-history surfaces, per-target persisted-mutation lookup, batched persisted-mutation lookup for approval/dispatch progression, and focused test/build proof. The checkpoint now also includes `GET /orchestration/plans/:planId/execution-runtime/diagnostics`, giving operators a lighter persisted-state summary (`historyStatus`, `diagnosticsSummary`, latest snapshot/event refs, mutation counts) without pulling the full history payload. On top of that runtime checkpoint, the repo now has a frozen architecture north star, a first decision set for canonical objects/processes/integration/NL execution, a resource-integration strategy, an application-intake template, a canonical object starter set, a canonical object starter schema, a fastest-safe operational path, an adapter plan v1, and the first concrete application assessment for Perfex/NexovaFlow, including the recommended `summary-and-task-bridge` first adapter slice. The latest API foundation lane has now converted that adapter guidance into two lightweight registry surfaces: `GET /connectors/app-definitions` for the five primary systems and `GET /connectors/adapter-contracts` for their first shared contract boundaries, input/output artifacts, operation modes, and safety constraints. It now also adds a first shared adapter-interface layer via `GET /connectors/adapter-interfaces`, with setup-session support for resolving and validating `adapterInterfaceKey` alongside `appDefinitionKey` and `adapterContractKey`. This makes the integration lane more implementation-ready by freezing request/response shapes, normalized inputs/outputs, activation policy, and runtime-binding expectations before deeper app-specific execution depth. The current web lane now also has a sharper positioning-first landing page that reframes AIFUT as an AI-native operating system/control plane, surfaces live platform status more cleanly, and aligns homepage messaging with the kernel-first product strategy while remaining build-green. The roadmap/product lane now also includes reusable product-language assets in `docs/roadmap/go-to-market-positioning-v1.md` and `docs/roadmap/investor-partner-story-v1.md`, freezing the sharper pitch, manifesto, ICP framing, and partner/investor narrative inside the repo so future UX, setup, marketplace, and control-room work can align to the same market-facing system story instead of drifting.
- Older paths should not be treated as primary unless explicitly re-aligned.


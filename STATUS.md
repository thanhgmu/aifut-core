# STATUS

Last updated: 2026-05-31

## Current repo reality
- `main` is synchronized with `origin/main` at `9c86250`.
- Wave 2 is active under `docs/roadmap/wave-2-lane-board.md`.
- The Web UI HQ operator preview now consumes compact approval replay audit history and recent AI dispatch diagnostics from live backend truth.

## Landed recently
- `9c86250` feat(api): align domain runtime readiness diagnostics
- `26ca3ff` feat(api): clarify domain workspace routing visibility
- `328b8d9` feat(api): normalize domain lifecycle enums
- `35c86cf` feat(web): surface bounded HQ read failures
- `8d6ee88` fix(dev): align local runtime exercise endpoints
- `6ffbb83` feat(dev): add approved replay proof helper
- `f16df5b` fix(api): preserve runtime progression during transitions
- `5c21615` feat(api): guard orchestration runtime reads
- `76d83be` feat(web): surface ai approval replay diagnostics
- `81b7882` feat(api): expose AI governance approval replay history
- `9e67fca` test(api): tighten AI governance dispatch diagnostics coverage
- `632bd5b` feat(api): record AI governance dispatch diagnostics
- `020e544` feat(api): audit ai-approved orchestration dispatch
- `3ccfce8` feat(api): resume ai-approved orchestration dispatch
- `216c5b3` feat(api): hold orchestration dispatch for ai approval
- `5eb51a2` feat(api): expose ai governance decision outcomes
- `b0496ef` feat(api): summarize ai governance usage ledger
- `b6b06f4` feat(api): gate orchestration dispatch with ai governance
- `8867415` feat(api): expose ai governance policy writes
- `22a2ea5` feat(api): persist ai governance policy ledgers
- `c1b5eb0` docs(roadmap): add wave 2 lane board

## Latest verified checkpoint
- Domain host resolution now aligns runtime readiness with the domain write contract and explains legacy drift through bounded DNS, certificate, provisioning-mode, and provider reasons.
- Platform subdomains remain ready without tenant-managed DNS metadata, while explicitly pending certificates remain non-ready.
- Verification passed: targeted domain specs `75/75`, API build, full API Jest `24/24` suites and `327/327` tests, local runtime verifier `ok: true`, and live HTTP pending-certificate proof.
- `TenancyOperationsService.upsertDomain(...)` now normalizes and explicitly validates domain `kind` and `status` values before persistence, matching the existing normalization discipline for storage modes and provisioning metadata.
- Mixed-case or whitespace-padded HTTP inputs now resolve cleanly, while invalid values return a bounded `BadRequestException` instead of drifting into lower-level Prisma errors.
- `apps/web/lib/runtime-data.ts` now preserves bounded read status through `getJsonResult(...)` while keeping the existing nullable `getJson(...)` API stable for current callers.
- The Web UI HQ operator preview now distinguishes guarded `401/403` access failures from unreachable API failures and renders a bounded read-status panel only when a preview dependency is unavailable.
- `apps/web/app/foundation/operator-preview/page.tsx` now fetches plan-scoped approval replay history beside existing health and runtime diagnostics.
- The UI surfaces persisted approval replay count, recent approval-dispatch resumes, and recent `held`, `approved-resumed`, `blocked`, and `auto-dispatched` outcome counts without inventing missing data.
- The local sample context now matches seeded runtime truth: `ops@acme.test` and `plan:acme:ops:live-runtime`.

## Verification
- Targeted verification: `npm test -- --runInBand audit-events.service.spec.ts orchestration.controller.spec.ts` passing (`32/32`).
- API build and web production build passing.
- Web typecheck passing when run sequentially.
- Latest Web UI HQ bounded-read slice: web typecheck and web production build passing.
- Focused ESLint remains blocked by the repo baseline: ESLint 9 cannot find an `eslint.config.*` file.
- Domain lifecycle enum checkpoint: targeted tenancy operations spec passing (`67/67`), API build passing, full API Jest passing (`24/24` suites, `324/324` tests), local runtime verifier `ok: true`, and live HTTP mixed-case normalization proof passing.
- Full API Jest: `npm test -- --runInBand` passing (`24/24` suites, `320/320` tests).
- Local runtime verification: `npm run local:verify-runtime` passing against `http://127.0.0.1:3002`.
- Local Web UI HQ proof: `GET http://127.0.0.1:3000/foundation/operator-preview` returned `200` and rendered approval replay, AI dispatch outcome, and truthful empty-history states.
- Known baseline: web lint still reports 15 pre-existing warnings outside the touched route.

## Next actions
1. Continue the next low-collision domain lifecycle verification or narrow write-path slice without broadening into a redesign.
2. Keep authenticated HQ reads and bounded runtime visibility incremental while the preview evolves toward a real operator control room.

## One-command approved replay proof
- Commit `6ffbb83` adds `npm run local:exercise-approved-replay --workspace apps/api`.
- The helper creates a unique proof plan by default, configures approval-requiring AI routing, activates runtime, approves the workflow task, dispatches with AI-governance approval, then verifies approval history and diagnostics.
- Live helper execution returned `ok: true`, `approvalHistoryCount: 1`, `approvedResumedCount: 1`, and latest outcome `approved-resumed`.

## Runtime transition progression fix
- Commit `f16df5b` prevents approval-decision and dispatch transition commands from persisting a fresh materialized baseline snapshot before reading current persisted state.
- This preserves approval clearance and avoids moving a dispatchable run back to `awaiting-approval`.
- A real local flow now succeeds end to end: activate runtime -> approve workflow task -> dispatch with AI-governance approval -> persist approval audit -> expose non-empty history -> render Web UI HQ.
- Live proof on plan `plan:acme:ops:live-runtime`: approval history `count: 1`, diagnostics `approvedResumedCount: 1`, latest outcome `approved-resumed`, HQ production route render `200` with persisted actor `ops@acme.test`.

## Runtime read hardening
- Commit `5c21615` protects execution runtime history, diagnostics, and approval-history reads with `AccessPolicyGuard` and the existing `operator-control` scope at `OPERATOR` minimum role.
- Focused metadata coverage confirms all three read routes carry the intended policy contract.
- Local PostgreSQL drift was corrected by applying committed migrations `20260521075800_add_runtime_snapshot_recorded_at` and `20260530184200_add_ai_governance_persistence`; `prisma migrate status`, `runtime-history:check`, and runtime verifier are green.
- Verification: targeted `33/33`, full API Jest `24/24` suites and `321/321` tests, API build, and live guarded runtime history/diagnostics/approval-history reads all passing.
2. Bind the approval replay diagnostics/history surfaces into the Web UI HQ control plane.
3. Keep `lane/domain-governance-hardening` ready for the next low-collision verification/write-path slice.

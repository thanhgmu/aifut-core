# STATUS

Last updated: 2026-06-02

## Current repo reality
- `main` is synchronized with `origin/main`; latest functional checkpoint expands HQ AI-governance ledger visibility using existing API truth.
- Wave 2 is active under `docs/roadmap/wave-2-lane-board.md`.
- The narrow domain lane now enforces route-ready hostname context through actor resolution, guard boundaries, topology reads, and storage policy reads.
- The Web UI HQ operator preview renders friendly workspace labels for domain bindings while preserving raw IDs as bounded fallback context.
- The Web UI HQ operator preview now reads the guarded AI-governance usage ledger and surfaces orchestration-runtime token totals, effective cost, and recent persisted execution events.

## Landed recently
- `b79bff9` fix(api): validate domain provider metadata
- `dc4f653` fix(api): validate domain certificate metadata
- `2360f55` fix(api): validate domain provisioning modes
- `717cb6e` fix(api): validate domain dns targets
- `03b009b` feat(web): surface domain attention summary in HQ
- `38729a9` feat(api): summarize control-plane domain readiness
- `e36ec2d` feat(api): expose control-plane domain readiness
- `2cfd9b8` feat(api): expose topology domain readiness
- `c52e1b2` feat(web): surface AI usage ledger in HQ
- `687ee24` fix(api): enforce storage policy hostname match
- `53b3cee` fix(api): enforce topology read hostname match
- `1c2e6cb` fix(api): validate forwarded host at guard boundary
- `231ac8d` fix(api): enforce known hostname tenant match
- `2412bcd` test(api): lock proxy hostname list rejection
- `b405bed` fix(api): reject single-label domain bindings
- `e9abb84` fix(api): reject domain IP literal bindings
- `689f3ed` fix(api): validate domain authority port range
- `dd892d8` fix(api): reject ambiguous domain authorities
- `afd8a95` fix(api): validate runtime domain hostnames
- `575f6dc` fix(api): reject malformed domain hostnames
- `8b23eb9` fix(api): reject unauthorized workspace selection
- `66f17fd` fix(api): enforce hostname workspace match
- `f1b2f5e` fix(api): enforce hostname workspace membership
- `1a77ef2` fix(api): enforce route-ready hostname context
- `e19fc69` fix(api): require route-ready primary domains
- `e6027da` fix(api): require tenant domain certificate metadata
- `45d614e` fix(api): report honest domain profile readiness
- `09ab4fa` fix(api): require explicit domain scope rebinding
- `7cb5979` fix(api): preserve domain workspace scope on partial updates
- `b4105fd` fix(api): preserve domain metadata on partial updates
- `d4461fd` fix(api): preserve domain primary intent on partial updates
- `d3c025e` feat(web): label HQ domain workspaces
- `48759d8` docs(status): record HQ domain routing readiness
- `618df96` feat(web): surface domain routing readiness in HQ
- `2e9146f` fix(api): align production runtime entry
- `c829525` refactor(api): centralize domain readiness evaluation
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
- Web UI HQ now surfaces AI-governance workspace scope, returned recent-event count, actual cost, estimated cost, and effective cost from the existing guarded usage-ledger response without inventing unavailable token breakdowns.
- Verification passed: web typecheck, web production build, live production API health `200`, PostgreSQL runtime verifier `ok: true`, HQ route render `200` with all expanded ledger labels, and clean `3000` / `3002` teardown.
- Domain writes now normalize provider metadata as bounded lowercase kebab-case identifiers, rejecting URL-shaped or free-form values with `Invalid provider.` before persistence while keeping provider vocabulary extensible.
- Verification passed: targeted tenancy operations spec `81/81`, API build, full API Jest `26/26` suites and `368/368` tests, PostgreSQL runtime verifier `ok: true` before and after the rejected live write, live production API health `200`, live malformed provider rejection `400`, and clean port `3002` teardown.
- Domain writes now normalize certificate status metadata as bounded kebab-case tokens, rejecting URL-shaped or free-form values with `Invalid certificateStatus.` before persistence while preserving future provider lifecycle extensibility.
- Verification passed: targeted tenancy operations spec `80/80`, API build, full API Jest `26/26` suites and `367/367` tests, PostgreSQL runtime verifier `ok: true` before and after the rejected live write, live production API health `200`, live malformed certificate status rejection `400`, and clean port `3002` teardown.
- Domain writes now accept only the existing `managed` and `affiliate-managed` provisioning modes, rejecting unknown values with bounded `Invalid provisioningMode.` errors before persistence.
- Verification passed: targeted tenancy operations spec `79/79`, API build, full API Jest `26/26` suites and `366/366` tests, PostgreSQL runtime verifier `ok: true` before and after the rejected live write, live production API health `200`, live unknown provisioning mode rejection `400`, and clean port `3002` teardown.
- Domain writes now normalize DNS targets as hostnames and reject URL-shaped, IP-literal, or otherwise malformed targets with bounded `Invalid dnsTarget.` errors before persistence.
- Verification passed: targeted tenancy operations spec `78/78`, API build, full API Jest `26/26` suites and `365/365` tests, PostgreSQL runtime verifier `ok: true` before and after the rejected live write, live production API health `200`, live malformed DNS target write rejection `400`, and clean port `3002` teardown.
- `GET /integrations/domain-routing` now returns route-ready and attention-required domain counts from the shared readiness evaluator, and Web UI HQ surfaces the bounded attention count while retaining a local fallback.
- Verification passed: targeted infrastructure profile spec `3/3`, API build, full API Jest `26/26` suites and `363/363` tests, web typecheck, web production build, PostgreSQL runtime verifier `ok: true`, live domain-routing summary proof with `4` visible domains split into `2` route-ready and `2` attention-required domains, HQ route render `200` with the attention count, and clean `3000` / `3002` teardown.
- `GET /integrations/control-plane` now summarizes visible route-ready and attention-required domain counts from the same shared readiness diagnostics returned per domain.
- Verification passed: targeted integration control-plane service spec `3/3`, API build, full API Jest `26/26` suites and `363/363` tests, PostgreSQL runtime verifier `ok: true`, live production API health `200`, live control-plane summary proof with `4` visible domains split into `2` route-ready and `2` attention-required domains, and clean port `3002` teardown.
- `GET /integrations/control-plane` now enriches visible domains with readiness from the shared `evaluateTenantDomainReadiness(...)` evaluator.
- Verification passed: targeted integration control-plane service spec `3/3`, API build, full API Jest `26/26` suites and `363/363` tests, PostgreSQL runtime verifier `ok: true`, live production API health `200`, live integration control-plane readiness proof, and clean port `3002` teardown.
- `GET /tenancy/current` now enriches visible topology domains with readiness from the shared `evaluateTenantDomainReadiness(...)` evaluator.
- Verification passed: targeted tenancy controller spec `45/45`, API build, full API Jest `26/26` suites and `363/363` tests, PostgreSQL runtime verifier `ok: true`, live production API health `200`, live current-topology readiness proof, and clean port `3002` teardown.
- Web UI HQ now consumes `GET /ai-governance/usage-summary` for the sample orchestration runtime without redefining backend contracts.
- Verification passed: web typecheck, web production build, live production API health `200`, HQ route `200` with AI usage ledger render, and clean `3000` / `3002` teardown.
- Tenant infrastructure profile integration reads now preserve friendly workspace binding labels alongside raw connection scope IDs.
- Verification passed: targeted infrastructure profile spec `3/3`, API build, full API Jest `26/26` suites and `363/363` tests, PostgreSQL runtime verifier `ok: true`, truthful empty-integration live profile proof, and clean port `3002` teardown.
- Connector commercialization reads now preserve friendly workspace binding labels for scoped dependency connections.
- Verification passed: targeted entitlements spec `9/9`, API build, full API Jest `26/26` suites and `363/363` tests, PostgreSQL runtime verifier `ok: true`, truthful empty-dependency live commercialization proof, and clean port `3002` teardown.
- Admin package builder dependency reads now preserve friendly workspace binding labels for NexovaFlow connections.
- Verification passed: targeted entitlements spec `8/8`, API build, full API Jest `26/26` suites and `362/362` tests, PostgreSQL runtime verifier `ok: true`, truthful empty-dependency live builder proof, and clean port `3002` teardown.
- Effective storage routing policy reads now preserve friendly workspace binding labels at the service boundary for controller and internal callers.
- Verification passed: targeted storage routing policy spec `9/9`, API build, full API Jest `26/26` suites and `361/361` tests, PostgreSQL runtime verifier `ok: true`, truthful empty-seed live storage policy proof, and clean port `3002` teardown.
- Current tenancy topology reads now preserve friendly workspace labels for visible domains and storage policies while retaining existing scope filters.
- Verification passed: targeted tenancy controller spec `45/45`, API build, full API Jest `26/26` suites and `361/361` tests, PostgreSQL runtime verifier `ok: true`, live workspace-bound domain topology proof with truthful empty storage seed, and clean port `3002` teardown.
- Storage policies in tenant infrastructure profile and storage-routing policy summary reads now preserve workspace binding labels alongside raw IDs.
- Verification passed: targeted infrastructure profile spec `3/3`, API build, full API Jest `26/26` suites and `360/360` tests, PostgreSQL runtime verifier `ok: true`, truthful empty-seed production profile proof, and clean port `3002` teardown.
- Tenant infrastructure profile domain reads now preserve workspace binding context with `workspaceId` plus friendly workspace `name` and `slug`, matching domain-routing visibility.
- Verification passed: targeted infrastructure profile spec `2/2`, API build, full API Jest `26/26` suites and `359/359` tests, PostgreSQL runtime verifier `ok: true`, live production-build profile proof, and clean port `3002` teardown.
- Domain lifecycle runtime reads reject malformed, ambiguous, IP-literal, single-label, cross-tenant, cross-workspace, and non-route-ready hostname context at the appropriate boundaries.
- Storage topology and effective storage policy reads now bind to the same enforced hostname context as actor resolution.
- Verification passed at `687ee24`: targeted tests `162/162`, full API Jest `359/359`, API build, PostgreSQL runtime verifier `ok: true`, and live HTTP isolation proof.
- `GET /integrations/domain-routing` now enriches every tenant domain with `readiness` from the shared `evaluateTenantDomainReadiness(...)` evaluator.
- Web UI HQ now reads that existing endpoint through the bounded read pipeline and renders a domain-routing readiness metric, API link, tenant/workspace scope, route status, and bounded reasons.
- Verification passed: targeted domain specs `79/79`, API build, full API Jest `26/26` suites and `331/331` tests, web typecheck/build, PostgreSQL runtime verifier `ok: true`, live domain-routing proof over four seeded domains, HQ render `200`, and clean `3000` / `3002` teardown.
- Domain readiness now has one pure `evaluateTenantDomainReadiness(...)` evaluator shared by hostname runtime reads and domain write responses.
- Domain write guardrails consume the same bounded reasons while preserving existing bad-request messages and response compatibility. Write responses now include readiness `reasons`.
- Verification passed: targeted domain specs `119/119`, API build, full API Jest `25/25` suites and `330/330` tests, local runtime verifier `ok: true`, and live HTTP proof showing write/read parity for `certificate-status:pending`.
- Local production startup is aligned: `npm run start:prod --workspace apps/api` now runs the actual built entry `dist/src/main.js`.
- Verification passed: API build, real `start:prod` boot, live `GET /` returning `200`, PostgreSQL runtime verifier `ok: true` with seeded counts `2/2/2/2`, and clean port `3002` teardown after proof.
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
1. Keep domain lifecycle runtime-read contracts aligned across domain-routing, infrastructure-profile, topology, and storage policy surfaces.
2. Continue narrow domain lifecycle verification or write-path hardening while keeping shared Prisma/auth/policy zones serialized.

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

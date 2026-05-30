# Wave 2 lane board

This board converts the current recommended lane map into an active Wave 2 execution board.

See also:
- `docs/roadmap/parallel-lane-execution-plan-v1.md`
- `docs/roadmap/parallel-lane-execution-kit-v1.md`
- `docs/roadmap/lane-kickoff-template.md`
- `docs/roadmap/lane-checkpoint-template.md`
- `docs/roadmap/wave-2-merge-order-checklist.md`

---

## Wave 2 objective

Maximize forward speed while minimizing collisions in shared runtime zones.

Primary goal for this wave:
- extend real backend depth without breaking the now-green API verification baseline
- keep local/Git safety intact
- preserve multi-lane throughput only where ownership boundaries are clear

---

## Wave 2 active lanes

### 1) lane/ai-governance-persistence

**Purpose**
- extend the existing AI token-governance foundation into missing backend shapes:
  - `AiUsageEvent`
  - `AiRoutingPolicy`
  - `AiBudgetPolicy`
  - `AiGateway`
  - credential-mode persistence/contracts

**Why this lane is active now**
- policy math and routing-preview foundation already exist in `apps/api/src/ai-token-governance.service.ts`
- this is a high-leverage system lane that can unlock later operator, pricing, and orchestration decisions
- it has strong strategic value without needing to block on UI work first

**Owns**
- AI usage governance data shapes
- AI routing policy contracts
- AI budget policy contracts
- AI gateway abstraction entrypoint
- persistence-ready AI governance module semantics

**Must avoid unless explicitly locked**
- broad auth/context rewrites
- unrelated orchestration DTO churn
- shared Prisma zones already claimed by another active lane

**Suggested first checkpoint**
- define persistence-facing DTO/domain shapes and a first service boundary for governed AI execution events + routing policy resolution

---

### 2) lane/orchestration-runtime-binding

**Purpose**
- deepen `OrchestrationModule` beyond draft-heavy planning
- tighten runtime-binding semantics between planning, approval, and execution contracts
- move toward richer DTOs and clearer execution-state handling

**Why this lane is active now**
- orchestration is one of the most strategically important differentiators in AIFUT
- waiting too long would over-concentrate progress in policy layers without improving the kernel’s coordination depth

**Owns**
- orchestration DTO deepening
- execution-contract refinement
- runtime-binding semantics
- orchestration state transition contract clarity

**Must avoid unless explicitly locked**
- AI governance persistence tables if another lane owns them
- actor-context/auth primitives unless a temporary no-touch lock is declared
- global naming churn across unrelated modules

**Suggested first checkpoint**
- land one mergeable runtime-binding slice that turns a current draft contract into a more execution-ready DTO/service interaction

---

### 3) lane/domain-governance-hardening

**Purpose**
- harden domain/subdomain lifecycle behavior through targeted verification and narrowly-scoped write-path strengthening
- reduce regression risk while other lanes move faster

**Why this lane is active now**
- this lane provides a stability buffer around a load-bearing surface
- it has lower merge friction than broader cross-cutting refactors
- it improves confidence while kernel and AI lanes evolve

**Owns**
- targeted controller/service verification for domain governance
- write-path hardening around domain/subdomain semantics
- readiness/routing guard regression coverage

**Must avoid unless explicitly locked**
- broad tenancy reshaping
- unrelated storage-policy redesign
- orchestration or AI policy schema work

**Suggested first checkpoint**
- one focused verification + write-guard slice for the next domain-governance path that is currently under-covered

---

### 4) lane/local-runtime-reality-checks

**Purpose**
- keep local behavior honest while Wave 2 lands
- verify runtime truth after each meaningful convergence point
- catch drift between code assumptions and local execution reality early

**Why this lane stays active**
- it is the cheapest way to suppress false progress
- it supports all other lanes without redefining their product semantics

**Owns**
- local verification helpers
- smoke verification commands
- runtime notes for local reality checks
- port/config sanity for active Wave 2 slices

**Suggested first checkpoint**
- one updated local verification note/checklist specifically for Wave 2 convergence points

---

## Wave 2 parallelism rules

### Safe to run in parallel
- `lane/ai-governance-persistence`
- `lane/orchestration-runtime-binding`
- `lane/domain-governance-hardening`
- `lane/local-runtime-reality-checks`

### Parallelism expectation
- `lane/local-runtime-reality-checks` supports all other lanes continuously
- the other three lanes may run at the same time only if they do not overlap on hard no-touch zones

---

## Zones that should stay serialized

### Serial zone A — Prisma schema / persistence truth
If a lane touches:
- Prisma models
- migrations
- shared persistence enums
- cross-module storage contracts

then that slice becomes serialized until merged or checkpointed.

### Serial zone B — shared auth/context/policy primitives
If a lane touches:
- `ActorContextService`
- `AccessPolicyGuard`
- access-policy core contracts
- shared request identity resolution

then that slice should not be developed concurrently by multiple lanes.

### Serial zone C — final convergence verification
Before wave merge completion:
1. rebase/merge from latest `main`
2. run targeted verification for the touched lane
3. run full `apps/api` Jest verification
4. run local runtime validation when relevant

---

## Recommended merge order for Wave 2

Default safest merge order:
1. `lane/domain-governance-hardening`
2. `lane/ai-governance-persistence`
3. `lane/orchestration-runtime-binding`
4. `lane/local-runtime-reality-checks`

### Why this order
- domain hardening is the narrowest and least structurally invasive lane
- AI governance persistence benefits from merging before orchestration consumes or references new policy/persistence contracts
- orchestration runtime-binding is more likely to depend on settled contracts
- local runtime reality checks should validate the current merged truth continuously and again at convergence

---

## Lane kickoff guidance for Wave 2

For each active Wave 2 lane, create a kickoff note using `docs/roadmap/lane-kickoff-template.md` and record:
- exact branch name
- worktree path
- temporary no-touch locks if any
- first checkpoint target
- verification commands

Recommended branch names:
- `lane/ai-governance-persistence`
- `lane/orchestration-runtime-binding`
- `lane/domain-governance-hardening`
- `lane/local-runtime-reality-checks`

---

## Wave 2 success definition

Wave 2 is successful when:
- at least one mergeable checkpoint lands from each active core lane
- shared-runtime collision is kept low
- the repo stays Git-safe
- full `apps/api` verification remains green after convergence
- local runtime truth continues to match claimed progress

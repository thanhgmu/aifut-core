# AIFUT parallel lane execution plan v1

## Purpose
Speed up AIFUT delivery on one local machine without sacrificing kernel-first architecture, data safety, continuity, or merge sanity.

This plan assumes:
- `aifut-core/main` remains the canonical truth
- parallel work happens in separate branches / worktrees / sessions
- merge order is controlled by kernel dependency, not by whichever lane moves first

## Core rule
Parallelize surfaces and adapters around the kernel.
Do **not** parallelize uncontrolled edits inside the same kernel-critical zone.

---

## Standard lane map

### Lane A — kernel-auth-runtime
**Goal**
Strengthen the backend control-plane core:
- auth foundation
- actor context
- memberships / role enforcement
- runtime contract hardening
- persistence-first orchestration progression

**Owns**
- `apps/api/src/auth*`
- `apps/api/src/actor-context*`
- `apps/api/src/access-policy*`
- `apps/api/src/memberships*`
- `apps/api/src/orchestration*`
- shared backend contract files directly required by these flows

**Why this lane exists**
This is the load-bearing kernel lane. Other lanes must consume its contracts, not freestyle around them.

---

### Lane B — operator-ui-control-plane
**Goal**
Turn the kernel into visible operator value:
- dashboard
- operator control-plane preview
- live runtime / setup / diagnostics visibility
- non-technical operator flows built on top of stable APIs

**Owns**
- `apps/web/app/dashboard/**`
- `apps/web/app/foundation/**`
- operator-oriented visual surfaces in `apps/web`
- local UI-only composition utilities that do not redefine backend contracts

**Why this lane exists**
This is the fastest path to visible product proof and stakeholder confidence, while staying downstream of the kernel.

---

### Lane C — integration-setup-experience
**Goal**
Advance the connector and setup plane:
- adapter interfaces
- templates
- interface-aware setup defaults
- setup-session evolution
- safer setup UX for non-technical and partner users

**Owns**
- `apps/api/src/connectors*`
- `apps/api/src/integrations*`
- adapter/setup-related constant and model files
- corresponding UI/API surfaces for setup flows when not redefining kernel auth/runtime semantics

**Why this lane exists**
This lane is the bridge from architecture into real integration leverage.

---

### Lane D — local-dev-reliability
**Goal**
Keep the machine and repo fast, predictable, and reusable:
- env conventions
- local startup defaults
- health checks
- docs for local verification
- scripts / examples that reduce repeated runtime confusion

**Owns**
- `README.md`
- `.env.example`
- `apps/api/.env.example`
- lightweight local-dev scripts/docs
- non-product-facing local verification helpers

**Why this lane exists**
This lane prevents local drift from stealing time from product work.

---

## What can run in parallel safely

### Safe parallel set 1
- Lane A + Lane B
- Lane A + Lane D
- Lane B + Lane D
- Lane C + Lane D

### Safe parallel set 2
- Lane B + Lane C + Lane D

### Conditionally safe
- Lane A + Lane C

This pairing is only safe when their contract boundary is frozen for the slice.
If Lane A is actively changing actor context / auth / orchestration contract shape, Lane C must avoid coupling to unstable internals.

---

## Lanes that must not freely collide

### Lane A and Lane C must not both edit at the same time without coordination in:
- request-context primitives
- actor-context resolution shape
- shared orchestration execution contract types
- core integration-auth / access-policy coupling
- persistence schema for runtime-critical entities

### Lane A and Lane B must not both redefine:
- API response shape for the same operator surface in the same slice
- auth/session assumptions without a contract checkpoint

### Lane B and Lane C must not both own the same setup UX file tree
If they need the same surface:
- Lane C owns setup semantics
- Lane B owns presentation after the API contract is stable

---

## Hard no-touch zones
Only one active lane at a time should modify these unless there is an explicit checkpoint and rebase plan:

1. Prisma schema / migration state
2. tenant resolution core
3. actor-context resolution core
4. access-policy enforcement core
5. orchestration runtime persistence model
6. shared contract files consumed by multiple backend modules in the same slice

These are the main places where false parallelism creates expensive repair work.

---

## Dependency order
The safest dependency chain is:

1. **Lane D** can move almost anytime
2. **Lane A** establishes stable backend truth
3. **Lane C** extends setup/integration behavior on top of stable truth
4. **Lane B** makes the truth legible and operable in UI

Important nuance:
- Lane B may prototype UI in parallel before final APIs exist
- but final merge should still respect backend truth from A/C

---

## Safest merge order

### Standard merge order
1. `lane-local-dev-reliability`
2. `lane-kernel-auth-runtime`
3. `lane-integration-setup-experience`
4. `lane-operator-ui-control-plane`

### Why
- local/dev fixes reduce drag for all lanes
- kernel contract changes must land before setup/UI depend on them
- setup semantics should settle before operator surfaces present them as real workflows
- UI should be the thinnest downstream consumer when possible

---

## First-wave execution recommendation
To maximize speed without overloading coordination cost, start with **three live lanes** only:

### Wave 1 active lanes
- `lane-kernel-auth-runtime`
- `lane-operator-ui-control-plane`
- `lane-local-dev-reliability`

### Wave 1 deferred lane
- `lane-integration-setup-experience`

### Reason
The current repo already has a visible adapter/setup foundation. The biggest compounding gain now is:
- make kernel contracts safer
- make operator value more visible
- keep local execution friction low

Then bring Lane C harder once Lane A locks the next contract checkpoint.

---

## Proposed branch / worktree naming
- `lane/kernel-auth-runtime`
- `lane/operator-ui-control-plane`
- `lane/integration-setup-experience`
- `lane/local-dev-reliability`

Suggested worktree folder pattern:
- `aifut-core-main`
- `aifut-core-lane-kernel`
- `aifut-core-lane-operator`
- `aifut-core-lane-integration`
- `aifut-core-lane-dev`

---

## Merge gates per lane

### Lane A gate
- targeted tests pass
- `npm run check-types`
- local API `/health`
- no unresolved contract drift in auth / actor / orchestration surfaces

### Lane B gate
- `npm run check-types`
- route-level local verification
- no broken fetch assumptions against current API truth

### Lane C gate
- `npm run check-types`
- endpoint verification for setup / connector routes
- no uncontrolled edits in kernel auth/runtime core

### Lane D gate
- docs/examples/scripts reflect actual local behavior
- local startup path verified
- no misleading or stale config guidance

---

## Coordination rules
1. Main remains green and mergeable.
2. Merge small slices, not giant batches.
3. Rebase lane branches frequently onto `main` after kernel checkpoints.
4. If a lane touches a hard no-touch zone, announce a temporary lock on that zone.
5. UI must not invent backend truth.
6. Setup/integration must not bypass auth / actor / access-policy truth.
7. If parallel work increases confusion more than speed, reduce the number of active lanes immediately.

---

## Immediate next action after this plan
1. Keep `main` as canonical HQ.
2. Start with three-lane execution model:
   - kernel-auth-runtime
   - operator-ui-control-plane
   - local-dev-reliability
3. Delay heavy integration-setup branching until the next kernel contract checkpoint is landed.
4. Continue committing and verifying locally at each checkpoint.

This is the fastest safe parallelization pattern for AIFUT right now.

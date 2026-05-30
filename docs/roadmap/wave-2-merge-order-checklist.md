# Wave 2 merge order checklist

This checklist is the operational convergence guide for `docs/roadmap/wave-2-lane-board.md`.

---

## Default merge order

1. `lane/domain-governance-hardening`
2. `lane/ai-governance-persistence`
3. `lane/orchestration-runtime-binding`
4. `lane/local-runtime-reality-checks`

Use a different order only when a smaller verified slice clearly reduces risk.

---

## Pre-merge checklist for every Wave 2 lane

- [ ] latest `main` pulled/rebased into the lane branch
- [ ] lane scope still matches the ownership declared in the Wave 2 board
- [ ] no hidden edits in restricted shared zones
- [ ] checkpoint is the smallest mergeable unit rather than an oversized mixed batch
- [ ] commit history is slice-scoped and understandable
- [ ] `STATUS.md` impact is known if the merge changes verified repo truth

---

## Restricted shared zones

If any of these are touched, explicitly declare temporary lock ownership before merging:
- Prisma schema / migrations
- shared persistence enums
- `ActorContextService`
- `AccessPolicyGuard`
- shared access-policy contracts
- orchestration runtime persistence primitives
- AI gateway contract primitives reused by multiple modules

When a restricted zone is touched:
1. checkpoint quickly
2. merge quickly or explicitly hand off
3. rebase dependent lanes immediately after it lands

---

## Lane-specific merge gates

### 1) lane/domain-governance-hardening

Before merge:
- [ ] targeted domain/service/controller verification passed
- [ ] any new write-path rule is explicit in tests/spec coverage
- [ ] no accidental tenancy contract drift was introduced
- [ ] no unrelated domain/storage redesign was bundled in

After merge:
- [ ] dependent lanes rebase if domain routing semantics changed

---

### 2) lane/ai-governance-persistence

Before merge:
- [ ] AI governance additions are persistence-ready, not only doc-level
- [ ] DTO/service naming is consistent with existing `AiTokenGovernanceService` foundation
- [ ] any Prisma additions are isolated and reviewed as shared-zone changes
- [ ] package-policy / routing-policy / usage-event semantics are test-covered
- [ ] no feature bypasses the planned AI gateway direction

After merge:
- [ ] orchestration lane checks whether new policy/gateway contracts should be consumed
- [ ] status/memory truth updated if the repo crossed from foundation-only to persistence-backed AI governance

---

### 3) lane/orchestration-runtime-binding

Before merge:
- [ ] checkpoint clearly deepens runtime-binding rather than adding more draft-only surface
- [ ] contract impact is documented
- [ ] downstream auth/context dependency changes are explicit
- [ ] targeted orchestration verification passed
- [ ] if execution-state semantics changed, the effect on future operator/runtime surfaces is stated

After merge:
- [ ] local runtime checks rerun if routes or execution-facing endpoints changed

---

### 4) lane/local-runtime-reality-checks

Before merge:
- [ ] docs/scripts/checks reflect actual current local runtime behavior
- [ ] no stale port/env guidance remains
- [ ] verification commands are reproducible from canonical HQ checkout
- [ ] lane does not silently redefine product semantics

After merge:
- [ ] use the updated checks against latest `main`

---

## Final convergence checklist

After all intended Wave 2 merges for a cycle:
- [ ] `git status --short --branch` is clean in canonical HQ
- [ ] targeted verification rerun for each merged lane
- [ ] full `npm run test --workspace apps/api -- --runInBand` passed
- [ ] local runtime validation executed for any touched live/local surfaces
- [ ] `C:\Users\PC\.openclaw\workspace\STATUS.md` updated if repo truth changed
- [ ] `D:\TARGET AIFUT\STATUS.md` updated if continuity mirror truth changed
- [ ] memory updated when a durable decision or milestone landed

---

## Recommended operator habit

Treat this checklist as mandatory whenever multiple Wave 2 lanes are active at the same time.

The point is not just speed.
The point is preserving high-confidence speed.

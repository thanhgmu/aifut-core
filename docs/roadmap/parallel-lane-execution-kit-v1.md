# AIFUT parallel lane execution kit v1

This document turns the lane strategy into concrete execution artifacts.

See also:
- `docs/roadmap/parallel-lane-execution-plan-v1.md`
- `docs/roadmap/wave-2-lane-board.md`
- `docs/roadmap/wave-2-merge-order-checklist.md`
- `docs/roadmap/lanes/wave-2-active-execution-artifacts-2026-06-06.md`

---

## 1) Standard branch naming

Use this exact pattern:
- `lane/kernel-auth-runtime`
- `lane/operator-ui-control-plane`
- `lane/integration-setup-experience`
- `lane/local-dev-reliability`

### Optional short-lived slice branches
When a lane needs a narrower checkpoint, branch from the lane branch:
- `lane/kernel-auth-runtime/actor-context-guard`
- `lane/operator-ui-control-plane/dashboard-runtime-cards`
- `lane/integration-setup-experience/interface-aware-defaults`
- `lane/local-dev-reliability/local-health-scripts`

### Naming rules
- use nouns/actions that map to one mergeable slice
- avoid vague names like `fix-1`, `test`, `misc`
- do not open multiple slice branches for the same exact file zone unless there is an explicit lock owner

---

## 2) Standard worktree layout

Recommended root layout on the same local machine:

```text
C:\Users\PC\.openclaw\workspace\
  aifut-core                # canonical main checkout / HQ
  aifut-core-main           # optional dedicated clean main worktree
  aifut-core-lane-kernel    # lane/kernel-auth-runtime
  aifut-core-lane-operator  # lane/operator-ui-control-plane
  aifut-core-lane-integration # lane/integration-setup-experience
  aifut-core-lane-dev       # lane/local-dev-reliability
```

### Working rule
- `aifut-core` remains canonical HQ
- each active lane gets its own worktree
- one worktree = one branch = one active responsibility

### Port and runtime convention
To reduce collisions, keep these local defaults:
- operator/web lane UI: `localhost:3000`
- docs: `localhost:3001`
- API: `127.0.0.1:3002`

If multiple UI/API lanes need to run at once, assign a temporary lane-specific port map and record it in the lane kickoff note.

---

## 3) Standard lane ownership map

### lane/kernel-auth-runtime
Owns:
- auth
- actor context
- memberships / role enforcement
- access policy
- orchestration runtime contract hardening

Must not be bypassed by other lanes when changing:
- request context shape
- auth/session assumptions
- runtime contract primitives

### lane/operator-ui-control-plane
Owns:
- dashboard
- foundation/operator surfaces
- runtime visibility UI
- operator-facing control-plane proof

Consumes backend truth from kernel/setup lanes.

### lane/integration-setup-experience
Owns:
- connectors
- setup session
- templates
- adapter-interface driven setup semantics

Must not redefine kernel auth/runtime truth.

### lane/local-dev-reliability
Owns:
- env defaults
- startup guidance
- verification scripts/checks
- local runtime consistency docs

May move almost anytime if it does not rewrite product semantics.

---

## 4) Merge checklist standard

Every merge candidate must answer all relevant checks before merging to `main`.

### Universal checklist
- [ ] branch rebased or merged from latest `main`
- [ ] scope matches lane ownership
- [ ] no unexpected edits in hard no-touch zones
- [ ] local verification was run for the touched surface
- [ ] `npm run check-types` passed or an equivalent minimal gate was executed
- [ ] commit message is precise and slice-scoped
- [ ] if API shape changed, downstream lane impact is stated
- [ ] if UI depends on mocked assumptions, that is stated clearly

### Additional checklist — kernel lane
- [ ] auth/actor/runtime contract changes are explicit
- [ ] no hidden cross-module drift remains
- [ ] runtime or policy changes do not silently break integration/setup/UI lanes

### Additional checklist — operator lane
- [ ] UI does not invent backend truth
- [ ] live/local route rendering was verified
- [ ] fetch assumptions match current API responses

### Additional checklist — integration/setup lane
- [ ] connector/setup changes do not bypass auth/access-policy constraints
- [ ] interface/setup semantics are documented when contract shape changes

### Additional checklist — local/dev lane
- [ ] docs/examples match actual local runtime behavior
- [ ] no config guidance points to stale ports or stale URLs

---

## 5) Checkpoint rules per lane

A checkpoint is the smallest safe unit that can be reviewed, verified, merged, or handed off.

### Checkpoint rules for lane/kernel-auth-runtime
A checkpoint should be one of:
- one auth or actor-context behavior slice
- one access-policy slice
- one orchestration runtime-hardening slice

A checkpoint must include:
- touched contract summary
- verification summary
- downstream risk note

### Checkpoint rules for lane/operator-ui-control-plane
A checkpoint should be one of:
- one dashboard surface slice
- one runtime visibility slice
- one operator flow slice

A checkpoint must include:
- route(s) changed
- API dependency used
- local rendering proof

### Checkpoint rules for lane/integration-setup-experience
A checkpoint should be one of:
- one adapter-interface or template slice
- one setup-session improvement slice
- one setup UX contract slice

A checkpoint must include:
- connector/setup scope
- contract dependency note
- local endpoint verification

### Checkpoint rules for lane/local-dev-reliability
A checkpoint should be one of:
- one env/defaults correction
- one startup/runbook correction
- one verification helper improvement

A checkpoint must include:
- exact local issue removed
- exact new standard introduced
- exact validation run

---

## 6) Hard no-touch zone protocol

If a lane needs to touch one of these zones, declare temporary ownership for that slice:
- Prisma schema / migrations
- tenant resolution core
- actor-context core
- access-policy core
- orchestration runtime persistence model
- shared backend contract primitives used by multiple modules

### Protocol
1. announce zone ownership in the lane checkpoint note
2. finish the slice quickly
3. merge or checkpoint before opening another overlapping slice
4. rebase dependent lanes immediately after the checkpoint lands

---

## 7) Current Wave 2 execution state

### Wave 2 active
- `lane/integration-setup-experience`
- `lane/orchestration-runtime-binding`
- `lane/operator-ui-control-plane`
- `lane/local-runtime-reality-checks`
- `lane/domain-governance-hardening`

### Current fastest safe path
- keep the active product direction on `lane/integration-setup-experience`
- let orchestration consume integration artifacts only through existing preview/review contracts
- let operator UI render backend truth only after local API proof is refreshed
- keep domain governance serialized unless a routing/security checkpoint becomes highest value

### Runtime reality rule
Before claiming a live endpoint proof, verify actual local services.
As of the 2026-06-06 morning checkpoint, PostgreSQL was listening on `5432`, while API `3002` and Web `3000` needed to be restarted before new runtime-facing work.

---

## 8) Execution order when starting new work

1. decide if the slice belongs to an existing lane
2. confirm it does not collide with a hard no-touch zone currently in motion
3. create or reuse the correct lane branch/worktree
4. write a kickoff note from the template
5. implement the smallest meaningful checkpoint
6. verify locally
7. commit
8. merge or queue for merge using the merge checklist

---

## 9) Safest merge order

Default merge order:
1. `lane/local-dev-reliability`
2. `lane/kernel-auth-runtime`
3. `lane/integration-setup-experience`
4. `lane/operator-ui-control-plane`

Use a different order only when a smaller verified checkpoint clearly reduces risk.

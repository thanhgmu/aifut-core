# AIFUT wave 1 lane board v1

This board activates the first three live lanes from the parallel execution plan.

## Active lanes
1. `lane/kernel-auth-runtime`
2. `lane/operator-ui-control-plane`
3. `lane/local-dev-reliability`

## Deferred lane
- `lane/integration-setup-experience`

## Merge order for wave 1
1. `lane/local-dev-reliability`
2. `lane/kernel-auth-runtime`
3. `lane/operator-ui-control-plane`

## Lane checkpoints

### lane/kernel-auth-runtime
- first checkpoint: actor-context + auth/access-policy checkpoint inventory and the smallest safe kernel slice to harden next
- branch: `lane/kernel-auth-runtime`
- worktree: `C:\Users\PC\.openclaw\workspace\aifut-core-lane-kernel`
- primary output: kickoff note + first safe kernel checkpoint proposal or implementation if low-risk

### lane/operator-ui-control-plane
- first checkpoint: operator control-plane preview v1, extending dashboard/foundation surfaces without inventing backend truth
- branch: `lane/operator-ui-control-plane`
- worktree: `C:\Users\PC\.openclaw\workspace\aifut-core-lane-operator`
- primary output: kickoff note + visible UI checkpoint that consumes current API truth

### lane/local-dev-reliability
- first checkpoint: local startup/verification reliability v1 beyond current env docs, preferably a reusable verification script or runbook improvement
- branch: `lane/local-dev-reliability`
- worktree: `C:\Users\PC\.openclaw\workspace\aifut-core-lane-dev`
- primary output: kickoff note + smallest reusable local reliability improvement

## Hard no-touch reminder
No lane may freely modify these without explicit temporary ownership in its checkpoint note:
- Prisma schema / migration state
- tenant resolution core
- actor-context core
- access-policy enforcement core
- orchestration runtime persistence model
- shared backend contract primitives

## Operating rule
Each lane must:
- verify locally before claiming progress
- commit small slices
- avoid uncontrolled overlap
- report downstream impact clearly

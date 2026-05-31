# STATUS

Last updated: 2026-05-31

## Current repo reality
- `main` was clean and synced with `origin/main` at `9e67fca` before the current checkpoint.
- Wave 2 is active under `docs/roadmap/wave-2-lane-board.md`.
- The current working-tree checkpoint exposes compact approval replay audit history by plan.

## Landed recently
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

## Current working-tree checkpoint
- `GET /orchestration/plans/:planId/execution-runtime/approval-history` returns plan-filtered AI-governance approval replay audit records.
- Reads remain tenant/workspace-scoped and query only `ai-governance.approval-dispatch-resumed` events targeting orchestration execution runs.
- The endpoint accepts a bounded `limit` and keeps operators out of the broader audit stream for this focused history check.

## Verification
- Targeted verification: `npm test -- --runInBand audit-events.service.spec.ts orchestration.controller.spec.ts` passing (`32/32`).
- API build: `npm run build` passing from `apps/api`.
- Full API Jest: `npm test -- --runInBand` passing (`24/24` suites, `320/320` tests).
- Local runtime verification: `npm run local:verify-runtime` passing against `http://127.0.0.1:3002`.

## Next actions
1. Add operator-facing filtering or summarization for approval replay history where useful.
2. Bind the approval replay diagnostics/history surfaces into the Web UI HQ control plane.
3. Keep `lane/domain-governance-hardening` ready for the next low-collision verification/write-path slice.

# STATUS

Last updated: 2026-05-31

## Current repo reality
- `main` was clean and synced with `origin/main` at `216c5b3` before the current checkpoint.
- Wave 2 is active under `docs/roadmap/wave-2-lane-board.md`.
- The current working-tree checkpoint adds an operator-guarded approval-resume path for AI-governance-held orchestration dispatches.

## Landed recently
- `216c5b3` feat(api): hold orchestration dispatch for ai approval
- `5eb51a2` feat(api): expose ai governance decision outcomes
- `b0496ef` feat(api): summarize ai governance usage ledger
- `b6b06f4` feat(api): gate orchestration dispatch with ai governance
- `8867415` feat(api): expose ai governance policy writes
- `22a2ea5` feat(api): persist ai governance policy ledgers
- `c1b5eb0` docs(roadmap): add wave 2 lane board

## Current working-tree checkpoint
- `POST /orchestration/plans/:planId/execution-runtime/dispatch-run` remains policy-first: every retry resolves the current AI gateway decision before runner dispatch.
- Approval-required decisions still hold when no approval is supplied.
- An explicit `aiGovernance.approval.decision = approve` replay now resumes the held run, attributes approval to the resolved actor, records an approval-specific ledger source, and returns `execution-run-dispatched-after-ai-governance-approval`.
- The runtime dispatch endpoint now requires the existing `operator-control` access-policy scope with at least `OPERATOR` role.

## Verification
- Targeted controller verification: `npm test -- --runInBand orchestration.controller.spec.ts` passing (`29/29`).
- API build: `npm run build` passing from `apps/api`.
- Full API Jest: `npm test -- --runInBand` passing (`23/23` suites, `314/314` tests).
- Local runtime verification: `npm run local:verify-runtime` passing against `http://127.0.0.1:3002`.

## Next actions
1. Persist a first-class AI-governance approval audit/history record instead of relying only on replay response plus approval-specific dispatch ledger source.
2. Extend runtime diagnostics so operators can distinguish AI-held, AI-approved-resumed, blocked, and auto-dispatched outcomes quickly.
3. Keep `lane/domain-governance-hardening` ready for the next low-collision verification/write-path slice.

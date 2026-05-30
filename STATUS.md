# STATUS

Last updated: 2026-05-31

## Current repo reality
- `main` was clean and synced with `origin/main` at `3ccfce8` before the current checkpoint.
- Wave 2 is active under `docs/roadmap/wave-2-lane-board.md`.
- The current working-tree checkpoint persists first-class audit evidence after an operator-approved AI-governance replay resumes dispatch.

## Landed recently
- `3ccfce8` feat(api): resume ai-approved orchestration dispatch
- `216c5b3` feat(api): hold orchestration dispatch for ai approval
- `5eb51a2` feat(api): expose ai governance decision outcomes
- `b0496ef` feat(api): summarize ai governance usage ledger
- `b6b06f4` feat(api): gate orchestration dispatch with ai governance
- `8867415` feat(api): expose ai governance policy writes
- `22a2ea5` feat(api): persist ai governance policy ledgers
- `c1b5eb0` docs(roadmap): add wave 2 lane board

## Current working-tree checkpoint
- Approved AI-governance replay dispatches now write `ai-governance.approval-dispatch-resumed` through the existing Prisma-backed audit foundation after runner dispatch and usage-ledger recording succeed.
- The audit event is tenant/workspace-scoped and stores plan/run keys, resolved approver attribution, policy lane/credential/outcome context, approval reason, and the linked usage-ledger event key.
- Ordinary auto-dispatch, held, and blocked paths do not emit a false approval audit.

## Verification
- Targeted controller verification: `npm test -- --runInBand orchestration.controller.spec.ts` passing (`29/29`).
- API build: `npm run build` passing from `apps/api`.
- Full API Jest: `npm test -- --runInBand` passing (`23/23` suites, `314/314` tests).
- Local runtime verification: `npm run local:verify-runtime` passing against `http://127.0.0.1:3002`.

## Next actions
1. Extend runtime diagnostics so operators can distinguish AI-held, AI-approved-resumed, blocked, and auto-dispatched outcomes quickly.
2. Add compact audit/history read visibility for AI-governance approval replays.
3. Keep `lane/domain-governance-hardening` ready for the next low-collision verification/write-path slice.

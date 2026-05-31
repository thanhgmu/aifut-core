# STATUS

Last updated: 2026-05-31

## Current repo reality
- `main` is synchronized with `origin/main` at `76d83be`.
- Wave 2 is active under `docs/roadmap/wave-2-lane-board.md`.
- The Web UI HQ operator preview now consumes compact approval replay audit history and recent AI dispatch diagnostics from live backend truth.

## Landed recently
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
- `apps/web/app/foundation/operator-preview/page.tsx` now fetches plan-scoped approval replay history beside existing health and runtime diagnostics.
- The UI surfaces persisted approval replay count, recent approval-dispatch resumes, and recent `held`, `approved-resumed`, `blocked`, and `auto-dispatched` outcome counts without inventing missing data.
- The local sample context now matches seeded runtime truth: `ops@acme.test` and `plan:acme:ops:live-runtime`.

## Verification
- Targeted verification: `npm test -- --runInBand audit-events.service.spec.ts orchestration.controller.spec.ts` passing (`32/32`).
- API build and web production build passing.
- Web typecheck passing when run sequentially.
- Full API Jest: `npm test -- --runInBand` passing (`24/24` suites, `320/320` tests).
- Local runtime verification: `npm run local:verify-runtime` passing against `http://127.0.0.1:3002`.
- Local Web UI HQ proof: `GET http://127.0.0.1:3000/foundation/operator-preview` returned `200` and rendered approval replay, AI dispatch outcome, and truthful empty-history states.
- Known baseline: web lint still reports 15 pre-existing warnings outside the touched route.

## Next actions
1. Guard operator-facing diagnostics and approval-history reads with the existing operator-control policy before promoting the preview toward production HQ.
2. Correct the runtime-history schema check expectation: local snapshot storage exposes `createdAt`, while `runtime-history:check` currently expects `recordedAt`.
3. Seed or exercise a local approved replay so the HQ route can verify a non-empty approval-history render.
2. Bind the approval replay diagnostics/history surfaces into the Web UI HQ control plane.
3. Keep `lane/domain-governance-hardening` ready for the next low-collision verification/write-path slice.

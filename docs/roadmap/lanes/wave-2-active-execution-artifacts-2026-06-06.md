# Wave 2 active execution artifacts - 2026-06-06

This note turns the current Wave 2 lane plan into the concrete execution state Minh should operate from next.

## Operating boundary

- Canonical repo: `C:\Users\PC\.openclaw\workspace\aifut-core`
- Canonical branch for this checkpoint: `main`
- Current pushed HEAD before this note: `22915e9` (`feat(api): emit integration setup artifacts`)
- Local runtime truth at 2026-06-06 09:50 GMT+7:
  - PostgreSQL is listening on `5432`
  - API `127.0.0.1:3002` is not currently serving
  - Web `127.0.0.1:3000` is not currently serving
- Local runtime implication: any runtime-facing checkpoint must restart and prove API/Web again before claiming live deploy.

## Active lane execution map

### lane/integration-setup-experience

- Current artifact: `docs/roadmap/lanes/lane-integration-setup-experience-kickoff.md`
- Current code checkpoint: `POST /integrations/ai-draft` returns `setupExecutionArtifact`
- Customer-facing purpose: let non-technical users express app integration intent in natural language and receive a review-ready setup execution checklist.
- Next smallest safe slice: make the artifact easier for operator UI/runtime-binding lanes to consume without enabling activation, connector dispatch, or persistence side effects.
- No-touch zones: Prisma schema, migrations, auth/access-policy core, connector activation, external dispatch.

### lane/orchestration-runtime-binding

- Current artifact dependency: runtime-binding setup preview and `operatorDecisionState`
- Customer-facing purpose: convert review-only setup work into bounded operator decisions while activation stays blocked until required bindings and approvals are configured.
- Next smallest safe slice: connect integration setup artifact handoff keys to existing preview/review language so setup queues can reference a concrete artifact contract.
- No-touch zones unless explicitly locked: actor context, access policy, persistence model primitives.

### lane/operator-ui-control-plane

- Current artifact dependency: Web HQ dashboard setup preview and bounded failure/read states.
- Customer-facing purpose: keep non-technical setup work visible, editable, and understandable without inventing backend truth.
- Next smallest safe slice: render `setupExecutionArtifact` summary after API proof is refreshed, using existing dashboard patterns and safe fallback text.
- No-touch zones: backend contract semantics and activation behavior.

### lane/local-runtime-reality-checks

- Current artifact dependency: local production runtime entry is already repaired, but API/Web are currently offline.
- Customer-facing purpose: prevent false progress by proving every runtime claim against the local machine.
- Next smallest safe slice: restart API/Web, run the existing runtime verifier, and record the live endpoint proof before any runtime-facing claim.
- No-touch zones: product semantics.

### lane/domain-governance-hardening

- Current artifact dependency: domain/readiness hardening is already deeply advanced and should stay serialized around shared auth/context/policy rules.
- Customer-facing purpose: keep tenant/domain routing safe while integration and orchestration lanes move.
- Next smallest safe slice: only resume when a domain-specific regression or readiness proof is the highest-value path.
- No-touch zones: unrelated orchestration and integration setup contracts.

## Execution order from this checkpoint

1. Refresh local runtime truth: API/Web must be restarted and verified before live endpoint claims.
2. Keep the active product direction on `lane/integration-setup-experience` because it most directly serves natural-language app integration.
3. Let `lane/orchestration-runtime-binding` consume integration handoff artifacts only through existing preview/review contracts.
4. Let `lane/operator-ui-control-plane` render backend truth only after the API contract is locally proven.
5. Keep `lane/domain-governance-hardening` available but serialized unless a routing/security issue appears.

## Code restraint rule for this wave

- Prefer small patches over broad rewrites.
- Reuse existing services and DTO shapes before adding new abstractions.
- Keep business logic, API contract, and UI rendering separated.
- Stop and warn Thanh if a proposed path increases algorithmic complexity, storage load, queue pressure, or shared-zone collision risk.

## Verification expectation

For docs-only lane artifacts:
- `git diff --check`

For runtime-facing follow-up:
- targeted API/Web tests for touched surface
- `npm run build --workspace apps/api` or Web equivalent when relevant
- full API Jest when backend behavior changes
- local runtime verifier
- live API/Web endpoint proof

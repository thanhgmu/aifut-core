# Lane execution artifact - 2026-06-13

## Lane kickoff

### Lane

- lane name: `lane/integration-natural-language-preview`
- branch: `main` checkpoint slice
- canonical worktree: `C:\Users\PC\.openclaw\workspace\aifut-core`
- canonical head at kickoff: `4723156`
- owner/session: Minh / OpenClaw webchat

### Goal and customer benefit

- Goal: provide an interactive, preview-only dashboard UI that turns a customer's natural-language integration intent into a reviewable setup draft.
- Customer benefit: non-technical users can describe the integration they want, inspect the interpreted setup contract, and correct their intent before any activation or external action is possible.

### Allowed paths

- `apps/web/app/dashboard/integration-setup-draft-preview.tsx`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/scripts/verify-local-runtime.js`

### No-touch paths and behavior

- Every path not listed under Allowed paths is out of scope for the product checkpoint.
- Do not change API contract semantics, backend services, Prisma schema or migrations, auth/access-policy primitives, tenant resolution, orchestration persistence, connector activation, credential storage, external dispatch, or external side effects.
- Do not introduce create, update, activate, execute, persist, or dispatch behavior from the preview UI.
- This lane artifact records ownership and proof only; it does not grant ownership of another lane's files.

### Contract inputs

- A user-authored natural-language integration request entered from the dashboard.
- The existing authenticated dashboard/API context and current `POST /integrations/ai-draft` request contract.
- Existing preview response data, including `setupExecutionArtifact` and its `consumerContract`; no new backend fields are assumed by this lane.

### Contract outputs

- An interactive draft preview rendered in `integration-setup-draft-preview.tsx` and composed by `page.tsx`.
- A human-readable projection of the interpreted integration intent, setup steps, review boundaries, and handoff information supplied by the existing draft response.
- Explicit preview-only state and messaging: no setup key is invented, no activation is enabled, and no persistence, connector dispatch, or external action occurs.
- Unified local-runtime verification coverage in `scripts/verify-local-runtime.js` for the preview route and required local services.

### Dependency assumptions

- Depends on the existing `POST /integrations/ai-draft` contract and its `setupExecutionArtifact.consumerContract` projection.
- Depends on the existing dashboard authentication and API request helpers.
- Blocked if the existing draft response cannot be rendered without changing backend contract semantics.
- Downstream activation and orchestration lanes may consume reviewed artifacts later, but this checkpoint cannot perform that handoff as an action.

## Checkpoint

### Smallest safe slice

- One setup UX contract slice: add the interactive natural-language draft preview, wire it into the dashboard, and extend the unified runtime verifier only far enough to prove the preview surface and current local service topology.

### Required checkpoint record

- connector/setup scope: preview and review of an integration setup draft only
- route changed: `/dashboard`
- API dependency used: existing `POST /integrations/ai-draft`
- contract dependency: existing `setupExecutionArtifact.consumerContract`; no backend contract change
- local rendering proof: dashboard serves on `127.0.0.1:3000` and exposes the preview flow without activation controls

### Verification

- `npm run check-types --workspace apps/web`
- `npm run build --workspace apps/web`
- `npm run local:verify-runtime`
- Manual dashboard proof that a natural-language request produces a reviewable preview and cannot activate, persist, dispatch, or execute an integration.
- Baseline local runtime proof recorded for this checkpoint:
  - PostgreSQL is listening on `5432`.
  - API is serving on `127.0.0.1:3002`.
  - Web is serving on `127.0.0.1:3000`.
  - The unified verifier reports `ok`.

### Collision rules

- Only the named owner may edit the Allowed paths during this checkpoint.
- Before editing `page.tsx` or `scripts/verify-local-runtime.js`, re-read current contents and preserve unrelated work already present.
- Stop and reconcile if another lane changes an Allowed path, the draft response shape, dashboard request helpers, runtime ports, or verifier conventions after canonical head `4723156`.
- Do not widen scope to repair upstream contracts. Record the blocker and hand it to the owning lane.
- Keep the preview component isolated so dashboard convergence requires a small composition change rather than a broad page rewrite.

### Convergence criteria

- The three Allowed paths contain the complete product slice; no other product file is changed.
- A natural-language integration request can be submitted and rendered as an understandable preview on `/dashboard`.
- The UI clearly communicates preview-only status and exposes no activation or side-effecting control.
- Existing API contract semantics remain unchanged.
- Web type checking and production build pass.
- PostgreSQL `5432`, API `3002`, and Web `3000` are proven together by the unified verifier with an `ok` result.
- The checkpoint is ready for review or handoff as one bounded setup UX contract slice with collision notes resolved.

### Hard no-touch zone check

- touching restricted zones? no
- temporarily locked shared zone: none

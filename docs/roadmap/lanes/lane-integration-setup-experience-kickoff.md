# Lane kickoff

## Lane

- lane name: lane/integration-setup-experience
- branch: main checkpoint slice
- worktree path: C:\Users\PC\.openclaw\workspace\aifut-core
- owner/session: Minh / OpenClaw webchat

## Goal

- help non-technical users turn natural-language app integration intent into reviewable setup execution artifacts without needing deep technical knowledge

## In-scope file zones

- apps/api/src/integration-ai-drafting.service.ts
- apps/api/src/integration-ai-drafting.service.spec.ts
- docs/api and status/memory mirrors when the setup contract changes

## Out-of-scope / do not touch

- Prisma schema or migrations
- shared auth/access-policy primitives
- connector activation or external dispatch
- broad controller rewrites

## Current dependency assumptions

- depends on: existing connector registry, integration setup-session, diagnostics, and review-activation surfaces
- blocked by: none for preview-only drafting artifacts
- downstream lanes affected: operator-ui can render the artifact later; local-runtime lane verifies endpoint truth

## Local runtime plan

- ports used: API 127.0.0.1:3002, Web 127.0.0.1:3000 when dashboard proof is needed
- services needed: local PostgreSQL for runtime verification; API production build for endpoint proof
- verification commands:
  - npm test -- --runInBand integration-ai-drafting.service.spec.ts
  - npm run build --workspace apps/api
  - npm test -- --runInBand
  - npm run local:verify-runtime --workspace apps/api

## First checkpoint target

- add `setupExecutionArtifact` to `POST /integrations/ai-draft` output so a natural-language request produces a bounded, human-reviewable execution checklist with data contract, review boundaries, and handoff endpoints

## Hard no-touch zone check

- touching restricted zones? no
- if yes, which zone is temporarily locked: n/a

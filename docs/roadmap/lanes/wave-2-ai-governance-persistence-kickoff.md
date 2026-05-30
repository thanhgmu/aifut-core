# Wave 2 lane kickoff — ai-governance-persistence

## Lane
- lane name: `lane/ai-governance-persistence`
- branch: `main` (checkpoint landed in canonical HQ before splitting further)
- worktree path: `C:\Users\PC\.openclaw\workspace\aifut-core`
- owner/session: Minh / main session

## Goal
- extend the existing AI governance foundation from normalized record builders into persistence-backed policy and ledger wiring

## In-scope file zones
- `apps/api/src/ai-governance.module.ts`
- `apps/api/src/ai-governance-persistence.service.ts`
- `apps/api/src/ai-token-governance.service.ts`
- `apps/api/prisma/schema.prisma`
- future AI governance DTO/service files for policy and usage persistence

## Out-of-scope / do not touch
- broad auth/context rewrites
- unrelated orchestration DTO churn
- operator UI surfaces unless required for verification

## Current dependency assumptions
- depends on: current `AiTokenGovernanceService` foundation and canonical Prisma module wiring
- blocked by: no blocker yet, but Prisma shared-zone ownership must be kept narrow when persistence models are introduced
- downstream lanes affected: orchestration runtime-binding, operator governance surfaces, tenant package/commercial policy visibility

## Local runtime plan
- ports used: API `127.0.0.1:3002`
- services needed: API build/test lane only for the next checkpoint
- verification commands:
  - `npm run test --workspace apps/api -- ai-governance-persistence.service.spec.ts ai-token-governance.service.spec.ts --runInBand`
  - `npm run build --workspace apps/api`
  - `npm run test --workspace apps/api -- --runInBand`

## First checkpoint target
- landed: add persistence-facing normalized routing-policy, budget-policy, and usage-event record builders with focused tests
- next smallest mergeable slice: add persistence-ready policy/ledger model shapes and narrow resolution semantics without broad gateway fan-out yet

## Hard no-touch zone check
- touching restricted zones? yes
- if yes, which zone is temporarily locked: Prisma schema / shared persistence truth when the next checkpoint adds AI governance models

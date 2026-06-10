# Lane kickoff

## Lane

- lane name: lane/backup-center-foundation
- branch: main checkpoint slice
- worktree path: C:\Users\PC\.openclaw\workspace\aifut-core
- owner/session: Minh / OpenClaw webchat

## Goal

- help users and operators understand backup/restore readiness through safe preview-only and read-only surfaces before any persistence, migration, restore execution, or external write path is opened

## In-scope file zones

- apps/api/src/infrastructure-profile.service.ts
- apps/api/src/infrastructure-profile.service.spec.ts
- apps/web/app/dashboard/backup-setup-review-preview.tsx
- docs/roadmap/lanes/** for lane continuity artifacts
- status/memory mirrors when the backup-readiness contract changes

## Out-of-scope / do not touch

- Prisma schema or migrations
- auth/access-policy core
- credential storage
- restore execution
- external cloud write adapters
- broad dashboard rewrites outside the Backup Center surface

## Current dependency assumptions

- depends on: existing `GET /integrations/backup-readiness`, preview-only backup setup review surfaces, and current dashboard activation checklist rendering
- blocked by: none for read-only/operator-facing checkpoints
- downstream lanes affected: operator-ui consumes the truth surface directly; local-runtime lane verifies local API/Web proof; persistence/write-zone lanes must remain serialized later

## Local runtime plan

- ports used: API 127.0.0.1:3002, Web 127.0.0.1:3000, PostgreSQL 5432
- services needed: local PostgreSQL plus API/Web production builds for runtime proof
- verification commands:
  - npm run test --workspace apps/api -- infrastructure-profile.service.spec.ts --runInBand
  - npm run test --workspace apps/api -- --runInBand
  - npm run build --workspace apps/api
  - npm run check-types --workspace apps/web
  - npm run build --workspace apps/web
  - npm run local:verify-runtime --workspace apps/api

## First checkpoint target

- expose a phase-aware blocker/readiness surface so operators can see which preview evidence, review checks, and gate families are keeping each activation phase blocked without opening any write-zone work

## Hard no-touch zone check

- touching restricted zones? no
- if yes, which zone is temporarily locked: n/a

# Lane kickoff

## Lane
- lane name: lane/kernel-auth-runtime
- branch: lane/kernel-auth-runtime
- worktree path: C:\Users\PC\.openclaw\workspace\aifut-core-lane-kernel
- owner/session: pending subagent

## Goal
- strengthen the backend control-plane core without destabilizing other lanes

## In-scope file zones
- apps/api/src/auth*
- apps/api/src/actor-context*
- apps/api/src/access-policy*
- apps/api/src/memberships*
- apps/api/src/orchestration*

## Out-of-scope / do not touch
- dashboard/foundation UI except minimal API-truth notes
- broad connector/setup semantics unless strictly required by kernel truth

## Current dependency assumptions
- depends on: current main branch backend truth
- blocked by: none at kickoff
- downstream lanes affected: operator-ui-control-plane, integration-setup-experience

## Local runtime plan
- ports used: API 127.0.0.1:3002
- services needed: local API, database
- verification commands:
  - npm run check-types
  - local API /health
  - targeted verification for touched auth/actor/runtime slice

## First checkpoint target
- actor-context + auth/access-policy checkpoint inventory and the smallest safe kernel slice to harden next

## Hard no-touch zone check
- touching restricted zones? yes
- if yes, which zone is temporarily locked: actor-context core / access-policy core only within the smallest declared slice

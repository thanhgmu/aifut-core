# Lane kickoff

## Lane
- lane name: lane/local-dev-reliability
- branch: lane/local-dev-reliability
- worktree path: C:\Users\PC\.openclaw\workspace\aifut-core-lane-dev
- owner/session: pending subagent

## Goal
- reduce local runtime friction and turn repeated local validation into reusable standard steps

## In-scope file zones
- README.md
- .env.example
- apps/api/.env.example
- lightweight local verification/runbook/scripts

## Out-of-scope / do not touch
- product semantics
- kernel contract logic
- UI product features except where needed to document/verify runtime behavior

## Current dependency assumptions
- depends on: current local port convention settled on main
- blocked by: none at kickoff
- downstream lanes affected: all active lanes benefit

## Local runtime plan
- ports used: web 3000, docs 3001, API 127.0.0.1:3002
- services needed: local API, optional web/docs
- verification commands:
  - npm run check-types
  - local API /health
  - any new startup/verification helper should be exercised once

## First checkpoint target
- local startup/verification reliability v1 beyond current env docs, preferably a reusable verification script or runbook improvement

## Hard no-touch zone check
- touching restricted zones? no
- if yes, which zone is temporarily locked: n/a

# Lane kickoff

## Lane
- lane name: lane/operator-ui-control-plane
- branch: lane/operator-ui-control-plane
- worktree path: C:\Users\PC\.openclaw\workspace\aifut-core-lane-operator
- owner/session: pending subagent

## Goal
- extend visible operator control-plane proof quickly without inventing backend truth

## In-scope file zones
- apps/web/app/dashboard/**
- apps/web/app/foundation/**
- nearby UI composition files required by these routes

## Out-of-scope / do not touch
- kernel auth/runtime contract redefinition
- setup semantics owned by integration lane beyond consuming current API truth

## Current dependency assumptions
- depends on: stable current API truth from main
- blocked by: none at kickoff
- downstream lanes affected: none, this is mostly downstream consumer work

## Local runtime plan
- ports used: web 3000, API 127.0.0.1:3002
- services needed: local web + API
- verification commands:
  - npm run check-types
  - route-level local verification for dashboard/foundation surfaces

## First checkpoint target
- operator control-plane preview v1, extending dashboard/foundation surfaces with live cards, lane awareness, and current API truth

## Hard no-touch zone check
- touching restricted zones? no
- if yes, which zone is temporarily locked: n/a

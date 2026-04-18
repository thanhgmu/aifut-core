# API Core Foundation Backlog

## Goal
Move the API from capability-demo status to a real platform-kernel foundation.

## Current state
Existing foundations:
- health endpoint
- tenancy summary/roadmap endpoint
- globalization roadmap endpoint
- orchestration roadmap endpoint
- Prisma connectivity baseline

Missing foundations:
- authentication
- actor/session context
- tenant memberships and roles
- workspace-scoped authorization
- integration registry
- audit events
- entitlements / plan boundaries

## Priority order

### P0 — Source-of-truth alignment
- [ ] Identify authoritative repo/deploy path.
- [ ] Document local/workspace/VPS relationship.
- [ ] Stop silent drift between snapshots.

### P1 — Domain model expansion
- [ ] Add `Membership` model.
- [ ] Add `Role` or role enum strategy.
- [ ] Add `Session` model.
- [ ] Add `AuditEvent` model.
- [ ] Add `IntegrationConnection` model.
- [ ] Add `Entitlement` / plan boundary model.

### P2 — Auth and actor context
- [x] Add `AuthModule`.
- [ ] Add login/session issuance flow.
- [x] Add actor extraction middleware/guard.
- [x] Add tenant resolution strategy.
- [x] Add `/auth/me` and current-context endpoints.

### P3 — Workspace and policy boundaries
- [x] Add membership-aware tenant access checks.
- [x] Add workspace selection / current workspace contract.
- [x] Add policy checks for operator vs tenant user.

### P4 — Integration substrate
- [x] Add connector registry contract.
- [x] Add connection instance model.
- [x] Add domain routing policy surface.
- [x] Add storage routing policy surface.
- [ ] Add credential reference abstraction.
- [ ] Add integration health/verification path.
- [x] Add mapping profile + sync policy surfaces.
- [x] Add request-level access policy to integration write paths.

### P4A — Infrastructure affiliate and token governance
- [ ] Add affiliate-aware domain/hosting/VPS offer model.
- [ ] Add tenant domain provisioning reference model.
- [ ] Add token pool / quota / usage model for platform-provided APIs.
- [ ] Add bring-your-own-API credential policy boundaries.
- [ ] Add upgrade surfaces for token top-up and package exposure.

### P5 — Observability and self-healing
- [ ] Version endpoint.
- [ ] Readiness vs liveness distinction.
- [ ] Drift/diagnostic hooks.
- [ ] Structured audit trail.

## Implementation rule
Prefer a modular monolith with explicit module boundaries over premature service fragmentation.

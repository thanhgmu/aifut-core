# AIFUT Core Architecture

## Current Direction
Model C SaaS/operator stack.

## Current State
The backend API is now running on the VPS and provides a tenant-aware control-plane MVP read surface.

## Current Core Schema
- User
- Tenant
- Membership
- Workspace
- AuditLog

## Current Principles
- multi-tenant first
- modular monolith first
- single Postgres first
- deploy-first, then expand
- control-plane before product modules
- auth later, dev context now

## Current Development Mode
The API currently resolves request context from development headers:
- x-dev-user-email
- x-tenant-slug

This enables fast iteration on tenant-aware backend flows before introducing full authentication.

## Current API Surface
- GET /health
- GET /me
- GET /tenants/current
- GET /tenants/current/summary
- GET /workspaces
- GET /tenants/current/members
- GET /audit-logs

## What Exists Today
- API runtime on VPS
- Prisma + Postgres integration
- Seeded tenant, user, membership, workspace
- Seeded sample audit logs
- Tenant-aware request context in development mode
- Control-plane read endpoints for current tenant operations

## Next Phase
1. Add controlled write endpoints
2. Add role guard / authorization checks
3. Introduce real authentication
4. Expand tenant admin APIs
5. Add operator/admin UI on top of the API

## Near-Term Backend Priorities
1. POST /workspaces
2. Role guard completion
3. Auth skeleton
4. Better error handling and validation
5. Additional tenant-admin endpoints as needed

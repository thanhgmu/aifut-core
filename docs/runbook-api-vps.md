# API VPS Runbook

## Paths
- Repo: /opt/aifut-core
- API app: /opt/aifut-core/apps/api
- Env file: /opt/aifut-core/apps/api/.env

## Runtime
Run from:

```bash
cd /opt/aifut-core/apps/api
npm run start:dev
```

Health check:

```bash
curl http://localhost:4000/health
```

## Prisma
Run from:

```bash
cd /opt/aifut-core/apps/api
npx prisma generate
npx prisma db push
```

If the dev database needs a reset:

```bash
cd /opt/aifut-core/apps/api
npx prisma migrate reset --force
```

## Seed data
Run from:

```bash
cd /opt/aifut-core/apps/api
npm run seed
```

Seed creates or updates:
- Tenant: AIFUT Core
- User: admin@aifut.local
- Membership: owner
- Workspace: Default Workspace
- Sample audit logs

## Dev request context
Current development mode uses request headers:
- x-dev-user-email
- x-tenant-slug

Example:

```bash
curl -H "x-dev-user-email: admin@aifut.local" -H "x-tenant-slug: aifut-core" http://localhost:4000/me
```

## Current endpoints
- GET /health
- GET /me
- GET /tenants/current
- GET /tenants/current/summary
- GET /workspaces
- GET /tenants/current/members
- GET /audit-logs

## Current status
- API is running on port 4000 in dev mode
- Database connectivity is working
- Multi-tenant request context is working in development mode
- Control-plane read endpoints are available

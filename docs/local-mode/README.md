# AIFUT Local SQLite Mode

## Overview
Run AIFUT entirely offline with SQLite — no PostgreSQL dependency.
Perfect for:
- Local business single-tenant deployment
- Demo/trial setup
- Development without PostgreSQL
- Local license packaging ($120-180 one-time sale)

## Quick Start

```bash
# 1. Setup environment
cp apps/api/.env.local.example apps/api/.env

# 2. Set env vars (PowerShell)
$env:IS_LOCAL="true"
$env:DATABASE_URL="file:./aifut-local.db"

# 3. Generate Prisma client + create database
cd apps/api
npx prisma generate --schema=prisma/schema.local.prisma
npx prisma db push --schema=prisma/schema.local.prisma --accept-data-loss

# 4. Seed default data
npx ts-node src/local-mode/local-seed.ts

# 5. Start API
npm run start:local
```

## Architecture

```
┌─────────────────────────────┐
│      AIFUT API (NestJS)     │
│  ┌───────────────────────┐  │
│  │  LocalModeModule      │  │
│  │  - Resolves to local  │  │
│  │  - Single tenant mode │  │
│  └───────────────────────┘  │
│          │                  │
│  ┌───────▼──────────┐       │
│  │  SQLite via Prisma │      │
│  │  (schema.local)    │      │
│  └───────────────────┘       │
│          │                   │
│  ┌───────▼──────────┐       │
│  │  Cloudflare Sync │(opt)  │
│  │  Workers Bridge  │       │
│  └───────────────────┘       │
└─────────────────────────────┘
```

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `IS_LOCAL` | `false` | Enable local mode |
| `DATABASE_URL` | `file:./aifut-local.db` | SQLite file path |
| `LOCAL_MULTI_TENANT` | `false` | Allow multiple tenants in local mode |
| `DEFAULT_TENANT_SLUG` | `local` | Default tenant slug |
| `LOCAL_ADMIN_EMAIL` | `admin@local.aifut.app` | Auto-seeded admin |
| `LOCAL_ADMIN_PASSWORD` | (unset) | Auto-seeded password |
| `SYNC_ENABLED` | `false` | Enable Cloudflare Workers sync |

## Migration from PostgreSQL

To export PostgreSQL data and import to SQLite:
1. Use `pg_dump` to export
2. Use `sqlite3` to import (with schema mapping)
3. Run `local-seed.ts` to ensure required data exists

## License Packaging

For local license distribution ($120-180 one-time):
1. Package the entire monorepo with SQLite baked in
2. Pre-seed with default tenant and admin account
3. Include setup script (Windows installer or Docker)
4. Option to enable cloud sync for backups

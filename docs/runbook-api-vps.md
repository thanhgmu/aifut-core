# API VPS Runbook

## Path
- Repo: /opt/aifut-core
- API app: /opt/aifut-core/apps/api

## Environment
- `.env` is located at: `/opt/aifut-core/apps/api/.env`
- Expected keys:
  - `DATABASE_URL`
  - `PORT`

## Prisma
From `/opt/aifut-core/apps/api`:

```bash
npx prisma generate
npx prisma migrate status

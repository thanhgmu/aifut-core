# Current State — 2026-04-07

## Public endpoints
- Frontend: https://app.aifut.net
- API: https://api.aifut.net
- API health: https://api.aifut.net/health

## Runtime
- API process: pm2 / aifut-api
- Web process: pm2 / aifut-web
- Nginx active and serving HTTPS
- API internal bind: http://127.0.0.1:4000
- Web internal bind: http://127.0.0.1:3000

## Backend verified
- Prisma connects successfully to local PostgreSQL on VPS
- `npm run seed` works in `/opt/aifut-core/apps/api`
- Dev context headers:
  - x-dev-user-email
  - x-tenant-slug
- Verified datasets:
  - admin@aifut.local / aifut-core
  - admin@aifut.net / aifut-demo

## Important gap
- `prisma/migrations` is missing from source control
- `npx prisma migrate status` says:
  - no migration found in prisma/migrations
  - database schema is up to date
- This means the live DB currently matches schema, but environment bootstrap is not yet fully reproducible from source alone

## Recommended next technical step
- Create a proper migration baseline in a separate careful session
- Do not change live DB casually before that step is planned

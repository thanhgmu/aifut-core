# AIFUT API VPS Runbook

## Current state
- API path: /opt/aifut-core/apps/api
- PM2 process: aifut-api
- Internal bind: http://127.0.0.1:4000
- Public URL: https://api.aifut.net
- Health: https://api.aifut.net/health

## PM2
pm2 list
pm2 logs aifut-api --lines 100
pm2 restart aifut-api
pm2 save

## Nginx
nginx -t
systemctl reload nginx
systemctl status nginx --no-pager

## Health checks
curl https://api.aifut.net/health
curl http://localhost:4000/health

## Dev context headers
x-dev-user-email
x-tenant-slug

## Dataset 1
- user: admin@aifut.local
- tenant: aifut-core

curl -H "x-dev-user-email: admin@aifut.local" -H "x-tenant-slug: aifut-core" https://api.aifut.net/me
curl -H "x-dev-user-email: admin@aifut.local" -H "x-tenant-slug: aifut-core" https://api.aifut.net/tenants/current
curl -H "x-dev-user-email: admin@aifut.local" -H "x-tenant-slug: aifut-core" https://api.aifut.net/workspaces

## Dataset 2
- user: admin@aifut.net
- tenant: aifut-demo

curl -H "x-dev-user-email: admin@aifut.net" -H "x-tenant-slug: aifut-demo" https://api.aifut.net/me
curl -H "x-dev-user-email: admin@aifut.net" -H "x-tenant-slug: aifut-demo" https://api.aifut.net/tenants/current
curl -H "x-dev-user-email: admin@aifut.net" -H "x-tenant-slug: aifut-demo" https://api.aifut.net/workspaces

## Known gaps
- standardize Prisma migrations
- add official seed script
- document bootstrap/deploy flow
- productionize auth/context
- verify frontend app.aifut.net

# AIFUT Core

AIFUT Core is the foundation for a Model C SaaS/operator-stack platform.

## Current bootstrap
- Turbo monorepo
- Next.js web app
- NestJS API app
- docs architecture + roadmap
- Docker base for PostgreSQL and Redis

## Local development
### Install
\\\ash
npm install
\\\

### Run web
\\\ash
npm run dev
\\\

### Run API
\\\ash
npm --prefix apps/api run start:dev
\\\

### Infra
\\\ash
docker compose -f infra/docker/docker-compose.yml up -d
\\\

## Next steps
- tenant model
- auth foundation
- shared config/contracts
- deployment pipeline

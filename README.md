# AIFUT Core

AIFUT Core is the foundation for a **Model C SaaS/operator-stack platform** built for extreme leverage: a very small operator team should be able to run a very large multi-tenant business.

## Product direction
AIFUT is being built as a **platform kernel first**.

That means the long-term core should own:
- identity, actor context, and tenant memberships
- workspace and domain/subdomain scoping
- data sovereignty boundaries
- integration and workflow contracts
- event, audit, and analytics backbone
- marketplace and monetization boundaries

It should **not** rely on legacy third-party business systems as the platform nucleus.

See:
- `docs/architecture/platform-blueprint.md`
- `docs/roadmap/execution-plan.md`
- `docs/architecture/decisions/0001-platform-kernel-first.md`

## Current bootstrap
- Turbo monorepo
- Next.js web app
- NestJS API app
- early capability modules for tenancy / globalization / orchestration
- architecture + roadmap docs in-repo
- Docker base for PostgreSQL and Redis

## Local development
### Install
```bash
npm install
```

### Run web
```bash
npm run dev
```

### Run API
```bash
npm --prefix apps/api run start:dev
```

### Infra
```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

## Near-term execution priorities
1. Align the authoritative codebase and runtime/deploy target.
2. Expand the domain model for memberships, sessions, integrations, entitlements, and audit events.
3. Add an auth foundation and actor-context resolution to the API.
4. Introduce shared contracts for tenant, actor, and event primitives.
5. Prepare the platform control plane for later marketplace, AI, and operator-stack features.

## Build philosophy
- modular monolith first
- tenant-native by default
- data-sovereign by design
- integration-first, not integration-fragile
- operator-efficient from day one

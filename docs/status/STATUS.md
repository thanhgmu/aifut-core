# AIFUT Status

## Current direction
AIFUT is actively being built as a Model C SaaS/operator-stack platform kernel, not as a CRM or ecommerce monolith.

Current architectural emphasis:
- tenant and workspace context
- integration control plane
- domain and storage routing
- data sovereignty readiness
- operator-efficient observability
- future hosting-affiliate and token-governance boundaries

## Latest confirmed milestones
- `0b80bc1` docs(architecture): lock control-plane topology model
- `a7a6fea` feat(entitlements): add admin package builder contract
- `fcd5ac7` feat(entitlements): sync package assignments to entitlements
- `a65c81c` feat(entitlements): persist package assignments
- `9e8dd34` feat(entitlements): add plan and package option contracts
- `31370be` feat(entitlements): define package option commercialization
- `ace5d6b` docs: lock workspace repo as source of truth
- `0f08362` feat: persist integration connection setup foundation
- `20835a7` feat: add domain and storage routing foundation

## Current API foundation surfaces
- health and root platform status
- tenancy summary and roadmap
- auth context foundation
- current actor and access boundary endpoints
- membership resolution foundation
- request-level access-policy guard foundation
- guarded integration, entitlement, and audit write paths
- policy scopes now distinguish tenant-admin, operator-control, and workspace-member actions
- service-layer access invariants now backstop guarded write paths
- connector registry and integration templates
- integration infrastructure profile
- connection instance persistence foundation
- domain routing foundation
- storage routing foundation
- package option commercialization and entitlement sync foundation
- globalization, orchestration, audit, entitlements capability roadmaps

## Build status
- Prisma generate: passing
- API build: passing as of latest local verification

## Current best next steps
1. Turn tenancy, memberships, and storage topology from read-model foundation into tenant operations, starting with tenant/workspace provisioning and domain-policy management surfaces.
2. Add credential reference abstraction plus integration verification/health diagnostics so connector setup can move from design-time to runtime-safe operation.
3. Add hosting-affiliate domain/VPS offer foundation.
4. Add token pool, quota, and bring-your-own-API governance foundation.
5. Keep NexovaFlow aligned as a tenant-app connector pattern, not a control-plane dependency.

## Notes
- Authoritative editable repo: `C:\Users\PC\.openclaw\workspace\aifut-core`
- Latest verified local HEAD: `0b80bc1` (`docs(architecture): lock control-plane topology model`).
- Repo is currently clean, which makes it safe to start the next backend slice without carrying hidden drift.
- Older paths should not be treated as primary unless explicitly re-aligned.

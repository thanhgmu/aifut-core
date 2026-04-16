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
- `ace5d6b` docs: lock workspace repo as source of truth
- `0f08362` feat: persist integration connection setup foundation
- `20835a7` feat: add domain and storage routing foundation

## Current API foundation surfaces
- health and root platform status
- tenancy summary and roadmap
- auth context foundation
- membership resolution foundation
- connector registry and integration templates
- integration infrastructure profile
- connection instance persistence foundation
- domain routing foundation
- storage routing foundation
- globalization, orchestration, audit, entitlements capability roadmaps

## Build status
- Prisma generate: passing
- API build: passing as of latest local verification

## Current best next steps
1. Commit the remaining kernel foundation modules and architecture docs in clean slices.
2. Add hosting-affiliate domain/VPS offer foundation.
3. Add token pool, quota, and bring-your-own-API governance foundation.
4. Add integration verification/health diagnostics.
5. Add audit writes and request-level actor guards.

## Notes
- Authoritative editable repo: `C:\Users\PC\.openclaw\workspace\aifut-core`
- Older paths should not be treated as primary unless explicitly re-aligned.

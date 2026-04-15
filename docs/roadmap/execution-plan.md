# AIFUT Execution Plan

## Mission
Ship AIFUT as a Model C SaaS/operator-stack foundation that can scale into a very large multi-tenant platform while staying operationally lean.

## Current reality
- Monorepo exists with `apps/web`, `apps/api`, and shared `packages/*`.
- API baseline now includes early working platform-kernel foundations for tenancy, memberships, integrations, connectors, globalization, orchestration, auth, audit, and entitlements.
- The authoritative active repo for development is `C:\Users\PC\.openclaw\workspace\aifut-core`.
- Runtime/source-of-truth alignment between workspace and VPS still needs to be cleaned up, but workspace is the canonical build surface.

## Phase 0 — Alignment and control
Goal: remove ambiguity before deeper implementation.

Tasks:
- [x] Confirm the authoritative repo snapshot for active development.
- [ ] Confirm the authoritative deployment/runtime path.
- [ ] Record branch/commit/deploy flow in docs.
- [ ] Normalize workspace structure so local, workspace, and VPS copies are not drifting silently.

Definition of done:
- [x] There is one documented source-of-truth codebase.
- [ ] Deploy target and execution path are documented.

## Phase 1 — Platform kernel foundation
Goal: create the minimal durable platform core.

Tasks:
- [x] Expand Prisma schema for memberships, sessions, integrations, audit events, and entitlements.
- [x] Introduce auth module and actor context extraction.
- [x] Introduce tenant membership model.
- [ ] Add shared contracts package for actor/tenant/event primitives.
- [x] Add health/readiness/version endpoints.

Definition of done:
- A tenant-aware authenticated request can resolve actor + tenant + workspace context reliably.

## Phase 2 — Control plane and tenant operations
Goal: make tenant/workspace/domain operations real.

Tasks:
- [ ] Tenant CRUD and settings boundaries.
- [ ] Workspace CRUD and scoping.
- [ ] Subdomain/custom domain mapping model.
- [ ] Feature flags / entitlements by tenant plan.
- [ ] Audit log viewer and operator actions.

Definition of done:
- A tenant can be provisioned and managed with policy boundaries.

## Phase 3 — Integration and workflow substrate
Goal: make AIFUT useful as an operator stack.

Tasks:
- [x] Connector registry foundation.
- [ ] Connection instance persistence and mapping profiles.
- [ ] Credential reference vault abstraction.
- [ ] Event bus contracts.
- [ ] Workflow definitions and execution records.
- [ ] Natural-language command handoff design for orchestration.
- [x] Tenant infrastructure profile visibility for hosted vs hybrid/external-ready operation.

Definition of done:
- A tenant can connect at least one external system and run a tracked workflow.

## Phase 4 — Monetization and ecosystem
Goal: enable marketplace and commercial scaling.

Tasks:
- [ ] Product/solution/template listing model.
- [ ] Approval flow for marketplace publication.
- [ ] Plan/add-on/coupon primitives.
- [ ] Affiliate/reseller commission model.
- [ ] Demo/run-without-relogin flow.

Definition of done:
- A marketplace item can be published, entitled, and consumed within tenant boundaries.

## Phase 5 — Intelligence and operator leverage
Goal: make the platform increasingly self-optimizing.

Tasks:
- [ ] Event analytics pipeline.
- [ ] Behavior profile model.
- [ ] Automated routing/recommendation hooks.
- [ ] Diagnostic + auto-fix playbooks.
- [ ] Cost/performance/storage optimization loops.

Definition of done:
- The system can observe behavior, recommend action, and automate safe operator tasks.

## Working rules
- Prefer modular monolith over premature distributed sprawl.
- Keep control-plane and tenant data-plane concerns separate.
- Document decisions as architecture records when they affect long-term leverage.
- Build core differentiators first; integrate replaceable commodity tools second.

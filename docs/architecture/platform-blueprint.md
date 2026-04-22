# AIFUT Platform Blueprint

## Purpose
AIFUT is being built as a Model C SaaS/operator-stack platform designed for extreme leverage: a very small operator team should be able to run a very large multi-tenant business.

This platform should not be treated as a stitched-together collection of third-party apps. The core must be owned, modular, tenant-aware, and integration-first.

## Product thesis
AIFUT should become a platform kernel with four properties:
1. **Tenant-native**: every capability is scoped cleanly by tenant, workspace, user, and role.
2. **Data-sovereign**: each tenant can use platform-managed storage or bring its own infrastructure/storage endpoints.
3. **Composable**: workflows, apps, AI providers, billing, analytics, and marketplace offerings plug into the same core contracts.
4. **Operator-efficient**: observability, automation, self-healing, and low-friction administration are built in from the start.

## Core architecture layers

### 1. Identity and access layer
Responsibilities:
- users, operator accounts, tenant memberships
- authentication methods (passwordless, credentials, OAuth, API keys, service tokens)
- role-based and policy-based authorization
- session issuing, rotation, revocation, audit
- tenant resolution by subdomain, custom domain, or explicit workspace selection

Output contracts:
- `ActorContext`
- `TenantContext`
- `SessionContext`

### 2. Tenant and workspace layer
Responsibilities:
- tenant lifecycle
- workspace lifecycle
- domain/subdomain mapping
- custom domain and affiliate domain provisioning boundaries
- environment partitioning
- feature entitlements per tenant/workspace

Design rule:
No business module may bypass tenant/workspace scoping.

### 3. Data sovereignty and storage layer
Responsibilities:
- managed storage mode
- bring-your-own-database / bring-your-own-storage connectors
- backup and restore policies per tenant
- storage metering for billing
- sync/replication contracts when tenant data lives outside platform-managed infra
- explicit storage routing policy per tenant/workspace
- topology routing between shared, split, and dedicated tenant-app data layouts

Design rule:
AIFUT must support at least three tenant data topologies without changing the control-plane model:
1. shared runtime + shared database with tenant-scoped records
2. shared runtime + split database/schema per tenant
3. dedicated runtime + dedicated storage per tenant or reseller

### 3A. Infrastructure affiliate and token governance layer
Responsibilities:
- affiliate-aware domain / hosting / VPS offers inside AIFUT control plane
- provisioning references for platform-supplied or partner-supplied infrastructure
- token budget, quota, and upgrade surfaces for AIFUT-provided AI/API resources
- bring-your-own-API mode for tenant-owned credentials and billing bypass rules
- user-visible usage transparency for token consumption, remaining quota, and upgrade actions

Design rule:
AIFUT must separate platform-provided resources from tenant-provided resources so pricing, governance, and billing remain correct.

Design rule:
The platform must distinguish between control-plane metadata and tenant-owned data-plane assets.

### 4. Integration and orchestration layer
Responsibilities:
- app connectors
- OAuth/API credential vault references
- workflow engine integration (native and/or n8n-compatible)
- event ingestion and dispatch
- natural-language operator commands mapped to workflows and system actions

Design rule:
Integrations must be adapter-driven so external app upgrades do not break the platform core.

### 5. Marketplace and monetization layer
Responsibilities:
- productized workflows / templates / solutions / apps
- approvals and publishing workflow
- trial/demo execution paths
- subscription plans, add-ons, coupons, discounts
- reseller/affiliate commission graph

Design rule:
Marketplace items must run through platform identity and entitlement boundaries without re-login.

### 6. Analytics, memory, and personalization layer
Responsibilities:
- business events
- interaction events
- behavior profiles
- real-time routing and recommendations
- personalization policies
- operator dashboards and automated interventions

Design rule:
Behavioral intelligence should be policy-governed and privacy-aware, not an uncontrolled tracking dump.

### 7. Reliability and self-healing layer
Responsibilities:
- health checks
- drift detection
- automated diagnostics
- auto-fix playbooks where safe
- performance and storage optimization routines
- incident timeline and auditability

## Recommended build-vs-buy stance

### Build as first-party core
- identity and tenant model
- entitlements and policy engine
- storage sovereignty abstraction
- connector registry contracts
- event/audit model
- marketplace approval and execution boundaries
- analytics profile backbone

### Use adapters/integrations where helpful
- n8n for workflow visualization/execution
- external AI providers
- Perfex/NexovaFlow as tenant-app capability surfaces, never the platform kernel
- third-party affiliate system only as temporary or replaceable capability

### Do not use as long-term platform core
- Perfex CRM
- UltimatePOS

These can be integrated later as edge systems or migration sources, but they should not define the platform kernel.

## Immediate implementation priorities
1. Stabilize source of truth for the repo and runtime.
2. Introduce a proper domain model for identity, memberships, workspaces, integrations, and audit.
3. Add auth and actor-context foundation to the API.
4. Add shared contracts package for tenant, actor, entitlement, and event primitives.
5. Add a platform control-plane roadmap and execution checklist.

## Non-goals for the current phase
- building the full social/community stack immediately
- full affiliate depth before core identity/billing boundaries exist
- premature microservice fragmentation
- overcommitting to a legacy business app as the nucleus

## Architectural principle
AIFUT should be built as a **platform kernel first, applications second, marketplace third**.

That sequence maximizes long-term leverage, minimizes lock-in, and keeps the system operable by an extremely lean team.

## Tenant-app integration rule
When integrating a system such as NexovaFlow, AIFUT should borrow useful tenancy/runtime patterns from SaaS wrappers around that ecosystem, but AIFUT must still own:
- tenancy truth
- domain and topology routing
- package and token governance
- storage and backup policy
- connector capability contracts
- marketplace and affiliate commercialization boundaries

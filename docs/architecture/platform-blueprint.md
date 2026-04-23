# AIFUT Platform Blueprint

## Purpose
AIFUT is being built as a Model C SaaS/operator-stack platform designed for extreme leverage: a very small operator team, ideally even a single operator, should be able to run a very large multi-tenant business.

The core must become a platform operating system for business stacks, not a stitched-together collection of third-party apps.

## Product thesis
AIFUT should become a platform kernel with these defining properties:
1. **Tenant-native**: every capability is scoped cleanly by tenant, workspace, user, role, and package entitlement.
2. **Data-sovereign**: each tenant can use platform-managed storage/resources or bring its own storage, infrastructure, domains, and API credentials.
3. **Composable**: workflows, apps, AI providers, billing, analytics, marketplace items, and external services plug into the same core contracts.
4. **Operator-efficient**: observability, automation, self-healing, and low-friction administration are built in from the start.
5. **Non-technical by design**: the system must be operable not only by developers, but also by business users through guided UX and natural-language control.
6. **Secure, flexible, minimal**: strong security, high customizability, and system minimalism are design constraints, not later polish.

## North-star outcome
AIFUT should let a user or operator:
- run on a subdomain or custom domain
- keep data in shared, split, or dedicated topology
- back up by tenant, workspace, app, or user scope depending on policy
- connect existing external systems without rewriting everything
- display and control relevant applications across device types and across online or local environments
- orchestrate systems and workflows through natural language
- expose packaged solutions, templates, workflows, and services in a marketplace
- monetize software, setup, support, and service bundles with affiliate-aware economics
- observe business behavior and interaction behavior across the ecosystem in a privacy-aware way
- use AIFUT-provided AI/resources or bring their own infrastructure and credentials

## Core architecture layers

### 1. Identity and access layer
Responsibilities:
- users, operator accounts, tenant memberships
- authentication methods (passwordless, credentials, OAuth, API keys, service tokens)
- role-based and policy-based authorization
- session issuing, rotation, revocation, audit
- tenant resolution by subdomain, custom domain, or explicit workspace selection
- package-aware access boundaries

Output contracts:
- `ActorContext`
- `TenantContext`
- `SessionContext`
- `AccessPolicyContext`

### 2. Tenant, workspace, and domain layer
Responsibilities:
- tenant lifecycle
- workspace lifecycle
- domain/subdomain mapping
- custom domain verification and routing
- affiliate domain provisioning boundaries
- environment partitioning
- feature entitlements per tenant/workspace/package
- tenant app topology assignment

Design rule:
No business module may bypass tenant/workspace scoping.

### 3. Data sovereignty and storage layer
Responsibilities:
- managed storage mode
- bring-your-own-database / bring-your-own-storage connectors
- backup and restore policies per tenant, workspace, app, or user scope
- storage metering for billing when platform resources are used
- sync/replication contracts when tenant data lives outside platform-managed infra
- explicit storage routing policy per tenant/workspace
- topology routing between shared, split, and dedicated tenant-app data layouts

Design rule:
AIFUT must support at least three tenant data topologies without changing the control-plane model:
1. shared runtime + shared database with tenant-scoped records
2. shared runtime + split database/schema per tenant
3. dedicated runtime + dedicated storage per tenant or reseller

### 3A. Infrastructure affiliate and resource governance layer
Responsibilities:
- affiliate-aware domain / hosting / VPS / infrastructure offers inside AIFUT control plane
- provisioning references for platform-supplied or partner-supplied infrastructure
- package-governed permissions for external-service usage
- token budget, quota, and upgrade surfaces for AIFUT-provided AI/API resources
- bring-your-own-API mode for tenant-owned credentials and billing-bypass rules
- user-visible usage transparency for token consumption, remaining quota, and upgrade actions

Design rule:
AIFUT must separate platform-provided resources from tenant-provided resources so pricing, governance, and billing remain correct.

### 4. Integration and orchestration layer
Responsibilities:
- connector registry and capability contracts
- OAuth/API credential vault references
- workflow engine integration (native and/or n8n-compatible)
- event ingestion and dispatch
- command/action mapping
- natural-language operator commands mapped to workflows and system actions
- upgrade-safe adapter boundaries for external systems

Design rule:
Integrations must be adapter-driven so external app upgrades do not break the platform core.

### 5. Marketplace and monetization layer
Responsibilities:
- productized workflows / templates / solutions / apps
- approvals and publishing workflow
- trial/demo execution paths
- subscription plans, add-ons, coupons, discounts, optional package components
- reseller/affiliate commission graph
- marketplace onboarding for products, services, setup, support, and rentals

Design rule:
Marketplace items must run through platform identity and entitlement boundaries without re-login.

### 6. Analytics, behavior memory, and personalization layer
Responsibilities:
- business events
- interaction events
- behavior profiles
- real-time routing and recommendations
- personalization policies
- operator dashboards and automated interventions
- privacy-aware cross-system behavior aggregation

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

### 8. Experience surfaces layer
Responsibilities:
- operator control panel
- tenant/user control panel
- natural-language command window
- cross-channel chat control surfaces
- low-code / visual workflow surfaces
- non-technical integration wizards

Design rule:
Every important system capability should eventually have both a structured admin surface and a guided non-technical interaction path.

## Functional requirements now treated as architecture truths

### Data and storage truth
- Tenants may use platform-managed storage or tenant-owned storage/infrastructure.
- Data may be shared with the platform or remain externally stored with synchronized control-plane metadata.
- Backups must support tenant-scoped and finer-grained policy where practical.
- If AIFUT provides storage, that usage can be metered and priced.
- If the tenant brings its own storage or APIs, billing should not double-charge for those underlying resources.

### Domain and environment truth
- Tenants may use subdomains or full custom domains.
- AIFUT may also offer partner/affiliate-backed domains, hosting, and VPS resources.
- Domain and infrastructure offers must be visible and configurable inside AIFUT control surfaces.
- AIFUT should be able to connect to and surface applications that run in online environments or in local environments, as long as policy, routing, and connectivity requirements are satisfied.

### Device and surface truth
- AIFUT should be usable across device types and should be able to present or connect relevant application surfaces in a way appropriate to each device context.
- Multi-device support is part of the platform direction, not optional polish.

### Integration truth
- User-owned apps and external platforms must be able to connect without forcing platform rewrites.
- External system upgrades should not break the kernel or other tenants.
- AIFUT must support native connectors, generic REST/OAuth connectors, webhook/event bridges, and workflow bridges.

### AI and natural-language truth
- Users should be able to describe desired systems/workflows in natural language.
- AIFUT should progressively translate those prompts into connector setups, workflow drafts, mappings, and actions.
- AI usage from AIFUT-provided resources must be measurable, package-aware, and upgradeable.
- Tenant-owned AI credentials must also be supported.

### Commercialization truth
- Marketplace items may include apps, solutions, workflows, case-study templates, setup services, support packages, or rentals.
- Listing or package attachment should require platform approval/governance.
- Revenue-sharing may include platform commission and multi-level affiliate distribution.
- NexovaFlow automation capability may later be commercialized as an optional add-on/package component under AIFUT control.

### Analytics and community truth
- AIFUT is not only a transaction platform. It may evolve into a community and business interaction ecosystem.
- Behavior, interaction, and business signals across the ecosystem should feed privacy-aware analytics, personalization, recommendations, and automation.
- Ads or monetized recommendations, if used, should be policy-governed and contextually appropriate.

## Recommended build-vs-buy stance

### Build as first-party core
- identity and tenant model
- entitlements and policy engine
- storage sovereignty abstraction
- connector registry contracts
- event/audit model
- marketplace approval and execution boundaries
- analytics profile backbone
- natural-language control contracts
- package and resource governance

### Use adapters/integrations where helpful
- n8n for workflow visualization/execution
- external AI providers
- Perfex/NexovaFlow as tenant-app capability surfaces, never the platform kernel
- third-party affiliate system only as temporary or replaceable capability
- reference SaaS-style tenant modules only as pattern sources, not architecture owners

### Do not use as long-term platform core
- Perfex CRM
- UltimatePOS

These can be integrated later as edge systems, commercial accelerators, or migration sources, but they should not define the platform kernel.

## Immediate implementation priorities
1. Stabilize source of truth for the repo and runtime.
2. Implement tenant resolution, membership/role enforcement, and storage topology routing.
3. Model connector registry, connection instances, and credential references.
4. Add domain/infrastructure/resource-governance primitives.
5. Add package/entitlement boundaries for external resources and optional capabilities.
6. Add analytics and event primitives that can evolve into behavior intelligence.
7. Add operator-facing and non-technical integration surfaces incrementally.

## Non-goals for the current phase
- building the full social/community stack immediately
- full affiliate depth before core identity/billing boundaries exist
- premature microservice fragmentation
- overcommitting to a legacy business app as the nucleus
- trying to make NexovaFlow itself become the kernel

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
- observability and diagnostics
- natural-language orchestration contracts

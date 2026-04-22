# ADR 0003 — Control plane first, tenant apps second, multi-topology data routing always

## Status
Accepted

## Context
AIFUT is intended to become a Model C SaaS/operator-stack platform that can support:
- extremely lean operations
- tenant-aware control and monetization
- data sovereignty and bring-your-own-infrastructure options
- CRM, commerce, LMS, workflow, AI, messaging, analytics, and marketplace use cases
- non-technical integration UX
- upgrade-safe coexistence with third-party systems

The immediate practical temptation is to turn a third-party application such as NexovaFlow/Perfex into the de facto platform core because it already has business workflows and UI surfaces.

That would conflict with the long-term platform goals:
- tenant data may need to live on platform-managed storage, tenant-owned storage, or hybrid storage
- a tenant may need a shared runtime, split database, or dedicated runtime
- marketplace, package, token, billing, storage metering, and affiliate logic must remain consistent across many downstream systems
- user-owned systems must integrate without forcing platform-wide rewrites when they upgrade

## Decision
AIFUT will be built as a **control plane and platform kernel**.

Third-party systems, including NexovaFlow, Perfex, n8n, Affiliate Management System, UltimatePOS, and future user-owned apps, will be treated as:
- capability providers
- tenant apps
- workflow runtimes
- accelerator integrations

They must not become the commercial, identity, tenancy, or topology source of truth.

### AIFUT core must own
- tenant identity and workspace boundaries
- subdomain/custom-domain resolution
- package, add-on, coupon, discount, token, and billing truth
- connector registry and capability contracts
- credential-reference and sync-policy contracts
- storage topology and backup policy decisions
- observability, audit, health, and operator diagnostics
- marketplace approval, packaging, resale, and affiliate boundaries
- AI/native chat orchestration contracts

### Tenant app pattern
A tenant app such as NexovaFlow may run in one of three supported topologies:
1. **Shared runtime, shared database, tenant-scoped rows**
2. **Shared runtime, split database/schema per tenant**
3. **Dedicated runtime and dedicated storage for a tenant or reseller**

AIFUT must be able to route a tenant into the correct topology without changing the higher-level control-plane model.

### Data sovereignty rule
Tenant data may live in:
- AIFUT-managed infrastructure
- tenant-owned infrastructure
- hybrid topology where control-plane metadata stays in AIFUT while business data remains external

AIFUT must still preserve:
- synchronization capability
- backup policy clarity
- storage metering when platform resources are used
- billing bypass when the tenant brings its own infrastructure/resources

### Buy-vs-build rule
AIFUT should build first-party:
- kernel contracts
- tenancy and storage topology routing
- entitlements and monetization boundaries
- connector/control-plane semantics
- non-technical integration UX
- observability and diagnostics

AIFUT may buy or integrate:
- Perfex/NexovaFlow for CRM/operator capability surfaces
- n8n for workflow visualization/runtime
- affiliate engine as a replaceable revenue-sharing capability
- named connectors or accelerators where they shorten time-to-value without owning the kernel

## Immediate implementation consequences
1. The next load-bearing implementation priority remains:
   - tenant resolution
   - membership/role enforcement
   - storage topology routing
2. NexovaFlow integration work should align to the tenant-app pattern above, borrowing tenancy ideas from Perfex SaaS-style modules where useful, but not importing their ownership model as the AIFUT kernel.
3. The API and docs should explicitly model:
   - storage topology
   - tenant app topology
   - credential references
   - connection health
   - billing/resource governance
4. Non-technical integration UX must be treated as a core feature, not polish.

## Consequences
### Positive
- preserves AIFUT as the durable platform kernel
- keeps NexovaFlow and other systems upgrade-safe and replaceable
- supports shared, split, and dedicated tenant topologies from one architecture
- aligns directly with bring-your-own-data, bring-your-own-API, and sovereignty goals
- creates a reusable pattern for CRM, commerce, LMS, messaging, workflow, and AI integrations

### Negative
- increases early architecture and platform-modeling work
- delays the shortcut of turning one purchased system into the whole platform
- requires stronger routing, policy, and observability design up front

## Rationale
This is the optimal path because it preserves the original AIFUT objective: a single platform kernel that can operate many systems, many tenants, many data topologies, and many commercial models without collapsing into a brittle dependency on any one purchased application.

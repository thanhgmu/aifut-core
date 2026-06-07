# ADR 0004 — Expanded product constraints become architecture rules

## Status
Accepted

## Context
The AIFUT product direction has been expanded with more specific operational and commercial constraints. These include:
- subdomain and custom-domain support
- platform-managed or tenant-owned storage/infrastructure
- tenant-specific backup expectations
- user/admin configurable backup schedules for database, workflow, skill, plugin, add-on, application config, local targets, user-owned cloud targets such as Google Drive, and AIFUT-managed ecosystem backup targets
- natural-language system composition
- marketplace resale/rental/service commercialization
- affiliate-backed domain/hosting/infrastructure offers
- platform-provided and tenant-provided AI/API resource modes
- non-technical integration UX as a core product requirement
- strong security, flexibility/customizability, and minimalism as simultaneous design constraints
- cross-system analytics and behavior-aware personalization

These requirements are not isolated features. They affect kernel contracts and therefore must be captured as architecture rules.

## Decision
AIFUT will treat the expanded product direction as hard architectural input, not optional product backlog ideas.

### The kernel must explicitly support
- tenant resolution through subdomains and custom domains
- package-governed use of external services and platform resources
- platform-managed and bring-your-own storage / API / infrastructure modes
- backup policy and storage metering semantics
- scheduled backup and governed restore semantics across database, workflow, skill, plugin, add-on, app configuration, and app-specific ecosystem snapshots
- shared, split, and dedicated tenant-app topologies
- non-technical integration flows alongside advanced integration mode
- natural-language orchestration as a first-class experience surface
- privacy-aware event, analytics, and behavior-profile primitives
- commercialization of apps, workflows, services, and add-ons through platform approval boundaries

### Resource governance rule
AIFUT must distinguish between:
- AIFUT-provided resources, which may be metered, limited, surfaced, upgraded, and billed
- tenant-provided resources, which may still be governed by policy but should not incur duplicate underlying resource charges

### External-app rule
Every integrated business application, including NexovaFlow, must connect through AIFUT-owned contracts for:
- identity and tenancy mapping
- topology assignment
- connection health
- credential references
- entitlement and package checks
- analytics and audit events

### UX rule
The system should not assume technical skill. If an important capability can only be used through raw API or manual engineering work, the product direction is not yet satisfied.

## Consequences
### Positive
- keeps implementation aligned with the real business target
- prevents later architecture drift when product requirements resurface
- improves clarity on what must be owned by `aifut-core`

### Negative
- increases scope pressure on the kernel model early
- requires discipline to phase work without compromising architecture

## Rationale
The original AIFUT ambition is not to become one more SaaS app. It is to become a platform operating system that can coordinate business systems, infrastructure, AI resources, and commercialization flows for many different tenant situations. That requires treating the expanded requirement set as architecture truth now.

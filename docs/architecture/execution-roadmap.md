# AIFUT Execution Roadmap

## Purpose
This roadmap translates the AIFUT vision into build tracks that can be executed incrementally without losing the core architecture.

## Current baseline
Estimated overall project progress: roughly **22%**.

Interpretation:
- strategy and architecture direction are materially ahead of implementation
- connector proof exists through the NexovaFlow bridge milestone
- the load-bearing control-plane foundation is still early

## Non-negotiable architecture truths
- `aifut-core` is the only platform core.
- NexovaFlow/Perfex is a connector, tenant-app, and capability provider, not the kernel.
- The kernel must support shared, split, and dedicated tenant-app topology.
- Strong security, high flexibility/customizability, and minimalism are first-class design constraints.
- Web UI is HQ for strategy and `aifut-core`; Telegram/direct execution lanes may continue NexovaFlow field work, but must not bend core architecture.

## Build tracks

### Track 1. Identity, tenancy, and domain truth
Goal:
Create the source of truth for actor, tenant, workspace, domain, and package-aware access.

Near-term deliverables:
- tenant resolution by subdomain/custom domain
- membership and role model
- current actor/current access endpoints
- workspace-aware access policy boundaries
- domain mapping primitives

Why this is first:
Every other major feature depends on correct tenancy and access boundaries.

### Track 2. Storage sovereignty and topology routing
Goal:
Make shared, split, and dedicated topologies real in the control plane.

Near-term deliverables:
- storage routing policy model
- tenant-app topology model
- backup policy model
- resource ownership markers (platform-provided vs tenant-provided)
- billing bypass rules for tenant-owned infra

Why this is first-wave critical:
This is the architectural hinge for data sovereignty, backup, pricing, and safe external app integration.

### Track 3. Connector control plane
Goal:
Standardize how AIFUT connects to CRM, commerce, LMS, workflow, AI, messaging, and other systems.

Near-term deliverables:
- connector registry model
- connection instance model
- credential reference model
- verification/health endpoints
- mapping and sync policy model
- generic REST/OAuth connector profile

Why this matters:
Without this, AIFUT cannot become the operating system for external systems.

### Track 4. NexovaFlow adapter track
Goal:
Use NexovaFlow as the first serious tenant-app adapter, not as the platform core.

Near-term deliverables:
- normalize the bridge capability contract
- map NexovaFlow topology assumptions into AIFUT tenant-app topology
- define what AIFUT owns vs what NexovaFlow owns
- expose health/activity/status signals into the control plane
- design commercialization path for optional NexovaFlow automation capability

Guardrail:
Borrow patterns from Perfex SaaS modules where useful, but do not inherit their ownership model as kernel truth.

### Track 5. Package, billing, and resource governance
Goal:
Let AIFUT sell fixed plans and configurable options while governing platform-provided and tenant-provided resources cleanly.

Near-term deliverables:
- plan/add-on/option model
- package entitlement model
- token quota and upgrade surface model
- storage metering model
- coupon/discount/free-period model
- allow/deny policy for external-service classes

### Track 6. Integration UX for non-technical users
Goal:
Make integrations usable by people who are not strong in technology.

Near-term deliverables:
- connector wizard contract
- template-based integration flows
- AI-assisted configuration flow
- plain-language diagnostics model
- advanced mode for technical users

### Track 7. Analytics, behavior memory, and personalization
Goal:
Build the data spine for business insight, behavior analysis, and policy-governed personalization.

Near-term deliverables:
- normalized event taxonomy
- business and interaction event capture model
- behavior profile backbone
- privacy/policy boundaries for personalization
- operator-facing analytics foundations

### Track 8. Marketplace and affiliate commercialization
Goal:
Commercialize solutions, workflows, services, and apps on top of the kernel.

Near-term deliverables:
- submission/approval model
- listing model for apps/workflows/services
- demo/trial execution model
- commission graph model
- optional integration path with Affiliate Management System if it speeds delivery without owning the kernel

### Track 9. Reliability, auto-debug, and self-healing
Goal:
Enable a one-operator system to observe and repair itself where safe.

Near-term deliverables:
- connection health model
- system diagnostics model
- safe auto-fix playbook framework
- optimization surfaces for storage/performance/security

## Recommended sequencing now
1. Identity, tenancy, domain truth
2. Storage sovereignty and topology routing
3. Connector control plane foundations
4. NexovaFlow adapter normalization under the new model
5. Package/resource governance
6. Integration UX and AI-assisted setup
7. Analytics backbone
8. Marketplace/commercialization
9. Self-healing/auto-debug expansion

## Concrete next implementation push
The next load-bearing implementation push in code should prioritize:
1. tenant resolution
2. membership/roles
3. storage topology routing

Immediately after that:
4. connector registry + connection instance primitives
5. credential references + health status
6. NexovaFlow adapter alignment to the new control-plane model

## Buy / integrate recommendations right now
### Likely useful soon
- n8n as workflow runtime/visual layer
- existing NexovaFlow/Perfex estate as an adapter target
- Affiliate Management System only if it accelerates commission handling without becoming kernel truth

### Not required yet
- buying Perfex REST API or SaaS modules before the AIFUT-side control-plane contracts are modeled clearly

### Reference-only stance
- Perfex SaaS module may be studied for tenancy/runtime patterns relevant to the NexovaFlow adapter track
- it should not define AIFUT tenancy, billing, or topology ownership

## Definition of “still on the right path”
The project remains on the right path if:
- every major new capability strengthens `aifut-core` as control plane
- no purchased system becomes the de facto kernel
- data sovereignty and topology choices remain explicit
- non-technical integration UX keeps being treated as core product work
- commercialization stays attached to platform entitlements and policies

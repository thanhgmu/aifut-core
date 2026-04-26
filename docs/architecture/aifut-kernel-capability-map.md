# AIFUT Kernel Capability Map

## Why this exists
This document translates the expanded AIFUT product vision into an execution-safe kernel map so implementation stays aligned with the real target:
- start from Model C as a SaaS/operator stack
- keep `aifut-core` as the only platform kernel/control plane
- treat integrated business systems as capability providers, not architecture owners
- preserve a path to a very lean operator model without collapsing into a bundle of loosely managed apps

## Short answer
Yes, the target direction is feasible.
Yes, the current kernel-first direction is the correct one.
No, NexovaFlow should not become the core itself.
Yes, NexovaFlow can become a valuable integrated capability under AIFUT control.

## The governing rule
AIFUT must be built as:
1. **platform kernel first**
2. **tenant-app integration layer second**
3. **marketplace/commercial layer third**
4. **rich ecosystem/community layer after that**

If this order is reversed, the platform will drift into app-sprawl, fragile upgrades, and unclear ownership boundaries.

## What the kernel must own

### 1. Identity, tenancy, and policy truth
The kernel must own:
- tenant, workspace, user, membership, and role truth
- package and entitlement truth
- actor/session/access-policy context
- domain/subdomain/custom-domain routing
- approval boundaries for apps, workflows, services, and marketplace listings

This is what keeps every integrated system subordinate to AIFUT instead of the reverse.

### 2. Data sovereignty and storage topology truth
The kernel must own:
- shared / split / dedicated data topology rules
- storage routing policy
- platform-managed vs tenant-managed storage mode
- tenant/user backup policy and restore boundaries
- storage metering when AIFUT resources are used
- sync/replication contracts when data lives outside platform-managed infrastructure

This is the foundation for:
- local/VPS/user-owned data
- per-user backup
- avoid-double-charge resource governance
- online/local hybrid operation

### 3. Integration abstraction truth
Every external system must connect through AIFUT-owned contracts:
- connector
- provider
- credential reference
- sync policy
- event mapping
- action/command mapping
- health status
- capability contract
- diagnostics and repair visibility

This is how AIFUT can integrate CRM, ecommerce, LMS, ERP-light, messaging, AI, analytics, and workflow runtimes without becoming tightly coupled to any one of them.

### 4. Orchestration and natural-language control truth
The kernel must own:
- workflow intent model
- natural-language system composition contracts
- roadmap/diagram-to-system interpretation contracts
- parent-workflow synthesis across child workflows and apps
- dataflow direction modeling (`none`, `pull`, `push`, `bidirectional`, `event-driven`)
- optimization scoring for cost, effort, latency, revenue, and human involvement
- AI-assisted configuration drafting
- approval/safety boundaries for generated workflows
- execution and observation hooks into connectors and workflow runtimes

The natural-language window should not be a thin chatbot wrapper. It should be a control surface over structured kernel contracts.

### 4A. Roadmap-to-parent-workflow intelligence
When an operator gives AIFUT a roadmap, process screenshot, whiteboard, or plain-language description, the kernel should be able to:
- detect phases, milestones, repeated loops, decision gates, and conversion points
- translate the roadmap into a **parent workflow** that coordinates child workflows across apps
- propose which steps should live in first-party AIFUT modules vs downstream systems such as NexovaFlow, n8n, CRM, LMS, analytics, or local apps
- propose one-way vs two-way dataflow boundaries between systems
- identify where full automation is safe, where partial automation is better, and where human approval should stay
- produce a visually representable flow model instead of only a text suggestion

The parent workflow is not just an automation chain. It is the kernel-owned coordination plan that optimizes for:
- minimum system sprawl
- minimum operational cost
- minimum human handling where safe
- maximum practical revenue, productivity, or time savings
- multi-factor optimization when several of those wins can be achieved together

### 5. Resource governance truth
The kernel must own:
- AIFUT-provided token/API/storage quotas
- tenant-provided API/storage/infra allowances
- package-gated permission to use external services
- visible usage, quota, upgrade, and billing surfaces
- BYO-resource mode without duplicate resource billing

### 6. Commercialization truth
The kernel must own:
- package plans and add-on options
- coupon/discount/trial controls
- marketplace approval and listing boundaries
- workflow/app/solution/service monetization boundaries
- affiliate/referral commission graph
- app attachability to packages under AIFUT governance

### 7. Observability and self-healing truth
The kernel must own:
- health checks
- connection diagnostics
- drift detection
- operator incident/recovery history
- safe auto-fix playbooks
- optimization routines for speed, storage, and security

### 8. Analytics and behavior memory truth
The kernel must own:
- cross-system event ingestion
- behavior profile primitives
- privacy-aware aggregation
- recommendation/personalization policy boundaries
- business + interaction analytics surfaces

This is what enables context-aware assistance, orchestration, and tasteful monetization later.

## What integrated systems should become

### NexovaFlow / Perfex-like systems
Use as:
- CRM / automation / operational capability surface
- optional package add-on
- tenant app or downstream provider
- commercializable solution under AIFUT package control

Do not use as:
- kernel truth
- primary tenancy model
- package/billing authority
- storage-policy authority
- domain/topology authority

### Affiliate Management System
Use as:
- temporary affiliate capability provider if integration cost is acceptable
- pattern/reference for commission logic if useful

Do not use as:
- long-term commercial truth owner unless it cleanly fits AIFUT package, identity, and approval boundaries

### n8n / workflow runtimes
Use as:
- workflow bridge and visual execution layer
- low-code surface for non-technical users
- execution runtime behind AIFUT-defined intents and policies

Do not use as:
- business truth owner
- entitlement owner
- cross-system analytics owner

### UltimatePOS / other vertical apps
Use as:
- optional vertical capability surfaces
- future connectors or migration targets

Do not use as:
- platform nucleus

## Three experience layers for non-technical users

### Layer 1 — guided templates
User chooses:
- connector type
- provider
- auth method
- data sync pattern
- package or workflow template

### Layer 2 — AI-assisted drafting
User describes in natural language:
- what systems they have
- what outcome they want
- what data should sync
- what automations should happen

AIFUT drafts:
- initial connector setup
- mapping proposal
- workflow skeleton
- health/risk notes

### Layer 3 — advanced mode
For technical users:
- custom mapping
- custom actions
- custom JSON/schema details
- retry/security/routing controls
- advanced webhook and sync policies

## Optimal build order from here

### Phase A — kernel load-bearing truth
Must come first:
- tenant resolution
- domain/subdomain/custom-domain routing
- membership/role enforcement
- storage topology routing
- package/entitlement scope truth
- connector registry + connection instances + credential references
- diagnostics, health, audit, and recovery semantics

### Phase B — governed integration layer
Next:
- native connectors for high-value systems
- generic REST/OAuth connector
- webhook/event bridge
- workflow bridge (n8n-compatible)
- AI drafting for connector setup and mappings

### Phase C — resource and commercial control plane
Then:
- token/API/storage governance
- package options and add-ons
- BYO resource controls
- affiliate-backed infra/service catalog
- marketplace approval and package attachment flow

### Phase D — behavior intelligence and adaptive UX
Then:
- business + interaction event backbone
- privacy-aware behavior profiles
- recommendation/personalization policies
- operator insight surfaces
- contextual monetization/ads with governance
- cross-platform behavior memory that can influence orchestration and experience design

### Phase E — ecosystem/community depth
Later:
- community/social monetization
- richer solution marketplace
- deeper demo/trial/sandbox flows
- partner/reseller ecosystem scaling

## Immediate implication for current work
The current `aifut-core` work on:
- tenant/workspace scope
- entitlement/package auditability
- commercialization summary surfaces
- diagnostics/recovery semantics

is the right direction because it strengthens **kernel truth before connector sprawl**.

## Practical decision on NexovaFlow right now
The correct near-term stance is:
- keep AIFUT as the core
- integrate NexovaFlow as a governed capability provider
- allow commercialization of NexovaFlow-backed capabilities through AIFUT packages/options
- never let NexovaFlow become the place where tenancy, package truth, domain truth, storage truth, or cross-platform analytics truth live

## Buy vs build stance for currently owned/considered assets

### Good candidates to integrate/adapt
- n8n
- OpenClaw
- external AI providers
- NexovaFlow / Perfex-based surfaces as connectors
- affiliate-management capability if it can be bounded cleanly

### Build as first-party AIFUT kernel
- tenancy and identity truth
- storage sovereignty and backup policy
- package/entitlement governance
- connector contracts and diagnostics model
- marketplace approval boundaries
- analytics/behavior backbone
- natural-language control contracts
- roadmap-to-parent-workflow planning contracts
- resource/token governance

### Avoid buying as core foundation
- Perfex SaaS module as platform owner
- UltimatePOS SaaS module as platform owner

They may still be useful as pattern references or edge capabilities.

## Decision test for all future work
A proposed feature or integration is on-track only if it strengthens at least one of these:
- kernel truth
- integration abstraction
- resource governance
- commercialization governance
- observability/self-healing
- non-technical operability

If it mainly strengthens a downstream app while weakening kernel ownership, it is off-track.

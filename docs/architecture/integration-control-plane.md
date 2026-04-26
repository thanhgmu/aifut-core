# Integration Control Plane Architecture

## Why this exists
AIFUT should not force tenants to abandon their existing CRM, ecommerce, LMS, helpdesk, ERP-light, automation, or AI systems just to join the platform.

The platform core should instead become the control plane that can:
- connect those systems
- normalize tenant/business context across them
- observe health and sync drift
- orchestrate workflows and AI actions across them
- monetize the resulting solutions, workflows, and packaged operating surfaces
- let non-technical users connect and manage systems safely

This document translates that thesis into a concrete architecture direction for `aifut-core`.

## Product principle
AIFUT core is not required to be a full CRM, ecommerce engine, or LMS on day one.

AIFUT core **must** become the platform kernel and control plane for those systems.

That means AIFUT should own:
- tenancy and actor context
- entitlements and plan boundaries
- integration contracts
- health and observability
- marketplace/commercialization boundaries
- workflow and AI orchestration contracts
- resource governance for storage, AI tokens, and external services

And it should treat business applications as one of three things:
- first-party native modules
- external connectors
- tenant-owned systems connected through generic bridges

## Outcome for operators
The end state should allow a very small operator team, ideally even a single operator, to:
- provision tenants
- attach external systems
- observe sync and health status
- apply policies and entitlements
- monetize templates, solutions, workflows, and apps
- help non-technical tenants connect their systems with low friction
- hand AIFUT a roadmap/process and receive a system-coordination proposal with app roles, dataflow direction, and automation boundaries

## Architectural layers

### 1. Connector registry layer
The connector registry is the normalized catalog of what AIFUT can connect to.

Each connector definition should describe:
- connector key
- category (`crm`, `commerce`, `lms`, `workflow`, `analytics`, `messaging`, `ai`, `storage`, `infra`, `other`)
- provider name
- auth modes (`api-key`, `oauth2`, `basic`, `webhook-shared-secret`, `custom`)
- supported capabilities
- required configuration fields
- health-check strategy
- event types supported
- command/actions supported
- sync directions (`pull`, `push`, `bidirectional`, `event-driven`)
- whether the connector is first-party, marketplace-provided, or tenant-custom

Examples:
- NexovaFlow/Perfex connector
- Shopify connector
- WooCommerce connector
- Moodle connector
- n8n bridge
- generic REST connector
- webhook bridge connector
- AI provider connector
- domain/hosting provider connector

### 2. Connection instance layer
A tenant should not connect to a connector definition directly. It should create a connection instance.

For tenant-app systems such as NexovaFlow, the connection instance also needs a topology assignment so AIFUT can decide whether the tenant runs on a shared runtime, a split database/schema, or a dedicated runtime.

A connection instance should capture:
- tenant/workspace ownership
- connector key/provider
- credential reference or auth material reference
- remote base URL / account info
- topology mode (`shared`, `split`, `dedicated`)
- storage routing policy reference
- sync policy
- event mapping profile
- command/action mapping profile
- status and health
- verification timestamps
- error state summary
- operator notes

This is the layer that turns "we support Shopify" into "tenant A has connected store X in workspace Y".

### 3. Unified business context layer
No matter which external system connects, AIFUT should reason in its own language.

The normalized context should allow the platform to answer:
- which tenant does this event belong to?
- which workspace does it affect?
- which actor initiated it?
- what kind of business object is it?
- which policy or entitlement applies?
- what workflow/action should follow?
- what billing/usage event should be emitted?
- what analytics or behavior event should be recorded?

This means connectors should map external data into platform primitives such as:
- actor
- tenant
- workspace
- contact/member/customer
- order/transaction/subscription
- enrollment/learning-progress
- workflow event
- audit event
- entitlement/usage event
- behavioral signal

### 3A. Parent-workflow planning layer
Above individual connectors and workflows, AIFUT should own a planning layer that can:
- ingest a roadmap/process described in text or visuals
- normalize it into phases, tasks, goals, signals, approvals, and handoffs
- decide which child workflow belongs in which app/runtime
- define dataflow direction between those child workflows
- emit a parent workflow graph that can later be rendered visually and executed incrementally

This is where AIFUT becomes more than an integration dashboard: it becomes the orchestration brain that chooses the leanest workable multi-app system.

### 4. Integration UX layer
The platform must support non-technical users, not just API-driven operators.

Therefore integrations should support three usability tiers:

#### Tier A — guided templates
The user picks a known integration template such as:
- Connect Shopify
- Connect WooCommerce
- Connect Perfex CRM / NexovaFlow
- Connect Moodle
- Connect n8n
- Connect WhatsApp
- Connect Google Sheets
- Connect a custom REST app

The user should then follow a guided wizard:
1. choose provider
2. provide domain/auth
3. test connection
4. choose sync scope
5. choose mapping defaults
6. review permissions
7. enable

#### Tier B — AI-assisted setup
The user describes intent in natural language, for example:
> Connect my current CRM and sync customers, invoices, and appointments.

The system should then:
- ask clarifying questions
- propose the best connector type
- pre-fill mapping defaults
- suggest sync policies
- test the configuration
- explain errors in plain language

#### Tier C — advanced mode
For technical users and partners:
- generic REST/OAuth configuration
- JSON schema mapping
- custom webhook/event routes
- retry/security/rate-limit tuning
- custom action definitions

### 5. Observability and health layer
Each connection should expose operator-friendly observability.

AIFUT should track at least:
- connection status
- last verification time
- last successful sync time
- last error summary
- auth expiry or drift risks
- event delivery failures
- mapping gaps
- rate limit warnings
- degraded mode flags
- consumer usage and recent activity where applicable

This is mandatory if a single operator is expected to manage a large tenant base.

### 6. Commercialization layer
Once connectors and workflows exist, AIFUT should be able to commercialize them.

Commercializable items should include:
- connectors
- integration templates
- workflow packs
- vertical solutions
- onboarding/setup services
- support packages
- automation add-ons

Commercialization rules should support:
- approval before listing
- entitlement checks
- demo/trial paths
- plan/add-on attachment
- reseller/affiliate revenue sharing

### 7. Resource and package governance layer
Integrations may depend on resources such as:
- AIFUT-provided AI tokens
- AIFUT-provided storage
- affiliate-backed hosting/VPS/domain offers
- tenant-provided credentials and infrastructure

The control plane must therefore track:
- whether a connector uses platform resources or tenant-owned resources
- whether package policy allows that integration/resource class
- how usage should be billed, limited, surfaced, or bypassed
- what upgrade path should be shown to the tenant

### 8. Optimization and recommendation layer
When AIFUT proposes a system/process design, it should score options against practical operator goals:
- revenue/profit improvement
- productivity gain
- time reduction
- human-ops reduction
- tool-count / complexity reduction
- infrastructure/API/storage cost reduction

The point is not to maximize automation blindly. The point is to recommend the most effective real-world design under tenant constraints, package limits, data location, and behavior context.

## Recommended connector types for phase sequencing

### Phase-first connectors
These offer the best leverage earliest:
- generic REST/OAuth connector
- webhook/event bridge
- n8n bridge
- storage connector profile
- messaging channel adapters
- AI provider connector profile
- NexovaFlow/Perfex tenant-app adapter because it is already in hand and can validate the tenant-app topology model

### High-value named connectors next
- Shopify / WooCommerce
- Perfex (integration only, never platform core)
- Moodle / LMS connector
- Google Sheets / lightweight ops data
- payment provider connectors
- domain/hosting provider connectors

## Rules for build vs buy

### Build first-party
- connector registry contract
- connection instance model
- health/drift semantics
- normalized event and command model
- integration UX/wizard contract
- AI-assisted integration setup contract
- monetization/approval boundaries
- package/resource governance boundaries

### Integrate or adapt
- business systems themselves (CRM, commerce, LMS)
- workflow execution engines where useful
- affiliate engine where it accelerates but does not own the platform kernel
- reference SaaS modules as pattern material only

## Immediate backend consequences
The API should evolve toward these concrete surfaces:
- connector registry endpoint(s)
- connection instance CRUD and verification endpoints
- health status endpoint per connection
- generic connector profile for tenant-owned systems
- mapping profile and sync policy endpoints
- workflow handoff endpoints
- package/resource policy surfaces per connection
- roadmap ingestion + normalized orchestration-plan draft endpoint(s)
- parent-workflow graph draft endpoint(s)
- optimization/recommendation summary endpoint(s) for comparing alternative app/dataflow designs

## Success criteria
This layer is successful when:
1. a tenant can connect a known external system without code
2. a technical user can connect a custom system with generic REST/OAuth/webhook tools
3. the operator can observe health and errors centrally
4. workflows and AI actions can operate against normalized platform context
5. the resulting integrations can be packaged and monetized within tenant boundaries
6. resource governance stays correct whether AIFUT or the tenant provides the underlying infrastructure

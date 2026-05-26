# Resource Integration Strategy v1

## Purpose
This document defines how AIFUT should integrate existing systems and resources to accelerate delivery without losing kernel control, upgrade safety, or long-term architectural integrity.

It converts the current strategic stance into an actionable integration model for the following resource classes:
- workflow/connector runtime
- natural-language/agent runtime
- CRM/customer-ops systems
- affiliate/commission systems
- AI generation systems
- future user-supplied systems

## Core rule
AIFUT should aggressively **use existing systems**, but only as:
- capability providers,
- execution runtimes,
- domain tools,
- or adapter-backed surfaces.

AIFUT should **not** let those systems become the hidden core.

AIFUT must continue to own:
- tenant/workspace truth
- workflow truth
- policy/approval truth
- reporting truth
- marketplace approval truth
- canonical object truth where cross-system coordination matters
- optimization truth

## Integration stance by system

### 1. n8n
**Use for:**
- workflow execution
- commodity connectors
- trigger/action orchestration
- event routing
- sync jobs
- visual detail for child automation paths

**Do not use for:**
- parent-workflow truth
- tenant/policy truth
- approval truth
- marketplace truth
- canonical cross-app reporting truth

**Integration shape:**
- AIFUT drafts parent workflow and child workflow assignments
- AIFUT stores workflow truth
- AIFUT bridge compiles relevant child workflows into n8n-compatible runtime artifacts
- AIFUT consumes runtime status, health, logs, and summary signals back from n8n

**Required adapter capabilities:**
- deploy workflow
- update workflow
- activate/deactivate workflow
- test workflow
- inspect run status
- normalize run errors
- version compatibility checks

### 2. OpenClaw
**Use for:**
- chat window / conversational interface
- natural-language interpretation
- planning assistance
- subagent/specialist-agent execution support
- explanation / remediation / guided help

**Do not use for:**
- canonical workflow store
- core policy authority
- commercial truth
- source-of-truth for AIFUT objects

**Integration shape:**
- user speaks to an OpenClaw-backed assistant surface
- assistant compiles intent into AIFUT structures
- AIFUT decides draft / approval / activation / reporting
- OpenClaw may support specialist-agent execution within AIFUT guardrails

**Required adapter capabilities:**
- prompt/intent exchange
- structured draft output
- approval-aware task execution
- tool permission binding
- cost/runtime visibility

### 3. Perfex / NexovaFlow
**Use for:**
- CRM/customer operations
- lead/contact/deal/task/support flows
- internal operator/customer-success surfaces
- tenant-app CRM packages

**Do not use for:**
- AIFUT-wide kernel truth
- universal workflow truth
- behavior-intelligence backbone
- marketplace approval core
- cross-system canonical control-plane store

**Integration shape:**
- AIFUT treats Perfex/NexovaFlow as a CRM domain provider
- CRM objects are mapped through an upgrade-safe adapter/module/API boundary
- AIFUT owns higher-order orchestration, policy, and reporting context

**Required adapter capabilities:**
- read/write CRM entities
- task/reminder/note actions
- workflow/event hooks where available
- health verification
- permission scope checks
- version drift detection

### 4. aff.nexovaflow.com
**Use for:**
- affiliate hierarchy
- multi-tier commissions
- partner/referral tracking
- payout economics
- affiliate campaign math

**Do not use for:**
- marketplace approval truth
- product listing truth
- package attachment truth
- tenant/core identity truth

**Integration shape:**
- AIFUT marketplace owns listing, approval, packaging, and entitlement boundaries
- affiliate engine owns commission/referral/payout computation and tracking details
- AIFUT normalizes affiliate/commercial outputs into dashboards and operator summaries

**Required adapter capabilities:**
- create/manage affiliate link context
- read referral tree and payout state
- read commission summaries
- campaign attribution hooks
- payout queue summaries

### 5. e.aifut.net / MagiCA
**Use for:**
- AI generation workflows
- script/image/audio/video asset creation
- reusable creative packs
- generation task execution

**Do not use for:**
- workflow kernel truth
- marketplace/commercial truth
- campaign truth
- operator-wide reporting truth

**Integration shape:**
- AIFUT routes generation work into MagiCA
- MagiCA returns domain outputs
- AIFUT maps outputs into canonical asset/content objects and downstream workflow steps

**Required adapter capabilities:**
- submit generation job
- inspect job status
- retrieve outputs
- error/retry summary
- output metadata normalization

### 6. Future user-supplied systems
**Use for:**
- domain-specific operations the user already owns
- local/VPS/on-prem or third-party apps
- niche workflows and tenant-specific data sources

**Rule:**
These systems must enter through connector contracts and capability declarations, not by custom bypasses around the kernel.

---

## Mandatory architecture pattern for all integrations

### Layer 1 — Capability contract
AIFUT should first define what capability it needs, such as:
- generate asset
- publish content
- create CRM lead
- fetch analytics
- create affiliate link
- compute commission summary
- run child automation
- send message

### Layer 2 — Adapter
Each external system gets its own adapter implementing those capabilities.

### Layer 3 — Mapping/translation
Object and field translation, version handling, and normalization live here.

### Layer 4 — Health/verification
Every integration needs:
- connection verification
- permission verification
- schema/version compatibility checks
- degraded-state signals
- remediation suggestions

### Layer 5 — Policy boundary
Every call respects:
- tenant/workspace scope
- package entitlement
- approval policy
- data sovereignty rules
- usage/quota/cost limits

### Layer 6 — Reporting/feedback loop
AIFUT must pull back enough normalized signal to support:
- dashboards
- troubleshooting
- optimization
- audit
- commercial summaries

---

## Marketplace and approval implications
AIFUT should support products such as:
- addons
- skills
- plugins
- workflow packs
- service packages
- rental products
- full connected apps

These may depend on external systems, but approval and listing control remains in AIFUT.

### User-side requirement
User control panel must support submission for:
- sell
- rent
- attach to package/service
- private/internal use

### Admin-side requirement
Admin control panel must support:
- review queue
- criteria templates
- security/supportability/commercial checks
- approve/reject/request changes
- configurable rules by product type and period

---

## Behavior and tracking implications
Behavior data may be gathered from AIFUT surfaces, ecosystem apps, third-party integrations, and local connectors where policy allows.

### Rule
Behavior intelligence belongs to AIFUT core.

### Therefore
- Perfex/NexovaFlow may consume CRM-facing summaries derived from behavior signals
- n8n may transport events
- OpenClaw may use behavior context conversationally
- but AIFUT owns behavior profile, policy, and recommendation truth

---

## Upgrade-safety rules
An integration is acceptable only if:
1. AIFUT kernel truth survives provider changes
2. provider-specific breakage is isolated to the adapter layer
3. compatibility checks can detect drift early
4. degraded mode can disable only the affected capability
5. important business meaning is preserved in AIFUT canonical models

## Explicit anti-patterns
Avoid:
- storing the only durable workflow truth in n8n JSON
- using Perfex/NexovaFlow as the hidden AIFUT kernel
- making OpenClaw the owner of execution-safe workflow state
- making affiliate engine the owner of marketplace governance truth
- burying data mappings in ad-hoc scripts
- skipping approval/health/remediation layers for speed

## Recommended near-term build order
1. resource capability catalog
2. adapter registry skeleton
3. application intake template and assessment flow
4. n8n bridge first
5. OpenClaw NL/chat bridge
6. affiliate engine bridge
7. MagiCA generation bridge
8. Perfex/NexovaFlow CRM bridge
9. dashboard-level normalized summaries

## Final decision
Yes: AIFUT should use existing systems to reduce delivery time.

But every integration must strengthen the platform as a business operating system, not dilute it into a loose bundle of third-party products.

# AIFUT Master Plan Lock v1

## Purpose
Lock the strategic execution order for `aifut-core` so implementation can continue without drift while still enabling earlier revenue through attached capability systems.

## Kernel truth
`aifut-core` remains the only kernel / control plane / commercial-governance truth.

It owns:
- tenant / workspace / actor context
- package / option / entitlement truth
- storage / domain / hosting / API-token topology policy
- orchestration / approval / execution-contract truth
- marketplace / listing / approval truth
- analytics / behavior / personalization truth
- audit / security / operator governance truth

Connected systems must remain adapters, capability providers, or managed attached apps.

## System boundaries

### 1. NexovaFlow / Perfex
Treat these as one system lane: a customized Perfex-based CRM/operations capability running under the NexovaFlow commercial identity.

Boundary:
- role: CRM + operations + downstream tenant-app capability
- not kernel truth
- integrate through upgrade-safe modules / bridges / adapters
- avoid core hacks where possible
- AIFUT owns package, topology, approval, analytics, and marketplace truth

Recommended technical pattern:
- Perfex/NexovaFlow module bridge for stable actions
- REST/API or bridge endpoints for data and command exchange
- tenant/workspace mapping kept in AIFUT-side metadata
- no dependence on Perfex internal schema as the main platform model

### 2. MagicAI
Treat as an AI feature-capability and early revenue surface, not a core foundation.

Boundary:
- role: managed attached AI app / capability provider
- not kernel truth
- should be introduced through adapter/module boundaries
- AIFUT owns packaging, topology choices, approval, orchestration overlay, and analytics overlay

Recommended technical pattern:
- buy and audit early
- sandbox first, not production-first
- create AIFUT-side adapter for tenant binding, package binding, domain/storage modes, backup lifecycle, and workflow hooks
- keep vendor upgrades isolated by avoiding deep core edits

### 3. Affiliate Management System
Treat as an optional commission helper / transitional backoffice, not marketplace truth.

Boundary:
- role: affiliate execution helper if useful
- not source-of-truth for marketplace orders, package truth, or commission policy truth
- AIFUT should own commission rules, approval states, payout states, and commercial event truth

Recommended technical pattern:
- use as bridge/helper only if it accelerates early operations
- prefer AIFUT-owned commission ledger model over vendor-owned truth

### 4. n8n / external workflow runtimes
Treat as workflow bridges, not orchestration kernel.

Boundary:
- role: child-workflow runtime or connector bridge
- not parent-workflow truth
- AIFUT owns parent workflow intent, approval checkpoints, execution policy, and cross-system orchestration truth

## Product model lock
AIFUT must support three first-class topology families under the same control plane:

### Data / runtime topology
- platform-managed / shared
- provider-managed / affiliate-hosted
- self-managed / local / user-hosted

### Domain topology
- user-owned domain/subdomain
- AIFUT/partner-provided domain/subdomain
- local route/domain when user-hosted

### Integration topology
- native connectors
- generic REST/OAuth connectors
- webhook/event bridges
- workflow bridges such as n8n

## Newly locked platform requirements

### X6. Behavior memory + compaction model
AIFUT must treat behavior capture as a first-class cross-system capability, not only an app-local feature.

Required shape:
- capture behavior and interaction signals from AIFUT-native apps, attached systems, and user-owned connected systems where policy/permissions allow
- maintain privacy-aware user / member / operator behavior profiles across devices, channels, and connected systems
- support a memory-compaction pattern similar in spirit to OpenClaw continuity:
  - raw/older behavior logs can be summarized into higher-value durable memory artifacts
  - summary memory becomes the long-lived reference layer
  - older raw segments may be pruned, archived, or compacted based on policy, retention, and cost rules
- reduce UI/chat history burden by separating:
  - live interaction context
  - compacted memory summaries
  - archival/raw logs
- never let compaction destroy audit-critical or security-critical evidence that policy requires to be retained

### X7. Voice-native multilingual interaction
AIFUT interaction surfaces must support not only text, but also voice-first and mixed-mode conversation.

Required shape:
- text + voice interaction in the same control plane
- multilingual voice input/output support
- device-aware input/output surface support across PC, laptop, tablet, phone, and peripheral hardware such as microphones / Bluetooth audio devices where available
- voice should remain an interaction surface over the kernel, not a separate product silo

### X8. Multi-country / multi-language / multi-currency / multi-timezone operation
AIFUT must expose localization as a first-class tenant and user capability.

Required shape:
- user-selectable language, currency, timezone, and locale preferences
- operator/admin configuration surfaces for supported languages, currencies, exchange-rate policies, timezone policies, and formatting defaults
- cross-system workflows and communications must be localization-aware
- pricing, analytics, notifications, scheduling, and approvals must respect locale/timezone context

## Execution principle
Build the kernel first, connect revenue engines second, and only then widen commercialization and intelligence layers.

This avoids:
- vendor lock-in
- topology drift
- duplicated truth
- upgrade breakage
- turning attached apps into accidental core infrastructure

## Phased execution plan

### Phase 1 — Kernel foundation lock
Target: 7-10 working days from current checkpoint

Primary outcomes:
- tenant / domain / storage / package foundation hardened
- orchestration module deepened beyond draft surfaces
- execution-contract, runtime-binding, and approval-routing semantics hardened
- control-plane data model stabilized enough for attached systems
- verification/docs continuity kept current

Immediate implementation priority:
1. finish targeted domain-governance verification slices
2. continue orchestration DTO + runtime-binding + execution write-path hardening
3. keep status/docs aligned with repo reality

Definition of done:
- tenant/workspace/domain/storage/package/orchestration control-plane semantics are stable enough to support attached-app adapters without rethinking the kernel every few days

### Phase 2 — Integration substrate + operator topology controls
Target: 5-7 working days after Phase 1

Primary outcomes:
- connector contract normalization
- connection instance / credential reference / health model improvements
- provider catalog model for hosting/domain/API resources
- backup topology model and operator policy surfaces
- initial wizard-oriented integration scaffolds for non-technical onboarding
- localization preference model foundations for language / currency / timezone context

Definition of done:
- AIFUT can describe and manage external systems in a way that is topology-aware and commercially aware

### Phase 3 — Revenue bridge for NexovaFlow/Perfex
Target: 4-6 working days after Phase 2

Primary outcomes:
- finalize upgrade-safe NexovaFlow/Perfex bridge boundaries
- align package/add-on control from AIFUT
- expose tenant-safe commercial and operational actions through stable contracts
- preserve NexovaFlow as downstream capability only

Definition of done:
- AIFUT can attach and govern NexovaFlow/Perfex as a tenant-app capability without ceding kernel truth

### Phase 4 — MagicAI audit + sandbox integration
Target: 4-6 working days after Phase 3 once MagicAI assets are available

Primary outcomes:
- audit codebase / extension points / upgrade path
- define adapter boundary
- launch sandbox or staging deployment
- map tenant/domain/storage/backup/package modes into AIFUT-side metadata and policy
- identify 1-2 revenue-first product packages

Definition of done:
- MagicAI can be onboarded as a managed attached AI app without contaminating the kernel model

### Phase 5 — Marketplace / affiliate / approval commercialization
Target: 7-10 working days after Phase 4

Primary outcomes:
- listing model
- approval flow
- demo/trial/auto-expire flow
- commission ledger / payout request foundations
- optional helper integration with Affiliate Management System if still useful
- locale-aware pricing / settlement / notification surfaces for multi-country operation

Definition of done:
- solutions, workflows, and attached-app offers can be sold/rented inside AIFUT under approval and commission policy

### Phase 6 — Analytics / personalization / operator leverage
Target: 7-10 working days after Phase 5

Primary outcomes:
- behavior event model
- compacted behavior-memory / archival policy model
- personalization profile model
- business/usage insight surfaces
- recommendation hooks
- auto-debug / auto-fix playbook scaffolds
- cost/performance/storage optimization loop foundations
- voice interaction contract foundations tied back to orchestration and personalization

Definition of done:
- AIFUT begins acting like an intelligent operator stack instead of only an integration control plane

## Estimated total path
Minimum realistic path to strong revenue-capable foundation:
- Phase 1 + 2 + 3: about 16-23 working days
- Add Phase 4 for MagicAI revenue bridge: about 20-29 working days total
- Add Phase 5 for marketplace/affiliate commercialization: about 27-39 working days total
- Add Phase 6 for broader intelligence layer: about 34-49 working days total

These ranges assume focused execution from the current base and normal interruptions, not a full team.

## Buy / build decisions

### Buy now
- MagicAI: yes, for audit + sandbox preparation, not as kernel
- Perfex REST/API if required for cleaner bridge work: likely yes if existing bridge surfaces are insufficient

### Do not buy as kernel shortcut
- Perfex SaaS module
- Affiliate system
- UltimatePOS SaaS stack

These may be useful as references or helpers, but not as substitutes for AIFUT control-plane truth.

## Deployment order
1. keep working in `C:\Users\PC\.openclaw\workspace\aifut-core`
2. complete current foundation hardening
3. document and stabilize adapter contracts
4. audit/bind attached systems one by one
5. deploy staging before public commercial rollout
6. only then scale production offers

## Immediate next actions
1. Continue the current targeted controller/service verification work until domain-governance write paths feel sufficiently locked.
2. Move directly into richer orchestration write-path semantics after that checkpoint.
3. Keep `STATUS.md` synchronized with each meaningful slice.
4. Prepare a dedicated integration-boundary document for NexovaFlow/Perfex + MagicAI once the next foundation slice lands.

## Hard rules
- Do not let attached systems become source-of-truth for kernel policy.
- Prefer adapter/module/bridge patterns over core hacks.
- Keep non-technical integration UX first-class.
- Keep topology flexibility first-class.
- Keep security first without bloating the operator path.
- Optimize for one-operator leverage, not enterprise ceremony.

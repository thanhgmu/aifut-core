# ADR 0006 — Architecture Decision Set v1

## Status
Accepted

## Purpose
This decision set turns the AIFUT North Star into concrete architecture rules for four load-bearing areas:
1. core object model
2. process/workflow model
3. integration/data-sync model
4. natural-language-to-execution model

Its job is to reduce future drift when new modules, adapters, and UX surfaces are added.

## Context
AIFUT is not aiming to be a single product module or a thin automation wrapper.

It is being built as an AI-native business operating system that should let one operator describe business intent in natural language and then coordinate governed execution across many applications, workflows, and data boundaries.

Without explicit architecture rules, implementation will drift toward one or more failure modes:
- app-centric design instead of kernel-centric design
- connector sprawl without canonical object truth
- workflow execution without process ownership
- natural-language convenience without structured runtime safety
- reporting gaps between apps
- accidental dependence on a third-party tool as the real platform core

## Decision Summary
AIFUT will adopt the following four architecture decision groups as first-order constraints:
- core object model principles
- process/workflow model principles
- integration/data-sync principles
- natural-language-to-execution principles

---

# 1. Core Object Model Principles

## 1.1 Canonical objects must exist above application shapes
AIFUT must define its own canonical objects where business, orchestration, policy, or reporting logic needs durable consistency.

External app models may be mapped into those objects, but should not define kernel truth.

### Consequence
When adding a new app integration, first ask:
- which canonical object(s) does it create, update, consume, or observe?
- which fields are merely app-local, and which must be normalized into AIFUT truth?

## 1.2 Separate business objects, control-plane objects, and runtime objects
AIFUT should avoid mixing business content with orchestration state or integration state.

### Business objects
Examples:
- `BusinessGoal`
- `Offer`
- `Campaign`
- `ContentPlan`
- `AssetRecord`
- `PerformanceSummary`
- `RevenueSummary`

### Control-plane objects
Examples:
- `TenantContext`
- `WorkspaceContext`
- `ConnectionInstance`
- `MappingProfile`
- `SyncPolicy`
- `ExecutionPolicy`
- `EntitlementState`

### Runtime objects
Examples:
- `WorkflowRun`
- `ExecutionRun`
- `ApprovalTask`
- `IntegrationHealthState`
- `IntegrationRunSummary`
- `RemediationSuggestion`

### Consequence
No single object should try to be business record, app adapter state, and runtime state all at once.

## 1.3 Object ownership must be explicit
For every important object, AIFUT should know:
- whether AIFUT is canonical owner,
- whether a downstream app is the operational owner,
- whether the object is mirrored,
- whether the object is derived,
- and what audit trail exists.

### Consequence
If ownership is unclear, the object model is incomplete.

## 1.4 Object identity must survive across apps
Cross-application objects should use stable AIFUT-side identities plus external references.

### Pattern
- AIFUT internal id
- external system id(s)
- source-system role
- sync timestamps / provenance

### Consequence
Never rely on a downstream system id alone as cross-system identity.

## 1.5 Source-of-truth is field-sensitive, not just object-sensitive
Sometimes one object spans several systems, but different fields have different authorities.

### Example
A campaign object may use:
- title/categorization from AIFUT
- click/revenue metrics from affiliate system
- publish URLs from distribution platforms

### Consequence
Source-of-truth rules should support field- or subdomain-level authority, not only all-or-nothing ownership.

## 1.6 Canonical objects should be chosen for operator value, not abstract completeness
AIFUT should normalize only the objects that materially improve:
- orchestration,
- reporting,
- policy enforcement,
- optimization,
- or operator clarity.

### Consequence
Avoid both extremes:
- over-normalizing everything,
- or leaving everything app-native and incoherent.

## 1.7 Object design must anticipate multi-tenancy and sovereignty
Canonical objects should be scoping-aware from the start.

They must be able to express:
- tenant ownership,
- workspace context,
- package/entitlement context,
- topology/storage implications,
- external-system references,
- and audit provenance.

---

# 2. Process / Workflow Model Principles

## 2.1 Parent workflow is a first-class kernel object
AIFUT must model the total operating loop, not just individual automations.

The parent workflow should express:
- phases,
- goals,
- child workflows,
- dependencies,
- approvals,
- handoffs,
- dataflow edges,
- and optimization points.

### Consequence
AIFUT should never collapse the business process into isolated, unrelated app automations.

## 2.2 Child workflows must be explicit and typed
Each meaningful sub-process should be modeled as a child workflow with a known role.

### Example roles
- research
- ingestion
- enrichment
- planning
- generation
- publishing
- analytics pull
- sync
- remediation
- reporting

### Consequence
If a sub-process matters enough to monitor, retry, approve, or optimize, it should likely exist as an explicit workflow object.

## 2.3 Workflow boundaries must align to ownership and review needs
Workflow boundaries should be chosen based on:
- who owns the step,
- what app executes it,
- whether approvals are needed,
- what data crosses system boundaries,
- and what reporting granularity is useful.

### Consequence
Do not split workflows only because an app changes; do not merge workflows when approval, observability, or retry semantics differ.

## 2.4 Workflow state must be persisted as runtime truth
Execution should not rely only on ephemeral request chains or third-party runtime memory.

AIFUT should persist enough state to understand:
- what was planned,
- what was activated,
- what ran,
- what failed,
- what is awaiting decision,
- and what happened next.

### Consequence
AIFUT runtime state must remain interpretable even when an external tool fails or disappears.

## 2.5 Workflow outputs must be reviewable in human terms
The system should be able to explain each workflow in plain language:
- what it does,
- why it exists,
- what data it touches,
- what app executes it,
- what its current state is,
- and what should happen next.

### Consequence
Opaque automation graphs are insufficient as the long-term operator model.

## 2.6 Approval gates are workflow-native, not bolted on later
Approval checkpoints should be modeled directly into workflow structures where actions are:
- public-facing,
- revenue-impacting,
- compliance-sensitive,
- destructive,
- or high-cost.

### Consequence
If approval logic lives only in UI prompts or custom app code, the workflow model is too weak.

## 2.7 Reporting loops are part of the process graph
Daily/weekly/monthly/yearly review loops are not separate admin chores; they are part of the operating system.

### Consequence
The process model should include recurring review, summary, optimization, and planning cycles as explicit workflows.

## 2.8 Optimization must target the parent workflow, not isolated steps only
The system should optimize:
- overall business loop,
- cross-app handoffs,
- approval placement,
- time-to-outcome,
- reliability,
- and operator burden,
not only the local efficiency of one app step.

---

# 3. Integration / Data-Sync Principles

## 3.1 Integrations are adapters, not architecture owners
External apps and runtimes must connect through capability contracts and adapter boundaries.

They may execute steps or host app-local truth, but must not redefine AIFUT kernel contracts.

### Consequence
New integrations should be evaluated by how well they fit AIFUT contracts, not by how much kernel logic can be pushed into them.

## 3.2 App capability must be modeled explicitly
AIFUT should understand what an app can do in structured form.

### Example capability types
- read
- write
- search
- trigger
- webhook receive
- webhook emit
- render/generate
- publish
- message
- analytics pull
- billing sync

### Consequence
App routing should operate on declared capabilities, not informal tool knowledge.

## 3.3 Dataflow direction must be a first-class design decision
For each object or edge, AIFUT should explicitly model whether the flow is:
- push,
- pull,
- bidirectional,
- event-driven,
- batched,
- manual-sync,
- or approval-mediated.

### Consequence
If data direction is implicit, sync bugs and ownership confusion will multiply.

## 3.4 Sync policy must be explicit and reviewable
Every meaningful cross-system sync should have a visible policy that covers:
- source of truth,
- sync direction,
- update frequency,
- conflict behavior,
- retry behavior,
- rate-limit assumptions,
- and failure escalation.

### Consequence
AIFUT should be able to explain not only that data syncs, but how and why.

## 3.5 Mapping is a productized layer, not one-off glue
Field and object mapping should be modeled as reusable assets where possible.

### Examples
- default connector mappings
- tenant-custom mappings
- template-specific mappings
- AI-suggested draft mappings with confirmation

### Consequence
Avoid burying mapping logic inside one-off scripts or app-specific branches.

## 3.6 Health, verification, and remediation are part of integration truth
An integration is not fully modeled unless AIFUT can track:
- whether the connection is valid,
- whether required permissions exist,
- whether syncs are healthy,
- what failures occurred,
- and what remediation is recommended.

### Consequence
Connection setup without health lifecycle support is incomplete.

## 3.7 External systems may own local detail but must emit interpretable signals
AIFUT does not need every downstream app's raw internals, but it does need normalized signals sufficient for:
- monitoring,
- reporting,
- optimization,
- audit,
- and user guidance.

### Consequence
Adapter design should prioritize meaningful summaries, not just raw payload passthrough.

## 3.8 Integration design must preserve replaceability
n8n, Perfex, affiliate engines, AI generators, and future apps should be swappable or at least coexistable.

### Consequence
Never let provider-specific workflow JSON or app-specific state become the only durable expression of business logic.

---

# 4. Natural-Language-to-Execution Principles

## 4.1 Natural language is an intent surface, not an execution format
User prompts should first become structured intent, not direct unsafe execution.

### Intermediate structures may include
- business goal
- process interpretation
- app coordination proposal
- workflow draft
- mapping draft
- policy/risk flags
- reporting plan

### Consequence
AIFUT must compile natural language into structure before durable execution begins.

## 4.2 Missing information should produce guided clarification, not silent guessing
When key execution details are missing, AIFUT should ask targeted follow-up questions or present defaults for confirmation.

### Consequence
The system should prefer safe narrowing over overconfident implicit assumptions in important workflows.

## 4.3 Draft first, then approve or activate
Natural-language commands that produce multi-step operational systems should normally yield:
- a draft business/process interpretation,
- proposed app assignments,
- dataflow plan,
- workflow graph,
- and approval points,
before activation.

### Consequence
Natural language should accelerate setup, not bypass governance.

## 4.4 The NL layer must respect policy, package, topology, and app capability truth
Natural-language planning cannot ignore:
- tenant/workspace boundaries,
- package entitlements,
- resource quotas,
- data sovereignty rules,
- integration availability,
- or app capability limits.

### Consequence
LLM creativity cannot override platform policy truth.

## 4.5 Explanations are part of execution safety
AIFUT should be able to explain, in human language:
- what it understood,
- what workflow it proposes,
- what systems it will use,
- what data will move,
- what approvals are needed,
- and what success will look like.

### Consequence
If the user cannot inspect the plan in plain language, the NL pipeline is not trustworthy enough.

## 4.6 NL planning must produce artifacts that other modules can reuse
Outputs from the NL layer should be consumable by:
- process planners,
- app routing,
- dataflow modeling,
- execution runtime,
- reporting,
- and optimization modules.

### Consequence
Natural-language outputs should become reusable backend artifacts, not disposable chat-only summaries.

## 4.7 Natural-language control should progressively reduce technical burden
The long-term target is that non-technical users can:
- describe what they want,
- confirm a guided setup,
- review risks and outputs,
- and operate the resulting business loop,
without manually wiring APIs or workflows unless they choose advanced mode.

### Consequence
Every important workflow should trend toward a guided NL + wizard path over time.

## 4.8 Execution autonomy should be graduated
Different action types should support different autonomy levels.

### Example ladder
1. suggest only
2. draft only
3. draft + ask approval
4. auto-run inside safe scope
5. auto-optimize inside policy bounds

### Consequence
The NL execution model should be policy-aware and graduated, not binary manual vs autonomous.

---

## Implementation Guardrail Questions
When building a new module, endpoint, or integration, ask:
1. What canonical objects are introduced or consumed?
2. Is this a parent workflow concern, a child workflow concern, or both?
3. What app capabilities does it rely on?
4. What is the explicit source-of-truth and sync direction?
5. What structured artifacts should NL input compile into here?
6. What approvals, diagnostics, and reporting outputs are required?
7. Does this strengthen AIFUT as the business operating system, or quietly move truth into an external app?

## Consequences
### Positive
- clearer module boundaries
- lower risk of third-party-core drift
- easier cross-app reporting and optimization
- safer NL-driven orchestration growth
- better long-term replaceability of runtimes and adapters

### Negative
- more up-front modeling work
- slower shortcut adoption for app-specific features
- stronger pressure to maintain canonical contracts carefully

## Rationale
AIFUT's long-term leverage depends on disciplined kernel truth.

This decision set makes that discipline explicit so future implementation can move faster without losing the platform's architectural identity.

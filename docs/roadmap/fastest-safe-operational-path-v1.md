# Fastest Safe Operational Path v1

## Purpose
This document chooses the fastest realistic path to get AIFUT into practical operation **without breaking the architecture, over-owning data, or creating third-party-core lock-in**.

It is the recommended answer to the question:

> What is the safest, structurally optimal, data-light, flexible, and fastest path to get AIFUT operating now?

## Strategic answer
Choose a **hybrid control-plane-first path**:
- AIFUT core owns control, workflow truth, policy, approval, and cross-app summaries
- external systems provide domain capabilities and execution surfaces
- AIFUT avoids re-building commodity systems first
- AIFUT avoids over-ingesting raw data from downstream apps

In short:
- **Own the orchestration**
- **Own the meaning**
- **Own the approvals**
- **Own the summaries**
- **Do not own every raw record**

---

## The chosen operating shape

### AIFUT core
Owns:
- tenant/workspace truth
- app registry + connection instances
- parent workflow truth
- child workflow assignments
- capability contracts
- mapping profiles
- sync policies
- approval and execution policy
- health summaries
- marketplace approval truth
- behavior/tracking policy and compact profiles
- normalized performance/revenue summaries

### n8n
Provides:
- child-workflow runtime
- connector execution
- event/sync glue
- visual automation detail

### OpenClaw
Provides:
- natural-language interface
- planning assistance
- specialist-agent execution support
- guided support/remediation conversations

### Perfex / NexovaFlow
Provides:
- CRM/customer operations domain
- leads/contacts/deals/tasks/support execution surfaces

### aff.nexovaflow.com
Provides:
- affiliate/referral/multi-tier commission/payout engine

### MagiCA / e.aifut.net
Provides:
- AI generation engine for text/image/audio/video assets

---

## What not to do now
To move fastest safely, avoid these traps:

1. Do **not** build a full visual automation engine from scratch before using n8n
2. Do **not** let n8n own parent workflow truth
3. Do **not** let Perfex/NexovaFlow become the hidden kernel
4. Do **not** let OpenClaw become the owner of workflow/policy/commercial truth
5. Do **not** pull full raw CRM/affiliate/generation/runtime data into AIFUT core
6. Do **not** model every possible object before shipping the first operating loop
7. Do **not** start with multi-app perfection before one operational use case works end-to-end

---

## The first real operating target
The first target should be a **single working business loop** that proves the control-plane model.

### Recommended target loop
**Affiliate content operating loop**

Because it naturally exercises:
- natural language intent
- parent workflow planning
- generation
- publishing
- affiliate/commercial attribution
- reporting
- optimization

### End-to-end outcome
A user should be able to say:
> Build and run an affiliate content workflow for this offer or niche.

And AIFUT should be able to:
1. create a business goal
2. draft a parent workflow
3. assign child workflows to apps
4. run generation/publish/sync steps
5. gather summarized performance/revenue data
6. explain what happened and what to do next

---

## Smallest viable product slice

### Slice 1 — control plane minimum
Build or harden these first:
1. `AppDefinition`
2. `ConnectionInstance`
3. `CapabilityContract`
4. `MappingProfile`
5. `SyncPolicy`
6. `BusinessGoal`
7. `ParentWorkflow`
8. `ChildWorkflow`
9. `ApprovalPolicy` / `ApprovalRequest`
10. `WorkflowRun` / `ExecutionRun`
11. `IntegrationHealthState`
12. `PerformanceSummary`
13. `RevenueSummary`

### Why this slice
This is the minimum set that lets AIFUT:
- understand the user goal
- decide the app roles
- bind execution to external systems
- observe health
- produce business-level summaries

---

## Fastest integration order

### 1. OpenClaw bridge
Why first:
- gives the natural-language command window quickly
- lets AIFUT accept high-level business intent now
- accelerates the AI-native operator experience immediately

### 2. n8n bridge
Why second:
- avoids re-building commodity automation
- gives connector/runtime value quickly
- provides visual execution detail fast

### 3. MagiCA bridge or aff.nexovaflow bridge
Choose by immediate go-live target:
- choose **MagiCA first** if first visible output must be content generation
- choose **aff.nexovaflow first** if first visible output must be affiliate/commercial attribution

### 4. Perfex/NexovaFlow bridge
Why fourth:
- important, but not required to prove the first affiliate content operating loop
- should enter after the control-plane contracts are stable enough

---

## Recommended data posture

### Keep in AIFUT core
- workflow meaning
- approvals
- app assignments
- summaries
- references
- compact behavior profiles
- marketplace approval state

### Keep as summary/ref only
- CRM lead/contact/deal summaries
- generation job summaries
- commission summaries
- payout summaries
- analytics snapshots
- runtime artifact refs

### Keep external
- full CRM records
- raw affiliate ledger
- raw generation internals
- runtime-native workflow JSON
- raw clickstream forever

### Why this is the fastest safe data model
Because it gives:
- enough structure for orchestration and reporting
- low migration/storage complexity
- lower sync fragility
- easier provider replacement later

---

## Immediate work packages

### Work package A — App registry + connection backbone
Definition:
- stable app catalog
- per-tenant connection instances
- health state baseline

### Work package B — Parent workflow draft backbone
Definition:
- business goal intake
- parent workflow draft object
- child workflow assignment structure

### Work package C — Runtime binding baseline
Definition:
- assign child workflow to app/runtime
- store capability contract + mapping profile + sync policy

### Work package D — Execution/reporting summary loop
Definition:
- track workflow runs
- store integration health
- store performance/revenue summaries
- show operator digest

### Work package E — First end-to-end operating loop
Definition:
- one NL-driven affiliate content loop works from planning to output summary

---

## Recommended first live use case

### Input
User says:
> Create an affiliate video workflow for niche X or offer Y.

### AIFUT flow
1. OpenClaw-assisted intent interpretation
2. AIFUT creates `BusinessGoal`
3. AIFUT drafts `ParentWorkflow`
4. AIFUT creates child workflows such as:
   - research
   - content planning
   - generation
   - publish/sync
   - performance summary
5. AIFUT binds child workflows to:
   - OpenClaw for planning help
   - MagiCA for generation
   - n8n for connector runtime
   - aff.nexovaflow for affiliate attribution if enabled
6. AIFUT records:
   - health
   - execution status
   - summaries
   - next recommendations

### Output
User gets:
- a visible workflow draft
- approvals if needed
- generated outputs
- summarized results
- next suggested actions

---

## Operational sequence from now

### Phase 1 — Freeze architecture and object boundaries
Status: already largely done
- north star
- decision set
- resource integration strategy
- application intake template
- canonical object starter set

### Phase 2 — Build smallest control-plane backbone
Do now
- app registry
- connection instances
- mapping/sync policy baseline
- business goal + parent/child workflow draft model

### Phase 3 — Attach OpenClaw + n8n
Do next
- OpenClaw for NL entry
- n8n for runtime execution and connectors

### Phase 4 — Attach first business engine
Choose one:
- MagiCA first for visible generation value
- aff.nexovaflow first for commercial attribution value

### Phase 5 — Produce first real operator loop
Do next
- affiliate content loop
- report + recommendation summary
- approval checkpoints where required

### Phase 6 — Add CRM lane
Do after first loop works
- Perfex/NexovaFlow bridge
- CRM actions as child workflows

---

## Decision rule for future work
If a future task does not directly help one of these, it is probably too early:
1. app connection backbone
2. workflow truth backbone
3. execution binding backbone
4. reporting summary backbone
5. first real operating loop

---

## Final recommendation
The fastest way to get AIFUT operational now is **not** to build everything.

It is to:
1. keep AIFUT small but authoritative,
2. use OpenClaw for natural language,
3. use n8n for execution/connectors,
4. use domain tools for domain work,
5. keep only canonical + summary + reference data in core,
6. and ship one end-to-end operating loop before broadening.

That path is the safest, lightest, and fastest route to real operation while preserving long-term flexibility.

# Canonical Object Starter Set v1

## Purpose
This document freezes the first practical object boundary for AIFUT.

It answers three questions:
1. which objects must exist in AIFUT core from the beginning;
2. which objects AIFUT should keep only as reference/summary/projection;
3. which objects should remain primarily inside external/domain systems.

The goal is to keep the architecture:
- structurally safe,
- data-light,
- flexible across many apps,
- and fast enough to implement without over-modeling.

## Design rule
AIFUT should only own objects directly when they are needed for one or more of these reasons:
- parent-workflow orchestration
- cross-app coordination
- policy / approval / entitlement enforcement
- reporting / optimization across systems
- marketplace governance
- tenant/workspace control-plane truth

If an object is only useful inside one downstream app, AIFUT should usually keep a summary/reference instead of re-owning the full raw record.

---

# Object ownership tiers

## Tier A — Canonical in AIFUT core
These objects should exist in AIFUT core early because they are load-bearing for orchestration, policy, reporting, and marketplace direction.

## Tier B — Reference / summary / projection in AIFUT
These objects may have AIFUT-side records, but AIFUT should usually store only:
- identity/reference,
- summary fields,
- normalized status,
- reporting aggregates,
- and links to authoritative systems.

## Tier C — Primarily external / domain-owned
These objects should stay mainly in downstream systems unless a later phase proves they must be elevated.

---

# Tier A — Canonical objects AIFUT core should have from the start

## 1. `Tenant`
**Why canonical:** core tenancy boundary.

**Must include:**
- tenant identity
- status
- topology mode
- package/commercial references
- primary domain/subdomain references

## 2. `Workspace`
**Why canonical:** execution and business context boundary within tenant.

**Must include:**
- workspace identity
- tenant link
- status
- workspace role/use type

## 3. `ActorContext` / `Membership`
**Why canonical:** permission, role, action, and attribution boundary.

**Must include:**
- actor identity link
- tenant/workspace scope
- role/policy references
- status

## 4. `BusinessGoal`
**Why canonical:** user intent needs a durable structured home above chat.

**Examples:**
- grow affiliate revenue
- automate lead follow-up
- build content pipeline
- launch marketplace product

**Must include:**
- goal type
- target metrics
- horizon
- business domain
- owner/tenant/workspace scope

## 5. `ParentWorkflow`
**Why canonical:** this is the business operating loop truth.

**Must include:**
- business goal link
- phases
- child workflow references
- approval boundaries
- optimization notes
- current lifecycle state

## 6. `ChildWorkflow`
**Why canonical:** explicit sub-process modeling is required for routing, runtime binding, and reporting.

**Must include:**
- role/type (`research`, `generation`, `publish`, `sync`, `crm-action`, `reporting`, etc.)
- parent workflow link
- assigned app/runtime
- input/output object links
- approval/autonomy mode
- status

## 7. `AppDefinition`
**Why canonical:** AIFUT needs a normalized catalog of integrated app roles/capabilities.

**Must include:**
- app key
- category
- provider
- auth modes
- supported capabilities
- runtime role

## 8. `ConnectionInstance`
**Why canonical:** tenant/workspace-specific integration truth belongs in AIFUT.

**Must include:**
- tenant/workspace owner
- app definition link
- auth/credential reference
- topology/scope
- health state reference
- sync policy reference

## 9. `CapabilityContract`
**Why canonical:** app routing should use stable AIFUT capability language rather than provider-specific terms.

**Examples:**
- create lead
- publish video
- generate asset
- fetch analytics
- create affiliate link
- send message

## 10. `MappingProfile`
**Why canonical:** cross-app field/object mapping is too important to leave as hidden glue.

**Must include:**
- source app/object
- target canonical object or target app/object
- field mapping rules
- transform rules
- version/provenance

## 11. `SyncPolicy`
**Why canonical:** sync direction and authority are core control-plane truth.

**Must include:**
- direction (`pull`, `push`, `bidirectional`, `event-driven`, `manual`)
- source-of-truth notes
- frequency
- conflict strategy
- retry/degraded handling summary

## 12. `ApprovalPolicy`
**Why canonical:** public-facing, destructive, commercial, and high-cost actions need centralized policy.

## 13. `ApprovalRequest`
**Why canonical:** approval state should survive app/runtime failures and stay reviewable.

## 14. `ExecutionPolicy`
**Why canonical:** AIFUT must control autonomy level, budget, safety scope, and allowed runtime behavior.

## 15. `WorkflowRun`
**Why canonical:** durable parent/child execution visibility is necessary.

## 16. `ExecutionRun`
**Why canonical:** runtime-level execution needs persisted state for retries, diagnostics, and reporting.

## 17. `IntegrationHealthState`
**Why canonical:** one operator must be able to manage many systems safely.

## 18. `RemediationSuggestion`
**Why canonical:** health without action guidance is not operationally useful.

## 19. `Offer`
**Why canonical:** AIFUT should own business-level offer meaning across affiliate/content/commercial loops.

**Must include:**
- offer identity
- commercial type/category
- source network/system refs
- target market summary
- monetization/risk summary
- current priority/status

## 20. `Campaign`
**Why canonical:** AIFUT needs a business-level campaign object spanning content, links, revenue, and reporting.

## 21. `ContentPlan`
**Why canonical:** planning must live above generation and distribution tools.

## 22. `AssetRecord`
**Why canonical:** AIFUT needs to know what asset was requested/generated/approved/published without owning all raw generation internals.

**Important:** canonical, but lightweight.

## 23. `PublishRecord`
**Why canonical:** distribution needs a cross-channel record.

## 24. `PerformanceSummary`
**Why canonical:** cross-app optimization requires normalized performance output.

## 25. `RevenueSummary`
**Why canonical:** business optimization and marketplace/commercial decisions need unified revenue truth at summary level.

## 26. `MarketplaceSubmission`
**Why canonical:** user requests to sell/rent/attach products must be controlled by AIFUT.

## 27. `MarketplaceListing`
**Why canonical:** listing truth, status, category, packaging, and governance belong to AIFUT.

## 28. `ListingApprovalReview`
**Why canonical:** review criteria, notes, and approval/rejection state must remain in AIFUT.

## 29. `Recommendation`
**Why canonical:** optimization output should be first-class and explainable.

## 30. `BehaviorProfile`
**Why canonical:** AIFUT should own behavior intelligence summary, not every raw event forever.

## 31. `TrackingPolicy` / `ConsentState`
**Why canonical:** behavior/personalization/ads governance must stay in AIFUT.

---

# Tier B — Objects AIFUT should keep mainly as reference / summary / projection

## 1. `LeadSummary`
AIFUT should usually not own the full CRM lead record initially.

**Keep in AIFUT:**
- external ids
- owner app/system
- status summary
- score/priority if relevant
- workflow/reporting references

## 2. `ContactSummary` / `CustomerSummary`
Keep only the fields needed for orchestration, segmentation, reporting, and app linking.

## 3. `DealSummary`
Keep business-stage and reporting-relevant summary, not the full CRM object history.

## 4. `TaskSummary`
For downstream app tasks/reminders, keep only enough for workflow status and reporting.

## 5. `TicketSummary`
Keep summary/progression if support workflow coordination matters.

## 6. `AffiliateLinkRef`
AIFUT should usually keep:
- link id/ref
- offer/campaign relation
- status
- attribution metadata summary

The full affiliate-engine object remains external.

## 7. `CommissionSummary`
Keep:
- earned/pending/paid summaries
- tier summary
- payout state summary
- attribution links

Not the full external ledger unless later needed.

## 8. `PayoutSummary`
Summary only unless AIFUT later directly manages payout workflow.

## 9. `GenerationJobSummary`
Keep:
- job ref
- requested type
- status
- output refs
- error summary
- cost summary

## 10. `TemplateRef`
For external generation/workflow/template systems, keep AIFUT-side references and classification, not always full source definitions.

## 11. `WorkflowRuntimeArtifactRef`
For n8n or other runtimes, AIFUT should usually keep:
- deployed artifact id
- version/hash
- runtime link
- activation state

Not the provider-native JSON as kernel truth.

## 12. `AnalyticsSnapshotSummary`
Keep normalized cross-platform metrics, not every raw analytics blob.

## 13. `BehaviorEventAggregate`
Keep compact aggregates/scores in AIFUT.

Raw events may exist temporarily elsewhere or in short-lived storage.

## 14. `AppUserSummary`
If external apps have user/member records, keep only the subset needed for cross-system resolution and reporting.

---

# Tier C — Objects that should remain primarily external / domain-owned

## CRM domain objects (primarily Perfex/NexovaFlow or other CRM)
- full lead record details
- full contact/customer profile internals
- full deal/opportunity history
- full task internals
- full ticket threads
- full invoice/estimate/proposal internals
- full project/task substructures unless later elevated

## Affiliate engine objects (primarily aff.nexovaflow or equivalent)
- raw click ledger
- raw commission ledger rows
- raw payout processing internals
- affiliate account internal configuration details
- partner payout settlement details

## Generation engine objects (primarily MagiCA or equivalent)
- raw prompt-chain internals
- intermediate render artifacts
- queue internals
- provider-specific model execution details
- temporary media pipelines

## Workflow runtime objects (primarily n8n or equivalent)
- runtime-native workflow JSON as the only truth
- runtime-native node graph details
- internal execution engine bookkeeping
- low-level connector task artifacts

## Agent runtime internals (primarily OpenClaw or other agent runtime)
- transient conversation state not needed for AIFUT truth
- tool-call internals unless elevated into audit/reporting artifacts
- provider-specific subagent state unless required for acceptance/audit

## Platform-specific raw analytics blobs
- raw provider payloads from every channel/system
- full clickstream forever
- full behavior raw event archive without retention policy

---

# Practical starter model by app

## Perfex / NexovaFlow
### AIFUT canonical:
- ConnectionInstance
- MappingProfile
- SyncPolicy
- ChildWorkflow links
- LeadSummary / ContactSummary / DealSummary
- CRM-related Recommendation / Approval / WorkflowRun references

### External:
- full CRM records
- task/ticket/details internals
- invoice/proposal/project internals initially

## aff.nexovaflow
### AIFUT canonical:
- Offer
- Campaign
- AffiliateLinkRef
- CommissionSummary
- RevenueSummary
- marketplace attribution summaries

### External:
- full affiliate ledger
- payout engine internals
- partner account internals

## MagiCA
### AIFUT canonical:
- ContentPlan
- AssetRecord
- GenerationJobSummary
- output refs
- cost/status summaries

### External:
- generation queue internals
- provider-specific media internals
- full template internals unless later imported

## n8n
### AIFUT canonical:
- ParentWorkflow
- ChildWorkflow
- CapabilityContract
- WorkflowRuntimeArtifactRef
- ExecutionRun summaries
- IntegrationHealthState

### External:
- provider-native workflow JSON
- connector runtime internals

## OpenClaw
### AIFUT canonical:
- BusinessGoal
- ParentWorkflow draft
- Recommendation
- ApprovalRequest
- structured NL interpretation artifacts

### External:
- transient chat/runtime internals unless promoted into accepted deliverables or audit artifacts

---

# Immediate modeling priorities

## Must model first
1. Tenant
2. Workspace
3. Membership / ActorContext
4. AppDefinition
5. ConnectionInstance
6. CapabilityContract
7. MappingProfile
8. SyncPolicy
9. BusinessGoal
10. ParentWorkflow
11. ChildWorkflow
12. ApprovalPolicy / ApprovalRequest
13. ExecutionPolicy
14. WorkflowRun / ExecutionRun
15. IntegrationHealthState / RemediationSuggestion
16. Offer
17. Campaign
18. ContentPlan
19. AssetRecord
20. PublishRecord
21. PerformanceSummary
22. RevenueSummary
23. MarketplaceSubmission / MarketplaceListing / ListingApprovalReview
24. BehaviorProfile / TrackingPolicy / ConsentState
25. Recommendation

## Delay full ownership of these
- full CRM internals
- full affiliate ledgers
- raw generation internals
- runtime-native workflow JSON
- raw behavior archive at full depth

---

# Final decision
AIFUT core should be intentionally small in raw data ownership but strong in control, orchestration, policy, summaries, and optimization.

In short:
- own the **meaning**,
- own the **workflow**,
- own the **policy**,
- own the **approval**,
- own the **reporting summaries**,
- own the **marketplace governance**,
- but do not eagerly own every downstream app's raw internals.

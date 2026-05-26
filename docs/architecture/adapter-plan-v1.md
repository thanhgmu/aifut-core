# Adapter Plan v1

## Purpose
This document defines the first practical adapter plan for the five primary systems around AIFUT:
- OpenClaw
- n8n
- MagiCA / e.aifut.net
- aff.nexovaflow.com
- Perfex / NexovaFlow

The goal is to move from architecture direction into implementation-ready integration slices.

## Core rule
Every adapter must:
- implement AIFUT capability contracts,
- preserve AIFUT as source of workflow/policy/commercial truth,
- expose health/remediation,
- return normalized summary data,
- isolate provider-specific changes from the kernel.

---

# 1. OpenClaw Adapter

## Primary role
Natural-language entry and specialist-agent runtime support.

## First capabilities
- `interpret_business_intent`
- `draft_parent_workflow`
- `draft_child_workflows`
- `generate_recommendation`
- `explain_remediation`

## Input from AIFUT
- actor/tenant/workspace context
- user prompt
- current app connections
- allowed capability scope
- budget/autonomy policy

## Output back to AIFUT
- `BusinessGoal` draft fields
- `ParentWorkflow` draft structure
- `ChildWorkflow` draft suggestions
- recommendation/explanation artifacts
- risk/clarification flags

## Minimum adapter slice
1. send structured prompt + context
2. receive normalized JSON draft
3. store draft in AIFUT objects
4. require approval before activation beyond safe scope

## Do not let OpenClaw own
- canonical workflow state
- approval truth
- commercial truth

---

# 2. n8n Adapter

## Primary role
Child-workflow runtime and connector execution layer.

## First capabilities
- `deploy_child_workflow`
- `activate_workflow`
- `deactivate_workflow`
- `run_test`
- `fetch_runtime_status`
- `fetch_run_summary`

## Input from AIFUT
- child workflow definition
- capability contract
- mapping profile
- sync policy
- runtime config refs

## Output back to AIFUT
- runtime artifact ref
- run status/events
- error summary
- activation state
- health hints

## Minimum adapter slice
1. compile AIFUT child workflow into runtime artifact
2. deploy to n8n
3. store `WorkflowRuntimeArtifactRef`
4. poll or receive run summary
5. normalize status into `ExecutionRun`

## Do not let n8n own
- parent workflow truth
- canonical approval state
- business meaning of the workflow

---

# 3. MagiCA Adapter

## Primary role
Generation engine for content assets.

## First capabilities
- `create_generation_job`
- `fetch_generation_status`
- `fetch_generation_outputs`
- `fetch_template_refs`

## Input from AIFUT
- `ContentPlan`
- asset type request
- prompt/template refs
- budget/safety options

## Output back to AIFUT
- `GenerationJobSummary`
- output asset refs
- cost summary
- status/error summary

## Minimum adapter slice
1. submit generation job from `ContentPlan`
2. store external job ref
3. map outputs into `AssetRecord`
4. return generation summary for reporting

## Do not let MagiCA own
- campaign truth
- workflow truth
- cross-app performance truth

---

# 4. aff.nexovaflow Adapter

## Primary role
Affiliate/referral/commission engine.

## First capabilities
- `create_affiliate_link_ref`
- `fetch_commission_summary`
- `fetch_payout_summary`
- `fetch_referral_tree_summary`

## Input from AIFUT
- `Offer`
- `Campaign`
- tracking context
- listing/commercial refs where relevant

## Output back to AIFUT
- `AffiliateLinkRef`
- `CommissionSummary`
- payout summary
- attribution summary

## Minimum adapter slice
1. create or sync affiliate link context for campaign
2. ingest commission summary into AIFUT
3. expose payout/referral summary in dashboards

## Do not let affiliate engine own
- marketplace listing approval truth
- product governance truth
- package attachment truth

---

# 5. Perfex / NexovaFlow Adapter

## Primary role
CRM/customer-ops domain adapter.

## First capabilities
- `fetch_lead_summaries`
- `fetch_contact_summaries`
- `create_lead`
- `create_task`
- `append_note`
- `update_deal_stage` (approval-gated)

## Input from AIFUT
- child workflow action request
- mapped lead/contact/task fields
- approval state where required

## Output back to AIFUT
- `LeadSummary`
- `ContactSummary`
- `DealSummary`
- task/note action result summary
- health/remediation state

## Minimum adapter slice
1. connect CRM account
2. fetch lightweight summaries
3. allow safe create-task/create-note actions
4. add lead create/update after mappings stabilize

## Do not let Perfex/NexovaFlow own
- platform kernel truth
- parent workflow truth
- behavior intelligence backbone

---

# Recommended implementation order
1. OpenClaw adapter
2. n8n adapter
3. MagiCA adapter
4. aff.nexovaflow adapter
5. Perfex/NexovaFlow adapter

## Why this order
- OpenClaw gives immediate NL control
- n8n gives immediate execution/connectors
- MagiCA gives visible output fast
- affiliate engine adds commercial attribution
- CRM lane is important but can follow after first operating loop works

---

# Shared adapter requirements
Every adapter should expose:
- adapter key/version
- capability list
- health check
- verification status
- degraded mode flag
- remediation suggestion(s)
- external refs for audit/troubleshooting

---

# First code slices implied by this plan
1. `AppDefinition` seed set for the 5 systems
2. `ConnectionInstance` CRUD + verification baseline
3. adapter interface definitions in shared contracts
4. OpenClaw draft ingestion path
5. n8n runtime artifact path
6. MagiCA job summary path
7. affiliate summary ingest path
8. CRM summary ingest path

## Final note
The job of v1 adapters is not perfect depth.
The job is to get one real operating loop live without sacrificing kernel control or data discipline.

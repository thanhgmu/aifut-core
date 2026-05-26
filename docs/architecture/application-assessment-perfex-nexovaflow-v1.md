# Application Assessment v1 — Perfex / NexovaFlow

## Status
Provisional assessment based on currently available source notes, public product references, and the locked AIFUT architecture direction.

## Assessment summary
Perfex / NexovaFlow should be integrated into AIFUT as a **CRM / customer-operations domain provider**, not as a platform core.

This is the safest and fastest use of the system because it lets AIFUT reuse real CRM capabilities quickly while preserving:
- AIFUT control-plane truth
- workflow truth
- marketplace/commercial truth
- behavior/personalization truth
- cross-app reporting and optimization ownership

## Strategic role in AIFUT
### Recommended role
- CRM / customer ops domain
- lead/contact/deal/task/support execution surface
- optional tenant-app package inside the AIFUT ecosystem
- downstream system for CRM-oriented child workflows

### Explicitly not allowed to become
- AIFUT kernel/control-plane source of truth
- parent workflow source of truth
- universal data store for all AIFUT business objects
- behavior intelligence backbone
- marketplace approval core

## What is currently known
Based on the current source notes:
- Perfex CRM is the underlying product line being referenced
- NexovaFlow should be treated as the commercial/operator identity built on the Perfex lane
- public/demo references exist
- REST API appears available as a purchasable/attachable extension path
- wider plugin/module ecosystem exists
- the system likely already covers many CRM fundamentals that AIFUT should not rebuild first

## Capability value to AIFUT
Perfex / NexovaFlow can likely accelerate AIFUT in these areas:
1. lead/contact/customer management
2. deal / pipeline operations
3. tasks and reminders
4. notes and follow-up execution
5. support/ticket-like operator flows
6. internal operator/customer-success work surfaces

## What AIFUT should read from this system first
### Phase 1 read targets
- lightweight lead summaries
- lightweight contact/customer summaries
- lightweight deal summaries
- task/reminder summaries where useful
- status/stage metadata for reporting and workflow branching

### Why summaries first
AIFUT does not need full CRM internals to start deriving cross-app value.
Summary-first ingestion is lighter, faster, and safer.

## What AIFUT should write to this system first
### Safe first writes
- create task/reminder
- append note/comment/summary
- create lead under mapped fields

### Later gated writes
- update lead/contact
- update deal stage/value (approval-aware)
- create follow-up workflow triggers

### Avoid first
- destructive record changes
- large-scale migration writes
- deep CRM lifecycle ownership

## Canonical object impact
### AIFUT core should own
- `ConnectionInstance`
- `CapabilityContract`
- `MappingProfile`
- `SyncPolicy`
- `ChildWorkflow` bindings for CRM actions
- `WorkflowRun` / `ExecutionRun`
- `IntegrationHealthState`
- `Recommendation`

### AIFUT should keep as summary/ref
- `LeadSummary`
- `ContactSummary`
- `CustomerSummary`
- `DealSummary`
- `TaskSummary`
- `TicketSummary` if needed later

### Perfex / NexovaFlow should keep as primary owner
- full lead/contact/deal records
- full task internals
- full ticket threads
- invoice/proposal/project internals
- app-specific workflow internals

## First child-workflow roles this app should support
- `crm_read_summary`
- `crm_create_lead`
- `crm_create_task`
- `crm_append_note`
- `crm_update_deal_stage` (later, approval-gated)
- `crm_report_summary`

## First capability contracts AIFUT should define for this adapter
- `fetch_lead_summaries`
- `fetch_contact_summaries`
- `fetch_deal_summaries`
- `create_lead`
- `create_task`
- `append_note`
- `update_deal_stage`

## Data sync shape
### Recommended initial sync direction
- read-heavy first
- selective write second
- no bidirectional deep sync at the start

### Initial stance
- AIFUT pulls CRM summaries as needed or on schedule
- AIFUT pushes explicit action commands for safe task/lead/note writes
- AIFUT does not try to mirror the full CRM database

## Health / upgrade risk posture
### Main risk
Perfex-based systems often become dangerous when teams couple tightly to internals or custom DB assumptions.

### Safe posture
- prefer documented API/module boundaries first
- isolate any custom integration behind a dedicated adapter layer
- never let raw Perfex structure leak into AIFUT canonical objects
- normalize all outputs into AIFUT summaries/contracts

## Recommended first adapter slice
### Slice name
`perfex-nexovaflow-summary-and-task-bridge`

### Scope
1. connect one CRM instance via `ConnectionInstance`
2. verify health/auth
3. fetch lead/contact/deal summaries
4. create task and append note from AIFUT workflow actions
5. store run/health summaries in AIFUT

### Why this slice first
- low structural risk
- immediately useful
- proves CRM domain integration without surrendering core truth
- enough to support real operator workflows later

## Recommended build depth now
### Integrate now?
Yes.

### Depth now
- read-only summaries + a few safe writes

### Depth later
- richer lead/deal/task actions
- approval-aware deal movement
- CRM-linked reporting packs
- tenant-app package treatment if commercialization needs it

## Final recommendation
Perfex / NexovaFlow should be used as a **downstream CRM action surface and customer-ops domain tool**. That gives AIFUT the fastest practical CRM leverage without corrupting the architecture.

The right first move is not deep CRM takeover.
The right first move is:
- summary ingestion
- safe task/note/lead actions
- adapter boundary
- health/remediation coverage
- AIFUT-owned workflow and reporting context

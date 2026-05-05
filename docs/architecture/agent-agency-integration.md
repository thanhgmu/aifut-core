# Agent agency integration pattern

## Clarified intent

The strategic point is not to depend on `msitarzewski/agency-agents` specifically. The important capability is that AIFUT-core should let users create, combine, and operate specialist agent teams by natural language, then attach those agents to real business systems such as NexovaFlow/Perfex, CRM, ecommerce, LMS, marketing, and support tools.

The external `agency-agents` repository can be used only as inspiration / seed examples for specialist roles. It must not become AIFUT kernel truth.

## AIFUT interpretation

AIFUT-core should support an "AI agency builder" capability:

> User describes a business goal in natural language, AIFUT converts it into a parent workflow, selects or creates specialist child agents, connects them to the required apps, applies approval/autonomy policy, executes the workflow, and reports results.

AIFUT owns:
- tenant/workspace/actor context
- task/brief truth
- approval and autonomy policy
- token/cost budget
- memory and data-access boundaries
- audit trail
- deliverable acceptance state
- marketplace/package/commission truth
- connected-app command/action policy

Specialist agents provide:
- domain-specific reasoning style
- task decomposition
- implementation/review/research output
- business actions through approved connectors
- reports and recommendations

## Natural-language creation flow

Example user command:

> "Tạo cho tôi một team Sales AI để tìm lead, chấm điểm, nhập CRM, nhắc sales follow-up, và báo cáo doanh thu hằng ngày."

AIFUT should transform this into:

1. Intent interpretation
   - business goal: sales pipeline automation
   - target systems: NexovaFlow/Perfex CRM, email/chat, analytics dashboard
   - risk level: medium/high because it can write CRM data and contact customers

2. Agent team proposal
   - Sales Strategist Agent
   - Lead Research Agent
   - CRM Data Operator Agent
   - Follow-up Coordinator Agent
   - Sales Reporting Agent
   - Compliance/Approval Guard Agent

3. Workflow graph
   - collect/import leads
   - deduplicate contacts
   - enrich lead data
   - score leads
   - create/update CRM records
   - assign owner/status/pipeline stage
   - trigger follow-up tasks or sequences
   - generate daily/weekly reports

4. Permission and approval policy
   - read CRM: allowed
   - create lead/contact: auto if confidence high
   - update deal value/stage: ask approval above threshold
   - send external message: ask approval unless pre-approved template/campaign
   - delete/archive records: manual approval only

5. Runtime binding
   - parent workflow truth stays in AIFUT
   - CRM action execution happens through NexovaFlow/Perfex connector/bridge
   - optional child automation happens through n8n/OpenClaw/other runtime

6. Monitoring and report
   - action logs
   - sync health
   - cost/token usage
   - leads created/updated
   - follow-ups completed
   - pipeline movement
   - revenue/conversion metrics

## CRM / NexovaFlow / Perfex use case

When the task relates to CRM, AIFUT can combine specialist agents with NexovaFlow/Perfex as the execution surface.

Possible actions:
- read customers/leads/deals/tasks/notes
- create or update leads/contacts
- create tasks, reminders, appointments
- move pipeline stages under approval policy
- attach notes/summaries to CRM records
- trigger internal Perfex/NexovaFlow workflows
- generate CRM reports and push them back into NexovaFlow/Perfex or show them in AIFUT dashboard

Required boundary:
- AIFUT owns the parent workflow, permission policy, audit, package/token cost, and marketplace/commercial truth.
- NexovaFlow/Perfex executes CRM-specific operations through an upgrade-safe adapter/API/module bridge.
- AIFUT should not directly depend on unstable Perfex internals as kernel truth.

## Integration shape

### 1. Agent capability catalog
Represent each agent as metadata:
- key
- division/category, e.g. Sales Division, Marketing Division, Engineering Division
- specialty
- when-to-use rules
- required tools/data scopes
- expected deliverables
- quality gates
- cost profile
- allowed autonomy level
- connected-app action permissions

### 2. Parent workflow orchestration
AIFUT parent workflows can assign child tasks to specialist agents such as:
- Sales Strategist
- Lead Researcher
- CRM Operator
- Proposal Writer
- Follow-up Coordinator
- Reporting Analyst
- Backend Architect
- Security Engineer
- UX Researcher

Each child task should have:
- goal
- inputs/context
- allowed tools
- connected-app permissions
- data access scope
- max token/budget
- approval checkpoints
- output schema
- acceptance criteria

### 3. Runtime adapters
AIFUT should not depend on one agent runtime. Supported adapters can include:
- AIFUT native agent runner
- OpenClaw subagents
- n8n workflow bridge
- external agent API
- local/tenant-hosted runner
- manual/human specialist fallback
- NexovaFlow/Perfex CRM bridge for CRM actions

### 4. Marketplace usage
Agent teams and workflows can become marketplace products:
- "Sales AI Team for Perfex/NexovaFlow"
- "Lead research + CRM update automation"
- "Daily CRM report assistant"
- "Customer care follow-up automation"
- free templates
- paid/rental workflow teams
- setup/support packages
- tenant-specific private agent packs

AIFUT should approve/publish these packs and track usage/commission through AIFUT-owned marketplace/ledger models.

## Required AIFUT additions

1. `AgentCapability` model / contract
2. `AgentTeamTemplate` model for reusable divisions/teams
3. `AgentTask` / child-workflow execution record
4. `AgentRuntimeAdapter` abstraction
5. `ConnectedAppActionContract` for safe CRM/ecommerce/LMS actions
6. autonomy/approval policy per agent task and per app action
7. token/cost budget and usage metering
8. deliverable review/acceptance state
9. memory/data-access isolation rules
10. agent/team marketplace listing support
11. NexovaFlow/Perfex CRM action bridge

## Strategic decision

Yes: AIFUT-core should be able to create an agency-agent style operating team through natural language. The right model is parent workflow in AIFUT + specialist child agents + connector/action bridge into apps such as NexovaFlow/Perfex.

This is highly aligned with the existing AIFUT direction because it turns natural-language orchestration into practical business execution instead of only chat output.

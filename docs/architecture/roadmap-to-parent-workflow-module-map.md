# Roadmap-to-Parent-Workflow Module Map

## Purpose
This document turns the new AIFUT architecture lock into concrete module and API candidates.

The goal is simple:
- an operator provides a roadmap, process, screenshot, slide, or natural-language brief
- `aifut-core` interprets it into structured business intent
- the kernel proposes a parent workflow
- the kernel assigns child workflows to internal modules and integrated apps
- the kernel proposes dataflow direction, automation boundaries, and optimization tradeoffs

## Kernel-owned outcome
AIFUT should be able to output a draft coordination plan containing:
- phases
- goals
- steps
- handoffs
- decision gates
- data objects
- app assignments
- child workflows
- one-way / two-way / event-driven dataflow edges
- human approval checkpoints
- optimization notes

This is kernel truth, not adapter truth.

## Proposed module candidates

### 1. RoadmapIngestionModule
Responsibilities:
- accept roadmap input as text, markdown, JSON, uploaded image metadata, or extracted OCR text
- normalize the source into a common ingestion payload
- preserve source provenance for review/audit
- support multiple source kinds: `text`, `diagram`, `slide`, `screenshot`, `mixed`

Initial service candidates:
- `RoadmapIngestionService`
- `RoadmapNormalizationService`

Initial endpoint candidates:
- `POST /orchestration/roadmaps/ingest`
- `POST /orchestration/roadmaps/ingest-preview`

Initial output contract:
- `RoadmapSource`
- `NormalizedRoadmapDraft`

### 2. RoadmapInterpretationModule
Responsibilities:
- extract phases, milestones, objectives, loops, dependencies, roles, and outcomes
- classify each step by business function
- detect candidate automation points and human-required points
- detect candidate KPIs such as revenue, conversion, time reduction, labor reduction, and quality/risk constraints

Initial service candidates:
- `RoadmapInterpretationService`
- `RoadmapPhaseClassifier`
- `RoadmapGoalExtractionService`

Initial endpoint candidates:
- `POST /orchestration/roadmaps/:draftId/interpret`
- `GET /orchestration/roadmaps/:draftId/interpretation`

Initial output contract:
- `RoadmapInterpretation`
- `PhaseNode`
- `GoalNode`
- `DecisionGate`
- `AutomationOpportunity`

### 3. ParentWorkflowPlanningModule
Responsibilities:
- synthesize a parent workflow from the interpreted roadmap
- define child workflow boundaries
- choose orchestration ownership between first-party kernel actions and external apps/runtimes
- define dependency edges and execution order
- mark approval boundaries and exception paths

Initial service candidates:
- `ParentWorkflowPlanningService`
- `ChildWorkflowAssignmentService`
- `ApprovalBoundaryPlanner`

Initial endpoint candidates:
- `POST /orchestration/plans/draft`
- `GET /orchestration/plans/:planId`
- `POST /orchestration/plans/:planId/replan`

Initial output contract:
- `ParentWorkflowPlan`
- `ChildWorkflowPlan`
- `ApprovalCheckpoint`
- `ExecutionEdge`

### 4. AppCoordinationModule
Responsibilities:
- map workflow steps to AIFUT-native modules, connectors, and downstream systems
- describe system roles: `system-of-record`, `execution-runtime`, `engagement-surface`, `analytics-sink`, `local-tool`, `operator-surface`
- propose connector/runtime usage such as NexovaFlow, n8n, CRM, LMS, Sheets, messaging, or local apps

Initial service candidates:
- `AppCoordinationService`
- `SystemRoleAssignmentService`
- `ConnectorFitScoringService`

Initial endpoint candidates:
- `POST /orchestration/plans/:planId/app-coordination`
- `GET /orchestration/plans/:planId/app-coordination`

Initial output contract:
- `AppCoordinationProposal`
- `SystemRoleAssignment`
- `ConnectorRecommendation`

### 5. DataflowModelingModule
Responsibilities:
- define data objects crossing each system boundary
- classify edge direction: `pull`, `push`, `bidirectional`, `event-driven`, `manual-sync`
- track source of truth and sync ownership per object
- mark whether the edge should be real-time, batched, or human-mediated

Initial service candidates:
- `DataflowModelingService`
- `SyncDirectionPolicyService`
- `SourceOfTruthPlanner`

Initial endpoint candidates:
- `POST /orchestration/plans/:planId/dataflow`
- `GET /orchestration/plans/:planId/dataflow`

Initial output contract:
- `DataflowGraph`
- `DataflowEdge`
- `BusinessObjectFlow`
- `SyncPolicyDraft`

### 6. OptimizationSummaryModule
Responsibilities:
- compare candidate plan variants
- score tradeoffs across cost, complexity, time, operator effort, revenue impact, and automation depth
- avoid blind over-automation when a leaner hybrid design is better
- explain why one design is preferred

Initial service candidates:
- `OptimizationSummaryService`
- `PlanVariantScoringService`
- `OperationalComplexityEstimator`

Initial endpoint candidates:
- `POST /orchestration/plans/:planId/optimize`
- `GET /orchestration/plans/:planId/optimization-summary`

Initial output contract:
- `OptimizationSummary`
- `PlanVariantScore`
- `TradeoffExplanation`

### 7. ParentWorkflowGraphModule
Responsibilities:
- expose the visually renderable graph of the parent workflow
- support phase lanes, app lanes, approval nodes, dataflow edges, and KPI overlays
- remain UI-agnostic while preserving graph truth in the backend

Initial service candidates:
- `ParentWorkflowGraphService`
- `WorkflowGraphProjectionService`

Initial endpoint candidates:
- `GET /orchestration/plans/:planId/graph`
- `GET /orchestration/plans/:planId/graph/summary`

Initial output contract:
- `WorkflowGraph`
- `GraphNode`
- `GraphEdge`
- `GraphLane`

## Proposed first-pass domain objects
- `RoadmapSource`
- `NormalizedRoadmapDraft`
- `RoadmapInterpretation`
- `ParentWorkflowPlan`
- `ChildWorkflowPlan`
- `AppCoordinationProposal`
- `DataflowGraph`
- `OptimizationSummary`
- `WorkflowGraph`

## Relationship to existing modules

### Strongest existing dependencies
- `TenancyModule`: tenant/workspace scoping for plans
- `IntegrationsModule`: connector/connection inventory for downstream system assignment
- `EntitlementsModule`: package/resource gating for recommendations
- `OrchestrationModule`: likely long-term home for parent-workflow planning APIs
- `AuditModule`: plan provenance, approval, and revision history

### Important rule
These new orchestration-planning modules should **consume** integration and entitlement truth.
They should not re-own tenancy, package, connector, or diagnostics truth.

## Recommended implementation order
1. Add roadmap + plan draft contracts to `OrchestrationModule`
2. Create a read/write-safe draft model for roadmap ingestion and interpretation
3. Add parent-workflow plan synthesis using current connector/tenant/package truth
4. Add dataflow modeling and optimization summary
5. Add graph projection for UI rendering

## Smallest practical first code slice
The best first implementation slice after this doc is:
- add orchestration draft DTOs/contracts
- add `POST /orchestration/roadmaps/ingest`
- add `POST /orchestration/plans/draft`
- return structured placeholder/draft payloads rooted in tenant/workspace context

That slice is small, kernel-aligned, and creates a clean backbone for later NL interpretation and visual graph work.

# Natural-Language Business Blueprint Preview

Use this endpoint when a tenant asks AIFUT to turn a natural-language business request into a reviewable operating-system draft.

The endpoint is intentionally preview-only. It does not start external workflows, send messages, place orders, publish content, or activate connectors.

## Endpoint

```http
POST /orchestration/business-systems/draft-preview
```

## Context

Pass actor context through headers when calling from a client surface:

```http
x-tenant-slug: demo-tenant
x-user-email: operator@example.com
x-workspace-slug: vietnam-commerce-lab
```

The controller also accepts the same tenant, user, and workspace values through query parameters or body fields, but headers are preferred for client integrations.

## Request Example

```json
{
  "naturalLanguageBrief": "I am in Vietnam and want AIFUT to help me choose a product, find suppliers, create content, distribute campaigns, sell, operate fulfillment, and retain customers in a closed loop.",
  "constraints": [
    "low-starting-capital",
    "operator-approval-before-customer-facing-actions",
    "avoid-lock-in"
  ],
  "preferredSystems": [
    "n8n",
    "nexovaflow",
    "google-sheets",
    "zalo",
    "facebook"
  ],
  "businessObjects": [
    "product-candidate",
    "supplier",
    "content-asset",
    "lead",
    "order",
    "customer"
  ],
  "priorities": ["time-to-first-sale", "cost-control", "measurable-roi"],
  "lanes": [
    "market-research",
    "supplier-validation",
    "content",
    "sales",
    "fulfillment",
    "customer-success"
  ]
}
```

## Response Fields To Render

The response envelope contains:

```json
{
  "capability": "orchestration",
  "status": "business-system-blueprint-drafted",
  "context": {},
  "businessSystemBlueprint": {},
  "next": [
    "review-business-assumptions",
    "collect-missing-inputs",
    "approve-parent-workflow-draft"
  ]
}
```

Client surfaces should render these `businessSystemBlueprint` fields first:

- `reviewSummary.status`: whether the draft can be activated yet.
- `reviewSummary.blockers`: missing runtime bindings, approval channels, source-of-truth assignments, and synchronization policies.
- `reviewSummary.nextActions`: ordered setup checklist for the operator.
- `reviewSummary.runtimeBindingSetupQueue`: per-workflow setup rows for assigning each lifecycle phase to a configured runtime and system boundary.
- `reviewSummary.runtimeBindingSetupQueue[].requiredInputs`: operator-facing setup inputs that must be collected before a row can move beyond preview, including runtime key, connection key, trigger mode, and approval checkpoint confirmation when relevant.
- `reviewSummary.runtimeBindingSetupQueue[].previewOnly`: expected to remain `true`; these rows describe setup work and must not be treated as executable automation commands.
- `reviewSummary.decisions`: counts of configured, unresolved, and intentionally deferred setup decisions.
- `executionPolicy.mode`: expected to remain `preview-only`.
- `executionPolicy.externalActionsAllowed`: expected to remain `false`.
- `executionPolicy.approvalRequiredBeforeActivation`: expected to remain `true`.
- `businessLifecycle.phases`: closed-loop business phases from discovery through customer-success feedback.
- `workflowGraph.nodes` and `workflowGraph.edges`: renderable graph projection for UI diagrams.
- `appCoordination.systemAssignments`: suggested app/system boundaries that still require review.
- `dataflow.edges`: business-object movement between phases, without final source-of-truth claims.
- `executionContractDraft.activationReadiness`: detailed activation blockers and setup state.
- `executionContractDraft.activationReadiness.runtimeBindingSetupQueue`: the same runtime-binding setup queue with workflow, system-boundary, approval-checkpoint, and blocker-resolution metadata.

## Safety Contract

Treat the preview as a draft contract, not a runnable automation.

Candidate runtime-binding values can be reviewed through:

```text
POST /orchestration/business-systems/runtime-binding-setup-preview
```

That setup endpoint is also preview-only. It lets an operator edit candidate runtime, connection, trigger, and optional approval-checkpoint values for a selected setup queue row, then refresh the review draft:

```json
{
  "planId": "plan:acme:ops:business-system-blueprint",
  "setupKey": "plan:acme:ops:business-system-blueprint:runtime-binding:market-discovery",
  "workflowKey": "market-discovery",
  "systemBoundaryKey": "research-intelligence",
  "runtimeKey": "runtime:research-intelligence",
  "connectionKey": "connection:research-intelligence:operator-draft",
  "triggerMode": "manual-review",
  "approvalCheckpointKey": "approve-market-research"
}
```

Required review inputs are `planId`, `workflowKey`, `systemBoundaryKey`, `runtimeKey`, `connectionKey`, and `triggerMode`. Allowed trigger modes are `manual-review`, `scheduled`, and `event-driven`. `setupKey` and `approvalCheckpointKey` are optional.

The response envelope contains `runtimeBindingSetupReview`. Render these fields for the operator:

- `reviewStatus`: `ready-for-operator-review` when required inputs are present and valid, otherwise `blocked-pending-inputs`.
- `candidateRuntimeBinding`: the normalized candidate values being reviewed.
- `operatorDecisionState`: bounded decision state for the operator review, including allowed draft decisions, audit intent key, and the activation boundary.
- `blockers`, `nextActions`, and `inputSummary`: missing or invalid input details and the required next review step.
- `previewOnly`: always `true`.
- `externalActionsAllowed`: always `false`.
- `activationAllowed`: always `false`.

Refreshing this preview does not activate a workflow, persist the candidate binding, or dispatch a connector or other external action. A `ready-for-operator-review` result means the candidate inputs can be reviewed; it is not an activation-ready or persisted runtime binding.

When required inputs are valid, `operatorDecisionState.status` is `awaiting-operator-decision` and `allowedDecisions` is limited to `approve-for-contract-draft`, `request-changes`, and `defer`. Those values classify the reviewed draft only. They must be carried into a later activation-capable execution contract before anything can persist or run.

When setup inputs are missing or invalid, `operatorDecisionState.status` is `blocked-before-decision` and the only allowed decision is `revise-inputs`.

## Setup Key Consistency

Each setup queue row publishes a `setupKey` derived from its plan and workflow:

```text
{planId}:runtime-binding:{workflowKey}
```

When `planId` and `workflowKey` are present, the setup-preview response returns that derived value as `expectedSetupKey`.

- If `setupKey` is omitted, the response uses `expectedSetupKey` as `setupKey`.
- If a submitted `setupKey` matches `expectedSetupKey`, it can proceed through normal input review.
- If a submitted `setupKey` conflicts with the supplied `planId` and `workflowKey`, the response preserves the submitted `setupKey`, returns the derived `expectedSetupKey`, sets `reviewStatus` to `blocked-pending-inputs`, and reports `invalid-setupKey` in `blockers` and `setupKey` in `inputSummary.invalidInputKeys`.

Example mismatch response fields:

```json
{
  "setupKey": "plan:acme:ops:business-system-blueprint:runtime-binding:sales-conversion",
  "expectedSetupKey": "plan:acme:ops:business-system-blueprint:runtime-binding:market-discovery",
  "reviewStatus": "blocked-pending-inputs",
  "previewOnly": true,
  "externalActionsAllowed": false,
  "activationAllowed": false,
  "blockers": ["invalid-setupKey"],
  "inputSummary": {
    "invalidInputKeys": ["setupKey"]
  }
}
```

Before activation, a client or operator must resolve:

- Runtime bindings for each child workflow.
- Approval delivery channels for manual-review checkpoints.
- Source-of-truth assignments for business objects.
- Synchronization policies between connected systems.
- Human approval for customer-facing content, supplier selection, and fulfillment exceptions.

If any of those are unresolved, the client should show the draft as blocked or review-required. Do not present it as ready to run.

## Minimal Client Flow

```text
Natural-language request
-> POST draft-preview
-> render reviewSummary first
-> render lifecycle and workflow graph
-> collect missing bindings and approval channels
-> let the operator edit candidate setup values
-> POST runtime-binding-setup-preview to refresh each candidate review draft
-> ask operator to approve or revise
-> submit a separate runtime plan only after readiness clears
```

This keeps AIFUT useful for business-system design while preventing activation, persistence, or external actions from a blueprint or setup-preview request.

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
  "priorities": [
    "time-to-first-sale",
    "cost-control",
    "measurable-roi"
  ],
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
-> ask operator to approve or revise
-> submit a separate runtime plan only after readiness clears
```

This keeps AIFUT useful for business-system design while preventing accidental external actions from a single chat prompt.

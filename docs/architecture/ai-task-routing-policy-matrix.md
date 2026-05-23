# AI task routing policy matrix

## Purpose

This matrix turns AI cost strategy into enforceable routing rules.

Default principle:
- start with the lowest-cost sufficient lane
- keep context minimal
- require validation
- escalate only by explicit trigger

## Model tiers

- **Tier 0**: no-model / deterministic
- **Tier 1**: cheap model or local/open-weight model
- **Tier 2**: balanced cloud model
- **Tier 3**: premium reasoning model
- **Tier B**: async/batch lane using the cheapest acceptable tier

## Global routing rules

1. No feature may bypass the AI gateway.
2. Every task must declare `taskType`, `riskLevel`, `qualityRequirement`, `latencyBudget`, and `costBudgetClass`.
3. If a Tier 0 path exists and quality is acceptable, use Tier 0.
4. If a cached artifact satisfies the request, prefer cache over inference.
5. Premium tier usage must be metered and policy-visible.
6. Quota pressure should trigger downgrade, async deferral, or approval before premium escalation.

## Policy matrix

| Task type | Default tier | Escalate to | Use cache? | Context rule | Validation rule | Budget posture |
|---|---:|---:|---|---|---|---|
| Intent classification | Tier 0/1 | Tier 2 only if confidence low | Yes | Current message only | label schema | strict economy |
| Tagging / categorization | Tier 0/1 | Tier 2 for ambiguous multi-label | Yes | record snippet only | enum/schema | strict economy |
| Field extraction | Tier 0/1 | Tier 2 if parser or confidence fails | Yes | source fragment only | structured DTO | strict economy |
| Language detection | Tier 0/1 | no escalation usually | Yes | message only | ISO code | strict economy |
| Short summarization | Tier 1 | Tier 2 for nuanced business summary | Yes | trimmed source only | length + format | economy |
| FAQ / help rewrite | Tier 1 | Tier 2 for premium brand tone | Yes | KB answer + user question | template compliance | economy |
| Retrieval answer synthesis | Tier 1/2 | Tier 3 only for ambiguous or risky synthesis | Yes | top relevant chunks only | citation/policy checks | balanced |
| Connector mapping suggestion | Tier 2 | Tier 3 if integration is high-risk or low-confidence | Reuse approved mappings | only target/source schemas and constraints | JSON schema | balanced |
| Workflow draft generation | Tier 2 | Tier 3 for complex cross-system plans | Reuse templates/artifacts | compact task brief + scoped context | structured contract | balanced |
| Workflow optimization review | Tier B / Tier 2 | Tier 3 for operator review on high-value flows | Reuse past reviews | summarized metrics only | recommendation schema | balanced |
| Business explanation | Tier 2 | Tier 3 for executive/high-stakes output | Reuse prior explanations | summary facts only | style + factuality checks | balanced |
| Architecture analysis | Tier 3 | none higher; optionally second-pass review | Reuse ADR/context summaries | only relevant architecture context | review checklist | premium by exception |
| Hard debugging | Tier 2/3 | Tier 3 when ambiguity remains after scoped attempt | Reuse incident summaries | failing logs/snippets only | repro + hypothesis format | premium by exception |
| Compliance / policy interpretation | Tier 3 | manual review if critical | Reuse approved policy artifacts | exact policy excerpts only | approval/human gate | premium controlled |
| User-facing irreversible action draft | Tier 2 | Tier 3 if risk or ambiguity high | Reuse approved templates | minimal action context | action policy gate | controlled |
| Bulk lead/account classification | Tier B / Tier 1 | Tier 2 only if quality floor fails | Yes | batch payload only | sampling QA | strict economy |
| Nightly tenant summaries | Tier B / Tier 1/2 | Tier 2 when required by package | Yes | aggregated records only | summary schema | economy |
| Audit/event narrative | Tier 1/2 | Tier 2 for complex incident stitching | Reuse event summaries | event slice only | timeline schema | economy |
| Memory compaction | Tier 1/2 | Tier 2 if nuance threshold not met | Reuse prior summaries | recent relevant memory only | compression checklist | economy |

## Escalation triggers

Escalate only when one or more are true:
- confidence below threshold
- schema validation fails after repair attempt
- risk level = high
- user purchased premium quality mode
- deterministic or retrieval-first path cannot satisfy request
- business value justifies premium cost
- prior lower-tier attempts exhausted allowed retry budget

## Forced downgrade triggers

Downgrade or defer when:
- package disallows higher tier
- quota is near exhaustion
- request is batchable and not latency-sensitive
- a reusable cached artifact is available
- premium path adds little measurable quality for the task class

## Context minimization rules

- never send full conversation by default
- never send full workflow history by default
- prefer summary + references over raw dumps
- include only the records needed for the exact task
- cap token budget per task class before model selection

## Caching rules

Check in this order:
1. exact request + context hash
2. normalized task artifact cache
3. semantic similarity cache
4. retrieval cache
5. approved operator artifact store

If cache hit quality is acceptable, do not re-run the model.

## Retry rules

- First retry should prefer repair or smaller scoped rerun.
- Second retry may escalate one tier if business value supports it.
- Do not loop indefinitely on premium models.
- Failed high-cost calls should emit visible cost/error telemetry.

## Human approval rules

Require approval for:
- expensive workflows above tenant threshold
- legally sensitive output
- irreversible external actions
- ambiguous policy interpretation
- premium spend beyond configured budget tier

## Suggested first implementation fields

Every AI job should carry at least:
- `taskType`
- `riskLevel`
- `qualityRequirement`
- `latencyBudget`
- `costBudgetClass`
- `tenantId`
- `workspaceId`
- `actorId`
- `featureKey`
- `credentialMode`

## Governance outcome

If AIFUT-CORE follows this matrix, most volume should stay in Tier 0, Tier 1, or batch lanes, while Tier 3 remains a narrow, deliberate path reserved for the highest-value work.

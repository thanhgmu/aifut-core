# AI model and token governance

## Decision

AIFUT-core must support two AI usage modes under the same control plane:

1. AIFUT-managed AI tokens
   - AIFUT owns provider API keys and resells AI usage through packages, add-ons, top-ups, and usage pricing.
   - AIFUT can earn margin from token resale.

2. User-managed / BYO AI keys
   - Tenant/user connects their own AI provider API key or OAuth credential.
   - Usage is still metered for visibility, security, routing, and limits, but AIFUT does not charge the same token resale fee unless configured as platform/service fee.

## Operator CPanel requirements

AIFUT operator/admin must be able to configure:

- AI providers: OpenAI, Anthropic, Google, local models, other APIs.
- Models per provider.
- Cost table per model:
  - input token cost
  - output token cost
  - image/audio/video/embedding pricing where applicable
  - currency
  - margin/markup
- Package AI quota:
  - included tokens/credits
  - model allowlist/denylist
  - monthly/daily limits
  - burst limits
  - overage price
  - top-up packages
- BYO permissions:
  - allow BYO model keys: yes/no per package
  - allowed providers for BYO
  - whether BYO users still pay platform orchestration fee
  - max spend/usage safety limits even for BYO
- Routing policy:
  - preferred provider/model
  - fallback model
  - cost-optimized routing
  - quality-optimized routing
  - local/private model routing if available
- Safety policy:
  - per-action approval requirement
  - sensitive-data restrictions
  - logging/redaction rules
  - tenant/workspace/user access boundaries

## User/Tenant panel requirements

Tenant/user must be able to see and configure:

- current package AI quota
- used / remaining tokens or AI credits
- usage by model, workflow, app, user, and time range
- cost estimate before running expensive workflows
- upgrade/top-up button
- BYO API key settings if package allows
- health check for their own AI provider credential
- warnings for quota exhaustion, abnormal usage, or failed provider calls

## Metering model

Every AI call should produce a usage event:

- tenantId
- workspaceId
- actorId
- provider
- model
- credential mode: AIFUT-managed or BYO
- input tokens
- output tokens
- total tokens/credits
- estimated cost
- charged amount
- workflowId / actionId / appId
- status: success/failure/cancelled
- timestamp

## Billing behavior

AIFUT-managed mode:
- deduct included quota first
- then deduct top-up balance or charge overage
- apply configured markup/margin
- show full usage and cost in admin/user dashboards

BYO mode:
- do not deduct AIFUT token quota for provider cost
- still meter usage for analytics, abuse control, and workflow cost estimation
- optionally charge platform orchestration/service fee if configured in the package

## Implementation priority

1. Add provider/model catalog and package quota fields.
2. Add usage event records for AI calls.
3. Add BYO credential reference mode.
4. Add admin package configuration surface.
5. Add user usage dashboard and top-up/upgrade flow.
6. Add routing/fallback/cost-optimization policy.

This is a core commercial capability, not a later cosmetic feature.

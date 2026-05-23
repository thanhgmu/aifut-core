# AI cost orchestration architecture

## Purpose

AIFUT-CORE should treat AI as a governed operating resource, not as a blind per-feature API call.

The goal is to minimize cost for both:
- the platform operator
- tenant/operator customers
- end users

while preserving acceptable quality, safety, and latency.

## Core rule

For every AI task, AIFUT-CORE should choose the **cheapest sufficient intelligence path**.

Decision order:
1. avoid model usage when deterministic logic is enough
2. if AI is needed, use the cheapest safe model tier
3. escalate only when validation, confidence, risk, or user intent requires it
4. reuse cached or persisted artifacts before generating from scratch
5. meter and govern all usage

## North-star architectural stance

AIFUT-CORE should become an **AI cost orchestration layer** with unified control over:
- provider abstraction
- model routing
- prompt/context shaping
- usage metering
- budget enforcement
- cache/reuse
- BYO key support
- operator and tenant policy control

## Mandatory system components

### 1. AI gateway
Single entry point for all AI calls.

Responsibilities:
- provider abstraction
- credential mode resolution: platform-managed vs BYO
- request normalization
- timeout / retry / fallback control
- unified usage event emission

### 2. task classifier
Every request should be labeled before routing:
- task type
- risk level
- quality requirement
- latency budget
- cost budget
- privacy requirement
- tenant/workspace policy scope

This classification can start rule-based and later become hybrid.

### 3. model router
Chooses execution path:
- no-model
- cheap model
- medium model
- premium model
- local/open-weight model
- deferred/background batch lane

Routing inputs:
- task classification
- package allowlist/denylist
- budget state
- tenant policy
- credential mode
- recent model quality/latency/cost telemetry

### 4. context manager
Controls token burn by shaping inputs:
- relevance filtering
- context truncation
- memory compaction
- record referencing instead of raw dumps
- prompt fragment reuse
- token-window budgeting

Rule: never send full history or full tenant state by default.

### 5. validation and repair layer
Reduce expensive re-runs:
- structured output schemas
- DTO validation
- small repair pass for near-valid outputs
- cheap-model reformat pass before premium retry
- policy and safety gates before action execution

### 6. cache and artifact reuse layer
Needed to suppress duplicate inference.

Cache/artifact types:
- exact response cache
- semantic cache
- retrieval result cache
- compact summary cache
- approved workflow draft cache
- connector mapping artifact store
- operator-approved policy explanation artifacts

### 7. cost metering ledger
Every AI interaction should produce governed usage events.

Required measures:
- provider/model
- input/output tokens or equivalent units
- estimated and actual cost
- tenant/workspace/actor/workflow attribution
- cache hit vs miss
- retry count
- escalation count
- latency
- success/failure status
- charged amount vs platform cost

### 8. budget and policy engine
Hard constraints per:
- package
- tenant
- workspace
- user
- workflow
- feature
- credential mode

Policy actions:
- downgrade tier
- switch to BYO path
- switch to local model path
- move to async/batch lane
- require operator approval
- block or defer execution

## Execution lanes

### Lane 0: deterministic / no-model
Use first whenever possible.

Examples:
- rules
- templates
- mapping tables
- calculators
- SQL / query transforms
- regex / parser extraction
- workflow branching
- validation / formatting

### Lane 1: cheap intelligence
Use for high-volume, low-risk work.

Examples:
- intent classification
- tagging
- sentiment/priority labels
- short extraction
- simple summaries
- FAQ rewriting
- metadata generation

### Lane 2: balanced intelligence
Use for medium-value, medium-complexity work.

Examples:
- structured drafting
- connector setup suggestions
- workflow draft generation
- business explanations
- moderate multi-step reasoning

### Lane 3: premium intelligence
Reserve for high-value or ambiguous work.

Examples:
- architecture decisions
- hard debugging
- legal/compliance-sensitive interpretation
- complex orchestration planning
- high-stakes user-visible outputs
- final review on risky automation

### Lane 4: background / batch intelligence
Use when latency is not critical.

Examples:
- nightly summarization
- optimization reviews
- bulk classification
- diagnostics over many connections
- report generation

## Escalation policy

Default posture: start low, escalate only by evidence.

Escalation triggers:
- low confidence score
- output validation failure
- task explicitly marked high-risk
- user chooses premium quality
- deterministic post-check fails
- repeated cheap-model failure within allowed retry window
- feature policy mandates stronger review

De-escalation triggers:
- quota pressure
- low-value task type
- repeated success on cheaper path
- acceptable cached artifact available

## Cost reduction mechanisms

### 1. context minimization
Primary protection against runaway token cost.

### 2. cache-first execution
Before inferencing, check:
- exact key hit
- semantic similarity hit
- existing approved artifact
- compact summary or reusable intermediate state

### 3. retrieval-first execution
Prefer:
- retrieve
- rank
- compress
- then generate only the missing delta

### 4. structured outputs
Require machine-usable outputs to reduce retries.

### 5. batch where possible
Bundle repetitive tasks under shared context.

### 6. asynchronous intelligence
Do not pay premium real-time cost for non-urgent jobs.

### 7. BYO key and local model paths
Offload provider spend where commercially appropriate.

## Commercial policy model

AIFUT-CORE should support both:
- platform-funded AI usage
- BYO-key usage

### Platform-funded mode
- package quotas
- overage pricing
- top-up credits
- model tier entitlements
- workflow and feature caps

### BYO mode
- tenant bears provider cost
- AIFUT may still charge orchestration/service fee
- platform still enforces safety, rate, and abuse controls

## Operator-facing controls

Operators need control over:
- provider catalog
- model tier mapping
- unit pricing and markup
- package-level model permissions
- budget thresholds
- downgrade rules
- approval thresholds
- cache TTL/policy
- feature-specific routing policies

## Tenant-facing controls

Tenants should be able to see:
- estimated cost before expensive runs
- current quota/credit status
- active model mode
- BYO availability
- cost by workflow/user/feature
- downgrade/economy mode options

## Success metrics

AIFUT-CORE should track:
- cost per successful outcome
- average tokens per task type
- cache hit rate
- escalation rate
- retry rate
- premium model usage share
- percentage of tasks solved with no-model or cheap-model lane
- platform margin in managed mode
- tenant savings via BYO or local lanes

## Recommended implementation order

### Phase 1: mandatory foundation
1. unified AI gateway
2. task classification fields
3. model router with tier rules
4. usage metering ledger
5. context manager basics
6. structured output validation
7. budget and package enforcement

### Phase 2: strong savings
8. exact + semantic cache
9. repair-before-retry flow
10. async/batch lanes
11. artifact store
12. tenant-facing cost preview

### Phase 3: scale efficiency
13. BYO provider and per-tenant routing policy
14. local/open-weight execution lane
15. telemetry-informed adaptive routing
16. ROI-based feature governance

## Design warning

AIFUT-CORE should not let product modules call frontier models directly.

Every AI call must pass through the control plane, or cost governance will fragment and fail.

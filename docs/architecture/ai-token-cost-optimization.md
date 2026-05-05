# AI token cost optimization strategy

## Goal

Make AI usage feel affordable or free for users while keeping AIFUT commercially sustainable.

## Core approach

AIFUT should not route every task to expensive frontier models. It should use a cost-aware AI router that chooses the cheapest safe option for each job.

## Cost reduction layers

1. Free / low-cost entry tier
- Give users limited free monthly AI credits.
- Use cheaper models for simple chat, classification, extraction, summarization, and mapping.
- Reserve expensive models for high-value reasoning, architecture, legal/security-sensitive analysis, or final review.
- Encourage BYO API keys for free/low-price users.

2. BYO model mode
- Let users connect their own OpenAI/Google/Anthropic/local-model keys.
- AIFUT does not resell token cost in this mode.
- AIFUT may charge only platform/orchestration fee, or keep it free for acquisition.

3. Local / open-source model mode
- Support local or VPS-hosted models for common tasks.
- Good candidates: classification, routing, extraction, summarization, embeddings, simple support replies.
- Keep strong cloud models only for complex planning and quality gates.

4. Model routing by task difficulty
- tiny/cheap model: intent detection, tagging, language detection, short extraction.
- medium model: normal workflow generation, CRM notes, reports, mapping suggestions.
- strong model: architecture, complex automation planning, high-risk decisions, final audits.

5. Cache and reuse
- Cache repeated answers, connector docs, generated templates, common workflow patterns, embeddings, and summaries.
- Reuse tenant memory/profile instead of re-sending long history every time.

6. Memory compaction
- Store raw logs short-term.
- Summarize into compact durable memory.
- Use retrieved relevant summaries instead of sending all historical context.

7. Template-first execution
- Use fixed templates and structured forms when possible.
- Let AI fill only missing pieces instead of generating everything from scratch.

8. Human approval only when useful
- Avoid long AI loops for risky tasks.
- For high-risk/uncertain cases, ask the user/operator earlier rather than burning tokens guessing.

9. Batch processing
- Batch small tasks together: classify 50 leads in one call instead of 50 separate calls.
- Generate reports from pre-aggregated data instead of raw data dumps.

10. Cost preview and hard limits
- Show estimated token/cost before running large workflows.
- Let users set monthly/daily caps.
- Auto-pause or downgrade model when nearing quota.

## Free usage model

AIFUT can support free users through:
- limited monthly AI credits
- community/template access
- BYO API keys
- local/open-source model routing
- ad/affiliate-supported surfaces
- commission from hosting/domain/service providers
- paid upgrades only when users need more automation, higher limits, premium models, or commercial publishing

## Package design

Example package structure:

- Free Community
  - template browsing
  - limited AI credits
  - BYO keys allowed
  - cheap/local model routing

- Starter Operator
  - more AI credits
  - AIFUT-managed models
  - basic workflows and CRM bridge

- Growth Automation
  - larger quotas
  - premium model access for complex workflows
  - more connectors and scheduled automation

- Pro Marketplace
  - commercial publishing
  - advanced analytics
  - affiliate/commission tools
  - higher automation limits

## Implementation requirement

AIFUT needs an `AiCostRouter` and `AiUsageMeter`:

- classify task type and risk
- choose provider/model based on package, cost, quality, privacy, and quota
- estimate cost before execution
- record actual usage
- enforce limits
- fallback to cheaper/local/BYO model when appropriate

This should be part of core token/API governance, not an afterthought.

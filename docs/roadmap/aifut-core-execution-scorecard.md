# AIFUT-core execution scorecard — 2026-05-03

## Strategic lock

AIFUT-core is the only kernel / control plane / commercial truth. Perfex/NexovaFlow, MagicAI, Affiliate Management System, n8n, UltimatePOS, user-owned apps, hosting/domain providers, and AI providers are adapters/capability providers, never kernel truth.

## Current completion estimate by capability

| Capability | Current % | Target for MVP | ETA from current checkpoint | Notes |
|---|---:|---:|---:|---|
| Kernel architecture / boundaries | 85% | 95% | 2-3 working days | Direction is locked; remaining work is ADR/spec cleanup and deploy-path certainty. |
| Tenant / workspace / actor context | 65% | 85% | 4-6 working days | Core semantics exist; needs fuller provisioning and owner/bootstrap flows. |
| Domain / subdomain governance | 60% | 85% | 3-5 working days | Strong verification in progress for custom, affiliate-managed, local/provider routes. |
| Storage / database topology | 55% | 80% | 5-7 working days | Shared, provider-hosted, local/self-hosted modes are modeled; backup lifecycle needs persistence/workflows. |
| Package / entitlement / token governance | 50% | 75% | 5-8 working days | Package assignment and option guardrails exist; token/API metering UI and upgrade flows remain. |
| Integration substrate | 45% | 75% | 7-10 working days | Connector registry, credential refs, verification foundations exist; wizard UX and generic connector contracts need expansion. |
| Orchestration / parent workflow | 45% | 75% | 7-10 working days | Draft/execution-contract surfaces exist; stored execution, approval dispatch, runner integration are next. |
| Natural-language / chat command layer | 20% | 55% | 8-12 working days after orchestration substrate | Needs intent model, safe command contract, approval levels, and channel adapters. |
| Marketplace / approval / demo / rental | 20% | 60% | 10-15 working days after integration substrate | Must be AIFUT-owned truth; affiliate system can assist later. |
| Affiliate / reseller / commission ledger | 20% | 60% | 7-10 working days after marketplace base | Build AIFUT-owned ledger first; integrate bought affiliate app only as helper/backoffice if useful. |
| Behavior analytics / personalization memory | 25% | 55% | 10-14 working days after MVP substrate | Architecture lock exists; event/profile/compaction primitives still need implementation. |
| Voice / multilingual interaction | 15% | 40% | 8-12 working days after chat layer | Treat as interaction surface over kernel, not a separate product. |
| Multi-country / currency / timezone | 25% | 55% | 5-8 working days | Needs locale preferences, currency/exchange policy, pricing/display integration. |
| Security / audit / access policy | 55% | 80% | continuous, first hardening 5-7 working days | Access and audit foundations exist; production hardening continues every phase. |
| Web/operator/user console | 20% | 60% | 10-15 working days | API foundation is ahead of UI; build minimal console after core contracts stabilize. |
| NexovaFlow/Perfex revenue bridge | 25% | 60% | 4-6 working days after core adapter contract | Use adapter/module bridge; do not make Perfex/NexovaFlow core. |
| MagicAI revenue bridge | 10% | 50% | 4-6 working days after assets + sandbox audit | Buy/audit/sandbox; attach as AI app, not core. |
| Deployment/staging/ops | 20% | 60% | 5-8 working days | Need clear staging path, env separation, backup and rollback basics. |

## Recommended execution order

1. Finish kernel hardening: tenancy, domain, storage, package, orchestration execution contract.
2. Add integration substrate: connector contract, provider catalog, credential refs, health, wizard scaffolds.
3. Add minimal web console for operator/user flows.
4. Attach NexovaFlow/Perfex through upgrade-safe bridge for early operational value.
5. Audit and sandbox MagicAI for early AI revenue packages.
6. Build AIFUT-owned marketplace + commission ledger; optionally bridge Affiliate Management System later.
7. Add behavior memory, voice, localization, and optimization loops.

## Buy/build decisions

- Affiliate Management System: do not use as marketplace/commission truth. Use only as optional helper/backoffice after AIFUT owns commission events, ledger, approval, payout states.
- MagicAI: can buy now for audit/sandbox if budget allows, but do not deploy as production core. Best use is attached AI capability plus differentiated AIFUT orchestration/marketplace packages.
- Perfex/NexovaFlow: keep as CRM/operations attached app. Buy REST/API add-on only if it materially reduces bridge risk. Do not rely on Perfex SaaS module as AIFUT tenancy truth.
- UltimatePOS: later connector/capability only, not near-term kernel priority.
- n8n/OpenClaw/open-source tools: use as workflow/runtime/reference surfaces where they accelerate, while AIFUT remains parent workflow and commercial truth.

## Total ETA bands

- Technical MVP control plane: 4-6 weeks.
- Revenue-capable MVP with NexovaFlow + MagicAI sandbox bridge: 6-8 weeks.
- Marketplace/affiliate-capable MVP: 8-11 weeks.
- Broader intelligence layer with behavior memory, voice, localization, optimization: 11-16 weeks.

These are one-operator focused estimates and assume disciplined scope control: kernel first, adapters second, marketplace third, intelligence layer fourth.

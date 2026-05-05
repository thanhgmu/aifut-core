# AIFUT free / near-free ecosystem economic model

## Decision

AIFUT should support a "near-free participation" model for users who reduce AIFUT's infrastructure cost and accept ecosystem monetization conditions.

The goal is not to make everything free unconditionally. The goal is:

> Users can participate almost for free when they bring their own infrastructure/resources, allow behavior-based personalization, and accept tasteful monetization surfaces such as ads, affiliate offers, marketplace commissions, and optional paid upgrades.

## Cost-saving inputs from user

A user can reduce or eliminate direct platform fees by choosing:

1. Self-managed database/storage
   - local machine
   - own VPS
   - own cloud/database provider
   - own backup destination

2. Own domain/local route
   - user-owned domain/subdomain
   - local domain/route for local deployments
   - AIFUT does not carry domain cost

3. BYO AI/API resources
   - user connects their own AI model keys
   - user uses free/local/open-source models where possible
   - AIFUT routes tasks to cheaper models based on task difficulty

4. Existing apps/services
   - user connects owned tools instead of consuming AIFUT-hosted apps
   - AIFUT provides orchestration, integration, health checks, and templates

5. Behavior/personalization permission
   - user grants permission for AIFUT to learn preferences, workflows, interests, and behavior signals
   - AIFUT uses this to personalize experience, recommendations, ads, templates, and offers
   - must remain privacy-aware, transparent, and opt-in/controllable

6. Tasteful ads / sponsored recommendations
   - ads should be contextual and useful, not disruptive
   - examples: recommended hosting/domain/API providers, templates, tools, courses, services, experts

## Monetization while user is free

AIFUT can still earn through:

- affiliate commission from hosting/domain/VPS/API providers
- marketplace commission from templates/workflows/solutions
- setup/support/service packages
- premium automation limits
- premium model/token resale
- storage/backup fees only when user uses AIFUT-managed resources
- ads/sponsored placements
- partner/reseller programs
- upgrade from free to paid when workflow volume/value grows

## Package implications

### Free Ecosystem package
- free account and community access
- template browsing and limited cloning
- BYO database/storage/domain/API keys
- limited AIFUT-managed AI credits
- local/open-source/cheap-model routing by default
- ads/sponsored recommendations enabled
- behavior personalization enabled with clear controls
- marketplace earning/referral dashboard skeleton

### Low-cost Operator package
- more workflow runs
- some AIFUT-managed storage/token quota
- less advertising
- more connectors and scheduling

### Paid Growth package
- higher automation limits
- premium AI routing
- advanced analytics
- marketplace publishing
- reduced/no ads depending on plan

## Product rule

Free users should still be valuable because they:
- add community content
- share templates/use cases
- bring behavioral learning signals
- attract affiliate/provider commissions
- may sell or promote marketplace products
- may later upgrade when value is proven

## Guardrails

- Behavior tracking must be permissioned and explainable.
- Ads must not corrupt workflow results or user trust.
- BYO credentials must be isolated and encrypted/referenced safely.
- AIFUT must make clear which cost is paid to AIFUT and which cost is paid directly to third-party providers.
- Free users still need abuse/rate limits.

## Implementation hooks

This model requires:
- package flags for BYO storage/domain/API/model permissions
- ad/sponsored placement policy
- behavior consent and personalization profile
- usage metering even when user uses BYO resources
- cost attribution: AIFUT cost vs user-owned external cost
- affiliate/provider catalog
- free-tier quotas and rate limits

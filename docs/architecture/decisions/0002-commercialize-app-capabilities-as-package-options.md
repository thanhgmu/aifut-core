# ADR 0002 — Commercialize app capabilities as package options

## Status
Accepted

## Context
AIFUT needs a clean way to commercialize optional capabilities that come from connected systems like NexovaFlow without letting those systems become the platform core.

One immediate example is a NexovaFlow Automation module that can be sold as an optional capability, toggled on or off inside AIFUT package configuration, and reflected in pricing. The user may also need supporting configuration surfaces in the AIFUT admin control plane and, when necessary, in NexovaFlow itself.

## Decision
AIFUT will model third-party app capabilities such as NexovaFlow Automation as **package options / add-ons** owned by the AIFUT control plane.

The control plane will own:
- package and add-on definitions
- pricing deltas when an option is enabled or disabled
- tenant entitlements for the option
- configuration visibility in the AIFUT admin panel
- connector state and provisioning status for the downstream app

NexovaFlow will remain an execution surface / capability provider. Any NexovaFlow-side panel should be treated as a downstream operational configuration surface, not the source of truth for packaging or pricing.

## Design implications
- A package can include a base plan plus optional add-ons.
- "NexovaFlow Automation" should be represented as a capability option with:
  - entitlement key
  - billing delta
  - provisioning mode
  - dependency rules
  - tenant/workspace scope
  - downstream connector/configuration status
- AIFUT admin should expose a package builder where operators can turn the option on or off.
- Tenant-facing control panels should see whether the option is active, pending setup, degraded, or unavailable.
- If NexovaFlow requires additional setup, AIFUT should link to a guided configuration step rather than delegating commercial truth to NexovaFlow.

## Consequences
### Positive
- keeps commercial control in AIFUT
- allows clean add/remove pricing behavior
- avoids making NexovaFlow the commercial core
- creates a reusable pattern for future app capabilities beyond NexovaFlow

### Negative
- requires AIFUT to model package/add-on/entitlement logic earlier
- introduces extra synchronization work between AIFUT control-plane state and downstream app configuration state

## Rationale
This keeps AIFUT as the owner of plans, options, and monetization while still allowing third-party applications to provide valuable optional capabilities.
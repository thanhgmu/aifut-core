# ADR 0001 — Platform kernel first

## Status
Accepted

## Context
AIFUT aims to become a large-scale SaaS/operator-stack platform with:
- multi-tenancy
- tenant data sovereignty
- workflow/integration extensibility
- marketplace/reseller support
- analytics/personalization
- AI-native interaction surfaces
- very lean operations

The temptation is to assemble the platform around existing third-party business systems (for example Perfex CRM or UltimatePOS), because they provide immediate surface area.

## Decision
AIFUT will treat third-party business systems as optional adapters, not as the platform core.

The first-party kernel will own:
- identity and memberships
- tenant/workspace scoping
- entitlements and policy boundaries
- integration contracts
- event/audit backbone
- marketplace approval/execution boundaries

## Consequences
### Positive
- lower long-term lock-in
- clearer modularity
- easier white-label/reseller evolution
- easier cross-tenant and cross-product consistency
- stronger path to data sovereignty and operator-grade observability

### Negative
- slower initial feature breadth than stitching together off-the-shelf admin systems
- more architecture and implementation burden early on

## Rationale
For AIFUT's goals, long-term leverage matters more than quick assembly of a rigid core. A platform kernel gives better durability and control for the next phases of the business.

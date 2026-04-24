# ADR 0005 — Keep entitlements tenant-wide until workspace records are necessary

## Status
Accepted

## Context
AIFUT now supports tenant-scoped and workspace-scoped package assignment intent. The control plane can record package assignments per tenant or per workspace, and entitlements now expose requested scope, effective scope, and fallback metadata.

However, the current entitlement table is still tenant-wide. Moving immediately to explicit workspace-scoped entitlement records would add model and sync complexity before the operator workflows, pricing rules, and conflict semantics are fully proven.

The near-term need is clarity and auditability, not premature record proliferation.

## Decision
AIFUT will keep entitlement storage tenant-wide for now as a deliberate transitional model.

During this transitional phase:
- package assignment scope may be tenant or workspace
- entitlement responses must expose requested scope, effective scope, and fallback behavior clearly
- entitlement sources should carry enough scope metadata to audit which assignment produced the current tenant-wide entitlement state
- workspace-scoped commercial intent is allowed, but it is interpreted through tenant-wide entitlement records plus attached scope metadata

AIFUT should only introduce explicit workspace-scoped entitlement records when at least one of these becomes necessary:
- different workspaces need conflicting active entitlement states at the same time
- pricing, billing, or usage metering must settle separately per workspace
- downstream provisioning must be isolated per workspace without tenant-wide shadowing
- operators need durable per-workspace overrides that cannot be represented safely with current fallback metadata

## Design implications
- tenant-wide entitlement storage remains the canonical persistence layer for now
- package-assignment scope metadata becomes a required audit surface, not optional decoration
- APIs must continue exposing effective scope and fallback semantics explicitly
- future workspace-entitlement expansion should be treated as a controlled migration, not an ad hoc patch

## Consequences
### Positive
- avoids premature schema and sync complexity
- keeps the current control-plane implementation moving quickly
- preserves auditability while the commercial model is still being proven
- creates a cleaner migration trigger for future workspace-scoped records

### Negative
- true simultaneous workspace-specific entitlement divergence is not yet modeled directly
- some workspace-scoped commercial behavior still depends on metadata interpretation rather than first-class entitlement rows
- a later migration will still be required if workspace-level commercial isolation becomes mandatory

## Rationale
The current platform needs a stable, understandable control-plane path more than it needs maximal record granularity. Tenant-wide entitlement storage with explicit scope metadata is the fastest safe model that preserves forward migration options.

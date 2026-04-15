# AIFUT Source of Truth Notes

## Authoritative development repo
- Active editable source of truth: `C:\Users\PC\.openclaw\workspace\aifut-core`
- Older local path referenced in prior sessions: `D:\Projects\aifut-core`
- VPS/runtime path previously investigated: `/opt/aifut-core`

## Decision
For all current planning, code changes, and commits, the authoritative repo is the OpenClaw workspace copy at `C:\Users\PC\.openclaw\workspace\aifut-core`.

Older paths should be treated as historical references only unless they are explicitly re-synced to the same branch and commit lineage.

## Why this matters
If implementation continues across drifting snapshots, effort will be wasted and fixes may land in the wrong place. This repo must remain the single build surface for the platform kernel.

## Current platform-core status
The current workspace repo has already moved beyond bare bootstrap and now contains early working platform-kernel foundations for:
- tenancy summary and roadmap exposure
- actor and membership context resolution
- integration registry, setup blueprint, and tenant connection inspection
- tenant infrastructure profile visibility for hosted vs hybrid/external-ready operation
- entitlement and audit domain modeling in Prisma

This means the active engineering direction is now explicitly:
- platform kernel first
- integration/control plane first
- tenant-owned infrastructure readiness first
- marketplace and monetization later on top of these boundaries

## Runtime rule
- Build and document in the workspace repo first.
- Before making runtime-specific bug claims about the VPS, verify the deployed source and branch parity.
- Do not treat screenshots, memory alone, or older paths as authoritative over the workspace repo.

## Next cleanup
- Document branch to deploy flow from workspace repo to VPS.
- Record the exact migration and seed status of the current workspace branch.
- Keep status/roadmap files updated whenever platform-core milestones materially change.

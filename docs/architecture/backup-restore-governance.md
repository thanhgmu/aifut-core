# Backup and restore governance

## Purpose
AIFUT must treat backup and restore as a first-class operator capability, not as an infrastructure afterthought.

This is especially important for the one-person-company direction because a single operator needs reliable recovery without needing a dedicated DevOps team.

## Scope
Backup governance should cover both user-owned assets and AIFUT ecosystem assets.

Initial backup scopes:
- database records
- workflow definitions and workflow runtime artifacts
- skill, plugin, add-on, and application configuration
- connector templates, connection metadata, and safe credential references
- tenant, workspace, package, entitlement, and domain/storage configuration
- behavior-memory summaries and retention-controlled archives
- app-specific operational snapshots where appropriate, such as NexovaFlow/Perfex CRM state summaries or export bundles

Raw secrets should not be exported in plain text. Backup payloads should store encrypted credential references or require re-authorization after restore.

## Backup targets
AIFUT should support multiple target classes:
- local file or local network path
- user-owned storage provider such as Google Drive
- user-owned VPS or object storage
- AIFUT-managed storage for paid or managed packages
- app-specific export target when an integrated application provides a safe native export path

The system should distinguish between:
- user-provided backup targets, where the user bears the storage cost
- AIFUT-managed backup targets, where package limits, metering, and billing may apply

## Scheduling and configuration
Users and AIFUT admins need a visible backup center.

User-facing controls should include:
- choose backup scope
- choose backup target
- set schedule, such as hourly, daily, weekly, monthly, or manual only
- set retention policy
- run backup now
- view last successful backup
- view failed backup reason in plain language
- test restore into a preview/sandbox where possible

Admin-facing controls should include:
- tenant/workspace backup policy defaults
- package-level backup limits
- mandatory backup rules for managed tenants
- backup health overview
- failed-backup alerts
- restore approval policy for sensitive scopes
- disaster recovery runbook references

## App-specific backup
For integrated applications such as NexovaFlow/Perfex, MagiCA, n8n, affiliate systems, and future tenant-owned apps, AIFUT should not assume direct database ownership by default.

The preferred pattern is:
1. define the app backup capability contract
2. detect whether the app supports native export, API export, database dump, or summary-only backup
3. store AIFUT-owned orchestration/config truth in AIFUT backup
4. store app-owned operational data through the safest available app adapter
5. record restore limitations before the user depends on the backup

AIFUT should back up enough app context to recover the business operating workflow, even when a third-party app keeps canonical domain records.

## Restore expectations
Restore should be explicit and governed.

Restore modes:
- config-only restore
- workflow/template restore
- skill/plugin/add-on restore
- database snapshot restore
- app-specific restore
- tenant/workspace restore
- full ecosystem restore for managed environments

Sensitive restore actions should require confirmation or admin approval because they can overwrite working systems.

## OPC alignment
This capability strongly supports the OPC direction because it:
- reduces operational risk for a single operator
- supports local-first and BYO infrastructure users
- makes experiments reversible
- makes marketplace workflow/plugin assets portable
- lowers fear when connecting many applications
- helps AIFUT offer managed backup as a paid upgrade without blocking free/local users

## Implementation phases

### Phase 1: policy and metadata
- extend storage policy backup metadata
- define backup target records
- define backup scope records
- expose backup readiness in operator summaries
- keep restore manual and documented

### Phase 2: scheduler and local/export targets
- add user/admin backup center
- support scheduled backup jobs
- support local file/export target
- support Google Drive target through an adapter
- emit backup success/failure timeline events

### Phase 3: restore and app adapters
- add restore preview
- add restore approval gates
- add NexovaFlow/Perfex export/restore adapter where safe
- add workflow/skill/plugin/add-on portability bundles

### Phase 4: managed disaster recovery
- tenant-level disaster recovery policies
- full managed environment restore
- package-based backup SLAs
- backup compliance and audit reports

## Design rule
No important AIFUT workflow, skill, plugin, add-on, app config, or tenant-owned operating state should exist without a clear answer to:

1. where it is backed up
2. how often it is backed up
3. who can restore it
4. what restore will overwrite
5. what costs are paid by AIFUT versus the user

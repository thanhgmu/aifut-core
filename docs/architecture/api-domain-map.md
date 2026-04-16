# API Domain Map

## Existing modules
- `AppModule`
- `TenancyModule`
- `GlobalizationModule`
- `OrchestrationModule`

## New kernel domains introduced in schema
- memberships
- sessions
- integrations
- entitlements
- audit
- auth / actor context

## Target API module map
- `AuthModule`
  - login
  - session issuance
  - actor context resolution
  - current actor / tenant / workspace endpoints
- `MembershipsModule`
  - tenant memberships
  - role boundaries
  - default workspace logic
- `IntegrationsModule`
  - connector registry
  - connection health
  - credential reference boundaries
- `EntitlementsModule`
  - plan features
  - limits
  - storage/usage policy
- `ConnectorsModule`
  - connector registry
  - integration templates
  - future connection instance setup surfaces
- `AuditModule`
  - structured event writing
  - operator timeline
- `PlatformModule` (optional later)
  - cross-cutting control-plane concerns

## Design note
Keep the implementation as a modular monolith until clear scale constraints justify distributed decomposition.

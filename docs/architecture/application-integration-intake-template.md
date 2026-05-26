# Application Integration Intake Template

## Purpose
Use this template when evaluating an existing system for integration into AIFUT.

The goal is to capture the minimum information needed to decide:
- whether the system should be integrated,
- what role it should play,
- what AIFUT capabilities it can provide,
- what should explicitly remain outside its role,
- and how to keep the integration upgrade-safe.

---

## 1. Basic identity
- System name:
- URL / host:
- Vendor / codebase:
- Current owner/operator:
- Environment(s): dev / staging / production / local / VPS / shared-hosting
- Current access available: docs / screenshots / viewer account / admin account

## 2. Strategic role in AIFUT
- Proposed role:
  - workflow runtime
  - chat/agent runtime
  - CRM/customer ops
  - affiliate/commission engine
  - generation engine
  - marketplace provider
  - analytics source
  - storage/infra provider
  - other
- Why use it at all?
- What delivery time does it save?
- What should it explicitly NOT become?

## 3. Current features already available
- Major modules/features:
- What it already does well:
- What it cannot do or does poorly:
- What is only achievable by customization/module extension:

## 4. Integration capabilities
- Auth modes available:
- API available? yes/no
- Webhooks available? yes/no
- Plugin/module system available? yes/no
- Data import/export available? yes/no
- Event logs or audit available? yes/no
- Search/read/write operations available?
- Background jobs or task runtime available?

## 5. Candidate AIFUT capabilities this system could provide
- Capability 1:
- Capability 2:
- Capability 3:
- Capability 4:
- Capability 5:

## 6. Canonical object impact
- Which AIFUT canonical objects would it touch?
- Which objects would remain local to the app?
- Which fields would likely be source-of-truth in this app?
- Which fields must remain source-of-truth in AIFUT?

## 7. Workflow role
- Could it host child workflows? yes/no
- Could it host parent workflow truth? (expected answer usually no)
- Which sub-processes would belong there?
- What approvals would still need to stay in AIFUT?

## 8. Data-sync shape
- Sync direction candidates:
  - pull
  - push
  - bidirectional
  - event-driven
  - manual-sync
- Main objects flowing in:
- Main objects flowing out:
- Expected frequency:
- Conflict risks:
- Mapping complexity: low / medium / high

## 9. Health and upgrade risk
- How often does this system change?
- Stable API/module contracts? yes/no/unknown
- Biggest integration fragility:
- Versioning available? yes/no
- Health-check strategy candidate:
- Remediation candidate if broken:

## 10. Security / policy / privacy
- Credential type needed:
- Sensitive data involved:
- Tenant separation support:
- Fine-grained permissions available:
- Local/on-prem considerations:
- Behavior/analytics/privacy implications:

## 11. Commercial / marketplace role
- Can this system support sell/rent/package use cases indirectly?
- Can outputs from this system become marketplace products?
- Can it support affiliate/referral/commercial reporting inputs?
- What part of commercial truth must remain in AIFUT?

## 12. Build recommendation
- Integrate now / later / never:
- Integration depth:
  - viewer only
  - read-only connector
  - read/write adapter
  - module/plugin extension
  - embedded operator surface
- Suggested first slice:
- Suggested long-term shape:

## 13. Notes / screenshots / links
- Notes:
- Docs links:
- Screenshot references:
- Demo account info location:

---

## Short evaluation summary
- Should AIFUT integrate this? Why?
- Best role for this system:
- Biggest risk if we integrate it badly:
- Best next technical step:

# Canonical Object Starter Schema v1

## Purpose
This document turns the Canonical Object Starter Set into a more execution-ready modeling baseline.

For each starter object, it defines:
- core fields
- ownership tier
- source of truth
- related apps/systems
- default sync direction
- recommended build phase

The goal is to make the next modeling and implementation steps faster, safer, and more consistent.

---

## Reading guide

### Ownership tiers
- **Core** = AIFUT must own the object directly
- **Summary/Ref** = AIFUT stores normalized summary/reference only
- **External** = object remains primarily in downstream system

### Sync direction values
- `none` = no sync expected
- `pull` = AIFUT mainly reads/imports
- `push` = AIFUT mainly sends commands/writes
- `bidirectional` = both directions
- `event-driven` = updates mainly arrive via events/hooks
- `mixed` = several patterns depending on subfield/function

### Build phases
- **P0** = immediately needed for first operational backbone
- **P1** = needed for the first real end-to-end operating loop
- **P2** = needed after the first loop works and broader ops begin

---

# Core control-plane objects

## 1. Tenant
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `slug`
  - `name`
  - `status`
  - `topologyMode`
  - `primaryDomainRef`
  - `packageRef`
  - `createdAt`
- Related systems: AIFUT only
- Sync direction: none
- Build phase: P0

## 2. Workspace
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `tenantId`
  - `slug`
  - `name`
  - `status`
  - `workspaceType`
  - `createdAt`
- Related systems: AIFUT only
- Sync direction: none
- Build phase: P0

## 3. Membership / ActorContext
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `actorId`
  - `tenantId`
  - `workspaceId`
  - `role`
  - `policyScope`
  - `status`
- Related systems: AIFUT only
- Sync direction: none
- Build phase: P0

## 4. AppDefinition
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `appKey`
  - `name`
  - `category`
  - `provider`
  - `runtimeRole`
  - `authModes`
  - `capabilityKeys`
  - `status`
- Related systems: n8n, OpenClaw, Perfex/NexovaFlow, aff.nexovaflow, MagiCA, future apps
- Sync direction: none
- Build phase: P0

## 5. ConnectionInstance
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `tenantId`
  - `workspaceId`
  - `appDefinitionId`
  - `displayName`
  - `remoteBaseRef`
  - `credentialRef`
  - `status`
  - `topologyScope`
  - `healthStateId`
  - `syncPolicyId`
  - `lastVerifiedAt`
- Related systems: all integrated systems
- Sync direction: mixed
- Build phase: P0

## 6. CapabilityContract
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `capabilityKey`
  - `name`
  - `category`
  - `inputShapeRef`
  - `outputShapeRef`
  - `riskLevel`
  - `defaultApprovalMode`
- Related systems: all integrated systems
- Sync direction: none
- Build phase: P0

## 7. MappingProfile
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `connectionInstanceId`
  - `sourceObjectKey`
  - `targetObjectKey`
  - `mappingRules`
  - `transformRules`
  - `version`
  - `status`
- Related systems: all integrated systems
- Sync direction: mixed
- Build phase: P0

## 8. SyncPolicy
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `connectionInstanceId`
  - `objectKey`
  - `direction`
  - `authorityNotes`
  - `scheduleRef`
  - `conflictStrategy`
  - `retryPolicyRef`
  - `status`
- Related systems: all integrated systems
- Sync direction: none
- Build phase: P0

---

# Workflow / execution / policy objects

## 9. BusinessGoal
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `tenantId`
  - `workspaceId`
  - `goalType`
  - `title`
  - `objectiveSummary`
  - `targetMetrics`
  - `horizon`
  - `status`
  - `sourceIntentRef`
- Related systems: OpenClaw, AIFUT UI
- Sync direction: none
- Build phase: P0

## 10. ParentWorkflow
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `businessGoalId`
  - `tenantId`
  - `workspaceId`
  - `name`
  - `workflowType`
  - `phaseGraph`
  - `status`
  - `approvalMode`
  - `optimizationNotes`
- Related systems: OpenClaw, n8n, all domain apps indirectly
- Sync direction: none
- Build phase: P0

## 11. ChildWorkflow
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `parentWorkflowId`
  - `roleType`
  - `assignedAppDefinitionId`
  - `assignedConnectionInstanceId`
  - `capabilityKey`
  - `inputObjectRefs`
  - `outputObjectRefs`
  - `approvalMode`
  - `status`
- Related systems: n8n, OpenClaw, Perfex/NexovaFlow, aff.nexovaflow, MagiCA
- Sync direction: mixed
- Build phase: P0

## 12. ApprovalPolicy
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `scopeType`
  - `scopeRef`
  - `riskThresholds`
  - `actionRules`
  - `autoRunRules`
  - `manualOnlyRules`
  - `status`
- Related systems: all
- Sync direction: none
- Build phase: P0

## 13. ApprovalRequest
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `tenantId`
  - `workspaceId`
  - `workflowRef`
  - `actionType`
  - `requestedByRef`
  - `approvalStatus`
  - `riskSummary`
  - `decisionAt`
  - `decisionByRef`
- Related systems: all
- Sync direction: none
- Build phase: P0

## 14. ExecutionPolicy
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `workflowScopeRef`
  - `autonomyLevel`
  - `budgetLimit`
  - `toolAllowList`
  - `runtimeAllowList`
  - `timeoutPolicy`
  - `safetyFlags`
- Related systems: OpenClaw, n8n, domain apps
- Sync direction: none
- Build phase: P0

## 15. WorkflowRun
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `parentWorkflowId`
  - `triggerType`
  - `startedAt`
  - `finishedAt`
  - `status`
  - `summary`
  - `resultRefs`
- Related systems: all
- Sync direction: event-driven
- Build phase: P0

## 16. ExecutionRun
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `childWorkflowId`
  - `runtimeRef`
  - `externalRunRef`
  - `startedAt`
  - `finishedAt`
  - `status`
  - `errorSummary`
  - `outputSummary`
- Related systems: n8n, OpenClaw, MagiCA, Perfex/NexovaFlow, aff.nexovaflow
- Sync direction: event-driven
- Build phase: P0

## 17. IntegrationHealthState
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `connectionInstanceId`
  - `healthStatus`
  - `lastVerifiedAt`
  - `lastSuccessAt`
  - `lastErrorSummary`
  - `driftFlags`
  - `degradedMode`
- Related systems: all integrations
- Sync direction: mixed
- Build phase: P0

## 18. RemediationSuggestion
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `healthStateId`
  - `code`
  - `title`
  - `message`
  - `recommendedAction`
  - `actionType`
  - `canAutoFix`
  - `status`
- Related systems: all integrations
- Sync direction: none
- Build phase: P1

---

# Business / commercial / content objects

## 19. Offer
- Ownership: Core
- Source of truth: AIFUT (business meaning), external refs for network-specific data
- Core fields:
  - `id`
  - `tenantId`
  - `title`
  - `offerType`
  - `sourceSystemRef`
  - `category`
  - `targetAudienceSummary`
  - `monetizationSummary`
  - `riskSummary`
  - `priorityStatus`
- Related systems: aff.nexovaflow, external affiliate networks, AIFUT planning
- Sync direction: mixed
- Build phase: P1

## 20. Campaign
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `tenantId`
  - `workspaceId`
  - `offerId`
  - `name`
  - `channelTargets`
  - `trackingContext`
  - `status`
  - `goalRefs`
- Related systems: aff.nexovaflow, publish platforms, AIFUT reporting
- Sync direction: mixed
- Build phase: P1

## 21. ContentPlan
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `campaignId`
  - `formatType`
  - `angleSummary`
  - `brief`
  - `scriptSummary`
  - `ctaSummary`
  - `status`
- Related systems: OpenClaw, MagiCA
- Sync direction: push
- Build phase: P1

## 22. AssetRecord
- Ownership: Core
- Source of truth: AIFUT for lifecycle/meta; external for heavy media internals
- Core fields:
  - `id`
  - `contentPlanId`
  - `assetType`
  - `generationJobRef`
  - `storageRef`
  - `status`
  - `approvalState`
  - `usageSummary`
- Related systems: MagiCA, storage systems, publish platforms
- Sync direction: mixed
- Build phase: P1

## 23. PublishRecord
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `assetRecordId`
  - `channel`
  - `targetAccountRef`
  - `publishedAt`
  - `externalPostRef`
  - `trackingRef`
  - `status`
- Related systems: n8n, YouTube/TikTok/Facebook/etc.
- Sync direction: mixed
- Build phase: P1

## 24. PerformanceSummary
- Ownership: Core
- Source of truth: AIFUT normalized summary layer
- Core fields:
  - `id`
  - `scopeType`
  - `scopeRef`
  - `periodKey`
  - `views`
  - `clicks`
  - `conversions`
  - `engagementSummary`
  - `performanceScore`
- Related systems: publish platforms, affiliate systems, analytics tools
- Sync direction: pull
- Build phase: P0

## 25. RevenueSummary
- Ownership: Core
- Source of truth: AIFUT normalized summary layer
- Core fields:
  - `id`
  - `scopeType`
  - `scopeRef`
  - `periodKey`
  - `grossRevenue`
  - `netRevenue`
  - `commissionSummary`
  - `costSummary`
  - `profitabilityScore`
- Related systems: aff.nexovaflow, finance sheets/tools, marketplace
- Sync direction: pull
- Build phase: P0

---

# Marketplace / approval objects

## 26. MarketplaceSubmission
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `tenantId`
  - `submissionType`
  - `title`
  - `submittedByRef`
  - `targetCommercialMode`
  - `status`
  - `listingDraftRef`
- Related systems: AIFUT marketplace/admin surfaces
- Sync direction: none
- Build phase: P1

## 27. MarketplaceListing
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `submissionId`
  - `listingType`
  - `title`
  - `category`
  - `pricingSummary`
  - `packageAttachMode`
  - `listingStatus`
  - `commercialRefs`
- Related systems: AIFUT marketplace, aff.nexovaflow indirectly
- Sync direction: mixed
- Build phase: P1

## 28. ListingApprovalReview
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `listingId`
  - `reviewerRef`
  - `criteriaSnapshot`
  - `decision`
  - `notes`
  - `reviewedAt`
- Related systems: AIFUT admin review surfaces
- Sync direction: none
- Build phase: P1

---

# Behavior / recommendation objects

## 29. BehaviorProfile
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `tenantId`
  - `workspaceId`
  - `actorRef`
  - `segmentKey`
  - `engagementScore`
  - `adoptionScore`
  - `intentScore`
  - `riskScore`
  - `preferencesSummary`
- Related systems: AIFUT surfaces, external behavior signals, OpenClaw, marketplace
- Sync direction: mixed
- Build phase: P2

## 30. TrackingPolicy
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `tenantId`
  - `workspaceId`
  - `trackingMode`
  - `allowedSignalScopes`
  - `retentionPolicyRef`
  - `commercialUsageMode`
  - `adUsageMode`
  - `status`
- Related systems: AIFUT surfaces, local connectors, integrated apps
- Sync direction: none
- Build phase: P2

## 31. ConsentState
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `actorRef`
  - `tenantId`
  - `consentScopes`
  - `grantedAt`
  - `revokedAt`
  - `status`
- Related systems: AIFUT, behavior-tracked apps
- Sync direction: none
- Build phase: P2

## 32. Recommendation
- Ownership: Core
- Source of truth: AIFUT
- Core fields:
  - `id`
  - `scopeType`
  - `scopeRef`
  - `recommendationType`
  - `title`
  - `reasonSummary`
  - `suggestedAction`
  - `impactEstimate`
  - `status`
- Related systems: AIFUT UI, OpenClaw, marketplace, admin/tenant dashboards
- Sync direction: none
- Build phase: P1

---

# Summary/reference objects

## 33. LeadSummary
- Ownership: Summary/Ref
- Source of truth: external CRM
- Core fields:
  - `id`
  - `connectionInstanceId`
  - `externalLeadRef`
  - `displayName`
  - `statusSummary`
  - `scoreSummary`
  - `ownerSummary`
- Related systems: Perfex/NexovaFlow, future CRM apps
- Sync direction: pull
- Build phase: P2

## 34. ContactSummary / CustomerSummary
- Ownership: Summary/Ref
- Source of truth: external CRM/app
- Core fields:
  - `id`
  - `connectionInstanceId`
  - `externalRef`
  - `displayName`
  - `segmentSummary`
  - `statusSummary`
  - `lastActivityAt`
- Related systems: Perfex/NexovaFlow, commerce tools, LMS tools
- Sync direction: pull
- Build phase: P2

## 35. DealSummary
- Ownership: Summary/Ref
- Source of truth: external CRM
- Core fields:
  - `id`
  - `connectionInstanceId`
  - `externalDealRef`
  - `stageSummary`
  - `valueSummary`
  - `ownerSummary`
  - `statusSummary`
- Related systems: Perfex/NexovaFlow
- Sync direction: pull
- Build phase: P2

## 36. AffiliateLinkRef
- Ownership: Summary/Ref
- Source of truth: affiliate engine
- Core fields:
  - `id`
  - `campaignId`
  - `offerId`
  - `externalLinkRef`
  - `trackingKey`
  - `status`
- Related systems: aff.nexovaflow, external affiliate networks
- Sync direction: mixed
- Build phase: P1

## 37. CommissionSummary
- Ownership: Summary/Ref
- Source of truth: affiliate engine
- Core fields:
  - `id`
  - `scopeType`
  - `scopeRef`
  - `earned`
  - `pending`
  - `paid`
  - `tierSummary`
  - `periodKey`
- Related systems: aff.nexovaflow
- Sync direction: pull
- Build phase: P1

## 38. GenerationJobSummary
- Ownership: Summary/Ref
- Source of truth: generation engine
- Core fields:
  - `id`
  - `assetRecordId`
  - `externalJobRef`
  - `jobType`
  - `status`
  - `costSummary`
  - `errorSummary`
  - `completedAt`
- Related systems: MagiCA
- Sync direction: event-driven
- Build phase: P1

## 39. WorkflowRuntimeArtifactRef
- Ownership: Summary/Ref
- Source of truth: runtime provider
- Core fields:
  - `id`
  - `childWorkflowId`
  - `runtimeProvider`
  - `externalArtifactRef`
  - `versionHash`
  - `activationState`
- Related systems: n8n, future runtimes
- Sync direction: mixed
- Build phase: P1

## 40. AnalyticsSnapshotSummary
- Ownership: Summary/Ref
- Source of truth: analytics/publish systems
- Core fields:
  - `id`
  - `scopeType`
  - `scopeRef`
  - `periodKey`
  - `metricSummary`
  - `sourceSystemRef`
  - `capturedAt`
- Related systems: YouTube, TikTok, Facebook, analytics tools
- Sync direction: pull
- Build phase: P1

---

# External/domain-owned objects that should stay out of core for now

## CRM internals
- full lead/contact/deal/task/ticket records
- invoice/proposal/project internals
- raw CRM timeline history

## Affiliate internals
- raw click ledgers
- raw commission line items
- payout processing internals

## Generation internals
- prompt-chain internals
- intermediate media artifacts
- queue internals
- provider-specific render metadata

## Runtime internals
- n8n workflow JSON as primary truth
- node graph internals
- engine bookkeeping

## Agent runtime internals
- transient chat state
- provider-specific subagent state
- low-level tool-call internals not promoted into audit/results

## Raw behavior archive
- full clickstream forever
- unlimited raw event archive without retention policy

---

## Recommended first implementation subset
Build first:
1. Tenant
2. Workspace
3. Membership / ActorContext
4. AppDefinition
5. ConnectionInstance
6. CapabilityContract
7. MappingProfile
8. SyncPolicy
9. BusinessGoal
10. ParentWorkflow
11. ChildWorkflow
12. ApprovalPolicy
13. ApprovalRequest
14. ExecutionPolicy
15. WorkflowRun
16. ExecutionRun
17. IntegrationHealthState
18. Offer
19. Campaign
20. ContentPlan
21. AssetRecord
22. PublishRecord
23. PerformanceSummary
24. RevenueSummary

Then add:
25. RemediationSuggestion
26. MarketplaceSubmission
27. MarketplaceListing
28. ListingApprovalReview
29. Recommendation
30. AffiliateLinkRef
31. CommissionSummary
32. GenerationJobSummary
33. WorkflowRuntimeArtifactRef
34. AnalyticsSnapshotSummary

Later:
35. BehaviorProfile
36. TrackingPolicy
37. ConsentState
38. CRM summary objects

---

## Final note
This schema is intentionally opinionated.

It favors:
- strong orchestration truth
- low raw-data weight in core
- replaceable adapters
- faster implementation
- and lower structural risk while AIFUT moves into practical operation.

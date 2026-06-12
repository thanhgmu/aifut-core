import { InfrastructureProfileService } from './infrastructure-profile.service';

describe('InfrastructureProfileService', () => {
  it('should report only route-ready custom domains as custom domain ready', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant_1',
          slug: 'acme',
          name: 'Acme',
          createdAt: new Date('2026-05-31T00:00:00.000Z'),
          workspaces: [],
          integrations: [
            {
              id: 'connection_1',
              name: 'NexovaFlow Ops',
              slug: 'nexovaflow-ops',
              category: 'WORKFLOW',
              provider: 'nexovaflow',
              status: 'ACTIVE',
              workspaceId: 'workspace_1',
              workspace: {
                name: 'Operations',
                slug: 'ops',
              },
              lastVerifiedAt: new Date('2026-05-31T00:00:00.000Z'),
              routingMode: 'direct',
              targetBaseUrl: 'https://nexovaflow.example.com',
              targetRegion: 'ap-southeast-1',
              targetEnvironment: 'cloud',
            },
          ],
          entitlements: [],
          domains: [
            {
              id: 'domain_1',
              hostname: 'legacy.acme.test',
              kind: 'CUSTOM',
              status: 'ACTIVE',
              isPrimary: true,
              dnsTarget: null,
              certificateStatus: 'pending',
              provider: null,
              provisioningMode: 'managed',
              workspaceId: 'workspace_1',
              workspace: {
                name: 'Operations',
                slug: 'ops',
              },
              createdAt: new Date('2026-05-31T00:00:00.000Z'),
            },
            {
              id: 'domain_2',
              hostname: 'acme.aifut.test',
              kind: 'PLATFORM_SUBDOMAIN',
              status: 'ACTIVE',
              isPrimary: false,
              dnsTarget: null,
              certificateStatus: null,
              provider: null,
              provisioningMode: null,
              createdAt: new Date('2026-05-31T00:00:00.000Z'),
            },
          ],
          storagePolicies: [
            {
              id: 'storage_policy_1',
              key: 'documents',
              mode: 'HYBRID',
              storageClass: 'STANDARD',
              targetRef: 'tenant-primary',
              targetRegion: 'ap-southeast-1',
              backupTargetRef: 'platform-backup',
              meteringEnabled: true,
              workspaceId: 'workspace_1',
              workspace: {
                name: 'Operations',
                slug: 'ops',
              },
              createdAt: new Date('2026-05-31T00:00:00.000Z'),
            },
          ],
        }),
      },
    };
    const service = new InfrastructureProfileService(prisma as never);

    const result = await service.getTenantInfrastructureProfile(' ACME ');

    expect(result.infrastructure.domains).toMatchObject({
      total: 2,
      routeReady: 1,
      customDomainReady: false,
      primary: {
        hostname: 'legacy.acme.test',
        workspaceId: 'workspace_1',
        workspace: {
          name: 'Operations',
          slug: 'ops',
        },
        readiness: {
          routeReady: false,
          reasons: [
            'dns-target:missing',
            'certificate-status:pending',
            'provider:missing',
          ],
        },
      },
    });
    expect(result.domains[1]).toMatchObject({
      hostname: 'acme.aifut.test',
      readiness: {
        routeReady: true,
        reasons: [],
      },
    });
    expect(result.storagePolicies[0]).toMatchObject({
      key: 'documents',
      workspaceId: 'workspace_1',
      workspace: {
        name: 'Operations',
        slug: 'ops',
      },
    });
    expect(result.integrations[0]).toMatchObject({
      slug: 'nexovaflow-ops',
      workspaceId: 'workspace_1',
      workspace: {
        name: 'Operations',
        slug: 'ops',
      },
    });
  });

  it('should expose shared readiness diagnostics in domain routing policy', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant_1',
          slug: 'acme',
          name: 'Acme',
        }),
      },
      tenantDomain: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'domain_1',
            hostname: 'legacy.acme.test',
            kind: 'CUSTOM',
            status: 'ACTIVE',
            isPrimary: true,
            dnsTarget: null,
            certificateStatus: 'pending',
            provider: null,
            provisioningMode: 'managed',
            workspaceId: 'workspace_1',
            workspace: {
              name: 'Operations',
              slug: 'ops',
            },
            createdAt: new Date('2026-05-31T00:00:00.000Z'),
            updatedAt: new Date('2026-05-31T00:00:00.000Z'),
          },
        ]),
      },
    };
    const service = new InfrastructureProfileService(prisma as never);

    const result = await service.getDomainRoutingPolicy(' ACME ');

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { slug: 'acme' },
      select: {
        id: true,
        slug: true,
        name: true,
      },
    });
    expect(result.routing.domains[0]).toMatchObject({
      hostname: 'legacy.acme.test',
      workspaceId: 'workspace_1',
      workspace: {
        name: 'Operations',
        slug: 'ops',
      },
      readiness: {
        routeReady: false,
        reasons: [
          'dns-target:missing',
          'certificate-status:pending',
          'provider:missing',
        ],
      },
    });
    expect(result.routing.summary).toEqual({
      domainCount: 1,
      routeReadyDomainCount: 0,
      attentionRequiredDomainCount: 1,
    });
  });

  it('should expose friendly workspace bindings in storage routing policy', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant_1',
          slug: 'acme',
          name: 'Acme',
        }),
      },
      tenantStoragePolicy: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'storage_policy_1',
            key: 'documents',
            mode: 'HYBRID',
            storageClass: 'STANDARD',
            targetRef: 'tenant-primary',
            targetRegion: 'ap-southeast-1',
            backupTargetRef: 'platform-backup',
            meteringEnabled: true,
            workspaceId: 'workspace_1',
            workspace: {
              name: 'Operations',
              slug: 'ops',
            },
            createdAt: new Date('2026-06-01T00:00:00.000Z'),
            updatedAt: new Date('2026-06-01T00:00:00.000Z'),
          },
        ]),
      },
    };
    const service = new InfrastructureProfileService(prisma as never);

    const result = await service.getStorageRoutingPolicy(' ACME ');

    expect(result.storage.policies[0]).toMatchObject({
      key: 'documents',
      workspaceId: 'workspace_1',
      workspace: {
        name: 'Operations',
        slug: 'ops',
      },
    });
  });

  it('should expose a preview-only backup readiness setup contract', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant_1',
          slug: 'acme',
          name: 'Acme',
        }),
      },
      tenantStoragePolicy: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'storage_policy_1',
            key: 'documents',
            mode: 'HYBRID',
            storageClass: 'STANDARD',
            targetRef: 'tenant-primary',
            targetRegion: 'ap-southeast-1',
            backupTargetRef: null,
            meteringEnabled: true,
            workspaceId: 'workspace_1',
            workspace: {
              name: 'Operations',
              slug: 'ops',
            },
            createdAt: new Date('2026-06-08T00:00:00.000Z'),
            updatedAt: new Date('2026-06-08T00:00:00.000Z'),
          },
        ]),
      },
      integrationConnection: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      entitlement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new InfrastructureProfileService(prisma as never);

    const result = await service.getBackupReadinessPolicy(' ACME ');

    expect(result.backup.setupContract).toMatchObject({
      contractVersion: 'backup-readiness-setup.v1',
      sourceSurface: 'GET /integrations/backup-readiness',
      reviewStatus: 'operator-configuration-required',
      displaySummary: {
        title: 'Acme backup readiness',
        statusLabel: 'Setup needed',
      },
      primaryActionKey: 'backup-target:missing',
      requiredActionKeys: [
        'backup-target:missing',
        'storage-policies-without-backup-target',
        'backup-schedule:not-configured',
        'restore-preview:not-implemented',
      ],
      runtimeHandoff: {
        mode: 'preview-only',
        previewEndpoint: 'POST /integrations/backup-setup-preview',
        requiredInputKeys: ['tenantSlug'],
        schedulePersistenceAllowed: false,
        restoreExecutionAllowed: false,
        externalCloudWritesAllowed: false,
      },
    });
    expect(result.backup.setupIntent).toMatchObject({
      intentVersion: 'backup-center-setup-intent.v1',
      sourceContractVersion: 'backup-readiness-setup.v1',
      sourceSurface: 'GET /integrations/backup-readiness',
      mode: 'preview-only',
      intentKey: 'acme:backup-center:setup-preview',
      status: 'blocked-before-decision',
      decisionScope: 'backup-center-setup-preview',
      primaryDecisionKey: 'backup-target:missing',
      allowedDecisions: ['resolve-required-actions', 'defer-setup'],
      defaultDecision: 'resolve-required-actions',
      projectedOutcome: 'operator-configuration-required',
      derivedFrom: {
        backupStatus: 'backup-targets-not-declared',
        requiredActionKeys: [
          'backup-target:missing',
          'storage-policies-without-backup-target',
          'backup-schedule:not-configured',
          'restore-preview:not-implemented',
        ],
        recommendedActionKeys: [
          'add-local-or-user-cloud-backup-target',
          'configure-user-and-admin-backup-schedules',
          'define-workflow-skill-plugin-addon-portability-bundle',
          'assess-nexovaflow-and-other-app-specific-export-adapters',
          'require-approval-for-destructive-restores',
        ],
      },
      decisionProjection: {
        status: 'preview-only',
        recordable: false,
        persistenceAllowed: false,
        schedulePersistenceAllowed: false,
        restoreExecutionAllowed: false,
        credentialStorageAllowed: false,
        externalCloudWritesAllowed: false,
      },
      targetSummary: {
        declaredTargetCount: 0,
        policyCount: 1,
        policiesMissingBackupTargetCount: 1,
      },
      persistenceDesignLock: {
        schemaVersion: 'backup-center-persistence-design-lock.v1',
        mode: 'preview-only',
        migrationRequired: true,
        sourceSurface: 'GET /integrations/backup-readiness',
        lockedWriteZones: [
          'prisma-schema',
          'database-migrations',
          'backup-schedule-worker',
          'credential-storage-boundary',
          'restore-execution-boundary',
          'external-cloud-write-boundary',
        ],
        proposedTables: expect.arrayContaining([
          expect.objectContaining({
            name: 'tenant_backup_setup',
          }),
          expect.objectContaining({
            name: 'tenant_backup_schedule',
          }),
          expect.objectContaining({
            name: 'tenant_backup_target',
          }),
          expect.objectContaining({
            name: 'tenant_restore_approval_review',
          }),
        ]),
        guardrails: {
          projectionOnly: true,
          persistenceAllowed: false,
          databaseWritesAllowed: false,
          prismaSchemaWritesAllowed: false,
          migrationWritesAllowed: false,
          schedulePersistenceAllowed: false,
          scheduleExecutionAllowed: false,
          credentialStorageAllowed: false,
          restoreExecutionAllowed: false,
          externalCloudWritesAllowed: false,
        },
        acceptanceCriteria: expect.arrayContaining([
          'readiness response exposes this design lock without creating or updating database rows',
          'future implementation adds reviewed Prisma schema and migration before persistence is enabled',
          'schedule configuration writes remain disabled until a reviewed worker contract exists',
          'credential material is stored only through an approved secret boundary and never in readiness payloads',
          'restore execution remains disabled until approval review, audit, and rollback criteria are implemented',
          'external cloud writes require explicit target ownership validation and operator approval',
        ]),
      },
      persistencePrerequisiteReview: {
        reviewVersion: 'backup-center-persistence-prerequisite-review.v1',
        sourceDesignLockVersion: 'backup-center-persistence-design-lock.v1',
        mode: 'preview-only',
        status: 'blocked-until-reviewed',
        writeReadiness: 'not-ready',
        migrationReadiness: 'not-ready',
        lockedWriteZoneCount: 6,
        proposedTableCount: 4,
        pendingReviewCount: 12,
        blockedGuardrails: [
          'persistenceAllowed',
          'databaseWritesAllowed',
          'prismaSchemaWritesAllowed',
          'migrationWritesAllowed',
          'schedulePersistenceAllowed',
          'scheduleExecutionAllowed',
          'credentialStorageAllowed',
          'restoreExecutionAllowed',
          'externalCloudWritesAllowed',
        ],
        requiredReviewItems: expect.arrayContaining([
          expect.objectContaining({
            table: 'tenant_backup_schedule',
            requirement: 'schedule worker contract reviewed',
            status: 'pending-review',
          }),
          expect.objectContaining({
            table: 'tenant_backup_target',
            requirement: 'credential boundary reviewed',
            status: 'pending-review',
          }),
        ]),
        acceptanceCriteriaCount: 6,
        nextSafeAction:
          'review-prisma-schema-and-migration-before-enabling-backup-persistence',
        guardrails: {
          persistenceAllowed: false,
          databaseWritesAllowed: false,
          migrationWritesAllowed: false,
          scheduleExecutionAllowed: false,
          credentialStorageAllowed: false,
          restoreExecutionAllowed: false,
          externalCloudWritesAllowed: false,
        },
      },
      readinessReviewSummary: {
        statusLabel: 'Setup needed',
        status: 'operator-configuration-required',
        previewOnly: true,
        activationAllowed: false,
        externalActionsAllowed: false,
        validationIssueCount: 0,
        missingInputCount: 10,
        invalidInputCount: 0,
        requiredActionCount: 4,
        recommendedActionCount: 5,
        blockers: [
          'backup-target:missing',
          'storage-policies-without-backup-target',
          'backup-schedule:not-configured',
          'restore-preview:not-implemented',
          'persistence:not-enabled',
          'schedule-execution:not-enabled',
          'credential-storage:not-enabled',
          'restore-execution:not-enabled',
          'external-cloud-writes:not-enabled',
        ],
        nextActions: expect.arrayContaining([
          expect.objectContaining({
            actionKey: 'backup-target:missing',
            actionOrder: 1,
            actionStatus: 'required-before-persistence',
            reason: 'readiness-summary-before-preview-submit',
          }),
          expect.objectContaining({
            actionKey: 'add-local-or-user-cloud-backup-target',
            actionOrder: 5,
            actionStatus: 'recommended-for-review',
          }),
        ]),
        decisionSummary: {
          configuredCount: 0,
          unresolvedCount: 4,
          deferredCount: 0,
        },
        inputSummary: {
          requiredCount: 10,
          providedCount: 0,
          missingInputKeys: [
            'targetClass',
            'targetRefPreview',
            'policyKeys',
            'cadence',
            'timezone',
            'retentionDays',
            'includedConfigScopes',
            'bundleFormat',
            'approvalRequiredFor',
            'approverRole',
          ],
          invalidInputKeys: [],
        },
        persistenceAllowed: false,
        schedulePersistenceAllowed: false,
        restoreExecutionAllowed: false,
        credentialStorageAllowed: false,
        externalCloudWritesAllowed: false,
      },
      activationChecklist: {
        checklistVersion: 'backup-center-activation-checklist.v1',
        mode: 'preview-only',
        status: 'blocked-before-activation',
        activationAllowed: false,
        sourceReviewVersion:
          'backup-center-persistence-prerequisite-review.v1',
        gateSummary: {
          totalGateCount: 7,
          blockedGateCount: 6,
          pendingGateCount: 1,
          readyGateCount: 0,
          nextGateKey: 'operator-input-preview',
          activationRisk: 'high',
        },
        phaseSummary: [
          {
            phaseKey: 'preview-review',
            title: 'Preview review',
            status: 'pending',
            gateKeys: ['operator-input-preview'],
            nextGateKey: 'operator-input-preview',
            gateCount: 1,
            blockedGateCount: 0,
            pendingGateCount: 1,
            readyGateCount: 0,
          },
          {
            phaseKey: 'persistence-foundation',
            title: 'Persistence foundation',
            status: 'blocked',
            gateKeys: ['prisma-schema-review', 'migration-review'],
            nextGateKey: 'prisma-schema-review',
            gateCount: 2,
            blockedGateCount: 2,
            pendingGateCount: 0,
            readyGateCount: 0,
          },
          {
            phaseKey: 'automation-boundaries',
            title: 'Automation boundaries',
            status: 'blocked',
            gateKeys: ['schedule-worker-contract', 'credential-boundary'],
            nextGateKey: 'schedule-worker-contract',
            gateCount: 2,
            blockedGateCount: 2,
            pendingGateCount: 0,
            readyGateCount: 0,
          },
          {
            phaseKey: 'restore-and-external-writes',
            title: 'Restore and external writes',
            status: 'blocked',
            gateKeys: ['restore-approval-flow', 'external-write-approval'],
            nextGateKey: 'restore-approval-flow',
            gateCount: 2,
            blockedGateCount: 2,
            pendingGateCount: 0,
            readyGateCount: 0,
          },
        ],
        phaseBlockerMatrix: [
          {
            phaseKey: 'preview-review',
            title: 'Preview review',
            blockerType: 'preview-evidence-pending',
            blockingGateKeys: ['operator-input-preview'],
            blockingEvidenceKeys: [
              'validated-backup-target-preview',
              'policy-scope-selection',
              'restore-approval-owner',
            ],
            pendingReviewCheckCount: 3,
            nextAction: 'record-preview-evidence-before-submission',
          },
          {
            phaseKey: 'persistence-foundation',
            title: 'Persistence foundation',
            blockerType: 'write-zone-review-required',
            blockingGateKeys: ['prisma-schema-review', 'migration-review'],
            blockingEvidenceKeys: [],
            pendingReviewCheckCount: 0,
            nextAction:
              'complete-preview-review-before-opening-prisma-or-migration-work',
          },
          {
            phaseKey: 'automation-boundaries',
            title: 'Automation boundaries',
            blockerType: 'automation-boundary-review-required',
            blockingGateKeys: [
              'schedule-worker-contract',
              'credential-boundary',
            ],
            blockingEvidenceKeys: [],
            pendingReviewCheckCount: 0,
            nextAction:
              'complete-preview-review-before-opening-schedule-or-credential-work',
          },
          {
            phaseKey: 'restore-and-external-writes',
            title: 'Restore and external writes',
            blockerType: 'approval-boundary-review-required',
            blockingGateKeys: [
              'restore-approval-flow',
              'external-write-approval',
            ],
            blockingEvidenceKeys: [],
            pendingReviewCheckCount: 0,
            nextAction:
              'complete-preview-review-before-opening-restore-or-external-write-work',
          },
        ],
        operatorActionPriority: {
          priorityVersion: 'backup-center-operator-action-priority.v1',
          status: 'preview-action-queue-ready',
          prioritizationRule:
            'preview-unblock-plan-order-with-current-blocker-tie',
          recommendedFirstAction: 'fill-preview-only-setup-form',
          actions: [
            {
              actionKey: 'fill-preview-only-setup-form',
              rank: 1,
              priorityReason:
                'first-missing-preview-evidence-in-current-unblock-plan',
              clearsEvidenceKeys: ['validated-backup-target-preview'],
              clearsReviewCheckKeys: ['target-ownership-confirmed'],
              clearsBlockedReasons: [
                'validated-backup-target-preview:missing',
              ],
              affectsPhaseKeys: ['preview-review'],
              blockedSignalCount: 4,
            },
            {
              actionKey: 'review-readiness-summary',
              rank: 2,
              priorityReason:
                'second-missing-preview-evidence-in-current-unblock-plan',
              clearsEvidenceKeys: ['policy-scope-selection'],
              clearsReviewCheckKeys: ['backup-scope-clear'],
              clearsBlockedReasons: ['policy-scope-selection:missing'],
              affectsPhaseKeys: ['preview-review'],
              blockedSignalCount: 4,
            },
            {
              actionKey: 'restore-approval-review',
              rank: 3,
              priorityReason:
                'third-missing-preview-evidence-in-current-unblock-plan',
              clearsEvidenceKeys: ['restore-approval-owner'],
              clearsReviewCheckKeys: ['restore-approval-accountable'],
              clearsBlockedReasons: ['restore-approval-owner:missing'],
              affectsPhaseKeys: ['preview-review'],
              blockedSignalCount: 4,
            },
          ],
          nextPriorityAction: 'fill-preview-only-setup-form',
        },
        submissionImpactForecast: {
          forecastVersion: 'backup-center-submission-impact-forecast.v1',
          status: 'projected-preview-unblock-sequence',
          currentMissingEvidenceCount: 3,
          currentPendingReviewCheckCount: 3,
          currentBlockedReasonCount: 3,
          sequence: [
            {
              actionKey: 'fill-preview-only-setup-form',
              rank: 1,
              clearedEvidenceKey: 'validated-backup-target-preview',
              projectedMissingEvidenceCount: 2,
              projectedPendingReviewCheckCount: 2,
              projectedBlockedReasonCount: 2,
              projectedSubmissionAllowed: false,
            },
            {
              actionKey: 'review-readiness-summary',
              rank: 2,
              clearedEvidenceKey: 'policy-scope-selection',
              projectedMissingEvidenceCount: 1,
              projectedPendingReviewCheckCount: 1,
              projectedBlockedReasonCount: 1,
              projectedSubmissionAllowed: false,
            },
            {
              actionKey: 'restore-approval-review',
              rank: 3,
              clearedEvidenceKey: 'restore-approval-owner',
              projectedMissingEvidenceCount: 0,
              projectedPendingReviewCheckCount: 0,
              projectedBlockedReasonCount: 0,
              projectedSubmissionAllowed: true,
            },
          ],
          forecastNote:
            'Projection assumes each ranked preview action records its linked evidence and satisfies the matching review signal.',
          nextForecastAction: 'fill-preview-only-setup-form',
        },
        previewSubmissionUnlockMatrix: {
          matrixVersion: 'backup-center-preview-submission-unlock-matrix.v1',
          status: 'preview-submission-unlocks-pending',
          unlockCount: 3,
          unlockedCount: 0,
          rows: [
            {
              unlockKey: 'all-preview-evidence-recorded',
              label: 'All preview evidence recorded',
              status: 'blocked',
              remainingCount: 3,
              evidenceKeys: [
                'validated-backup-target-preview',
                'policy-scope-selection',
                'restore-approval-owner',
              ],
              blockedReasons: [
                'validated-backup-target-preview:missing',
                'policy-scope-selection:missing',
                'restore-approval-owner:missing',
              ],
              nextAction: 'record-preview-evidence-before-submission',
            },
            {
              unlockKey: 'all-preview-evidence-checks-passed',
              label: 'All preview evidence checks passed',
              status: 'blocked',
              remainingCount: 3,
              reviewCheckKeys: [
                'target-ownership-confirmed',
                'backup-scope-clear',
                'restore-approval-accountable',
              ],
              requiredSignals: [
                'owner-confirmation-present',
                'scope-key-and-reason-present',
                'owner-role-and-channel-present',
              ],
              nextAction: 'review-preview-evidence-before-submission',
            },
            {
              unlockKey: 'preview-review-packet-complete',
              label: 'Preview review packet complete',
              status: 'blocked',
              remainingCount: 3,
              packetItemKeys: [
                'operator-readiness-digest',
                'validated-backup-target-preview',
                'policy-scope-selection',
                'restore-approval-owner',
              ],
              missingPacketItemKeys: [
                'validated-backup-target-preview',
                'policy-scope-selection',
                'restore-approval-owner',
              ],
              nextAction: 'assemble-preview-review-packet-before-submission',
            },
          ],
          nextUnlockAction: 'record-preview-evidence-before-submission',
        },
        previewActionUnlockCoverage: {
          coverageVersion: 'backup-center-preview-action-unlock-coverage.v1',
          status: 'preview-actions-linked-to-unlocks',
          recommendedAction: 'fill-preview-only-setup-form',
          actions: [
            {
              actionKey: 'fill-preview-only-setup-form',
              rank: 1,
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              advancesEvidenceKeys: ['validated-backup-target-preview'],
              advancesReviewCheckKeys: ['target-ownership-confirmed'],
              clearsPacketItemKeys: ['validated-backup-target-preview'],
              unlockSignalCount: 3,
            },
            {
              actionKey: 'review-readiness-summary',
              rank: 2,
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              advancesEvidenceKeys: ['policy-scope-selection'],
              advancesReviewCheckKeys: ['backup-scope-clear'],
              clearsPacketItemKeys: ['policy-scope-selection'],
              unlockSignalCount: 3,
            },
            {
              actionKey: 'restore-approval-review',
              rank: 3,
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              advancesEvidenceKeys: ['restore-approval-owner'],
              advancesReviewCheckKeys: ['restore-approval-accountable'],
              clearsPacketItemKeys: ['restore-approval-owner'],
              unlockSignalCount: 3,
            },
          ],
          nextCoverageAction: 'fill-preview-only-setup-form',
        },
        previewUnlockProgression: {
          progressionVersion: 'backup-center-preview-unlock-progression.v1',
          status: 'unlock-conditions-projected-across-ranked-actions',
          currentBlockedUnlockCount: 3,
          steps: [
            {
              actionKey: 'fill-preview-only-setup-form',
              rank: 1,
              remainingBlockedUnlockCount: 3,
              clearedUnlockKeys: [],
              resultingSubmissionAllowed: false,
            },
            {
              actionKey: 'review-readiness-summary',
              rank: 2,
              remainingBlockedUnlockCount: 3,
              clearedUnlockKeys: [],
              resultingSubmissionAllowed: false,
            },
            {
              actionKey: 'restore-approval-review',
              rank: 3,
              remainingBlockedUnlockCount: 0,
              clearedUnlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              resultingSubmissionAllowed: true,
            },
          ],
          nextProgressionAction: 'fill-preview-only-setup-form',
        },
        previewEvidenceUnlockDependencies: {
          dependencyVersion:
            'backup-center-preview-evidence-unlock-dependencies.v1',
          status: 'evidence-linked-to-unlock-conditions',
          itemCount: 3,
          rows: [
            {
              evidenceKey: 'validated-backup-target-preview',
              actionKey: 'fill-preview-only-setup-form',
              reviewCheckKey: 'target-ownership-confirmed',
              packetItemKey: 'validated-backup-target-preview',
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              dependencyCount: 3,
            },
            {
              evidenceKey: 'policy-scope-selection',
              actionKey: 'review-readiness-summary',
              reviewCheckKey: 'backup-scope-clear',
              packetItemKey: 'policy-scope-selection',
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              dependencyCount: 3,
            },
            {
              evidenceKey: 'restore-approval-owner',
              actionKey: 'restore-approval-review',
              reviewCheckKey: 'restore-approval-accountable',
              packetItemKey: 'restore-approval-owner',
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              dependencyCount: 3,
            },
          ],
          nextDependencyAction: 'fill-preview-only-setup-form',
        },
        previewReviewCheckCoverage: {
          coverageVersion: 'backup-center-preview-review-check-coverage.v1',
          status: 'review-checks-linked-to-evidence-packets-and-unlocks',
          checkCount: 3,
          rows: [
            {
              reviewCheckKey: 'target-ownership-confirmed',
              evidenceKey: 'validated-backup-target-preview',
              actionKey: 'fill-preview-only-setup-form',
              requiredSignals: ['owner-confirmation-present'],
              packetItemKey: 'validated-backup-target-preview',
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              dependencyCount: 3,
            },
            {
              reviewCheckKey: 'backup-scope-clear',
              evidenceKey: 'policy-scope-selection',
              actionKey: 'review-readiness-summary',
              requiredSignals: ['scope-key-and-reason-present'],
              packetItemKey: 'policy-scope-selection',
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              dependencyCount: 3,
            },
            {
              reviewCheckKey: 'restore-approval-accountable',
              evidenceKey: 'restore-approval-owner',
              actionKey: 'restore-approval-review',
              requiredSignals: ['owner-role-and-channel-present'],
              packetItemKey: 'restore-approval-owner',
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              dependencyCount: 3,
            },
          ],
          nextCheckAction: 'fill-preview-only-setup-form',
        },
        previewReviewSignalChecklist: {
          checklistVersion:
            'backup-center-preview-review-signal-checklist.v1',
          status: 'preview-review-signals-pending',
          pendingSignalCount: 3,
          rows: [
            {
              reviewCheckKey: 'target-ownership-confirmed',
              signalKey: 'owner-confirmation-present',
              currentStatus: 'missing',
              requiredEvidenceFields: [
                'targetClass',
                'targetRefPreview',
                'ownerConfirmation',
              ],
              missingReason:
                'validated-backup-target-preview evidence has not been submitted for review.',
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              nextOperatorAction: 'fill-preview-only-setup-form',
            },
            {
              reviewCheckKey: 'backup-scope-clear',
              signalKey: 'scope-key-and-reason-present',
              currentStatus: 'missing',
              requiredEvidenceFields: [
                'policyKeys',
                'includedConfigScopes',
                'scopeRationale',
              ],
              missingReason:
                'policy-scope-selection evidence has not been submitted for review.',
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              nextOperatorAction: 'review-readiness-summary',
            },
            {
              reviewCheckKey: 'restore-approval-accountable',
              signalKey: 'owner-role-and-channel-present',
              currentStatus: 'missing',
              requiredEvidenceFields: [
                'approvalRequiredFor',
                'approverRole',
                'approvalChannel',
              ],
              missingReason:
                'restore-approval-owner evidence has not been submitted for review.',
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              nextOperatorAction: 'restore-approval-review',
            },
          ],
          nextSignalAction: 'fill-preview-only-setup-form',
        },
        previewReviewSignalCoverage: {
          coverageVersion: 'backup-center-preview-review-signal-coverage.v1',
          status: 'review-signals-linked-to-checks-evidence-and-unlocks',
          signalCount: 3,
          rows: [
            {
              signalKey: 'owner-confirmation-present',
              reviewCheckKeys: ['target-ownership-confirmed'],
              evidenceKeys: ['validated-backup-target-preview'],
              actionKeys: ['fill-preview-only-setup-form'],
              packetItemKeys: ['validated-backup-target-preview'],
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              dependencyCount: 3,
            },
            {
              signalKey: 'scope-key-and-reason-present',
              reviewCheckKeys: ['backup-scope-clear'],
              evidenceKeys: ['policy-scope-selection'],
              actionKeys: ['review-readiness-summary'],
              packetItemKeys: ['policy-scope-selection'],
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              dependencyCount: 3,
            },
            {
              signalKey: 'owner-role-and-channel-present',
              reviewCheckKeys: ['restore-approval-accountable'],
              evidenceKeys: ['restore-approval-owner'],
              actionKeys: ['restore-approval-review'],
              packetItemKeys: ['restore-approval-owner'],
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              dependencyCount: 3,
            },
          ],
          nextSignalCoverageAction: 'fill-preview-only-setup-form',
        },
        previewReviewFieldCoverage: {
          coverageVersion: 'backup-center-preview-review-field-coverage.v1',
          status: 'review-fields-linked-to-signals-and-actions',
          fieldCount: 9,
          rows: [
            {
              fieldKey: 'targetClass',
              signalKey: 'owner-confirmation-present',
              reviewCheckKey: 'target-ownership-confirmed',
              evidenceKey: 'validated-backup-target-preview',
              actionKey: 'fill-preview-only-setup-form',
              currentStatus: 'missing',
            },
            {
              fieldKey: 'targetRefPreview',
              signalKey: 'owner-confirmation-present',
              reviewCheckKey: 'target-ownership-confirmed',
              evidenceKey: 'validated-backup-target-preview',
              actionKey: 'fill-preview-only-setup-form',
              currentStatus: 'missing',
            },
            {
              fieldKey: 'ownerConfirmation',
              signalKey: 'owner-confirmation-present',
              reviewCheckKey: 'target-ownership-confirmed',
              evidenceKey: 'validated-backup-target-preview',
              actionKey: 'fill-preview-only-setup-form',
              currentStatus: 'missing',
            },
            {
              fieldKey: 'policyKeys',
              signalKey: 'scope-key-and-reason-present',
              reviewCheckKey: 'backup-scope-clear',
              evidenceKey: 'policy-scope-selection',
              actionKey: 'review-readiness-summary',
              currentStatus: 'missing',
            },
            {
              fieldKey: 'includedConfigScopes',
              signalKey: 'scope-key-and-reason-present',
              reviewCheckKey: 'backup-scope-clear',
              evidenceKey: 'policy-scope-selection',
              actionKey: 'review-readiness-summary',
              currentStatus: 'missing',
            },
            {
              fieldKey: 'scopeRationale',
              signalKey: 'scope-key-and-reason-present',
              reviewCheckKey: 'backup-scope-clear',
              evidenceKey: 'policy-scope-selection',
              actionKey: 'review-readiness-summary',
              currentStatus: 'missing',
            },
            {
              fieldKey: 'approvalRequiredFor',
              signalKey: 'owner-role-and-channel-present',
              reviewCheckKey: 'restore-approval-accountable',
              evidenceKey: 'restore-approval-owner',
              actionKey: 'restore-approval-review',
              currentStatus: 'missing',
            },
            {
              fieldKey: 'approverRole',
              signalKey: 'owner-role-and-channel-present',
              reviewCheckKey: 'restore-approval-accountable',
              evidenceKey: 'restore-approval-owner',
              actionKey: 'restore-approval-review',
              currentStatus: 'missing',
            },
            {
              fieldKey: 'approvalChannel',
              signalKey: 'owner-role-and-channel-present',
              reviewCheckKey: 'restore-approval-accountable',
              evidenceKey: 'restore-approval-owner',
              actionKey: 'restore-approval-review',
              currentStatus: 'missing',
            },
          ],
          nextFieldCoverageAction: 'fill-preview-only-setup-form',
        },
        previewReviewFieldActionMap: {
          mapVersion: 'backup-center-preview-review-field-action-map.v1',
          status: 'review-fields-grouped-by-preview-action',
          actionCount: 3,
          totalFieldCount: 9,
          rows: [
            {
              actionKey: 'fill-preview-only-setup-form',
              rank: 1,
              fieldKeys: [
                'targetClass',
                'targetRefPreview',
                'ownerConfirmation',
              ],
              signalKey: 'owner-confirmation-present',
              reviewCheckKey: 'target-ownership-confirmed',
              evidenceKey: 'validated-backup-target-preview',
              missingFieldCount: 3,
            },
            {
              actionKey: 'review-readiness-summary',
              rank: 2,
              fieldKeys: [
                'policyKeys',
                'includedConfigScopes',
                'scopeRationale',
              ],
              signalKey: 'scope-key-and-reason-present',
              reviewCheckKey: 'backup-scope-clear',
              evidenceKey: 'policy-scope-selection',
              missingFieldCount: 3,
            },
            {
              actionKey: 'restore-approval-review',
              rank: 3,
              fieldKeys: [
                'approvalRequiredFor',
                'approverRole',
                'approvalChannel',
              ],
              signalKey: 'owner-role-and-channel-present',
              reviewCheckKey: 'restore-approval-accountable',
              evidenceKey: 'restore-approval-owner',
              missingFieldCount: 3,
            },
          ],
          nextFieldAction: 'fill-preview-only-setup-form',
        },
        previewReviewActionDependencySummary: {
          summaryVersion:
            'backup-center-preview-review-action-dependency-summary.v1',
          status: 'preview-actions-linked-to-review-dependencies',
          actionCount: 3,
          totalDependencyCount: 18,
          rows: [
            {
              actionKey: 'fill-preview-only-setup-form',
              rank: 1,
              missingFieldKeys: [
                'targetClass',
                'targetRefPreview',
                'ownerConfirmation',
              ],
              reviewCheckKey: 'target-ownership-confirmed',
              signalKey: 'owner-confirmation-present',
              evidenceKey: 'validated-backup-target-preview',
              packetItemKey: 'validated-backup-target-preview',
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              dependencyCount: 6,
            },
            {
              actionKey: 'review-readiness-summary',
              rank: 2,
              missingFieldKeys: [
                'policyKeys',
                'includedConfigScopes',
                'scopeRationale',
              ],
              reviewCheckKey: 'backup-scope-clear',
              signalKey: 'scope-key-and-reason-present',
              evidenceKey: 'policy-scope-selection',
              packetItemKey: 'policy-scope-selection',
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              dependencyCount: 6,
            },
            {
              actionKey: 'restore-approval-review',
              rank: 3,
              missingFieldKeys: [
                'approvalRequiredFor',
                'approverRole',
                'approvalChannel',
              ],
              reviewCheckKey: 'restore-approval-accountable',
              signalKey: 'owner-role-and-channel-present',
              evidenceKey: 'restore-approval-owner',
              packetItemKey: 'restore-approval-owner',
              unlockKeys: [
                'all-preview-evidence-recorded',
                'all-preview-evidence-checks-passed',
                'preview-review-packet-complete',
              ],
              dependencyCount: 6,
            },
          ],
          nextDependencyAction: 'fill-preview-only-setup-form',
        },
        previewReviewDependencyClosure: {
          closureVersion: 'backup-center-preview-review-dependency-closure.v1',
          status: 'preview-review-dependencies-open',
          closureMode: 'all-dependencies-required-before-preview-submission',
          dependencyGroupCount: 3,
          openDependencyGroupCount: 3,
          totalOpenDependencyCount: 18,
          rows: [
            {
              actionKey: 'fill-preview-only-setup-form',
              rank: 1,
              dependencyGroupKey: 'validated-backup-target-preview-closure',
              closureStatus: 'open',
              openDependencyKeys: [
                'targetClass',
                'targetRefPreview',
                'ownerConfirmation',
                'target-ownership-confirmed',
                'owner-confirmation-present',
                'validated-backup-target-preview',
              ],
              unlockKey: 'all-preview-evidence-recorded',
              nextClosureAction: 'fill-preview-only-setup-form',
            },
            {
              actionKey: 'review-readiness-summary',
              rank: 2,
              dependencyGroupKey: 'policy-scope-selection-closure',
              closureStatus: 'open',
              openDependencyKeys: [
                'policyKeys',
                'includedConfigScopes',
                'scopeRationale',
                'backup-scope-clear',
                'scope-key-and-reason-present',
                'policy-scope-selection',
              ],
              unlockKey: 'all-preview-evidence-checks-passed',
              nextClosureAction: 'review-readiness-summary',
            },
            {
              actionKey: 'restore-approval-review',
              rank: 3,
              dependencyGroupKey: 'restore-approval-owner-closure',
              closureStatus: 'open',
              openDependencyKeys: [
                'approvalRequiredFor',
                'approverRole',
                'approvalChannel',
                'restore-approval-accountable',
                'owner-role-and-channel-present',
                'restore-approval-owner',
              ],
              unlockKey: 'preview-review-packet-complete',
              nextClosureAction: 'restore-approval-review',
            },
          ],
          nextClosureAction: 'fill-preview-only-setup-form',
        },
        previewReviewClosureSequence: {
          sequenceVersion: 'backup-center-preview-review-closure-sequence.v1',
          status: 'preview-review-closure-sequence-open',
          sequenceMode: 'close-preview-dependencies-before-submission',
          stepCount: 3,
          completedStepCount: 0,
          remainingStepCount: 3,
          steps: [
            {
              stepKey: 'close-validated-backup-target-preview',
              rank: 1,
              actionKey: 'fill-preview-only-setup-form',
              dependencyGroupKey: 'validated-backup-target-preview-closure',
              closesOpenDependencyCount: 6,
              closesUnlockKey: 'all-preview-evidence-recorded',
              stepStatus: 'pending',
              nextStepAction: 'fill-preview-only-setup-form',
            },
            {
              stepKey: 'close-policy-scope-selection',
              rank: 2,
              actionKey: 'review-readiness-summary',
              dependencyGroupKey: 'policy-scope-selection-closure',
              closesOpenDependencyCount: 6,
              closesUnlockKey: 'all-preview-evidence-checks-passed',
              stepStatus: 'pending',
              nextStepAction: 'review-readiness-summary',
            },
            {
              stepKey: 'close-restore-approval-owner',
              rank: 3,
              actionKey: 'restore-approval-review',
              dependencyGroupKey: 'restore-approval-owner-closure',
              closesOpenDependencyCount: 6,
              closesUnlockKey: 'preview-review-packet-complete',
              stepStatus: 'pending',
              nextStepAction: 'restore-approval-review',
            },
          ],
          finalSequenceAction: 'submit-preview-only-backup-setup-review',
          nextSequenceAction: 'fill-preview-only-setup-form',
        },
        previewReviewClosureHandoff: {
          handoffVersion: 'backup-center-preview-review-closure-handoff.v1',
          status: 'preview-review-closure-handoff-blocked',
          handoffMode: 'operator-closes-sequence-before-preview-submit',
          submissionAction: 'submit-preview-only-backup-setup-review',
          submissionAllowed: false,
          requiredStepCount: 3,
          completedStepCount: 0,
          remainingStepCount: 3,
          firstRequiredStepKey: 'close-validated-backup-target-preview',
          firstRequiredAction: 'fill-preview-only-setup-form',
          handoffBlockers: [
            'closure-sequence:remaining-steps',
            'preview-review-packet:incomplete',
            'submission-unlocks:blocked',
          ],
          readyWhen: [
            'all-closure-steps-complete',
            'preview-review-packet-complete',
            'all-preview-unlocks-cleared',
          ],
          nextHandoffAction: 'fill-preview-only-setup-form',
        },
        previewReviewSubmissionGate: {
          gateVersion: 'backup-center-preview-review-submission-gate.v1',
          status: 'preview-review-submission-gate-closed',
          gateMode: 'preview-only-submit-after-closure-handoff',
          submissionAction: 'submit-preview-only-backup-setup-review',
          submissionAllowed: false,
          closureHandoffStatus: 'preview-review-closure-handoff-blocked',
          requiredClosureStepCount: 3,
          remainingClosureStepCount: 3,
          openGateKeys: [
            'all-preview-evidence-recorded',
            'all-preview-evidence-checks-passed',
            'preview-review-packet-complete',
          ],
          blockedBy: [
            'preview-review-closure-handoff-blocked',
            'all-closure-steps-complete:not-satisfied',
            'submission-unlocks:blocked',
          ],
          finalOperatorAction: 'submit-preview-only-backup-setup-review',
          nextGateAction: 'fill-preview-only-setup-form',
        },
        previewReviewSubmissionGateResolution: {
          resolutionVersion:
            'backup-center-preview-review-submission-gate-resolution.v1',
          status: 'preview-review-submission-gate-resolution-open',
          resolutionMode: 'resolve-open-preview-gates-before-submit',
          openGateCount: 3,
          resolvedGateCount: 0,
          remainingGateCount: 3,
          rows: [
            {
              gateKey: 'all-preview-evidence-recorded',
              gateStatus: 'open',
              requiredClosureStepKey: 'close-validated-backup-target-preview',
              requiredOperatorAction: 'fill-preview-only-setup-form',
              clearsWhen: 'validated-backup-target-preview-recorded',
            },
            {
              gateKey: 'all-preview-evidence-checks-passed',
              gateStatus: 'open',
              requiredClosureStepKey: 'close-policy-scope-selection',
              requiredOperatorAction: 'review-readiness-summary',
              clearsWhen: 'policy-scope-selection-reviewed',
            },
            {
              gateKey: 'preview-review-packet-complete',
              gateStatus: 'open',
              requiredClosureStepKey: 'close-restore-approval-owner',
              requiredOperatorAction: 'restore-approval-review',
              clearsWhen: 'restore-approval-owner-packeted',
            },
          ],
          nextResolutionAction: 'fill-preview-only-setup-form',
        },
        previewReviewSubmissionAttempt: {
          attemptVersion: 'backup-center-preview-review-submission-attempt.v1',
          status: 'preview-review-submission-attempt-blocked',
          attemptMode: 'dry-run-submit-readiness-check',
          submissionAction: 'submit-preview-only-backup-setup-review',
          attemptAllowed: false,
          operatorCanAttemptNow: false,
          blockingGateCount: 3,
          blockingClosureStepCount: 3,
          blockingReasons: [
            'preview-review-closure-handoff-blocked',
            'preview-review-submission-gate-resolution-open',
            'preview-review-packet:incomplete',
          ],
          requiredBeforeAttempt: [
            'resolve-all-preview-submission-gates',
            'complete-preview-review-closure-handoff',
            'complete-preview-review-packet',
          ],
          nextAttemptAction: 'fill-preview-only-setup-form',
        },
        previewReviewSubmissionAttemptOutcome: {
          outcomeVersion:
            'backup-center-preview-review-submission-attempt-outcome.v1',
          status: 'preview-review-submission-attempt-outcome-blocked',
          outcomeMode: 'dry-run-result-without-submission-write',
          attemptedAction: 'submit-preview-only-backup-setup-review',
          outcome: 'blocked',
          submissionRecorded: false,
          writeAttempted: false,
          safeToRetryAfterAction: 'fill-preview-only-setup-form',
          operatorMessage:
            'Preview submission remains blocked until all gates, closure steps, and review packet requirements are complete.',
          failedChecks: [
            {
              checkKey: 'submission-gates-resolved',
              status: 'blocked',
              blockingCount: 3,
              nextAction: 'fill-preview-only-setup-form',
            },
            {
              checkKey: 'closure-handoff-ready',
              status: 'blocked',
              blockingCount: 3,
              nextAction: 'fill-preview-only-setup-form',
            },
            {
              checkKey: 'review-packet-complete',
              status: 'blocked',
              blockingCount: 3,
              nextAction: 'fill-preview-only-setup-form',
            },
          ],
          nextOutcomeAction: 'fill-preview-only-setup-form',
        },
        previewReviewSubmissionRetryPlan: {
          retryPlanVersion:
            'backup-center-preview-review-submission-retry-plan.v1',
          status: 'preview-review-submission-retry-blocked',
          retryMode: 'retry-after-preview-gate-resolution',
          retryAllowedNow: false,
          retryAction: 'submit-preview-only-backup-setup-review',
          currentFailureOutcome:
            'preview-review-submission-attempt-outcome-blocked',
          requiredRetryStepCount: 3,
          completedRetryStepCount: 0,
          remainingRetryStepCount: 3,
          steps: [
            {
              stepKey: 'resolve-submission-gates',
              rank: 1,
              sourceFailedCheck: 'submission-gates-resolved',
              requiredOperatorAction: 'fill-preview-only-setup-form',
              retryStepStatus: 'pending',
            },
            {
              stepKey: 'complete-closure-handoff',
              rank: 2,
              sourceFailedCheck: 'closure-handoff-ready',
              requiredOperatorAction: 'review-readiness-summary',
              retryStepStatus: 'pending',
            },
            {
              stepKey: 'complete-review-packet',
              rank: 3,
              sourceFailedCheck: 'review-packet-complete',
              requiredOperatorAction: 'restore-approval-review',
              retryStepStatus: 'pending',
            },
          ],
          retryWhen: [
            'no-failed-submission-attempt-checks',
            'submission-gate-resolution-complete',
            'preview-review-packet-complete',
          ],
          nextRetryAction: 'fill-preview-only-setup-form',
        },
        previewReviewSubmissionRetryQueue: {
          retryQueueVersion:
            'backup-center-preview-review-submission-retry-queue.v1',
          status: 'preview-review-submission-retry-queue-blocked',
          queueMode: 'ordered-preview-retry-dependency-queue',
          queuedItemCount: 3,
          readyItemCount: 0,
          blockedItemCount: 3,
          items: [
            {
              queuePosition: 1,
              stepKey: 'resolve-submission-gates',
              sourceFailedCheck: 'submission-gates-resolved',
              requiredOperatorAction: 'fill-preview-only-setup-form',
              queueStatus: 'blocked-by-preview-review-gate',
              releaseCondition: 'submission-gate-resolution-complete',
            },
            {
              queuePosition: 2,
              stepKey: 'complete-closure-handoff',
              sourceFailedCheck: 'closure-handoff-ready',
              requiredOperatorAction: 'review-readiness-summary',
              queueStatus: 'blocked-by-preview-review-gate',
              releaseCondition: 'preview-review-closure-handoff-ready',
            },
            {
              queuePosition: 3,
              stepKey: 'complete-review-packet',
              sourceFailedCheck: 'review-packet-complete',
              requiredOperatorAction: 'restore-approval-review',
              queueStatus: 'blocked-by-preview-review-gate',
              releaseCondition: 'preview-review-packet-complete',
            },
          ],
          nextQueueAction: 'fill-preview-only-setup-form',
        },
        previewReviewSubmissionRetryReleaseChecklist: {
          releaseChecklistVersion:
            'backup-center-preview-review-submission-retry-release-checklist.v1',
          status: 'preview-review-submission-retry-release-blocked',
          releaseMode: 'preview-retry-release-readiness-check',
          releaseAllowed: false,
          requiredReleaseCheckCount: 3,
          passedReleaseCheckCount: 0,
          blockedReleaseCheckCount: 3,
          checks: [
            {
              checkKey: 'submission-gates-resolved',
              status: 'blocked',
              queueStepKey: 'resolve-submission-gates',
              requiredOperatorAction: 'fill-preview-only-setup-form',
              clearsWhen: 'submission-gate-resolution-complete',
            },
            {
              checkKey: 'closure-handoff-ready',
              status: 'blocked',
              queueStepKey: 'complete-closure-handoff',
              requiredOperatorAction: 'review-readiness-summary',
              clearsWhen: 'preview-review-closure-handoff-ready',
            },
            {
              checkKey: 'review-packet-complete',
              status: 'blocked',
              queueStepKey: 'complete-review-packet',
              requiredOperatorAction: 'restore-approval-review',
              clearsWhen: 'preview-review-packet-complete',
            },
          ],
          nextReleaseAction: 'fill-preview-only-setup-form',
        },
        operatorHandoff: {
          handoffVersion: 'backup-center-activation-operator-handoff.v1',
          mode: 'preview-only',
          sourceSurface: 'GET /integrations/backup-readiness',
          previewEndpoint: 'POST /integrations/backup-setup-preview',
          primaryNextGateKey: 'operator-input-preview',
          primaryNextOperation: 'submit-preview-only-backup-setup-review',
          allowedOperations: [
            'review-readiness-summary',
            'submit-preview-only-backup-setup-review',
            'inspect-activation-gates',
          ],
          disabledOperations: [
            'persist-backup-setup',
            'run-database-migration',
            'persist-backup-schedule',
            'store-backup-credentials',
            'execute-restore',
            'write-external-cloud-target',
          ],
          runbook: {
            runbookVersion: 'backup-center-operator-runbook.v1',
            status: 'preview-review-required',
            nextReviewStep: 'collect-preview-inputs-and-submit-review',
            evidenceRequired: [
              'validated-backup-target-preview',
              'policy-scope-selection',
              'restore-approval-owner',
            ],
            safeSequence: [
              'review-readiness-summary',
              'fill-preview-only-setup-form',
              'submit-preview-only-backup-setup-review',
              'inspect-activation-gates',
            ],
            escalationTriggers: [
              'prisma-schema-review-requested',
              'migration-review-requested',
              'credential-storage-requested',
              'external-cloud-write-requested',
            ],
          },
        },
        customerImpactPreview: {
          previewVersion: 'backup-center-customer-impact-preview.v1',
          status: 'protected-preview-only',
          customerRiskLevel: 'contained',
          currentCustomerExperience:
            'Customer-facing operations continue without backup automation until operator review is complete.',
          expectedBenefitAfterActivation:
            'Customers gain safer restore governance and clearer continuity coverage once reviewed persistence and restore controls are enabled.',
          protections: [
            'no-customer-data-export-without-review',
            'no-restore-execution-without-approval',
            'no-external-cloud-write-without-target-ownership-review',
          ],
        },
        operatorReadinessDigest: {
          digestVersion: 'backup-center-operator-readiness-digest.v1',
          status: 'preview-ready-activation-blocked',
          operatorState: 'ready-to-preview-not-ready-to-activate',
          nextOperatorAction: 'submit-preview-only-backup-setup-review',
          currentActivationRisk: 'high',
          customerRiskLevel: 'contained',
          readyGateCount: 0,
          pendingGateCount: 1,
          blockedGateCount: 6,
          evidenceRequiredCount: 3,
          disabledOperationCount: 6,
          summaryPoints: [
            'operator-preview-is-the-next-safe-step',
            'activation-remains-blocked-before-persistence-review',
            'customer-impact-is-contained-while-actions-stay-preview-only',
          ],
        },
        evidenceChecklist: {
          checklistVersion: 'backup-center-evidence-checklist.v1',
          status: 'evidence-needed-before-preview-review',
          requiredEvidenceCount: 3,
          capturedEvidenceCount: 0,
          missingEvidenceCount: 3,
          items: [
            {
              key: 'validated-backup-target-preview',
              label: 'Validated backup target preview',
              status: 'missing',
              sourceStep: 'fill-preview-only-setup-form',
            },
            {
              key: 'policy-scope-selection',
              label: 'Policy scope selection',
              status: 'missing',
              sourceStep: 'review-readiness-summary',
            },
            {
              key: 'restore-approval-owner',
              label: 'Restore approval owner',
              status: 'missing',
              sourceStep: 'restore-approval-review',
            },
          ],
          nextEvidenceAction: 'collect-preview-evidence-before-activation-review',
        },
        previewReviewPacket: {
          packetVersion: 'backup-center-preview-review-packet.v1',
          status: 'ready-to-assemble-preview-review',
          sourceEndpoint: 'POST /integrations/backup-setup-preview',
          nextSubmissionAction: 'submit-preview-only-backup-setup-review',
          requiredPacketItemCount: 4,
          readyPacketItemCount: 1,
          missingPacketItemCount: 3,
          packetItems: [
            {
              key: 'operator-readiness-digest',
              status: 'ready',
              sourceVersion: 'backup-center-operator-readiness-digest.v1',
            },
            {
              key: 'validated-backup-target-preview',
              status: 'missing',
              sourceVersion: 'backup-center-evidence-checklist.v1',
            },
            {
              key: 'policy-scope-selection',
              status: 'missing',
              sourceVersion: 'backup-center-evidence-checklist.v1',
            },
            {
              key: 'restore-approval-owner',
              status: 'missing',
              sourceVersion: 'backup-center-evidence-checklist.v1',
            },
          ],
        },
        previewSubmissionReadiness: {
          readinessVersion: 'backup-center-preview-submission-readiness.v1',
          status: 'blocked-pending-preview-evidence',
          previewOnly: true,
          submissionAllowed: false,
          nextSubmissionAction: 'collect-preview-evidence-before-submission',
          readyPacketItemCount: 1,
          missingPacketItemCount: 3,
          requiredEvidenceCount: 3,
          missingEvidenceCount: 3,
          blockedReasons: [
            'validated-backup-target-preview:missing',
            'policy-scope-selection:missing',
            'restore-approval-owner:missing',
          ],
        },
        previewUnblockPlan: {
          planVersion: 'backup-center-preview-unblock-plan.v1',
          status: 'ready-for-operator-evidence-collection',
          firstActionKey: 'validated-backup-target-preview',
          stepCount: 3,
          completedStepCount: 0,
          remainingStepCount: 3,
          steps: [
            {
              key: 'validated-backup-target-preview',
              label: 'Validate backup target preview',
              status: 'pending',
              sourceStep: 'fill-preview-only-setup-form',
              unblocks: 'preview-submission-target-evidence',
            },
            {
              key: 'policy-scope-selection',
              label: 'Confirm backup policy scope',
              status: 'pending',
              sourceStep: 'review-readiness-summary',
              unblocks: 'preview-submission-policy-evidence',
            },
            {
              key: 'restore-approval-owner',
              label: 'Assign restore approval owner',
              status: 'pending',
              sourceStep: 'restore-approval-review',
              unblocks: 'preview-submission-approval-evidence',
            },
          ],
          finalAction: 'submit-preview-only-backup-setup-review',
        },
        previewEvidenceCaptureGuide: {
          guideVersion: 'backup-center-preview-evidence-capture-guide.v1',
          status: 'ready-for-preview-only-capture',
          captureMode: 'operator-notes-only',
          itemCount: 3,
          items: [
            {
              evidenceKey: 'validated-backup-target-preview',
              capturePrompt:
                'Confirm target type, destination label, and owner.',
              expectedFormat:
                'target-type + destination + owner-confirmation',
              sourceStep: 'fill-preview-only-setup-form',
            },
            {
              evidenceKey: 'policy-scope-selection',
              capturePrompt:
                'Confirm whether the preview covers workspace, tenant, or app scope.',
              expectedFormat: 'scope-key + reason',
              sourceStep: 'review-readiness-summary',
            },
            {
              evidenceKey: 'restore-approval-owner',
              capturePrompt:
                'Identify the person or role that must approve restore actions.',
              expectedFormat: 'owner-role + approval-channel',
              sourceStep: 'restore-approval-review',
            },
          ],
          nextCaptureAction: 'record-preview-evidence-before-submission',
        },
        previewEvidenceReviewRubric: {
          rubricVersion: 'backup-center-preview-evidence-review-rubric.v1',
          status: 'pending-evidence-review',
          requiredCheckCount: 3,
          passedCheckCount: 0,
          pendingCheckCount: 3,
          checks: [
            {
              key: 'target-ownership-confirmed',
              label: 'Target ownership confirmed',
              status: 'pending',
              sourceEvidenceKey: 'validated-backup-target-preview',
              requiredSignal: 'owner-confirmation-present',
            },
            {
              key: 'backup-scope-clear',
              label: 'Backup scope is clear',
              status: 'pending',
              sourceEvidenceKey: 'policy-scope-selection',
              requiredSignal: 'scope-key-and-reason-present',
            },
            {
              key: 'restore-approval-accountable',
              label: 'Restore approval owner is accountable',
              status: 'pending',
              sourceEvidenceKey: 'restore-approval-owner',
              requiredSignal: 'owner-role-and-channel-present',
            },
          ],
          nextReviewAction: 'review-preview-evidence-before-submission',
        },
        previewEvidenceTraceability: {
          traceabilityVersion: 'backup-center-preview-evidence-traceability.v1',
          status: 'pending-preview-evidence-linkage',
          itemCount: 3,
          rows: [
            {
              evidenceKey: 'validated-backup-target-preview',
              sourceStep: 'fill-preview-only-setup-form',
              expectedFormat:
                'target-type + destination + owner-confirmation',
              reviewCheckKey: 'target-ownership-confirmed',
              reviewCheckLabel: 'Target ownership confirmed',
              requiredSignal: 'owner-confirmation-present',
              packetItemKey: 'validated-backup-target-preview',
              blockedReason: 'validated-backup-target-preview:missing',
            },
            {
              evidenceKey: 'policy-scope-selection',
              sourceStep: 'review-readiness-summary',
              expectedFormat: 'scope-key + reason',
              reviewCheckKey: 'backup-scope-clear',
              reviewCheckLabel: 'Backup scope is clear',
              requiredSignal: 'scope-key-and-reason-present',
              packetItemKey: 'policy-scope-selection',
              blockedReason: 'policy-scope-selection:missing',
            },
            {
              evidenceKey: 'restore-approval-owner',
              sourceStep: 'restore-approval-review',
              expectedFormat: 'owner-role + approval-channel',
              reviewCheckKey: 'restore-approval-accountable',
              reviewCheckLabel: 'Restore approval owner is accountable',
              requiredSignal: 'owner-role-and-channel-present',
              packetItemKey: 'restore-approval-owner',
              blockedReason: 'restore-approval-owner:missing',
            },
          ],
          nextTraceAction:
            'link-preview-evidence-to-review-checks-before-submission',
        },
        previewSubmissionDecisionSummary: {
          summaryVersion:
            'backup-center-preview-submission-decision-summary.v1',
          decision: 'blocked',
          decisionReason: 'preview-evidence-and-review-checks-pending',
          submissionAllowed: false,
          missingEvidenceCount: 3,
          pendingReviewCheckCount: 3,
          readyPacketItemCount: 1,
          nextDecisionAction: 'review-preview-evidence-before-submission',
          unlocksWhen: [
            'all-preview-evidence-recorded',
            'all-preview-evidence-checks-passed',
            'preview-review-packet-complete',
          ],
        },
        gates: expect.arrayContaining([
          expect.objectContaining({
            key: 'operator-input-preview',
            status: 'pending',
            requiredBefore: 'persist-backup-setup',
          }),
          expect.objectContaining({
            key: 'prisma-schema-review',
            status: 'blocked',
            requiredBefore: 'database-migration',
          }),
          expect.objectContaining({
            key: 'external-write-approval',
            status: 'blocked',
            requiredBefore: 'external-cloud-writes',
          }),
        ]),
        nextSafeAction:
          'complete-preview-review-before-opening-prisma-or-migration-work',
      },
      formSchema: {
        schemaVersion: 'backup-center-setup-form.v1',
        mode: 'preview-only',
        projectionOnly: true,
        persistenceAllowed: false,
        credentialStorageAllowed: false,
        restoreExecutionAllowed: false,
        externalCloudWritesAllowed: false,
        inputGroups: [
          {
            key: 'backup-target',
            requiredActionKeys: ['backup-target:missing'],
            fields: expect.arrayContaining([
              expect.objectContaining({
                key: 'targetRefPreview',
                required: true,
                sensitive: false,
                previewOnly: true,
                persistenceAllowed: false,
              }),
              expect.objectContaining({
                key: 'policyKeys',
                options: ['documents'],
                required: true,
                previewOnly: true,
              }),
            ]),
          },
          expect.objectContaining({
            key: 'schedule',
            requiredActionKeys: ['backup-schedule:not-configured'],
            fields: expect.arrayContaining([
              expect.objectContaining({
                key: 'cadence',
                options: ['manual', 'daily', 'weekly', 'monthly'],
                persistenceAllowed: false,
              }),
            ]),
          }),
          expect.objectContaining({
            key: 'portability-bundle',
            recommendedActionKeys: [
              'define-workflow-skill-plugin-addon-portability-bundle',
            ],
          }),
          expect.objectContaining({
            key: 'adapter-assessment',
            fields: expect.arrayContaining([
              expect.objectContaining({
                key: 'connectionSlugs',
                required: false,
                options: [],
                previewOnly: true,
              }),
            ]),
          }),
          expect.objectContaining({
            key: 'restore-approval-review',
            requiredActionKeys: ['restore-preview:not-implemented'],
            fields: expect.arrayContaining([
              expect.objectContaining({
                key: 'approvalRequiredFor',
                options: [
                  'database-snapshot',
                  'app-specific-export',
                  'tenant-workspace-restore',
                ],
                restoreExecutionAllowed: false,
              }),
            ]),
          }),
        ],
      },
    });
  });

  it('should derive backup setup intent from declared targets without enabling writes', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant_1',
          slug: 'acme',
          name: 'Acme',
        }),
      },
      tenantStoragePolicy: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'storage_policy_1',
            key: 'documents',
            mode: 'HYBRID',
            storageClass: 'STANDARD',
            targetRef: 'tenant-primary',
            targetRegion: 'ap-southeast-1',
            backupTargetRef: 'local://acme-backups',
            meteringEnabled: true,
            workspaceId: 'workspace_1',
            workspace: {
              name: 'Operations',
              slug: 'ops',
            },
            createdAt: new Date('2026-06-08T00:00:00.000Z'),
            updatedAt: new Date('2026-06-08T00:00:00.000Z'),
          },
        ]),
      },
      integrationConnection: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'connection_1',
            name: 'NexovaFlow Ops',
            slug: 'nexovaflow-ops',
            category: 'WORKFLOW',
            provider: 'nexovaflow',
            status: 'ACTIVE',
            workspaceId: 'workspace_1',
            workspace: {
              name: 'Operations',
              slug: 'ops',
            },
          },
        ]),
      },
      entitlement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new InfrastructureProfileService(prisma as never);

    const result = await service.getBackupReadinessPolicy('acme');

    expect(result.backup.status).toBe('backup-targets-ready');
    expect(result.backup.setupContract).toMatchObject({
      reviewStatus: 'operator-configuration-required',
      displaySummary: {
        statusLabel: 'Targets ready',
      },
      primaryActionKey: 'backup-schedule:not-configured',
      requiredActionKeys: [
        'backup-schedule:not-configured',
        'restore-preview:not-implemented',
      ],
    });
    expect(result.backup.setupIntent).toMatchObject({
      status: 'blocked-before-decision',
      primaryDecisionKey: 'backup-schedule:not-configured',
      allowedDecisions: ['resolve-required-actions', 'defer-setup'],
      derivedFrom: {
        backupStatus: 'backup-targets-ready',
        requiredActionKeys: [
          'backup-schedule:not-configured',
          'restore-preview:not-implemented',
        ],
      },
      decisionProjection: {
        recordable: false,
        persistenceAllowed: false,
        schedulePersistenceAllowed: false,
        restoreExecutionAllowed: false,
        credentialStorageAllowed: false,
        externalCloudWritesAllowed: false,
      },
      targetSummary: {
        declaredTargetCount: 1,
        policyCount: 1,
        policiesMissingBackupTargetCount: 0,
      },
      persistenceDesignLock: {
        schemaVersion: 'backup-center-persistence-design-lock.v1',
        mode: 'preview-only',
        migrationRequired: true,
        guardrails: {
          projectionOnly: true,
          persistenceAllowed: false,
          databaseWritesAllowed: false,
          prismaSchemaWritesAllowed: false,
          migrationWritesAllowed: false,
          schedulePersistenceAllowed: false,
          scheduleExecutionAllowed: false,
          credentialStorageAllowed: false,
          restoreExecutionAllowed: false,
          externalCloudWritesAllowed: false,
        },
      },
      formSchema: {
        schemaVersion: 'backup-center-setup-form.v1',
        mode: 'preview-only',
        projectionOnly: true,
        persistenceAllowed: false,
        credentialStorageAllowed: false,
        restoreExecutionAllowed: false,
        externalCloudWritesAllowed: false,
        inputGroups: expect.arrayContaining([
          expect.objectContaining({
            key: 'backup-target',
            requiredActionKeys: [],
            fields: expect.arrayContaining([
              expect.objectContaining({
                key: 'targetRefPreview',
                required: false,
                persistenceAllowed: false,
              }),
              expect.objectContaining({
                key: 'policyKeys',
                options: ['documents'],
                required: false,
              }),
            ]),
          }),
          expect.objectContaining({
            key: 'adapter-assessment',
            requiredActionKeys: ['app-specific-export-adapters:assess'],
            fields: expect.arrayContaining([
              expect.objectContaining({
                key: 'connectionSlugs',
                required: true,
                options: ['nexovaflow-ops'],
              }),
              expect.objectContaining({
                key: 'adapterDecision',
                required: true,
                externalWritesAllowed: false,
              }),
            ]),
          }),
          expect.objectContaining({
            key: 'restore-approval-review',
            fields: expect.arrayContaining([
              expect.objectContaining({
                key: 'approvalRequiredFor',
                restoreExecutionAllowed: false,
              }),
            ]),
          }),
        ]),
      },
    });
  });

  it('should validate backup setup preview values from the readiness form schema without writes', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant_1',
          slug: 'acme',
          name: 'Acme',
        }),
      },
      tenantStoragePolicy: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'storage_policy_1',
            key: 'documents',
            mode: 'HYBRID',
            storageClass: 'STANDARD',
            targetRef: 'tenant-primary',
            targetRegion: 'ap-southeast-1',
            backupTargetRef: null,
            meteringEnabled: true,
            workspaceId: 'workspace_1',
            workspace: {
              name: 'Operations',
              slug: 'ops',
            },
            createdAt: new Date('2026-06-08T00:00:00.000Z'),
            updatedAt: new Date('2026-06-08T00:00:00.000Z'),
          },
        ]),
      },
      integrationConnection: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      entitlement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new InfrastructureProfileService(prisma as never);

    const result = await service.previewBackupSetup({
      tenantSlug: ' ACME ',
      decision: 'defer-setup',
      values: {
        targetClass: 'user-local',
        targetRefPreview: 'local://acme-backups',
        policyKeys: ['documents'],
        cadence: 'daily',
        timezone: 'Asia/Bangkok',
        retentionDays: 14,
        includedConfigScopes: ['workflows', 'skills'],
        bundleFormat: 'manifest-and-archive',
        approvalRequiredFor: ['database-snapshot'],
        approverRole: 'owner',
      },
    });

    expect(result).toMatchObject({
      surface: 'backup-setup-preview',
      status: 'resolved',
      mode: 'preview-only',
      preview: {
        contractVersion: 'backup-readiness-setup.v1',
        formSchemaVersion: 'backup-center-setup-form.v1',
        sourceSurface: 'POST /integrations/backup-setup-preview',
        derivedFromSurface: 'GET /integrations/backup-readiness',
        requestedDecision: 'defer-setup',
        decisionStatus: 'accepted-for-preview',
        validationIssues: [],
        inputSummary: {
          requiredCount: 10,
          providedCount: 10,
          missingInputKeys: [],
          invalidInputKeys: [],
        },
        persistencePrerequisiteReview: {
          reviewVersion: 'backup-center-persistence-prerequisite-review.v1',
          status: 'blocked-until-reviewed',
          pendingReviewCount: 12,
        },
        reviewSummary: {
          statusLabel: 'Ready for preview',
          status: 'resolved',
          previewOnly: true,
          activationAllowed: false,
          externalActionsAllowed: false,
          validationIssueCount: 0,
          missingInputCount: 0,
          invalidInputCount: 0,
          requiredActionCount: 4,
          recommendedActionCount: 5,
          blockers: [
            'persistence:not-enabled',
            'schedule-execution:not-enabled',
            'credential-storage:not-enabled',
            'restore-execution:not-enabled',
            'external-cloud-writes:not-enabled',
          ],
          nextActions: expect.arrayContaining([
            expect.objectContaining({
              actionKey: 'backup-target:missing',
              actionOrder: 1,
              actionStatus: 'deferred-for-preview',
              reason: 'operator-deferred-setup',
              missingInputKeys: [],
              invalidInputKeys: [],
            }),
            expect.objectContaining({
              actionKey: 'add-local-or-user-cloud-backup-target',
              actionOrder: 5,
              actionStatus: 'recommended-for-review',
              reason: 'operator-review-before-persistence',
            }),
          ]),
          decisionSummary: {
            configuredCount: 0,
            unresolvedCount: 0,
            deferredCount: 4,
          },
          inputSummary: {
            requiredCount: 10,
            providedCount: 10,
            missingInputKeys: [],
            invalidInputKeys: [],
          },
          persistenceAllowed: false,
          schedulePersistenceAllowed: false,
          restoreExecutionAllowed: false,
          credentialStorageAllowed: false,
          externalCloudWritesAllowed: false,
          safety: {
            persistenceAllowed: false,
            schedulePersistenceAllowed: false,
            restoreExecutionAllowed: false,
            credentialStorageAllowed: false,
            externalCloudWritesAllowed: false,
          },
        },
        requiredActionKeys: [
          'backup-target:missing',
          'storage-policies-without-backup-target',
          'backup-schedule:not-configured',
          'restore-preview:not-implemented',
        ],
        fieldReviews: expect.arrayContaining([
          expect.objectContaining({
            groupKey: 'backup-target',
            fieldKey: 'targetRefPreview',
            status: 'accepted-for-preview',
            issues: [],
            persistenceAllowed: false,
          }),
          expect.objectContaining({
            groupKey: 'restore-approval-review',
            fieldKey: 'approvalRequiredFor',
            status: 'accepted-for-preview',
            restoreExecutionAllowed: false,
          }),
        ]),
      },
      safety: {
        projectionOnly: true,
        persistenceAllowed: false,
        schedulePersistenceAllowed: false,
        restoreExecutionAllowed: false,
        credentialStorageAllowed: false,
        externalCloudWritesAllowed: false,
        databaseWritesAllowed: false,
        disallowedActions: [
          'persist-backup-setup',
          'persist-backup-schedule',
          'execute-restore',
          'store-credentials',
          'write-external-cloud-target',
        ],
      },
    });
  });

  it('should reject invalid backup setup preview fields and decisions', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant_1',
          slug: 'acme',
          name: 'Acme',
        }),
      },
      tenantStoragePolicy: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'storage_policy_1',
            key: 'documents',
            mode: 'HYBRID',
            storageClass: 'STANDARD',
            targetRef: 'tenant-primary',
            targetRegion: 'ap-southeast-1',
            backupTargetRef: null,
            meteringEnabled: true,
            workspaceId: null,
            workspace: null,
            createdAt: new Date('2026-06-08T00:00:00.000Z'),
            updatedAt: new Date('2026-06-08T00:00:00.000Z'),
          },
        ]),
      },
      integrationConnection: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      entitlement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new InfrastructureProfileService(prisma as never);

    const result = await service.previewBackupSetup({
      tenantSlug: 'acme',
      decision: 'persist-schedule',
      values: {
        targetClass: 'dropbox',
        targetRefPreview: 'local://acme-backups',
        policyKeys: ['unknown-policy'],
        cadence: 'hourly',
        timezone: 'Asia/Bangkok',
        retentionDays: 0,
        includedConfigScopes: ['workflows'],
        bundleFormat: 'zip',
        approvalRequiredFor: ['execute-now'],
        approverRole: 'owner',
      },
    });

    expect(result).toMatchObject({
      status: 'validation-required',
      preview: {
        requestedDecision: 'persist-schedule',
        decisionStatus: 'not-allowed',
        projectedOutcome: 'operator-input-validation-required',
        inputSummary: {
          requiredCount: 10,
          providedCount: 10,
          missingInputKeys: [],
          invalidInputKeys: [
            'targetClass',
            'policyKeys',
            'cadence',
            'retentionDays',
            'bundleFormat',
            'approvalRequiredFor',
          ],
        },
        reviewSummary: {
          statusLabel: 'Validation required',
          validationIssueCount: 7,
          missingInputCount: 0,
          invalidInputCount: 6,
          requiredActionCount: 4,
          recommendedActionCount: 5,
          persistenceAllowed: false,
          restoreExecutionAllowed: false,
          externalCloudWritesAllowed: false,
        },
        validationIssues: expect.arrayContaining([
          'targetClass:option-not-allowed',
          'policyKeys:contains-option-not-allowed',
          'cadence:option-not-allowed',
          'retentionDays:below-minimum:1',
          'bundleFormat:option-not-allowed',
          'approvalRequiredFor:contains-option-not-allowed',
          'decision:not-allowed:persist-schedule',
        ]),
        fieldReviews: expect.arrayContaining([
          expect.objectContaining({
            fieldKey: 'targetClass',
            status: 'invalid',
            issues: ['targetClass:option-not-allowed'],
          }),
          expect.objectContaining({
            fieldKey: 'retentionDays',
            status: 'invalid',
            issues: ['retentionDays:below-minimum:1'],
          }),
        ]),
      },
      safety: {
        persistenceAllowed: false,
        restoreExecutionAllowed: false,
        credentialStorageAllowed: false,
        externalCloudWritesAllowed: false,
        databaseWritesAllowed: false,
      },
    });
  });
});

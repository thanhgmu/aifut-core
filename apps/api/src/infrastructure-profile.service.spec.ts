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

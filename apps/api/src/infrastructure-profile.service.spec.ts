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
        previewEndpoint: 'GET /integrations/backup-readiness',
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
    });
  });
});

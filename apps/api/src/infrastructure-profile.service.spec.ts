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
          integrations: [],
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
});

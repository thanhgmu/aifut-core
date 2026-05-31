import { InfrastructureProfileService } from './infrastructure-profile.service';

describe('InfrastructureProfileService', () => {
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
});

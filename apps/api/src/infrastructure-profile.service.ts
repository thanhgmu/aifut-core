import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { evaluateTenantDomainReadiness } from './tenant-domain-readiness';

@Injectable()
export class InfrastructureProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getTenantInfrastructureProfile(tenantSlug?: string) {
    const normalizedTenantSlug = tenantSlug?.trim().toLowerCase();

    if (!normalizedTenantSlug) {
      throw new BadRequestException(
        'Missing tenant slug. Provide x-tenant-slug header or tenantSlug query param.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: normalizedTenantSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        workspaces: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        integrations: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: true,
            provider: true,
            status: true,
            workspaceId: true,
            lastVerifiedAt: true,
            routingMode: true,
            targetBaseUrl: true,
            targetRegion: true,
            targetEnvironment: true,
          },
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        },
        entitlements: {
          select: {
            id: true,
            key: true,
            kind: true,
            value: true,
            startsAt: true,
            endsAt: true,
          },
          orderBy: { key: 'asc' },
        },
        domains: {
          select: {
            id: true,
            hostname: true,
            kind: true,
            status: true,
            isPrimary: true,
            dnsTarget: true,
            certificateStatus: true,
            provider: true,
            provisioningMode: true,
            createdAt: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { hostname: 'asc' }],
        },
        storagePolicies: {
          select: {
            id: true,
            key: true,
            mode: true,
            storageClass: true,
            targetRef: true,
            targetRegion: true,
            backupTargetRef: true,
            meteringEnabled: true,
            createdAt: true,
          },
          orderBy: [{ mode: 'asc' }, { key: 'asc' }],
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        `Tenant not found for slug: ${normalizedTenantSlug}`,
      );
    }

    const integrationCounts = tenant.integrations.reduce<
      Record<string, number>
    >((accumulator, integration) => {
      accumulator[integration.category] =
        (accumulator[integration.category] ?? 0) + 1;
      return accumulator;
    }, {});

    const storageIntegrations = tenant.integrations.filter(
      (integration) => integration.category === 'STORAGE',
    );

    const backupEntitlements = tenant.entitlements.filter((entitlement) =>
      entitlement.key.toLowerCase().includes('backup'),
    );

    const primaryDomain =
      tenant.domains.find((domain) => domain.isPrimary) ??
      tenant.domains[0] ??
      null;
    const domains = tenant.domains.map((domain) => ({
      ...domain,
      readiness: evaluateTenantDomainReadiness(domain),
    }));
    const primaryDomainWithReadiness = primaryDomain
      ? (domains.find((domain) => domain.id === primaryDomain.id) ?? null)
      : null;

    const activeStoragePolicies = tenant.storagePolicies.filter(
      (policy) => policy.mode !== 'DISABLED',
    );

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        createdAt: tenant.createdAt,
      },
      infrastructure: {
        tenancyMode:
          storageIntegrations.length > 0
            ? 'hybrid-or-external-ready'
            : 'platform-hosted-foundation',
        workspaceCount: tenant.workspaces.length,
        integrationCounts,
        domains: {
          primary: primaryDomainWithReadiness,
          total: domains.length,
          routeReady: domains.filter((domain) => domain.readiness.routeReady)
            .length,
          customDomainReady: domains.some(
            (domain) => domain.kind === 'CUSTOM' && domain.readiness.routeReady,
          ),
        },
        storage: {
          status:
            activeStoragePolicies.length > 0
              ? 'tenant-routing-policy-declared'
              : storageIntegrations.length > 0
                ? 'tenant-storage-connected'
                : 'platform-storage-only',
          routingPolicies: tenant.storagePolicies,
          connections: storageIntegrations,
        },
        backup: {
          status:
            backupEntitlements.length > 0 ||
            tenant.storagePolicies.some((policy) => policy.backupTargetRef)
              ? 'tenant-backup-policy-declared'
              : 'backup-policy-not-declared',
          entitlements: backupEntitlements,
        },
      },
      workspaces: tenant.workspaces,
      integrations: tenant.integrations,
      entitlements: tenant.entitlements,
      domains,
      storagePolicies: tenant.storagePolicies,
      next: [
        'tenant-domain-binding',
        'storage-routing-policy-enforcement',
        'backup-target-enforcement',
        'hosting-affiliate-boundaries',
        'token-governance-foundation',
      ],
    };
  }

  async getDomainRoutingPolicy(tenantSlug?: string) {
    const tenant = await this.resolveTenant(tenantSlug);

    const domains = await this.prisma.tenantDomain.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ isPrimary: 'desc' }, { hostname: 'asc' }],
      select: {
        id: true,
        hostname: true,
        kind: true,
        status: true,
        isPrimary: true,
        dnsTarget: true,
        certificateStatus: true,
        provider: true,
        provisioningMode: true,
        workspaceId: true,
        workspace: {
          select: {
            name: true,
            slug: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      capability: 'integrations',
      status: 'resolved',
      routing: {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
        },
        domains: domains.map((domain) => ({
          ...domain,
          readiness: evaluateTenantDomainReadiness(domain),
        })),
        recommendations: [
          'declare-primary-subdomain-or-custom-domain',
          'attach-dns-target-and-certificate-status',
          'bind-domain-to-workspace-when-needed',
        ],
      },
    };
  }

  async getStorageRoutingPolicy(tenantSlug?: string) {
    const tenant = await this.resolveTenant(tenantSlug);

    const storagePolicies = await this.prisma.tenantStoragePolicy.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ mode: 'asc' }, { key: 'asc' }],
      select: {
        id: true,
        key: true,
        mode: true,
        storageClass: true,
        targetRef: true,
        targetRegion: true,
        backupTargetRef: true,
        meteringEnabled: true,
        workspaceId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      capability: 'integrations',
      status: 'resolved',
      storage: {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
        },
        policies: storagePolicies,
        recommendations: [
          'declare-control-plane-vs-data-plane-boundaries',
          'attach-backup-target-for-tenant-owned-storage',
          'enable-metering-only-for-platform-hosted-storage',
        ],
      },
    };
  }

  private async resolveTenant(tenantSlug?: string) {
    const normalizedTenantSlug = tenantSlug?.trim().toLowerCase();

    if (!normalizedTenantSlug) {
      throw new BadRequestException(
        'Missing tenant slug. Provide x-tenant-slug header or tenantSlug query param.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: normalizedTenantSlug },
      select: {
        id: true,
        slug: true,
        name: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        `Tenant not found for slug: ${normalizedTenantSlug}`,
      );
    }

    return tenant;
  }
}

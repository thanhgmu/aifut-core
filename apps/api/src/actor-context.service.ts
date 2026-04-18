import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantDomainResolutionService } from './tenant-domain-resolution.service';

export type ActorContextInput = {
  tenantSlug?: string;
  userEmail?: string;
  workspaceSlug?: string;
  hostname?: string;
};

@Injectable()
export class ActorContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDomainResolution: TenantDomainResolutionService,
  ) {}

  async resolve(input: ActorContextInput) {
    const tenantSlug = input.tenantSlug?.trim().toLowerCase();
    const userEmail = input.userEmail?.trim().toLowerCase();
    const workspaceSlug = input.workspaceSlug?.trim().toLowerCase();

    if (!tenantSlug && !input.hostname?.trim()) {
      throw new BadRequestException(
        'Missing tenant slug or hostname. Provide x-tenant-slug, x-forwarded-host/host header, or matching query params.',
      );
    }

    if (!userEmail) {
      throw new BadRequestException(
        'Missing user email. Provide x-user-email header or userEmail query param.',
      );
    }

    const domainResolution = tenantSlug
      ? null
      : await this.tenantDomainResolution.resolveHostname({
          hostname: input.hostname,
          workspaceSlug,
        });

    const resolvedTenantSlug = tenantSlug ?? domainResolution?.tenant.slug;

    if (!resolvedTenantSlug) {
      throw new BadRequestException(
        'Unable to resolve tenant slug from the provided tenant slug or hostname.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: resolvedTenantSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        `Tenant not found for slug: ${resolvedTenantSlug}`,
      );
    }

    const user = await this.prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        email: userEmail,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        `User ${userEmail} not found in tenant ${resolvedTenantSlug}`,
      );
    }

    const memberships = await this.prisma.membership.findMany({
      where: {
        tenantId: tenant.id,
        userId: user.id,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        role: true,
        isDefault: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    let activeMembership = memberships.find(
      (membership) =>
        workspaceSlug && membership.workspace?.slug.toLowerCase() === workspaceSlug,
    );

    if (!activeMembership && domainResolution?.workspace?.slug) {
      activeMembership = memberships.find(
        (membership) =>
          membership.workspace?.slug.toLowerCase() ===
          domainResolution.workspace?.slug.toLowerCase(),
      );
    }

    if (!activeMembership) {
      activeMembership = memberships.find((membership) => membership.isDefault);
    }

    if (!activeMembership) {
      activeMembership = memberships[0];
    }

    return {
      tenant,
      user,
      activeWorkspace: activeMembership?.workspace ?? null,
      activeMembership:
        activeMembership
          ? {
              id: activeMembership.id,
              role: activeMembership.role,
              isDefault: activeMembership.isDefault,
            }
          : null,
      memberships: memberships.map((membership) => ({
        id: membership.id,
        role: membership.role,
        isDefault: membership.isDefault,
        workspace: membership.workspace,
      })),
      resolution: {
        tenantSlug: resolvedTenantSlug,
        userEmail,
        workspaceSlug: workspaceSlug ?? domainResolution?.workspace?.slug ?? null,
        hostname: domainResolution?.hostname ?? input.hostname?.trim().toLowerCase() ?? null,
        usedHostnameResolution: Boolean(domainResolution),
        usedDefaultWorkspace: Boolean(
          !workspaceSlug &&
            !domainResolution?.workspace &&
            activeMembership?.workspace,
        ),
      },
    };
  }
}

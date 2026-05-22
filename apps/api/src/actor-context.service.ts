import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantDomainResolutionService } from './tenant-domain-resolution.service';

export type ActorContextInput = {
  tenantSlug?: string;
  userEmail?: string;
  workspaceSlug?: string;
  hostname?: string;
  authUserId?: string;
  enforceWorkspaceDomainMatch?: boolean;
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
    const authUserId = input.authUserId?.trim();

    if (!tenantSlug && !input.hostname?.trim() && !authUserId) {
      throw new BadRequestException(
        'Missing tenant slug, hostname, or auth user identity. Provide x-tenant-slug, x-forwarded-host/host header, a matching query param, or a verified auth token.',
      );
    }

    if (!userEmail && !authUserId) {
      throw new BadRequestException(
        'Missing user email or auth user identity. Provide x-user-email header, userEmail query param, or a verified auth token.',
      );
    }

    const domainResolution = tenantSlug || authUserId
      ? null
      : await this.tenantDomainResolution.resolveHostname({
          hostname: input.hostname,
          workspaceSlug,
          enforceWorkspaceMatch: input.enforceWorkspaceDomainMatch,
        });

    let tenant = null;
    let user = null;
    let usedAuthIdentityResolution = false;

    if (authUserId) {
      user = await this.prisma.user.findFirst({
        where: {
          id: authUserId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              createdAt: true,
            },
          },
        },
      });

      if (!user?.tenant) {
        throw new NotFoundException(
          `User not found for auth identity: ${authUserId}`,
        );
      }

      if (userEmail && user.email !== userEmail) {
        throw new NotFoundException(
          `User ${userEmail} does not match the provided auth identity in tenant ${user.tenant.slug}`,
        );
      }

      if (tenantSlug && user.tenant.slug !== tenantSlug) {
        throw new NotFoundException(
          `Auth identity tenant ${user.tenant.slug} does not match requested tenant ${tenantSlug}`,
        );
      }

      tenant = user.tenant;
      usedAuthIdentityResolution = true;
    }

    const resolvedTenantSlug = tenantSlug ?? tenant?.slug ?? domainResolution?.tenant.slug;

    if (!resolvedTenantSlug) {
      throw new BadRequestException(
        'Unable to resolve tenant slug from the provided tenant slug, hostname, or auth identity.',
      );
    }

    if (!tenant) {
      tenant = await this.prisma.tenant.findUnique({
        where: { slug: resolvedTenantSlug },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
        },
      });
    }

    if (!tenant) {
      throw new NotFoundException(
        `Tenant not found for slug: ${resolvedTenantSlug}`,
      );
    }

    if (!user) {
      user = await this.prisma.user.findFirst({
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
    }

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
        usedAuthIdentityResolution,
        usedDefaultWorkspace: Boolean(
          !workspaceSlug &&
            !domainResolution?.workspace &&
            activeMembership?.workspace,
        ),
      },
    };
  }
}

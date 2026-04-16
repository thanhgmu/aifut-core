import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export type ActorContextInput = {
  tenantSlug?: string;
  userEmail?: string;
  workspaceSlug?: string;
};

@Injectable()
export class ActorContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(input: ActorContextInput) {
    const tenantSlug = input.tenantSlug?.trim().toLowerCase();
    const userEmail = input.userEmail?.trim().toLowerCase();
    const workspaceSlug = input.workspaceSlug?.trim().toLowerCase();

    if (!tenantSlug) {
      throw new BadRequestException(
        'Missing tenant slug. Provide x-tenant-slug header or tenantSlug query param.',
      );
    }

    if (!userEmail) {
      throw new BadRequestException(
        'Missing user email. Provide x-user-email header or userEmail query param.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant not found for slug: ${tenantSlug}`);
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
        `User ${userEmail} not found in tenant ${tenantSlug}`,
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
        tenantSlug,
        userEmail,
        workspaceSlug: workspaceSlug ?? null,
        usedDefaultWorkspace: Boolean(
          !workspaceSlug && activeMembership?.workspace,
        ),
      },
    };
  }
}

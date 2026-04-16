import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ActorContextService } from './actor-context.service';
import { PrismaService } from './prisma.service';
import { TENANCY_FOUNDATION_ROADMAP } from './tenancy.constants';

@Controller('tenancy')
export class TenancyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actorContext: ActorContextService,
  ) {}

  @Get('summary')
  async summary() {
    const [tenants, workspaces, users] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.workspace.count(),
      this.prisma.user.count(),
    ]);

    return {
      capability: 'tenancy',
      tenants,
      workspaces,
      users,
      next: TENANCY_FOUNDATION_ROADMAP,
    };
  }

  @Get('current')
  async current(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
  ) {
    const context = await this.actorContext.resolve({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
    });

    const [domains, storagePolicies] = await Promise.all([
      this.prisma.tenantDomain.findMany({
        where: {
          tenantId: context.tenant.id,
          OR: [
            { workspaceId: null },
            ...(context.activeWorkspace
              ? [{ workspaceId: context.activeWorkspace.id }]
              : []),
          ],
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          hostname: true,
          kind: true,
          status: true,
          isPrimary: true,
          workspaceId: true,
          createdAt: true,
        },
      }),
      this.prisma.tenantStoragePolicy.findMany({
        where: {
          tenantId: context.tenant.id,
          OR: [
            { workspaceId: null },
            ...(context.activeWorkspace
              ? [{ workspaceId: context.activeWorkspace.id }]
              : []),
          ],
        },
        orderBy: [{ workspaceId: 'asc' }, { createdAt: 'asc' }],
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
        },
      }),
    ]);

    return {
      capability: 'tenancy',
      status: 'resolved',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
        resolution: context.resolution,
      },
      topology: {
        domains: {
          count: domains.length,
          items: domains,
        },
        storagePolicies: {
          count: storagePolicies.length,
          items: storagePolicies,
        },
      },
      next: [
        'domain-host-header-resolution',
        'workspace-policy-enforcement',
        'storage-routing-guardrails',
      ],
    };
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'tenancy',
      roadmap: TENANCY_FOUNDATION_ROADMAP,
    };
  }
}

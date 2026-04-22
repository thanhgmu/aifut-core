import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole, TenantDomainKind, TenantDomainStatus, TenantStorageMode } from '@prisma/client';
import { AccessPolicyGuard } from './access-policy.guard';
import { RequireAccessPolicy } from './access-policy.decorator';
import { ActorContextService } from './actor-context.service';
import { PrismaService } from './prisma.service';
import { TenantDomainResolutionService } from './tenant-domain-resolution.service';
import { TENANCY_FOUNDATION_ROADMAP } from './tenancy.constants';
import { TenancyOperationsService } from './tenancy-operations.service';

@Controller('tenancy')
export class TenancyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actorContext: ActorContextService,
    private readonly tenantDomainResolution: TenantDomainResolutionService,
    private readonly tenancyOperations: TenancyOperationsService,
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
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
  ) {
    const context = await this.actorContext.resolve({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
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

  @Get('resolve-host')
  async resolveHost(
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('hostname') hostnameQuery?: string,
    @Query('workspaceSlug') workspaceSlug?: string,
  ) {
    return {
      capability: 'tenancy',
      status: 'resolved',
      hostResolution: await this.tenantDomainResolution.resolveHostname({
        hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
        workspaceSlug,
      }),
    };
  }

  @Post('workspaces')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.ADMIN,
    scope: 'tenant-admin',
  })
  async createWorkspace(
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      name?: string;
      slug?: string;
      makeDefaultForUser?: boolean;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
  ) {
    return this.tenancyOperations.createWorkspace({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      userEmail: userEmailHeader ?? body.userEmail,
    });
  }

  @Post('domains')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.ADMIN,
    scope: 'tenant-admin',
  })
  async upsertDomain(
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      hostname?: string;
      kind?: TenantDomainKind;
      status?: TenantDomainStatus;
      isPrimary?: boolean;
      provider?: string;
      provisioningMode?: string;
      dnsTarget?: string;
      certificateStatus?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
  ) {
    return this.tenancyOperations.upsertDomain({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
    });
  }

  @Post('storage-policies')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.ADMIN,
    scope: 'tenant-admin',
  })
  async upsertStoragePolicy(
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      key?: string;
      mode?: TenantStorageMode;
      storageClass?: string;
      targetRef?: string;
      targetRegion?: string;
      backupTargetRef?: string;
      meteringEnabled?: boolean;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
  ) {
    return this.tenancyOperations.upsertStoragePolicy({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
    });
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'tenancy',
      roadmap: TENANCY_FOUNDATION_ROADMAP,
    };
  }
}

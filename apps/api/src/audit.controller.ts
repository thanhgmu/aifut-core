import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuditActorType, MembershipRole } from '@prisma/client';
import { RequireAccessPolicy } from './access-policy.decorator';
import { AccessPolicyGuard } from './access-policy.guard';
import { AUDIT_FOUNDATION_ROADMAP } from './audit.constants';
import { AuditEventsService } from './audit-events.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditEvents: AuditEventsService) {}

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'audit',
      status: 'foundation',
      supports: {
        eventCapture: true,
        actorAttribution: true,
        tenantScopedTraceability: true,
        structuredWrites: true,
        recentEventQueries: true,
      },
      next: AUDIT_FOUNDATION_ROADMAP,
    };
  }

  @Post('events')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.MEMBER,
    requireWorkspace: true,
  })
  async write(
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      actorType?: AuditActorType;
      action?: string;
      targetType?: string;
      targetId?: string;
      metadata?: Record<string, unknown>;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
  ) {
    return this.auditEvents.write({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
    });
  }

  @Get('events')
  async listRecent(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditEvents.listRecent({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('events/:eventId')
  async byId(
    @Param('eventId') eventId?: string,
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
  ) {
    return this.auditEvents.findById({
      eventId,
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
    });
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'audit',
      roadmap: AUDIT_FOUNDATION_ROADMAP,
    };
  }
}

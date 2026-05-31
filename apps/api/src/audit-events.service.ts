import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditActorType, MembershipRole } from '@prisma/client';
import { AccessPolicyService } from './access-policy.service';
import { ActorContextService } from './actor-context.service';
import { PrismaService } from './prisma.service';

type WriteAuditEventInput = {
  tenantSlug?: string;
  userEmail?: string;
  workspaceSlug?: string;
  hostname?: string;
  actorType?: AuditActorType;
  action?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AuditEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actorContext: ActorContextService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async write(input: WriteAuditEventInput) {
    const action = input.action?.trim();

    if (!action) {
      throw new BadRequestException('Missing audit action.');
    }

    const { context } = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: input.tenantSlug,
        userEmail: input.userEmail,
        workspaceSlug: input.workspaceSlug,
        hostname: input.hostname,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.MEMBER,
        requireWorkspace: true,
        scope: 'workspace-member-action',
      },
    );

    const created = await this.prisma.auditEvent.create({
      data: {
        tenantId: context.tenant.id,
        userId: context.user.id,
        actorType: input.actorType ?? AuditActorType.USER,
        action,
        targetType: input.targetType?.trim() || null,
        targetId: input.targetId?.trim() || null,
        metadata: this.buildMetadata({
          ...(input.metadata ?? {}),
          actorContext: {
            tenantSlug: context.tenant.slug,
            workspaceSlug: context.activeWorkspace?.slug ?? null,
            membershipRole: context.activeMembership?.role ?? null,
            usedDefaultWorkspace: context.resolution.usedDefaultWorkspace,
            usedHostnameResolution: context.resolution.usedHostnameResolution,
            hostname: context.resolution.hostname,
          },
        }),
      },
      select: {
        id: true,
        actorType: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        createdAt: true,
      },
    });

    return {
      capability: 'audit',
      status: 'recorded',
      tenant: context.tenant,
      workspace: context.activeWorkspace,
      event: created,
      next: ['tenant-filtered-audit-queries', 'policy-trigger-hooks'],
    };
  }

  async listRecent(input: {
    tenantSlug?: string;
    userEmail?: string;
    workspaceSlug?: string;
    hostname?: string;
    limit?: number;
  }) {
    const context = await this.actorContext.resolve({
      tenantSlug: input.tenantSlug,
      userEmail: input.userEmail,
      workspaceSlug: input.workspaceSlug,
      hostname: input.hostname,
    });

    const take = this.normalizeLimit(input.limit);

    const workspace = context.activeWorkspace;
    const events = await this.prisma.auditEvent.findMany({
      where: {
        tenantId: context.tenant.id,
        ...(workspace
          ? {
              metadata: {
                path: ['actorContext', 'workspaceSlug'],
                equals: workspace.slug,
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take,
      select: {
        id: true,
        actorType: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return {
      capability: 'audit',
      status: 'resolved',
      tenant: context.tenant,
      workspace,
      count: events.length,
      events,
      next: ['timeline-filters', 'incident-correlation', 'retention-policy'],
    };
  }

  async findById(input: {
    tenantSlug?: string;
    userEmail?: string;
    workspaceSlug?: string;
    hostname?: string;
    eventId?: string;
  }) {
    const eventId = input.eventId?.trim();

    if (!eventId) {
      throw new BadRequestException('Missing eventId.');
    }

    const context = await this.actorContext.resolve({
      tenantSlug: input.tenantSlug,
      userEmail: input.userEmail,
      workspaceSlug: input.workspaceSlug,
      hostname: input.hostname,
    });

    const event = await this.prisma.auditEvent.findFirst({
      where: {
        id: eventId,
        tenantId: context.tenant.id,
      },
      select: {
        id: true,
        actorType: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Audit event not found: ${eventId}`);
    }

    return {
      capability: 'audit',
      status: 'resolved',
      tenant: context.tenant,
      workspace: context.activeWorkspace,
      event,
    };
  }

  async listAiGovernanceApprovalDispatchResumes(input: {
    tenantSlug?: string;
    userEmail?: string;
    workspaceSlug?: string;
    hostname?: string;
    planId?: string;
    limit?: number;
  }) {
    const planId = input.planId?.trim();

    if (!planId) {
      throw new BadRequestException('Missing planId.');
    }

    const context = await this.actorContext.resolve({
      tenantSlug: input.tenantSlug,
      userEmail: input.userEmail,
      workspaceSlug: input.workspaceSlug,
      hostname: input.hostname,
    });
    const workspace = context.activeWorkspace;
    const events = await this.prisma.auditEvent.findMany({
      where: {
        tenantId: context.tenant.id,
        action: 'ai-governance.approval-dispatch-resumed',
        targetType: 'orchestration-execution-run',
        AND: [
          {
            metadata: {
              path: ['planId'],
              equals: planId,
            },
          },
          ...(workspace
            ? [
                {
                  metadata: {
                    path: ['actorContext', 'workspaceSlug'],
                    equals: workspace.slug,
                  },
                },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      take: this.normalizeLimit(input.limit),
      select: {
        id: true,
        targetId: true,
        metadata: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return {
      capability: 'audit',
      status: 'resolved',
      tenant: context.tenant,
      workspace,
      planId,
      count: events.length,
      approvalDispatchResumes: events,
    };
  }

  private normalizeLimit(limit?: number) {
    if (!limit) {
      return 20;
    }

    return Math.min(Math.max(Math.floor(limit), 1), 100);
  }

  private buildMetadata(value: Record<string, unknown>) {
    return JSON.parse(JSON.stringify(value));
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditActorType } from '@prisma/client';
import { ActorContextService } from './actor-context.service';
import { PrismaService } from './prisma.service';

type WriteAuditEventInput = {
  tenantSlug?: string;
  userEmail?: string;
  workspaceSlug?: string;
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
  ) {}

  async write(input: WriteAuditEventInput) {
    const action = input.action?.trim();

    if (!action) {
      throw new BadRequestException('Missing audit action.');
    }

    const context = await this.actorContext.resolve({
      tenantSlug: input.tenantSlug,
      userEmail: input.userEmail,
      workspaceSlug: input.workspaceSlug,
    });

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
    limit?: number;
  }) {
    const context = await this.actorContext.resolve({
      tenantSlug: input.tenantSlug,
      userEmail: input.userEmail,
      workspaceSlug: input.workspaceSlug,
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

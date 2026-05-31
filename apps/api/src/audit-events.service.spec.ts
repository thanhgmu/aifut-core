import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccessPolicyService } from './access-policy.service';
import { ActorContextService } from './actor-context.service';
import { AuditEventsService } from './audit-events.service';
import { PrismaService } from './prisma.service';

describe('AuditEventsService', () => {
  let service: AuditEventsService;
  let prisma: { auditEvent: { findMany: jest.Mock } };
  let actorContext: { resolve: jest.Mock };

  beforeEach(async () => {
    prisma = {
      auditEvent: {
        findMany: jest.fn(),
      },
    };
    actorContext = {
      resolve: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditEventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActorContextService, useValue: actorContext },
        { provide: AccessPolicyService, useValue: {} },
      ],
    }).compile();

    service = module.get(AuditEventsService);
  });

  it('should reject AI governance approval history reads without a plan id', async () => {
    await expect(
      service.listAiGovernanceApprovalDispatchResumes({ tenantSlug: 'acme' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should scope AI governance approval history reads to tenant, workspace, and plan', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'workspace_1', slug: 'ops' },
    });
    prisma.auditEvent.findMany.mockResolvedValue([
      {
        id: 'audit_1',
        targetId: 'run_1',
        metadata: { planId: 'plan:acme:ops:runtime' },
        createdAt: new Date('2026-05-31T02:00:00.000Z'),
        user: { id: 'user_1', email: 'ops@acme.test', name: 'Ops' },
      },
    ]);

    const result = await service.listAiGovernanceApprovalDispatchResumes({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'ops.acme.test',
      planId: ' plan:acme:ops:runtime ',
      limit: 7,
    });

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'ops.acme.test',
    });
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant_1',
        action: 'ai-governance.approval-dispatch-resumed',
        targetType: 'orchestration-execution-run',
        AND: [
          {
            metadata: {
              path: ['planId'],
              equals: 'plan:acme:ops:runtime',
            },
          },
          {
            metadata: {
              path: ['actorContext', 'workspaceSlug'],
              equals: 'ops',
            },
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 7,
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
    expect(result).toMatchObject({
      planId: 'plan:acme:ops:runtime',
      count: 1,
      approvalDispatchResumes: [{ id: 'audit_1', targetId: 'run_1' }],
    });
  });
});

import { OrchestrationRuntimeHistoryService } from './orchestration-runtime-history.service';

describe('OrchestrationRuntimeHistoryService', () => {
  const buildSnapshot = () => ({
    snapshotKey: 'snapshot_1',
    planId: 'plan_1',
    snapshotType: 'materialized-runtime',
    runtimeStatus: 'materialized',
    tenantSlug: 'acme',
    workspaceSlug: 'ops',
    recordedBy: 'ops@acme.test',
    recordedAt: '2026-05-07T00:45:00.000Z',
    contractSummary: {
      executionModeCount: 1,
      runtimeBindingCount: 1,
      childWorkflowContractCount: 1,
      approvalContractCount: 1,
      escalationContractCount: 0,
      rollbackContractCount: 0,
      unresolvedRuntimeBindingCount: 0,
    },
    summary: {
      dispatchedApprovalCount: 1,
      optionalReviewCount: 0,
      dispatchedRunnerCount: 0,
      awaitingApprovalClearanceCount: 0,
      awaitingRuntimeBindingCount: 0,
      appliedMutationCount: 0,
      pendingApprovalMutationCount: 0,
      blockedMutationCount: 0,
    },
    mutationRecords: [],
    eventRecords: [
      {
        eventKey: 'event_1',
        eventType: 'execution-runtime-materialized',
        planId: 'plan_1',
        runtimeStatus: 'materialized',
        actorKey: 'ops@acme.test',
        recordedAt: '2026-05-07T00:45:00.000Z',
        scope: {
          tenantSlug: 'acme',
          workspaceSlug: 'ops',
        },
        relatedKeys: {},
        metadata: {
          dispatchedApprovalCount: 1,
        },
      },
    ],
  });

  it('should persist snapshot and events through prisma upserts', async () => {
    const prisma = {
      orchestrationRuntimeSnapshot: {
        upsert: jest.fn().mockResolvedValue({ snapshotKey: 'snapshot_1' }),
      },
      orchestrationRuntimeEvent: {
        upsert: jest.fn().mockResolvedValue({ eventKey: 'event_1' }),
      },
    } as any;

    const service = new OrchestrationRuntimeHistoryService(prisma);

    const result = await service.persistRuntimeHistory(buildSnapshot());

    expect(prisma.orchestrationRuntimeSnapshot.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.orchestrationRuntimeSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          recordedAt: new Date('2026-05-07T00:45:00.000Z'),
        }),
        create: expect.objectContaining({
          recordedAt: new Date('2026-05-07T00:45:00.000Z'),
        }),
      }),
    );
    expect(prisma.orchestrationRuntimeEvent.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      persistedSnapshotKey: 'snapshot_1',
      persistedEventKeys: ['event_1'],
    });
  });

  it('should keep going when snapshot persistence fails but event persistence succeeds', async () => {
    const prisma = {
      orchestrationRuntimeSnapshot: {
        upsert: jest.fn().mockRejectedValue(new Error('snapshot table missing')),
      },
      orchestrationRuntimeEvent: {
        upsert: jest.fn().mockResolvedValue({ eventKey: 'event_1' }),
      },
    } as any;

    const service = new OrchestrationRuntimeHistoryService(prisma);

    const result = await service.persistRuntimeHistory(buildSnapshot());

    expect(prisma.orchestrationRuntimeSnapshot.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.orchestrationRuntimeEvent.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      persistedSnapshotKey: null,
      persistedEventKeys: ['event_1'],
    });
  });

  it('should return only successfully persisted event keys when one event upsert fails', async () => {
    const prisma = {
      orchestrationRuntimeSnapshot: {
        upsert: jest.fn().mockResolvedValue({ snapshotKey: 'snapshot_1' }),
      },
      orchestrationRuntimeEvent: {
        upsert: jest
          .fn()
          .mockResolvedValueOnce({ eventKey: 'event_1' })
          .mockRejectedValueOnce(new Error('event table unavailable')),
      },
    } as any;

    const service = new OrchestrationRuntimeHistoryService(prisma);
    const snapshot = buildSnapshot();
    snapshot.eventRecords.push({
      eventKey: 'event_2',
      eventType: 'execution-run-dispatched',
      planId: 'plan_1',
      runtimeStatus: 'dispatch-applied',
      actorKey: 'ops@acme.test',
      recordedAt: '2026-05-07T00:46:00.000Z',
      scope: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
      relatedKeys: {
        runKey: 'run_1',
      },
      metadata: {
        workflowKey: 'workflow_1',
      },
    });

    const result = await service.persistRuntimeHistory(snapshot);

    expect(prisma.orchestrationRuntimeSnapshot.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.orchestrationRuntimeEvent.upsert).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      persistedSnapshotKey: 'snapshot_1',
      persistedEventKeys: ['event_1'],
    });
  });

  it('should read persisted runtime history ordered by latest snapshot and event', async () => {
    const prisma = {
      orchestrationRuntimeSnapshot: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            snapshotKey: 'snapshot_2',
            planId: 'plan_1',
            snapshotType: 'run-dispatch',
            runtimeStatus: 'dispatch-applied',
            tenantSlug: 'acme',
            workspaceSlug: 'ops',
            recordedBy: 'ops@acme.test',
            recordedAt: new Date('2026-05-07T00:46:00.000Z'),
            contractSummary: { childWorkflowContractCount: 1 },
            summary: { dispatchedRunCount: 1 },
            mutationRecords: [],
            eventRecords: [],
            createdAt: new Date('2026-05-07T00:46:30.000Z'),
          },
          {
            snapshotKey: 'snapshot_1',
            planId: 'plan_1',
            snapshotType: 'materialized-runtime',
            runtimeStatus: 'materialized',
            tenantSlug: 'acme',
            workspaceSlug: 'ops',
            recordedBy: 'ops@acme.test',
            recordedAt: new Date('2026-05-07T00:45:00.000Z'),
            contractSummary: { childWorkflowContractCount: 1 },
            summary: {
              dispatchedApprovalCount: 1,
              optionalReviewCount: 0,
              dispatchedRunnerCount: 0,
              awaitingApprovalClearanceCount: 0,
              awaitingRuntimeBindingCount: 0,
              appliedMutationCount: 0,
              pendingApprovalMutationCount: 0,
              blockedMutationCount: 0,
            },
            mutationRecords: [],
            eventRecords: [],
            createdAt: new Date('2026-05-07T00:45:30.000Z'),
          },
        ]),
      },
      orchestrationRuntimeEvent: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            eventKey: 'event_2',
            planId: 'plan_1',
            eventType: 'execution-run-dispatched',
            runtimeStatus: 'dispatch-applied',
            tenantSlug: 'acme',
            workspaceSlug: 'ops',
            actorKey: 'ops@acme.test',
            relatedKeys: { runKey: 'run_1' },
            metadata: { workflowKey: 'workflow_1' },
            recordedAt: new Date('2026-05-07T00:46:00.000Z'),
            createdAt: new Date('2026-05-07T00:46:10.000Z'),
          },
          {
            eventKey: 'event_1',
            planId: 'plan_1',
            eventType: 'execution-runtime-materialized',
            runtimeStatus: 'materialized',
            tenantSlug: 'acme',
            workspaceSlug: 'ops',
            actorKey: 'ops@acme.test',
            relatedKeys: {},
            metadata: { dispatchedApprovalCount: 1 },
            recordedAt: new Date('2026-05-07T00:45:00.000Z'),
            createdAt: new Date('2026-05-07T00:45:10.000Z'),
          },
        ]),
      },
    } as any;

    const service = new OrchestrationRuntimeHistoryService(prisma);

    const result = await service.readRuntimeHistory({
      planId: 'plan_1',
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      snapshotTake: 2,
      eventTake: 2,
    });

    expect(prisma.orchestrationRuntimeSnapshot.findMany).toHaveBeenCalledWith({
      where: {
        planId: 'plan_1',
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
      take: 2,
    });
    expect(prisma.orchestrationRuntimeEvent.findMany).toHaveBeenCalledWith({
      where: {
        planId: 'plan_1',
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
      orderBy: [{ recordedAt: 'desc' }],
      take: 2,
    });
    expect(result).toEqual({
      latestSnapshot: {
        snapshotKey: 'snapshot_2',
        planId: 'plan_1',
        snapshotType: 'run-dispatch',
        runtimeStatus: 'dispatch-applied',
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        recordedBy: 'ops@acme.test',
        recordedAt: '2026-05-07T00:46:00.000Z',
        contractSummary: {
          executionModeCount: 0,
          runtimeBindingCount: 0,
          childWorkflowContractCount: 1,
          approvalContractCount: 0,
          escalationContractCount: 0,
          rollbackContractCount: 0,
          unresolvedRuntimeBindingCount: 0,
        },
        summary: { dispatchedRunCount: 1 },
        mutationRecords: [],
        eventRecords: [],
        createdAt: '2026-05-07T00:46:30.000Z',
      },
      latestMutationByTarget: {},
      snapshots: [
        {
          snapshotKey: 'snapshot_2',
          planId: 'plan_1',
          snapshotType: 'run-dispatch',
          runtimeStatus: 'dispatch-applied',
          tenantSlug: 'acme',
          workspaceSlug: 'ops',
          recordedBy: 'ops@acme.test',
          recordedAt: '2026-05-07T00:46:00.000Z',
          contractSummary: {
            executionModeCount: 0,
            runtimeBindingCount: 0,
            childWorkflowContractCount: 1,
            approvalContractCount: 0,
            escalationContractCount: 0,
            rollbackContractCount: 0,
            unresolvedRuntimeBindingCount: 0,
          },
          summary: { dispatchedRunCount: 1 },
          mutationRecords: [],
          eventRecords: [],
          createdAt: '2026-05-07T00:46:30.000Z',
        },
        {
          snapshotKey: 'snapshot_1',
          planId: 'plan_1',
          snapshotType: 'materialized-runtime',
          runtimeStatus: 'materialized',
          tenantSlug: 'acme',
          workspaceSlug: 'ops',
          recordedBy: 'ops@acme.test',
          recordedAt: '2026-05-07T00:45:00.000Z',
          contractSummary: {
            executionModeCount: 0,
            runtimeBindingCount: 0,
            childWorkflowContractCount: 1,
            approvalContractCount: 0,
            escalationContractCount: 0,
            rollbackContractCount: 0,
            unresolvedRuntimeBindingCount: 0,
          },
          summary: {
            dispatchedApprovalCount: 1,
            optionalReviewCount: 0,
            dispatchedRunnerCount: 0,
            awaitingApprovalClearanceCount: 0,
            awaitingRuntimeBindingCount: 0,
            appliedMutationCount: 0,
            pendingApprovalMutationCount: 0,
            blockedMutationCount: 0,
          },
          mutationRecords: [],
          eventRecords: [],
          createdAt: '2026-05-07T00:45:30.000Z',
        },
      ],
      events: [
        {
          eventKey: 'event_2',
          planId: 'plan_1',
          eventType: 'execution-run-dispatched',
          runtimeStatus: 'dispatch-applied',
          tenantSlug: 'acme',
          workspaceSlug: 'ops',
          actorKey: 'ops@acme.test',
          relatedKeys: { runKey: 'run_1' },
          metadata: { workflowKey: 'workflow_1' },
          recordedAt: '2026-05-07T00:46:00.000Z',
          createdAt: '2026-05-07T00:46:10.000Z',
        },
        {
          eventKey: 'event_1',
          planId: 'plan_1',
          eventType: 'execution-runtime-materialized',
          runtimeStatus: 'materialized',
          tenantSlug: 'acme',
          workspaceSlug: 'ops',
          actorKey: 'ops@acme.test',
          relatedKeys: {},
          metadata: { dispatchedApprovalCount: 1 },
          recordedAt: '2026-05-07T00:45:00.000Z',
          createdAt: '2026-05-07T00:45:10.000Z',
        },
      ],
    });
  });

  it('should normalize persisted snapshot event records into persisted event shapes', async () => {
    const prisma = {
      orchestrationRuntimeSnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            snapshotKey: 'snapshot_1',
            planId: 'plan_1',
            snapshotType: 'materialized-runtime',
            runtimeStatus: 'materialized',
            tenantSlug: 'acme',
            workspaceSlug: 'ops',
            recordedBy: 'ops@acme.test',
            recordedAt: new Date('2026-05-07T00:45:00.000Z'),
            contractSummary: {},
            summary: {},
            mutationRecords: [],
            eventRecords: [
              {
                eventKey: 'event_1',
                eventType: 'execution-runtime-materialized',
                planId: 'plan_1',
                runtimeStatus: 'materialized',
                actorKey: 'ops@acme.test',
                recordedAt: '2026-05-07T00:45:00.000Z',
                scope: {
                  tenantSlug: 'acme',
                  workspaceSlug: 'ops',
                },
                relatedKeys: { runKey: 'run_1' },
                metadata: { dispatchedApprovalCount: 1 },
              },
            ],
            createdAt: new Date('2026-05-07T00:45:30.000Z'),
          },
        ]),
      },
      orchestrationRuntimeEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const service = new OrchestrationRuntimeHistoryService(prisma);

    const result = await service.readRuntimeHistory({
      planId: 'plan_1',
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      snapshotTake: 1,
      eventTake: 5,
    });

    expect(result.latestSnapshot?.eventRecords).toEqual([
      {
        eventKey: 'event_1',
        planId: 'plan_1',
        eventType: 'execution-runtime-materialized',
        runtimeStatus: 'materialized',
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        actorKey: 'ops@acme.test',
        relatedKeys: { runKey: 'run_1' },
        metadata: { dispatchedApprovalCount: 1 },
        recordedAt: '2026-05-07T00:45:00.000Z',
        createdAt: '2026-05-07T00:45:30.000Z',
      },
    ]);
  });

  it('should normalize persisted snapshot summaries by snapshot type', async () => {
    const prisma = {
      orchestrationRuntimeSnapshot: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            snapshotKey: 'snapshot_dispatch',
            planId: 'plan_1',
            snapshotType: 'run-dispatch',
            runtimeStatus: 'dispatch-applied',
            tenantSlug: 'acme',
            workspaceSlug: 'ops',
            recordedBy: 'ops@acme.test',
            recordedAt: new Date('2026-05-07T00:46:00.000Z'),
            contractSummary: {},
            summary: { dispatchedRunCount: 2, ignored: 99 },
            mutationRecords: [],
            eventRecords: [],
            createdAt: new Date('2026-05-07T00:46:30.000Z'),
          },
          {
            snapshotKey: 'snapshot_approval',
            planId: 'plan_1',
            snapshotType: 'approval-decision',
            runtimeStatus: 'approval-applied',
            tenantSlug: 'acme',
            workspaceSlug: 'ops',
            recordedBy: 'ops@acme.test',
            recordedAt: new Date('2026-05-07T00:45:30.000Z'),
            contractSummary: {},
            summary: { approvedRunCount: 1, cancelledRunCount: 'bad' },
            mutationRecords: [],
            eventRecords: [],
            createdAt: new Date('2026-05-07T00:45:40.000Z'),
          },
          {
            snapshotKey: 'snapshot_materialized',
            planId: 'plan_1',
            snapshotType: 'materialized-runtime',
            runtimeStatus: 'materialized',
            tenantSlug: 'acme',
            workspaceSlug: 'ops',
            recordedBy: 'ops@acme.test',
            recordedAt: new Date('2026-05-07T00:45:00.000Z'),
            contractSummary: {},
            summary: { dispatchedApprovalCount: 3, blockedMutationCount: 2 },
            mutationRecords: [],
            eventRecords: [],
            createdAt: new Date('2026-05-07T00:45:10.000Z'),
          },
        ]),
      },
      orchestrationRuntimeEvent: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const service = new OrchestrationRuntimeHistoryService(prisma);

    const result = await service.readRuntimeHistory({
      planId: 'plan_1',
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      snapshotTake: 3,
      eventTake: 0,
    });

    expect(result.snapshots).toMatchObject([
      {
        snapshotKey: 'snapshot_dispatch',
        summary: {
          dispatchedRunCount: 2,
        },
      },
      {
        snapshotKey: 'snapshot_approval',
        summary: {
          approvedRunCount: 1,
          cancelledRunCount: 0,
        },
      },
      {
        snapshotKey: 'snapshot_materialized',
        summary: {
          dispatchedApprovalCount: 3,
          optionalReviewCount: 0,
          dispatchedRunnerCount: 0,
          awaitingApprovalClearanceCount: 0,
          awaitingRuntimeBindingCount: 0,
          appliedMutationCount: 0,
          pendingApprovalMutationCount: 0,
          blockedMutationCount: 2,
        },
      },
    ]);
  });

  it('should surface latest mutations by target across recent snapshots during history reads', async () => {
    const prisma = {
      orchestrationRuntimeSnapshot: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            snapshotKey: 'snapshot_2',
            planId: 'plan_1',
            snapshotType: 'run-dispatch',
            runtimeStatus: 'dispatch-applied',
            tenantSlug: 'acme',
            workspaceSlug: 'ops',
            recordedBy: 'ops@acme.test',
            recordedAt: new Date('2026-05-07T00:46:00.000Z'),
            contractSummary: { childWorkflowContractCount: 1 },
            summary: { dispatchedRunCount: 1 },
            mutationRecords: [
              {
                mutationKey: 'latest-run-mutation',
                targetKey: 'run_1',
                targetType: 'execution-run',
                fromStatus: 'queued-for-dispatch',
                toStatus: 'dispatched',
                mutationStatus: 'applied',
              },
            ],
            eventRecords: [],
            createdAt: new Date('2026-05-07T00:46:30.000Z'),
          },
          {
            snapshotKey: 'snapshot_1',
            planId: 'plan_1',
            snapshotType: 'approval-decision',
            runtimeStatus: 'decision-applied',
            tenantSlug: 'acme',
            workspaceSlug: 'ops',
            recordedBy: 'ops@acme.test',
            recordedAt: new Date('2026-05-07T00:45:00.000Z'),
            contractSummary: { childWorkflowContractCount: 1 },
            summary: { approvedRunCount: 1 },
            mutationRecords: [
              {
                mutationKey: 'older-run-mutation',
                targetKey: 'run_1',
                targetType: 'execution-run',
                fromStatus: 'awaiting-approval',
                toStatus: 'queued-for-dispatch',
                mutationStatus: 'applied',
              },
              {
                mutationKey: 'task-mutation',
                targetKey: 'task_1',
                targetType: 'approval-task',
                fromStatus: 'awaiting-decision',
                toStatus: 'approved',
                mutationStatus: 'applied',
              },
            ],
            eventRecords: [],
            createdAt: new Date('2026-05-07T00:45:30.000Z'),
          },
        ]),
      },
      orchestrationRuntimeEvent: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const service = new OrchestrationRuntimeHistoryService(prisma);

    const result = await service.readRuntimeHistory({
      planId: 'plan_1',
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      snapshotTake: 2,
      eventTake: 2,
    });

    expect(result.latestMutationByTarget).toEqual({
      'execution-run:run_1': {
        mutationKey: 'latest-run-mutation',
        targetKey: 'run_1',
        targetType: 'execution-run',
        fromStatus: 'queued-for-dispatch',
        toStatus: 'dispatched',
        mutationStatus: 'applied',
      },
      'approval-task:task_1': {
        mutationKey: 'task-mutation',
        targetKey: 'task_1',
        targetType: 'approval-task',
        fromStatus: 'awaiting-decision',
        toStatus: 'approved',
        mutationStatus: 'applied',
      },
    });
  });

  it('should find the latest persisted mutations across recent snapshots in one batch', async () => {
    const prisma = {
      orchestrationRuntimeSnapshot: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            mutationRecords: [
              {
                mutationKey: 'latest-run-mutation',
                targetKey: 'run_1',
                targetType: 'execution-run',
                fromStatus: 'queued-for-dispatch',
                toStatus: 'dispatched',
                mutationStatus: 'applied',
              },
            ],
          },
          {
            mutationRecords: [
              {
                mutationKey: 'older-run-mutation',
                targetKey: 'run_1',
                targetType: 'execution-run',
                fromStatus: 'awaiting-approval',
                toStatus: 'queued-for-dispatch',
                mutationStatus: 'applied',
              },
              {
                mutationKey: 'task-mutation',
                targetKey: 'task_1',
                targetType: 'approval-task',
                fromStatus: 'awaiting-decision',
                toStatus: 'approved',
                mutationStatus: 'applied',
              },
            ],
          },
        ]),
      },
      orchestrationRuntimeEvent: {
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
    } as any;

    const service = new OrchestrationRuntimeHistoryService(prisma);

    const result = await service.findLatestMutations({
      planId: 'plan_1',
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      targets: [
        {
          targetType: 'execution-run',
          targetKey: 'run_1',
        },
        {
          targetType: 'approval-task',
          targetKey: 'task_1',
        },
      ],
    });

    expect(prisma.orchestrationRuntimeSnapshot.findMany).toHaveBeenCalledWith({
      where: {
        planId: 'plan_1',
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 20,
      select: {
        mutationRecords: true,
      },
    });
    expect(result).toEqual({
      'execution-run:run_1': {
        mutationKey: 'latest-run-mutation',
        targetKey: 'run_1',
        targetType: 'execution-run',
        fromStatus: 'queued-for-dispatch',
        toStatus: 'dispatched',
        mutationStatus: 'applied',
      },
      'approval-task:task_1': {
        mutationKey: 'task-mutation',
        targetKey: 'task_1',
        targetType: 'approval-task',
        fromStatus: 'awaiting-decision',
        toStatus: 'approved',
        mutationStatus: 'applied',
      },
    });
  });

  it('should find the latest persisted mutation across recent snapshots', async () => {
    const prisma = {
      orchestrationRuntimeSnapshot: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            mutationRecords: [
              {
                mutationKey: 'latest-run-mutation',
                targetKey: 'run_1',
                targetType: 'execution-run',
                fromStatus: 'queued-for-dispatch',
                toStatus: 'dispatched',
                mutationStatus: 'applied',
              },
            ],
          },
          {
            mutationRecords: [
              {
                mutationKey: 'older-run-mutation',
                targetKey: 'run_1',
                targetType: 'execution-run',
                fromStatus: 'awaiting-approval',
                toStatus: 'queued-for-dispatch',
                mutationStatus: 'applied',
              },
            ],
          },
        ]),
      },
      orchestrationRuntimeEvent: {
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
    } as any;

    const service = new OrchestrationRuntimeHistoryService(prisma);

    const result = await service.findLatestMutation({
      planId: 'plan_1',
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      targetType: 'execution-run',
      targetKey: 'run_1',
    });

    expect(prisma.orchestrationRuntimeSnapshot.findMany).toHaveBeenCalledWith({
      where: {
        planId: 'plan_1',
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 20,
      select: {
        mutationRecords: true,
      },
    });
    expect(result).toEqual({
      mutationKey: 'latest-run-mutation',
      targetKey: 'run_1',
      targetType: 'execution-run',
      fromStatus: 'queued-for-dispatch',
      toStatus: 'dispatched',
      mutationStatus: 'applied',
    });
  });

  it('should scope latest snapshot lookup by tenant and workspace when provided', async () => {
    const prisma = {
      orchestrationRuntimeSnapshot: {
        upsert: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          snapshotKey: 'snapshot_2',
          planId: 'plan_1',
          snapshotType: 'run-dispatch',
          runtimeStatus: 'dispatch-applied',
          tenantSlug: 'acme',
          workspaceSlug: 'ops',
          recordedBy: 'ops@acme.test',
          recordedAt: new Date('2026-05-07T00:46:00.000Z'),
          contractSummary: { childWorkflowContractCount: 1 },
          summary: { dispatchedRunCount: 1 },
          mutationRecords: [],
          eventRecords: [],
          createdAt: new Date('2026-05-07T00:46:30.000Z'),
        }),
        findMany: jest.fn(),
      },
      orchestrationRuntimeEvent: {
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
    } as any;

    const service = new OrchestrationRuntimeHistoryService(prisma);

    const result = await service.findLatestSnapshot({
      planId: 'plan_1',
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
    });

    expect(prisma.orchestrationRuntimeSnapshot.findFirst).toHaveBeenCalledWith({
      where: {
        planId: 'plan_1',
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toMatchObject({
      snapshotKey: 'snapshot_2',
      planId: 'plan_1',
      workspaceSlug: 'ops',
    });
  });

  it('should degrade to empty runtime history when read fails', async () => {
    const prisma = {
      orchestrationRuntimeSnapshot: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockRejectedValue(new Error('snapshot read failed')),
      },
      orchestrationRuntimeEvent: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const service = new OrchestrationRuntimeHistoryService(prisma);

    const result = await service.readRuntimeHistory({
      planId: 'plan_1',
      tenantSlug: 'acme',
    });

    expect(result).toEqual({
      latestSnapshot: null,
      latestMutationByTarget: {},
      snapshots: [],
      events: [],
    });
  });
});

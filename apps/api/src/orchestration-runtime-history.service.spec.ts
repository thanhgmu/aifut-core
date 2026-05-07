import { OrchestrationRuntimeHistoryService } from './orchestration-runtime-history.service';

describe('OrchestrationRuntimeHistoryService', () => {
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

    const result = await service.persistRuntimeHistory({
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

    expect(prisma.orchestrationRuntimeSnapshot.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.orchestrationRuntimeEvent.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      persistedSnapshotKey: 'snapshot_1',
      persistedEventKeys: ['event_1'],
    });
  });
});

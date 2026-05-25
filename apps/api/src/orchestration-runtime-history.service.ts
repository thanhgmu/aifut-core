import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import {
  OrchestrationApprovalDecisionSummary,
  OrchestrationExecutionDispatchSummary,
  OrchestrationLiveRuntimeSummary,
  OrchestrationPersistedRuntimeEventRecord,
  OrchestrationPersistedRuntimeSnapshotRecord,
  OrchestrationRuntimeContractSummary,
  OrchestrationRuntimeEventRecord,
  OrchestrationRuntimeHistoryQuery,
  OrchestrationRuntimeHistoryResult,
  OrchestrationRuntimeMutationRecord,
  OrchestrationRuntimePersistenceResult,
  OrchestrationRuntimeSnapshotRecord,
  OrchestrationRuntimeSnapshotSummary,
  OrchestrationRuntimeSnapshotType,
} from './orchestration-runtime.models';

@Injectable()
export class OrchestrationRuntimeHistoryService {
  private readonly logger = new Logger(OrchestrationRuntimeHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  private asJsonValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  async persistSnapshot(snapshot: OrchestrationRuntimeSnapshotRecord) {
    try {
      return await this.prisma.orchestrationRuntimeSnapshot.upsert({
        where: { snapshotKey: snapshot.snapshotKey },
        update: {
          runtimeStatus: snapshot.runtimeStatus,
          recordedBy: snapshot.recordedBy,
          recordedAt: new Date(snapshot.recordedAt),
          contractSummary: this.asJsonValue(snapshot.contractSummary),
          summary: this.asJsonValue(snapshot.summary),
          mutationRecords: this.asJsonValue(snapshot.mutationRecords),
          eventRecords: this.asJsonValue(snapshot.eventRecords),
        },
        create: {
          snapshotKey: snapshot.snapshotKey,
          planId: snapshot.planId,
          snapshotType: snapshot.snapshotType,
          runtimeStatus: snapshot.runtimeStatus,
          tenantSlug: snapshot.tenantSlug,
          workspaceSlug: snapshot.workspaceSlug,
          recordedBy: snapshot.recordedBy,
          recordedAt: new Date(snapshot.recordedAt),
          contractSummary: this.asJsonValue(snapshot.contractSummary),
          summary: this.asJsonValue(snapshot.summary),
          mutationRecords: this.asJsonValue(snapshot.mutationRecords),
          eventRecords: this.asJsonValue(snapshot.eventRecords),
        },
      } as never);
    } catch (error) {
      this.logger.warn(
        `Unable to persist orchestration runtime snapshot ${snapshot.snapshotKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async persistEvents(events: OrchestrationRuntimeEventRecord[]) {
    const persistedKeys: string[] = [];

    for (const event of events) {
      try {
        await this.prisma.orchestrationRuntimeEvent.upsert({
          where: { eventKey: event.eventKey },
          update: {
            runtimeStatus: event.runtimeStatus,
            actorKey: event.actorKey,
            relatedKeys: this.asJsonValue(event.relatedKeys),
            metadata: this.asJsonValue(event.metadata),
            recordedAt: new Date(event.recordedAt),
          },
          create: {
            eventKey: event.eventKey,
            planId: event.planId,
            eventType: event.eventType,
            runtimeStatus: event.runtimeStatus,
            tenantSlug: event.scope.tenantSlug,
            workspaceSlug: event.scope.workspaceSlug,
            actorKey: event.actorKey,
            relatedKeys: this.asJsonValue(event.relatedKeys),
            metadata: this.asJsonValue(event.metadata),
            recordedAt: new Date(event.recordedAt),
          },
        } as never);
        persistedKeys.push(event.eventKey);
      } catch (error) {
        this.logger.warn(
          `Unable to persist orchestration runtime event ${event.eventKey}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return persistedKeys;
  }

  async persistRuntimeHistory(
    snapshot: OrchestrationRuntimeSnapshotRecord,
  ): Promise<OrchestrationRuntimePersistenceResult> {
    const persistedSnapshot = await this.persistSnapshot(snapshot);
    const persistedEventKeys = await this.persistEvents(snapshot.eventRecords);

    return {
      persistedSnapshotKey: persistedSnapshot?.snapshotKey ?? null,
      persistedEventKeys,
    };
  }

  private normalizePersistedSnapshotType(
    snapshotType: string,
  ): OrchestrationRuntimeSnapshotType {
    return snapshotType === 'approval-decision' ||
      snapshotType === 'run-dispatch'
      ? snapshotType
      : 'materialized-runtime';
  }

  private normalizeContractSummary(
    contractSummary: unknown,
  ): OrchestrationRuntimeContractSummary {
    if (!contractSummary || typeof contractSummary !== 'object') {
      return {
        executionModeCount: 0,
        runtimeBindingCount: 0,
        childWorkflowContractCount: 0,
        approvalContractCount: 0,
        escalationContractCount: 0,
        rollbackContractCount: 0,
        unresolvedRuntimeBindingCount: 0,
      };
    }

    const record = contractSummary as Record<string, unknown>;
    const asNumber = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : 0;

    return {
      executionModeCount: asNumber(record.executionModeCount),
      runtimeBindingCount: asNumber(record.runtimeBindingCount),
      childWorkflowContractCount: asNumber(record.childWorkflowContractCount),
      approvalContractCount: asNumber(record.approvalContractCount),
      escalationContractCount: asNumber(record.escalationContractCount),
      rollbackContractCount: asNumber(record.rollbackContractCount),
      unresolvedRuntimeBindingCount: asNumber(
        record.unresolvedRuntimeBindingCount,
      ),
    };
  }

  private normalizeSnapshotSummary(
    snapshotType: OrchestrationRuntimeSnapshotType,
    summary: unknown,
  ): OrchestrationRuntimeSnapshotSummary {
    const record =
      summary && typeof summary === 'object'
        ? (summary as Record<string, unknown>)
        : {};
    const asNumber = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : 0;

    if (snapshotType === 'approval-decision') {
      return {
        approvedRunCount: asNumber(record.approvedRunCount),
        cancelledRunCount: asNumber(record.cancelledRunCount),
      } satisfies OrchestrationApprovalDecisionSummary;
    }

    if (snapshotType === 'run-dispatch') {
      return {
        dispatchedRunCount: asNumber(record.dispatchedRunCount),
      } satisfies OrchestrationExecutionDispatchSummary;
    }

    return {
      dispatchedApprovalCount: asNumber(record.dispatchedApprovalCount),
      optionalReviewCount: asNumber(record.optionalReviewCount),
      dispatchedRunnerCount: asNumber(record.dispatchedRunnerCount),
      awaitingApprovalClearanceCount: asNumber(
        record.awaitingApprovalClearanceCount,
      ),
      awaitingRuntimeBindingCount: asNumber(record.awaitingRuntimeBindingCount),
      appliedMutationCount: asNumber(record.appliedMutationCount),
      pendingApprovalMutationCount: asNumber(record.pendingApprovalMutationCount),
      blockedMutationCount: asNumber(record.blockedMutationCount),
    } satisfies OrchestrationLiveRuntimeSummary;
  }

  private normalizePersistedSnapshotRecord(
    snapshot:
      | {
          snapshotKey: string;
          planId: string;
          snapshotType: string;
          runtimeStatus: string;
          tenantSlug: string;
          workspaceSlug: string | null;
          recordedBy: string;
          recordedAt?: Date | null;
          contractSummary: unknown;
          summary: unknown;
          mutationRecords: unknown;
          eventRecords: unknown;
          createdAt?: Date | null;
        }
      | null,
  ): OrchestrationPersistedRuntimeSnapshotRecord | null {
    if (!snapshot) {
      return null;
    }

    const snapshotType = this.normalizePersistedSnapshotType(snapshot.snapshotType);

    return {
      snapshotKey: snapshot.snapshotKey,
      planId: snapshot.planId,
      snapshotType,
      runtimeStatus: snapshot.runtimeStatus,
      tenantSlug: snapshot.tenantSlug,
      workspaceSlug: snapshot.workspaceSlug,
      recordedBy: snapshot.recordedBy,
      recordedAt: snapshot.recordedAt?.toISOString(),
      contractSummary: this.normalizeContractSummary(snapshot.contractSummary),
      summary: this.normalizeSnapshotSummary(snapshotType, snapshot.summary),
      mutationRecords: Array.isArray(snapshot.mutationRecords)
        ? (snapshot.mutationRecords as OrchestrationRuntimeSnapshotRecord['mutationRecords'])
        : [],
      eventRecords: Array.isArray(snapshot.eventRecords)
        ? snapshot.eventRecords
            .filter((event): event is Record<string, unknown> =>
              Boolean(event) && typeof event === 'object',
            )
            .map((event) =>
              this.normalizePersistedEventRecord({
                eventKey:
                  typeof event.eventKey === 'string' ? event.eventKey : '',
                planId:
                  typeof event.planId === 'string' ? event.planId : snapshot.planId,
                eventType:
                  typeof event.eventType === 'string' ? event.eventType : 'unknown',
                runtimeStatus:
                  typeof event.runtimeStatus === 'string'
                    ? event.runtimeStatus
                    : snapshot.runtimeStatus,
                tenantSlug:
                  typeof event.tenantSlug === 'string'
                    ? event.tenantSlug
                    : typeof (event.scope as Record<string, unknown> | undefined)
                          ?.tenantSlug === 'string'
                      ? ((event.scope as Record<string, unknown>).tenantSlug as string)
                      : snapshot.tenantSlug,
                workspaceSlug:
                  typeof event.workspaceSlug === 'string' || event.workspaceSlug === null
                    ? (event.workspaceSlug as string | null)
                    : typeof (event.scope as Record<string, unknown> | undefined)
                          ?.workspaceSlug === 'string' ||
                        (event.scope as Record<string, unknown> | undefined)
                          ?.workspaceSlug === null
                      ? ((event.scope as Record<string, unknown>).workspaceSlug as string | null)
                      : snapshot.workspaceSlug,
                actorKey:
                  typeof event.actorKey === 'string' ? event.actorKey : snapshot.recordedBy,
                relatedKeys:
                  event.relatedKeys && typeof event.relatedKeys === 'object'
                    ? event.relatedKeys
                    : {},
                metadata:
                  event.metadata && typeof event.metadata === 'object'
                    ? event.metadata
                    : {},
                recordedAt:
                  typeof event.recordedAt === 'string'
                    ? new Date(event.recordedAt)
                    : snapshot.recordedAt ?? snapshot.createdAt ?? new Date(),
                createdAt: snapshot.createdAt ?? null,
              }),
            )
        : [],
      createdAt: snapshot.createdAt?.toISOString(),
    };
  }

  private normalizePersistedEventRecord(event: {
    eventKey: string;
    planId: string;
    eventType: string;
    runtimeStatus: string;
    tenantSlug: string;
    workspaceSlug: string | null;
    actorKey: string;
    relatedKeys: unknown;
    metadata: unknown;
    recordedAt: Date;
    createdAt?: Date | null;
  }): OrchestrationPersistedRuntimeEventRecord {
    return {
      eventKey: event.eventKey,
      planId: event.planId,
      eventType: event.eventType,
      runtimeStatus: event.runtimeStatus,
      tenantSlug: event.tenantSlug,
      workspaceSlug: event.workspaceSlug,
      actorKey: event.actorKey,
      relatedKeys:
        event.relatedKeys && typeof event.relatedKeys === 'object'
          ? (event.relatedKeys as OrchestrationPersistedRuntimeEventRecord['relatedKeys'])
          : {},
      metadata:
        event.metadata && typeof event.metadata === 'object'
          ? (event.metadata as Record<string, unknown>)
          : {},
      recordedAt: event.recordedAt.toISOString(),
      createdAt: event.createdAt?.toISOString(),
    };
  }

  async findLatestSnapshot(input: {
    planId: string;
    tenantSlug?: string;
    workspaceSlug?: string | null;
  }): Promise<OrchestrationPersistedRuntimeSnapshotRecord | null> {
    const where = {
      planId: input.planId,
      ...(input.tenantSlug ? { tenantSlug: input.tenantSlug } : {}),
      ...(input.workspaceSlug ? { workspaceSlug: input.workspaceSlug } : {}),
    };

    try {
      const snapshot = await this.prisma.orchestrationRuntimeSnapshot.findFirst({
        where,
        orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
      } as never);

      return this.normalizePersistedSnapshotRecord(snapshot);
    } catch (error) {
      this.logger.warn(
        `Unable to read latest orchestration runtime snapshot for ${input.planId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async findLatestMutations(input: {
    planId: string;
    targets: Array<{
      targetType: string;
      targetKey: string;
    }>;
    tenantSlug?: string;
    workspaceSlug?: string | null;
    snapshotTake?: number;
  }): Promise<Record<string, OrchestrationRuntimeMutationRecord | null>> {
    const where = {
      planId: input.planId,
      ...(input.tenantSlug ? { tenantSlug: input.tenantSlug } : {}),
      ...(input.workspaceSlug ? { workspaceSlug: input.workspaceSlug } : {}),
    };
    const result = Object.fromEntries(
      input.targets.map((target) => [
        `${target.targetType}:${target.targetKey}`,
        null,
      ]),
    ) as Record<string, OrchestrationRuntimeMutationRecord | null>;

    try {
      const snapshots = await this.prisma.orchestrationRuntimeSnapshot.findMany({
        where,
        orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
        take: input.snapshotTake ?? 20,
        select: {
          mutationRecords: true,
        },
      } as never);

      const remainingKeys = new Set(Object.keys(result));

      for (const snapshot of snapshots) {
        if (!Array.isArray(snapshot.mutationRecords) || remainingKeys.size === 0) {
          continue;
        }

        for (const record of snapshot.mutationRecords) {
          if (!record || typeof record !== 'object') {
            continue;
          }

          const mutation = record as unknown as OrchestrationRuntimeMutationRecord;
          const key = `${mutation.targetType}:${mutation.targetKey ?? ''}`;

          if (remainingKeys.has(key)) {
            result[key] = mutation;
            remainingKeys.delete(key);
          }
        }
      }

      return result;
    } catch (error) {
      this.logger.warn(
        `Unable to read latest orchestration runtime mutations for ${input.planId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return result;
    }
  }

  async findLatestMutation(input: {
    planId: string;
    targetType: string;
    targetKey: string;
    tenantSlug?: string;
    workspaceSlug?: string | null;
    snapshotTake?: number;
  }): Promise<OrchestrationRuntimeMutationRecord | null> {
    const result = await this.findLatestMutations({
      planId: input.planId,
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug,
      snapshotTake: input.snapshotTake,
      targets: [
        {
          targetType: input.targetType,
          targetKey: input.targetKey,
        },
      ],
    });

    return result[`${input.targetType}:${input.targetKey}`] ?? null;
  }

  async readRuntimeHistory(
    input: OrchestrationRuntimeHistoryQuery,
  ): Promise<OrchestrationRuntimeHistoryResult> {
    const where = {
      planId: input.planId,
      ...(input.tenantSlug ? { tenantSlug: input.tenantSlug } : {}),
      ...(input.workspaceSlug ? { workspaceSlug: input.workspaceSlug } : {}),
    };

    try {
      const [snapshots, events] = await Promise.all([
        this.prisma.orchestrationRuntimeSnapshot.findMany({
          where,
          orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
          take: input.snapshotTake ?? 10,
        } as never),
        this.prisma.orchestrationRuntimeEvent.findMany({
          where,
          orderBy: [{ recordedAt: 'desc' }],
          take: input.eventTake ?? 20,
        } as never),
      ]);

      const normalizedSnapshots = snapshots
        .map((snapshot) => this.normalizePersistedSnapshotRecord(snapshot))
        .filter(
          (
            snapshot,
          ): snapshot is OrchestrationPersistedRuntimeSnapshotRecord =>
            snapshot !== null,
        );
      const normalizedEvents = events.map((event) =>
        this.normalizePersistedEventRecord(event),
      );
      const latestMutationByTarget: Record<
        string,
        OrchestrationRuntimeMutationRecord | null
      > = {};

      for (const snapshot of normalizedSnapshots) {
        for (const mutation of snapshot.mutationRecords) {
          const key = `${mutation.targetType}:${mutation.targetKey ?? ''}`;
          if (!(key in latestMutationByTarget)) {
            latestMutationByTarget[key] = mutation;
          }
        }
      }

      return {
        latestSnapshot: normalizedSnapshots[0] ?? null,
        latestMutationByTarget,
        snapshots: normalizedSnapshots,
        events: normalizedEvents,
      };
    } catch (error) {
      this.logger.warn(
        `Unable to read orchestration runtime history for ${input.planId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        latestSnapshot: null,
        latestMutationByTarget: {},
        snapshots: [],
        events: [],
      };
    }
  }
}

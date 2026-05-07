import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  OrchestrationRuntimeEventRecord,
  OrchestrationRuntimeSnapshotRecord,
} from './orchestration-runtime.models';

@Injectable()
export class OrchestrationRuntimeHistoryService {
  private readonly logger = new Logger(OrchestrationRuntimeHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async persistSnapshot(snapshot: OrchestrationRuntimeSnapshotRecord) {
    try {
      return await this.prisma.orchestrationRuntimeSnapshot.upsert({
        where: { snapshotKey: snapshot.snapshotKey },
        update: {
          runtimeStatus: snapshot.runtimeStatus,
          recordedBy: snapshot.recordedBy,
          contractSummary: snapshot.contractSummary,
          summary: snapshot.summary,
          mutationRecords: snapshot.mutationRecords,
          eventRecords: snapshot.eventRecords,
        },
        create: {
          snapshotKey: snapshot.snapshotKey,
          planId: snapshot.planId,
          snapshotType: snapshot.snapshotType,
          runtimeStatus: snapshot.runtimeStatus,
          tenantSlug: snapshot.tenantSlug,
          workspaceSlug: snapshot.workspaceSlug,
          recordedBy: snapshot.recordedBy,
          contractSummary: snapshot.contractSummary,
          summary: snapshot.summary,
          mutationRecords: snapshot.mutationRecords,
          eventRecords: snapshot.eventRecords,
        },
      });
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
            relatedKeys: event.relatedKeys,
            metadata: event.metadata,
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
            relatedKeys: event.relatedKeys,
            metadata: event.metadata,
            recordedAt: new Date(event.recordedAt),
          },
        });
        persistedKeys.push(event.eventKey);
      } catch (error) {
        this.logger.warn(
          `Unable to persist orchestration runtime event ${event.eventKey}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return persistedKeys;
  }

  async persistRuntimeHistory(snapshot: OrchestrationRuntimeSnapshotRecord) {
    const persistedSnapshot = await this.persistSnapshot(snapshot);
    const persistedEventKeys = await this.persistEvents(snapshot.eventRecords);

    return {
      persistedSnapshotKey: persistedSnapshot?.snapshotKey ?? null,
      persistedEventKeys,
    };
  }
}

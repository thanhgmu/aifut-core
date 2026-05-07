-- CreateTable
CREATE TABLE "OrchestrationRuntimeSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotKey" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "runtimeStatus" TEXT NOT NULL,
    "tenantSlug" TEXT NOT NULL,
    "workspaceSlug" TEXT,
    "recordedBy" TEXT NOT NULL,
    "contractSummary" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "mutationRecords" JSONB NOT NULL,
    "eventRecords" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrchestrationRuntimeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrchestrationRuntimeEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "runtimeStatus" TEXT NOT NULL,
    "tenantSlug" TEXT NOT NULL,
    "workspaceSlug" TEXT,
    "actorKey" TEXT NOT NULL,
    "relatedKeys" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrchestrationRuntimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrchestrationRuntimeSnapshot_snapshotKey_key" ON "OrchestrationRuntimeSnapshot"("snapshotKey");

-- CreateIndex
CREATE INDEX "OrchestrationRuntimeSnapshot_tenantSlug_planId_idx" ON "OrchestrationRuntimeSnapshot"("tenantSlug", "planId");

-- CreateIndex
CREATE INDEX "OrchestrationRuntimeSnapshot_planId_snapshotType_idx" ON "OrchestrationRuntimeSnapshot"("planId", "snapshotType");

-- CreateIndex
CREATE UNIQUE INDEX "OrchestrationRuntimeEvent_eventKey_key" ON "OrchestrationRuntimeEvent"("eventKey");

-- CreateIndex
CREATE INDEX "OrchestrationRuntimeEvent_tenantSlug_planId_idx" ON "OrchestrationRuntimeEvent"("tenantSlug", "planId");

-- CreateIndex
CREATE INDEX "OrchestrationRuntimeEvent_planId_eventType_idx" ON "OrchestrationRuntimeEvent"("planId", "eventType");

-- CreateIndex
CREATE INDEX "OrchestrationRuntimeEvent_recordedAt_idx" ON "OrchestrationRuntimeEvent"("recordedAt");

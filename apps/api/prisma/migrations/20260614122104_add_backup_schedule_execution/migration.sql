-- CreateEnum
CREATE TYPE "BackupJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "BackupSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cronExpression" TEXT,
    "targetRef" TEXT NOT NULL,
    "backupMode" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "maxBackups" INTEGER NOT NULL DEFAULT 10,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupJob" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "status" "BackupJobStatus" NOT NULL DEFAULT 'PENDING',
    "backupTarget" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalSize" INTEGER,
    "fileCount" INTEGER,
    "error" TEXT,
    "log" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "triggeredBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupSchedule_tenantId_enabled_idx" ON "BackupSchedule"("tenantId", "enabled");

-- CreateIndex
CREATE INDEX "BackupSchedule_workspaceId_idx" ON "BackupSchedule"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BackupSchedule_tenantId_key_key" ON "BackupSchedule"("tenantId", "key");

-- CreateIndex
CREATE INDEX "BackupJob_scheduleId_status_idx" ON "BackupJob"("scheduleId", "status");

-- CreateIndex
CREATE INDEX "BackupJob_tenantId_status_idx" ON "BackupJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BackupJob_workspaceId_idx" ON "BackupJob"("workspaceId");

-- CreateIndex
CREATE INDEX "BackupJob_startedAt_idx" ON "BackupJob"("startedAt");

-- AddForeignKey
ALTER TABLE "BackupSchedule" ADD CONSTRAINT "BackupSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupSchedule" ADD CONSTRAINT "BackupSchedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupJob" ADD CONSTRAINT "BackupJob_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BackupSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupJob" ADD CONSTRAINT "BackupJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupJob" ADD CONSTRAINT "BackupJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

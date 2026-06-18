-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'WARN', 'CRITICAL');

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "actorEmail" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "newValue" JSONB,
ADD COLUMN     "oldValue" JSONB,
ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "severity" "AuditSeverity",
ADD COLUMN     "userAgent" TEXT;

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_userId_idx" ON "AuditEvent"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_actorEmail_idx" ON "AuditEvent"("tenantId", "actorEmail");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_severity_idx" ON "AuditEvent"("tenantId", "severity");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_targetType_targetId_idx" ON "AuditEvent"("tenantId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "AuditEvent_actorEmail_idx" ON "AuditEvent"("actorEmail");

-- CreateIndex
CREATE INDEX "AuditEvent_sessionId_idx" ON "AuditEvent"("sessionId");

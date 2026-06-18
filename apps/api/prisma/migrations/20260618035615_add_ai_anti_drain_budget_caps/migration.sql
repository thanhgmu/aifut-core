-- CreateEnum
CREATE TYPE "BudgetPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('ACTIVE', 'SOFT_LOCKED', 'HARD_LOCKED');

-- CreateTable
CREATE TABLE "AiBudgetLimit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "maxCostAmount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "period" "BudgetPeriod" NOT NULL,
    "currentCostSpent" BIGINT NOT NULL DEFAULT 0,
    "status" "BudgetStatus" NOT NULL DEFAULT 'ACTIVE',
    "alertThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "lastResetAt" TIMESTAMP(3),
    "softLockedAt" TIMESTAMP(3),
    "hardLockedAt" TIMESTAMP(3),
    "lastAlertSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiBudgetLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAccumulationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "cost" BIGINT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetAccumulationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiBudgetLimit_tenantId_status_idx" ON "AiBudgetLimit"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AiBudgetLimit_periodEnd_idx" ON "AiBudgetLimit"("periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "AiBudgetLimit_tenantId_period_key" ON "AiBudgetLimit"("tenantId", "period");

-- CreateIndex
CREATE INDEX "BudgetAccumulationLog_tenantId_createdAt_idx" ON "BudgetAccumulationLog"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAccumulationLog_requestId_tenantId_key" ON "BudgetAccumulationLog"("requestId", "tenantId");

-- AddForeignKey
ALTER TABLE "AiBudgetLimit" ADD CONSTRAINT "AiBudgetLimit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAccumulationLog" ADD CONSTRAINT "BudgetAccumulationLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "DiscrepancyType" AS ENUM ('BALANCE_MISMATCH', 'MISSING_LEDGER_CREDIT_FOR_PAID_INVOICE', 'ORPHAN_LEDGER_CREDIT', 'UNMATCHED_DEBIT', 'DUPLICATE_REFERENCE', 'AMOUNT_MISMATCH', 'SUSPICIOUS_ACTIVITY');

-- CreateEnum
CREATE TYPE "DiscrepancySeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DiscrepancyResolutionStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED_MANUAL', 'RESOLVED_AUTO', 'DISMISSED');

-- CreateEnum
CREATE TYPE "WalletFreezeReason" AS ENUM ('RECONCILIATION_DISCREPANCY', 'SUSPICIOUS_LEDGER_ACTIVITY', 'ANTI_FRAUD_TRIGGER', 'MANUAL_ADMIN');

-- CreateEnum
CREATE TYPE "ReportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'RUNNING',
    "walletBalance" BIGINT,
    "ledgerSum" BIGINT,
    "paidInvoiceSum" BIGINT,
    "discrepancyCount" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscrepancyRecord" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "tenantId" TEXT NOT NULL,
    "severity" "DiscrepancySeverity" NOT NULL DEFAULT 'WARNING',
    "category" "DiscrepancyType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "expectedValue" BIGINT,
    "actualValue" BIGINT,
    "diffValue" BIGINT,
    "source" TEXT NOT NULL,
    "affectedEntity" TEXT,
    "affectedType" TEXT,
    "status" "DiscrepancyResolutionStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "walletFrozen" BOOLEAN NOT NULL DEFAULT false,
    "freezeReason" "WalletFreezeReason",
    "freezeExpiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscrepancyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialReportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestedBy" TEXT,
    "status" "ReportJobStatus" NOT NULL DEFAULT 'PENDING',
    "reportType" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'csv',
    "dateFrom" TIMESTAMP(3) NOT NULL,
    "dateTo" TIMESTAMP(3) NOT NULL,
    "includeDetails" BOOLEAN NOT NULL DEFAULT false,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialReportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconciliationRun_tenantId_startedAt_idx" ON "ReconciliationRun"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "ReconciliationRun_tenantId_status_idx" ON "ReconciliationRun"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DiscrepancyRecord_tenantId_severity_idx" ON "DiscrepancyRecord"("tenantId", "severity");

-- CreateIndex
CREATE INDEX "DiscrepancyRecord_tenantId_category_status_idx" ON "DiscrepancyRecord"("tenantId", "category", "status");

-- CreateIndex
CREATE INDEX "DiscrepancyRecord_tenantId_createdAt_idx" ON "DiscrepancyRecord"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscrepancyRecord_runId_idx" ON "DiscrepancyRecord"("runId");

-- CreateIndex
CREATE INDEX "DiscrepancyRecord_walletFrozen_idx" ON "DiscrepancyRecord"("walletFrozen");

-- CreateIndex
CREATE UNIQUE INDEX "DiscrepancyRecord_dedupe_key" ON "DiscrepancyRecord"("tenantId", "runId", "category", "affectedEntity");

-- CreateIndex
CREATE INDEX "FinancialReportJob_tenantId_status_idx" ON "FinancialReportJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FinancialReportJob_tenantId_createdAt_idx" ON "FinancialReportJob"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialReportJob_status_idx" ON "FinancialReportJob"("status");

-- AddForeignKey
ALTER TABLE "DiscrepancyRecord" ADD CONSTRAINT "DiscrepancyRecord_run_fkey" FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

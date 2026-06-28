/*
  Warnings:

  - The `conversionIds` column on the `CommissionPayout` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `mappedObjects` column on the `IntegrationConnection` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `tier` column on the `LicenseKey` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `LicenseKey` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `tags` column on the `MarketplaceListing` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `scopes` column on the `Session` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `selectedOptions` column on the `TenantPackageAssignment` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `dependsOn` column on the `WorkflowNode` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `tags` column on the `WorkflowTemplate` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Made the column `tenantId` on table `LicenseKey` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "AnalyticsPeriod" AS ENUM ('HOURLY', 'DAILY');

-- CreateEnum
CREATE TYPE "AnomalyType" AS ENUM ('SPIKING_COST', 'SPIKING_TOKENS', 'SPIKING_EXECUTIONS', 'DROPPING_SUCCESS_RATE', 'STORAGE_GROWTH', 'CROSSING_BUDGET_THRESHOLD', 'IDLE_TENANT', 'UNUSUAL_FAILURE_PATTERN', 'ZERO_REVENUE', 'OUTLIER_COMPARED_TO_INDUSTRY');

-- CreateEnum
CREATE TYPE "AnomalySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DeveloperStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'VERIFIED', 'BANNED');

-- CreateEnum
CREATE TYPE "DeveloperTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'COMPLETED', 'REFUNDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('ACTIVE', 'DEPRECATED', 'SUPERSEDED');

-- DropForeignKey
ALTER TABLE "LicenseKey" DROP CONSTRAINT "LicenseKey_tenantId_fkey";

-- DropIndex
DROP INDEX "LicenseKey_expiresAt_idx";

-- DropIndex
DROP INDEX "LicenseKey_status_idx";

-- DropIndex
DROP INDEX "LicenseKey_tenantId_idx";

-- AlterTable
ALTER TABLE "CommissionPayout" DROP COLUMN "conversionIds",
ADD COLUMN     "conversionIds" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "IntegrationConnection" DROP COLUMN "mappedObjects",
ADD COLUMN     "mappedObjects" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "LicenseKey" ALTER COLUMN "tenantId" SET NOT NULL,
DROP COLUMN "tier",
ADD COLUMN     "tier" TEXT NOT NULL DEFAULT 'PRO',
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "maxWorkflows" SET DEFAULT 20,
ALTER COLUMN "features" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketplaceListing" DROP COLUMN "tags",
ADD COLUMN     "tags" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "SandboxSession" ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "scopes",
ADD COLUMN     "scopes" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "TenantPackageAssignment" DROP COLUMN "selectedOptions",
ADD COLUMN     "selectedOptions" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "WorkflowNode" DROP COLUMN "dependsOn",
ADD COLUMN     "dependsOn" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "WorkflowTemplate" ADD COLUMN     "developerNotes" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketplaceStatus" TEXT NOT NULL DEFAULT 'DRAFT',
DROP COLUMN "tags",
ADD COLUMN     "tags" JSONB NOT NULL DEFAULT '[]';

-- DropEnum
DROP TYPE "LicenseStatus";

-- DropEnum
DROP TYPE "LicenseTier";

-- CreateTable
CREATE TABLE "TenantAnalyticsSummary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "period" "AnalyticsPeriod" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "totalExecutions" INTEGER NOT NULL DEFAULT 0,
    "successfulExecutions" INTEGER NOT NULL DEFAULT 0,
    "failedExecutions" INTEGER NOT NULL DEFAULT 0,
    "avgExecutionDurationMs" INTEGER NOT NULL DEFAULT 0,
    "totalAiTokens" BIGINT NOT NULL DEFAULT 0,
    "totalInputTokens" BIGINT NOT NULL DEFAULT 0,
    "totalOutputTokens" BIGINT NOT NULL DEFAULT 0,
    "totalAiCost" BIGINT NOT NULL DEFAULT 0,
    "aiCallCount" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" BIGINT NOT NULL DEFAULT 0,
    "invoiceCount" INTEGER NOT NULL DEFAULT 0,
    "paymentCount" INTEGER NOT NULL DEFAULT 0,
    "totalPaymentAmount" BIGINT NOT NULL DEFAULT 0,
    "activeUserCount" INTEGER NOT NULL DEFAULT 0,
    "newUserCount" INTEGER NOT NULL DEFAULT 0,
    "newIntegrationCount" INTEGER NOT NULL DEFAULT 0,
    "storageBytesTotal" BIGINT NOT NULL DEFAULT 0,
    "storageBytesDelta" BIGINT NOT NULL DEFAULT 0,
    "notificationSentCount" INTEGER NOT NULL DEFAULT 0,
    "notificationFailedCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantAnalyticsSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalPlatformBenchmark" (
    "id" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "totalTenants" INTEGER NOT NULL DEFAULT 0,
    "avgValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "medianValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "p90Value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "p95Value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "p99Value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stdDev" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "windowStartDate" TIMESTAMP(3) NOT NULL,
    "windowEndDate" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobalPlatformBenchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnomalyRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "anomalyType" "AnomalyType" NOT NULL,
    "severity" "AnomalySeverity" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "detailsJson" JSONB,
    "metricName" TEXT,
    "metricValue" DOUBLE PRECISION,
    "baselineValue" DOUBLE PRECISION,
    "industryAvg" DOUBLE PRECISION,
    "deviationScore" DOUBLE PRECISION,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnomalyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "company" TEXT,
    "website" TEXT,
    "githubUrl" TEXT,
    "twitterUrl" TEXT,
    "country" TEXT DEFAULT 'VN',
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "DeveloperStatus" NOT NULL DEFAULT 'ACTIVE',
    "tier" "DeveloperTier" NOT NULL DEFAULT 'BRONZE',
    "totalListings" INTEGER NOT NULL DEFAULT 0,
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "totalEarnings" BIGINT NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperSkill" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceOrder" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerTenantId" TEXT NOT NULL,
    "listingKey" TEXT NOT NULL,
    "listingName" TEXT NOT NULL,
    "listingType" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "fxRateSnapshot" DOUBLE PRECISION,
    "revenueShare" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "devEarnings" BIGINT NOT NULL DEFAULT 0,
    "platformFee" BIGINT NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "orderRef" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperEarning" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "orderId" TEXT,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "type" TEXT NOT NULL,
    "description" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperPayoutRequest" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payoutMethod" TEXT,
    "accountInfo" TEXT,
    "notes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperPayoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceVersion" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "changelog" TEXT,
    "config" JSONB,
    "status" "VersionStatus" NOT NULL DEFAULT 'ACTIVE',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceDependency" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "constraint" TEXT NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceReviewAction" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "configDiff" JSONB,
    "reviewerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceReviewAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceInstallEvent" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "versionId" TEXT,
    "buyerTenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "oldVersion" TEXT,
    "newVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceInstallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB,
    "category" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxBudget" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT,
    "monthlyLimit" BIGINT NOT NULL DEFAULT 10000000,
    "currentSpend" BIGINT NOT NULL DEFAULT 0,
    "usedBudget" BIGINT NOT NULL DEFAULT 0,
    "totalBudget" BIGINT NOT NULL DEFAULT 10000000,
    "alertThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "alertSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxBudgetAlert" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'WARNING',
    "isAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "dismissedAt" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxBudgetAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantAnalyticsSummary_tenantId_period_timestamp_idx" ON "TenantAnalyticsSummary"("tenantId", "period", "timestamp");

-- CreateIndex
CREATE INDEX "TenantAnalyticsSummary_tenantId_timestamp_idx" ON "TenantAnalyticsSummary"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "TenantAnalyticsSummary_workspaceId_period_timestamp_idx" ON "TenantAnalyticsSummary"("workspaceId", "period", "timestamp");

-- CreateIndex
CREATE INDEX "TenantAnalyticsSummary_period_timestamp_idx" ON "TenantAnalyticsSummary"("period", "timestamp");

-- CreateIndex
CREATE INDEX "TenantAnalyticsSummary_totalAiCost_idx" ON "TenantAnalyticsSummary"("totalAiCost");

-- CreateIndex
CREATE INDEX "TenantAnalyticsSummary_totalRevenue_idx" ON "TenantAnalyticsSummary"("totalRevenue");

-- CreateIndex
CREATE UNIQUE INDEX "TenantAnalyticsSummary_tenantId_period_timestamp_workspaceI_key" ON "TenantAnalyticsSummary"("tenantId", "period", "timestamp", "workspaceId");

-- CreateIndex
CREATE INDEX "GlobalPlatformBenchmark_industry_idx" ON "GlobalPlatformBenchmark"("industry");

-- CreateIndex
CREATE INDEX "GlobalPlatformBenchmark_metricName_idx" ON "GlobalPlatformBenchmark"("metricName");

-- CreateIndex
CREATE INDEX "GlobalPlatformBenchmark_industry_metricName_idx" ON "GlobalPlatformBenchmark"("industry", "metricName");

-- CreateIndex
CREATE INDEX "GlobalPlatformBenchmark_windowEndDate_idx" ON "GlobalPlatformBenchmark"("windowEndDate");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalPlatformBenchmark_industry_metricName_windowEndDate_key" ON "GlobalPlatformBenchmark"("industry", "metricName", "windowEndDate");

-- CreateIndex
CREATE INDEX "AnomalyRecord_tenantId_severity_idx" ON "AnomalyRecord"("tenantId", "severity");

-- CreateIndex
CREATE INDEX "AnomalyRecord_tenantId_anomalyType_idx" ON "AnomalyRecord"("tenantId", "anomalyType");

-- CreateIndex
CREATE INDEX "AnomalyRecord_tenantId_isResolved_idx" ON "AnomalyRecord"("tenantId", "isResolved");

-- CreateIndex
CREATE INDEX "AnomalyRecord_tenantId_detectedAt_idx" ON "AnomalyRecord"("tenantId", "detectedAt");

-- CreateIndex
CREATE INDEX "AnomalyRecord_severity_isResolved_idx" ON "AnomalyRecord"("severity", "isResolved");

-- CreateIndex
CREATE INDEX "AnomalyRecord_anomalyType_idx" ON "AnomalyRecord"("anomalyType");

-- CreateIndex
CREATE INDEX "AnomalyRecord_detectedAt_idx" ON "AnomalyRecord"("detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperProfile_tenantId_key" ON "DeveloperProfile"("tenantId");

-- CreateIndex
CREATE INDEX "DeveloperProfile_tenantId_status_idx" ON "DeveloperProfile"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DeveloperProfile_tier_idx" ON "DeveloperProfile"("tier");

-- CreateIndex
CREATE INDEX "DeveloperProfile_totalSales_idx" ON "DeveloperProfile"("totalSales");

-- CreateIndex
CREATE INDEX "DeveloperSkill_skill_idx" ON "DeveloperSkill"("skill");

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperSkill_profileId_skill_key" ON "DeveloperSkill"("profileId", "skill");

-- CreateIndex
CREATE INDEX "MarketplaceOrder_buyerTenantId_status_idx" ON "MarketplaceOrder"("buyerTenantId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceOrder_listingId_status_idx" ON "MarketplaceOrder"("listingId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceOrder_createdAt_idx" ON "MarketplaceOrder"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOrder_listingKey_buyerTenantId_key" ON "MarketplaceOrder"("listingKey", "buyerTenantId");

-- CreateIndex
CREATE INDEX "DeveloperEarning_profileId_type_idx" ON "DeveloperEarning"("profileId", "type");

-- CreateIndex
CREATE INDEX "DeveloperEarning_profileId_createdAt_idx" ON "DeveloperEarning"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "DeveloperEarning_referenceType_referenceId_idx" ON "DeveloperEarning"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "DeveloperPayoutRequest_profileId_status_idx" ON "DeveloperPayoutRequest"("profileId", "status");

-- CreateIndex
CREATE INDEX "DeveloperPayoutRequest_status_createdAt_idx" ON "DeveloperPayoutRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceVersion_listingId_status_idx" ON "MarketplaceVersion"("listingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceVersion_listingId_version_key" ON "MarketplaceVersion"("listingId", "version");

-- CreateIndex
CREATE INDEX "MarketplaceDependency_dependsOnId_idx" ON "MarketplaceDependency"("dependsOnId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceDependency_versionId_dependsOnId_key" ON "MarketplaceDependency"("versionId", "dependsOnId");

-- CreateIndex
CREATE INDEX "MarketplaceReviewAction_listingId_createdAt_idx" ON "MarketplaceReviewAction"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceReviewAction_reviewerId_idx" ON "MarketplaceReviewAction"("reviewerId");

-- CreateIndex
CREATE INDEX "MarketplaceInstallEvent_listingId_createdAt_idx" ON "MarketplaceInstallEvent"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceInstallEvent_buyerTenantId_idx" ON "MarketplaceInstallEvent"("buyerTenantId");

-- CreateIndex
CREATE INDEX "SandboxTemplate_tenantId_idx" ON "SandboxTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "SandboxTemplate_category_idx" ON "SandboxTemplate"("category");

-- CreateIndex
CREATE INDEX "SandboxTemplate_isPublic_idx" ON "SandboxTemplate"("isPublic");

-- CreateIndex
CREATE INDEX "SandboxBudget_tenantId_isActive_idx" ON "SandboxBudget"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "SandboxBudget_tenantId_sessionId_idx" ON "SandboxBudget"("tenantId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxBudget_tenantId_sessionId_key" ON "SandboxBudget"("tenantId", "sessionId");

-- CreateIndex
CREATE INDEX "SandboxBudgetAlert_budgetId_idx" ON "SandboxBudgetAlert"("budgetId");

-- CreateIndex
CREATE INDEX "SandboxBudgetAlert_tenantId_createdAt_idx" ON "SandboxBudgetAlert"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "LicenseKey_tenantId_status_idx" ON "LicenseKey"("tenantId", "status");

-- RenameForeignKey
ALTER TABLE "DiscrepancyRecord" RENAME CONSTRAINT "DiscrepancyRecord_run_fkey" TO "DiscrepancyRecord_runId_fkey";

-- RenameForeignKey
ALTER TABLE "LedgerTransaction" RENAME CONSTRAINT "LedgerTransaction_tenant_fkey" TO "LedgerTransaction_tenantId_fkey";

-- RenameForeignKey
ALTER TABLE "LedgerTransaction" RENAME CONSTRAINT "LedgerTransaction_wallet_fkey" TO "LedgerTransaction_wallet_tenantId_fkey";

-- AddForeignKey
ALTER TABLE "LicenseKey" ADD CONSTRAINT "LicenseKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAnalyticsSummary" ADD CONSTRAINT "TenantAnalyticsSummary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnomalyRecord" ADD CONSTRAINT "AnomalyRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperProfile" ADD CONSTRAINT "DeveloperProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperSkill" ADD CONSTRAINT "DeveloperSkill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DeveloperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperEarning" ADD CONSTRAINT "DeveloperEarning_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DeveloperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperPayoutRequest" ADD CONSTRAINT "DeveloperPayoutRequest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DeveloperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceVersion" ADD CONSTRAINT "MarketplaceVersion_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceDependency" ADD CONSTRAINT "MarketplaceDependency_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "MarketplaceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceDependency" ADD CONSTRAINT "MarketplaceDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "MarketplaceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReviewAction" ADD CONSTRAINT "MarketplaceReviewAction_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInstallEvent" ADD CONSTRAINT "MarketplaceInstallEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInstallEvent" ADD CONSTRAINT "MarketplaceInstallEvent_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "MarketplaceVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxBudgetAlert" ADD CONSTRAINT "SandboxBudgetAlert_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "SandboxBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "DiscrepancyRecord_dedupe_key" RENAME TO "DiscrepancyRecord_tenantId_runId_category_affectedEntity_key";

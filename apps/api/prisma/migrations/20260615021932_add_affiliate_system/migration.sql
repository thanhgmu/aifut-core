-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING', 'DISABLED');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE', 'FIXED', 'TIERED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "AffiliateAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "AffiliateStatus" NOT NULL DEFAULT 'PENDING',
    "referralCode" TEXT NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "commissionType" "CommissionType" NOT NULL DEFAULT 'PERCENTAGE',
    "totalEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalConversions" INTEGER NOT NULL DEFAULT 0,
    "payoutMethod" TEXT,
    "payoutDetails" TEXT,
    "cookieDays" INTEGER NOT NULL DEFAULT 30,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateLink" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "destination" TEXT,
    "campaign" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "conversionCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateConversion" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "linkId" TEXT,
    "tenantId" TEXT,
    "customerEmail" TEXT,
    "customerName" TEXT,
    "conversionType" TEXT NOT NULL,
    "commissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionStatus" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "revenueAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "referralCode" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayout" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "payoutMethod" TEXT,
    "payoutReference" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "notes" TEXT,
    "conversionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateAccount_tenantId_key" ON "AffiliateAccount"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateAccount_referralCode_key" ON "AffiliateAccount"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLink_key_key" ON "AffiliateLink"("key");

-- CreateIndex
CREATE INDEX "AffiliateLink_accountId_isActive_idx" ON "AffiliateLink"("accountId", "isActive");

-- CreateIndex
CREATE INDEX "AffiliateLink_campaign_idx" ON "AffiliateLink"("campaign");

-- CreateIndex
CREATE INDEX "AffiliateConversion_accountId_commissionStatus_idx" ON "AffiliateConversion"("accountId", "commissionStatus");

-- CreateIndex
CREATE INDEX "AffiliateConversion_linkId_idx" ON "AffiliateConversion"("linkId");

-- CreateIndex
CREATE INDEX "AffiliateConversion_tenantId_idx" ON "AffiliateConversion"("tenantId");

-- CreateIndex
CREATE INDEX "AffiliateConversion_referralCode_idx" ON "AffiliateConversion"("referralCode");

-- CreateIndex
CREATE INDEX "AffiliateConversion_attributedAt_idx" ON "AffiliateConversion"("attributedAt");

-- CreateIndex
CREATE INDEX "CommissionPayout_accountId_status_idx" ON "CommissionPayout"("accountId", "status");

-- CreateIndex
CREATE INDEX "CommissionPayout_createdAt_idx" ON "CommissionPayout"("createdAt");

-- AddForeignKey
ALTER TABLE "AffiliateAccount" ADD CONSTRAINT "AffiliateAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AffiliateAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateConversion" ADD CONSTRAINT "AffiliateConversion_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AffiliateAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateConversion" ADD CONSTRAINT "AffiliateConversion_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "AffiliateLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AffiliateAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

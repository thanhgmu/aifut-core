-- +----------------------------------------------------------------------------+
-- | Migration: 20260628100000_add_license_key_model
-- | Description: Thêm bảng LicenseKey cho on-premise deployment activation.
-- | Created: 2026-06-28
-- +----------------------------------------------------------------------------+

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED', 'REVOKED', 'PENDING');

-- CreateEnum
CREATE TYPE "LicenseTier" AS ENUM ('STARTER', 'PRO', 'TEAM', 'ENTERPRISE');

-- CreateTable
CREATE TABLE "LicenseKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "tenantId" TEXT,
    "tier" "LicenseTier" NOT NULL DEFAULT 'PRO',
    "status" "LicenseStatus" NOT NULL DEFAULT 'PENDING',
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "maxWorkflows" INTEGER NOT NULL DEFAULT -1,
    "features" JSONB NOT NULL DEFAULT '[]',
    "issuedTo" TEXT,
    "issuedEmail" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LicenseKey_key_key" ON "LicenseKey"("key");

-- CreateIndex
CREATE INDEX "LicenseKey_key_idx" ON "LicenseKey"("key");

-- CreateIndex
CREATE INDEX "LicenseKey_status_idx" ON "LicenseKey"("status");

-- CreateIndex
CREATE INDEX "LicenseKey_tenantId_idx" ON "LicenseKey"("tenantId");

-- CreateIndex
CREATE INDEX "LicenseKey_expiresAt_idx" ON "LicenseKey"("expiresAt");

-- AddForeignKey
ALTER TABLE "LicenseKey" ADD CONSTRAINT "LicenseKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ResellerAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "commissionType" TEXT NOT NULL DEFAULT 'recurring',
    "discountRate" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "subTenantCount" INTEGER NOT NULL DEFAULT 0,
    "totalCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResellerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerSubTenant" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "subTenantSlug" TEXT NOT NULL,
    "subTenantName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "subscriptionKey" TEXT,
    "revenueAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResellerSubTenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResellerAccount_tenantId_key" ON "ResellerAccount"("tenantId");

-- CreateIndex
CREATE INDEX "ResellerSubTenant_resellerId_status_idx" ON "ResellerSubTenant"("resellerId", "status");

-- AddForeignKey
ALTER TABLE "ResellerAccount" ADD CONSTRAINT "ResellerAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerSubTenant" ADD CONSTRAINT "ResellerSubTenant_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "ResellerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

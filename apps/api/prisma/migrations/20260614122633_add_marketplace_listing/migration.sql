-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "industry" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "authorName" TEXT,
    "authorEmail" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "config" JSONB,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_key_key" ON "MarketplaceListing"("key");

-- CreateIndex
CREATE INDEX "MarketplaceListing_type_category_idx" ON "MarketplaceListing"("type", "category");

-- CreateIndex
CREATE INDEX "MarketplaceListing_isPublished_idx" ON "MarketplaceListing"("isPublished");

-- CreateIndex
CREATE INDEX "MarketplaceListing_industry_idx" ON "MarketplaceListing"("industry");

-- CreateIndex
CREATE INDEX "MarketplaceListing_downloads_idx" ON "MarketplaceListing"("downloads");

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

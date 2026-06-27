-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 4 Migration: Developer Profile + Marketplace Economics
-- ═══════════════════════════════════════════════════════════════════════════
-- Chạy SAU KHI 20 migrations cũ đã được apply.
-- Cách chạy: & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d aifut -f scripts/phase4-migration.sql
-- Password: 123456
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Fix LedgerTransaction FK constraint name collision ────────────
-- Prisma cố tạo 2 FK trên cùng cột tenantId (-> Tenant.id + -> Wallet.tenantId)
-- Cả 2 đều tự đặt tên LedgerTransaction_tenantId_fkey → collision.
-- Giải pháp: tạo FK cho wallet relation với tên riêng biệt.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'LedgerTransaction_wallet_tenantId_fkey'
    AND table_name = 'LedgerTransaction'
  ) THEN
    ALTER TABLE "LedgerTransaction" 
      ADD CONSTRAINT "LedgerTransaction_wallet_tenantId_fkey" 
      FOREIGN KEY ("tenantId") REFERENCES "Wallet"("tenantId") ON DELETE CASCADE;
  END IF;
END $$;

-- ── 2. Create enums (nếu chưa tồn tại) ────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "DeveloperStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'VERIFIED', 'BANNED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DeveloperTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'COMPLETED', 'REFUNDED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. Create DeveloperProfile ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "DeveloperProfile" (
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

    CONSTRAINT "DeveloperProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeveloperProfile_tenantId_key" UNIQUE ("tenantId"),
    CONSTRAINT "DeveloperProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "DeveloperProfile_tenantId_status_idx" ON "DeveloperProfile"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "DeveloperProfile_tier_idx" ON "DeveloperProfile"("tier");
CREATE INDEX IF NOT EXISTS "DeveloperProfile_totalSales_idx" ON "DeveloperProfile"("totalSales");

-- ── 4. Create DeveloperSkill ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "DeveloperSkill" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperSkill_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeveloperSkill_profileId_skill_key" UNIQUE ("profileId", "skill"),
    CONSTRAINT "DeveloperSkill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DeveloperProfile"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "DeveloperSkill_skill_idx" ON "DeveloperSkill"("skill");

-- ── 5. Create MarketplaceOrder ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "MarketplaceOrder" (
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

    CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MarketplaceOrder_listingKey_buyerTenantId_key" UNIQUE ("listingKey", "buyerTenantId"),
    CONSTRAINT "MarketplaceOrder_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "MarketplaceOrder_buyerTenantId_status_idx" ON "MarketplaceOrder"("buyerTenantId", "status");
CREATE INDEX IF NOT EXISTS "MarketplaceOrder_listingId_status_idx" ON "MarketplaceOrder"("listingId", "status");
CREATE INDEX IF NOT EXISTS "MarketplaceOrder_createdAt_idx" ON "MarketplaceOrder"("createdAt");

-- ── 6. Create DeveloperEarning ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "DeveloperEarning" (
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

    CONSTRAINT "DeveloperEarning_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeveloperEarning_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DeveloperProfile"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "DeveloperEarning_profileId_type_idx" ON "DeveloperEarning"("profileId", "type");
CREATE INDEX IF NOT EXISTS "DeveloperEarning_profileId_createdAt_idx" ON "DeveloperEarning"("profileId", "createdAt");
CREATE INDEX IF NOT EXISTS "DeveloperEarning_referenceType_referenceId_idx" ON "DeveloperEarning"("referenceType", "referenceId");

COMMIT;

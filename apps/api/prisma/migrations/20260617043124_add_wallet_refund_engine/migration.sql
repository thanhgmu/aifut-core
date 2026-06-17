-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "RefundRecord" (
    "id" TEXT NOT NULL,
    "originalReferenceId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefundRecord_tenantId_idx" ON "RefundRecord"("tenantId");

-- CreateIndex
CREATE INDEX "RefundRecord_status_idx" ON "RefundRecord"("status");

-- CreateIndex
CREATE INDEX "RefundRecord_originalReferenceId_idx" ON "RefundRecord"("originalReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundRecord_originalReferenceId_id_key" ON "RefundRecord"("originalReferenceId", "id");

-- AddForeignKey
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "MarketplaceListing" ADD COLUMN     "region" TEXT DEFAULT 'VN';

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serialSymbol" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "serialSymbol" TEXT NOT NULL,
    "formCode" TEXT NOT NULL,
    "fullNumber" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "sellerInfo" JSONB NOT NULL,
    "buyerInfo" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "financialSummary" JSONB NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "hmacCode" TEXT NOT NULL,
    "transactionRef" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceCounter_tenantId_idx" ON "InvoiceCounter"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceCounter_tenantId_serialSymbol_key" ON "InvoiceCounter"("tenantId", "serialSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "EInvoice_invoiceNumber_key" ON "EInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "EInvoice_fullNumber_key" ON "EInvoice"("fullNumber");

-- CreateIndex
CREATE INDEX "EInvoice_tenantId_createdAt_idx" ON "EInvoice"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "EInvoice_tenantId_status_idx" ON "EInvoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "EInvoice_issueDate_idx" ON "EInvoice"("issueDate");

-- CreateIndex
CREATE INDEX "EInvoice_fullNumber_idx" ON "EInvoice"("fullNumber");

-- CreateIndex
CREATE INDEX "EInvoice_hmacCode_idx" ON "EInvoice"("hmacCode");

-- CreateIndex
CREATE INDEX "MarketplaceListing_region_idx" ON "MarketplaceListing"("region");

-- AddForeignKey
ALTER TABLE "EInvoice" ADD CONSTRAINT "EInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

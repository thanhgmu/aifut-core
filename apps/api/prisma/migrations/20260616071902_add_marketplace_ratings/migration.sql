-- CreateEnum
CREATE TYPE "ZaloOaConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "ZaloMessageType" AS ENUM ('TEXT', 'ZNS_TEMPLATE', 'MEDIA', 'STICKER');

-- CreateEnum
CREATE TYPE "ZaloMessageSendStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "CertificationStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "name" TEXT,
ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "accountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "gatewayTxId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT,
    "paymentUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "metadata" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListingRating" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "review" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListingRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZaloOaConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "oaId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "encryptedAccessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "ZaloOaConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastVerifiedAt" TIMESTAMP(3),
    "dailyQuotaTotal" INTEGER NOT NULL DEFAULT 0,
    "dailyQuotaUsed" INTEGER NOT NULL DEFAULT 0,
    "quotaResetAt" TIMESTAMP(3),
    "webhookSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZaloOaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZaloSentMessage" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageType" "ZaloMessageType" NOT NULL,
    "templateId" TEXT,
    "recipientId" TEXT NOT NULL,
    "templateData" JSONB,
    "content" TEXT,
    "zaloMessageId" TEXT,
    "sendStatus" "ZaloMessageSendStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" INTEGER,
    "errorMessage" TEXT,
    "quotaCost" INTEGER NOT NULL DEFAULT 1,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZaloSentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZaloWebhookEvent" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "tenantId" TEXT,
    "eventName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZaloWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorCertification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectorKey" TEXT NOT NULL,
    "connectorName" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "developerEmail" TEXT,
    "developerName" TEXT,
    "status" "CertificationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "checklistResults" JSONB,
    "reviewerNotes" TEXT,
    "reviewedBy" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "badgeUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorCertification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentTransaction_accountId_status_idx" ON "PaymentTransaction"("accountId", "status");

-- CreateIndex
CREATE INDEX "PaymentTransaction_tenantId_createdAt_idx" ON "PaymentTransaction"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_gateway_gatewayTxId_idx" ON "PaymentTransaction"("gateway", "gatewayTxId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_status_idx" ON "PaymentTransaction"("status");

-- CreateIndex
CREATE INDEX "MarketplaceListingRating_listingId_idx" ON "MarketplaceListingRating"("listingId");

-- CreateIndex
CREATE INDEX "MarketplaceListingRating_tenantId_idx" ON "MarketplaceListingRating"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListingRating_listingId_tenantId_key" ON "MarketplaceListingRating"("listingId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ZaloOaConnection_tenantId_key" ON "ZaloOaConnection"("tenantId");

-- CreateIndex
CREATE INDEX "ZaloOaConnection_oaId_idx" ON "ZaloOaConnection"("oaId");

-- CreateIndex
CREATE INDEX "ZaloOaConnection_status_idx" ON "ZaloOaConnection"("status");

-- CreateIndex
CREATE INDEX "ZaloSentMessage_connectionId_sentAt_idx" ON "ZaloSentMessage"("connectionId", "sentAt");

-- CreateIndex
CREATE INDEX "ZaloSentMessage_tenantId_sentAt_idx" ON "ZaloSentMessage"("tenantId", "sentAt");

-- CreateIndex
CREATE INDEX "ZaloSentMessage_zaloMessageId_idx" ON "ZaloSentMessage"("zaloMessageId");

-- CreateIndex
CREATE INDEX "ZaloSentMessage_sendStatus_idx" ON "ZaloSentMessage"("sendStatus");

-- CreateIndex
CREATE INDEX "ZaloWebhookEvent_eventName_receivedAt_idx" ON "ZaloWebhookEvent"("eventName", "receivedAt");

-- CreateIndex
CREATE INDEX "ZaloWebhookEvent_connectionId_idx" ON "ZaloWebhookEvent"("connectionId");

-- CreateIndex
CREATE INDEX "ZaloWebhookEvent_processed_idx" ON "ZaloWebhookEvent"("processed");

-- CreateIndex
CREATE INDEX "ConnectorCertification_status_idx" ON "ConnectorCertification"("status");

-- CreateIndex
CREATE INDEX "ConnectorCertification_tenantId_idx" ON "ConnectorCertification"("tenantId");

-- CreateIndex
CREATE INDEX "ConnectorCertification_submittedAt_idx" ON "ConnectorCertification"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorCertification_tenantId_connectorKey_key" ON "ConnectorCertification"("tenantId", "connectorKey");

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingRating" ADD CONSTRAINT "MarketplaceListingRating_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZaloOaConnection" ADD CONSTRAINT "ZaloOaConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZaloSentMessage" ADD CONSTRAINT "ZaloSentMessage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ZaloOaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZaloSentMessage" ADD CONSTRAINT "ZaloSentMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZaloWebhookEvent" ADD CONSTRAINT "ZaloWebhookEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ZaloOaConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZaloWebhookEvent" ADD CONSTRAINT "ZaloWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorCertification" ADD CONSTRAINT "ConnectorCertification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

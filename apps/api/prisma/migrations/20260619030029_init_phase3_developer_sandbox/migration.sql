-- CreateTable
CREATE TABLE "SandboxSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxTrace" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "nodeId" TEXT,
    "actionType" TEXT NOT NULL,
    "inputPayload" JSONB NOT NULL,
    "outputPayload" JSONB,
    "isMocked" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "isSuccess" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "virtualCostBigInt" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookInspectionLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "endpointId" TEXT,
    "method" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "direction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookInspectionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxMockEndpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "httpStatus" INTEGER NOT NULL DEFAULT 200,
    "responseBody" JSONB NOT NULL,
    "delayMs" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxMockEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SandboxSession_tenantId_idx" ON "SandboxSession"("tenantId");

-- CreateIndex
CREATE INDEX "SandboxTrace_sessionId_idx" ON "SandboxTrace"("sessionId");

-- CreateIndex
CREATE INDEX "WebhookInspectionLog_tenantId_idx" ON "WebhookInspectionLog"("tenantId");

-- CreateIndex
CREATE INDEX "WebhookInspectionLog_createdAt_idx" ON "WebhookInspectionLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxMockEndpoint_tenantId_path_key" ON "SandboxMockEndpoint"("tenantId", "path");

-- AddForeignKey
ALTER TABLE "SandboxTrace" ADD CONSTRAINT "SandboxTrace_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SandboxSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

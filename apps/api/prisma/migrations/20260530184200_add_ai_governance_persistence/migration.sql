CREATE TABLE "AiRoutingPolicy" (
  "id" TEXT NOT NULL,
  "policyKey" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "tenantSlug" TEXT NOT NULL,
  "workspaceSlug" TEXT,
  "featureKey" TEXT NOT NULL,
  "taskType" TEXT NOT NULL,
  "defaultLane" TEXT NOT NULL,
  "maxLane" TEXT NOT NULL,
  "preferredCredentialMode" TEXT NOT NULL,
  "allowByoKeys" BOOLEAN NOT NULL DEFAULT false,
  "requireApprovalAboveLane" TEXT,
  "downgradeAtQuotaPressure" TEXT NOT NULL,
  "cacheEnabled" BOOLEAN NOT NULL DEFAULT true,
  "deterministicFirst" BOOLEAN NOT NULL DEFAULT true,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiRoutingPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiBudgetPolicy" (
  "id" TEXT NOT NULL,
  "policyKey" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "tenantSlug" TEXT NOT NULL,
  "workspaceSlug" TEXT,
  "featureKey" TEXT NOT NULL,
  "monthlyTokenBudget" INTEGER NOT NULL DEFAULT 0,
  "hardMonthlyTokenLimit" INTEGER NOT NULL DEFAULT 0,
  "premiumExecutionCap" INTEGER NOT NULL DEFAULT 0,
  "blockOnHardLimit" BOOLEAN NOT NULL DEFAULT true,
  "requireApprovalAtProjectedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiBudgetPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiUsageEvent" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "tenantSlug" TEXT NOT NULL,
  "workspaceSlug" TEXT,
  "actorKey" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  "taskType" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "modelKey" TEXT NOT NULL,
  "credentialMode" TEXT NOT NULL,
  "executionLane" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "actualCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cacheHit" BOOLEAN NOT NULL DEFAULT false,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "escalationCount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiRoutingPolicy_policyKey_key"
ON "AiRoutingPolicy"("policyKey");

CREATE INDEX "AiRoutingPolicy_tenantSlug_featureKey_idx"
ON "AiRoutingPolicy"("tenantSlug", "featureKey");

CREATE INDEX "AiRoutingPolicy_workspaceSlug_idx"
ON "AiRoutingPolicy"("workspaceSlug");

CREATE INDEX "AiRoutingPolicy_defaultLane_idx"
ON "AiRoutingPolicy"("defaultLane");

CREATE UNIQUE INDEX "AiBudgetPolicy_policyKey_key"
ON "AiBudgetPolicy"("policyKey");

CREATE INDEX "AiBudgetPolicy_tenantSlug_featureKey_idx"
ON "AiBudgetPolicy"("tenantSlug", "featureKey");

CREATE INDEX "AiBudgetPolicy_workspaceSlug_idx"
ON "AiBudgetPolicy"("workspaceSlug");

CREATE UNIQUE INDEX "AiUsageEvent_eventKey_key"
ON "AiUsageEvent"("eventKey");

CREATE INDEX "AiUsageEvent_tenantSlug_occurredAt_idx"
ON "AiUsageEvent"("tenantSlug", "occurredAt");

CREATE INDEX "AiUsageEvent_workspaceSlug_idx"
ON "AiUsageEvent"("workspaceSlug");

CREATE INDEX "AiUsageEvent_featureKey_taskType_idx"
ON "AiUsageEvent"("featureKey", "taskType");

CREATE INDEX "AiUsageEvent_executionLane_idx"
ON "AiUsageEvent"("executionLane");

CREATE INDEX "AiUsageEvent_status_idx"
ON "AiUsageEvent"("status");

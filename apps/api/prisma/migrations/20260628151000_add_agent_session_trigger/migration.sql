-- ═══════════════════════════════════════════════════════════════════════
-- Migration: add_agent_session_trigger
-- Thêm AgentSession và AgentTrigger models cho per-tenant AI Agent
-- ═══════════════════════════════════════════════════════════════════════

-- ── AgentSession ─────────────────────────────────────────────────────────
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Session',
    "status" TEXT NOT NULL DEFAULT 'active',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentSession_tenantId_status_idx" ON "AgentSession"("tenantId", "status");
CREATE INDEX "AgentSession_tenantId_updatedAt_idx" ON "AgentSession"("tenantId", "updatedAt");
CREATE INDEX "AgentSession_status_idx" ON "AgentSession"("status");

ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── AgentTrigger ─────────────────────────────────────────────────────────
CREATE TABLE "AgentTrigger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "schedule" TEXT,
    "eventType" TEXT,
    "config" JSONB,
    "intent" TEXT NOT NULL DEFAULT 'SYSTEM_HEALTH_CHECK',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFiredAt" TIMESTAMP(3),
    "nextFireAt" TIMESTAMP(3),
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTrigger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentTrigger_tenantId_isActive_idx" ON "AgentTrigger"("tenantId", "isActive");
CREATE INDEX "AgentTrigger_triggerType_isActive_idx" ON "AgentTrigger"("triggerType", "isActive");
CREATE INDEX "AgentTrigger_nextFireAt_idx" ON "AgentTrigger"("nextFireAt");

ALTER TABLE "AgentTrigger" ADD CONSTRAINT "AgentTrigger_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

// ═══════════════════════════════════════════════════════════════════════════
// ai-agent.module.ts — AI Operator Agent Module
// ═══════════════════════════════════════════════════════════════════════════
// Per-tenant AI operator agent runtime + session management + action execution.

import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BillingService } from '../billing/billing.service';
import { AnalyticsBiService } from '../analytics-bi/analytics-bi.service';
import { AuditService } from '../audit/audit.service';
import { AiAgentCoreService } from './ai-agent-core.service';
import { AiAgentActionExecutorService } from './ai-agent-action-executor.service';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentSessionService } from './ai-agent-session.service';

@Module({
  controllers: [AiAgentController],
  providers: [
    PrismaService,
    BillingService,
    AnalyticsBiService,
    AuditService,
    AiAgentCoreService,
    AiAgentActionExecutorService,
    AiAgentSessionService,
  ],
  exports: [
    AiAgentCoreService,
    AiAgentActionExecutorService,
    AiAgentSessionService,
  ],
})
export class AiAgentModule {}

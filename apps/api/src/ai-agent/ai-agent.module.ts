// ═══════════════════════════════════════════════════════════════════════════
// ai-agent.module.ts — AI Operator Agent Module
// ═══════════════════════════════════════════════════════════════════════════
// Per-tenant AI operator agent runtime + session management + action execution.

import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BillingService } from '../billing/billing.service';
import { AnalyticsBiModule } from '../analytics-bi/analytics-bi.module';
import { AuditModule } from '../audit/audit.module';
import { AiAgentCoreService } from './ai-agent-core.service';
import { AiAgentActionExecutorService } from './ai-agent-action-executor.service';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentSessionService } from './ai-agent-session.service';

@Module({
  imports: [
    AnalyticsBiModule,
    AuditModule,
  ],
  controllers: [AiAgentController],
  providers: [
    PrismaService,
    BillingService,
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

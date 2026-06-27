// ═══════════════════════════════════════════════════════════════════════════
// ai-agent.module.ts — AI Operator Agent Module
// ═══════════════════════════════════════════════════════════════════════════
// Per-tenant AI operator agent runtime + session management.

import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AiAgentCoreService } from './ai-agent-core.service';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentSessionService } from './ai-agent-session.service';

@Module({
  controllers: [AiAgentController],
  providers: [
    PrismaService,
    AiAgentCoreService,
    AiAgentSessionService,
  ],
  exports: [
    AiAgentCoreService,
    AiAgentSessionService,
  ],
})
export class AiAgentModule {}

import { Module } from '@nestjs/common';
import { ActorContextService } from './actor-context.service';
import { PrismaService } from './prisma.service';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrationService } from './orchestration.service';
import { AiTokenGovernanceService } from './ai-token-governance.service';

@Module({
  controllers: [OrchestrationController],
  providers: [
    PrismaService,
    ActorContextService,
    OrchestrationService,
    AiTokenGovernanceService,
  ],
})
export class OrchestrationModule {}

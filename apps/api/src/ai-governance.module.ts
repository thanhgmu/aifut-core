import { Module } from '@nestjs/common';
import { AiGovernanceController } from './ai-governance.controller';
import { AiGovernancePersistenceService } from './ai-governance-persistence.service';
import { AiTokenGovernanceService } from './ai-token-governance.service';
import { TenancyModule } from './tenancy.module';
import { AiAgentCoreService } from './ai-agent/ai-agent-core.service';

@Module({
  imports: [TenancyModule],
  controllers: [AiGovernanceController],
  providers: [AiTokenGovernanceService, AiGovernancePersistenceService, AiAgentCoreService],
  exports: [AiTokenGovernanceService, AiGovernancePersistenceService, AiAgentCoreService],
})
export class AiGovernanceModule {}

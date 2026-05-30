import { Module } from '@nestjs/common';
import { AiGovernancePersistenceService } from './ai-governance-persistence.service';
import { AiTokenGovernanceService } from './ai-token-governance.service';

@Module({
  providers: [AiTokenGovernanceService, AiGovernancePersistenceService],
  exports: [AiTokenGovernanceService, AiGovernancePersistenceService],
})
export class AiGovernanceModule {}

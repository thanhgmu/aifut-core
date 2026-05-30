import { Module } from '@nestjs/common';
import { AiGovernanceController } from './ai-governance.controller';
import { AiGovernancePersistenceService } from './ai-governance-persistence.service';
import { AiTokenGovernanceService } from './ai-token-governance.service';
import { TenancyModule } from './tenancy.module';

@Module({
  imports: [TenancyModule],
  controllers: [AiGovernanceController],
  providers: [AiTokenGovernanceService, AiGovernancePersistenceService],
  exports: [AiTokenGovernanceService, AiGovernancePersistenceService],
})
export class AiGovernanceModule {}

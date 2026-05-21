import { Module } from '@nestjs/common';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrationService } from './orchestration.service';
import { AiTokenGovernanceService } from './ai-token-governance.service';
import { OrchestrationRuntimeHistoryService } from './orchestration-runtime-history.service';
import { TenancyModule } from './tenancy.module';

@Module({
  imports: [TenancyModule],
  controllers: [OrchestrationController],
  providers: [
    OrchestrationService,
    AiTokenGovernanceService,
    OrchestrationRuntimeHistoryService,
  ],
})
export class OrchestrationModule {}

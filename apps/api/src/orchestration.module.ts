import { Module } from '@nestjs/common';
import { AiGovernanceModule } from './ai-governance.module';
import { AuditModule } from './audit.module';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrationService } from './orchestration.service';
import { OrchestrationRuntimeHistoryService } from './orchestration-runtime-history.service';
import { TenancyModule } from './tenancy.module';

@Module({
  imports: [TenancyModule, AiGovernanceModule, AuditModule],
  controllers: [OrchestrationController],
  providers: [
    OrchestrationService,
    OrchestrationRuntimeHistoryService,
  ],
})
export class OrchestrationModule {}

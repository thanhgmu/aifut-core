import { Module } from '@nestjs/common';
import { ActorContextService } from './actor-context.service';
import { PrismaService } from './prisma.service';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrationService } from './orchestration.service';

@Module({
  controllers: [OrchestrationController],
  providers: [PrismaService, ActorContextService, OrchestrationService],
})
export class OrchestrationModule {}

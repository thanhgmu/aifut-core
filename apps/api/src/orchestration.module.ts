import { Module } from '@nestjs/common';
import { ActorContextService } from './actor-context.service';
import { PrismaService } from './prisma.service';
import { OrchestrationController } from './orchestration.controller';

@Module({
  controllers: [OrchestrationController],
  providers: [PrismaService, ActorContextService],
})
export class OrchestrationModule {}

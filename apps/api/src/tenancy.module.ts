import { Module } from '@nestjs/common';
import { ActorContextService } from './actor-context.service';
import { TenancyController } from './tenancy.controller';
import { PrismaService } from './prisma.service';

@Module({
  controllers: [TenancyController],
  providers: [PrismaService, ActorContextService],
  exports: [PrismaService, ActorContextService],
})
export class TenancyModule {}

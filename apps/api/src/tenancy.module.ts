import { Module } from '@nestjs/common';
import { AccessPolicyService } from './access-policy.service';
import { ActorContextService } from './actor-context.service';
import { TenancyController } from './tenancy.controller';
import { PrismaService } from './prisma.service';

@Module({
  controllers: [TenancyController],
  providers: [PrismaService, ActorContextService, AccessPolicyService],
  exports: [PrismaService, ActorContextService, AccessPolicyService],
})
export class TenancyModule {}

import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessPolicyGuard } from './access-policy.guard';
import { AccessPolicyService } from './access-policy.service';
import { ActorContextService } from './actor-context.service';
import { TenancyController } from './tenancy.controller';
import { PrismaService } from './prisma.service';

@Module({
  controllers: [TenancyController],
  providers: [
    PrismaService,
    ActorContextService,
    AccessPolicyService,
    AccessPolicyGuard,
    Reflector,
  ],
  exports: [
    PrismaService,
    ActorContextService,
    AccessPolicyService,
    AccessPolicyGuard,
  ],
})
export class TenancyModule {}

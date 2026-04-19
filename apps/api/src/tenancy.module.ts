import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessPolicyGuard } from './access-policy.guard';
import { AccessPolicyService } from './access-policy.service';
import { ActorContextService } from './actor-context.service';
import { TenancyController } from './tenancy.controller';
import { PrismaService } from './prisma.service';
import { StorageRoutingPolicyService } from './storage-routing-policy.service';
import { TenantDomainResolutionService } from './tenant-domain-resolution.service';

@Module({
  controllers: [TenancyController],
  providers: [
    PrismaService,
    ActorContextService,
    AccessPolicyService,
    AccessPolicyGuard,
    TenantDomainResolutionService,
    StorageRoutingPolicyService,
    Reflector,
  ],
  exports: [
    PrismaService,
    ActorContextService,
    AccessPolicyService,
    AccessPolicyGuard,
    TenantDomainResolutionService,
    StorageRoutingPolicyService,
  ],
})
export class TenancyModule {}

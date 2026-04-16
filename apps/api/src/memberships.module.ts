import { Module } from '@nestjs/common';
import { ActorContextService } from './actor-context.service';
import { MembershipsController } from './memberships.controller';
import { TenancyModule } from './tenancy.module';

@Module({
  imports: [TenancyModule],
  controllers: [MembershipsController],
  providers: [ActorContextService],
})
export class MembershipsModule {}

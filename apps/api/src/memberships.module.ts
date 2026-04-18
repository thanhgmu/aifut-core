import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller';
import { TenancyModule } from './tenancy.module';

@Module({
  imports: [TenancyModule],
  controllers: [MembershipsController],
})
export class MembershipsModule {}

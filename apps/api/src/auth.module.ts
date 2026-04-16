import { Module } from '@nestjs/common';
import { ActorContextService } from './actor-context.service';
import { AuthController } from './auth.controller';
import { TenancyModule } from './tenancy.module';

@Module({
  imports: [TenancyModule],
  controllers: [AuthController],
  providers: [ActorContextService],
})
export class AuthModule {}

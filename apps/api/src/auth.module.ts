import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { TenancyModule } from './tenancy.module';

@Module({
  imports: [TenancyModule],
  controllers: [AuthController],
})
export class AuthModule {}

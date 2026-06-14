import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TenancyModule } from '../tenancy.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [TenancyModule],
  controllers: [AuthController],
  providers: [AuthService, PrismaService],
  exports: [AuthService],
})
export class AuthModule {}

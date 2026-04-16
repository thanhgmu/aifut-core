import { Module } from '@nestjs/common';
import { TenancyController } from './tenancy.controller';
import { PrismaService } from './prisma.service';

@Module({
  controllers: [TenancyController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class TenancyModule {}

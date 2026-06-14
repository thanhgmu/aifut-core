import { Module } from '@nestjs/common';
import { ResellerController } from './reseller.controller';
import { ResellerService } from './reseller.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ResellerController],
  providers: [ResellerService, PrismaService],
  exports: [ResellerService],
})
export class ResellerModule {}

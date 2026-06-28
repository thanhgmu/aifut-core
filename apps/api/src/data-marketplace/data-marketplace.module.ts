import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DataMarketplaceService } from './data-marketplace.service';
import { DataMarketplaceController } from './data-marketplace.controller';

@Module({
  controllers: [DataMarketplaceController],
  providers: [PrismaService, DataMarketplaceService],
  exports: [DataMarketplaceService],
})
export class DataMarketplaceModule {}

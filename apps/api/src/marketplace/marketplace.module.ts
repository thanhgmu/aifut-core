import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace-v0.controller';
import { MarketplacePublishController } from './marketplace.controller';
import { MarketplaceOrderController } from './marketplace-order.controller';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceOrderService } from './marketplace-order.service';
import { DeveloperProfileService } from '../developer/developer-profile.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [
    MarketplaceController,
    MarketplacePublishController,
    MarketplaceOrderController,
  ],
  providers: [
    MarketplaceService,
    MarketplaceOrderService,
    DeveloperProfileService,
    PrismaService,
  ],
  exports: [MarketplaceService, MarketplaceOrderService],
})
export class MarketplaceModule {}

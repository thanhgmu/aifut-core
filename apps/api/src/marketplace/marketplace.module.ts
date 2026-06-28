// ===================================================================
// marketplace.module.ts — Marketplace Module (Phase 4 expansion)
// Đăng ký controllers + services cho marketplace ecosystem
// Phase 4 additions: Versioning, Dependencies, Moderation
// ===================================================================

import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace-v0.controller';
import { MarketplacePublishController } from './marketplace.controller';
import { MarketplaceOrderController } from './marketplace-order.controller';
import { MarketplaceVersionController } from './marketplace-version.controller';
import { MarketplaceModerationController } from './marketplace-moderation.controller';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceOrderService } from './marketplace-order.service';
import { MarketplaceVersionService } from './marketplace-version.service';
import { MarketplaceDependencyService } from './marketplace-dependency.service';
import { MarketplaceModerationService } from './marketplace-moderation.service';
import { DeveloperProfileService } from '../developer/developer-profile.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [
    MarketplaceController,
    MarketplacePublishController,
    MarketplaceOrderController,
    MarketplaceVersionController,
    MarketplaceModerationController,
  ],
  providers: [
    MarketplaceService,
    MarketplaceOrderService,
    MarketplaceVersionService,
    MarketplaceDependencyService,
    MarketplaceModerationService,
    DeveloperProfileService,
    PrismaService,
  ],
  exports: [
    MarketplaceService,
    MarketplaceOrderService,
    MarketplaceVersionService,
    MarketplaceDependencyService,
    MarketplaceModerationService,
  ],
})
export class MarketplaceModule {}

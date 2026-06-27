import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy.module';
import { DeveloperController } from './developer.controller';
import { DeveloperService } from './developer.service';
import { DeveloperProfileController } from './developer-profile.controller';
import { DeveloperProfileService } from './developer-profile.service';
import { WebhookInspectorController } from './webhook-inspector.controller';
import { WebhookInspectorService } from './webhook-inspector.service';
import { PayoutController } from './payout.controller';
import { PayoutService } from './payout.service';

/**
 * DeveloperModule — Phân hệ Developer Tools & Marketplace Identity
 * ================================================================
 * Cung cấp:
 *   - API docs, SDK info, AIS spec, webhook docs
 *   - Developer profile registration & management
 *   - Skill management (kỹ năng + cấp độ)
 *   - Marketplace earnings & stats dashboard
 *   - Payout & revenue withdrawal engine
 *   - Webhook inspector & telemetry
 *
 * Phụ thuộc vào TenancyModule để inject PrismaService xử lý persistence.
 */
@Module({
  imports: [TenancyModule],
  controllers: [
    DeveloperController,
    DeveloperProfileController,
    WebhookInspectorController,
    PayoutController,
  ],
  providers: [
    DeveloperService,
    DeveloperProfileService,
    WebhookInspectorService,
    PayoutService,
  ],
  exports: [DeveloperService, DeveloperProfileService, PayoutService],
})
export class DeveloperModule {}

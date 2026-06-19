import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy.module';
import { DeveloperController } from './developer.controller';
import { DeveloperService } from './developer.service';
import { WebhookInspectorController } from './webhook-inspector.controller';
import { WebhookInspectorService } from './webhook-inspector.service';

/**
 * DeveloperModule — Phân hệ Developer Tools
 * ==========================================
 * Cung cấp endpoint tài liệu API, SDK, AWL và thanh tra Webhook
 * cho developer. Phụ thuộc vào TenancyModule để inject PrismaService
 * xử lý persistence (nhật ký telemetry Webhook).
 */
@Module({
  imports: [TenancyModule],
  controllers: [DeveloperController, WebhookInspectorController],
  providers: [DeveloperService, WebhookInspectorService],
  exports: [DeveloperService],
})
export class DeveloperModule {}

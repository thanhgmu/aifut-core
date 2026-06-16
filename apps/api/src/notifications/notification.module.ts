import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ZaloModule } from '../integrations/zalo/zalo.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationTemplateController } from './notification-template.controller';
import { NotificationTemplateService } from './notification-template.service';

@Module({
  imports: [ZaloModule],
  controllers: [NotificationController, NotificationTemplateController],
  providers: [NotificationService, NotificationTemplateService, PrismaService],
  exports: [NotificationService, NotificationTemplateService],
})
export class NotificationModule {}

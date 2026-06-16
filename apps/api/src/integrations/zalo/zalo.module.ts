import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ZaloOAuthService } from './zalo-oauth.service';
import { ZaloZnsService } from './zalo-zns.service';
import { ZaloWebhookService } from './zalo-webhook.service';
import { ZaloMeterService } from './zalo.meter.service';

import { ZaloController } from './zalo.controller';
import { ZaloWebhookController } from './zalo-webhook.controller';

@Module({
  controllers: [ZaloController, ZaloWebhookController],
  providers: [
    ZaloOAuthService,
    ZaloZnsService,
    ZaloWebhookService,
    ZaloMeterService,

    PrismaService,
  ],
  exports: [
    ZaloZnsService,
    ZaloOAuthService,
    ZaloMeterService,

  ],
})
export class ZaloModule {}

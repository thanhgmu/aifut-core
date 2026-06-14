import { Body, Controller, Get, Post } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NOTIFICATION_ROADMAP } from './notification.constants';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notif: NotificationService) {}

  @Post('send')
  async send(@Body() body: { channel: string; to: string | string[]; subject?: string; body: string; webhookUrl?: string; template?: string }) {
    return this.notif.deliver(body);
  }

  @Post('webhook')
  async webhook(@Body() body: { url: string; payload: any }) {
    return this.notif.deliver({
      channel: 'webhook',
      to: body.url,
      body: JSON.stringify(body.payload),
    });
  }

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'notifications',
      status: 'foundation',
      supports: {
        channels: ['webhook', 'email', 'log'],
        templateEngine: false,
        deliveryTracking: false,
      },
      next: NOTIFICATION_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return { capability: 'notifications', roadmap: NOTIFICATION_ROADMAP };
  }
}

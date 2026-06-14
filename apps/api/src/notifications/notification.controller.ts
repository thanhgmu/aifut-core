import { Body, Controller, Get, Post, Query, Param } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NOTIFICATION_ROADMAP } from './notification.constants';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notif: NotificationService) {}

  @Post('send')
  async send(@Body() body: {
    tenantId: string;
    channel: string;
    to: string | string[];
    subject?: string;
    body?: string;
    template?: string;
    templateData?: Record<string, any>;
    webhookUrl?: string;
    metadata?: Record<string, any>;
  }) {
    return this.notif.deliver({
      tenantId: body.tenantId,
      channel: body.channel,
      to: body.to,
      subject: body.subject,
      body: body.body ?? '',
      template: body.template,
      templateData: body.templateData,
      webhookUrl: body.webhookUrl,
      metadata: body.metadata,
    });
  }

  @Post('batch')
  async batch(@Body() body: { notifications: Array<{
    tenantId: string;
    channel: string;
    to: string | string[];
    subject?: string;
    body?: string;
    template?: string;
    templateData?: Record<string, any>;
    webhookUrl?: string;
    metadata?: Record<string, any>;
  }> }) {
    return this.notif.deliverBatch(
      body.notifications.map((n) => ({
        ...n,
        body: n.body ?? '',
      })),
    );
  }

  @Post('webhook')
  async webhook(@Body() body: { tenantId: string; url: string; payload: any }) {
    return this.notif.deliver({
      tenantId: body.tenantId,
      channel: 'webhook',
      to: body.url,
      body: JSON.stringify(body.payload),
    });
  }

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'notifications',
      status: 'active',
      channels: {
        email: { status: 'implemented', provider: process.env.SMTP_HOST ? 'smtp' : 'log' },
        webhook: { status: 'implemented', provider: 'http' },
        zalo: { status: 'implemented', provider: 'zalo-oa', envRequired: ['ZALO_APP_ID', 'ZALO_APP_SECRET', 'ZALO_REFRESH_TOKEN'] },
        sms: { status: 'implemented', provider: process.env.SMS_GATEWAY_URL ? 'http-gateway' : 'log' },
        slack: { status: 'implemented', provider: 'slack-webhook' },
        log: { status: 'implemented', provider: 'console' },
      },
      templateEngine: { status: 'active', format: ['text', 'html', 'markdown'] },
      deliveryTracking: { status: 'active', storage: 'NotificationLog' },
      roadmap: NOTIFICATION_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return { capability: 'notifications', roadmap: NOTIFICATION_ROADMAP };
  }

  @Get('logs')
  async logs(
    @Query('tenantId') tenantId: string,
    @Query('channel') channel?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const { PrismaService } = require('../prisma.service');
    // Pass-through to a simple query via the service
    return 'Use GET /notifications/logs/:tenantId';
  }

  @Get('logs/:tenantId')
  async getLogs(
    @Param('tenantId') tenantId: string,
    @Query('channel') channel?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // We'll inject PrismaService properly; for now use notif's internal prisma
    return this.notif['prisma'].notificationLog.findMany({
      where: {
        tenantId,
        ...(channel ? { channel: channel.toUpperCase() as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit || '50'),
      skip: parseInt(offset || '0'),
    });
  }

  @Get('logs/:tenantId/:id')
  async getLogById(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.notif['prisma'].notificationLog.findFirst({
      where: { id, tenantId },
    });
  }
}

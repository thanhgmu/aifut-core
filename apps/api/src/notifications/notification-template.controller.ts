import {
  Body, Controller, Delete, Get, Param, Post, Put, Query,
} from '@nestjs/common';
import { NotificationTemplateService } from './notification-template.service';

@Controller('notifications/templates')
export class NotificationTemplateController {
  constructor(private readonly svc: NotificationTemplateService) {}

  @Get()
  list(@Query('tenantId') tenantId: string) {
    return this.svc.list(tenantId);
  }

  @Get(':id')
  get(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    return this.svc.getById(tenantId, id);
  }

  @Get('by-key/:key')
  getByKey(@Param('key') key: string, @Query('tenantId') tenantId: string) {
    return this.svc.getByKey(tenantId, key);
  }

  @Post()
  create(@Body() body: { tenantId: string; key: string; name: string; channel: string; subjectTemplate?: string; bodyTemplate: string; format?: string }) {
    return this.svc.create({
      tenantId: body.tenantId,
      key: body.key,
      name: body.name,
      channel: body.channel,
      subjectTemplate: body.subjectTemplate,
      bodyTemplate: body.bodyTemplate,
      format: (body.format as any) ?? 'text',
    });
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
    @Body() body: { name?: string; subjectTemplate?: string; bodyTemplate?: string; format?: 'text' | 'html' | 'markdown' },
  ) {
    return this.svc.update(tenantId, id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    return this.svc.delete(tenantId, id);
  }

  @Post(':key/render')
  render(
    @Param('key') key: string,
    @Query('tenantId') tenantId: string,
    @Body() body: { data: Record<string, any> },
  ) {
    return this.svc.render(tenantId, key, body.data);
  }
}

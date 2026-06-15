import { Controller, Get, Post, Delete, Body, Param, Headers, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';

@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @Post('generate')
  async generate(
    @Body() body: { tenantId: string; userId: string; name: string; scopes?: string[]; expiresInDays?: number },
  ) {
    if (!body.tenantId || !body.userId || !body.name) {
      throw new BadRequestException('Missing required: tenantId, userId, name');
    }
    return this.apiKeys.generateKey(body);
  }

  @Get(':tenantId/:userId')
  async list(@Param('tenantId') tenantId: string, @Param('userId') userId: string) {
    return this.apiKeys.listKeys(tenantId, userId);
  }

  @Delete(':keyId')
  async revoke(@Param('keyId') keyId: string, @Headers('x-tenant-id') tenantId: string) {
    return this.apiKeys.revokeKey(keyId, tenantId);
  }

  @Post('validate')
  async validate(@Body() body: { key: string }) {
    if (!body.key) throw new BadRequestException('Missing key');
    const result = await this.apiKeys.validateKey(body.key);
    if (!result) return { valid: false, message: 'Invalid or expired key' };
    return { valid: true, ...result };
  }

  @Get('capabilities')
  capabilities() {
    return this.apiKeys.getCapabilities();
  }
}

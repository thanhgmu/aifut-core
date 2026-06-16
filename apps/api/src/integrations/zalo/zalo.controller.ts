import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Logger,
} from '@nestjs/common';
import { ZaloOAuthService } from './zalo-oauth.service';
import { ZaloZnsService } from './zalo-zns.service';
import type {
  ZaloConnectInput,
  ZaloConnectionStatus,
  ZnsSendRequest,
  ZaloTextSendRequest,
} from './zalo.types';

/**
 * REST API for managing Zalo OA connections and sending messages.
 */
@Controller('zalo')
export class ZaloController {
  private readonly logger = new Logger(ZaloController.name);

  constructor(
    private readonly oauth: ZaloOAuthService,
    private readonly zns: ZaloZnsService,
  ) {}

  // ── Connection Management ─────────────────────────────────────────

  /** Connect a Zalo OA for a tenant */
  @Post('connect')
  async connect(
    @Body() body: { tenantId: string } & ZaloConnectInput,
  ) {
    return this.oauth.connect(body.tenantId, {
      oaId: body.oaId,
      appId: body.appId,
      secretKey: body.secretKey,
      refreshToken: body.refreshToken,
      webhookUrl: body.webhookUrl,
    });
  }

  /** Disconnect a Zalo OA */
  @Delete('connect/:tenantId')
  async disconnect(@Param('tenantId') tenantId: string) {
    await this.oauth.disconnect(tenantId);
    return { success: true, tenantId };
  }

  /** Get connection status */
  @Get('status/:tenantId')
  async status(@Param('tenantId') tenantId: string): Promise<ZaloConnectionStatus> {
    return this.oauth.getStatus(tenantId);
  }

  // ── Sending ───────────────────────────────────────────────────────

  /** Send a ZNS template message */
  @Post('send/zns')
  async sendZns(
    @Body() body: { tenantId: string } & ZnsSendRequest,
  ) {
    return this.zns.sendZnsTemplate(body.tenantId, {
      userId: body.userId,
      templateId: body.templateId,
      templateData: body.templateData,
      trackingId: body.trackingId,
      language: body.language,
    });
  }

  /** Send a text message (legacy CS endpoint) */
  @Post('send/text')
  async sendText(
    @Body() body: { tenantId: string } & ZaloTextSendRequest,
  ) {
    return this.zns.sendText(body.tenantId, {
      userId: body.userId,
      text: body.text,
      trackingId: body.trackingId,
    });
  }

  // ── Quota & Info ──────────────────────────────────────────────────

  /** Get ZNS daily quota */
  @Get('quota/:tenantId')
  async quota(@Param('tenantId') tenantId: string) {
    return this.zns.getRemainingQuota(tenantId);
  }

  /** Get OA information */
  @Get('oa-info/:tenantId')
  async oaInfo(@Param('tenantId') tenantId: string) {
    return this.zns.getOaInfo(tenantId);
  }

  /** Test endpoint: send a test ZNS message to verify connectivity */
  @Post('test/:tenantId')
  async testConnectivity(
    @Param('tenantId') tenantId: string,
    @Body() body: { userId: string; templateId?: string },
  ) {
    // Try fetching OA info as connectivity test
    const oaInfo = await this.zns.getOaInfo(tenantId);
    const quota = await this.zns.getRemainingQuota(tenantId);

    return {
      connected: true,
      oaName: oaInfo?.name ?? 'unknown',
      remainingQuota: quota.remaining,
      testUser: body.userId,
      message:
        'Connectivity verified. Configure a ZNS template in your Zalo OA Dashboard to send actual templates.',
    };
  }
}

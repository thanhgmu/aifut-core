import { Controller, Post, Body, Headers, Req, HttpCode, Param, Logger } from '@nestjs/common';
import type { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ZaloWebhookService } from './zalo-webhook.service';

/**
 * Webhook receiver for Zalo OA callbacks.
 * Zalo sends: message status, follow/unfollow, inbound messages.
 * Always respond 200 with { error: 0 } to prevent retry floods.
 */
@Controller('zalo/webhook')
export class ZaloWebhookController {
  private readonly logger = new Logger(ZaloWebhookController.name);

  constructor(
    private readonly webhook: ZaloWebhookService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /zalo/webhook/:tenantId
   *
   * Zalo sends events here. Signature verification is optional but recommended.
   * Always return 200 with { error: 0 }.
   */
  @Post(':tenantId')
  @HttpCode(200)
  async handleWebhook(
    @Param('tenantId') tenantId: string,
    @Headers('x-zalo-signature') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ error: number; message: string }> {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const body = typeof req.body === 'object' ? req.body : JSON.parse(rawBody);

    // Verify signature if webhookSecret is configured
    try {
      const connection = await this.prisma.zaloOaConnection.findUnique({
        where: { tenantId },
      });
      if (
        connection?.webhookSecret &&
        signature &&
        !this.verifySignature(signature, rawBody, connection.webhookSecret)
      ) {
        this.logger.warn(`[${tenantId}] Invalid webhook signature`);
        // Still return 200 — Zalo will retry if we don't
        return { error: 0, message: 'signature_verification_failed' };
      }
    } catch {
      // No connection found — that's OK, process anyway
    }

    // Process event
    await this.webhook.handleEvent(tenantId, body);

    return { error: 0, message: 'ok' };
  }

  /** Fallback route without tenantId (legacy Zalo configs) */
  @Post()
  @HttpCode(200)
  async handleLegacyWebhook(
    @Headers('x-zalo-signature') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ error: number; message: string }> {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const body = typeof req.body === 'object' ? req.body : JSON.parse(rawBody);

    // Try to resolve tenant from app_id in payload
    const appId = body.app_id;
    let tenantId: string | null = null;
    if (appId) {
      const connection = await this.prisma.zaloOaConnection.findFirst({
        where: { appId },
      });
      if (connection) tenantId = connection.tenantId;
    }

    await this.webhook.handleEvent(tenantId, body);
    return { error: 0, message: 'ok' };
  }

  /** Simple HMAC-SHA256 signature verification */
  private verifySignature(
    signature: string,
    rawBody: string,
    secret: string,
  ): boolean {
    const crypto = require('crypto');
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
}

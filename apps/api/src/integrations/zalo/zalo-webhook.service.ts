import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ZaloZnsService } from './zalo-zns.service';
import type { ZaloWebhookPayload, ZaloWebhookEventType } from './zalo.types';

/**
 * Handles incoming webhook events from Zalo OA.
 * Routes events to appropriate handlers: delivery status, follow/unfollow, etc.
 */
@Injectable()
export class ZaloWebhookService {
  private readonly logger = new Logger(ZaloWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly zns: ZaloZnsService,
  ) {}

  /**
   * Process an incoming Zalo webhook event.
   * Always returns 200 to Zalo to prevent retry spam.
   */
  async handleEvent(
    tenantId: string | null,
    body: ZaloWebhookPayload,
  ): Promise<{ processed: boolean; eventName: string }> {
    const eventName = body.event_name;
    this.logger.debug(`Webhook event: ${eventName} for tenant ${tenantId}`);

    // Persist raw event to DB
    const connectionId = tenantId
      ? (await this.prisma.zaloOaConnection.findUnique({ where: { tenantId } }))?.id ?? null
      : null;

    const eventRecord = await this.prisma.zaloWebhookEvent.create({
      data: {
        connectionId,
        tenantId,
        eventName,
        payload: body as any,
        processed: false,
        receivedAt: new Date(body.timestamp || Date.now()),
      },
    });

    // Route to handler
    try {
      await this.routeEvent(tenantId, eventName as ZaloWebhookEventType, body);

      await this.prisma.zaloWebhookEvent.update({
        where: { id: eventRecord.id },
        data: { processed: true, processedAt: new Date() },
      });

      return { processed: true, eventName };
    } catch (err: any) {
      this.logger.error(
        `[${tenantId}] Webhook ${eventName} processing failed: ${err.message}`,
      );
      await this.prisma.zaloWebhookEvent.update({
        where: { id: eventRecord.id },
        data: { error: err.message },
      });
      return { processed: false, eventName };
    }
  }

  /** Route events to specific handlers */
  private async routeEvent(
    tenantId: string | null,
    eventName: ZaloWebhookEventType,
    payload: ZaloWebhookPayload,
  ): Promise<void> {
    switch (eventName) {
      case 'message_status':
        await this.handleMessageStatus(payload);
        break;

      case 'follow':
        this.logger.log(`[${tenantId}] User ${payload.sender.id} followed OA`);
        // Future: trigger welcome workflow
        break;

      case 'unfollow':
        this.logger.log(`[${tenantId}] User ${payload.sender.id} unfollowed OA`);
        // Future: mark user inactive
        break;

      case 'user_send_text':
        this.logger.debug(
          `[${tenantId}] Inbound text from ${payload.sender.id}: ${payload.message?.text?.substring(0, 100)}`,
        );
        // Future: AI auto-reply, store as inbound message
        break;

      case 'user_send_image':
      case 'user_send_file':
      case 'user_send_location':
      case 'user_send_sticker':
      case 'user_send_link':
        this.logger.debug(`[${tenantId}] Inbound ${eventName} from ${payload.sender.id}`);
        // Future: store as inbound media message
        break;

      default:
        this.logger.warn(`[${tenantId}] Unhandled webhook event: ${eventName}`);
    }
  }

  /** Update delivery/read receipt for previously sent messages */
  private async handleMessageStatus(payload: ZaloWebhookPayload): Promise<void> {
    const msgId = payload.message?.msg_id;
    if (!msgId) return;

    await this.zns.updateMessageStatus(msgId, 'message_status', payload);
  }
}

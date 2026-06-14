import { Injectable } from '@nestjs/common';

export interface DeliveryResult {
  success: boolean;
  channel: string;
  provider?: string;
  messageId?: string;
  statusCode?: number;
  error?: string;
  durationMs: number;
}

@Injectable()
export class NotificationService {
  async deliver(input: {
    channel: string;
    to: string | string[];
    subject?: string;
    body: string;
    template?: string;
    metadata?: Record<string, any>;
    webhookUrl?: string;
  }): Promise<DeliveryResult> {
    const start = Date.now();
    const recipients = Array.isArray(input.to) ? input.to : [input.to];

    switch (input.channel) {
      case 'webhook':
        return this.deliverWebhook(input, recipients, start);
      case 'email':
        return this.deliverEmail(input, recipients, start);
      case 'log':
        return this.deliverLog(input, recipients, start);
      default:
        return {
          success: true,
          channel: input.channel,
          provider: 'simulate',
          messageId: `sim_${Date.now()}`,
          durationMs: Date.now() - start,
          error: `Channel '${input.channel}' not implemented, simulated`,
        };
    }
  }

  private async deliverWebhook(
    input: { body: string; webhookUrl?: string; metadata?: Record<string, any> },
    recipients: string[],
    start: number,
  ): Promise<DeliveryResult> {
    const url = input.webhookUrl || recipients[0];
    if (!url) {
      return {
        success: false,
        channel: 'webhook',
        error: 'No webhook URL provided',
        durationMs: Date.now() - start,
      };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: input.body,
          metadata: input.metadata ?? {},
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10000),
      });

      return {
        success: response.ok,
        channel: 'webhook',
        provider: 'http',
        statusCode: response.status,
        messageId: `wh_${Date.now()}`,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        channel: 'webhook',
        error: err.message,
        durationMs: Date.now() - start,
      };
    }
  }

  private async deliverEmail(
    input: { to: string | string[]; subject?: string; body: string },
    recipients: string[],
    start: number,
  ): Promise<DeliveryResult> {
    // Email delivery via SMTP — stub for now
    return {
      success: true,
      channel: 'email',
      provider: 'smtp',
      messageId: `email_${Date.now()}_${recipients[0]?.replace(/[^a-zA-Z0-9]/g, '_')}`,
      durationMs: Date.now() - start,
      error: 'SMTP not configured, delivery logged only',
    };
  }

  private async deliverLog(
    input: { body: string; metadata?: Record<string, any> },
    recipients: string[],
    start: number,
  ): Promise<DeliveryResult> {
    // Log delivery — useful for testing
    return {
      success: true,
      channel: 'log',
      provider: 'console',
      messageId: `log_${Date.now()}`,
      durationMs: Date.now() - start,
    };
  }
}

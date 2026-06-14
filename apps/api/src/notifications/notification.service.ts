import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { renderInline } from './notification-template.service';
import * as nodemailer from 'nodemailer';

export interface DeliveryResult {
  success: boolean;
  channel: string;
  provider?: string;
  messageId?: string;
  statusCode?: number;
  error?: string;
  durationMs: number;
}

export interface NotifInput {
  tenantId: string;
  channel: string;
  to: string | string[];
  subject?: string;
  body: string;
  template?: string;          // template key from NotificationTemplate
  templateData?: Record<string, any>;
  metadata?: Record<string, any>;
  webhookUrl?: string;
  executionId?: string;
  executionStepId?: string;
}

// ---------- SMTP helper ----------
function getSmtpTransport() {
  const host = process.env.SMTP_HOST || 'localhost';
  const port = parseInt(process.env.SMTP_PORT || '1025', 10);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const secure = process.env.SMTP_SECURE === 'true';
  if (!host || host === 'localhost') return null;
  return nodemailer.createTransport({
    host, port, secure,
    auth: user ? { user, pass } : undefined,
  });
}
const DEFAULT_FROM = process.env.SMTP_FROM || 'noreply@aifut.dev';

// ---------- Zalo OA helper ----------
interface ZaloTokenCache {
  accessToken: string;
  expiresAt: number;
}
let zaloTokenCache: ZaloTokenCache | null = null;

async function getZaloAccessToken(): Promise<string> {
  const now = Date.now();
  if (zaloTokenCache && zaloTokenCache.expiresAt > now) {
    return zaloTokenCache.accessToken;
  }
  const appId = process.env.ZALO_APP_ID;
  const secret = process.env.ZALO_APP_SECRET;
  const refreshToken = process.env.ZALO_REFRESH_TOKEN;
  if (!appId || !secret || !refreshToken) {
    throw new Error('Zalo OA not configured (ZALO_APP_ID, ZALO_APP_SECRET, ZALO_REFRESH_TOKEN)');
  }
  const res = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      app_id: appId,
      secret_key: secret,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json() as any;
  if (!json.access_token) {
    throw new Error(`Zalo token refresh failed: ${JSON.stringify(json)}`);
  }
  zaloTokenCache = {
    accessToken: json.access_token,
    expiresAt: now + (json.expires_in || 3600) * 1000 - 60000,
  };
  return zaloTokenCache.accessToken;
}

// ---------- SMS provider helper ----------
function getSmsTransport() {
  // Placeholder for Twilio / Vonage / SMS gateway
  const provider = process.env.SMS_PROVIDER || 'none';
  return {
    provider,
    accountSid: process.env.SMS_ACCOUNT_SID,
    authToken: process.env.SMS_AUTH_TOKEN,
    fromNumber: process.env.SMS_FROM_NUMBER,
  };
}

// ---------- Body render: supports text, html, markdown ----------
function renderBody(body: string, format: string): string {
  if (format === 'markdown') {
    // Simple Markdown → HTML conversion (headings, bold, lists, links)
    return body
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<[hou])/m, '<p>')
      .replace(/$/, '</p>');
  }
  if (format === 'html') return body;
  return body; // plain text
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async deliver(input: NotifInput): Promise<DeliveryResult> {
    const start = Date.now();
    const recipients = Array.isArray(input.to) ? input.to : [input.to];

    // Resolve template from DB if a template key is given
    let body = input.body;
    let finalSubject = input.subject;
    let format = 'text';

    if (input.template) {
      try {
        const tpl = await this.prisma.notificationTemplate.findUnique({
          where: { tenantId_key: { tenantId: input.tenantId, key: input.template } },
        });
        if (tpl) {
          const data = input.templateData ?? {};
          body = renderInline(tpl.bodyTemplate, data);
          if (tpl.subjectTemplate) {
            finalSubject = renderInline(tpl.subjectTemplate, data);
          }
          format = tpl.format;
        }
      } catch {
        // Template not found; fall back to input.body
      }
    } else if (input.templateData) {
      body = renderInline(body, input.templateData);
    }

    // Render body per format
    const renderedBody = renderBody(body, format);

    let result: DeliveryResult;

    switch (input.channel) {
      case 'webhook':
        result = await this.deliverWebhook(input, recipients, start, renderedBody);
        break;
      case 'email':
        result = await this.deliverEmail(input, recipients, start, renderedBody, finalSubject, format);
        break;
      case 'zalo':
        result = await this.deliverZalo(input, recipients, start, body);
        break;
      case 'sms':
        result = await this.deliverSms(input, recipients, start, body);
        break;
      case 'log':
        result = await this.deliverLog(input, recipients, start, renderedBody);
        break;
      default:
        result = {
          success: true,
          channel: input.channel,
          provider: 'simulate',
          messageId: `sim_${Date.now()}`,
          durationMs: Date.now() - start,
          error: `Channel '${input.channel}' not implemented, simulated`,
        };
    }

    // Persist delivery log
    this.persistLog(input, recipients, renderedBody, result, finalSubject).catch(
      (err) => console.error('[Notif] Failed to persist delivery log:', err.message),
    );

    return result;
  }

  // ---------- Webhook ----------
  private async deliverWebhook(
    input: NotifInput,
    _recipients: string[],
    start: number,
    body: string,
  ): Promise<DeliveryResult> {
    const url = input.webhookUrl || _recipients[0];
    if (!url) {
      return { success: false, channel: 'webhook', error: 'No webhook URL', durationMs: Date.now() - start };
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: body,
          metadata: input.metadata ?? {},
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10000),
      });
      return {
        success: res.ok, channel: 'webhook', provider: 'http',
        statusCode: res.status, messageId: `wh_${Date.now()}`,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return { success: false, channel: 'webhook', error: err.message, durationMs: Date.now() - start };
    }
  }

  // ---------- Email ----------
  private async deliverEmail(
    input: NotifInput,
    recipients: string[],
    start: number,
    body: string,
    subject?: string,
    format?: string,
  ): Promise<DeliveryResult> {
    const transport = getSmtpTransport();
    if (!transport) {
      return {
        success: true, channel: 'email', provider: 'smtp',
        messageId: `email_${Date.now()}_${recipients[0]?.replace(/[^a-zA-Z0-9]/g, '_')}`,
        durationMs: Date.now() - start,
        error: 'SMTP not configured, delivery logged only',
      };
    }
    try {
      const mailOpts: any = {
        from: DEFAULT_FROM,
        to: recipients.join(', '),
        subject: subject || input.subject || '(No subject)',
      };
      if (format === 'html' || format === 'markdown') {
        mailOpts.html = body;
        mailOpts.text = body.replace(/<[^>]*>/g, '');
      } else {
        mailOpts.text = body;
      }
      const info = await transport.sendMail(mailOpts);
      return { success: true, channel: 'email', provider: 'smtp', messageId: info.messageId, durationMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, channel: 'email', error: err.message, durationMs: Date.now() - start };
    }
  }

  // ---------- Zalo OA ----------
  private async deliverZalo(
    input: NotifInput,
    recipients: string[],
    start: number,
    body: string,
  ): Promise<DeliveryResult> {
    const userId = recipients[0];
    if (!userId) {
      return { success: false, channel: 'zalo', error: 'No Zalo user ID', durationMs: Date.now() - start };
    }
    try {
      const accessToken = await getZaloAccessToken();
      const res = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: accessToken,
        },
        body: JSON.stringify({
          recipient: { user_id: userId },
          message: {
            text: body.substring(0, 2000), // Zalo limit
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
      const json = await res.json() as any;
      return {
        success: json.error === 0,
        channel: 'zalo',
        provider: 'zalo-oa',
        messageId: json.data?.message_id ?? `zalo_${Date.now()}`,
        statusCode: res.status,
        error: json.error !== 0 ? JSON.stringify(json) : undefined,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false, channel: 'zalo', provider: 'zalo-oa',
        error: err.message, durationMs: Date.now() - start,
      };
    }
  }

  // ---------- SMS ----------
  private async deliverSms(
    input: NotifInput,
    recipients: string[],
    start: number,
    body: string,
  ): Promise<DeliveryResult> {
    const config = getSmsTransport();
    if (config.provider === 'none') {
      return {
        success: true, channel: 'sms', provider: 'log',
        messageId: `sms_${Date.now()}`,
        durationMs: Date.now() - start,
        error: 'SMS provider not configured, delivery logged only',
      };
    }
    // Generic HTTP SMS gateway integration
    try {
      const gatewayUrl = process.env.SMS_GATEWAY_URL;
      if (gatewayUrl) {
        const res = await fetch(gatewayUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: recipients.join(','),
            from: config.fromNumber || 'AIFUT',
            text: body.substring(0, 160),
            accountSid: config.accountSid,
            authToken: config.authToken,
          }),
          signal: AbortSignal.timeout(10000),
        });
        return {
          success: res.ok, channel: 'sms', provider: 'http-gateway',
          statusCode: res.status, messageId: `sms_${Date.now()}`,
          durationMs: Date.now() - start,
        };
      }
      // Log-only fallback
      return {
        success: true, channel: 'sms', provider: 'log',
        messageId: `sms_${Date.now()}`,
        durationMs: Date.now() - start,
        error: 'SMS gateway URL not configured, delivery logged only',
      };
    } catch (err: any) {
      return { success: false, channel: 'sms', error: err.message, durationMs: Date.now() - start };
    }
  }

  // ---------- Log ----------
  private async deliverLog(
    _input: NotifInput,
    _recipients: string[],
    start: number,
    _body: string,
  ): Promise<DeliveryResult> {
    return {
      success: true, channel: 'log', provider: 'console',
      messageId: `log_${Date.now()}`, durationMs: Date.now() - start,
    };
  }

  /** Log delivery to DB */
  private async persistLog(
    input: NotifInput,
    recipients: string[],
    body: string,
    result: DeliveryResult,
    subjectOverride?: string,
  ): Promise<void> {
    const channel = input.channel.toUpperCase();
    const validChannels = ['EMAIL', 'WEBHOOK', 'SMS', 'ZALO', 'SLACK', 'LOG'];
    await this.prisma.notificationLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.metadata?.userId ?? null,
        channel: validChannels.includes(channel) ? (channel as any) : 'LOG',
        to: recipients.join(', '),
        subject: subjectOverride ?? input.subject,
        templateKey: input.template ?? null,
        renderedBody: body,
        status: result.success ? 'SENT' : 'FAILED',
        provider: result.provider ?? null,
        providerMessageId: result.messageId ?? null,
        error: result.error ?? null,
        durationMs: result.durationMs,
        metadata: input.metadata ?? undefined,
        executionId: input.executionId ?? null,
        executionStepId: input.executionStepId ?? null,
      },
    });
  }
}

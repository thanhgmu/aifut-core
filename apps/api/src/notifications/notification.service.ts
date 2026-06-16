import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ZaloZnsService } from '../integrations/zalo/zalo-zns.service';
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

// ---------- SMS provider helper ----------
function getSmsTransport() {
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
  return body;
}

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zaloZns: ZaloZnsService,
  ) {}

  async deliver(input: NotifInput): Promise<DeliveryResult> {
    const start = Date.now();
    const recipients = Array.isArray(input.to) ? input.to : [input.to];

    // Resolve template from DB if a template key is given
    let body = input.body;
    let finalSubject = input.subject;
    let format = 'text';
    let resolvedTemplate: any = null;

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
          resolvedTemplate = tpl;
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
        result = await this.deliverZalo(input, recipients, start, body, resolvedTemplate);
        break;
      case 'sms':
        result = await this.deliverSms(input, recipients, start, body);
        break;
      case 'slack':
        result = await this.deliverSlack(input, recipients, start, body);
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

    // Retry logic for failed deliveries
    if (!result.success && input.metadata?.maxRetries != null) {
      const maxRetries = Math.min(input.metadata.maxRetries as number, 5);
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 15000);
        await new Promise((r) => setTimeout(r, backoffMs));
        const retryResult = await this.deliverOne(input, recipients, start, renderedBody, finalSubject, format);
        result = retryResult;
        if (result.success) break;
      }
    }

    // Persist delivery log
    this.persistLog(input, recipients, renderedBody, result, finalSubject).catch(
      (err) => console.error('[Notif] Failed to persist delivery log:', err.message),
    );

    return result;
  }

  private async deliverOne(
    input: NotifInput,
    recipients: string[],
    start: number,
    body: string,
    subject?: string,
    format?: string,
  ): Promise<DeliveryResult> {
    switch (input.channel) {
      case 'webhook': return this.deliverWebhook(input, recipients, Date.now(), body);
      case 'email': return this.deliverEmail(input, recipients, Date.now(), body, subject, format);
      case 'zalo': return this.deliverZalo(input, recipients, Date.now(), body, null);
      case 'sms': return this.deliverSms(input, recipients, Date.now(), body);
      case 'slack': return this.deliverSlack(input, recipients, Date.now(), body);
      default: return this.deliverLog(input, recipients, Date.now(), body);
    }
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

  // ---------- Zalo OA (delegated to ZaloZnsService) ----------
  private async deliverZalo(
    input: NotifInput,
    recipients: string[],
    start: number,
    body: string,
    resolvedTemplate?: any,
  ): Promise<DeliveryResult> {
    const userId = recipients[0];
    if (!userId) {
      return { success: false, channel: 'zalo', error: 'No Zalo user ID', durationMs: Date.now() - start };
    }

    try {
      // If we have a resolved template, try to use ZNS template messaging
      // NotificationTemplate stores the ZNS template_id in its metadata.znsTemplateId
      if (resolvedTemplate?.metadata?.znsTemplateId) {
        const templateData = input.templateData ?? {};
        const znsResult = await this.zaloZns.sendZnsTemplate(input.tenantId, {
          userId,
          templateId: resolvedTemplate.metadata.znsTemplateId,
          templateData: Object.fromEntries(
            Object.entries(templateData).map(([k, v]) => [k, String(v)]),
          ),
          language: input.metadata?.language as 'VI' | 'EN' ?? 'VI',
        });
        return {
          success: znsResult.success,
          channel: 'zalo',
          provider: 'zalo-oa',
          messageId: znsResult.providerMessageId,
          error: znsResult.error,
          durationMs: Date.now() - start,
        };
      }

      // Fallback: send as text via new ZaloZnsService
      const textResult = await this.zaloZns.sendText(input.tenantId, {
        userId,
        text: body.substring(0, 2000),
      });
      return {
        success: textResult.success,
        channel: 'zalo',
        provider: 'zalo-oa-zns',
        messageId: textResult.providerMessageId,
        error: textResult.error,
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

  // ---------- Slack ----------
  private async deliverSlack(
    input: NotifInput,
    recipients: string[],
    start: number,
    body: string,
  ): Promise<DeliveryResult> {
    const webhookUrl = input.webhookUrl || recipients[0];
    if (!webhookUrl) {
      return { success: false, channel: 'slack', error: 'No Slack webhook URL', durationMs: Date.now() - start };
    }
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: body,
          username: input.metadata?.username || 'AIFUT',
          icon_emoji: input.metadata?.icon || ':robot_face:',
          attachments: input.metadata?.attachments || undefined,
        }),
        signal: AbortSignal.timeout(10000),
      });
      return {
        success: res.ok,
        channel: 'slack',
        provider: 'slack-webhook',
        statusCode: res.status,
        messageId: `sl_${Date.now()}`,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return { success: false, channel: 'slack', error: err.message, durationMs: Date.now() - start };
    }
  }

  // ---------- Batch delivery ----------
  async deliverBatch(inputs: NotifInput[]): Promise<DeliveryResult[]> {
    const concurrency = 5;
    const results: DeliveryResult[] = [];
    for (let i = 0; i < inputs.length; i += concurrency) {
      const batch = inputs.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(batch.map((inp) => this.deliver(inp)));
      for (const r of batchResults) {
        results.push(r.status === 'fulfilled' ? r.value : {
          success: false,
          channel: 'batch',
          error: r.reason?.message ?? 'Batch delivery failed',
          durationMs: 0,
        });
      }
    }
    return results;
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

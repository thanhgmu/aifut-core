import { Injectable, BadRequestException } from '@nestjs/common';
import { AwlInterpreterService } from './workflows/awl-interpreter.service';
import { IntegrationAiDraftingService } from './integration-ai-drafting.service';
import { WorkflowService } from './workflows/workflow.service';
import { CONNECTOR_REGISTRY_FOUNDATION } from './connectors.constants';
import { AWL_VERSION } from './workflows/awl.types';
import type { AwlDocument, AwlStep } from './workflows/awl.types';

/**
 * Bridge: Natural Language → AWL → Deploy → Ready-to-Execute
 *
 * Biến câu nói tiếng Việt của người dùng thành workflow thực sự trên production.
 * Dùng rule engine + template matching để generate AWL document từ NL intent,
 * sau đó deploy qua AwlInterpreterService và trả về ready-to-execute.
 */
@Injectable()
export class IntegrationAwlGeneratorService {
  constructor(
    private readonly awl: AwlInterpreterService,
    private readonly aiDrafting: IntegrationAiDraftingService,
    private readonly workflow: WorkflowService,
  ) {}

  /**
   * NL prompt → AWL document → Deploy → Trả về workflow ready
   */
  async nlDeploy(params: {
    tenantId: string;
    prompt: string;
    connectorKey?: string;
    workspaceId?: string;
    workflowKey?: string;
  }) {
    const { tenantId, prompt, connectorKey } = params;

    // Phân tích NL intent → xác định pattern
    const normalized = this.normalize(prompt);
    const pattern = this.detectPattern(normalized, connectorKey, prompt);
    const connector = connectorKey
      ? CONNECTOR_REGISTRY_FOUNDATION.find((c) => c.key === connectorKey)
      : null;

    // Kiểm tra input
    if (!prompt?.trim()) {
      throw new BadRequestException('Missing prompt.');
    }

    // Sinh AWL document từ pattern + connector
    const awlDoc = this.buildAwlDocument({
      prompt,
      normalized,
      pattern,
      connectorKey: connector?.key ?? 'generic-rest',
      connectorName: connector?.name ?? 'Generic REST',
      workflowKey: params.workflowKey ?? this.slugify(`nl-${Date.now()}`),
    });

    // Validate AWL
    const validation = this.awl.validate(awlDoc);
    if (!validation.valid) {
      throw new BadRequestException(
        `Generated AWL is invalid: ${validation.errors.join('; ')}`,
      );
    }

    // Deploy → WorkflowTemplate thực sự
    const deployed = await this.awl.deploy(tenantId, awlDoc);

    // Trả về ready-to-execute
    return {
      capability: 'integrations',
      surface: 'nl-deploy',
      status: 'deployed',
      workflow: {
        key: awlDoc.workflow,
        name: awlDoc.name,
        steps: awlDoc.steps.length,
        trigger: awlDoc.trigger,
      },
      deployResult: deployed,
      executeEndpoint: `POST /workflows/templates/${awlDoc.workflow}/execute`,
      executeExample: {
        tenantSlug: params.tenantId,
        workflowKey: awlDoc.workflow,
        description: 'Gọi endpoint này để chạy workflow. Có thể truyền payload qua body.',
      },
      managementEndpoints: {
        view: `GET /workflows/templates/${awlDoc.workflow}`,
        execute: `POST /workflows/templates/${awlDoc.workflow}/execute`,
        executions: `GET /workflows/executions?workflowKey=${awlDoc.workflow}`,
      },
      exportedAwl: awlDoc,
      next: [`execute-workflow-${awlDoc.workflow}`, 'monitor-executions', 'add-credentials'],
    };
  }

  // ── Pattern detection ──────────────────────────────────────────────────────

  /**
   * Detect workflow pattern từ NL prompt
   * Dùng keyword matching + connector context
   */
  private detectPattern(
    normalized: string,
    connectorKey?: string,
    originalPrompt?: string,
  ): DetectedPattern {
    // 1. Xác định channel/target
    const hasZalo = normalized.includes('zalo');
    const hasEmail = normalized.includes('email') || normalized.includes('mail');
    const hasSms = normalized.includes('sms') || normalized.includes('tin nhan');
    const hasSlack = normalized.includes('slack');
    const hasWebhook = normalized.includes('webhook') || normalized.includes('http');
    const hasNotif = hasZalo || hasEmail || hasSms || hasSlack || hasWebhook;

    // 2. Xác định trigger
    const hasOrder = normalized.includes('don') || normalized.includes('order') || normalized.includes('don hang');
    const hasBooking = normalized.includes('dat lich') || normalized.includes('booking') || normalized.includes('hen');
    const hasSchedule = normalized.includes('hang ngay') || normalized.includes('hang tuan') || normalized.includes('sang') || normalized.includes('toi');
    const hasLead = normalized.includes('lead') || normalized.includes('khach hang') || normalized.includes('khach moi');
    const hasInvoice = normalized.includes('hoa don') || normalized.includes('invoice');

    // 3. Xác định reminder pattern
    const isReminder = normalized.includes('nhac') || normalized.includes('remind') || normalized.includes('nho');
    const isConfirm = normalized.includes('xac nhan') || normalized.includes('confirm') || normalized.includes('thong bao');
    const isAutoReply = normalized.includes('tu dong') && hasNotif;

    // Build workflow
    const steps: AwlStep[] = [];
    const trigger: { kind: 'manual' | 'event' | 'schedule' | 'webhook'; config?: any } = {
      kind: 'manual',
    };

    // Chọn channel
    let channel = 'log';
    if (hasZalo) channel = 'zalo';
    else if (hasEmail) channel = 'email';
    else if (hasSms) channel = 'sms';
    else if (hasSlack) channel = 'slack';
    else if (hasWebhook) channel = 'webhook';

    // Xác định tên workflow
    let name = 'Workflow từ NL';
    let industry: string | undefined;
    let category: string | undefined;

    if (isReminder && hasBooking) {
      name = 'Nhắc lịch hẹn tự động';
      industry = 'spa';
      category = 'messaging';
      trigger.kind = 'schedule';
      trigger.config = { cron: '0 8 * * *' };
      steps.push({
        id: 'check-upcoming-bookings',
        name: 'Kiểm tra lịch hẹn sắp tới',
        type: 'action',
        config: { action: 'query-upcoming', days: 1 },
      });
      if (hasZalo) {
        steps.push({
          id: 'send-zalo-reminder',
          name: `Gửi Zalo nhắc lịch hẹn`,
          type: 'send',
          config: { channel: 'zalo', template: 'booking_reminder_vi', to: '{{customer.phone}}' },
          depends_on: ['check-upcoming-bookings'],
        });
      } else {
        steps.push({
          id: 'send-reminder',
          name: `Gửi nhắc nhở qua ${channel}`,
          type: 'send',
          config: { channel, template: 'reminder_template', to: '{{customer.contact}}' },
          depends_on: ['check-upcoming-bookings'],
        });
      }
    } else if ((isConfirm || isAutoReply) && (hasOrder || hasBooking)) {
      name = `Xác nhận tự động qua ${channel}`;
      industry = 'f-and-b';
      category = 'messaging';
      trigger.kind = 'event';
      trigger.config = { event: hasOrder ? 'order.created' : 'booking.created' };
      steps.push({
        id: `send-${channel}-confirm`,
        name: `Gửi xác nhận qua ${channel}`,
        type: 'send',
        config: {
          channel,
          template: hasOrder ? 'order_confirm_vi' : 'booking_confirm_vi',
          to: '{{customer.phone}}',
          subject: hasEmail ? 'Xác nhận đơn hàng' : undefined,
        },
      });
    } else if (hasOrder) {
      name = 'Xử lý đơn hàng mới';
      industry = 'ecommerce';
      category = 'commerce';
      trigger.kind = 'event';
      trigger.config = { event: 'order.created' };
      if (hasNotif) {
        steps.push({
          id: `notify-order-${channel}`,
          name: `Thông báo đơn hàng qua ${channel}`,
          type: 'send',
          config: { channel, template: 'new_order_vi', to: '{{customer.phone}}' },
        });
      }
      // Nếu có webhook thì thêm action webhook
      if (hasWebhook || connectorKey === 'generic-rest' || connectorKey === 'perfex') {
        steps.push({
          id: 'sync-order',
          name: 'Đồng bộ đơn hàng',
          type: 'action',
          config: { action: 'sync-order', connector: connectorKey ?? 'generic-rest' },
          depends_on: steps.length > 0 ? [steps[steps.length - 1].id] : undefined,
        });
      }
    } else if (isReminder) {
      name = 'Nhắc nhở tự động';
      industry = 'general';
      category = 'messaging';
      trigger.kind = 'schedule';
      trigger.config = { cron: '0 9 * * 1-5' };
      steps.push({
        id: 'check-status',
        name: 'Kiểm tra trạng thái',
        type: 'action',
        config: { action: 'query-status' },
      });
      steps.push({
        id: `send-${channel}-notif`,
        name: `Gửi thông báo qua ${channel}`,
        type: 'send',
        config: { channel, template: 'status_reminder_vi', to: '{{recipient}}' },
        depends_on: ['check-status'],
      });
    } else if (hasLead) {
      name = 'Xử lý lead mới';
      industry = 'crm';
      category = 'crm';
      trigger.kind = 'event';
      trigger.config = { event: 'lead.created' };
      if (hasNotif) {
        steps.push({
          id: `notify-lead-${channel}`,
          name: `Thông báo lead qua ${channel}`,
          type: 'send',
          config: { channel, template: 'new_lead_vi', to: '{{assignee.email}}' },
        });
      }
      steps.push({
        id: 'create-task',
        name: 'Tạo task follow-up',
        type: 'action',
        config: { action: 'create-followup-task' },
        depends_on: hasNotif ? [steps[0].id] : undefined,
      });
    } else {
      // Default: workflow đơn giản với action + notification
      const shortPrompt = originalPrompt ?? normalized;
      name = `Workflow: ${shortPrompt.length > 60 ? shortPrompt.substring(0, 60) + '...' : shortPrompt}`;
      if (hasNotif) {
        steps.push({
          id: `send-${channel}-message`,
          name: `Gửi tin qua ${channel}`,
          type: 'send',
          config: { channel, template: 'default_template', to: '{{recipient}}' },
        });
      }
      steps.push({
        id: 'complete-action',
        name: 'Hoàn tất xử lý',
        type: 'action',
        config: { action: 'complete' },
        depends_on: hasNotif ? [steps[0].id] : undefined,
      });
    }

    return { steps, trigger, name, industry, category, channel };
  }

  private buildAwlDocument(input: {
    prompt: string;
    normalized: string;
    pattern: DetectedPattern;
    connectorKey: string;
    connectorName: string;
    workflowKey: string;
  }): AwlDocument {
    const { pattern, connectorKey, connectorName, workflowKey } = input;
    const doc: AwlDocument = {
      awl: AWL_VERSION,
      workflow: workflowKey,
      name: pattern.name,
      description: `Tự động sinh từ: "${input.prompt.substring(0, 200)}" — connector: ${connectorName} (${connectorKey})`,
      category: pattern.category ?? 'custom',
      industry: pattern.industry,
      trigger: pattern.trigger,
      steps: pattern.steps,
    };

    // Thêm step kết thúc nếu pattern không có
    if (doc.steps.length === 0) {
      doc.steps.push({
        id: 'default-action',
        name: 'Hành động mặc định',
        type: 'action',
        config: { action: 'log', message: `Workflow executed from: ${input.prompt.substring(0, 100)}` },
      });
    }

    return doc;
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/đ/g, 'd')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 80);
  }
}

interface DetectedPattern {
  steps: AwlStep[];
  trigger: { kind: 'manual' | 'event' | 'schedule' | 'webhook'; config?: any };
  name: string;
  industry?: string;
  category?: string;
  channel: string;
}

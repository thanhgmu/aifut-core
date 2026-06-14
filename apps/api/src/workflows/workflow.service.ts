import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConnectorExecutorService } from '../connector-executor.service';
import { NotificationService } from '../notifications/notification.service';
import { WorkflowStatus, WorkflowNodeType, WorkflowTriggerKind } from '@prisma/client';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectorExecutor: ConnectorExecutorService,
    private readonly notif: NotificationService,
  ) {}

  // ── Template CRUD ──────────────────────────────────────────────────────────

  async createTemplate(input: {
    tenantId: string;
    workspaceId?: string;
    key: string;
    name: string;
    description?: string;
    category?: string;
    industry?: string;
    source?: string;
  }) {
    const existing = await this.prisma.workflowTemplate.findUnique({
      where: { tenantId_key: { tenantId: input.tenantId, key: input.key } },
    });
    if (existing) throw new ConflictException(`Template key '${input.key}' already exists`);

    return this.prisma.workflowTemplate.create({
      data: { ...input, status: 'DRAFT' },
      include: { nodes: { orderBy: { position: 'asc' } }, triggers: true },
    });
  }

  async listTemplates(tenantId: string, workspaceId?: string) {
    const where: any = { tenantId };
    if (workspaceId) where.workspaceId = workspaceId;
    return this.prisma.workflowTemplate.findMany({
      where,
      include: { nodes: { orderBy: { position: 'asc' } }, triggers: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getTemplate(tenantId: string, key: string) {
    const tpl = await this.prisma.workflowTemplate.findUnique({
      where: { tenantId_key: { tenantId, key } },
      include: { nodes: { orderBy: { position: 'asc' } }, triggers: true },
    });
    if (!tpl) throw new NotFoundException(`Template '${key}' not found`);
    return tpl;
  }

  async updateTemplate(
    tenantId: string,
    key: string,
    data: { name?: string; description?: string; status?: WorkflowStatus; category?: string; industry?: string; tags?: string[]; metadata?: any },
  ) {
    const tpl = await this.getTemplate(tenantId, key);
    return this.prisma.workflowTemplate.update({
      where: { id: tpl.id },
      data,
      include: { nodes: { orderBy: { position: 'asc' } }, triggers: true },
    });
  }

  async deleteTemplate(tenantId: string, key: string) {
    const tpl = await this.getTemplate(tenantId, key);
    await this.prisma.workflowTemplate.delete({ where: { id: tpl.id } });
    return { deleted: true };
  }

  // ── Node management ────────────────────────────────────────────────────────

  async addNode(
    tenantId: string,
    workflowKey: string,
    input: {
      key: string;
      name: string;
      nodeType: WorkflowNodeType;
      position?: number;
      config?: any;
      dependsOn?: string[];
      timeoutSeconds?: number;
      retryPolicy?: any;
    },
  ) {
    const tpl = await this.getTemplate(tenantId, workflowKey);
    return this.prisma.workflowNode.create({
      data: {
        workflowId: tpl.id,
        key: input.key,
        name: input.name,
        nodeType: input.nodeType,
        position: input.position ?? 0,
        config: input.config ?? {},
        dependsOn: input.dependsOn ?? [],
        timeoutSeconds: input.timeoutSeconds ?? 300,
        retryPolicy: input.retryPolicy ?? null,
      },
    });
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  async executeWorkflow(
    tenantId: string,
    workflowKey: string,
    input?: { triggerKind?: WorkflowTriggerKind; triggeredBy?: string; payload?: any },
  ) {
    const tpl = await this.getTemplate(tenantId, workflowKey);
    if (tpl.status !== 'ACTIVE') throw new ConflictException(`Workflow '${workflowKey}' is not active`);

    const execution = await this.prisma.workflowExecution.create({
      data: {
        workflowId: tpl.id,
        tenantId,
        triggerKind: input?.triggerKind ?? 'MANUAL',
        triggeredBy: input?.triggeredBy,
        status: 'PENDING',
        input: input?.payload ?? {},
        maxRetries: 3,
      },
    });

    // Execute steps asynchronously (inline for now; background worker later)
    this.runExecutionSteps(tpl.id, execution.id, tpl.nodes, tenantId).catch((err) => {
      console.error(`[Workflow] Execution ${execution.id} failed:`, err.message);
    });

    return execution;
  }

  private async runExecutionSteps(workflowId: string, executionId: string, nodes: any[], tenantId: string) {
    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    const sorted = nodes.sort((a: any, b: any) => a.position - b.position);

    for (const node of sorted) {
      const step = await this.prisma.workflowExecutionStep.create({
        data: {
          executionId,
          nodeId: node.id,
          nodeKey: node.key,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      try {
        const output = await this.executeNodeStep(node, executionId, tenantId);
        await this.prisma.workflowExecutionStep.update({
          where: { id: step.id },
          data: { status: 'COMPLETED', output: output ?? {}, completedAt: new Date(), durationMs: 0 },
        });
      } catch (err: any) {
        await this.prisma.workflowExecutionStep.update({
          where: { id: step.id },
          data: { status: 'FAILED', error: err.message, completedAt: new Date() },
        });
        await this.prisma.workflowExecution.update({
          where: { id: executionId },
          data: { status: 'FAILED', error: err.message, completedAt: new Date() },
        });
        return;
      }
    }

    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  private async executeNodeStep(node: any, executionId: string, tenantId: string): Promise<any> {
    switch (node.nodeType) {
      case 'SEND': {
        const ch = node.config?.channel ?? 'log';
        let notifResult;
        if (ch === 'webhook' || ch === 'email') {
          notifResult = await this.notif.deliver({
            channel: ch,
            to: node.config?.to ?? 'admin@aifut.dev',
            body: node.config?.template?.text ?? JSON.stringify(node.config?.template ?? {}),
            subject: node.config?.subject,
            webhookUrl: node.config?.webhookUrl,
          });
        } else if (node.config?.url) {
          // Connector call for SEND with explicit URL
          const connResult = await this.connectorExecutor.callConnector({
            tenantId,
            connectorSlug: node.config?.connectorSlug,
            action: node.key,
            payload: node.config?.body ?? node.config?.template ?? {},
            baseUrl: node.config.url,
            method: node.config?.method ?? 'POST',
            endpoint: node.config?.endpoint,
            headers: node.config?.headers,
          });
          notifResult = {
            success: connResult.success,
            statusCode: connResult.statusCode,
            messageId: connResult.data?.messageId,
          };
        } else {
          // Simulate for Zalo, SMS, etc.
          const sim = await this.connectorExecutor.simulateCall({
            action: 'send',
            payload: { channel: ch, ...(node.config?.template ?? {}) },
            channel: ch,
          });
          notifResult = {
            success: sim.success,
            messageId: sim.data?.messageId,
            statusCode: sim.statusCode,
          };
        }
        return {
          sent: notifResult.success,
          channel: ch,
          messageId: notifResult.messageId,
          statusCode: notifResult.statusCode,
          timestamp: new Date().toISOString(),
        };
      }
      case 'WAIT':
        // Sleep-based wait — for production: cron-based timer
        const ms = (node.config?.seconds ?? 1) * 1000;
        await new Promise((r) => setTimeout(r, Math.min(ms, 10000))); // cap at 10s
        return { waitedMs: ms };
      case 'TRANSFORM':
        return { transformed: true, result: node.config?.mapping ?? null };
      case 'CONDITION':
        return { evaluated: true, pass: true };
      case 'TRIGGER':
        return { triggered: true };
      case 'ACTION': {
        // Real connector execution for ACTION steps
        const { url, method, endpoint, headers, body, connectorSlug } = node.config ?? {};
        if (url || connectorSlug) {
          const result = await this.connectorExecutor.callConnector({
            tenantId,
            connectorSlug,
            action: node.key,
            payload: body ?? {},
            baseUrl: url,
            method: method ?? 'POST',
            endpoint,
            headers,
          });
          return {
            executed: result.success,
            statusCode: result.statusCode,
            data: result.data,
            error: result.error,
            durationMs: result.durationMs,
          };
        }
        return { executed: true, action: node.config?.action ?? 'default' };
      }
      default:
        return { executed: true, action: node.config?.action ?? 'default' };
    }
  }

  async listExecutions(tenantId: string, workflowKey?: string, limit = 20) {
    const where: any = { tenantId };
    if (workflowKey) {
      const tpl = await this.prisma.workflowTemplate.findUnique({
        where: { tenantId_key: { tenantId, key: workflowKey } },
      });
      if (tpl) where.workflowId = tpl.id;
    }
    return this.prisma.workflowExecution.findMany({
      where,
      include: { steps: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getExecution(executionId: string) {
    const exec = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: { steps: { orderBy: { createdAt: 'asc' } } },
    });
    if (!exec) throw new NotFoundException(`Execution '${executionId}' not found`);
    return exec;
  }
}

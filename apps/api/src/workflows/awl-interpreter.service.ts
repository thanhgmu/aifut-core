import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WorkflowService } from './workflow.service';
import { AwlDocument, AwlStep, AWL_VERSION } from './awl.types';

@Injectable()
export class AwlInterpreterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
  ) {}

  /** Validate AWL document */
  validate(doc: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!doc || typeof doc !== 'object') return { valid: false, errors: ['Invalid AWL document'] };
    if (doc.awl !== AWL_VERSION) errors.push(`Unsupported AWL version: ${doc.awl}`);
    if (!doc.workflow) errors.push('Missing workflow key');
    if (!doc.name) errors.push('Missing workflow name');
    if (!doc.steps || !Array.isArray(doc.steps) || doc.steps.length === 0) errors.push('At least one step required');
    if (doc.steps) {
      const ids = doc.steps.map((s: any) => s.id).filter(Boolean);
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) errors.push('Duplicate step IDs detected');
    }
    return { valid: errors.length === 0, errors };
  }

  /** Convert AWL → WorkflowTemplate + nodes (persist to DB) */
  async deploy(tenantId: string, doc: AwlDocument) {
    const validation = this.validate(doc);
    if (!validation.valid) throw new BadRequestException(`AWL validation failed: ${validation.errors.join('; ')}`);

    // Create template
    const tpl = await this.workflow.createTemplate({
      tenantId,
      key: doc.workflow,
      name: doc.name,
      description: doc.description,
      category: doc.category,
      industry: doc.industry,
      source: 'awl',
    });

    // Create nodes from steps
    for (let i = 0; i < doc.steps.length; i++) {
      const step = doc.steps[i];
      const nodeType = this.stepTypeToNodeType(step.type);
      await this.workflow.addNode(tenantId, doc.workflow, {
        key: step.id,
        name: step.name,
        nodeType: nodeType as any,
        position: i,
        config: step.config ?? {},
        dependsOn: step.depends_on ?? [],
        timeoutSeconds: step.timeout ?? 300,
        retryPolicy: step.retry ? { maxRetries: step.retry.max ?? 3, delay: step.retry.delay ?? 1000 } : undefined,
      });
    }

    // Auto-activate
    const activated = await this.workflow.updateTemplate(tenantId, doc.workflow, {
      status: 'ACTIVE' as any,
    });

    return {
      deployed: true,
      workflow: doc.workflow,
      nodes: doc.steps.length,
      version: AWL_VERSION,
      template: activated,
    };
  }

  /** Execute an AWL document directly (without persisting) */
  async executeDirect(tenantId: string, doc: AwlDocument, payload?: any) {
    const validation = this.validate(doc);
    if (!validation.valid) throw new BadRequestException(`AWL validation failed: ${validation.errors.join('; ')}`);

    // Deploy first, then execute
    const deployed = await this.deploy(tenantId, doc);
    const execution = await this.workflow.executeWorkflow(tenantId, doc.workflow, {
      triggerKind: (doc.trigger?.kind ?? 'MANUAL') as any,
      triggeredBy: 'awl',
      payload,
    });

    return { execution: { id: execution.id, status: execution.status }, ...deployed };
  }

  /** Convert step types to workflow node types */
  private stepTypeToNodeType(stepType: string): string {
    const map: Record<string, string> = {
      action: 'ACTION',
      send: 'SEND',
      condition: 'CONDITION',
      wait: 'WAIT',
      transform: 'TRANSFORM',
      loop: 'ACTION',
      subflow: 'SUB_WORKFLOW',
    };
    return map[stepType] ?? 'ACTION';
  }

  /** Convert a deployed template back to AWL document */
  async exportToAwl(tenantId: string, workflowKey: string): Promise<AwlDocument> {
    const tpl = await this.workflow.getTemplate(tenantId, workflowKey);
    if (!tpl) throw new BadRequestException(`Workflow '${workflowKey}' not found`);

    return {
      awl: AWL_VERSION,
      workflow: tpl.key,
      name: tpl.name,
      description: tpl.description ?? undefined,
      category: tpl.category ?? undefined,
      industry: tpl.industry ?? undefined,
      steps: tpl.nodes.map((node: any, i: number) => ({
        id: node.key,
        name: node.name,
        type: this.nodeTypeToStepType(node.nodeType),
        config: node.config ?? undefined,
        depends_on: node.dependsOn?.length ? node.dependsOn : undefined,
        timeout: node.timeoutSeconds !== 300 ? node.timeoutSeconds : undefined,
      })),
    };
  }

  private nodeTypeToStepType(nodeType: string): AwlStep['type'] {
    const map: Record<string, string> = {
      ACTION: 'action',
      SEND: 'send',
      CONDITION: 'condition',
      WAIT: 'wait',
      TRANSFORM: 'transform',
      TRIGGER: 'action',
      SUB_WORKFLOW: 'subflow',
    };
    return (map[nodeType] ?? 'action') as AwlStep['type'];
  }
}

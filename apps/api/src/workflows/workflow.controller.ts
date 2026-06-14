import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WorkflowService } from './workflow.service';
import { AwlInterpreterService } from './awl-interpreter.service';
import { IndustryTemplatesService } from './industry-templates.service';
import { WORKFLOW_FOUNDATION_ROADMAP } from './workflow.constants';

@Controller('workflows')
export class WorkflowController {
  constructor(
    private readonly workflow: WorkflowService,
    private readonly prisma: PrismaService,
    private readonly awl: AwlInterpreterService,
    private readonly industryTemplates: IndustryTemplatesService,
  ) {}

  // ── Template CRUD ──────────────────────────────────────────────────────────

  private async resolveTenantId(tenantSlug: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new NotFoundException(`Tenant '${tenantSlug}' not found`);
    return tenant.id;
  }

  @Post('templates')
  async createTemplate(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Body()
    body: {
      key: string;
      name: string;
      description?: string;
      category?: string;
      industry?: string;
      workspaceId?: string;
      source?: string;
    },
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.workflow.createTemplate({
      tenantId,
      workspaceId: body.workspaceId,
      key: body.key,
      name: body.name,
      description: body.description,
      category: body.category,
      industry: body.industry,
      source: body.source,
    });
  }

  @Get('templates')
  async listTemplates(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.workflow.listTemplates(tenantId, workspaceId);
  }

  @Get('templates/:key')
  async getTemplate(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Param('key') key: string,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.workflow.getTemplate(tenantId, key);
  }

  @Put('templates/:key')
  async updateTemplate(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Param('key') key: string,
    @Body() body: any,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.workflow.updateTemplate(tenantId, key, body);
  }

  @Delete('templates/:key')
  async deleteTemplate(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Param('key') key: string,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.workflow.deleteTemplate(tenantId, key);
  }

  // ── Node management ────────────────────────────────────────────────────────

  @Post('templates/:key/nodes')
  async addNode(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Param('key') key: string,
    @Body() body: any,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.workflow.addNode(tenantId, key, body);
  }

  // ── AWL (AIFUT Workflow Language) ──────────────────────────────────────────

  @Post('awl/deploy')
  async awlDeploy(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Body() body: any,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.awl.deploy(tenantId, body);
  }

  @Post('awl/execute')
  async awlExecute(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Body() body: { document: any; payload?: any },
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.awl.executeDirect(tenantId, body.document, body.payload);
  }

  @Post('awl/validate')
  awlValidate(@Body() body: any) {
    return this.awl.validate(body);
  }

  @Get('templates/:key/export')
  async exportAwl(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Param('key') key: string,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.awl.exportToAwl(tenantId, key);
  }

  @Post('templates/seed')
  async seedTemplates(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Query('industry') industry?: string,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    const templates = industry
      ? this.industryTemplates.getByIndustry(industry)
      : this.industryTemplates.getAll();
    const results: Array<{ slug: string; name: string; status: string; error?: string }> = [];
    for (const tpl of templates) {
      try {
        const result = await this.awl.deploy(tenantId, tpl.document);
        results.push({ slug: tpl.slug, name: tpl.name, status: 'deployed' });
      } catch (e: any) {
        results.push({ slug: tpl.slug, name: tpl.name, status: 'skipped', error: e.message });
      }
    }
    return { seeded: results.length, results };
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  @Post('templates/:key/execute')
  async execute(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Param('key') key: string,
    @Body() body: { payload?: any; triggeredBy?: string },
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.workflow.executeWorkflow(tenantId, key, {
      triggerKind: 'MANUAL',
      triggeredBy: body.triggeredBy,
      payload: body.payload,
    });
  }

  @Get('executions')
  async listExecutions(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Query('workflowKey') workflowKey?: string,
    @Query('limit') limit?: number,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.workflow.listExecutions(tenantId, workflowKey, limit ?? 20);
  }

  @Get('executions/:id')
  async getExecution(@Param('id') id: string) {
    return this.workflow.getExecution(id);
  }

  // ── Capabilities ───────────────────────────────────────────────────────────

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'workflows',
      status: 'foundation',
      supports: {
        templateCrud: true,
        nodeManagement: true,
        manualExecution: true,
        stepTracking: true,
        basicNodeTypes: ['TRIGGER', 'ACTION', 'CONDITION', 'WAIT', 'SEND', 'TRANSFORM'],
      },
      next: WORKFLOW_FOUNDATION_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return { capability: 'workflows', roadmap: WORKFLOW_FOUNDATION_ROADMAP };
  }
}

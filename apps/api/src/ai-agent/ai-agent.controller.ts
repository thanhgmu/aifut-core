import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AiAgentCoreService } from './ai-agent-core.service';
import { AiAgentSessionService } from './ai-agent-session.service';
import { AiAgentTriggerService } from './ai-agent-trigger.service';

@Controller('v1/ai-agent')
export class AiAgentController {
  constructor(
    private readonly agentCore: AiAgentCoreService,
    private readonly sessionService: AiAgentSessionService,
    private readonly triggerService: AiAgentTriggerService,
  ) {}

  @Post('query')
  async query(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { query: string; sessionId?: string },
  ) {
    this.requireTenant(tenantId);
    if (!body.query || body.query.trim().length === 0) {
      throw new BadRequestException('query is required.');
    }

    let session;
    if (body.sessionId) {
      const existingSession = await this.sessionService.getSession(body.sessionId);
      if (!existingSession || existingSession.tenantId !== tenantId) {
        throw new NotFoundException('Session not found.');
      }
      session = existingSession;
    } else {
      session = await this.sessionService.createSession(
        tenantId,
        body.query.slice(0, 60),
      );
    }

    session = await this.sessionService.addMessage(session.id, {
      role: 'user' as const,
      content: body.query,
      timestamp: new Date().toISOString(),
    });

    const result = await this.agentCore.processAgentCommand(tenantId, body.query);
    const actionLines = result.recommendedActions
      .map((action, index) => `${index + 1}. **${action.type}**: ${action.description}`)
      .join('\n');

    const responseText = [
      `**${result.intent.replace(/_/g, ' ')}** (confidence: ${(result.confidence * 100).toFixed(0)}%)`,
      '',
      actionLines,
      '',
      `Operator plan: ${result.operatorPlan.executionMode} | risk: ${result.operatorPlan.riskLevel}`,
      `Next safe step: ${result.operatorPlan.nextSafeStep}`,
      '',
      `_Agent analysis completed at ${new Date().toLocaleTimeString('vi-VN')}_`,
    ].join('\n');

    session = await this.sessionService.addMessage(session.id, {
      role: 'assistant' as const,
      content: responseText,
      timestamp: new Date().toISOString(),
    });

    return {
      sessionId: session.id,
      intent: result.intent,
      confidence: result.confidence,
      recommendedActions: result.recommendedActions,
      operatorPlan: result.operatorPlan,
      messages: session.messages.slice(-2),
    };
  }

  @Post('query/execute')
  async queryAndExecute(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { query: string; sessionId?: string; userId?: string },
  ) {
    this.requireTenant(tenantId);
    if (!body.query || body.query.trim().length === 0) {
      throw new BadRequestException('query is required.');
    }

    let session;
    if (body.sessionId) {
      const existingSession = await this.sessionService.getSession(body.sessionId);
      if (!existingSession || existingSession.tenantId !== tenantId) {
        throw new NotFoundException('Session not found.');
      }
      session = existingSession;
    } else {
      session = await this.sessionService.createSession(
        tenantId,
        body.query.slice(0, 60),
      );
    }

    session = await this.sessionService.addMessage(session.id, {
      role: 'user' as const,
      content: body.query,
      timestamp: new Date().toISOString(),
    });

    const { command, execution } = await this.agentCore.processAndExecute(
      tenantId,
      session.id,
      body.query,
      body.userId,
    );

    const actionResultsSummary = execution.results
      .map((result, index) => {
        const marker = result.status === 'success' ? 'ok' : result.status === 'failed' ? 'failed' : 'simulated';
        return `${index + 1}. **${result.type}** -> ${marker} (${result.durationMs}ms)`;
      })
      .join('\n');

    const responseText = [
      `**${command.intent.replace(/_/g, ' ')}** (confidence: ${(command.confidence * 100).toFixed(0)}%)`,
      '',
      '**Execution Results:**',
      actionResultsSummary,
      '',
      `Executed ${execution.succeeded}/${execution.total} actions in ${execution.totalDurationMs}ms`,
      `Operator plan: ${execution.executionMode} | risk: ${execution.riskLevel}`,
      '',
      `_Agent execution completed at ${new Date().toLocaleTimeString('vi-VN')}_`,
    ].join('\n');

    session = await this.sessionService.addMessage(session.id, {
      role: 'assistant' as const,
      content: responseText,
      timestamp: new Date().toISOString(),
    });

    return {
      sessionId: session.id,
      intent: command.intent,
      confidence: command.confidence,
      execution: {
        mode: execution.executionMode,
        riskLevel: execution.riskLevel,
        total: execution.total,
        succeeded: execution.succeeded,
        failed: execution.failed,
        simulated: execution.simulated,
        totalDurationMs: execution.totalDurationMs,
        results: execution.results.map((result) => ({
          type: result.type,
          status: result.status,
          durationMs: result.durationMs,
          output: result.output,
          error: result.error,
        })),
      },
      messages: session.messages.slice(-2),
    };
  }

  @Post('sessions/:id/execute')
  async executeSessionActions(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() body: { userId?: string },
  ) {
    this.requireTenant(tenantId);
    const session = await this.getTenantSessionOrThrow(tenantId, id);

    const lastAssistantMsg = [...session.messages]
      .reverse()
      .find((message) => message.role === 'assistant');
    if (!lastAssistantMsg) {
      throw new BadRequestException('No analysis found in this session. Send a query first.');
    }

    const lastUserMsg = [...session.messages]
      .reverse()
      .find((message) => message.role === 'user');
    if (!lastUserMsg) {
      throw new BadRequestException('No user query found in session.');
    }

    const { execution } = await this.agentCore.processAndExecute(
      tenantId,
      session.id,
      lastUserMsg.content,
      body.userId,
    );

    return { sessionId: session.id, execution };
  }

  @Get('sessions')
  async listSessions(
    @Headers('x-tenant-id') tenantId: string,
    @Query('status') status?: string,
  ) {
    this.requireTenant(tenantId);
    const sessions = await this.sessionService.listSessions(tenantId, status);
    return {
      items: sessions.map((session) => ({
        id: session.id,
        title: session.title,
        status: session.status,
        messageCount: session.messages.length,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })),
      total: sessions.length,
    };
  }

  @Get('sessions/:id')
  async getSession(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(tenantId);
    const session = await this.getTenantSessionOrThrow(tenantId, id);
    return {
      id: session.id,
      title: session.title,
      status: session.status,
      messages: session.messages,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  @Get('intents')
  getIntents() {
    return {
      intents: [
        {
          key: 'BUDGET_OPTIMIZATION',
          label: 'Budget Optimization',
          description: 'Phan tich chi phi, toi uu routing, giam AI cost',
        },
        {
          key: 'SYSTEM_HEALTH_CHECK',
          label: 'System Health Check',
          description: 'Quet loi, kiem tra logs, de xuat sua loi',
        },
        {
          key: 'SECURITY_REVIEW',
          label: 'Security Review',
          description: 'Ra soat phan quyen, audit log, bao mat',
        },
        {
          key: 'INTEGRATION_PLANNING',
          label: 'Integration Planning',
          description: 'Ke hoach tich hop connector, webhook, API',
        },
        {
          key: 'GENERAL_ASSISTANCE',
          label: 'General Assistance',
          description: 'Tu van chung, tao tac vu Agent',
        },
      ],
    };
  }

  @Post('sessions/:id/archive')
  async archiveSession(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(tenantId);
    await this.getTenantSessionOrThrow(tenantId, id);
    const archived = await this.sessionService.archiveSession(id);
    return { success: archived };
  }

  @Post('sessions/:id/delete')
  async deleteSession(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(tenantId);
    await this.getTenantSessionOrThrow(tenantId, id);
    const deleted = await this.sessionService.deleteSession(id);
    return { success: deleted };
  }

  @Post('triggers')
  async createTrigger(
    @Headers('x-tenant-id') tenantId: string,
    @Body()
    body: {
      name: string;
      triggerType: 'scheduled' | 'event' | 'threshold';
      schedule?: string;
      eventType?: string;
      config?: Record<string, unknown>;
      intent?: string;
    },
  ) {
    this.requireTenant(tenantId);
    if (!body.name || body.name.trim().length === 0) {
      throw new BadRequestException('name is required.');
    }
    if (!['scheduled', 'event', 'threshold'].includes(body.triggerType)) {
      throw new BadRequestException('triggerType must be scheduled, event, or threshold.');
    }
    if (body.triggerType === 'scheduled' && !body.schedule) {
      throw new BadRequestException('schedule is required for scheduled triggers.');
    }

    const trigger = await this.triggerService.createTrigger({
      tenantId,
      name: body.name,
      triggerType: body.triggerType,
      schedule: body.schedule,
      eventType: body.eventType,
      config: body.config,
      intent: body.intent,
    });

    return { trigger };
  }

  @Get('triggers')
  async listTriggers(
    @Headers('x-tenant-id') tenantId: string,
    @Query('triggerType') triggerType?: string,
    @Query('isActive') isActive?: string,
  ) {
    this.requireTenant(tenantId);
    const triggers = await this.triggerService.listTriggers(tenantId, {
      triggerType,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
    return { items: triggers };
  }

  @Get('triggers/stats')
  async getTriggerStats(@Headers('x-tenant-id') tenantId: string) {
    this.requireTenant(tenantId);
    const stats = await this.triggerService.getTenantTriggerStats(tenantId);
    return { stats };
  }

  @Get('triggers/:id')
  async getTrigger(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(tenantId);
    const trigger = await this.getTenantTriggerOrThrow(tenantId, id);
    return { trigger };
  }

  @Patch('triggers/:id')
  async updateTrigger(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      schedule?: string;
      eventType?: string;
      config?: Record<string, unknown>;
      intent?: string;
      isActive?: boolean;
    },
  ) {
    this.requireTenant(tenantId);
    await this.getTenantTriggerOrThrow(tenantId, id);
    const updated = await this.triggerService.updateTrigger(id, body);
    return { trigger: updated };
  }

  @Delete('triggers/:id')
  async deleteTrigger(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(tenantId);
    await this.getTenantTriggerOrThrow(tenantId, id);
    const deleted = await this.triggerService.deleteTrigger(id);
    return { success: deleted };
  }

  @Post('triggers/:id/fire')
  async fireTrigger(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(tenantId);
    await this.getTenantTriggerOrThrow(tenantId, id);
    return this.triggerService.fireTrigger(id);
  }

  private requireTenant(tenantId?: string): asserts tenantId is string {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header is required.');
    }
  }

  private async getTenantSessionOrThrow(tenantId: string, id: string) {
    const session = await this.sessionService.getSession(id);
    if (!session || session.tenantId !== tenantId) {
      throw new NotFoundException('Session not found.');
    }
    return session;
  }

  private async getTenantTriggerOrThrow(tenantId: string, id: string) {
    const trigger = await this.triggerService.getTrigger(id);
    if (!trigger || trigger.tenantId !== tenantId) {
      throw new NotFoundException('Trigger not found.');
    }
    return trigger;
  }
}

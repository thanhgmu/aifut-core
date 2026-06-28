// ═══════════════════════════════════════════════════════════════════════════
// ai-agent.controller.ts — AI Operator Agent REST API
// ═══════════════════════════════════════════════════════════════════════════
// Route gốc: /v1/ai-agent
// Per-tenant AI operator agent — chat interface + session management + actions.
// ── Now async with Prisma-backed persistence ──
// ── Phase 3: Action execution engine integrated ──
// ═══════════════════════════════════════════════════════════════════════════

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Headers,
  Body,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AiAgentCoreService } from './ai-agent-core.service';
import { AiAgentSessionService } from './ai-agent-session.service';
import { AiAgentTriggerService } from './ai-agent-trigger.service';

// ── Controller ────────────────────────────────────────────────────────────

@Controller('v1/ai-agent')
export class AiAgentController {
  constructor(
    private readonly agentCore: AiAgentCoreService,
    private readonly sessionService: AiAgentSessionService,
    private readonly triggerService: AiAgentTriggerService,
  ) {}

  /**
   * POST /v1/ai-agent/query
   * Gửi câu hỏi/tác vụ cho AI Operator Agent (phân tích, không thực thi).
   * Nếu có sessionId → tiếp tục session. Không → tạo session mới.
   */
  @Post('query')
  async query(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: {
      query: string;
      sessionId?: string;
    },
  ) {
    this.requireTenant(tenantId);
    if (!body.query || body.query.trim().length === 0) {
      throw new BadRequestException('query is required.');
    }

    // Resolve session (async with Prisma)
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

    // Add user message (persisted)
    const userMessage = {
      role: 'user' as const,
      content: body.query,
      timestamp: new Date().toISOString(),
    };
    session = await this.sessionService.addMessage(session.id, userMessage);

    // Process through agent core
    const result = await this.agentCore.processAgentCommand(tenantId, body.query);

    // Build assistant response
    const actionLines = result.recommendedActions
      .map((a, i) => `${i + 1}. **${a.type}**: ${a.description}`)
      .join('\n');

    const responseText = [
      `🧠 **${result.intent.replace(/_/g, ' ')}** (confidence: ${(result.confidence * 100).toFixed(0)}%)`,
      '',
      actionLines,
      '',
      `Operator plan: ${result.operatorPlan.executionMode} | risk: ${result.operatorPlan.riskLevel}`,
      `Next safe step: ${result.operatorPlan.nextSafeStep}`,
      '',
      `_Agent analysis completed at ${new Date().toLocaleTimeString('vi-VN')}_`,
    ].join('\n');

    const assistantMessage = {
      role: 'assistant' as const,
      content: responseText,
      timestamp: new Date().toISOString(),
    };
    session = await this.sessionService.addMessage(session.id, assistantMessage);

    return {
      sessionId: session.id,
      intent: result.intent,
      confidence: result.confidence,
      recommendedActions: result.recommendedActions,
      operatorPlan: result.operatorPlan,
      messages: session.messages.slice(-2), // Last exchange
    };
  }

  /**
   * POST /v1/ai-agent/query/execute
   * Phân tích + thực thi actions tự động.
   * Giống /query nhưng kèm execution results từ các module thật.
   */
  @Post('query/execute')
  async queryAndExecute(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: {
      query: string;
      sessionId?: string;
      userId?: string;
    },
  ) {
    this.requireTenant(tenantId);
    if (!body.query || body.query.trim().length === 0) {
      throw new BadRequestException('query is required.');
    }

    // Resolve session
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

    // Add user message
    const userMessage = {
      role: 'user' as const,
      content: body.query,
      timestamp: new Date().toISOString(),
    };
    session = await this.sessionService.addMessage(session.id, userMessage);

    // Process + Execute via core
    const { command, execution } = await this.agentCore.processAndExecute(
      tenantId,
      session.id,
      body.query,
      body.userId,
    );

    // Build assistant response including execution results
    const actionResultsSummary = execution.results
      .map(
        (r, i) =>
          `${i + 1}. **${r.type}** → ${r.status === 'success' ? '✅' : r.status === 'failed' ? '❌' : '⚡'} ${r.status} (${r.durationMs}ms)`,
      )
      .join('\n');

    const responseText = [
      `🧠 **${command.intent.replace(/_/g, ' ')}** (confidence: ${(command.confidence * 100).toFixed(0)}%)`,
      '',
      '**Execution Results:**',
      actionResultsSummary,
      '',
      `Executed ${execution.succeeded}/${execution.total} actions in ${execution.totalDurationMs}ms`,
      `Operator plan: ${execution.executionMode} | risk: ${execution.riskLevel}`,
      '',
      `_Agent execution completed at ${new Date().toLocaleTimeString('vi-VN')}_`,
    ].join('\n');

    const assistantMessage = {
      role: 'assistant' as const,
      content: responseText,
      timestamp: new Date().toISOString(),
    };
    session = await this.sessionService.addMessage(session.id, assistantMessage);

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
        results: execution.results.map((r) => ({
          type: r.type,
          status: r.status,
          durationMs: r.durationMs,
          output: r.output,
          error: r.error,
        })),
      },
      messages: session.messages.slice(-2),
    };
  }

  /**
   * POST /v1/ai-agent/sessions/:id/execute
   * Thực thi actions cho một session đã có analysis.
   * Frontend có thể gọi endpoint này sau khi user xác nhận actions.
   */
  @Post('sessions/:id/execute')
  async executeSessionActions(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() body: { userId?: string },
  ) {
    this.requireTenant(tenantId);

    const session = await this.sessionService.getSession(id);
    if (!session || session.tenantId !== tenantId) {
      throw new NotFoundException('Session not found.');
    }

    // Lấy last analysis từ session messages
    const lastAssistantMsg = [...session.messages]
      .reverse()
      .find((m) => m.role === 'assistant');
    if (!lastAssistantMsg) {
      throw new BadRequestException('No analysis found in this session. Send a query first.');
    }

    // Re-run the last user query analysis + execute
    const lastUserMsg = [...session.messages]
      .reverse()
      .find((m) => m.role === 'user');
    if (!lastUserMsg) {
      throw new BadRequestException('No user query found in session.');
    }

    const { command, execution } = await this.agentCore.processAndExecute(
      tenantId,
      session.id,
      lastUserMsg.content,
      body.userId,
    );

    return {
      sessionId: session.id,
      execution,
    };
  }

  /**
   * GET /v1/ai-agent/sessions
   * Danh sách session của tenant.
   */
  @Get('sessions')
  async listSessions(
    @Headers('x-tenant-id') tenantId: string,
    @Query('status') status?: string,
  ) {
    this.requireTenant(tenantId);
    const sessions = await this.sessionService.listSessions(tenantId, status);
    return {
      items: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        messageCount: s.messages.length,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      total: sessions.length,
    };
  }

  /**
   * GET /v1/ai-agent/sessions/:id
   * Chi tiết session — bao gồm full messages.
   */
  @Get('sessions/:id')
  async getSession(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(tenantId);
    const session = await this.sessionService.getSession(id);
    if (!session || session.tenantId !== tenantId) {
      throw new NotFoundException('Session not found.');
    }
    return {
      id: session.id,
      title: session.title,
      status: session.status,
      messages: session.messages,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  /**
   * GET /v1/ai-agent/intents
   * Danh sách intent mà agent hỗ trợ (for UI hints).
   */
  @Get('intents')
  getIntents() {
    return {
      intents: [
        { key: 'BUDGET_OPTIMIZATION', label: '💰 Budget Optimization', description: 'Phân tích chi phí, tối ưu routing, giảm AI cost' },
        { key: 'SYSTEM_HEALTH_CHECK', label: '🔍 System Health Check', description: 'Quét lỗi, kiểm tra logs, đề xuất sửa lỗi' },
        { key: 'SECURITY_REVIEW', label: '🔒 Security Review', description: 'Rà soát phân quyền, audit log, bảo mật' },
        { key: 'INTEGRATION_PLANNING', label: '🔌 Integration Planning', description: 'Kế hoạch tích hợp connector, webhook, API' },
        { key: 'GENERAL_ASSISTANCE', label: '🤖 General Assistance', description: 'Tư vấn chung, tạo tác vụ Agent' },
      ],
    };
  }

  /**
   * POST /v1/ai-agent/sessions/:id/archive
   * Archive session.
   */
  @Post('sessions/:id/archive')
  async archiveSession(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(tenantId);
    const session = await this.sessionService.getSession(id);
    if (!session || session.tenantId !== tenantId) {
      throw new NotFoundException('Session not found.');
    }
    const archived = await this.sessionService.archiveSession(id);
    return { success: archived };
  }

  /**
   * DELETE /v1/ai-agent/sessions/:id
   * Xoá session.
   */
  @Post('sessions/:id/delete')
  async deleteSession(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(tenantId);
    const session = await this.sessionService.getSession(id);
    if (!session || session.tenantId !== tenantId) {
      throw new NotFoundException('Session not found.');
    }
    const deleted = await this.sessionService.deleteSession(id);
    return { success: deleted };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Trigger Management Endpoints
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * POST /v1/ai-agent/triggers
   * Tạo trigger mới (scheduled/event/threshold).
   */
  @Post('triggers')
  async createTrigger(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: {
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

  /**
   * GET /v1/ai-agent/triggers
   * Danh sách triggers của tenant.
   */
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

  /**
   * GET /v1/ai-agent/triggers/:id
   * Chi tiết trigger.
   */
  @Get('triggers/:id')
  async getTrigger(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(tenantId);
    const trigger = await this.triggerService.getTrigger(id);
    if (!trigger || trigger.tenantId !== tenantId) {
      throw new NotFoundException('Trigger not found.');
    }
    return { trigger };
  }

  /**
   * PATCH /v1/ai-agent/triggers/:id
   * Cập nhật trigger.
   */
  @Patch('triggers/:id')
  async updateTrigger(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() body: {
      name?: string;
      schedule?: string;
      eventType?: string;
      config?: Record<string, unknown>;
      intent?: string;
      isActive?: boolean;
    },
  ) {
    this.requireTenant(tenantId);
    const existing = await this.triggerService.getTrigger(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException('Trigger not found.');
    }
    const updated = await this.triggerService.updateTrigger(id, body);
    return { trigger: updated };
  }

  /**
   * DELETE /v1/ai-agent/triggers/:id
   * Xoá trigger.
   */
  @Delete('triggers/:id')
  async deleteTrigger(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(tenantId);
    const existing = await this.triggerService.getTrigger(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException('Trigger not found.');
    }
    const deleted = await this.triggerService.deleteTrigger(id);
    return { success: deleted };
  }

  /**
   * POST /v1/ai-agent/triggers/:id/fire
   * Kích hoạt trigger thủ công (manual fire).
   */
  @Post('triggers/:id/fire')
  async fireTrigger(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(tenantId);
    const existing = await this.triggerService.getTrigger(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException('Trigger not found.');
    }
    const result = await this.triggerService.fireTrigger(id);
    return result;
  }

  /**
   * GET /v1/ai-agent/triggers/stats
   * Thống kê trigger cho tenant dashboard.
   */
  @Get('triggers/stats')
  async getTriggerStats(
    @Headers('x-tenant-id') tenantId: string,
  ) {
    this.requireTenant(tenantId);
    const stats = await this.triggerService.getTenantTriggerStats(tenantId);
    return { stats };
  }

  private requireTenant(tenantId?: string): asserts tenantId is string {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header is required.');
    }
  }
}

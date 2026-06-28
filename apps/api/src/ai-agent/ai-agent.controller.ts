// ═══════════════════════════════════════════════════════════════════════════
// ai-agent.controller.ts — AI Operator Agent REST API
// ═══════════════════════════════════════════════════════════════════════════
// Route gốc: /v1/ai-agent
// Per-tenant AI operator agent — chat interface + session management + actions.

import {
  Controller,
  Get,
  Post,
  Headers,
  Body,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AiAgentCoreService } from './ai-agent-core.service';
import { AiAgentSessionService } from './ai-agent-session.service';
import type { AgentSession } from './ai-agent-session.service';

// ── Types ─────────────────────────────────────────────────────────────────

// ── Controller ────────────────────────────────────────────────────────────

@Controller('v1/ai-agent')
export class AiAgentController {
  constructor(
    private readonly agentCore: AiAgentCoreService,
    private readonly sessionService: AiAgentSessionService,
  ) {}

  /**
   * POST /v1/ai-agent/query
   * Gửi câu hỏi/tác vụ cho AI Operator Agent.
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

    // Resolve session
    let session: AgentSession;
    if (body.sessionId) {
      const existingSession = this.sessionService.getSession(body.sessionId);
      if (!existingSession || existingSession.tenantId !== tenantId) {
        throw new NotFoundException('Session not found.');
      }
      session = existingSession;
    } else {
      session = this.sessionService.createSession(
        tenantId,
        body.query.slice(0, 60),
      );
    }

    // Add user message
    session.messages.push({
      role: 'user',
      content: body.query,
      timestamp: new Date().toISOString(),
    });

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

    session.messages.push({
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString(),
    });

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
   * GET /v1/ai-agent/sessions
   * Danh sách session của tenant.
   */
  @Get('sessions')
  listSessions(
    @Headers('x-tenant-id') tenantId: string,
    @Query('status') status?: string,
  ) {
    this.requireTenant(tenantId);
    const sessions = this.sessionService.listSessions(tenantId, status);
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
  getSession(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requireTenant(tenantId);
    const session = this.sessionService.getSession(id);
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

  private requireTenant(tenantId?: string): asserts tenantId is string {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header is required.');
    }
  }
}

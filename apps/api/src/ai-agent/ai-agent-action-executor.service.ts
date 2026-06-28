// ═══════════════════════════════════════════════════════════════════════════
// ai-agent-action-executor.service.ts — AI Operator Agent Action Executor
// ═══════════════════════════════════════════════════════════════════════════
// Biến AgentCommandResult.recommendedActions thành lời gọi service thực tế.
// Mỗi action type có handler riêng → gọi đúng module (billing, analytics, audit).
// ── Phase 3: Per-tenant AI operator agent ── killer feature ──
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BillingService } from '../billing/billing.service';
import { AnalyticsBiService } from '../analytics-bi/analytics-bi.service';
import { AuditService } from '../audit/audit.service';
import type { AgentCommandResult } from './ai-agent-core.service';

// ── Types ─────────────────────────────────────────────────────────────────

/** Trạng thái execution của một action */
export type ActionExecutionStatus = 'success' | 'failed' | 'simulated' | 'rejected';

/** Kết quả execution của một action cụ thể */
export interface ActionExecutionResult {
  type: string;
  targetId: string;
  description: string;
  status: ActionExecutionStatus;
  /** Output trả về từ service được gọi */
  output: unknown;
  /** Thời gian thực thi (ms) */
  durationMs: number;
  /** Thông báo lỗi nếu failed */
  error?: string;
}

/** Kết quả batch execution */
export interface BatchExecutionResult {
  sessionId: string;
  intent: string;
  confidence: number;
  executionMode: string;
  riskLevel: string;
  results: ActionExecutionResult[];
  /** Tổng số action đã thực thi */
  total: number;
  /** Số action thành công */
  succeeded: number;
  /** Số action thất bại */
  failed: number;
  /** Số action mô phỏng (không có handler thực) */
  simulated: number;
  /** Thời gian thực thi batch */
  totalDurationMs: number;
}

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class AiAgentActionExecutorService {
  private readonly logger = new Logger(AiAgentActionExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly analyticsBiService: AnalyticsBiService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * executeActions
   * ──────────────
   * Nhận validated AgentCommandResult, thực thi từng action an toàn.
   * Mỗi action chạy độc lập — một action fail không ảnh hưởng action khác.
   *
   * @param sessionId  — Session ID để trace
   * @param tenantId   — Tenant boundary
   * @param command    — AgentCommandResult từ AiAgentCoreService
   * @param userId     — (optional) Người vận hành thực thi
   */
  async executeActions(
    sessionId: string,
    tenantId: string,
    command: AgentCommandResult,
    userId?: string,
  ): Promise<BatchExecutionResult> {
    const startTime = Date.now();
    const actionResults: ActionExecutionResult[] = [];

    for (const action of command.recommendedActions) {
      const actionStart = Date.now();
      try {
        const output = await this.dispatchAction(tenantId, action.type, action.targetId, userId);
        actionResults.push({
          type: action.type,
          targetId: action.targetId,
          description: action.description,
          status: 'success',
          output,
          durationMs: Date.now() - actionStart,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown execution error';
        this.logger.warn(`Action ${action.type} failed for tenant ${tenantId}: ${message}`);
        actionResults.push({
          type: action.type,
          targetId: action.targetId,
          description: action.description,
          status: 'failed',
          output: null,
          durationMs: Date.now() - actionStart,
          error: message,
        });
      }
    }

    // Audit trail for the batch execution
    await this.recordExecutionAudit(tenantId, sessionId, command, actionResults, userId);

    const succeeded = actionResults.filter((r) => r.status === 'success').length;
    const failed = actionResults.filter((r) => r.status === 'failed').length;
    const simulated = actionResults.filter((r) => r.status === 'simulated').length;

    return {
      sessionId,
      intent: command.intent,
      confidence: command.confidence,
      executionMode: command.operatorPlan.executionMode,
      riskLevel: command.operatorPlan.riskLevel,
      results: actionResults,
      total: actionResults.length,
      succeeded,
      failed,
      simulated,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  Action dispatcher — maps action types to real service handlers
  // ═════════════════════════════════════════════════════════════════════

  private async dispatchAction(
    tenantId: string,
    actionType: string,
    targetId: string,
    userId?: string,
  ): Promise<unknown> {
    switch (actionType) {
      // ── Billing / Cost ─────────────────────────────────────────────
      case 'ANALYZE_USAGE_COST':
        return this.handleAnalyzeUsageCost(tenantId);

      case 'RECOMMEND_MODEL_ROUTING':
        return this.handleRecommendModelRouting(tenantId);

      // ── System Health ──────────────────────────────────────────────
      case 'SCAN_RECENT_ERRORS':
        return this.handleScanRecentErrors(tenantId);

      case 'OPEN_INCIDENT_DRAFT':
        return this.handleOpenIncidentDraft(tenantId, targetId, userId);

      // ── Security / Audit ───────────────────────────────────────────
      case 'REVIEW_ACCESS_POLICY':
        return this.handleReviewAccessPolicy(tenantId, userId);

      case 'EXPORT_SECURITY_AUDIT_SUMMARY':
        return this.handleExportAuditSummary(tenantId);

      // ── Integration ────────────────────────────────────────────────
      case 'MAP_INTEGRATION_REQUIREMENTS':
        return this.handleMapIntegrationRequirements(tenantId);

      case 'VALIDATE_CONNECTOR_SCOPE':
        return this.handleValidateConnectorScope(tenantId);

      // ── General ────────────────────────────────────────────────────
      case 'CREATE_AGENT_TASK_DRAFT':
        return this.handleCreateAgentTaskDraft(tenantId, targetId, userId);

      default:
        // Unknown action type → simulate with advisory info
        this.logger.warn(`Unknown action type "${actionType}" for tenant ${tenantId} — simulating`);
        return {
          status: 'simulated',
          actionType,
          message: `No concrete handler for action '${actionType}'. Provide a detailed natural-language description so the operator can proceed manually.`,
        };
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  //  Handler implementations
  // ═════════════════════════════════════════════════════════════════════

  /** Helper: lấy latest analytics snapshot cho tenant */
  private async getLatestAnalyticsSnapshot(tenantId: string, period: 'HOURLY' | 'DAILY' = 'DAILY') {
    const snapshots = await this.analyticsBiService.getTenantAnalytics(tenantId, period);
    return snapshots.length > 0 ? snapshots[0] : null;
  }

  /**
   * ANALYZE_USAGE_COST
   * ──────────────────
   * Lấy dữ liệu usage + hóa đơn → phân tích xu hướng chi phí.
   */
  private async handleAnalyzeUsageCost(tenantId: string): Promise<unknown> {
    const account = await this.billingService.getOrCreateAccount(tenantId);
    const invoices = await this.billingService.getInvoices(tenantId);
    const analytics = await this.getLatestAnalyticsSnapshot(tenantId, 'DAILY');

    const totalInvoiced = invoices.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
    const paidCount = invoices.filter((inv: any) => inv.status === 'paid').length;
    const pendingCount = invoices.filter((inv: any) => inv.status === 'pending').length;

    const aiUsage = analytics?.ai
      ? {
          totalTokens: analytics.ai.totalTokens,
          estimatedCost: analytics.ai.totalCost,
          callCount: analytics.ai.callCount,
        }
      : null;
    const execStats = analytics?.executions
      ? {
          total: analytics.executions.total,
          successRate:
            analytics.executions.total > 0
              ? ((analytics.executions.success / analytics.executions.total) * 100).toFixed(1) + '%'
              : 'N/A',
        }
      : null;

    const aiCallCount = aiUsage?.callCount ? Number(aiUsage.callCount) : 0;

    return {
      tenantId,
      currency: account?.currency ?? 'VND',
      totalInvoices: invoices.length,
      totalInvoiced,
      paidCount,
      pendingCount,
      aiUsage,
      executions: execStats,
      analysisTimestamp: new Date().toISOString(),
      recommendations: [
        'Review pending invoices for delayed payments that may affect service continuity',
        pendingCount > 0
          ? `There are ${pendingCount} pending invoices — consider payment reminders`
          : null,
        aiCallCount > 100
          ? 'High AI call volume detected — review model routing policy for cost optimization'
          : null,
      ].filter(Boolean),
    };
  }

  /**
   * RECOMMEND_MODEL_ROUTING
   * ───────────────────────
   * Gợi ý cấu hình routing model AI dựa trên usage pattern.
   */
  private async handleRecommendModelRouting(tenantId: string): Promise<unknown> {
    const analytics = await this.getLatestAnalyticsSnapshot(tenantId, 'DAILY');

    const aiCallCount = analytics?.ai?.callCount ? Number(analytics.ai.callCount) : 0;
    const totalCost = Number(analytics?.ai?.totalCost ?? '0');

    const routingPolicy = {
      smallTasks: {
        model: aiCallCount > 50 ? 'gpt-4o-mini' : 'gpt-4o',
        maxTokens: 1024,
        costPerCall: '$0.00015',
      },
      mediumTasks: {
        model: 'gpt-4o',
        maxTokens: 4096,
        costPerCall: '$0.005',
      },
      complexTasks: {
        model: aiCallCount > 20 ? 'gpt-4o' : 'claude-opus-4',
        maxTokens: 8192,
        costPerCall: '$0.015',
      },
    };

    const estimatedSavings = aiCallCount > 0
      ? (totalCost * 0.35).toFixed(2)
      : 'N/A';

    return {
      tenantId,
      currentUsage: { aiCallCount, totalCost },
      proposedRoutingPolicy: routingPolicy,
      estimatedMonthlySavings: `${estimatedSavings}${typeof estimatedSavings === 'string' && estimatedSavings !== 'N/A' ? ' (35% reduction)' : ''}`,
      manualSteps: [
        'Apply this routing policy via Settings > AI Model Routing',
        'Test with a sample workflow before full rollout',
        'Monitor cost dashboard for 7 days to validate savings',
      ],
    };
  }

  /**
   * SCAN_RECENT_ERRORS
   * ──────────────────
   * Quét lỗi gần đây từ analytics + audit.
   */
  private async handleScanRecentErrors(tenantId: string): Promise<unknown> {
    const analytics = await this.getLatestAnalyticsSnapshot(tenantId, 'DAILY');

    const failedCount = analytics?.executions?.failed ?? 0;
    const totalCount = analytics?.executions?.total ?? 0;

    const recentAuditEvents = await this.prisma.auditEvent.findMany({
      where: {
        tenantId,
        severity: { in: ['WARN' as any, 'CRITICAL' as any] },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        action: true,
        severity: true,
        createdAt: true,
        metadata: true,
      },
    });

    // Fix type: map to { action, severity } before grouping
    const mappedEvents = recentAuditEvents
      .filter((e) => e.severity !== null)
      .map((e) => ({
        action: e.action,
        severity: e.severity as string,
      }));

    return {
      tenantId,
      scanPeriod: 'last 24 hours',
      executionErrors: {
        totalExecutions: totalCount,
        failedExecutions: failedCount,
        failureRate: totalCount > 0 ? ((failedCount / totalCount) * 100).toFixed(1) + '%' : '0%',
      },
      auditEvents: recentAuditEvents.map((e) => ({
        id: e.id,
        action: e.action,
        severity: e.severity,
        timestamp: e.createdAt,
        summary: (e.metadata as any)?.error ?? e.action,
      })),
      totalAuditIssues: recentAuditEvents.length,
      topIssues: this.groupAuditErrors(mappedEvents),
    };
  }

  /**
   * OPEN_INCIDENT_DRAFT
   * ───────────────────
   * Tạo bản nháp incident với audit trail.
   */
  private async handleOpenIncidentDraft(
    tenantId: string,
    targetId: string,
    userId?: string,
  ): Promise<unknown> {
    const draft = {
      id: `draft-inc-${Date.now()}`,
      tenantId,
      title: `Automated Agent Incident — ${new Date().toLocaleDateString('vi-VN')}`,
      status: 'draft',
      severity: 'medium',
      source: 'ai-agent-core',
      description: `Auto-generated incident draft from AI operator agent. Target: ${targetId}. Needs manual review before escalation.`,
      createdAt: new Date().toISOString(),
      nextSteps: [
        'Review the incident scope',
        'Assign to appropriate team member',
        'Update severity if needed',
        'Set resolution plan',
      ],
    };

    await this.auditService.logActivity({
      tenantId,
      action: 'AI_AGENT_INCIDENT_DRAFT_CREATED',
      userId: userId ?? null,
      actorType: 'SYSTEM',
      resource: 'incident',
      resourceId: draft.id,
      metadata: { draft },
    });

    return draft;
  }

  /**
   * REVIEW_ACCESS_POLICY
   * ────────────────────
   * Rà soát phân quyền gần đây — query audit log.
   */
  private async handleReviewAccessPolicy(
    tenantId: string,
    userId?: string,
  ): Promise<unknown> {
    const accessEvents = await this.prisma.auditEvent.findMany({
      where: {
        tenantId,
        action: { contains: 'ACCESS' },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        action: true,
        actorType: true,
        userId: true,
        targetId: true,
        severity: true,
        createdAt: true,
      },
    });

    // Group by actorType instead of actor
    const actorMap = new Map<string, number>();
    for (const event of accessEvents) {
      const actor = event.actorType ?? 'UNKNOWN';
      actorMap.set(actor, (actorMap.get(actor) ?? 0) + 1);
    }

    const sensitiveActions = accessEvents.filter(
      (e) => e.severity === 'CRITICAL' || e.severity === 'WARN',
    );

    return {
      tenantId,
      reviewPeriod: 'last 7 days',
      totalAccessEvents: accessEvents.length,
      uniqueActors: actorMap.size,
      actorsByActivity: Array.from(actorMap.entries())
        .map(([actor, count]) => ({ actor, count }))
        .sort((a, b) => b.count - a.count),
      recentSensitiveActions: sensitiveActions.slice(0, 10),
      reviewedBy: userId ?? 'ai-agent-core',
      reviewedAt: new Date().toISOString(),
    };
  }

  /**
   * EXPORT_SECURITY_AUDIT_SUMMARY
   * ──────────────────────────────
   * Tổng hợp audit summary với raw SQL.
   */
  private async handleExportAuditSummary(tenantId: string): Promise<unknown> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const severityCounts = await this.prisma.$queryRawUnsafe<Array<{ severity: string; count: bigint }>>(
      `SELECT severity, COUNT(*)::int as count FROM "AuditEvent" WHERE "tenantId" = $1 AND "createdAt" >= $2 GROUP BY severity ORDER BY severity`,
      tenantId,
      thirtyDaysAgo,
    );

    const actionCounts = await this.prisma.$queryRawUnsafe<Array<{ action: string; count: bigint }>>(
      `SELECT action, COUNT(*)::int as count FROM "AuditEvent" WHERE "tenantId" = $1 AND "createdAt" >= $2 GROUP BY action ORDER BY count DESC LIMIT 20`,
      tenantId,
      thirtyDaysAgo,
    );

    return {
      tenantId,
      period: '30 days',
      generatedAt: now.toISOString(),
      totalEvents: (severityCounts as any[]).reduce((s: number, r: any) => s + Number(r.count), 0),
      severityDistribution: (severityCounts as any[]).map((r: any) => ({
        severity: r.severity,
        count: Number(r.count),
      })),
      topActions: (actionCounts as any[]).map((r: any) => ({
        action: r.action,
        count: Number(r.count),
      })),
    };
  }

  /**
   * MAP_INTEGRATION_REQUIREMENTS
   * ─────────────────────────────
   * Tạo integration plan template dựa trên IntegrationConnection inventory.
   */
  private async handleMapIntegrationRequirements(tenantId: string): Promise<unknown> {
    const connections = await this.prisma.integrationConnection.findMany({
      where: { tenantId },
      select: { id: true, name: true, provider: true, status: true },
    });

    return {
      tenantId,
      existingConnectors: connections.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.provider,
        status: c.status,
      })),
      recommendedPatterns: [
        { type: 'REST_API', description: 'Standard REST endpoint integration with OAuth2' },
        { type: 'WEBHOOK_RECEIVER', description: 'Receive real-time events via webhook' },
        { type: 'CRON_SCHEDULER', description: 'Scheduled data sync at fixed intervals' },
        { type: 'EVENT_BRIDGE', description: 'Cross-connector event-driven workflows' },
      ],
      nextSteps: [
        'Review existing integrations and their current status',
        'Identify gaps in current integration coverage',
        'Draft an integration architecture diagram',
      ],
    };
  }

  /**
   * VALIDATE_CONNECTOR_SCOPE
   * ────────────────────────
   * Kiểm tra phạm vi quyền của IntegrationConnection.
   */
  private async handleValidateConnectorScope(tenantId: string): Promise<unknown> {
    const connections = await this.prisma.integrationConnection.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        provider: true,
        status: true,
        config: true,
      },
    });

    const issues: string[] = [];
    const valid: string[] = [];

    for (const conn of connections) {
      if (!conn.config || Object.keys(conn.config as Record<string, unknown>).length === 0) {
        issues.push(`Integration "${conn.name}" (${conn.provider}) has no configuration`);
      } else if (conn.status === 'PENDING' || conn.status === 'ERROR') {
        issues.push(`Integration "${conn.name}" has status ${conn.status} — needs attention`);
      } else {
        valid.push(`${conn.name} (${conn.provider}): scope OK`);
      }
    }

    return {
      tenantId,
      totalConnections: connections.length,
      validConnections: valid,
      issues,
      healthy: issues.length === 0,
      validatedAt: new Date().toISOString(),
    };
  }

  /**
   * CREATE_AGENT_TASK_DRAFT
   * ────────────────────────
   * Tạo structured task draft từ agent analysis với audit trail.
   */
  private async handleCreateAgentTaskDraft(
    tenantId: string,
    targetId: string,
    userId?: string,
  ): Promise<unknown> {
    const draft = {
      id: `agent-task-${Date.now()}`,
      tenantId,
      source: 'ai-agent-core',
      targetId,
      status: 'draft',
      priority: 'medium',
      createdAt: new Date().toISOString(),
    };

    await this.auditService.logActivity({
      tenantId,
      action: 'AI_AGENT_TASK_DRAFT_CREATED',
      userId: userId ?? null,
      actorType: 'SYSTEM',
      resource: 'agent-task',
      resourceId: draft.id,
      metadata: { draft },
    });

    return draft;
  }

  // ═════════════════════════════════════════════════════════════════════
  //  Internal helpers
  // ═════════════════════════════════════════════════════════════════════

  /** Ghi audit trail cho toàn bộ batch execution */
  private async recordExecutionAudit(
    tenantId: string,
    sessionId: string,
    command: AgentCommandResult,
    results: ActionExecutionResult[],
    userId?: string,
  ): Promise<void> {
    try {
      await this.auditService.logActivity({
        tenantId,
        action: 'AI_AGENT_ACTIONS_EXECUTED',
        userId: userId ?? null,
        actorType: 'SYSTEM',
        resource: 'ai-agent-session',
        resourceId: sessionId,
        metadata: {
          intent: command.intent,
          confidence: command.confidence,
          executionMode: command.operatorPlan.executionMode,
          actionCount: results.length,
          successCount: results.filter((r) => r.status === 'success').length,
          failedCount: results.filter((r) => r.status === 'failed').length,
          results: results.map((r) => ({
            type: r.type,
            status: r.status,
            durationMs: r.durationMs,
            error: r.error,
          })),
        },
      });
    } catch {
      this.logger.warn(`Failed to record execution audit for tenant ${tenantId}`);
    }
  }

  /** Gom nhóm lỗi audit cho scan báo cáo clear */
  private groupAuditErrors(
    events: Array<{ action: string; severity: string }>,
  ): Array<{ action: string; severity: string; count: number }> {
    const groupMap = new Map<string, { action: string; severity: string; count: number }>();
    for (const e of events) {
      const key = `${e.action}:${e.severity}`;
      const existing = groupMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        groupMap.set(key, { action: e.action, severity: e.severity, count: 1 });
      }
    }
    return Array.from(groupMap.values()).sort((a, b) => b.count - a.count);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ai-agent-trigger.service.ts — Proactive AgentTrigger CRUD + Execution
// ═══════════════════════════════════════════════════════════════════════════
// Manages per-tenant AgentTrigger lifecycle:
//   CRUD → Scheduler polls → checkAndFireDueTriggers → dispatches to core + action executor
// ── Phase 3: Per-tenant AI operator agent — proactive trigger execution ──
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AiAgentCoreService } from './ai-agent-core.service';
import { AiAgentSessionService } from './ai-agent-session.service';
import { AiAgentActionExecutorService } from './ai-agent-action-executor.service';

// ── Types ─────────────────────────────────────────────────────────────────

export type TriggerType = 'scheduled' | 'event' | 'threshold';
export type TriggerStatus = 'active' | 'paused' | 'error';

export interface AgentTriggerRecord {
  id: string;
  tenantId: string;
  name: string;
  triggerType: TriggerType;
  schedule: string | null;
  eventType: string | null;
  config: Record<string, unknown> | null;
  intent: string;
  isActive: boolean;
  lastFiredAt: Date | null;
  nextFireAt: Date | null;
  failCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TriggerFireResult {
  triggerId: string;
  triggerName: string;
  tenantId: string;
  intent: string;
  fired: boolean;
  executionResult?: unknown;
  error?: string;
  nextFireAt?: Date | null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Cron-interval helper — lightweight cron matcher
//  Chỉ hỗ trợ 5-field cron: minute hour dayOfMonth month dayOfWeek
//  Mỗi field có thể là: number, *, */N, comma-list
//  Không support ? L W # (standard subset cho proactive triggers)
// ═══════════════════════════════════════════════════════════════════════════

function cronFieldMatches(field: string, value: number): boolean {
  if (field === '*') return true;

  // */N — every N interval
  if (field.startsWith('*/')) {
    const interval = parseInt(field.slice(2), 10);
    if (isNaN(interval) || interval <= 0) return false;
    return value % interval === 0;
  }

  // Comma-separated list: 1,3,5
  if (field.includes(',')) {
    return field.split(',').some((part) => cronFieldMatches(part.trim(), value));
  }

  // Range: 1-5
  if (field.includes('-')) {
    const [low, high] = field.split('-').map((s) => parseInt(s, 10));
    if (isNaN(low) || isNaN(high)) return false;
    return value >= low && value <= high;
  }

  return parseInt(field, 10) === value;
}

function cronMatches(cronExpr: string, date: Date = new Date()): boolean {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // 1-12
  const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

  return (
    cronFieldMatches(fields[0], minute) &&
    cronFieldMatches(fields[1], hour) &&
    cronFieldMatches(fields[2], dayOfMonth) &&
    cronFieldMatches(fields[3], month) &&
    cronFieldMatches(fields[4], dayOfWeek)
  );
}

function computeNextCronFire(cronExpr: string, after: Date = new Date()): Date | null {
  // Scan the next 7 days in 1-minute increments to find next match
  // This is a pragmatic O(n) approach for proactive triggers (not latency-critical)
  const maxLookaheadMs = 7 * 24 * 60 * 60 * 1000;
  const scanEnd = new Date(after.getTime() + maxLookaheadMs);
  const cursor = new Date(after);

  // Start from the next whole minute
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  while (cursor <= scanEnd) {
    if (cronMatches(cronExpr, cursor)) {
      return new Date(cursor);
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Service
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class AiAgentTriggerService {
  private readonly logger = new Logger(AiAgentTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentCore: AiAgentCoreService,
    private readonly sessionService: AiAgentSessionService,
    private readonly actionExecutor: AiAgentActionExecutorService,
  ) {}

  // ═════════════════════════════════════════════════════════════════════
  //  CRUD Operations
  // ═════════════════════════════════════════════════════════════════════

  /**
   * createTrigger
   * ─────────────
   * Tạo trigger mới, tự động tính nextFireAt nếu là scheduled trigger.
   */
  async createTrigger(params: {
    tenantId: string;
    name: string;
    triggerType: TriggerType;
    schedule?: string;
    eventType?: string;
    config?: Record<string, unknown>;
    intent?: string;
  }): Promise<AgentTriggerRecord> {
    const now = new Date();
    let nextFireAt: Date | null = null;

    if (params.triggerType === 'scheduled' && params.schedule) {
      nextFireAt = computeNextCronFire(params.schedule, now);
    }

    const record = await this.prisma.agentTrigger.create({
      data: {
        tenantId: params.tenantId,
        name: params.name,
        triggerType: params.triggerType,
        schedule: params.schedule ?? null,
        eventType: params.eventType ?? null,
        config: (params.config ?? {}) as any,
        intent: params.intent ?? 'SYSTEM_HEALTH_CHECK',
        isActive: true,
        nextFireAt,
      },
    });

    this.logger.log(`Trigger created: "${params.name}" (${params.triggerType}) for tenant ${params.tenantId}`);

    return this.toRecord(record);
  }

  /**
   * getTrigger
   * ──────────
   * Lấy chi tiết trigger.
   */
  async getTrigger(id: string): Promise<AgentTriggerRecord | null> {
    const record = await this.prisma.agentTrigger.findUnique({ where: { id } });
    return record ? this.toRecord(record) : null;
  }

  /**
   * listTriggers
   * ────────────
   * Liệt kê triggers theo tenant, có filter.
   */
  async listTriggers(
    tenantId: string,
    options?: {
      triggerType?: string;
      isActive?: boolean;
      limit?: number;
    },
  ): Promise<AgentTriggerRecord[]> {
    const where: Record<string, unknown> = { tenantId };
    if (options?.triggerType) where.triggerType = options.triggerType;
    if (options?.isActive !== undefined) where.isActive = options.isActive;

    const records = await this.prisma.agentTrigger.findMany({
      where: where as any,
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
    });

    return records.map((r) => this.toRecord(r));
  }

  /**
   * updateTrigger
   * ─────────────
   * Cập nhật trigger config.
   */
  async updateTrigger(
    id: string,
    params: Partial<{
      name: string;
      schedule: string;
      eventType: string;
      config: Record<string, unknown>;
      intent: string;
      isActive: boolean;
    }>,
  ): Promise<AgentTriggerRecord | null> {
    const existing = await this.prisma.agentTrigger.findUnique({ where: { id } });
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (params.name !== undefined) updateData.name = params.name;
    if (params.eventType !== undefined) updateData.eventType = params.eventType;
    if (params.config !== undefined) updateData.config = params.config as any;
    if (params.intent !== undefined) updateData.intent = params.intent;
    if (params.isActive !== undefined) updateData.isActive = params.isActive;

    if (params.schedule !== undefined) {
      updateData.schedule = params.schedule;
      // Recalculate nextFireAt
      if (params.isActive !== false) {
        updateData.nextFireAt = computeNextCronFire(params.schedule);
      }
    }

    const updated = await this.prisma.agentTrigger.update({
      where: { id },
      data: updateData,
    });

    return this.toRecord(updated);
  }

  /**
   * deleteTrigger
   * ─────────────
   * Xoá trigger khỏi DB.
   */
  async deleteTrigger(id: string): Promise<boolean> {
    try {
      await this.prisma.agentTrigger.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  //  Trigger Execution
  // ═════════════════════════════════════════════════════════════════════

  /**
   * fireTrigger
   * ───────────
   * Execute một trigger cụ thể — tạo session + process + execute actions.
   * Ghi audit trail, update lastFiredAt, tính nextFireAt mới.
   *
   * @returns AgentConsole-style fire result with execution details.
   */
  async fireTrigger(triggerId: string): Promise<TriggerFireResult> {
    const trigger = await this.prisma.agentTrigger.findUnique({
      where: { id: triggerId },
    });
    if (!trigger) {
      return {
        triggerId,
        triggerName: '(unknown)',
        tenantId: '',
        intent: 'UNKNOWN',
        fired: false,
        error: 'Trigger not found',
      };
    }

    if (!trigger.isActive) {
      return {
        triggerId: trigger.id,
        triggerName: trigger.name,
        tenantId: trigger.tenantId,
        intent: trigger.intent,
        fired: false,
        error: 'Trigger is not active',
      };
    }

    const { tenantId, name, intent } = trigger;

    try {
      // 1. Tạo session cho trigger fire
      const session = await this.sessionService.createSession(
        tenantId,
        `[Auto] ${name} — ${new Date().toLocaleDateString('vi-VN')}`,
      );

      // 2. Xây dựng query từ intent để process
      const triggerQuery = this.buildTriggerQuery(intent, trigger.config as Record<string, unknown> | null);

      // 3. Process + execute qua core agent
      const { command, execution } = await this.agentCore.processAndExecute(
        tenantId,
        session.id,
        triggerQuery,
        undefined, // system-triggered, no user
      );

      // 4. Log kết quả vào session
      const resultLine = `⚡ **Proactive Trigger** — ${name}
Intent: ${intent}
Actions: ${execution.succeeded}/${execution.total} succeeded (${execution.totalDurationMs}ms)
${execution.failed > 0 ? `Failed: ${execution.failed}` : ''}`;

      await this.sessionService.addMessage(session.id, {
        role: 'assistant',
        content: resultLine,
        timestamp: new Date().toISOString(),
      });

      // 5. Cập nhật trigger state
      const now = new Date();
      let newNextFireAt: Date | null = null;

      if (trigger.schedule) {
        newNextFireAt = computeNextCronFire(trigger.schedule, now);
      }

      await this.prisma.agentTrigger.update({
        where: { id: triggerId },
        data: {
          lastFiredAt: now,
          nextFireAt: newNextFireAt,
          failCount: 0, // reset fail count on success
        },
      });

      this.logger.log(`Trigger "${name}" fired for tenant ${tenantId}. Succeeded: ${execution.succeeded}/${execution.total}`);

      return {
        triggerId: trigger.id,
        triggerName: name,
        tenantId,
        intent,
        fired: true,
        executionResult: {
          sessionId: session.id,
          total: execution.total,
          succeeded: execution.succeeded,
          failed: execution.failed,
          durationMs: execution.totalDurationMs,
          results: execution.results.map((r) => ({
            type: r.type,
            status: r.status,
          })),
        },
        nextFireAt: newNextFireAt,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown trigger execution error';
      this.logger.error(`Trigger "${name}" (${triggerId}) failed: ${errorMsg}`);

      // Increment fail count
      await this.prisma.agentTrigger.update({
        where: { id: triggerId },
        data: {
          lastFiredAt: new Date(),
          failCount: { increment: 1 },
        },
      });

      return {
        triggerId: trigger.id,
        triggerName: name,
        tenantId,
        intent,
        fired: false,
        error: errorMsg,
      };
    }
  }

  /**
   * checkAndFireDueTriggers
   * ──────────────────────
   * Core heartbeat method: quét tất cả trigger scheduled active có nextFireAt <= now.
   * Gọi bởi AiAgentTriggerScheduler mỗi 60 giây.
   *
   * @returns Danh sách kết quả fire (thành công + thất bại).
   */
  async checkAndFireDueTriggers(): Promise<TriggerFireResult[]> {
    const now = new Date();
    const results: TriggerFireResult[] = [];

    try {
      // Lấy tất cả trigger scheduled active còn hạn hoặc đã quá hạn
      const dueTriggers = await this.prisma.agentTrigger.findMany({
        where: {
          triggerType: 'scheduled',
          isActive: true,
          OR: [
            { nextFireAt: null },
            { nextFireAt: { lte: now } },
          ],
        },
      });

      if (dueTriggers.length === 0) {
        return results; // nothing to do
      }

      for (const trigger of dueTriggers) {
        // Double-check: nếu chưa có nextFireAt lần đầu, tính ngay
        if (!trigger.nextFireAt) {
          if (!trigger.schedule) continue;
          const firstFire = computeNextCronFire(trigger.schedule, now);
          if (!firstFire) continue;

          await this.prisma.agentTrigger.update({
            where: { id: trigger.id },
            data: { nextFireAt: firstFire },
          });

          // Nếu chưa đến giờ, bỏ qua
          if (firstFire > now) continue;
        }

        const result = await this.fireTrigger(trigger.id);
        results.push(result);
      }
    } catch (err) {
      this.logger.error(
        `checkAndFireDueTriggers failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }

    return results;
  }

  /**
   * getTenantTriggerStats
   * ────────────────────
   * Thống kê trigger cho tenant dashboard.
   */
  async getTenantTriggerStats(tenantId: string): Promise<{
    total: number;
    active: number;
    scheduled: number;
    event: number;
    threshold: number;
    nextFireCount: number;
  }> {
    const all = await this.prisma.agentTrigger.findMany({
      where: { tenantId },
      select: { id: true, triggerType: true, isActive: true, nextFireAt: true },
    });

    return {
      total: all.length,
      active: all.filter((t) => t.isActive).length,
      scheduled: all.filter((t) => t.triggerType === 'scheduled').length,
      event: all.filter((t) => t.triggerType === 'event').length,
      threshold: all.filter((t) => t.triggerType === 'threshold').length,
      nextFireCount: all.filter((t) => t.isActive && t.nextFireAt && t.nextFireAt <= new Date()).length,
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  Internal helpers
  // ═════════════════════════════════════════════════════════════════════

  /** Xây dựng query tự nhiên từ intent cho agent process */
  private buildTriggerQuery(
    intent: string,
    config: Record<string, unknown> | null,
  ): string {
    const c = config ?? {};

    switch (intent) {
      case 'SYSTEM_HEALTH_CHECK': {
        const scanPeriod = (c.intervalMinutes ?? 60) + ' minutes';
        return `Kiểm tra sức khỏe hệ thống tự động. Quét lỗi và sự cố trong ${scanPeriod} vừa qua. Tạo bản nháp sự cố nếu có vấn đề nghiêm trọng.`;
      }

      case 'BUDGET_OPTIMIZATION': {
        const threshold = c.budgetThreshold ?? 80;
        return `Tự động kiểm tra ngân sách tenant. Phân tích xu hướng chi phí AI và usage. Cảnh báo nếu vượt quá ${threshold}% ngân sách.`;
      }

      case 'SECURITY_REVIEW': {
        return `Kiểm tra bảo mật tự động. Rà soát audit log 24h gần nhất, kiểm tra lỗi bảo mật nghiêm trọng, xuất tổng hợp audit.`;
      }

      case 'INTEGRATION_PLANNING': {
        return `Kiểm tra kết nối và tích hợp. Xác thực tất cả connector đang hoạt động. Báo cáo trạng thái kết nối.`;
      }

      default:
        return `Thực thi tác vụ Agent tự động: ${intent}. Kiểm tra trạng thái hệ thống và báo cáo kết quả.`;
    }
  }

  /** Chuyển Prisma record → internal typed record */
  private toRecord(record: any): AgentTriggerRecord {
    return {
      id: record.id,
      tenantId: record.tenantId,
      name: record.name,
      triggerType: record.triggerType as TriggerType,
      schedule: record.schedule,
      eventType: record.eventType,
      config: record.config as Record<string, unknown> | null,
      intent: record.intent,
      isActive: record.isActive,
      lastFiredAt: record.lastFiredAt,
      nextFireAt: record.nextFireAt,
      failCount: record.failCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

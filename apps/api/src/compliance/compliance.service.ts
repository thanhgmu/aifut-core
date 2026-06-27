// ═══════════════════════════════════════════════════════════════════════════
// compliance.service.ts — Compliance & Audit Trail Engine
// ═══════════════════════════════════════════════════════════════════════════
// Truy vấn audit log, tạo compliance reports, export.
// Sử dụng model AuditEvent (primary) + AuditLog (secondary) có sẵn trong schema.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// ── Types ─────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  actor: string | null;
  actorType: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ComplianceReport {
  period: { from: string; to: string };
  summary: {
    totalActions: number;
    uniqueActors: number;
    uniqueActions: number;
    topActions: Array<{ action: string; count: number }>;
    topActors: Array<{ actor: string; count: number }>;
    actionsByDay: Array<{ date: string; count: number }>;
  };
  generatedAt: string;
}

export interface PaginatedAuditLog {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * getAuditLog
   * ───────────
   * Lấy audit log cho một tenant, có filter + pagination.
   * Dùng model AuditEvent (chi tiết hơn).
   */
  async getAuditLog(
    tenantId: string,
    options: {
      action?: string;
      actorType?: string;
      targetType?: string;
      from?: string;
      to?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const { action, actorType, targetType, from, to, search, page = 1, pageSize = 20 } = options;
    const where: any = { tenantId };

    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (actorType) where.actorType = actorType;
    if (targetType) where.targetType = targetType;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const safePage = Math.max(1, page);
    const safePageSize = Math.min(Math.max(1, pageSize), 100);
    const skip = (safePage - 1) * safePageSize;

    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        include: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safePageSize,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return {
      items: items.map((e) => ({
        id: e.id,
        timestamp: e.createdAt,
        actor: e.user?.email || e.actorEmail || 'system',
        actorType: e.actorType,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        metadata: e.metadata as Record<string, unknown> | null,
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
    };
  }

  /**
   * getAuditLogV2
   * ─────────────
   * Backup query dùng model AuditLog (nếu AuditEvent không có data).
   */
  async getAuditLogV2(
    tenantId: string,
    options: {
      action?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const { action, from, to, page = 1, pageSize = 20 } = options;
    const where: any = { tenantId };

    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const safePage = Math.max(1, page);
    const safePageSize = Math.min(Math.max(1, pageSize), 100);
    const skip = (safePage - 1) * safePageSize;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safePageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((e) => ({
        id: e.id,
        timestamp: e.createdAt,
        actor: e.actor?.email || 'system',
        actorType: 'user',
        action: e.action,
        targetType: e.entityType,
        targetId: e.entityId,
        metadata: e.metadata as Record<string, unknown> | null,
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
    };
  }

  /**
   * getComplianceReport
   * ────────────────────
   * Tạo báo cáo compliance cho tenant.
   */
  async getComplianceReport(
    tenantId: string,
    options: { from?: string; to?: string } = {},
  ) {
    const now = new Date();
    const from = options.from
      ? new Date(options.from)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
    const to = options.to ? new Date(options.to) : now;

    // Get all events in period
    const events = await this.prisma.auditEvent.findMany({
      where: {
        tenantId,
        createdAt: { gte: from, lte: to },
      },
      select: { action: true, actorType: true, actorEmail: true, createdAt: true },
    });

    // Count unique actors
    const actorSet = new Set<string>();
    events.forEach((e) => {
      if (e.actorEmail) actorSet.add(e.actorEmail);
      if (e.actorType) actorSet.add(`type:${e.actorType}`);
    });

    // Top actions
    const actionCount = new Map<string, number>();
    events.forEach((e) => {
      actionCount.set(e.action, (actionCount.get(e.action) || 0) + 1);
    });
    const topActions = Array.from(actionCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([action, count]) => ({ action, count }));

    // Top actors
    const actorCount = new Map<string, number>();
    events.forEach((e) => {
      const key = e.actorEmail || e.actorType || 'unknown';
      actorCount.set(key, (actorCount.get(key) || 0) + 1);
    });
    const topActors = Array.from(actorCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([actor, count]) => ({ actor, count }));

    // Actions by day
    const dayCount = new Map<string, number>();
    events.forEach((e) => {
      const day = e.createdAt.toISOString().slice(0, 10);
      dayCount.set(day, (dayCount.get(day) || 0) + 1);
    });
    const actionsByDay = Array.from(dayCount.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    const uniqueActions = new Set(events.map((e) => e.action)).size;

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        totalActions: events.length,
        uniqueActors: actorSet.size,
        uniqueActions,
        topActions,
        topActors,
        actionsByDay,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * exportAuditLog
   * �─────────────
   * Export audit log ra CSV format.
   */
  async exportAuditLog(
    tenantId: string,
    options: { from?: string; to?: string; format?: 'csv' | 'json' } = {},
  ): Promise<{ data: string; mimeType: string; filename: string }> {
    const { from, to, format = 'csv' } = options;
    const where: any = { tenantId };

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const events = await this.prisma.auditEvent.findMany({
      where,
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10000, // Reasonable limit
    });

    const lines = events.map((e) => ({
      timestamp: e.createdAt.toISOString(),
      actor: e.user?.email || e.actorEmail || 'system',
      actorType: e.actorType,
      action: e.action,
      targetType: e.targetType || '',
      targetId: e.targetId || '',
      metadata: JSON.stringify(e.metadata || {}),
    }));

    if (format === 'json') {
      return {
        data: JSON.stringify(lines, null, 2),
        mimeType: 'application/json',
        filename: `audit-log-${tenantId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`,
      };
    }

    // CSV
    const headers = ['Timestamp', 'Actor', 'ActorType', 'Action', 'TargetType', 'TargetId', 'Metadata'];
    const csvRows = [headers.join(','), ...lines.map((l) =>
      [l.timestamp, `"${l.actor}"`, l.actorType, `"${l.action}"`, `"${l.targetType}"`, `"${l.targetId}"`, `"${l.metadata.replace(/"/g, '""')}"`].join(','),
    )];

    return {
      data: csvRows.join('\n'),
      mimeType: 'text/csv',
      filename: `audit-log-${tenantId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  }
}

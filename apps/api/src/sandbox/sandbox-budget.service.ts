// ===================================================================
// sandbox-budget.service.ts — Sandbox Cost Simulation & Budget Service
// Phase 4: Developer Sandbox Core
// In-Memory-First — hỗ trợ standalone mode (không cần DB)
// ===================================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// ── Types ──────────────────────────────────────────────────────────────

export interface BudgetResponse {
  id: string;
  tenantId: string;
  sessionId?: string;
  monthlyLimit: string; // BigInt serialized as string
  currentSpend: string;
  usedPercent: number;
  alertThreshold: number;
  isActive: boolean;
  status: 'NORMAL' | 'ALERT' | 'CRITICAL' | 'EXCEEDED';
  alerts: BudgetAlertResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetAlertResponse {
  id: string;
  budgetId: string;
  message: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  dismissedAt: boolean;
  createdAt: Date;
}

export interface CreateBudgetInput {
  tenantId: string;
  sessionId?: string;
  monthlyLimit?: bigint;
  alertThreshold?: number;
}

export interface TrackSpendInput {
  sessionId?: string;
  tenantId: string;
  cost: bigint;
  description?: string;
  requestId?: string;
}

export interface BudgetCheckResult {
  withinBudget: boolean;
  usedPercent: number;
  status: 'NORMAL' | 'ALERT' | 'CRITICAL' | 'EXCEEDED';
  remaining: string;
  alert?: string;
}

// ── In-Memory store ──────────────────────────────────────────────────

interface MemoryBudget {
  id: string;
  tenantId: string;
  sessionId?: string;
  monthlyLimit: bigint;
  totalBudget: bigint;
  currentSpend: bigint;
  alertThreshold: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MemoryAlert {
  id: string;
  budgetId: string;
  message: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  dismissedAt: boolean;
  createdAt: Date;
}

class InMemoryBudgetStore {
  private budgets: Map<string, MemoryBudget> = new Map();
  private alerts: Map<string, MemoryAlert> = new Map();
  private alertSequence = 0;

  createBudget(data: MemoryBudget) {
    this.budgets.set(data.id, data);
    return data;
  }

  findById(id: string) {
    return this.budgets.get(id) ?? null;
  }

  findByTenant(tenantId: string): MemoryBudget[] {
    return Array.from(this.budgets.values()).filter(
      (b) => b.tenantId === tenantId,
    );
  }

  findBySession(sessionId: string): MemoryBudget | null {
    for (const b of this.budgets.values()) {
      if (b.sessionId === sessionId) return b;
    }
    return null;
  }

  findTenantDefault(tenantId: string): MemoryBudget | null {
    for (const b of this.budgets.values()) {
      if (b.tenantId === tenantId && !b.sessionId) return b;
    }
    return null;
  }

  updateSpend(id: string, additionalCost: bigint) {
    const b = this.budgets.get(id);
    if (b) {
      b.currentSpend += additionalCost;
      b.updatedAt = new Date();
      this.budgets.set(id, b);
    }
    return b;
  }

  addAlert(alert: MemoryAlert) {
    this.alerts.set(alert.id, alert);
    return alert;
  }

  getAlerts(budgetId: string): MemoryAlert[] {
    return Array.from(this.alerts.values())
      .filter((a) => a.budgetId === budgetId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  acknowledgeAlert(alertId: string) {
    const a = this.alerts.get(alertId);
    if (a) {
      a.dismissedAt = true;
      this.alerts.set(alertId, a);
    }
    return a;
  }

  delete(id: string) {
    this.budgets.delete(id);
  }
}

// ── Service ────────────────────────────────────────────────────────────

@Injectable()
export class SandboxBudgetService {
  private store = new InMemoryBudgetStore();
  private useMemory = false;

  constructor(
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.useMemory = !prisma;
  }

  setInMemoryMode(val: boolean) {
    this.useMemory = val;
  }

  // ── Create budget ───────────────────────────────────────────────

  /**
   * createBudget
   * Tạo budget cho tenant (tenant-wide) hoặc một session cụ thể.
   * - monthlyLimit: hạn mức tháng (BigInt, đơn vị VND virtual)
   * - alertThreshold: % để gửi cảnh báo (mặc định 80%)
   */
  async createBudget(input: CreateBudgetInput): Promise<BudgetResponse> {
    if (!input.tenantId) {
      throw new BadRequestException('tenantId is required.');
    }

    const monthlyLimit = input.monthlyLimit ?? BigInt(10_000_000); // 10M VND
    const alertThreshold =
      input.alertThreshold != null
        ? Math.max(0, Math.min(1, input.alertThreshold))
        : 0.8;

    // Check duplicate: chỉ 1 budget tenant-wide hoặc 1 budget/session
    if (this.useMemory) {
      if (!input.sessionId) {
        const existing = this.store.findTenantDefault(input.tenantId);
        if (existing) {
          throw new BadRequestException(
            'Tenant-wide budget already exists. Use update instead.',
          );
        }
      } else {
        const existing = this.store.findBySession(input.sessionId!);
        if (existing) {
          throw new BadRequestException(
            'Session already has a budget. Use update instead.',
          );
        }
      }
    } else {
      if (!input.sessionId) {
        const existing = await (this.prisma!.sandboxBudget as any).findFirst({
          where: { tenantId: input.tenantId, sessionId: null },
        });
        if (existing) {
          throw new BadRequestException(
            'Tenant-wide budget already exists.',
          );
        }
      } else {
        const existing = await (this.prisma!.sandboxBudget as any).findFirst({
          where: { sessionId: input.sessionId },
        });
        if (existing) {
          throw new BadRequestException(
            'Session already has a budget.',
          );
        }
      }
    }

    if (this.useMemory) {
      const id = crypto.randomUUID();
      const budget: MemoryBudget = {
        id,
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        monthlyLimit: BigInt(monthlyLimit),
        totalBudget: BigInt(monthlyLimit),
        currentSpend: BigInt(0),
        alertThreshold: 0.8,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.store.createBudget(budget);
      return this.toBudgetResponse(budget, []);
    }

    const budget = await (this.prisma!.sandboxBudget as any).create({
      data: {
        tenantId: input.tenantId,
        sessionId: input.sessionId ?? undefined,
        totalBudget: BigInt(monthlyLimit),
        
      },
    });

    return this.toBudgetResponse(budget, []);
  }

  // ── Track spend ─────────────────────────────────────────────────

  /**
   * trackSpend
   * Ghi nhận chi phí và cập nhật currentSpend.
   * Tự động sinh alert nếu vượt threshold hoặc exceeded.
   */
  async trackSpend(input: TrackSpendInput): Promise<BudgetCheckResult> {
    // Find applicable budget: session-specific > tenant-wide
    let budget: any = null;

    if (this.useMemory) {
      if (input.sessionId) {
        budget = this.store.findBySession(input.sessionId);
      }
      if (!budget) {
        budget = this.store.findTenantDefault(input.tenantId);
      }
    } else {
      if (input.sessionId) {
        budget = await (this.prisma!.sandboxBudget as any).findFirst({
          where: { sessionId: input.sessionId },
          include: { alerts: { include: {} } },
        });
      }
      if (!budget) {
        budget = await (this.prisma!.sandboxBudget as any).findFirst({
          where: { tenantId: input.tenantId, sessionId: null },
          include: { alerts: { include: {} } },
        });
      }
    }

    if (!budget) {
      // No budget set — allow unlimited (no spend tracking)
      return {
        withinBudget: true,
        usedPercent: 0,
        status: 'NORMAL',
        remaining: 'UNLIMITED',
      };
    }

    // Update spend
    if (this.useMemory) {
      this.store.updateSpend(budget.id, input.cost);
      budget = this.store.findById(budget.id)!;
    } else {
      budget = await (this.prisma!.sandboxBudget as any).update({
        where: { id: budget.id },
        data: { currentSpend: { increment: BigInt(input.cost) } },
        include: { alerts: { include: {} } },
      });
    }

    const usedPercent =
      budget.monthlyLimit > 0
        ? Number((budget.currentSpend * BigInt(100)) / budget.monthlyLimit)
        : 0;

    const remaining = budget.monthlyLimit - budget.currentSpend;

    // Check thresholds and generate alerts
    let status: 'NORMAL' | 'ALERT' | 'CRITICAL' | 'EXCEEDED' = 'NORMAL';
    let alertMessage: string | undefined;

    if (usedPercent >= 100) {
      status = 'EXCEEDED';
      alertMessage = `Sandbox budget EXCEEDED! Spent ${this.formatVND(budget.currentSpend)} of ${this.formatVND(budget.monthlyLimit)}.`;
      await this.maybeCreateAlert(budget.id, alertMessage, 'CRITICAL');
    } else if (usedPercent >= 95) {
      status = 'CRITICAL';
      alertMessage = `Sandbox budget critically low: ${usedPercent}% used. Remaining: ${this.formatVND(BigInt(remaining))}.`;
      await this.maybeCreateAlert(budget.id, alertMessage, 'CRITICAL');
    } else if (usedPercent >= budget.alertThreshold * 100) {
      status = 'ALERT';
      alertMessage = `Sandbox budget alert: ${usedPercent}% used (threshold: ${budget.alertThreshold * 100}%).`;
      await this.maybeCreateAlert(budget.id, alertMessage, 'WARNING');
    }

    return {
      withinBudget: status !== 'EXCEEDED',
      usedPercent,
      status,
      remaining: remaining.toString(),
      alert: alertMessage,
    };
  }

  // ── Check budget ───────────────────────────────────────────────

  /**
   * checkBudget
   * Kiểm tra trạng thái budget hiện tại (không ghi nhận spend).
   */
  async checkBudget(
    sessionId?: string,
    tenantId?: string,
  ): Promise<BudgetCheckResult> {
    let budget: any = null;

    if (this.useMemory) {
      if (sessionId) {
        budget = this.store.findBySession(sessionId);
      }
      if (!budget && tenantId) {
        budget = this.store.findTenantDefault(tenantId);
      }
    } else {
      if (sessionId) {
        budget = await (this.prisma!.sandboxBudget as any).findFirst({
          where: { sessionId },
        });
      }
      if (!budget && tenantId) {
        budget = await (this.prisma!.sandboxBudget as any).findFirst({
          where: { tenantId, sessionId: null },
        });
      }
    }

    if (!budget) {
      return {
        withinBudget: true,
        usedPercent: 0,
        status: 'NORMAL',
        remaining: 'NO_BUDGET_SET',
      };
    }

    const usedPercent =
      budget.monthlyLimit > 0
        ? Number((budget.currentSpend * BigInt(100)) / budget.monthlyLimit)
        : 0;

    const remaining = budget.monthlyLimit - budget.currentSpend;

    let status: 'NORMAL' | 'ALERT' | 'CRITICAL' | 'EXCEEDED' = 'NORMAL';
    if (usedPercent >= 100) status = 'EXCEEDED';
    else if (usedPercent >= 95) status = 'CRITICAL';
    else if (usedPercent >= budget.alertThreshold * 100) status = 'ALERT';

    return {
      withinBudget: status !== 'EXCEEDED',
      usedPercent,
      status,
      remaining: remaining.toString(),
    };
  }

  // ── Get budget ─────────────────────────────────────────────────

  async getBudget(budgetId: string): Promise<BudgetResponse> {
    if (this.useMemory) {
      const budget = this.store.findById(budgetId);
      if (!budget) {
        throw new NotFoundException(`Budget "${budgetId}" not found.`);
      }
      const alerts = this.store.getAlerts(budgetId);
      return this.toBudgetResponse(budget, alerts);
    }

    const budget = await (this.prisma!.sandboxBudget as any).findUnique({
      where: { id: budgetId },
      include: { alerts: { include: {} } },
    });
    if (!budget) {
      throw new NotFoundException(`Budget "${budgetId}" not found.`);
    }

    return this.toBudgetResponse(budget, budget.alerts ?? []);
  }

  async getTenantBudgets(tenantId: string): Promise<BudgetResponse[]> {
    if (this.useMemory) {
      const budgets = this.store.findByTenant(tenantId);
      return budgets.map((b) =>
        this.toBudgetResponse(b, this.store.getAlerts(b.id)),
      );
    }

    const budgets = await (this.prisma!.sandboxBudget as any).findMany({
      where: { tenantId },
      include: { alerts: { include: {} } },
      orderBy: { createdAt: 'desc' },
    });

    return budgets.map((b) =>
      this.toBudgetResponse(b, b.alerts ?? []),
    );
  }

  // ── Acknowledge alert ──────────────────────────────────────────

  async acknowledgeAlert(alertId: string): Promise<BudgetAlertResponse> {
    if (this.useMemory) {
      const alert = this.store.acknowledgeAlert(alertId);
      if (!alert) {
        throw new NotFoundException(`Alert "${alertId}" not found.`);
      }
      return this.toAlertResponse(alert);
    }

    const alert = await (this.prisma!.sandboxBudgetAlert as any).update({
      where: { id: alertId },
      data: { dismissedAt: true },
    });

    return this.toAlertResponse(alert);
  }

  // ── Delete budget ──────────────────────────────────────────────

  async deleteBudget(budgetId: string): Promise<void> {
    if (this.useMemory) {
      const budget = this.store.findById(budgetId);
      if (!budget) {
        throw new NotFoundException(`Budget "${budgetId}" not found.`);
      }
      this.store.delete(budgetId);
      return;
    }

    const budget = await (this.prisma!.sandboxBudget as any).findUnique({
      where: { id: budgetId },
    });
    if (!budget) {
      throw new NotFoundException(`Budget "${budgetId}" not found.`);
    }

    await (this.prisma!.sandboxBudget as any).delete({
      where: { id: budgetId },
    });
  }

  // ── Private helpers ─────────────────────────────────────────────

  private async maybeCreateAlert(
    budgetId: string,
    message: string,
    level: 'WARNING' | 'CRITICAL',
  ): Promise<void> {
    // Check last alert to avoid spam (only create if no identical alert in last 5 min)
    if (this.useMemory) {
      const existingAlerts = this.store.getAlerts(budgetId);
      const recent = existingAlerts.find(
        (a) =>
          a.message === message &&
          Date.now() - a.createdAt.getTime() < 300_000, // 5 min
      );
      if (recent) return;

      const id = crypto.randomUUID();
      this.store.addAlert({
        id,
        level: "WARNING",
        budgetId,
        message,
        
        dismissedAt: false,
        createdAt: new Date(),
      });
      return;
    }

    const recent = await (this.prisma!.sandboxBudgetAlert as any).findFirst({
      where: {
        budgetId,
        message,
        createdAt: { gte: new Date(Date.now() - 300_000) },
      },
    });
    if (recent) return;

    await (this.prisma!.sandboxBudgetAlert as any).create({
      data: { budgetId, message, level },
    });
  }

  private formatVND(amount: bigint): string {
    const vnd = Number(amount).toLocaleString('vi-VN');
    return `${vnd} VND`;
  }

  private toBudgetResponse(
    budget: any,
    alerts: any[],
  ): BudgetResponse {
    const monthlyLimit = BigInt(budget.monthlyLimit ?? 0);
    const currentSpend = BigInt(budget.currentSpend ?? 0);
    const usedPercent =
      monthlyLimit > 0
        ? Number((currentSpend * BigInt(100)) / monthlyLimit)
        : 0;

    let status: 'NORMAL' | 'ALERT' | 'CRITICAL' | 'EXCEEDED' = 'NORMAL';
    if (usedPercent >= 100) status = 'EXCEEDED';
    else if (usedPercent >= 95) status = 'CRITICAL';
    else if (usedPercent >= (budget.alertThreshold ?? 0.8) * 100)
      status = 'ALERT';

    return {
      id: budget.id,
      tenantId: budget.tenantId,
      sessionId: budget.sessionId ?? undefined,
      monthlyLimit: monthlyLimit.toString(),
      currentSpend: currentSpend.toString(),
      usedPercent,
      alertThreshold: Number(budget.alertThreshold ?? 0.8),
      isActive: budget.isActive ?? true,
      status,
      alerts: (alerts ?? []).map((a: any) => this.toAlertResponse(a)),
      createdAt: budget.createdAt,
      updatedAt: budget.updatedAt,
    };
  }

  private toAlertResponse(alert: any): BudgetAlertResponse {
    return {
      id: alert.id,
      budgetId: alert.budgetId,
      message: alert.message,
      level: (alert as any).level,
      dismissedAt: (alert as any).dismissedAt ?? false,
      createdAt: alert.createdAt,
    };
  }
}

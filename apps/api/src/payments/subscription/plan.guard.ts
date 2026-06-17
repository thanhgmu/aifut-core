// ================================================================
// plan.guard.ts — Plan Limit Guard (CanActivate)
// ================================================================
// Module: apps/api/src/payments/subscription
//
// Kiểm tra hạn ngạch tài nguyên hệ thống trước khi request được
// xử lý bởi handler.
//
// Flow:
//   1. Đọc @PlanLimit({ resource, action }) từ handler (Reflector)
//   2. Trích xuất tenantId từ request context (header/body/accessPolicy)
//   3. Tra cứu Subscription active gần nhất của tenant
//   4. Lấy PlanDefinition → limit value cho resource
//   5. Nếu unlimited (-1) → skip
//   6. Đếm usage hiện tại trong DB cho resource đó
//   7. Nếu >= limit → action = 'block' → ForbiddenException
//                          'warn' / 'billable' → cho qua (có log)
//
// Usage:
//   @Post()
//   @UseGuards(PlanGuard)
//   @PlanLimit({ resource: 'workflows', action: 'create' })
//   async createWorkflow() { ... }
// ================================================================

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma.service';
import {
  PLAN_DEFINITIONS,
  isUnlimited,
  type PlanKey,
  type PlanDefinition,
  type OverLimitAction,
} from './plan.config';
import {
  PLAN_LIMIT_METADATA_KEY,
  PlanLimitOptions,
  PlanResource,
} from './plan.decorator';

/** Mapping PlanResource → PlanLimits field key */
const RESOURCE_TO_LIMIT_KEY: Record<
  PlanResource,
  keyof PlanDefinition['limits']
> = {
  users: 'maxUsers',
  workspaces: 'maxWorkspaces',
  workflows: 'maxWorkflows',
  workflow_nodes: 'maxWorkflowNodes',
  connectors: 'maxConnectors',
  notifications: 'maxNotifications',
  ai_calls: 'aiCallsMonthly',
  storage: 'storageGB',
  bandwidth: 'bandwidthGB',
  api_rate: 'apiRateLimit',
};

/** Mapping PlanResource → OverLimitPolicy field key */
const RESOURCE_TO_POLICY_KEY: Record<
  PlanResource,
  keyof PlanDefinition['overLimitPolicy']
> = {
  users: 'users',
  workspaces: 'users', // fallback — workspaces dùng policy mặc định
  workflows: 'workflows',
  workflow_nodes: 'workflows', // nodes theo policy workflow
  connectors: 'connectors',
  notifications: 'workflows',
  ai_calls: 'aiCalls',
  storage: 'storage',
  bandwidth: 'storage',
  api_rate: 'workflows',
};

@Injectable()
export class PlanGuard implements CanActivate {
  private readonly logger = new Logger(PlanGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<PlanLimitOptions>(
      PLAN_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Không có decorator → không kiểm tra
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantId = this.extractTenantId(request);

    if (!tenantId) {
      this.logger.warn('PlanGuard: No tenant context found in request');
      throw new ForbiddenException('PLAN_LIMIT_REACHED');
    }

    // ═══════════════════════════════════════════════════════════
    // Tra cứu Subscription active gần nhất
    // ═══════════════════════════════════════════════════════════
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['active', 'trialing'] } },
      orderBy: { createdAt: 'desc' },
    });

    const planKey = (subscription?.planKey ?? 'free') as PlanKey;
    const plan = PLAN_DEFINITIONS[planKey];

    if (!plan) {
      this.logger.error(`PlanGuard: Unknown plan key '${planKey}' for tenant ${tenantId}`);
      throw new ForbiddenException('PLAN_LIMIT_REACHED');
    }

    const { resource, action } = options;

    // ═══════════════════════════════════════════════════════════
    // Lấy limit value cho resource
    // ═══════════════════════════════════════════════════════════
    const limitKey = RESOURCE_TO_LIMIT_KEY[resource];
    const limitValue = plan.limits[limitKey] ?? -1;

    // -1 = unlimited → cho qua
    if (isUnlimited(limitValue)) {
      return true;
    }

    // ═══════════════════════════════════════════════════════════
    // Đếm usage hiện tại
    // ═══════════════════════════════════════════════════════════
    const currentCount = await this.countUsage(resource, tenantId);

    if (currentCount >= limitValue) {
      // Xác định over-limit policy
      const policyKey = RESOURCE_TO_POLICY_KEY[resource];
      const overLimitAction: OverLimitAction =
        plan.overLimitPolicy[policyKey] ?? 'block';

      this.logger.warn(
        `[PlanGuard] LIMIT REACHED: tenant=${tenantId.slice(0, 8)} ` +
          `plan=${planKey} resource=${resource} ` +
          `limit=${limitValue} current=${currentCount} ` +
          `action=${action} policy=${overLimitAction}`,
      );

      if (overLimitAction === 'block') {
        throw new ForbiddenException('PLAN_LIMIT_REACHED');
      }
      // 'warn' → cho qua (đã log warning)
      // 'billable' → future: ghi nhận usage billable rồi cho qua
    }

    return true;
  }

  // ================================================================
  // Helpers
  // ================================================================

  /**
   * Trích xuất tenantId từ request context.
   * Ưu tiên: header > body > query > accessPolicy (từ AccessPolicyGuard).
   * Không dùng params để tránh IDOR.
   */
  private extractTenantId(request: any): string | null {
    // 1) Header x-tenant-id (ưu tiên cao nhất)
    const headerId = request.headers?.['x-tenant-id'];
    if (typeof headerId === 'string' && headerId.trim()) {
      return headerId.trim();
    }
    // Array header → lấy phần tử đầu
    if (Array.isArray(headerId) && headerId.length > 0) {
      return headerId[0].trim();
    }

    // 2) Body (được gửi kèm request)
    if (typeof request.body?.tenantId === 'string' && request.body.tenantId.trim()) {
      return request.body.tenantId.trim();
    }

    // 3) Query string
    if (typeof request.query?.tenantId === 'string' && request.query.tenantId.trim()) {
      return request.query.tenantId.trim();
    }

    // 4) Resolve từ accessPolicy (được gán bởi AccessPolicyGuard)
    if (request.accessPolicy?.tenant?.id) {
      return request.accessPolicy.tenant.id;
    }

    return null;
  }

  /**
   * Đếm số lượng usage hiện tại của tenant cho một resource.
   * Mỗi resource có strategy đếm riêng phù hợp với schema.
   */
  private async countUsage(
    resource: PlanResource,
    tenantId: string,
  ): Promise<number> {
    switch (resource) {
      // ──────────────────────────────────────────────────────────
      case 'users':
        return this.prisma.membership.count({
          where: { tenantId },
        });

      // ──────────────────────────────────────────────────────────
      case 'workspaces':
        return this.prisma.workspace.count({
          where: { tenantId },
        });

      // ──────────────────────────────────────────────────────────
      case 'workflows':
        return this.prisma.workflowTemplate.count({
          where: { tenantId },
        });

      // ──────────────────────────────────────────────────────────
      case 'workflow_nodes': {
        // Đếm tổng số node trong tất cả workflow của tenant
        const wfIds = await this.prisma.workflowTemplate.findMany({
          where: { tenantId },
          select: { id: true },
        });
        if (wfIds.length === 0) return 0;
        return this.prisma.workflowNode.count({
          where: { workflowId: { in: wfIds.map((w) => w.id) } },
        });
      }

      // ──────────────────────────────────────────────────────────
      case 'connectors':
        return this.prisma.integrationConnection.count({
          where: { tenantId },
        });

      // ──────────────────────────────────────────────────────────
      case 'notifications': {
        const monthStart = this.currentMonthStart();
        return this.prisma.notificationLog.count({
          where: { tenantId, createdAt: { gte: monthStart } },
        });
      }

      // ──────────────────────────────────────────────────────────
      case 'ai_calls': {
        const monthStart = this.currentMonthStart();
        const agg = await this.prisma.usageRecord.aggregate({
          where: {
            tenantId,
            category: 'ai',
            recordedAt: { gte: monthStart },
          },
          _sum: { value: true },
        });
        return Math.round(Number(agg._sum.value ?? 0));
      }

      // ──────────────────────────────────────────────────────────
      case 'storage': {
        const agg = await this.prisma.usageRecord.aggregate({
          where: { tenantId, category: 'storage' },
          _sum: { value: true },
        });
        return Math.round(Number(agg._sum.value ?? 0));
      }

      // ──────────────────────────────────────────────────────────
      case 'bandwidth': {
        const monthStart = this.currentMonthStart();
        const agg = await this.prisma.usageRecord.aggregate({
          where: {
            tenantId,
            category: 'bandwidth',
            recordedAt: { gte: monthStart },
          },
          _sum: { value: true },
        });
        return Math.round(Number(agg._sum.value ?? 0));
      }

      // ──────────────────────────────────────────────────────────
      case 'api_rate':
        // API rate limit được enforce ở tầng HTTP (express-rate-limit).
        // PlanGuard không cần count ở đây.
        return 0;

      default:
        return 0;
    }
  }

  /** Trả về thời điểm đầu tháng hiện tại (UTC) */
  private currentMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

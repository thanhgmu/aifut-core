// ================================================================
// plan.decorator.ts — @PlanLimit Decorator
// ================================================================
// Module: apps/api/src/payments/subscription
//
// Gắn siêu dữ liệu hạn ngạch tài nguyên lên handler.
// PlanGuard đọc metadata này để kiểm tra và chặn request vượt ngưỡng.
//
// Cách dùng:
//   @Post('create')
//   @PlanLimit({ resource: 'workflows', action: 'create' })
//   async createWorkflow(@Body() body: CreateWorkflowDto) { ... }
//
// Supported resources: users, workspaces, workflows, workflow_nodes,
//   connectors, notifications, ai_calls, storage, bandwidth, api_rate
// ================================================================

import { SetMetadata } from '@nestjs/common';

/** Key để Reflector đọc siêu dữ liệu PlanLimit */
export const PLAN_LIMIT_METADATA_KEY = 'plan_limit';

/**
 * Loại tài nguyên có giới hạn trong PlanDefinitions.
 * Mapping tới PlanLimits: users→maxUsers, workflows→maxWorkflows, v.v.
 */
export type PlanResource =
  | 'users'
  | 'workspaces'
  | 'workflows'
  | 'workflow_nodes'
  | 'connectors'
  | 'notifications'
  | 'ai_calls'
  | 'storage'
  | 'bandwidth'
  | 'api_rate';

/**
 * Hành động được thực hiện — mang tính ghi chú để
 * PlanGuard log ngữ cảnh khi chặn request.
 */
export type PlanAction = 'create' | 'invite' | 'upload' | 'call' | 'add' | 'attach';

/** Options cho @PlanLimit() */
export interface PlanLimitOptions {
  /** Tài nguyên cần kiểm tra giới hạn */
  resource: PlanResource;
  /** Hành động trigger (log/debug) */
  action: PlanAction;
  /**
   * Custom count key nếu endpoint cần override logic đếm mặc định.
   * reserved cho tương lai.
   */
  countKey?: string;
}

/**
 * @PlanLimit({ resource: 'ai_calls', action: 'call' })
 *
 * Gắn metadata lên handler để PlanGuard có thể đọc và kiểm tra
 * hạn ngạch tài nguyên của Workspace hiện tại.
 */
export const PlanLimit = (options: PlanLimitOptions) =>
  SetMetadata(PLAN_LIMIT_METADATA_KEY, options);

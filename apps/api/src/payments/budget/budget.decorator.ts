// ============================================================
// payments/budget/budget.decorator.ts
// @RequireBudgetPriority() decorator.
//
// Đánh dấu endpoint AI là "ưu tiên cao" — nếu budget đang
// ở trạng thái SOFT_LOCKED, request ưu tiên VẪN được phép đi qua.
// Request không gắn decorator này sẽ bị BudgetGuard chặn khi
// budget = SOFT_LOCKED.
//
// Dùng với BudgetGuard:
//   @Post('generate')
//   @RequireBudgetPriority(false)
//   @UseGuards(BudgetGuard)
//   async generate(@Body() body: GenerateDto) { ... }
//
//   @Post('critical-inference')
//   @RequireBudgetPriority(true)
//   @UseGuards(BudgetGuard)
//   async criticalInference(@Body() body: InferenceDto) { ... }
// ============================================================

import { SetMetadata } from '@nestjs/common';

/** Reflector key để BudgetGuard đọc metadata */
export const BUDGET_PRIORITY_METADATA_KEY = 'budget_priority';

/**
 * @RequireBudgetPriority(priority)
 *
 * @param priority - true = request ưu tiên (cho qua SOFT_LOCKED),
 *                   false = request thường (chặn khi SOFT_LOCKED trở lên).
 * Mặc định false (request thường — bảo vệ chặt).
 *
 * Không gắn decorator = tương đương priority=false.
 */
export const RequireBudgetPriority = (priority = false) =>
  SetMetadata(BUDGET_PRIORITY_METADATA_KEY, priority);

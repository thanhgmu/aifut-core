// ================================================================
// lib/plan-mapper.ts — Shared plan key ordering utility
// ================================================================
// Central ordering so both subscription lib and billing lib use the
// same sort order for plan columns/cards.
// ================================================================

import type { PlanKey } from '../types/subscription';

const PLAN_ORDER: Record<string, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3,
};

/** Map plan key → display order index (0=free, 3=enterprise) */
export function planOrder(key: string): number {
  return PLAN_ORDER[key] ?? 99;
}

/** Compare two plan keys: upgrade/downgrade/same/crossgrade */
export function comparePlanKeys(
  current: PlanKey | string,
  target: PlanKey | string,
): 'upgrade' | 'downgrade' | 'same' | 'crossgrade' {
  if (current === target) return 'same';
  const cur = planOrder(current);
  const tgt = planOrder(target);
  if (cur < tgt) return 'upgrade';
  if (cur > tgt) return 'downgrade';
  return 'crossgrade';
}

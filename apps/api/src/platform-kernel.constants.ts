export const PLATFORM_KERNEL_MODULES = [
  'auth',
  'memberships',
  'sessions',
  'integrations',
  'entitlements',
  'audit',
] as const;

export const PLATFORM_KERNEL_NEXT_STEPS = [
  'generate-and-apply-prisma-migration',
  'persist-connection-instances-and-mapping-profiles',
  'add-actor-context-guard',
  'add-current-tenant-and-workspace-resolution',
  'add-audit-event-writer',
  'add-domain-and-storage-routing-policy',
] as const;

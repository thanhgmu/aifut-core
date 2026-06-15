import { Module, Global } from '@nestjs/common';

function readEnv(key: string, fallback: string): string {
  return (process.env[key] as string | undefined) ?? fallback;
}

function readEnvBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export interface LocalModeConfig {
  enabled: boolean;
  dbPath: string;
  syncEnabled: boolean;
  syncUrl?: string;
  multiTenant: boolean;
  defaultTenantSlug: string;
  defaultWorkspaceSlug: string;
}

const LOCAL_MODE_CONFIG_VALUE: LocalModeConfig = {
  enabled: readEnvBool('IS_LOCAL', false),
  dbPath: readEnv('DATABASE_URL', 'file:./aifut-local.db'),
  syncEnabled: readEnvBool('SYNC_ENABLED', false),
  syncUrl: readEnv('SYNC_URL', ''),
  multiTenant: readEnvBool('LOCAL_MULTI_TENANT', false),
  defaultTenantSlug: readEnv('DEFAULT_TENANT_SLUG', 'local'),
  defaultWorkspaceSlug: readEnv('DEFAULT_WORKSPACE_SLUG', 'default'),
};

/**
 * LocalModeModule — configures the application for local SQLite mode.
 * 
 * When IS_LOCAL=true and DATABASE_URL points to a SQLite file:
 * - Runs with single-tenant mode by default
 * - All data stored in local SQLite file
 * - Optional Cloudflare Workers sync bridge
 * - No PostgreSQL dependency
 * 
 * This enables the "local license" packaging ($120-180 one-time).
 */

@Global()
@Module({
  imports: [],
  providers: [
    {
      provide: 'LOCAL_MODE_CONFIG',
      useValue: LOCAL_MODE_CONFIG_VALUE,
    },
  ],
  exports: ['LOCAL_MODE_CONFIG'],
})
export class LocalModeModule {}

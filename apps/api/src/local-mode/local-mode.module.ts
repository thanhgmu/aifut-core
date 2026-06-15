import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

export interface LocalModeConfig {
  enabled: boolean;
  dbPath: string;
  syncEnabled: boolean;
  syncUrl?: string;
  multiTenant: boolean;
  defaultTenantSlug: string;
  defaultWorkspaceSlug: string;
}

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
  imports: [ConfigModule],
  providers: [
    {
      provide: 'LOCAL_MODE_CONFIG',
      useFactory: (config: ConfigService): LocalModeConfig => ({
        enabled: config.get<boolean>('IS_LOCAL', false),
        dbPath: config.get<string>('DATABASE_URL', 'file:./aifut-local.db'),
        syncEnabled: config.get<boolean>('SYNC_ENABLED', false),
        syncUrl: config.get<string>('SYNC_URL', undefined),
        multiTenant: config.get<boolean>('LOCAL_MULTI_TENANT', false),
        defaultTenantSlug: config.get<string>('DEFAULT_TENANT_SLUG', 'local'),
        defaultWorkspaceSlug: config.get<string>('DEFAULT_WORKSPACE_SLUG', 'default'),
      }),
      inject: [ConfigService],
    },
  ],
  exports: ['LOCAL_MODE_CONFIG'],
})
export class LocalModeModule {}

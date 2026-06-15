import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { LocalModeConfig } from './local-mode.module';

@Injectable()
export class LocalModeService implements OnModuleInit {
  private readonly logger = new Logger(LocalModeService.name);

  constructor(
    @Inject('LOCAL_MODE_CONFIG') private readonly config: LocalModeConfig,
  ) {}

  onModuleInit() {
    if (this.config.enabled) {
      this.logger.log('═══════════════════════════════════════════');
      this.logger.log('  AIFUT LOCAL MODE ACTIVE');
      this.logger.log(`  Database: ${this.config.dbPath}`);
      this.logger.log(`  Multi-tenant: ${this.config.multiTenant}`);
      this.logger.log(`  Cloud sync: ${this.config.syncEnabled ? `enabled (${this.config.syncUrl})` : 'disabled'}`);
      this.logger.log(`  Default tenant: ${this.config.defaultTenantSlug}`);
      this.logger.log('═══════════════════════════════════════════');
    }
  }

  get isLocal(): boolean {
    return this.config.enabled;
  }

  get tenantSlug(): string {
    return this.config.defaultTenantSlug;
  }

  get workspaceSlug(): string {
    return this.config.defaultWorkspaceSlug;
  }

  get dbPath(): string {
    return this.config.dbPath;
  }

  get syncEnabled(): boolean {
    return this.config.syncEnabled;
  }

  /**
   * Get the tenant slug to use for a given request.
   * In local mode, all requests map to the default tenant.
   */
  resolveTenantSlug(_requestSlug?: string): string {
    return this.config.defaultTenantSlug;
  }

  /**
   * Generate a pre-defined tenant for local mode.
   */
  getLocalTenantSeed() {
    return {
      slug: this.config.defaultTenantSlug,
      name: 'Local Business',
    };
  }

  /**
   * Generate a pre-defined workspace for local mode.
   */
  getLocalWorkspaceSeed() {
    return {
      slug: this.config.defaultWorkspaceSlug,
      name: 'Main Workspace',
    };
  }
}

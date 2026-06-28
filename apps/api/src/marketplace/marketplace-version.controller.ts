// ===================================================================
// marketplace-version.controller.ts — Versioning & Dependency API
// Phase 4: Developer Sandbox Core + Marketplace Contract Depth
// 10 REST endpoints cho version management + dependency resolution
// ===================================================================

import {
  Controller,
  Post,
  Get,
  Delete,
  Headers,
  Param,
  Body,
  Query,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { MarketplaceVersionService } from './marketplace-version.service';
import { MarketplaceDependencyService } from './marketplace-dependency.service';

// ── DTOs ──────────────────────────────────────────────────────────────

export class PublishVersionDto {
  version!: string;
  changelog?: string;
  config?: any;
}

export class AddDependencyDto {
  versionId!: string;
  dependsOnId!: string;
  constraint!: string;
  isOptional?: boolean;
}

export class ResolveVersionsDto {
  versionIds!: string[];
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: string;
}

// ── Controller ────────────────────────────────────────────────────────

@Controller('v1/marketplace')
export class MarketplaceVersionController {
  constructor(
    private readonly versionService: MarketplaceVersionService,
    private readonly dependencyService: MarketplaceDependencyService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  //  VERSIONING ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * POST /v1/marketplace/listings/:listingId/versions
   *
   * Publish a new version for a marketplace listing.
   * - Semver validation (MAJOR.MINOR.PATCH)
   * - Must be > current active version
   * - Previous active version → SUPERSEDED
   */
  @Post('listings/:listingId/versions')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async publishVersion(
    @Headers('x-tenant-id') tenantId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Body() dto: PublishVersionDto,
  ) {
    return this.versionService.publishVersion({
      listingId,
      version: dto.version,
      changelog: dto.changelog,
      config: dto.config,
    });
  }

  /**
   * GET /v1/marketplace/listings/:listingId/versions
   *
   * Version history for a listing (newest first).
   */
  @Get('listings/:listingId/versions')
  async getVersionHistory(
    @Headers('x-tenant-id') tenantId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ) {
    return this.versionService.getVersionHistory(listingId);
  }

  /**
   * GET /v1/marketplace/listings/:listingId/versions/active
   *
   * Get the currently active version of a listing.
   */
  @Get('listings/:listingId/versions/active')
  async getActiveVersion(
    @Headers('x-tenant-id') tenantId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ) {
    const version = await this.versionService.getActiveVersion(listingId);
    if (!version) {
      return { message: 'No active version found.' };
    }
    return version;
  }

  /**
   * POST /v1/marketplace/versions/:versionId/deprecate
   *
   * Mark a version as DEPRECATED.
   * Auto-activates next newest version if no ACTIVE remains.
   */
  @Post('versions/:versionId/deprecate')
  async deprecateVersion(
    @Headers('x-tenant-id') tenantId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.versionService.deprecateVersion(versionId);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DEPENDENCY ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * POST /v1/marketplace/dependencies
   *
   * Add a dependency between two versions.
   * - Auto cycle detection (rejects if cycle found)
   * - Semver constraint validation
   * - Prevents self-dependency
   */
  @Post('dependencies')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async addDependency(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: AddDependencyDto,
  ) {
    return this.dependencyService.addDependency({
      versionId: dto.versionId,
      dependsOnId: dto.dependsOnId,
      constraint: dto.constraint,
      isOptional: dto.isOptional ?? false,
    });
  }

  /**
   * DELETE /v1/marketplace/dependencies/:dependencyId
   *
   * Remove a dependency edge.
   */
  @Delete('dependencies/:dependencyId')
  async removeDependency(
    @Headers('x-tenant-id') tenantId: string,
    @Param('dependencyId', ParseUUIDPipe) dependencyId: string,
  ) {
    await this.dependencyService.removeDependency(dependencyId);
    return { message: 'Dependency removed successfully.' };
  }

  /**
   * GET /v1/marketplace/versions/:versionId/dependencies
   *
   * List all direct dependencies of a version.
   */
  @Get('versions/:versionId/dependencies')
  async getDependencies(
    @Headers('x-tenant-id') tenantId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.dependencyService.getDependencies(versionId);
  }

  /**
   * GET /v1/marketplace/versions/:versionId/dependencies/tree
   *
   * Full recursive dependency tree.
   * Depth-limited to 50, cycle-marked nodes.
   */
  @Get('versions/:versionId/dependencies/tree')
  async getDependencyTree(
    @Headers('x-tenant-id') tenantId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.dependencyService.getDependencyTree(versionId);
  }

  /**
   * POST /v1/marketplace/versions/:versionId/dependencies/resolve
   *
   * Resolve all transitive dependencies for a version.
   * Returns:
   *   - Flat resolved list with versions
   *   - Any conflict errors
   *   - Warnings (optional deps, version bumps)
   */
  @Post('versions/:versionId/dependencies/resolve')
  async resolveDependencies(
    @Headers('x-tenant-id') tenantId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.dependencyService.resolveDependencies(versionId);
  }

  /**
   * POST /v1/marketplace/dependencies/resolve-install-order
   *
   * Topological install order for a list of version IDs.
   * Dependencies are installed before dependents.
   * Detects cycles and reports them.
   */
  @Post('dependencies/resolve-install-order')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async resolveInstallOrder(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: ResolveVersionsDto,
  ) {
    return this.dependencyService.resolveInstallOrder(dto.versionIds);
  }
}

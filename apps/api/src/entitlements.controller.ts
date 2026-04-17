import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import {
  ENTITLEMENTS_FOUNDATION_ROADMAP,
  PACKAGE_OPTIONS_BLUEPRINT,
} from './entitlements.constants';
import { EntitlementsService } from './entitlements.service';

@Controller('entitlements')
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  @Get('capabilities')
  capabilities() {
    return {
      ...this.entitlements.capabilities(),
      next: ENTITLEMENTS_FOUNDATION_ROADMAP,
    };
  }

  @Get('packaging-blueprint')
  packagingBlueprint() {
    return PACKAGE_OPTIONS_BLUEPRINT;
  }

  @Get('plans')
  plans() {
    return this.entitlements.getPlanCatalog();
  }

  @Get('current-package')
  async currentPackage(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
  ) {
    return this.entitlements.getTenantPackageState({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
    });
  }

  @Get('preview-selection')
  previewSelection(
    @Query('basePlanKey') basePlanKey?: string,
    @Query('selectedOption') selectedOption?: string | string[],
  ) {
    const selectedOptions = Array.isArray(selectedOption)
      ? selectedOption
      : selectedOption
        ? [selectedOption]
        : [];

    return this.entitlements.previewSelection({
      basePlanKey,
      selectedOptions,
    });
  }

  @Post('assign-package')
  async assignPackage(
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      basePlanKey?: string;
      selectedOptions?: string[];
      source?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
  ) {
    return this.entitlements.assignPackage({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
    });
  }

  @Post('sync-package-entitlements')
  async syncPackageEntitlements(
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      source?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
  ) {
    return this.entitlements.syncCurrentPackage({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
    });
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'entitlements',
      roadmap: ENTITLEMENTS_FOUNDATION_ROADMAP,
    };
  }
}

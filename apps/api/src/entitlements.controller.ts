import { Controller, Get } from '@nestjs/common';
import {
  ENTITLEMENTS_FOUNDATION_ROADMAP,
  PACKAGE_OPTIONS_BLUEPRINT,
} from './entitlements.constants';

@Controller('entitlements')
export class EntitlementsController {
  @Get('capabilities')
  capabilities() {
    return {
      capability: 'entitlements',
      status: 'foundation',
      supports: {
        planFeatures: true,
        limits: true,
        pricingControls: true,
        packageOptions: true,
        appCapabilityCommercialization: true,
      },
      next: ENTITLEMENTS_FOUNDATION_ROADMAP,
    };
  }

  @Get('packaging-blueprint')
  packagingBlueprint() {
    return PACKAGE_OPTIONS_BLUEPRINT;
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'entitlements',
      roadmap: ENTITLEMENTS_FOUNDATION_ROADMAP,
    };
  }
}

import { Controller, Get } from '@nestjs/common';
import { ENTITLEMENTS_FOUNDATION_ROADMAP } from './entitlements.constants';

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
      },
      next: ENTITLEMENTS_FOUNDATION_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'entitlements',
      roadmap: ENTITLEMENTS_FOUNDATION_ROADMAP,
    };
  }
}

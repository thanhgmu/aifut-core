import { Controller, Get } from '@nestjs/common';
import { GLOBALIZATION_FOUNDATION_ROADMAP } from './globalization.constants';

@Controller('globalization')
export class GlobalizationController {
  @Get('capabilities')
  capabilities() {
    return {
      capability: 'globalization',
      status: 'foundation',
      supports: {
        multiCountry: true,
        multiLanguage: true,
        multiCurrency: true,
        realtimeFx: true,
      },
      next: GLOBALIZATION_FOUNDATION_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'globalization',
      roadmap: GLOBALIZATION_FOUNDATION_ROADMAP,
    };
  }
}

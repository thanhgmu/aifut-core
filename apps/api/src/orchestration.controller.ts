import { Controller, Get } from '@nestjs/common';
import { ORCHESTRATION_FOUNDATION_ROADMAP } from './orchestration.constants';

@Controller('orchestration')
export class OrchestrationController {
  @Get('capabilities')
  capabilities() {
    return {
      capability: 'orchestration',
      status: 'foundation',
      channels: ['in-app-chat', 'telegram', 'whatsapp', 'discord'],
      next: ORCHESTRATION_FOUNDATION_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'orchestration',
      roadmap: ORCHESTRATION_FOUNDATION_ROADMAP,
    };
  }
}

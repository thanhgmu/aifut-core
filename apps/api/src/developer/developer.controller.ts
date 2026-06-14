import { Controller, Get, Query } from '@nestjs/common';
import { DeveloperService, ApiEndpoint } from './developer.service';
import { DEV_PORTAL_ROADMAP } from './developer.constants';

@Controller('developer')
export class DeveloperController {
  constructor(private readonly dev: DeveloperService) {}

  @Get('docs')
  docs(@Query('phase') phase?: string): ApiEndpoint[] | ApiEndpoint[][] {
    if (phase) return this.dev.getApiDocsByPhase(phase);
    return this.dev.getApiDocs();
  }

  @Get('stats')
  stats() {
    return this.dev.getStats();
  }

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'developer',
      status: 'docs-only',
      supports: { apiDocs: true, sdks: false, sandbox: false, webhooks: false },
      next: DEV_PORTAL_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return { capability: 'developer', roadmap: DEV_PORTAL_ROADMAP };
  }
}

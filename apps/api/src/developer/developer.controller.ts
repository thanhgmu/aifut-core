import { Controller, Get, Query } from '@nestjs/common';
import { DeveloperService, ApiEndpoint } from './developer.service';

@Controller('developer')
export class DeveloperController {
  constructor(private readonly dev: DeveloperService) {}

  @Get('docs')
  docs(@Query('phase') phase?: string): ApiEndpoint[] | ApiEndpoint[][] {
    if (phase) return this.dev.getApiDocsByPhase(phase);
    return this.dev.getApiDocs();
  }

  @Get('ais-spec')
  aisSpec() {
    return this.dev.getAisSpec();
  }

  @Get('sdks')
  sdks() {
    return this.dev.getSdks();
  }

  @Get('webhooks')
  webhooks() {
    return this.dev.getWebhookDocs();
  }

  @Get('certification')
  certification() {
    return this.dev.getCertification();
  }

  @Get('stats')
  stats() {
    return this.dev.getStats();
  }

  @Get('capabilities')
  capabilities() {
    return this.dev.getSdks();
  }

  @Get('roadmap')
  roadmap() {
    return this.dev.getRoadmap();
  }
}

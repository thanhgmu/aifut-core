import { Controller, Get } from '@nestjs/common';
import { AUDIT_FOUNDATION_ROADMAP } from './audit.constants';

@Controller('audit')
export class AuditController {
  @Get('capabilities')
  capabilities() {
    return {
      capability: 'audit',
      status: 'foundation',
      supports: {
        eventCapture: true,
        actorAttribution: true,
        tenantScopedTraceability: true,
      },
      next: AUDIT_FOUNDATION_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'audit',
      roadmap: AUDIT_FOUNDATION_ROADMAP,
    };
  }
}

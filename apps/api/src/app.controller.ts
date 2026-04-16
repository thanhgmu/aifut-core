import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  PLATFORM_KERNEL_MODULES,
  PLATFORM_KERNEL_NEXT_STEPS,
} from './platform-kernel.constants';
import { PLATFORM_KERNEL_BACKLOG } from './tenancy.constants';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  root() {
    return {
      name: 'AIFUT API',
      status: 'ok',
      message: 'AIFUT Model C platform foundation is running',
      focus: {
        model: 'C',
        priorities: ['tenancy', 'orchestration', 'globalization'],
        next: PLATFORM_KERNEL_BACKLOG,
      },
      docs: {
        blueprint: 'docs/architecture/platform-blueprint.md',
        executionPlan: 'docs/roadmap/execution-plan.md',
        sourceOfTruth: 'docs/source-of-truth.md',
        apiBacklog: 'docs/backlog/api-core-foundation.md',
        domainMap: 'docs/architecture/api-domain-map.md',
      },
      kernel: {
        modules: PLATFORM_KERNEL_MODULES,
        nextSteps: PLATFORM_KERNEL_NEXT_STEPS,
      },
      endpoints: {
        health: '/health',
        tenancy: ['/tenancy/summary', '/tenancy/roadmap'],
        auth: ['/auth/context'],
        memberships: ['/memberships/resolve'],
        integrations: [
          '/integrations/infrastructure-profile',
          '/integrations/connections',
          '/integrations/setup-blueprint',
        ],
        connectors: ['/connectors/registry', '/connectors/templates'],
        globalization: [
          '/globalization/capabilities',
          '/globalization/roadmap',
        ],
        orchestration: [
          '/orchestration/capabilities',
          '/orchestration/roadmap',
        ],
      },
    };
  }

  @Get('health')
  async health() {
    const now = new Date().toISOString();
    let database = 'down';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch (error) {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'api',
      database,
      timestamp: now,
      platform: {
        model: 'C',
        foundations: ['tenancy', 'globalization', 'orchestration'],
        kernelModules: PLATFORM_KERNEL_MODULES,
        next: PLATFORM_KERNEL_BACKLOG,
        implementationNext: PLATFORM_KERNEL_NEXT_STEPS,
      },
    };
  }
}
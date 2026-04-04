import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  root() {
    return {
      name: 'AIFUT API',
      status: 'ok',
      message: 'AIFUT API is running',
    };
  }

  @Get('health')
  async health() {
    const now = new Date().toISOString();
    let database = 'down';

    try {
      await this.prisma.db.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'api',
      database,
      timestamp: now,
    };
  }
}

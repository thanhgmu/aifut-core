import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TENANCY_FOUNDATION_ROADMAP } from './tenancy.constants';

@Controller('tenancy')
export class TenancyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  async summary() {
    const [tenants, workspaces, users] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.workspace.count(),
      this.prisma.user.count(),
    ]);

    return {
      capability: 'tenancy',
      tenants,
      workspaces,
      users,
      next: TENANCY_FOUNDATION_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'tenancy',
      roadmap: TENANCY_FOUNDATION_ROADMAP,
    };
  }
}

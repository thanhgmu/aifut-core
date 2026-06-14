import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BackupService } from './backup.service';
import { BACKUP_ROADMAP } from './backup.constants';

@Controller('backups')
export class BackupController {
  constructor(
    private readonly backup: BackupService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveTenantId(slug: string) {
    const t = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!t) throw new NotFoundException(`Tenant '${slug}' not found`);
    return t.id;
  }

  @Post('schedules')
  async createSchedule(
    @Headers('x-tenant-slug') slug: string,
    @Body() body: {
      key: string;
      name: string;
      description?: string;
      targetRef: string;
      backupMode?: string;
      cronExpression?: string;
      retentionDays?: number;
      maxBackups?: number;
    },
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.backup.createSchedule({ tenantId, ...body });
  }

  @Get('schedules')
  async listSchedules(@Headers('x-tenant-slug') slug: string) {
    const tenantId = await this.resolveTenantId(slug);
    return this.backup.listSchedules(tenantId);
  }

  @Get('schedules/:key')
  async getSchedule(
    @Headers('x-tenant-slug') slug: string,
    @Param('key') key: string,
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.backup.getSchedule(tenantId, key);
  }

  @Put('schedules/:key')
  async updateSchedule(
    @Headers('x-tenant-slug') slug: string,
    @Param('key') key: string,
    @Body() body: any,
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.backup.updateSchedule(tenantId, key, body);
  }

  @Delete('schedules/:key')
  async deleteSchedule(
    @Headers('x-tenant-slug') slug: string,
    @Param('key') key: string,
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.backup.deleteSchedule(tenantId, key);
  }

  @Post('schedules/:key/execute')
  async execute(
    @Headers('x-tenant-slug') slug: string,
    @Param('key') key: string,
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.backup.executeBackup(tenantId, key);
  }

  @Get('jobs')
  async listJobs(
    @Headers('x-tenant-slug') slug: string,
    @Query('limit') limit?: number,
  ) {
    const tenantId = await this.resolveTenantId(slug);
    return this.backup.listJobs(tenantId, limit ?? 20);
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    return this.backup.getJob(id);
  }

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'backups',
      status: 'foundation',
      supports: {
        scheduleCrud: true,
        manualExecution: true,
        scheduledExecution: false,
        retentionPolicy: true,
        restoreExecution: false,
      },
      next: BACKUP_ROADMAP,
    };
  }

  @Get('roadmap')
  roadmap() {
    return { capability: 'backups', roadmap: BACKUP_ROADMAP };
  }
}

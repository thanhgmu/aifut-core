import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class BackupService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Schedule CRUD ──────────────────────────────────────────────────────────

  async createSchedule(input: {
    tenantId: string;
    workspaceId?: string;
    key: string;
    name: string;
    description?: string;
    targetRef: string;
    backupMode?: string;
    cronExpression?: string;
    retentionDays?: number;
    maxBackups?: number;
    config?: any;
  }) {
    const existing = await this.prisma.backupSchedule.findUnique({
      where: { tenantId_key: { tenantId: input.tenantId, key: input.key } },
    });
    if (existing) throw new ConflictException(`Schedule '${input.key}' already exists`);

    return this.prisma.backupSchedule.create({ data: input as any });
  }

  async listSchedules(tenantId: string) {
    return this.prisma.backupSchedule.findMany({
      where: { tenantId },
      include: { _count: { select: { jobs: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getSchedule(tenantId: string, key: string) {
    const sched = await this.prisma.backupSchedule.findUnique({
      where: { tenantId_key: { tenantId, key } },
      include: { jobs: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!sched) throw new NotFoundException(`Schedule '${key}' not found`);
    return sched;
  }

  async updateSchedule(tenantId: string, key: string, data: any) {
    const sched = await this.getSchedule(tenantId, key);
    return this.prisma.backupSchedule.update({
      where: { id: sched.id },
      data,
    });
  }

  async deleteSchedule(tenantId: string, key: string) {
    const sched = await this.getSchedule(tenantId, key);
    await this.prisma.backupSchedule.delete({ where: { id: sched.id } });
    return { deleted: true };
  }

  // ── Job Execution ──────────────────────────────────────────────────────────

  async executeBackup(tenantId: string, scheduleKey: string, triggeredBy = 'manual') {
    const sched = await this.getSchedule(tenantId, scheduleKey);
    if (!sched.enabled) throw new ConflictException('Backup schedule is disabled');

    // Simulate backup by creating a completed job
    const job = await this.prisma.backupJob.create({
      data: {
        scheduleId: sched.id,
        tenantId,
        workspaceId: sched.workspaceId,
        status: 'RUNNING',
        startedAt: new Date(),
        triggeredBy,
        backupTarget: sched.targetRef,
      },
    });

    // Simulate backup completion (in production: actual backup process)
    const simulatedSize = Math.floor(Math.random() * 10000000) + 500000; // 0.5-10MB
    const simulatedFiles = Math.floor(Math.random() * 100) + 10;

    await new Promise((r) => setTimeout(r, 200)); // Simulate work

    const completed = await this.prisma.backupJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        totalSize: simulatedSize,
        fileCount: simulatedFiles,
      },
    });

    // Update schedule's last status
    await this.prisma.backupSchedule.update({
      where: { id: sched.id },
      data: {
        lastRunAt: new Date(),
        lastStatus: 'COMPLETED',
      },
    });

    return completed;
  }

  async listJobs(tenantId: string, limit = 20) {
    return this.prisma.backupJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { schedule: { select: { name: true, key: true } } },
    });
  }

  async getJob(jobId: string) {
    const job = await this.prisma.backupJob.findUnique({
      where: { id: jobId },
      include: { schedule: true },
    });
    if (!job) throw new NotFoundException(`Job '${jobId}' not found`);
    return job;
  }
}

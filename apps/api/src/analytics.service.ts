import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IndustryTemplatesService } from '../workflows/industry-templates.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: IndustryTemplatesService,
  ) {}

  /**
   * Platform-wide analytics summary.
   */
  async getPlatformSummary() {
    const [
      tenantCount,
      userCount,
      workflowCount,
      executionCount,
      activeExecutionCount,
      notificationCount,
      backupCount,
      subscriptionCount,
      marketplaceListingCount,
      aiUsageTotal,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.workflowTemplate.count(),
      this.prisma.workflowExecution.count(),
      this.prisma.workflowExecution.count({ where: { status: 'RUNNING' } }),
      this.prisma.notificationLog.count(),
      this.prisma.backupJob.count(),
      this.prisma.subscription.count({ where: { status: 'active' } }),
      this.prisma.marketplaceListing.count({ where: { isPublished: true } }),
      this.prisma.usageRecord.aggregate({ _sum: { value: true }, where: { category: 'ai' } }),
    ]);

    return {
      platform: {
        tenants: tenantCount,
        users: userCount,
        activeSubscriptions: subscriptionCount,
        templates: this.templates.getAll().length,
        marketplaceListings: marketplaceListingCount,
      },
      workflows: {
        total: workflowCount,
        executions: executionCount,
        active: activeExecutionCount,
      },
      notifications: {
        total: notificationCount,
      },
      backups: {
        total: backupCount,
      },
      ai: {
        totalUsage: Number(aiUsageTotal._sum?.value ?? 0),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get tenant-level analytics.
   */
  async getTenantAnalytics(tenantId: string) {
    const [workflowCount, executionCount, notificationCount, backupCount, aiUsage] =
      await Promise.all([
        this.prisma.workflowTemplate.count({ where: { tenantId } }),
        this.prisma.workflowExecution.count({ where: { tenantId } }),
        this.prisma.notificationLog.count({ where: { tenantId } }),
        this.prisma.backupJob.count({ where: { tenantId } }),
        this.prisma.usageRecord.aggregate({
          _sum: { value: true },
          where: { tenantId, category: 'ai' },
        }),
      ]);

    return {
      tenantId,
      workflows: { total: workflowCount, executions: executionCount },
      notifications: { total: notificationCount },
      backups: { total: backupCount },
      ai: { totalUsage: Number(aiUsage._sum?.value ?? 0) },
    };
  }

  /**
   * Get industry adoption statistics.
   */
  async getIndustryAdoption() {
    const templates = this.templates.getAll();
    const industryCounts: Record<string, number> = {};

    for (const tpl of templates) {
      const ind = tpl.industry || 'other';
      industryCounts[ind] = (industryCounts[ind] || 0) + 1;
    }

    return Object.entries(industryCounts)
      .map(([industry, count]) => ({ industry, templateCount: count }))
      .sort((a, b) => b.templateCount - a.templateCount);
  }
}

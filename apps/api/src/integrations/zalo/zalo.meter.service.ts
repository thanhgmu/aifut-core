import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

/**
 * Tracks ZNS message usage for billing/metering purposes.
 * Records every ZNS template message send as a UsageRecord entry.
 */
@Injectable()
export class ZaloMeterService {
  private readonly logger = new Logger(ZaloMeterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a ZNS message send for billing.
   * Updates ZaloOaConnection.dailyQuotaUsed and creates UsageRecord.
   */
  async recordZnsUsage(
    tenantId: string,
    messageId: string | undefined,
    quotaCost: number,
  ): Promise<void> {
    try {
      // Update daily quota used on the connection
      const connection = await this.prisma.zaloOaConnection.findUnique({
        where: { tenantId },
      });
      if (connection) {
        await this.prisma.zaloOaConnection.update({
          where: { id: connection.id },
          data: {
            dailyQuotaUsed: connection.dailyQuotaUsed + quotaCost,
          },
        });
      }

      // Record for billing metering
      const billingAccount = await this.prisma.billingAccount.findUnique({
        where: { tenantId },
      });
      if (billingAccount) {
        await this.prisma.usageRecord.create({
          data: {
            accountId: billingAccount.id,
            tenantId,
            category: 'notification',
            metric: 'zns_messages',
            value: quotaCost,
            recordedAt: new Date(),
            metadata: {
              provider: 'zalo-oa',
              messageId,
              quotaCost,
            },
          },
        });
      }
    } catch (err: any) {
      // Non-critical: don't fail the message send if metering fails
      this.logger.warn(`[${tenantId}] Meter recording failed: ${err.message}`);
    }
  }

  /**
   * Get monthly ZNS usage for a tenant.
   */
  async getMonthlyUsage(
    tenantId: string,
  ): Promise<{ totalMessages: number; totalQuota: number; estimatedCost: number }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const records = await this.prisma.usageRecord.findMany({
      where: {
        tenantId,
        category: 'notification',
        metric: 'zns_messages',
        recordedAt: { gte: thirtyDaysAgo },
      },
    });

    const totalQuota = records.reduce((sum, r) => sum + r.value, 0);
    // ZNS costs approx 300-500 VND per msg depending on package; use 400 as estimate
    const costPerMsg = 400;

    return {
      totalMessages: records.length,
      totalQuota,
      estimatedCost: totalQuota * costPerMsg,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// payout.service.ts — Developer Payout & Revenue Withdrawal Engine
// ═══════════════════════════════════════════════════════════════════════════
// Phase 3: Ecosystem Economy — Approval workflow + Platform commission analytics
//   • Payout request → PENDING → admin APPROVED → PROCESSED
//   • Available balance = totalEarnings - (paidOut + pendingRequests)
//   • Platform commission analytics (aggregated platform fees)
// ═══════════════════════════════════════════════════════════════════════════

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// ── Types ─────────────────────────────────────────────────────────────────

export interface BalanceResponse {
  availableBalance: string;
  pendingBalance: string;
  paidOut: string;
  totalEarnings: string;
  currency: string;
}

export interface PayoutRequestInput {
  amount: string; // in smallest unit (VND * 100)
  currency?: string;
  method?: string; // 'bank_transfer' | 'wallet' | 'momo' | 'paypal'
  accountInfo?: Record<string, string>;
  notes?: string;
}

export interface PayoutRequestResponse {
  id: string;
  amount: string;
  currency: string;
  method: string | null;
  status: string;
  notes: string | null;
  rejectReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionRecord {
  id: string;
  amount: string;
  currency: string;
  type: string;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: Date;
}

export interface PlatformCommissionSummary {
  totalPlatformFees: string;
  totalOrders: number;
  byCurrency: Array<{ currency: string; fees: string; count: number }>;
  byListingType: Array<{ type: string; fees: string; count: number }>;
  periodStart?: string;
  periodEnd?: string;
}

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class PayoutService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * getBalance
   * ──────────
   * Lấy số dư khả dụng cho developer.
   * available = totalEarnings - paidOut - pendingPayoutRequests
   */
  async getBalance(tenantId: string): Promise<BalanceResponse> {
    const profile = await this.prisma.developerProfile.findUnique({
      where: { tenantId },
    });
    if (!profile) {
      throw new NotFoundException('Developer profile not found.');
    }

    // Sum all PROCESSED payout records
    const payoutAgg = await this.prisma.developerEarning.aggregate({
      where: {
        profileId: profile.id,
        type: 'payout',
      },
      _sum: { amount: true },
    });
    const paidOut = payoutAgg._sum.amount ?? BigInt(0);
    const totalEarnings = profile.totalEarnings;

    // Sum pending payout requests (not yet approved)
    const pendingAgg = await this.prisma.developerPayoutRequest.aggregate({
      where: {
        profileId: profile.id,
        status: 'PENDING',
      },
      _sum: { amount: true },
    });
    const pendingRequests = pendingAgg._sum.amount ?? BigInt(0);

    const available = totalEarnings - paidOut - pendingRequests;

    return {
      availableBalance: available.toString(),
      pendingBalance: pendingRequests.toString(),
      paidOut: paidOut.toString(),
      totalEarnings: totalEarnings.toString(),
      currency: 'VND',
    };
  }

  /**
   * requestPayout
   * ─────────────
   * Developer yêu cầu rút tiền → tạo PENDING request để admin duyệt.
   */
  async requestPayout(
    tenantId: string,
    input: PayoutRequestInput,
  ): Promise<PayoutRequestResponse> {
    const profile = await this.prisma.developerProfile.findUnique({
      where: { tenantId },
    });
    if (!profile) {
      throw new NotFoundException('Developer profile not found.');
    }

    const amount = BigInt(input.amount);
    if (amount <= BigInt(0)) {
      throw new BadRequestException('Amount must be positive.');
    }

    // Check available balance
    const balance = await this.getBalance(tenantId);
    const available = BigInt(balance.availableBalance);
    if (amount > available) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${available.toString()}, requested: ${amount.toString()}`,
      );
    }

    const currency = input.currency ?? 'VND';
    const method = input.method ?? 'bank_transfer';

    // Create pending payout request (not yet approved)
    const request = await this.prisma.developerPayoutRequest.create({
      data: {
        profileId: profile.id,
        amount,
        currency,
        status: 'PENDING',
        payoutMethod: method,
        accountInfo: input.accountInfo
          ? JSON.stringify(input.accountInfo)
          : undefined,
        notes: input.notes ?? undefined,
      },
    });

    return this.toPayoutResponse(request);
  }

  /**
   * approvePayout
   * ─────────────
   * Admin duyệt payout request → ghi DeveloperEarning (debit) + cập nhật totalEarnings.
   */
  async approvePayout(
    requestId: string,
    adminTenantId: string,
  ): Promise<PayoutRequestResponse> {
    const request = await this.prisma.developerPayoutRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('Payout request not found.');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot approve payout in status: ${request.status}`,
      );
    }

    // Execute in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Re-check balance inside transaction
      const profile = await tx.developerProfile.findUnique({
        where: { id: request.profileId },
      });
      if (!profile) {
        throw new NotFoundException('Developer profile not found.');
      }

      // Calculate available (exclude this request since it's still pending)
      const paidOutAgg = await tx.developerEarning.aggregate({
        where: {
          profileId: profile.id,
          type: 'payout',
        },
        _sum: { amount: true },
      });
      const paidOut = paidOutAgg._sum.amount ?? BigInt(0);

      const pendingAgg = await tx.developerPayoutRequest.aggregate({
        where: {
          profileId: profile.id,
          status: 'PENDING',
          id: { not: request.id }, // exclude this one
        },
        _sum: { amount: true },
      });
      const otherPending = pendingAgg._sum.amount ?? BigInt(0);

      const available = profile.totalEarnings - paidOut - otherPending;
      if (request.amount > available) {
        throw new BadRequestException(
          `Insufficient balance after pending requests. Available: ${available.toString()}`,
        );
      }

      // Update request status to APPROVED
      const updated = await tx.developerPayoutRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          approvedById: adminTenantId,
          approvedAt: new Date(),
        },
      });

      // Create DeveloperEarning payout record (debit = negative amount)
      await tx.developerEarning.create({
        data: {
          profileId: profile.id,
          amount: -request.amount, // Negative = debit
          currency: request.currency,
          type: 'payout',
          description: `Payout approved: ${request.payoutMethod ?? 'bank_transfer'}${request.notes ? ` — ${request.notes}` : ''}`,
          referenceType: 'payout_request',
          referenceId: request.id,
        },
      });

      // Update profile: subtract from totalEarnings
      await tx.developerProfile.update({
        where: { id: profile.id },
        data: {
          totalEarnings: profile.totalEarnings - request.amount,
        },
      });

      return updated;
    });

    return this.toPayoutResponse(result);
  }

  /**
   * processPayout
   * ─────────────
   * Admin đánh dấu payout đã được xử lý (chuyển tiền thực tế).
   */
  async processPayout(requestId: string): Promise<PayoutRequestResponse> {
    const request = await this.prisma.developerPayoutRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('Payout request not found.');
    }
    if (request.status !== 'APPROVED') {
      throw new BadRequestException(
        `Cannot process payout in status: ${request.status}. Must be APPROVED first.`,
      );
    }

    const result = await this.prisma.developerPayoutRequest.update({
      where: { id: requestId },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });

    return this.toPayoutResponse(result);
  }

  /**
   * rejectPayout
   * ────────────
   * Admin từ chối payout request.
   */
  async rejectPayout(
    requestId: string,
    adminTenantId: string,
    reason?: string,
  ): Promise<PayoutRequestResponse> {
    const request = await this.prisma.developerPayoutRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('Payout request not found.');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot reject payout in status: ${request.status}`,
      );
    }

    const result = await this.prisma.developerPayoutRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        approvedById: adminTenantId,
        approvedAt: new Date(),
        rejectReason: reason ?? null,
      },
    });

    return this.toPayoutResponse(result);
  }

  /**
   * cancelPayout
   * ────────────
   * Developer tự hủy payout request (chỉ khi PENDING).
   */
  async cancelPayout(
    requestId: string,
    tenantId: string,
  ): Promise<PayoutRequestResponse> {
    const request = await this.prisma.developerPayoutRequest.findUnique({
      where: { id: requestId },
      include: { profile: true },
    });
    if (!request) {
      throw new NotFoundException('Payout request not found.');
    }
    if (request.profile.tenantId !== tenantId) {
      throw new BadRequestException('You can only cancel your own payout request.');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot cancel payout in status: ${request.status}`,
      );
    }

    const result = await this.prisma.developerPayoutRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED' },
    });

    return this.toPayoutResponse(result);
  }

  /**
   * listPayoutRequests
   * ──────────────────
   * Liệt kê payout requests (admin: tất cả, developer: của họ).
   */
  async listPayoutRequests(
    options: {
      tenantId?: string;
      status?: string;
      from?: Date;
      to?: Date;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const { tenantId, status, from, to, page = 1, pageSize = 20 } = options;
    const where: any = {};

    if (tenantId) {
      const profile = await this.prisma.developerProfile.findUnique({
        where: { tenantId },
      });
      if (!profile) {
        throw new NotFoundException('Developer profile not found.');
      }
      where.profileId = profile.id;
    }
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const safePage = Math.max(1, page);
    const safePageSize = Math.min(Math.max(1, pageSize), 100);
    const skip = (safePage - 1) * safePageSize;

    const [items, total] = await Promise.all([
      this.prisma.developerPayoutRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safePageSize,
        include: {
          profile: {
            select: {
              displayName: true,
              tenantId: true,
            },
          },
        },
      }),
      this.prisma.developerPayoutRequest.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        ...this.toPayoutResponse(r),
        developerName: (r as any).profile?.displayName ?? null,
        developerTenantId: (r as any).profile?.tenantId ?? null,
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
    };
  }

  /**
   * getPayoutHistory
   * ────────────────
   * Lấy lịch sử payout (DeveloperEarning type='payout').
   */
  async getPayoutHistory(
    tenantId: string,
    options: { page?: number; pageSize?: number } = {},
  ) {
    const profile = await this.prisma.developerProfile.findUnique({
      where: { tenantId },
    });
    if (!profile) {
      throw new NotFoundException('Developer profile not found.');
    }

    const { page = 1, pageSize = 20 } = options;
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(Math.max(1, pageSize), 100);
    const skip = (safePage - 1) * safePageSize;

    const where = {
      profileId: profile.id,
      type: 'payout' as const,
    };

    const [items, total] = await Promise.all([
      this.prisma.developerEarning.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safePageSize,
      }),
      this.prisma.developerEarning.count({ where }),
    ]);

    return {
      items: items.map((e) => ({
        id: e.id,
        amount: e.amount.toString(),
        currency: e.currency,
        type: e.type,
        description: e.description,
        referenceType: e.referenceType,
        referenceId: e.referenceId,
        createdAt: e.createdAt,
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
    };
  }

  /**
   * getTransactions
   * ───────────────
   * Full earning/payout transaction history.
   */
  async getTransactions(
    tenantId: string,
    options: { type?: string; page?: number; pageSize?: number } = {},
  ) {
    const profile = await this.prisma.developerProfile.findUnique({
      where: { tenantId },
    });
    if (!profile) {
      throw new NotFoundException('Developer profile not found.');
    }

    const { type, page = 1, pageSize = 20 } = options;
    const where: any = { profileId: profile.id };
    if (type) where.type = type;

    const safePage = Math.max(1, page);
    const safePageSize = Math.min(Math.max(1, pageSize), 100);
    const skip = (safePage - 1) * safePageSize;

    const [items, total] = await Promise.all([
      this.prisma.developerEarning.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safePageSize,
      }),
      this.prisma.developerEarning.count({ where }),
    ]);

    const netEarnings = items.reduce(
      (sum, e) => sum + e.amount,
      BigInt(0),
    );

    return {
      items: items.map((e): TransactionRecord => ({
        id: e.id,
        amount: e.amount.toString(),
        currency: e.currency,
        type: e.type,
        description: e.description,
        referenceType: e.referenceType,
        referenceId: e.referenceId,
        createdAt: e.createdAt,
      })),
      summary: {
        totalItems: total,
        netEarnings: netEarnings.toString(),
      },
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
    };
  }

  /**
   * getPlatformCommissionSummary
   * ──────────────────────────────
   * Admin dashboard: tổng platform fee từ marketplace.
   * Aggregate theo currency và listing type.
   */
  async getPlatformCommissionSummary(
    options: {
      from?: Date;
      to?: Date;
    } = {},
  ): Promise<PlatformCommissionSummary> {
    const { from, to } = options;
    const where: any = { status: 'COMPLETED' };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    // Total platform fees
    const feesAgg = await this.prisma.marketplaceOrder.aggregate({
      where,
      _sum: { platformFee: true },
      _count: true,
    });

    const totalPlatformFees = feesAgg._sum.platformFee ?? BigInt(0);
    const totalOrders = feesAgg._count;

    // By currency
    const orders = await this.prisma.marketplaceOrder.findMany({
      where,
      select: {
        platformFee: true,
        currency: true,
        listingType: true,
      },
    });

    const byCurrency = new Map<string, { fees: bigint; count: number }>();
    const byListingType = new Map<string, { fees: bigint; count: number }>();

    for (const order of orders) {
      // Per currency
      const cur = byCurrency.get(order.currency) ?? { fees: BigInt(0), count: 0 };
      cur.fees += order.platformFee;
      cur.count++;
      byCurrency.set(order.currency, cur);

      // Per listing type
      const typ = byListingType.get(order.listingType) ?? { fees: BigInt(0), count: 0 };
      typ.fees += order.platformFee;
      typ.count++;
      byListingType.set(order.listingType, typ);
    }

    return {
      totalPlatformFees: totalPlatformFees.toString(),
      totalOrders,
      byCurrency: Array.from(byCurrency.entries()).map(([c, v]) => ({
        currency: c,
        fees: v.fees.toString(),
        count: v.count,
      })),
      byListingType: Array.from(byListingType.entries()).map(([t, v]) => ({
        type: t,
        fees: v.fees.toString(),
        count: v.count,
      })),
      periodStart: from?.toISOString(),
      periodEnd: to?.toISOString(),
    };
  }

  /**
   * getPendingPayoutSummary
   * ────────────────────────
   * Admin dashboard: tổng payout request đang chờ duyệt.
   */
  async getPendingPayoutSummary() {
    const agg = await this.prisma.developerPayoutRequest.aggregate({
      where: { status: 'PENDING' },
      _sum: { amount: true },
      _count: true,
    });

    const approvedAgg = await this.prisma.developerPayoutRequest.aggregate({
      where: { status: 'APPROVED' },
      _sum: { amount: true },
      _count: true,
    });

    return {
      pending: {
        count: agg._count,
        total: (agg._sum.amount ?? BigInt(0)).toString(),
      },
      approved: {
        count: approvedAgg._count,
        total: (approvedAgg._sum.amount ?? BigInt(0)).toString(),
      },
      currency: 'VND',
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═════════════════════════════════════════════════════════════════════

  private toPayoutResponse(request: any): PayoutRequestResponse {
    return {
      id: request.id,
      amount: request.amount.toString(),
      currency: request.currency,
      method: request.payoutMethod ?? null,
      status: request.status,
      notes: request.notes ?? null,
      rejectReason: request.rejectReason ?? null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }
}

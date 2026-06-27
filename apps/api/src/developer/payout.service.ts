// ═══════════════════════════════════════════════════════════════════════════
// payout.service.ts — Developer Payout & Revenue Withdrawal Engine
// ═══════════════════════════════════════════════════════════════════════════
// Xử lý payout cho developer:
//   • Tính available balance = totalEarnings - (payout + pending payout)
//   • Tạo payout request → ghi DeveloperEarning type='payout'
//   • Lịch sử payout và transaction log
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
  method?: string; // 'bank_transfer' | 'wallet' | 'paypal'
  accountInfo?: Record<string, string>;
  notes?: string;
}

export interface PayoutRequestResponse {
  id: string;
  amount: string;
  currency: string;
  method: string;
  status: string;
  notes: string | null;
  createdAt: Date;
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

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class PayoutService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * getBalance
   * ──────────
   * Lấy số dư khả dụng cho developer.
   * available = totalEarnings - paidOut (sum của payout type)
   */
  async getBalance(tenantId: string): Promise<BalanceResponse> {
    const profile = await this.prisma.developerProfile.findUnique({
      where: { tenantId },
    });
    if (!profile) {
      throw new NotFoundException('Developer profile not found.');
    }

    // Sum all payout records
    const payoutAgg = await this.prisma.developerEarning.aggregate({
      where: {
        profileId: profile.id,
        type: 'payout',
      },
      _sum: { amount: true },
    });
    const paidOut = payoutAgg._sum.amount ?? BigInt(0);
    const totalEarnings = profile.totalEarnings;

    // Pending: any earnings with type 'pending_payout' (optional tracking)
    const pendingAgg = await this.prisma.developerEarning.aggregate({
      where: {
        profileId: profile.id,
        type: 'pending_payout',
      },
      _sum: { amount: true },
    });
    const pendingBalance = pendingAgg._sum.amount ?? BigInt(0);

    const available = totalEarnings - paidOut - pendingBalance;

    return {
      availableBalance: available.toString(),
      pendingBalance: pendingBalance.toString(),
      paidOut: paidOut.toString(),
      totalEarnings: totalEarnings.toString(),
      currency: 'VND',
    };
  }

  /**
   * requestPayout
   * ─────────────
   * Developer yêu cầu rút tiền.
   * Kiểm tra số dư, tạo DeveloperEarning bản ghi type='payout'.
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

    // Create payout earning record (debit)
    const earning = await this.prisma.developerEarning.create({
      data: {
        profileId: profile.id,
        amount: -amount, // Negative amount to represent debit
        currency,
        type: 'payout',
        description: `Payout request: ${method}${input.notes ? ` — ${input.notes}` : ''}`,
        referenceType: 'payout_request',
        referenceId: `PAY-${Date.now().toString(36).toUpperCase()}`,
      },
    });

    // Update profile: subtract from totalEarnings (or leave it and compute net from earnings)
    // For cleaner accounting, update the totalEarnings down
    await this.prisma.developerProfile.update({
      where: { id: profile.id },
      data: {
        totalEarnings: profile.totalEarnings - amount,
      },
    });

    return {
      id: earning.id,
      amount: amount.toString(),
      currency,
      method,
      status: 'completed',
      notes: input.notes ?? null,
      createdAt: earning.createdAt,
    };
  }

  /**
   * getPayoutHistory
   * ────────────────
   * Lấy lịch sử payout của developer.
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
      type: 'payout',
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
}

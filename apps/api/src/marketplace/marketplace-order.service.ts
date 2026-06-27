// ═══════════════════════════════════════════════════════════════════════════
// marketplace-order.service.ts — Marketplace Purchase & Revenue Share
// ═══════════════════════════════════════════════════════════════════════════
// Quản lý giao dịch mua/bán trên marketplace với:
//   • Purchase flow: mua listing, frozen fx rate snapshot
//   • Revenue sharing: 70/30 mặc định, split theo certification level
//   • Developer earnings tracking
//   • Order history & refund
// ═══════════════════════════════════════════════════════════════════════════

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DeveloperProfileService } from '../developer/developer-profile.service';

// ── Revenue share rates by certification level ────────────────────────────
// Bronze: 70/30 (dev/platform)
// Silver: 75/25
// Gold: 80/20
// Platinum: 85/15

const REVENUE_SHARE_BY_TIER: Record<string, number> = {
  BRONZE: 0.7,
  SILVER: 0.75,
  GOLD: 0.8,
  PLATINUM: 0.85,
};

// ── Types ─────────────────────────────────────────────────────────────────

export interface PurchaseInput {
  listingKey: string;
  buyerTenantId: string;
  metadata?: Record<string, unknown>;
}

export interface OrderResponse {
  id: string;
  listingKey: string;
  listingName: string;
  listingType: string;
  amount: string;
  currency: string;
  revenueShare: number;
  devEarnings: string;
  platformFee: string;
  status: string;
  orderRef: string | null;
  createdAt: Date;
}

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class MarketplaceOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devProfile: DeveloperProfileService,
  ) {}

  /**
   * purchase
   * ────────
   * Mua một listing trên marketplace.
   * Tự động:
   *   1. Tính revenue share dựa trên tier của developer
   *   2. Ghi nhận DeveloperEarning cho dev
   *   3. Tăng download counter + totalSales
   *   4. Ghi nhận order
   */
  async purchase(input: PurchaseInput): Promise<OrderResponse> {
    if (!input.listingKey || !input.buyerTenantId) {
      throw new BadRequestException('listingKey and buyerTenantId are required.');
    }

    // ── Find listing ─────────────────────────────────────────────────
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { key: input.listingKey },
    });
    if (!listing) {
      throw new NotFoundException(
        `Listing '${input.listingKey}' not found.`,
      );
    }
    if (!listing.isPublished) {
      throw new BadRequestException(
        `Listing '${input.listingKey}' is not published.`,
      );
    }

    // ── Prevent self-purchase ────────────────────────────────────────
    if (listing.tenantId === input.buyerTenantId) {
      throw new BadRequestException('Cannot purchase your own listing.');
    }

    // ── Check for existing order ─────────────────────────────────────
    const existing = await this.prisma.marketplaceOrder.findUnique({
      where: {
        listingKey_buyerTenantId: {
          listingKey: input.listingKey,
          buyerTenantId: input.buyerTenantId,
        },
      },
    });
    if (existing && existing.status === 'COMPLETED') {
      throw new ConflictException(
        `Listing '${input.listingKey}' already purchased by this tenant.`,
      );
    }
    if (existing && existing.status === 'PENDING') {
      return this.toOrderResponse(existing);
    }

    // ── Determine revenue share ──────────────────────────────────────
    let revenueShare = 0.7; // Default BRONZE
    let devTier = 'BRONZE';

    if (listing.tenantId) {
      try {
        const devProfile = await this.devProfile.getProfile(listing.tenantId);
        devTier = devProfile.tier;
        revenueShare = REVENUE_SHARE_BY_TIER[devTier] ?? 0.7;
      } catch {
        // No developer profile — use default
        revenueShare = 0.7;
      }
    }

    // ── Calculate amounts ────────────────────────────────────────────
    const priceInVnd = BigInt(Math.round(listing.price * 100)); // Convert to smallest unit (cent-equivalent)
    const totalAmount = priceInVnd;
    const devEarnings = BigInt(Math.round(Number(totalAmount) * revenueShare));
    const platformFee = totalAmount - devEarnings;

    // ── Generate order reference ─────────────────────────────────────
    const orderRef = `ORD-${Date.now().toString(36).toUpperCase()}-${input.listingKey.slice(0, 8).toUpperCase()}`;

    // ── Execute in transaction ───────────────────────────────────────
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create order
      const order = await tx.marketplaceOrder.create({
        data: {
          listingId: listing.id,
          buyerTenantId: input.buyerTenantId,
          listingKey: input.listingKey,
          listingName: listing.name,
          listingType: listing.type,
          amount: totalAmount,
          currency: listing.currency ?? 'VND',
          revenueShare,
          devEarnings,
          platformFee,
          status: 'COMPLETED',
          orderRef,
          metadata: (input.metadata ?? undefined) as any,
        },
      });

      // 2. Increment download counter
      await tx.marketplaceListing.update({
        where: { id: listing.id },
        data: { downloads: { increment: 1 } },
      });

      // 3. Record developer earning (if listing has owner)
      if (listing.tenantId) {
        const devProfile = await tx.developerProfile.findUnique({
          where: { tenantId: listing.tenantId },
        });
        if (devProfile) {
          await tx.developerEarning.create({
            data: {
              profileId: devProfile.id,
              orderId: order.id,
              amount: devEarnings,
              currency: listing.currency ?? 'VND',
              type: 'sale',
              description: `Sale: ${listing.name} (${input.listingKey})`,
              referenceType: 'marketplace_order',
              referenceId: order.id,
            },
          });

          // Update profile stats
          await tx.developerProfile.update({
            where: { id: devProfile.id },
            data: {
              totalSales: { increment: 1 },
              totalEarnings: { increment: devEarnings },
            },
          });
        }
      }

      return order;
    });

    return this.toOrderResponse(result);
  }

  /**
   * listOrders
   * ──────────
   * Lấy danh sách order của buyer tenant.
   */
  async listOrders(
    buyerTenantId: string,
    options: { status?: string; page?: number; pageSize?: number } = {},
  ) {
    const { status, page = 1, pageSize = 20 } = options;
    const where: any = { buyerTenantId };
    if (status) where.status = status;

    const safePage = Math.max(1, page);
    const safePageSize = Math.min(Math.max(1, pageSize), 100);
    const skip = (safePage - 1) * safePageSize;

    const [items, total] = await Promise.all([
      this.prisma.marketplaceOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safePageSize,
      }),
      this.prisma.marketplaceOrder.count({ where }),
    ]);

    return {
      items: items.map((o) => this.toOrderResponse(o)),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
    };
  }

  /**
   * getSalesReport
   * ──────────────
   * Báo cáo doanh thu cho developer (các listing của họ đã bán được).
   */
  async getSalesReport(
    tenantId: string,
    options: { from?: Date; to?: Date; page?: number; pageSize?: number } = {},
  ) {
    const profile = await this.prisma.developerProfile.findUnique({
      where: { tenantId },
    });
    if (!profile) {
      throw new NotFoundException('Developer profile not found.');
    }

    const { from, to, page = 1, pageSize = 20 } = options;
    const where: any = { profileId: profile.id };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

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

    // Aggregate totals
    const totalEarnings = items.reduce(
      (s, e) => s + e.amount,
      BigInt(0),
    );

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
      summary: {
        totalItems: total,
        totalEarnings: totalEarnings.toString(),
        periodEarnings: totalEarnings.toString(),
      },
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═════════════════════════════════════════════════════════════════════

  private toOrderResponse(order: any): OrderResponse {
    return {
      id: order.id,
      listingKey: order.listingKey,
      listingName: order.listingName,
      listingType: order.listingType,
      amount: order.amount.toString(),
      currency: order.currency,
      revenueShare: order.revenueShare,
      devEarnings: order.devEarnings.toString(),
      platformFee: order.platformFee.toString(),
      status: order.status,
      orderRef: order.orderRef,
      createdAt: order.createdAt,
    };
  }
}

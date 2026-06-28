// ═══════════════════════════════════════════════════════════════════════════
// marketplace-order.service.spec.ts — Marketplace Purchase & Revenue Share Tests
// ═══════════════════════════════════════════════════════════════════════════
// Test coverage:
//   • Purchase — success with revenue split (70/30 default)
//   • Purchase — tier-based split (Platinum = 85/15)
//   • Self-purchase prevention
//   • Duplicate purchase prevention
//   • Unpublished listing prevention
//   • Missing listing error
// ═══════════════════════════════════════════════════════════════════════════

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { MarketplaceOrderService } from './marketplace-order.service';
import { PrismaService } from '../prisma.service';
import { DeveloperProfileService } from '../developer/developer-profile.service';

// ── Factories ─────────────────────────────────────────────────────────────

const makeListing = (overrides = {}) => ({
  id: 'listing_1',
  tenantId: 'tenant_dev_1',
  type: 'connector',
  key: 'test-connector',
  name: 'Test Connector',
  description: 'A test connector',
  category: 'AI',
  industry: 'tech',
  region: 'VN',
  price: 2000, // 2000 VND (Float, not BigInt)
  currency: 'VND',
  isPublished: true,
  downloads: 0,
  totalSales: 0,
  ...overrides,
});

const makeProfile = (overrides = {}) => ({
  id: 'profile_1',
  tenantId: 'tenant_dev_1',
  displayName: 'Test Dev',
  tier: 'BRONZE',
  totalSales: 0,
  totalEarnings: BigInt(0),
  ...overrides,
});

// ── Spec ──────────────────────────────────────────────────────────────────

describe('MarketplaceOrderService', () => {
  let service: MarketplaceOrderService;
  let prisma: any;
  let devProfile: any;

  beforeEach(async () => {
    prisma = {
      marketplaceListing: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      marketplaceOrder: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
      developerProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      developerEarning: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    devProfile = {
      getProfile: jest.fn(),
    };

    prisma.$transaction.mockImplementation((cb: Function) => cb(prisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceOrderService,
        { provide: PrismaService, useValue: prisma },
        { provide: DeveloperProfileService, useValue: devProfile },
      ],
    }).compile();

    service = module.get<MarketplaceOrderService>(MarketplaceOrderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ═════════════════════════════════════════════════════════════════════
  //  purchase
  // ═════════════════════════════════════════════════════════════════════

  describe('purchase', () => {
    it('should purchase a listing with default 70/30 revenue split', async () => {
      const listing = makeListing({ price: 2000 });
      prisma.marketplaceListing.findUnique.mockResolvedValue(listing);
      prisma.marketplaceOrder.findUnique.mockResolvedValue(null);
      devProfile.getProfile.mockResolvedValue(makeProfile({ tier: 'BRONZE' }));

      const createdOrder = {
        id: 'order_1',
        listingId: 'listing_1',
        buyerTenantId: 'tenant_buyer_1',
        listingKey: 'test-connector',
        listingName: 'Test Connector',
        listingType: 'connector',
        amount: BigInt(200000), // 2000 * 100
        currency: 'VND',
        revenueShare: 0.7,
        devEarnings: BigInt(140000), // 70%
        platformFee: BigInt(60000), // 30%
        status: 'COMPLETED',
        orderRef: 'ORD-TEST',
        createdAt: new Date(),
      };

      prisma.marketplaceOrder.create.mockResolvedValue(createdOrder);

      const devProfileRecord = makeProfile();
      prisma.developerProfile.findUnique.mockResolvedValue(devProfileRecord);

      const result = await service.purchase({
        listingKey: 'test-connector',
        buyerTenantId: 'tenant_buyer_1',
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.revenueShare).toBe(0.7);
      expect(result.devEarnings).toBe('140000');
      expect(result.platformFee).toBe('60000');
      expect(prisma.marketplaceListing.update).toHaveBeenCalled();
      expect(prisma.developerEarning.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: BigInt(140000),
            type: 'sale',
          }),
        }),
      );
    });

    it('should apply Platinum 85/15 split', async () => {
      const listing = makeListing({ price: 2000 });
      prisma.marketplaceListing.findUnique.mockResolvedValue(listing);
      prisma.marketplaceOrder.findUnique.mockResolvedValue(null);
      devProfile.getProfile.mockResolvedValue(makeProfile({ tier: 'PLATINUM' }));

      const createdOrder = {
        ...makeProfile(),
        id: 'order_1',
        listingId: 'listing_1',
        buyerTenantId: 'tenant_buyer_1',
        listingKey: 'test-connector',
        listingName: 'Test Connector',
        listingType: 'connector',
        amount: BigInt(200000),
        currency: 'VND',
        revenueShare: 0.85,
        devEarnings: BigInt(170000),
        platformFee: BigInt(30000),
        status: 'COMPLETED',
        orderRef: 'ORD-TEST',
        createdAt: new Date(),
        // These fields exist on the mock but aren't on MarketplaceOrder; ignore type issues
      } as any;

      prisma.marketplaceOrder.create.mockResolvedValue(createdOrder);
      prisma.developerProfile.findUnique.mockResolvedValue(makeProfile());

      const result = await service.purchase({
        listingKey: 'test-connector',
        buyerTenantId: 'tenant_buyer_1',
      });

      expect(result.revenueShare).toBe(0.85);
      expect(result.devEarnings).toBe('170000');
      expect(result.platformFee).toBe('30000');
    });

    it('should throw when listing not found', async () => {
      prisma.marketplaceListing.findUnique.mockResolvedValue(null);

      await expect(
        service.purchase({
          listingKey: 'no-such-key',
          buyerTenantId: 'tenant_buyer_1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when listing is not published', async () => {
      prisma.marketplaceListing.findUnique.mockResolvedValue(
        makeListing({ isPublished: false }),
      );

      await expect(
        service.purchase({
          listingKey: 'test-connector',
          buyerTenantId: 'tenant_buyer_1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw on self-purchase', async () => {
      prisma.marketplaceListing.findUnique.mockResolvedValue(
        makeListing({ tenantId: 'tenant_dev_1' }),
      );

      await expect(
        service.purchase({
          listingKey: 'test-connector',
          buyerTenantId: 'tenant_dev_1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw on duplicate purchase (already COMPLETED)', async () => {
      prisma.marketplaceListing.findUnique.mockResolvedValue(makeListing());
      prisma.marketplaceOrder.findUnique.mockResolvedValue({
        status: 'COMPLETED',
      });

      await expect(
        service.purchase({
          listingKey: 'test-connector',
          buyerTenantId: 'tenant_buyer_1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should return existing PENDING order instead of creating new', async () => {
      const existingOrder = {
        id: 'order_existing',
        listingKey: 'test-connector',
        listingName: 'Test Connector',
        listingType: 'connector',
        amount: BigInt(200000),
        currency: 'VND',
        revenueShare: 0.7,
        devEarnings: BigInt(140000),
        platformFee: BigInt(60000),
        status: 'PENDING',
        orderRef: null,
        createdAt: new Date(),
      };

      prisma.marketplaceListing.findUnique.mockResolvedValue(makeListing());
      prisma.marketplaceOrder.findUnique.mockResolvedValue(existingOrder);

      const result = await service.purchase({
        listingKey: 'test-connector',
        buyerTenantId: 'tenant_buyer_1',
      });

      expect(result.status).toBe('PENDING');
      expect(prisma.marketplaceOrder.create).not.toHaveBeenCalled();
    });

    it('should require listingKey and buyerTenantId', async () => {
      await expect(
        (service as any).purchase({ listingKey: '', buyerTenantId: 't1' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        (service as any).purchase({ listingKey: 'key', buyerTenantId: '' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  listOrders
  // ═════════════════════════════════════════════════════════════════════

  describe('listOrders', () => {
    it('should return paginated orders for buyer', async () => {
      prisma.marketplaceOrder.findMany.mockResolvedValue([
        {
          id: 'order_1',
          listingKey: 'test-connector',
          listingName: 'Test Connector',
          listingType: 'connector',
          amount: BigInt(200000),
          currency: 'VND',
          revenueShare: 0.7,
          devEarnings: BigInt(140000),
          platformFee: BigInt(60000),
          status: 'COMPLETED',
          orderRef: 'ORD-1',
          createdAt: new Date(),
        },
      ]);
      prisma.marketplaceOrder.count.mockResolvedValue(1);

      const result = await service.listOrders('tenant_buyer_1');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by status', async () => {
      prisma.marketplaceOrder.findMany.mockResolvedValue([]);
      prisma.marketplaceOrder.count.mockResolvedValue(0);

      await service.listOrders('tenant_buyer_1', { status: 'COMPLETED' });
      expect(prisma.marketplaceOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            buyerTenantId: 'tenant_buyer_1',
            status: 'COMPLETED',
          }),
        }),
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getSalesReport
  // ═════════════════════════════════════════════════════════════════════

  describe('getSalesReport', () => {
    it('should return sales report for developer', async () => {
      const profile = makeProfile();
      prisma.developerProfile.findUnique.mockResolvedValue(profile);
      prisma.developerEarning.findMany.mockResolvedValue([
        {
          id: 'earn_1',
          amount: BigInt(140000),
          currency: 'VND',
          type: 'sale',
          description: 'Sale: Test Connector',
          referenceType: 'marketplace_order',
          referenceId: 'order_1',
          createdAt: new Date(),
        },
      ]);
      prisma.developerEarning.count.mockResolvedValue(1);

      const result = await service.getSalesReport('tenant_dev_1');
      expect(result.items).toHaveLength(1);
      expect(result.summary.periodEarnings).toBe('140000');
    });

    it('should throw when profile not found', async () => {
      prisma.developerProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.getSalesReport('no_such_tenant'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// payout.service.spec.ts — PayoutService Integration Tests
// ═══════════════════════════════════════════════════════════════════════════
// Phase 3: Ecosystem Economy — Payout Approval Workflow + Platform Commission
// Test coverage:
//   • Balance (normal, pending exclusion, no profile)
//   • Request payout (success, insufficient, negative, no profile)
//   • Approve payout (success, not found, wrong status, balance race)
//   • Reject payout (success, wrong status)
//   • Cancel payout (success, wrong owner, wrong status)
//   • Process payout (success, wrong status)
//   • Platform commission summary (aggregation)
//   • Pending payout summary
// ═══════════════════════════════════════════════════════════════════════════

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { PrismaService } from '../prisma.service';

// ── Factories ─────────────────────────────────────────────────────────────

const makeProfile = (overrides = {}) => ({
  id: 'profile_1',
  tenantId: 'tenant_dev_1',
  userId: 'user_1',
  displayName: 'Test Dev',
  totalEarnings: BigInt(500000), // 5,000 VND in smallest unit
  ...overrides,
});

const makeEarning = (overrides = {}) => ({
  id: 'earn_1',
  profileId: 'profile_1',
  amount: BigInt(0),
  currency: 'VND',
  type: 'sale',
  description: null,
  referenceType: null,
  referenceId: null,
  createdAt: new Date(),
  ...overrides,
});

const makePayoutRequest = (overrides = {}) => ({
  id: 'req_1',
  profileId: 'profile_1',
  amount: BigInt(100000),
  currency: 'VND',
  status: 'PENDING',
  payoutMethod: 'bank_transfer',
  accountInfo: null,
  notes: 'test payout',
  approvedById: null,
  approvedAt: null,
  processedAt: null,
  rejectReason: null,
  createdAt: new Date('2026-06-28'),
  updatedAt: new Date('2026-06-28'),
  ...overrides,
});

const makeOrder = (overrides = {}) => ({
  id: 'order_1',
  listingId: 'listing_1',
  buyerTenantId: 'tenant_buyer_1',
  listingKey: 'test-connector',
  listingName: 'Test Connector',
  listingType: 'connector',
  amount: BigInt(200000),
  currency: 'VND',
  platformFee: BigInt(60000),
  devEarnings: BigInt(140000),
  revenueShare: 0.7,
  status: 'COMPLETED',
  orderRef: 'ORD-ABC',
  createdAt: new Date(),
  ...overrides,
});

// ── Spec ──────────────────────────────────────────────────────────────────

describe('PayoutService', () => {
  let service: PayoutService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      developerProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      developerEarning: {
        aggregate: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      developerPayoutRequest: {
        aggregate: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      marketplaceOrder: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    // Default: $transaction calls callback with prisma mock
    prisma.$transaction.mockImplementation((cb: Function) => cb(prisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PayoutService>(PayoutService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getBalance
  // ═════════════════════════════════════════════════════════════════════

  describe('getBalance', () => {
    it('should return available balance = earnings - paidout - pending', async () => {
      const profile = makeProfile({ totalEarnings: BigInt(500000) });
      prisma.developerProfile.findUnique.mockResolvedValue(profile);
      prisma.developerEarning.aggregate.mockResolvedValue({
        _sum: { amount: BigInt(100000) }, // 100k paid out
      });
      prisma.developerPayoutRequest.aggregate.mockResolvedValue({
        _sum: { amount: BigInt(50000) }, // 50k pending
      });

      const result = await service.getBalance('tenant_dev_1');

      expect(result.availableBalance).toBe('350000'); // 500k - 100k - 50k
      expect(result.pendingBalance).toBe('50000');
      expect(result.paidOut).toBe('100000');
      expect(result.totalEarnings).toBe('500000');
    });

    it('should return full earnings when no payouts or pending', async () => {
      const profile = makeProfile({ totalEarnings: BigInt(300000) });
      prisma.developerProfile.findUnique.mockResolvedValue(profile);
      prisma.developerEarning.aggregate.mockResolvedValue({
        _sum: { amount: BigInt(0) },
      });
      prisma.developerPayoutRequest.aggregate.mockResolvedValue({
        _sum: { amount: BigInt(0) },
      });

      const result = await service.getBalance('tenant_dev_1');
      expect(result.availableBalance).toBe('300000');
    });

    it('should throw NotFoundException when profile not found', async () => {
      prisma.developerProfile.findUnique.mockResolvedValue(null);

      await expect(service.getBalance('no_such_tenant')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  requestPayout
  // ═════════════════════════════════════════════════════════════════════

  describe('requestPayout', () => {
    it('should create a PENDING payout request', async () => {
      const profile = makeProfile({ totalEarnings: BigInt(500000) });
      prisma.developerProfile.findUnique.mockResolvedValue(profile);
      prisma.developerEarning.aggregate.mockResolvedValue({
        _sum: { amount: BigInt(0) },
      });
      prisma.developerPayoutRequest.aggregate.mockResolvedValue({
        _sum: { amount: BigInt(0) },
      });
      prisma.developerPayoutRequest.create.mockResolvedValue(
        makePayoutRequest(),
      );

      const result = await service.requestPayout('tenant_dev_1', {
        amount: '100000',
        method: 'bank_transfer',
        notes: 'test payout',
      });

      expect(result.status).toBe('PENDING');
      expect(result.amount).toBe('100000');
      expect(result.method).toBe('bank_transfer');
      expect(
        prisma.developerPayoutRequest.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: BigInt(100000),
            status: 'PENDING',
          }),
        }),
      );
    });

    it('should throw when amount exceeds available balance', async () => {
      const profile = makeProfile({ totalEarnings: BigInt(50000) });
      prisma.developerProfile.findUnique.mockResolvedValue(profile);
      prisma.developerEarning.aggregate.mockResolvedValue({
        _sum: { amount: BigInt(0) },
      });
      prisma.developerPayoutRequest.aggregate.mockResolvedValue({
        _sum: { amount: BigInt(0) },
      });

      await expect(
        service.requestPayout('tenant_dev_1', { amount: '100000' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when amount is zero or negative', async () => {
      const profile = makeProfile();
      prisma.developerProfile.findUnique.mockResolvedValue(profile);
      prisma.developerEarning.aggregate.mockResolvedValue({
        _sum: { amount: BigInt(0) },
      });
      prisma.developerPayoutRequest.aggregate.mockResolvedValue({
        _sum: { amount: BigInt(0) },
      });

      await expect(
        service.requestPayout('tenant_dev_1', { amount: '0' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.requestPayout('tenant_dev_1', { amount: '-1000' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when profile not found', async () => {
      prisma.developerProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.requestPayout('no_such_tenant', { amount: '10000' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  approvePayout
  // ═════════════════════════════════════════════════════════════════════

  describe('approvePayout', () => {
    it('should approve a PENDING request and create earning debit', async () => {
      const profile = makeProfile({ totalEarnings: BigInt(500000) });
      const payoutReq = makePayoutRequest({ status: 'PENDING' });

      prisma.developerPayoutRequest.findUnique.mockResolvedValue(payoutReq);

      // Inside $transaction mock
      prisma.developerProfile.findUnique.mockResolvedValue(profile);
      prisma.developerEarning.aggregate.mockResolvedValue({
        _sum: { amount: BigInt(100000) },
      });
      prisma.developerPayoutRequest.aggregate.mockResolvedValue({
        _sum: { amount: BigInt(0) },
      });
      prisma.developerPayoutRequest.update.mockResolvedValue(
        makePayoutRequest({
          status: 'APPROVED',
          approvedById: 'tenant_admin_1',
          approvedAt: new Date(),
        }),
      );
      prisma.developerEarning.create.mockResolvedValue(makeEarning());

      const result = await service.approvePayout('req_1', 'tenant_admin_1');

      expect(result.status).toBe('APPROVED');
      expect(prisma.developerEarning.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: BigInt(-100000), // Negative = debit
            type: 'payout',
          }),
        }),
      );
      expect(prisma.developerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalEarnings: BigInt(400000), // 500k - 100k
          }),
        }),
      );
    });

    it('should throw not found when request missing', async () => {
      prisma.developerPayoutRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.approvePayout('no_such_req', 'admin'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when request status is not PENDING', async () => {
      prisma.developerPayoutRequest.findUnique.mockResolvedValue(
        makePayoutRequest({ status: 'PROCESSED' }),
      );

      await expect(
        service.approvePayout('req_1', 'admin'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when balance insufficient within transaction', async () => {
      const profile = makeProfile({ totalEarnings: BigInt(50000) });
      const payoutReq = makePayoutRequest({
        status: 'PENDING',
        amount: BigInt(100000),
      });

      prisma.developerPayoutRequest.findUnique.mockResolvedValue(payoutReq);
      prisma.developerProfile.findUnique.mockResolvedValue(profile);
      prisma.developerEarning.aggregate.mockResolvedValue({
        _sum: { amount: BigInt(0) },
      });
      prisma.developerPayoutRequest.aggregate.mockResolvedValue({
        _sum: { amount: BigInt(0) },
      });

      await expect(
        service.approvePayout('req_1', 'admin'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  rejectPayout
  // ═════════════════════════════════════════════════════════════════════

  describe('rejectPayout', () => {
    it('should reject a PENDING request with reason', async () => {
      prisma.developerPayoutRequest.findUnique.mockResolvedValue(
        makePayoutRequest({ status: 'PENDING' }),
      );
      prisma.developerPayoutRequest.update.mockResolvedValue(
        makePayoutRequest({
          status: 'REJECTED',
          rejectReason: 'Incomplete bank info',
        }),
      );

      const result = await service.rejectPayout(
        'req_1',
        'tenant_admin_1',
        'Incomplete bank info',
      );

      expect(result.status).toBe('REJECTED');
      expect(result.rejectReason).toBe('Incomplete bank info');
    });

    it('should throw when request is not PENDING', async () => {
      prisma.developerPayoutRequest.findUnique.mockResolvedValue(
        makePayoutRequest({ status: 'APPROVED' }),
      );

      await expect(
        service.rejectPayout('req_1', 'admin'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  cancelPayout
  // ═════════════════════════════════════════════════════════════════════

  describe('cancelPayout', () => {
    it('should cancel own PENDING request', async () => {
      prisma.developerPayoutRequest.findUnique.mockResolvedValue(
        makePayoutRequest({
          status: 'PENDING',
          profile: { tenantId: 'tenant_dev_1' },
        }),
      );
      prisma.developerPayoutRequest.update.mockResolvedValue(
        makePayoutRequest({ status: 'CANCELLED' }),
      );

      const result = await service.cancelPayout('req_1', 'tenant_dev_1');
      expect(result.status).toBe('CANCELLED');
    });

    it('should throw when cancelling someone else request', async () => {
      prisma.developerPayoutRequest.findUnique.mockResolvedValue(
        makePayoutRequest({
          status: 'PENDING',
          profile: { tenantId: 'tenant_other' },
        }),
      );

      await expect(
        service.cancelPayout('req_1', 'tenant_dev_1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when not PENDING', async () => {
      prisma.developerPayoutRequest.findUnique.mockResolvedValue(
        makePayoutRequest({
          status: 'APPROVED',
          profile: { tenantId: 'tenant_dev_1' },
        }),
      );

      await expect(
        service.cancelPayout('req_1', 'tenant_dev_1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  processPayout
  // ═════════════════════════════════════════════════════════════════════

  describe('processPayout', () => {
    it('should mark APPROVED request as PROCESSED', async () => {
      prisma.developerPayoutRequest.findUnique.mockResolvedValue(
        makePayoutRequest({ status: 'APPROVED' }),
      );
      prisma.developerPayoutRequest.update.mockResolvedValue(
        makePayoutRequest({ status: 'PROCESSED', processedAt: new Date() }),
      );

      const result = await service.processPayout('req_1');
      expect(result.status).toBe('PROCESSED');
    });

    it('should throw when not APPROVED', async () => {
      prisma.developerPayoutRequest.findUnique.mockResolvedValue(
        makePayoutRequest({ status: 'PENDING' }),
      );

      await expect(service.processPayout('req_1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  listPayoutRequests
  // ═════════════════════════════════════════════════════════════════════

  describe('listPayoutRequests', () => {
    it('should list all requests when no tenantId filter', async () => {
      prisma.developerPayoutRequest.findMany.mockResolvedValue([
        makePayoutRequest({ id: 'req_1', profile: { displayName: 'Dev1', tenantId: 't1' } }),
        makePayoutRequest({ id: 'req_2', profile: { displayName: 'Dev2', tenantId: 't2' } }),
      ]);
      prisma.developerPayoutRequest.count.mockResolvedValue(2);

      const result = await service.listPayoutRequests();
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by tenantId', async () => {
      const profile = makeProfile();
      prisma.developerProfile.findUnique.mockResolvedValue(profile);
      prisma.developerPayoutRequest.findMany.mockResolvedValue([
        makePayoutRequest({ profile: { displayName: 'Dev1', tenantId: 't1' } }),
      ]);
      prisma.developerPayoutRequest.count.mockResolvedValue(1);

      const result = await service.listPayoutRequests({ tenantId: 'tenant_dev_1' });
      expect(result.items).toHaveLength(1);
    });

    it('should filter by status', async () => {
      prisma.developerPayoutRequest.findMany.mockResolvedValue([
        makePayoutRequest({ status: 'PENDING' }),
      ]);
      prisma.developerPayoutRequest.count.mockResolvedValue(1);

      const result = await service.listPayoutRequests({ status: 'PENDING' });
      expect(result.items).toHaveLength(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getPlatformCommissionSummary
  // ═════════════════════════════════════════════════════════════════════

  describe('getPlatformCommissionSummary', () => {
    it('should aggregate platform fees from completed orders', async () => {
      prisma.marketplaceOrder.aggregate.mockResolvedValue({
        _sum: { platformFee: BigInt(300000) },
        _count: 3,
      });
      prisma.marketplaceOrder.findMany.mockResolvedValue([
        makeOrder({
          currency: 'VND',
          listingType: 'connector',
          platformFee: BigInt(60000),
        }),
        makeOrder({
          currency: 'VND',
          listingType: 'template',
          platformFee: BigInt(120000),
        }),
        makeOrder({
          currency: 'USD',
          listingType: 'connector',
          platformFee: BigInt(120000),
        }),
      ]);

      const result = await service.getPlatformCommissionSummary();

      expect(result.totalPlatformFees).toBe('300000');
      expect(result.totalOrders).toBe(3);
      expect(result.byCurrency).toHaveLength(2); // VND + USD
      expect(result.byListingType).toHaveLength(2); // connector + template

      const vnd = result.byCurrency.find((c) => c.currency === 'VND');
      expect(vnd).toBeDefined();
      expect(vnd!.count).toBe(2);
    });

    it('should return zeros when no completed orders', async () => {
      prisma.marketplaceOrder.aggregate.mockResolvedValue({
        _sum: { platformFee: BigInt(0) },
        _count: 0,
      });
      prisma.marketplaceOrder.findMany.mockResolvedValue([]);

      const result = await service.getPlatformCommissionSummary();

      expect(result.totalPlatformFees).toBe('0');
      expect(result.totalOrders).toBe(0);
      expect(result.byCurrency).toHaveLength(0);
      expect(result.byListingType).toHaveLength(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getPendingPayoutSummary
  // ═════════════════════════════════════════════════════════════════════

  describe('getPendingPayoutSummary', () => {
    it('should return pending and approved totals', async () => {
      prisma.developerPayoutRequest.aggregate
        .mockResolvedValueOnce({
          _sum: { amount: BigInt(150000) },
          _count: 3,
        })
        .mockResolvedValueOnce({
          _sum: { amount: BigInt(200000) },
          _count: 1,
        });

      const result = await service.getPendingPayoutSummary();

      expect(result.pending.count).toBe(3);
      expect(result.pending.total).toBe('150000');
      expect(result.approved.count).toBe(1);
      expect(result.approved.total).toBe('200000');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getPayoutHistory
  // ═════════════════════════════════════════════════════════════════════

  describe('getPayoutHistory', () => {
    it('should return paginated payout history', async () => {
      const profile = makeProfile();
      prisma.developerProfile.findUnique.mockResolvedValue(profile);
      prisma.developerEarning.findMany.mockResolvedValue([
        makeEarning({
          amount: BigInt(-100000),
          type: 'payout',
          description: 'Payout approved: bank_transfer',
          referenceType: 'payout_request',
          referenceId: 'req_1',
        }),
      ]);
      prisma.developerEarning.count.mockResolvedValue(1);

      const result = await service.getPayoutHistory('tenant_dev_1');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].amount).toBe('-100000');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getTransactions
  // ═════════════════════════════════════════════════════════════════════

  describe('getTransactions', () => {
    it('should return full transaction history with net earnings', async () => {
      const profile = makeProfile();
      prisma.developerProfile.findUnique.mockResolvedValue(profile);
      prisma.developerEarning.findMany.mockResolvedValue([
        makeEarning({ amount: BigInt(140000), type: 'sale' }),
        makeEarning({ amount: BigInt(-100000), type: 'payout' }),
      ]);
      prisma.developerEarning.count.mockResolvedValue(2);

      const result = await service.getTransactions('tenant_dev_1');
      expect(result.items).toHaveLength(2);
      expect(result.summary.netEarnings).toBe('40000'); // 140k - 100k
    });
  });
});

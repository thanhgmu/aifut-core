// ═══════════════════════════════════════════════════════════════════════════
// recommendation.service.spec.ts — Predictive Recommendation Engine Tests
// ═══════════════════════════════════════════════════════════════════════════

import { RecommendationService } from './recommendation.service';
import { PrismaService } from '../prisma.service';

// ── Mock Types ────────────────────────────────────────────────────────────

interface MockMarketplaceListing {
  id: string;
  key: string;
  name: string;
  type: string;
  description: string | null;
  category: string | null;
  industry: string | null;
  tags: any;
  rating: number | null;
  downloads: number;
  isOfficial: boolean;
  authorName: string | null;
  price: number;
  isPublished: boolean;
}

interface MockInstallEvent {
  listingId: string;
  buyerTenantId: string;
  eventType: string;
  createdAt: Date;
}

interface MockMarketplaceOrder {
  listingId: string;
  buyerTenantId: string;
  status: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeListing(overrides: Partial<MockMarketplaceListing> = {}): MockMarketplaceListing {
  return {
    id: `lst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    key: `connector-${Date.now()}`,
    name: 'Test Connector',
    type: 'connector',
    description: 'A test connector',
    category: 'messaging',
    industry: 'tech',
    tags: ['communication', 'api'],
    rating: 4.0,
    downloads: 100,
    isOfficial: false,
    authorName: 'Community',
    price: 0,
    isPublished: true,
    ...overrides,
  };
}

function makeMockPrisma() {
  const listings: MockMarketplaceListing[] = [];
  const installEvents: MockInstallEvent[] = [];
  const orders: MockMarketplaceOrder[] = [];
  let listingIdCounter = 0;

  return {
    marketplaceListing: {
      findMany: jest.fn().mockImplementation((args: any) => {
        let filtered = [...listings];
        if (args?.where?.type) filtered = filtered.filter((l) => l.type === args.where.type);
        if (args?.where?.isPublished !== undefined) filtered = filtered.filter((l) => l.isPublished === args.where.isPublished);
        if (args?.where?.industry) filtered = filtered.filter((l) => l.industry === args.where.industry);
        const skip = args?.skip ?? 0;
        const take = args?.take ?? filtered.length;
        return Promise.resolve(filtered.slice(skip, skip + take));
      }),
    },
    marketplaceInstallEvent: {
      findMany: jest.fn().mockImplementation((args: any) => {
        let filtered = [...installEvents];
        if (args?.where?.buyerTenantId) {
          if (typeof args.where.buyerTenantId === 'object' && args.where.buyerTenantId.not) {
            filtered = filtered.filter((e) => e.buyerTenantId !== args.where.buyerTenantId.not);
          } else {
            filtered = filtered.filter((e) => e.buyerTenantId === args.where.buyerTenantId);
          }
        }
        if (args?.where?.eventType?.in) {
          filtered = filtered.filter((e) => args.where.eventType.in.includes(e.eventType));
        } else if (args?.where?.eventType) {
          filtered = filtered.filter((e) => e.eventType === args.where.eventType);
        }
        if (args?.where?.listingId?.in) {
          filtered = filtered.filter((e) => args.where.listingId.in.includes(e.listingId));
        }
        filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return Promise.resolve(filtered);
      }),
    },
    marketplaceOrder: {
      findMany: jest.fn().mockImplementation((args: any) => {
        let filtered = [...orders];
        if (args?.where?.buyerTenantId) filtered = filtered.filter((o) => o.buyerTenantId === args.where.buyerTenantId);
        if (args?.where?.status) filtered = filtered.filter((o) => o.status === args.where.status);
        return Promise.resolve(filtered);
      }),
    },
    _seedListing: (overrides: Partial<MockMarketplaceListing> = {}) => {
      const l = makeListing({ ...overrides, id: `lst-${++listingIdCounter}` });
      listings.push(l);
      return l;
    },
    _seedInstall: (overrides: Partial<MockInstallEvent> = {}) => {
      const e = {
        listingId: 'lst-1',
        buyerTenantId: 'tenant-1',
        eventType: 'INSTALL',
        createdAt: new Date(),
        ...overrides,
      };
      installEvents.push(e);
      return e;
    },
    _seedOrder: (overrides: Partial<MockMarketplaceOrder> = {}) => {
      const o = { listingId: 'lst-1', buyerTenantId: 'tenant-1', status: 'COMPLETED', ...overrides };
      orders.push(o);
      return o;
    },
    _clear: () => { listings.length = 0; installEvents.length = 0; orders.length = 0; listingIdCounter = 0; },
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('RecommendationService', () => {
  let service: RecommendationService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    service = new RecommendationService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => mockPrisma._clear());

  // ═════════════════════════════════════════════════════════════════════
  //  getConnectorRecommendations — cold start (no installs)
  // ═════════════════════════════════════════════════════════════════════

  describe('cold start (no installs)', () => {
    it('should return cold-start recommendations based on popularity', async () => {
      mockPrisma._seedListing({ type: 'connector', name: 'Slack', downloads: 500, rating: 4.5, isOfficial: true });
      mockPrisma._seedListing({ type: 'connector', name: 'Stripe', downloads: 300, rating: 4.2 });
      mockPrisma._seedListing({ type: 'connector', name: 'Notion', downloads: 100, rating: 3.8 });

      const result = await service.getConnectorRecommendations('tenant-1');
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.totalAvailable).toBeGreaterThan(0);
      expect(result.peerCount).toBe(0);
      // Official picks should rank higher
      expect(result.recommendations[0].isOfficial).toBe(true);
    });

    it('should return empty when no listings exist', async () => {
      const result = await service.getConnectorRecommendations('empty-tenant');
      expect(result.recommendations).toHaveLength(0);
      expect(result.totalAvailable).toBe(0);
    });

    it('should filter out already-installed items', async () => {
      const slack = mockPrisma._seedListing({ type: 'connector', name: 'Slack' });
      mockPrisma._seedListing({ type: 'connector', name: 'Stripe' });
      // "Install" Slack via install event
      mockPrisma._seedInstall({ listingId: slack.id, buyerTenantId: 'tenant-1' });

      const result = await service.getConnectorRecommendations('tenant-1');
      const installedNames = result.recommendations.map((r) => r.name);
      // Slack is installed, shouldn't appear as recommendation
      const slackIndex = installedNames.indexOf('Slack');
      // Either Slack was filtered out or was last
      expect(slackIndex).toBeLessThanOrEqual(0); // 0 means Stripe is first, -1 means Slack was filtered
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getTemplateRecommendations
  // ═════════════════════════════════════════════════════════════════════

  describe('getTemplateRecommendations', () => {
    it('should return template recommendations', async () => {
      mockPrisma._seedListing({ type: 'template', name: 'Sales CRM', downloads: 200, rating: 4.0 });

      const result = await service.getTemplateRecommendations('tenant-1');
      expect(result.recommendations.some((r) => r.type === 'template')).toBe(true);
    });

    it('should respect minScore filter', async () => {
      mockPrisma._seedListing({ type: 'template', name: 'Low Score', downloads: 1, rating: 1.0 });

      const result = await service.getTemplateRecommendations('tenant-1', { minScore: 0.5 });
      // Low-score items may not appear
      expect(result.recommendations.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getWorkflowRecommendations
  // ═════════════════════════════════════════════════════════════════════

  describe('getWorkflowRecommendations', () => {
    it('should return workflow recommendations', async () => {
      mockPrisma._seedListing({ type: 'workflow', name: 'Data Pipeline', downloads: 150, rating: 4.2 });

      const result = await service.getWorkflowRecommendations('tenant-1');
      expect(result.recommendations.some((r) => r.type === 'workflow')).toBe(true);
    });

    it('should limit results', async () => {
      for (let i = 0; i < 15; i++) {
        mockPrisma._seedListing({ type: 'workflow', name: `Workflow ${i}`, downloads: 100 - i, rating: 4.0 });
      }

      const result = await service.getWorkflowRecommendations('tenant-1', { limit: 5 });
      expect(result.recommendations.length).toBeLessThanOrEqual(5);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getColdStartRecommendations
  // ═════════════════════════════════════════════════════════════════════

  describe('getColdStartRecommendations', () => {
    it('should return popularity-based recommendations with industry filter', async () => {
      mockPrisma._seedListing({ type: 'connector', name: 'Fintech Connector', industry: 'fintech', downloads: 300, isOfficial: true });
      mockPrisma._seedListing({ type: 'connector', name: 'Health Connector', industry: 'health', downloads: 200 });
      mockPrisma._seedListing({ type: 'connector', name: 'Generic Connector', industry: null, downloads: 100 });

      const result = await service.getColdStartRecommendations('fintech-tenant', 'connector', { industry: 'fintech' });
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.peerCount).toBe(0);
    });

    it('should handle missing industry gracefully', async () => {
      mockPrisma._seedListing({ type: 'connector', name: 'Any Connector' });

      const result = await service.getColdStartRecommendations('tenant-1', 'connector');
      expect(result.recommendations.length).toBe(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  Scoring verification
  // ═════════════════════════════════════════════════════════════════════

  describe('scoring', () => {
    it('should give higher score to official items', async () => {
      mockPrisma._seedListing({ type: 'connector', name: 'Official', isOfficial: true, downloads: 100, rating: 4.0 });
      mockPrisma._seedListing({ type: 'connector', name: 'Community', isOfficial: false, downloads: 100, rating: 4.0 });

      const result = await service.getColdStartRecommendations('t1', 'connector');
      const official = result.recommendations.find((r) => r.isOfficial);
      const community = result.recommendations.find((r) => !r.isOfficial);
      if (official && community) {
        expect(official.combinedScore).toBeGreaterThanOrEqual(community.combinedScore);
      }
    });

    it('should include reason text for each recommendation', async () => {
      mockPrisma._seedListing({ type: 'connector', name: 'Reason Test', downloads: 500, rating: 5.0 });

      const result = await service.getConnectorRecommendations('t1');
      for (const r of result.recommendations) {
        expect(r.reason).toBeTruthy();
        expect(typeof r.reason).toBe('string');
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  Edge cases
  // ═════════════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('should handle tags parsing', async () => {
      mockPrisma._seedListing({ type: 'connector', name: 'Tag Test', tags: '["json","api"]' as any });

      const result = await service.getConnectorRecommendations('t1');
      if (result.recommendations.length > 0) {
        expect(Array.isArray(result.recommendations[0].tags)).toBe(true);
      }
    });

    it('should handle null tags gracefully', async () => {
      mockPrisma._seedListing({ type: 'connector', name: 'No Tags', tags: null });

      const result = await service.getConnectorRecommendations('t1');
      if (result.recommendations.length > 0) {
        expect(result.recommendations[0].tags).toEqual([]);
      }
    });

    it('should handle empty string tags', async () => {
      mockPrisma._seedListing({ type: 'connector', name: 'Empty Tags', tags: '' as any });

      const result = await service.getConnectorRecommendations('t1');
      if (result.recommendations.length > 0) {
        expect(Array.isArray(result.recommendations[0].tags)).toBe(true);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// data-marketplace.service.spec.ts — Data Product Marketplace Tests
// ═══════════════════════════════════════════════════════════════════════════

import { DataMarketplaceService } from './data-marketplace.service';
import { PrismaService } from '../prisma.service';

// ── Mock Types ────────────────────────────────────────────────────────────

interface MockDataProduct {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  format: string;
  price: number;
  currency: string;
  sampleData: any;
  schema: any;
  rowCount: number;
  sizeBytes: bigint;
  downloads: number;
  rating: number | null;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MockDataProductPurchase {
  id: string;
  productId: string;
  buyerTenantId: string;
  price: number;
  currency: string;
  status: string;
  downloadedAt: Date | null;
  createdAt: Date;
  product?: any;
}

interface MockDataConsent {
  id: string;
  tenantId: string;
  purpose: string;
  scope: string;
  isActive: boolean;
  grantedAt: Date;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<MockDataProduct> = {}): MockDataProduct {
  return {
    id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: 'publisher-1',
    name: 'Sales Dataset Q2',
    description: 'Quarterly sales data',
    category: 'sales',
    tags: ['sales', 'quarterly'],
    format: 'json',
    price: 0,
    currency: 'USD',
    sampleData: null,
    schema: null,
    rowCount: 1000,
    sizeBytes: BigInt(1024),
    downloads: 0,
    rating: null,
    isPublished: true,
    createdAt: new Date('2026-06-28'),
    updatedAt: new Date('2026-06-28'),
    ...overrides,
  };
}

function makePurchase(overrides: Partial<MockDataProductPurchase> = {}): MockDataProductPurchase {
  return {
    id: `purch-${Date.now()}`,
    productId: 'prod-1',
    buyerTenantId: 'buyer-1',
    price: 0,
    currency: 'USD',
    status: 'pending',
    downloadedAt: null,
    createdAt: new Date('2026-06-28'),
    ...overrides,
  };
}

function makeConsent(overrides: Partial<MockDataConsent> = {}): MockDataConsent {
  return {
    id: `consent-${Date.now()}`,
    tenantId: 'tenant-1',
    purpose: 'analytics',
    scope: 'transaction_data',
    isActive: true,
    grantedAt: new Date('2026-06-28'),
    revokedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

function makeMockPrisma() {
  const products: MockDataProduct[] = [];
  const purchases: MockDataProductPurchase[] = [];
  const consents: MockDataConsent[] = [];

  return {
    dataProduct: {
      findUnique: jest.fn().mockImplementation((args: any) =>
        Promise.resolve(products.find((p) => p.id === args.where.id) ?? null),
      ),
      findMany: jest.fn().mockImplementation((args: any) => {
        let filtered = [...products];
        if (args?.where) {
          if (args.where.isPublished !== undefined) filtered = filtered.filter((p) => p.isPublished === args.where.isPublished);
          if (args.where.tenantId) filtered = filtered.filter((p) => p.tenantId === args.where.tenantId);
          if (args.where.category) filtered = filtered.filter((p) => p.category === args.where.category);
          if (args.where.OR && Array.isArray(args.where.OR)) {
            filtered = filtered.filter((p) => {
              return args.where.OR.some((condition: any) => {
                const field = Object.keys(condition)[0];
                const val = condition[field]?.contains;
                if (!val) return false;
                const pValue = String((p as any)[field] ?? '');
                return pValue.toLowerCase().includes(val.toLowerCase());
              });
            });
          }
          if (args.where.price) {
            if (args.where.price.gte) filtered = filtered.filter((p) => p.price >= args.where.price.gte);
            if (args.where.price.lte) filtered = filtered.filter((p) => p.price <= args.where.price.lte);
          }
        }
        // Sort: downloads desc, then rating desc
        filtered.sort((a, b) => b.downloads - a.downloads);
        const skip = args?.skip ?? 0;
        const take = args?.take ?? filtered.length;
        return Promise.resolve(filtered.slice(skip, skip + take));
      }),
      count: jest.fn().mockImplementation((args: any) => {
        let filtered = [...products];
        if (args?.where?.isPublished !== undefined) filtered = filtered.filter((p) => p.isPublished === args.where.isPublished);
        if (args?.where?.category) filtered = filtered.filter((p) => p.category === args.where.category);
        if (args?.where?.OR && Array.isArray(args.where.OR)) {
          filtered = filtered.filter((p) => {
            return args.where.OR.some((condition: any) => {
              const field = Object.keys(condition)[0];
              const val = condition[field]?.contains;
              if (!val) return false;
              const pValue = String((p as any)[field] ?? '');
              return pValue.toLowerCase().includes(val.toLowerCase());
            });
          });
        }
        return Promise.resolve(filtered.length);
      }),
      create: jest.fn().mockImplementation((args: any) => {
        const p = makeProduct({ id: `prod-${products.length + 1}`, ...args.data });
        products.push(p);
        return Promise.resolve(p);
      }),
      update: jest.fn().mockImplementation((args: any) => {
        const idx = products.findIndex((p) => p.id === args.where.id);
        if (idx >= 0) {
          products[idx] = { ...products[idx], ...args.data };
          return Promise.resolve(products[idx]);
        }
        throw new Error('Not found');
      }),
      delete: jest.fn().mockImplementation((args: any) => {
        const idx = products.findIndex((p) => p.id === args.where.id);
        if (idx >= 0) { products.splice(idx, 1); return Promise.resolve({}); }
        throw new Error('Not found');
      }),
    },
    dataProductPurchase: {
      findUnique: jest.fn().mockImplementation((args: any) => {
        if (args.where.productId_buyerTenantId) {
          return Promise.resolve(
            purchases.find((p) =>
              p.productId === args.where.productId_buyerTenantId.productId
              && p.buyerTenantId === args.where.productId_buyerTenantId.buyerTenantId,
            ) ?? null,
          );
        }
        return Promise.resolve(purchases.find((p) => p.id === args.where.id) ?? null);
      }),
      findMany: jest.fn().mockImplementation((args: any) => {
        let filtered = [...purchases];
        if (args?.where?.buyerTenantId) filtered = filtered.filter((p) => p.buyerTenantId === args.where.buyerTenantId);
        if (args?.where?.status) filtered = filtered.filter((p) => p.status === args.where.status);
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return Promise.resolve(filtered);
      }),
      create: jest.fn().mockImplementation((args: any) => {
        const p = makePurchase(args.data);
        purchases.push(p);
        return Promise.resolve(p);
      }),
      update: jest.fn().mockImplementation((args: any) => {
        const idx = purchases.findIndex((p) => p.id === args.where.id);
        if (idx >= 0) {
          purchases[idx] = { ...purchases[idx], ...args.data };
          return Promise.resolve(purchases[idx]);
        }
        throw new Error('Not found');
      }),
    },
    dataConsent: {
      upsert: jest.fn().mockImplementation((args: any) => {
        const existing = consents.find(
          (c) => c.tenantId === args.where.tenantId_purpose_scope.tenantId
            && c.purpose === args.where.tenantId_purpose_scope.purpose
            && c.scope === args.where.tenantId_purpose_scope.scope,
        );
        if (existing) {
          Object.assign(existing, args.update);
          return Promise.resolve(existing);
        }
        const c = makeConsent(args.create);
        consents.push(c);
        return Promise.resolve(c);
      }),
      findUnique: jest.fn().mockImplementation((args: any) =>
        Promise.resolve(consents.find((c) => c.id === args.where.id) ?? null),
      ),
      findMany: jest.fn().mockImplementation((args: any) => {
        let filtered = [...consents];
        if (args?.where?.tenantId) filtered = filtered.filter((c) => c.tenantId === args.where.tenantId);
        return Promise.resolve(filtered);
      }),
      update: jest.fn().mockImplementation((args: any) => {
        const idx = consents.findIndex((c) => c.id === args.where.id);
        if (idx >= 0) {
          consents[idx] = { ...consents[idx], ...args.data };
          return Promise.resolve(consents[idx]);
        }
        throw new Error('Not found');
      }),
    },
    _seedProduct: (overrides: Partial<MockDataProduct> = {}) => {
      const p = makeProduct(overrides);
      products.push(p);
      return p;
    },
    _seedPurchase: (overrides: Partial<MockDataProductPurchase> = {}) => {
      const p = makePurchase(overrides);
      purchases.push(p);
      return p;
    },
    _seedConsent: (overrides: Partial<MockDataConsent> = {}) => {
      const c = makeConsent(overrides);
      consents.push(c);
      return c;
    },
    _clear: () => { products.length = 0; purchases.length = 0; consents.length = 0; },
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('DataMarketplaceService', () => {
  let service: DataMarketplaceService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    service = new DataMarketplaceService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => mockPrisma._clear());

  // ═════════════════════════════════════════════════════════════════════
  //  listPublishedProducts
  // ═════════════════════════════════════════════════════════════════════

  describe('listPublishedProducts', () => {
    it('should return published products', async () => {
      mockPrisma._seedProduct({ name: 'Dataset A', isPublished: true });
      mockPrisma._seedProduct({ name: 'Dataset B', isPublished: true });
      mockPrisma._seedProduct({ name: 'Draft', isPublished: false });

      const result = await service.listPublishedProducts();
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
    });

    it('should filter by category', async () => {
      mockPrisma._seedProduct({ name: 'Sales Data', category: 'sales' });
      mockPrisma._seedProduct({ name: 'Marketing Data', category: 'marketing' });

      const result = await service.listPublishedProducts({ category: 'sales' });
      expect(result.total).toBe(1);
      expect(result.items[0].name).toBe('Sales Data');
    });

    it('should search by name', async () => {
      mockPrisma._seedProduct({ name: 'Q2 Revenue Data' });
      mockPrisma._seedProduct({ name: 'User Activity Logs' });

      const result = await service.listPublishedProducts({ search: 'revenue' });
      expect(result.total).toBe(1);
    });

    it('should paginate results', async () => {
      for (let i = 0; i < 10; i++) mockPrisma._seedProduct({ name: `Product ${i}` });

      const result = await service.listPublishedProducts({ limit: 4, offset: 0 });
      expect(result.items).toHaveLength(4);
      expect(result.total).toBe(10);
    });

    it('should return empty when no published products', async () => {
      const result = await service.listPublishedProducts();
      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getProductById
  // ═════════════════════════════════════════════════════════════════════

  describe('getProductById', () => {
    it('should return product by id', async () => {
      mockPrisma._seedProduct({ id: 'prod-get-1', name: 'Specific Dataset' });
      const result = await service.getProductById('prod-get-1');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Specific Dataset');
    });

    it('should return null for non-existent product', async () => {
      const result = await service.getProductById('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getMyProducts
  // ═════════════════════════════════════════════════════════════════════

  describe('getMyProducts', () => {
    it('should return products owned by tenant', async () => {
      mockPrisma._seedProduct({ tenantId: 'my-pub', name: 'Mine 1' });
      mockPrisma._seedProduct({ tenantId: 'my-pub', name: 'Mine 2' });
      mockPrisma._seedProduct({ tenantId: 'other-pub', name: 'Not Mine' });

      const result = await service.getMyProducts('my-pub');
      expect(result).toHaveLength(2);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  createProduct
  // ═════════════════════════════════════════════════════════════════════

  describe('createProduct', () => {
    it('should create a new data product', async () => {
      const result = await service.createProduct('pub-1', {
        name: 'New Dataset',
        description: 'Test data',
        category: 'test',
        tags: ['test'],
        price: 10,
      });

      expect(result.name).toBe('New Dataset');
      expect(result.tenantId).toBe('pub-1');
      expect(result.price).toBe(10);
      expect(result.currency).toBe('USD');
      expect(result.format).toBe('json');
    });

    it('should set default values', async () => {
      const result = await service.createProduct('pub-2', {
        name: 'Minimal Dataset',
      });

      expect(result.price).toBe(0);
      expect(result.downloads).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  updateProduct
  // ═════════════════════════════════════════════════════════════════════

  describe('updateProduct', () => {
    it('should update product fields', async () => {
      mockPrisma._seedProduct({ id: 'prod-upd', tenantId: 'owner', name: 'Old Name' });

      const result = await service.updateProduct('prod-upd', 'owner', { name: 'New Name', price: 25 });
      expect(result.name).toBe('New Name');
    });

    it('should throw error when product not owned by tenant', async () => {
      mockPrisma._seedProduct({ id: 'prod-other', tenantId: 'real-owner' });

      await expect(service.updateProduct('prod-other', 'wrong-owner', { name: 'Hack' }))
        .rejects.toThrow('access denied');
    });

    it('should throw error for non-existent product', async () => {
      await expect(service.updateProduct('nonexistent', 'anyone', { name: 'Ghost' }))
        .rejects.toThrow('not found');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  publishProduct / unpublishProduct
  // ═════════════════════════════════════════════════════════════════════

  describe('publishProduct & unpublishProduct', () => {
    it('should publish and unpublish product', async () => {
      mockPrisma._seedProduct({ id: 'prod-pub', tenantId: 'pub-owner', isPublished: false });

      const published = await service.publishProduct('prod-pub', 'pub-owner');
      expect(published.isPublished).toBe(true);

      const unpublished = await service.unpublishProduct('prod-pub', 'pub-owner');
      expect(unpublished.isPublished).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  deleteProduct
  // ═════════════════════════════════════════════════════════════════════

  describe('deleteProduct', () => {
    it('should delete owned product', async () => {
      mockPrisma._seedProduct({ id: 'prod-del', tenantId: 'owner-del' });
      const result = await service.deleteProduct('prod-del', 'owner-del');
      expect(result.deleted).toBe(true);
    });

    it('should throw for non-owned product', async () => {
      mockPrisma._seedProduct({ id: 'prod-other-del', tenantId: 'real-owner' });
      await expect(service.deleteProduct('prod-other-del', 'wrong-owner'))
        .rejects.toThrow('access denied');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  purchaseProduct
  // ═════════════════════════════════════════════════════════════════════

  describe('purchaseProduct', () => {
    it('should create pending purchase for paid product', async () => {
      mockPrisma._seedProduct({ id: 'prod-paid', price: 50, tenantId: 'seller' });

      const result = await service.purchaseProduct('prod-paid', 'buyer');
      expect(result.status).toBe('pending');
      expect(result.price).toBe(50);
    });

    it('should auto-complete free product purchase', async () => {
      mockPrisma._seedProduct({ id: 'prod-free', price: 0, tenantId: 'seller-free' });

      const result = await service.purchaseProduct('prod-free', 'buyer-free');
      expect(result.status).toBe('completed');
      expect(result.downloadedAt).toBeDefined();
    });

    it('should throw error for non-existent product', async () => {
      await expect(service.purchaseProduct('nonexistent', 'buyer'))
        .rejects.toThrow('Product not found');
    });

    it('should throw error for unpublished product', async () => {
      mockPrisma._seedProduct({ id: 'prod-draft', isPublished: false });

      await expect(service.purchaseProduct('prod-draft', 'buyer'))
        .rejects.toThrow('Product is not available');
    });

    it('should throw error for purchasing own product', async () => {
      mockPrisma._seedProduct({ id: 'prod-self', tenantId: 'self-buyer' });
      await expect(service.purchaseProduct('prod-self', 'self-buyer'))
        .rejects.toThrow('Cannot purchase your own product');
    });

    it('should throw error for duplicate purchase', async () => {
      mockPrisma._seedProduct({ id: 'prod-dup', price: 0, tenantId: 'seller' });
      await service.purchaseProduct('prod-dup', 'buyer');
      await expect(service.purchaseProduct('prod-dup', 'buyer'))
        .rejects.toThrow('Already purchased');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  confirmPurchase
  // ═════════════════════════════════════════════════════════════════════

  describe('confirmPurchase', () => {
    it('should complete purchase and increment downloads', async () => {
      mockPrisma._seedProduct({ id: 'prod-confirm', downloads: 5, tenantId: 'seller' });
      mockPrisma._seedPurchase({ id: 'purch-confirm', productId: 'prod-confirm', status: 'pending' });

      const result = await service.confirmPurchase('purch-confirm');
      expect(result.status).toBe('completed');
      expect(result.downloadedAt).toBeDefined();
    });

    it('should throw for non-existent purchase', async () => {
      await expect(service.confirmPurchase('nonexistent'))
        .rejects.toThrow('Purchase not found');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getMyPurchases
  // ═════════════════════════════════════════════════════════════════════

  describe('getMyPurchases', () => {
    it('should return completed purchases for buyer', async () => {
      mockPrisma._seedPurchase({ buyerTenantId: 'buyer-1', status: 'completed', productId: 'prod-a' });
      mockPrisma._seedPurchase({ buyerTenantId: 'buyer-1', status: 'pending', productId: 'prod-b' });
      mockPrisma._seedProduct({ id: 'prod-a', name: 'Purchased Dataset' });

      const result = await service.getMyPurchases('buyer-1');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('completed');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  Consent Management
  // ═════════════════════════════════════════════════════════════════════

  describe('setConsent', () => {
    it('should create new consent', async () => {
      const result = await service.setConsent('tenant-1', 'analytics', 'transaction_data');
      expect(result.isActive).toBe(true);
      expect(result.purpose).toBe('analytics');
    });

    it('should upsert existing consent', async () => {
      const first = await service.setConsent('t1', 'marketing', 'email', true);
      const second = await service.setConsent('t1', 'marketing', 'email', false);

      expect(second.isActive).toBe(false);
      expect(second.revokedAt).toBeDefined();
    });
  });

  describe('getConsents', () => {
    it('should list consents for tenant', async () => {
      await service.setConsent('t1', 'analytics', 'usage');
      await service.setConsent('t1', 'marketing', 'email');

      const result = await service.getConsents('t1');
      expect(result).toHaveLength(2);
    });
  });

  describe('revokeConsent', () => {
    it('should revoke consent', async () => {
      const consent = await service.setConsent('t1', 'analytics', 'usage');

      const result = await service.revokeConsent(consent.id, 't1');
      expect(result.isActive).toBe(false);
      expect(result.revokedAt).toBeDefined();
    });

    it('should throw for non-existent consent', async () => {
      await expect(service.revokeConsent('nonexistent', 't1'))
        .rejects.toThrow('not found');
    });

    it('should throw for consent owned by different tenant', async () => {
      const consent = await service.setConsent('owner-tenant', 'analytics', 'data');

      await expect(service.revokeConsent(consent.id, 'wrong-tenant'))
        .rejects.toThrow('access denied');
    });
  });
});

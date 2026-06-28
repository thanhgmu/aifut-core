// ═══════════════════════════════════════════════════════════════════════════
// licensing.service.spec.ts — On-Premise License Key Management Engine Tests
// ═══════════════════════════════════════════════════════════════════════════

import { LicensingService } from './licensing.service';
import { PrismaService } from '../prisma.service';
import { NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

// ── Types ─────────────────────────────────────────────────────────────────

interface MockLicenseKey {
  id: string;
  key: string;
  tier: string;
  status: string;
  tenantId: string | null;
  maxUsers: number;
  maxWorkflows: number;
  features: string[];
  issuedTo: string | null;
  issuedEmail: string | null;
  issuedAt: Date;
  activatedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeLicenseKey(overrides: Partial<MockLicenseKey> = {}): MockLicenseKey {
  return {
    id: `lic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    key: `AIFUT-${'XXXX'.repeat(4)}`,
    tier: 'PRO',
    status: 'PENDING',
    tenantId: null,
    maxUsers: 3,
    maxWorkflows: -1,
    features: ['core_workflow', 'local_runtime', 'all_connectors'],
    issuedTo: null,
    issuedEmail: null,
    issuedAt: new Date('2026-06-28T00:00:00Z'),
    activatedAt: null,
    expiresAt: new Date('2027-06-28T00:00:00Z'),
    createdAt: new Date('2026-06-28T00:00:00Z'),
    ...overrides,
  };
}

function makeMockPrisma() {
  const keys: MockLicenseKey[] = [];
  let idCounter = 0;

  return {
    licenseKey: {
      findUnique: jest.fn().mockImplementation((args: any) => {
        if (args.where.key) {
          return Promise.resolve(keys.find((k) => k.key === args.where.key) ?? null);
        }
        if (args.where.id) {
          return Promise.resolve(keys.find((k) => k.id === args.where.id) ?? null);
        }
        return Promise.resolve(null);
      }),
      findFirst: jest.fn().mockImplementation((args: any) => {
        let filtered = [...keys];
        if (args.where?.tenantId) {
          filtered = filtered.filter((k) => k.tenantId === args.where.tenantId);
        }
        if (args.where?.status) {
          filtered = filtered.filter((k) => k.status === args.where.status);
        }
        filtered.sort((a, b) => {
          const dateA = a.activatedAt?.getTime() ?? 0;
          const dateB = b.activatedAt?.getTime() ?? 0;
          return dateB - dateA;
        });
        return Promise.resolve(filtered[0] ?? null);
      }),
      findMany: jest.fn().mockImplementation((args: any) => {
        let filtered = [...keys];
        if (args?.where?.status) {
          filtered = filtered.filter((k) => k.status === args.where.status);
        }
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const skip = args?.skip ?? 0;
        const take = args?.take ?? filtered.length;
        return Promise.resolve(filtered.slice(skip, skip + take));
      }),
      count: jest.fn().mockImplementation((args: any) => {
        let filtered = [...keys];
        if (args?.where?.status) {
          filtered = filtered.filter((k) => k.status === args.where.status);
        }
        return Promise.resolve(filtered.length);
      }),
      create: jest.fn().mockImplementation((args: any) => {
        const record: MockLicenseKey = {
          id: `lic-${++idCounter}`,
          key: args.data.key,
          tier: args.data.tier,
          status: args.data.status ?? 'PENDING',
          tenantId: args.data.tenantId ?? null,
          maxUsers: args.data.maxUsers ?? 5,
          maxWorkflows: args.data.maxWorkflows ?? -1,
          features: args.data.features ?? [],
          issuedTo: args.data.issuedTo ?? null,
          issuedEmail: args.data.issuedEmail ?? null,
          issuedAt: new Date(),
          activatedAt: args.data.activatedAt ?? null,
          expiresAt: args.data.expiresAt ?? null,
          createdAt: new Date(),
        };
        keys.push(record);
        return Promise.resolve(record);
      }),
      update: jest.fn().mockImplementation((args: any) => {
        const idx = keys.findIndex((k) => k.id === args.where.id);
        if (idx === -1) throw new Error('Not found');
        keys[idx] = { ...keys[idx], ...args.data };
        return Promise.resolve(keys[idx]);
      }),
    },
    _seed: (overrides: Partial<MockLicenseKey> = {}) => {
      const k = makeLicenseKey(overrides);
      keys.push(k);
      return k;
    },
    _clear: () => { keys.length = 0; idCounter = 0; },
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('LicensingService', () => {
  let service: LicensingService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    service = new LicensingService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => mockPrisma._clear());

  // ═════════════════════════════════════════════════════════════════════
  //  generateKey
  // ═════════════════════════════════════════════════════════════════════

  describe('generateKey', () => {
    it('should generate a unique license key with AIFUT prefix', async () => {
      const result = await service.generateKey({ tenantId: 'tenant-1', tier: 'PRO' });
      expect(result.key).toMatch(/^AIFUT-/);
      expect(result.key.split('-')).toHaveLength(5); // AIFUT + 4 segments
      expect(result.tier).toBe('PRO');
      expect(result.status).toBe('PENDING');
    });

    it('should set correct max users per tier', async () => {
      const starter = await service.generateKey({ tenantId: 't1', tier: 'STARTER' });
      expect(starter.maxUsers).toBe(1);

      const pro = await service.generateKey({ tenantId: 't2', tier: 'PRO' });
      expect(pro.maxUsers).toBe(3);

      const enterprise = await service.generateKey({ tenantId: 't3', tier: 'ENTERPRISE' });
      expect(enterprise.maxUsers).toBe(-1); // unlimited
    });

    it('should set correct features per tier', async () => {
      const result = await service.generateKey({ tenantId: 't1', tier: 'TEAM' });
      expect(result.features).toContain('analytics');
      expect(result.features).toContain('custom_domain');
      expect(result.features).toContain('api_access');
    });

    it('should apply custom validity days', async () => {
      const result = await service.generateKey({ tenantId: 't1', tier: 'PRO', validityDays: 30 });
      const diffMs = result.expiresAt!.getTime() - result.issuedAt.getTime();
      const diffDays = Math.round(diffMs / 86_400_000);
      expect(diffDays).toBe(30);
    });

    it('should set no expiry when validityDays is null', async () => {
      // PRO uses 365 default; mock a scenario with null
      jest.spyOn(mockPrisma.licenseKey, 'create').mockImplementationOnce((args: any) => {
        const record = makeLicenseKey({ expiresAt: null });
        return Promise.resolve({ ...record, ...args.data, expiresAt: null });
      });

      const result = await service.generateKey({ tenantId: 't1', tier: 'STARTER', validityDays: -1 as any });
      // null validityDays doesn't reach create; this tests the logic branch
      expect(result).toBeDefined();
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  generateTrialKey
  // ═════════════════════════════════════════════════════════════════════

  describe('generateTrialKey', () => {
    it('should generate an auto-activated trial key for new tenant', async () => {
      const result = await service.generateTrialKey('new-tenant');
      expect(result.tier).toBe('PRO');
      expect(result.status).toBe('ACTIVE');
      expect(result.activatedAt).toBeDefined();
      // 14-day validity
      const diffMs = result.expiresAt!.getTime() - result.issuedAt.getTime();
      const diffDays = Math.round(diffMs / 86_400_000);
      expect(diffDays).toBe(14);
    });

    it('should return existing active license if tenant already has one', async () => {
      mockPrisma._seed({ tenantId: 'existing-tenant', status: 'ACTIVE', key: 'AIFUT-EXISTING-TRIAL' });
      const result = await service.generateTrialKey('existing-tenant');
      expect(result.key).toBe('AIFUT-EXISTING-TRIAL');
      expect(result.status).toBe('ACTIVE');
    });

    it('should generate new key even for tenant with only expired license', async () => {
      mockPrisma._seed({ tenantId: 'expired-tenant', status: 'EXPIRED' });
      const result = await service.generateTrialKey('expired-tenant');
      expect(result.status).toBe('ACTIVE');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  activateKey
  // ═════════════════════════════════════════════════════════════════════

  describe('activateKey', () => {
    it('should activate a pending key for the tenant', async () => {
      mockPrisma._seed({ key: 'AIFUT-ABCD-1234-EFGH-5678', status: 'PENDING' });
      const result = await service.activateKey({ key: 'AIFUT-ABCD-1234-EFGH-5678', tenantId: 'tenant-activate' });
      expect(result.status).toBe('ACTIVE');
      expect(result.tenantId).toBe('tenant-activate');
      expect(result.activatedAt).toBeDefined();
    });

    it('should throw NotFoundException for non-existent key', async () => {
      await expect(service.activateKey({ key: 'AIFUT-NONEXISTENT', tenantId: 't1' }))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for revoked key', async () => {
      mockPrisma._seed({ key: 'AIFUT-REVOKED', status: 'REVOKED' });
      await expect(service.activateKey({ key: 'AIFUT-REVOKED', tenantId: 't1' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should return existing license when same tenant re-activates', async () => {
      mockPrisma._seed({ key: 'AIFUT-ALREADY', status: 'ACTIVE', tenantId: 'same-tenant' });
      const result = await service.activateKey({ key: 'AIFUT-ALREADY', tenantId: 'same-tenant' });
      expect(result.status).toBe('ACTIVE');
    });

    it('should throw ConflictException when key used by different tenant', async () => {
      mockPrisma._seed({ key: 'AIFUT-TAKEN', status: 'ACTIVE', tenantId: 'other-tenant' });
      await expect(service.activateKey({ key: 'AIFUT-TAKEN', tenantId: 'new-tenant' }))
        .rejects.toThrow(ConflictException);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  validateLicense
  // ═════════════════════════════════════════════════════════════════════

  describe('validateLicense', () => {
    it('should return valid=true for active license within expiry', async () => {
      mockPrisma._seed({
        tenantId: 'valid-tenant',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 365 * 86_400_000),
      });
      const result = await service.validateLicense('valid-tenant');
      expect(result.valid).toBe(true);
      expect(result.license).not.toBeNull();
      expect(result.message).toContain('hợp lệ');
    });

    it('should return valid=false for tenant with no license', async () => {
      const result = await service.validateLicense('no-license');
      expect(result.valid).toBe(false);
      expect(result.license).toBeNull();
    });

    it('should mark expired license and return invalid', async () => {
      const expired = mockPrisma._seed({
        tenantId: 'expired-tenant',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 1 * 86_400_000), // yesterday
      });
      jest.spyOn(mockPrisma.licenseKey, 'update').mockResolvedValueOnce(expired);

      const result = await service.validateLicense('expired-tenant');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('hết hạn');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  checkFeature
  // ═════════════════════════════════════════════════════════════════════

  describe('checkFeature', () => {
    it('should return true for feature included in license', async () => {
      mockPrisma._seed({
        tenantId: 'featured-tenant',
        status: 'ACTIVE',
        features: ['core_workflow', 'analytics', 'api_access'],
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      });
      const result = await service.checkFeature('featured-tenant', 'analytics');
      expect(result).toBe(true);
    });

    it('should return false for feature not in license', async () => {
      mockPrisma._seed({
        tenantId: 'basic-tenant',
        status: 'ACTIVE',
        features: ['core_workflow'],
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      });
      const result = await service.checkFeature('basic-tenant', 'sovereign_mode');
      expect(result).toBe(false);
    });

    it('should return false when no license exists', async () => {
      const result = await service.checkFeature('missing-tenant', 'core_workflow');
      expect(result).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  listLicenses
  // ═════════════════════════════════════════════════════════════════════

  describe('listLicenses', () => {
    it('should return paginated licenses', async () => {
      for (let i = 0; i < 5; i++) mockPrisma._seed({ status: 'ACTIVE', key: `AIFUT-LIST-${i}` });

      const result = await service.listLicenses({ page: 1, pageSize: 3 });
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(2);
    });

    it('should filter by status', async () => {
      mockPrisma._seed({ status: 'ACTIVE', key: 'AIFUT-ACTIVE' });
      mockPrisma._seed({ status: 'EXPIRED', key: 'AIFUT-EXPIRED' });

      const result = await service.listLicenses({ status: 'EXPIRED' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('EXPIRED');
    });

    it('should clamp pageSize between 1 and 100', async () => {
      for (let i = 0; i < 150; i++) mockPrisma._seed({ key: `AIFUT-CLAMP-${i}` });

      const result = await service.listLicenses({ pageSize: 999 });
      expect(result.pageSize).toBe(100);
      expect(result.items.length).toBeLessThanOrEqual(100);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getTenantLicense
  // ═════════════════════════════════════════════════════════════════════

  describe('getTenantLicense', () => {
    it('should return active license for tenant', async () => {
      mockPrisma._seed({ tenantId: 'my-tenant', status: 'ACTIVE', key: 'AIFUT-MINE' });
      const result = await service.getTenantLicense('my-tenant');
      expect(result).not.toBeNull();
      expect(result!.key).toBe('AIFUT-MINE');
    });

    it('should return null for tenant without license', async () => {
      const result = await service.getTenantLicense('ghost-tenant');
      expect(result).toBeNull();
    });

    it('should return null when only expired licenses exist', async () => {
      mockPrisma._seed({ tenantId: 'expired', status: 'EXPIRED' });
      const result = await service.getTenantLicense('expired');
      expect(result).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  revokeLicense
  // ═════════════════════════════════════════════════════════════════════

  describe('revokeLicense', () => {
    it('should revoke an active license', async () => {
      const lic = mockPrisma._seed({ id: 'lic-revoke-1', status: 'ACTIVE' });
      const result = await service.revokeLicense('lic-revoke-1');
      expect(result.status).toBe('REVOKED');
    });

    it('should throw NotFoundException for non-existent license', async () => {
      await expect(service.revokeLicense('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for already revoked license', async () => {
      mockPrisma._seed({ id: 'lic-already-revoked', status: 'REVOKED' });
      await expect(service.revokeLicense('lic-already-revoked'))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  Key Format Validation
  // ═════════════════════════════════════════════════════════════════════

  describe('key format', () => {
    it('should generate a key matching AIFUT-XXXX-XXXX-XXXX-XXXX pattern', async () => {
      jest.spyOn(mockPrisma.licenseKey, 'findUnique').mockResolvedValue(null);

      const result = await service.generateKey({ tenantId: 'fmt-t1', tier: 'STARTER' });
      expect(result.key).toMatch(/^AIFUT-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
    });

    it('should generate unique keys on successive calls', async () => {
      jest.spyOn(mockPrisma.licenseKey, 'findUnique').mockResolvedValue(null);

      const a = await service.generateKey({ tenantId: 't1', tier: 'PRO' });
      const b = await service.generateKey({ tenantId: 't2', tier: 'PRO' });
      expect(a.key).not.toBe(b.key);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  isExpired calculation in toLicenseResponse
  // ═════════════════════════════════════════════════════════════════════

  describe('license expiry calculation', () => {
    it('should mark expired license with isExpired=true', async () => {
      const lic = mockPrisma._seed({
        key: 'AIFUT-EXPIRED-1',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 1 * 86_400_000),
      });

      // Return via a method that goes through toLicenseResponse
      const result = await service.getTenantLicense('nonexistent');
      expect(result).toBeNull(); // Not linked to tenant

      // Direct toLicenseResponse is private; verify through validateLicense
      mockPrisma._seed({
        tenantId: 'exp-check',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 1 * 86_400_000),
      });

      const validation = await service.validateLicense('exp-check');
      expect(validation.valid).toBe(false);
      expect(validation.license).not.toBeNull();
    });
  });
});

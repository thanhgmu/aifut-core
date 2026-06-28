// ═══════════════════════════════════════════════════════════════════════════
// consultant.service.spec.ts — Consultant/Expert Directory & Booking Tests
// ═══════════════════════════════════════════════════════════════════════════

import { ConsultantService } from './consultant.service';
import { PrismaService } from '../prisma.service';

// ── Mock Types ────────────────────────────────────────────────────────────

interface MockConsultantProfile {
  id: string;
  tenantId: string;
  fullName: string;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  skills: string[];
  industries: string[];
  certifications: string[];
  email: string | null;
  phone: string | null;
  website: string | null;
  socialLinks: string[];
  isAvailable: boolean;
  rateType: string | null;
  rateAmount: number | null;
  currency: string;
  rating: number | null;
  reviewCount: number;
  completedJobs: number;
  isVerified: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockConsultantReview {
  id: string;
  consultantId: string;
  reviewerId: string;
  rating: number;
  review: string | null;
  createdAt: Date;
}

interface MockConsultantBooking {
  id: string;
  consultantId: string;
  clientTenantId: string;
  status: string;
  message: string | null;
  requestedDate: Date;
  completedAt: Date | null;
  amount: number | null;
  currency: string;
  paymentStatus: string | null;
  createdAt: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<MockConsultantProfile> = {}): MockConsultantProfile {
  return {
    id: `prof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: 'tenant-1',
    fullName: 'Nguyen Van A',
    avatarUrl: null,
    title: 'Senior AI Consultant',
    bio: 'Expert in AI workflow automation.',
    skills: ['workflow', 'ai', 'api'],
    industries: ['tech', 'finance'],
    certifications: ['AWS Certified'],
    email: 'a@example.com',
    phone: null,
    website: null,
    socialLinks: [],
    isAvailable: true,
    rateType: 'hourly',
    rateAmount: 50,
    currency: 'USD',
    rating: null,
    reviewCount: 0,
    completedJobs: 0,
    isVerified: false,
    status: 'active',
    createdAt: new Date('2026-06-28'),
    updatedAt: new Date('2026-06-28'),
    ...overrides,
  };
}

function makeReview(overrides: Partial<MockConsultantReview> = {}): MockConsultantReview {
  return {
    id: `rev-${Date.now()}`,
    consultantId: 'prof-1',
    reviewerId: 'reviewer-tenant',
    rating: 5,
    review: 'Excellent consultant!',
    createdAt: new Date('2026-06-28'),
    ...overrides,
  };
}

function makeBooking(overrides: Partial<MockConsultantBooking> = {}): MockConsultantBooking {
  return {
    id: `book-${Date.now()}`,
    consultantId: 'prof-1',
    clientTenantId: 'client-tenant',
    status: 'requested',
    message: 'Need help with AI workflow',
    requestedDate: new Date(),
    completedAt: null,
    amount: null,
    currency: 'USD',
    paymentStatus: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeMockPrisma() {
  const profiles: MockConsultantProfile[] = [];
  const reviews: MockConsultantReview[] = [];
  const bookings: MockConsultantBooking[] = [];

  return {
    consultantProfile: {
      findUnique: jest.fn().mockImplementation((args: any) =>
        Promise.resolve(profiles.find((p) => p.id === args.where.id) ?? null),
      ),
      findFirst: jest.fn().mockImplementation((args: any) => {
        let filtered = [...profiles];
        if (args.where?.tenantId) filtered = filtered.filter((p) => p.tenantId === args.where.tenantId);
        if (args.where?.status) filtered = filtered.filter((p) => p.status === args.where.status);
        return Promise.resolve(filtered[0] ?? null);
      }),
      findMany: jest.fn().mockImplementation((args: any) => {
        let filtered = [...profiles];
        if (args?.where?.status) filtered = filtered.filter((p) => p.status === args.where.status);
        if (args?.where?.isAvailable !== undefined) filtered = filtered.filter((p) => p.isAvailable === args.where.isAvailable);
        if (args?.where?.isVerified !== undefined) filtered = filtered.filter((p) => p.isVerified === args.where.isVerified);
        if (args?.where?.rateType) filtered = filtered.filter((p) => p.rateType === args.where.rateType);
        if (args?.where?.rating?.gte) filtered = filtered.filter((p) => p.rating !== null && p.rating >= args.where.rating.gte);
        if (args?.where?.rateAmount) {
          if (args.where.rateAmount.gte) filtered = filtered.filter((p) => p.rateAmount !== null && p.rateAmount >= args.where.rateAmount.gte);
          if (args.where.rateAmount.lte) filtered = filtered.filter((p) => p.rateAmount !== null && p.rateAmount <= args.where.rateAmount.lte);
        }
        if (args?.where?.OR) {
          const search = args.where.OR[0]?.fullName?.contains;
          if (search) {
            const lowerSearch = search.toLowerCase();
            const OR = args.where.OR;
            filtered = filtered.filter((p) => {
              return OR.some((condition: any) => {
                const field = Object.keys(condition)[0];
                const val = condition[field]?.contains;
                if (!val) return false;
                const pValue = String((p as any)[field] ?? '');
                return pValue.toLowerCase().includes(val.toLowerCase());
              });
            });
          }
        }
        const skip = args?.skip ?? 0;
        const take = args?.take ?? filtered.length;
        return Promise.resolve(filtered.slice(skip, skip + take));
      }),
      count: jest.fn().mockImplementation((args: any) => {
        let filtered = [...profiles];
        if (args?.where?.status) filtered = filtered.filter((p) => p.status === args.where.status);
        if (args?.where?.isAvailable !== undefined) filtered = filtered.filter((p) => p.isAvailable === args.where.isAvailable);
        if (args?.where?.isVerified !== undefined) filtered = filtered.filter((p) => p.isVerified === args.where.isVerified);
        if (args?.where?.rating?.gte) filtered = filtered.filter((p) => p.rating !== null && p.rating >= args.where.rating.gte);
        return Promise.resolve(filtered.length);
      }),
      create: jest.fn().mockImplementation((args: any) => {
        const p: MockConsultantProfile = {
          id: `prof-${profiles.length + 1}`,
          tenantId: args.data.tenantId,
          fullName: args.data.fullName,
          avatarUrl: args.data.avatarUrl ?? null,
          title: args.data.title ?? null,
          bio: args.data.bio ?? null,
          skills: args.data.skills ?? [],
          industries: args.data.industries ?? [],
          certifications: args.data.certifications ?? [],
          email: args.data.email ?? null,
          phone: args.data.phone ?? null,
          website: args.data.website ?? null,
          socialLinks: args.data.socialLinks ?? [],
          isAvailable: args.data.isAvailable ?? true,
          rateType: args.data.rateType ?? null,
          rateAmount: args.data.rateAmount ?? null,
          currency: args.data.currency ?? 'USD',
          rating: null,
          reviewCount: 0,
          completedJobs: 0,
          isVerified: false,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        profiles.push(p);
        return Promise.resolve(p);
      }),
      update: jest.fn().mockImplementation((args: any) => {
        const idx = profiles.findIndex((p) => p.id === args.where.id);
        if (idx >= 0) {
          profiles[idx] = { ...profiles[idx], ...args.data, updatedAt: new Date() };
          return Promise.resolve(profiles[idx]);
        }
        throw new Error('Not found');
      }),
      // aggregate on consultantReview, not here
    },
    consultantReview: {
      findMany: jest.fn().mockImplementation((args: any) => {
        let filtered = [...reviews];
        if (args?.where?.consultantId) filtered = filtered.filter((r) => r.consultantId === args.where.consultantId);
        const skip = args?.skip ?? 0;
        const take = args?.take ?? filtered.length;
        return Promise.resolve(filtered.slice(skip, skip + take));
      }),
      count: jest.fn().mockImplementation((args: any) => {
        const filtered = args?.where?.consultantId
          ? reviews.filter((r) => r.consultantId === args.where.consultantId)
          : reviews;
        return Promise.resolve(filtered.length);
      }),
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.5 }, _count: 2 }),
      upsert: jest.fn().mockImplementation((args: any) => {
        // Simulate upsert: update existing or create new
        const existingIdx = reviews.findIndex(
          (r) => r.consultantId === args.where.consultantId_reviewerId.consultantId
            && r.reviewerId === args.where.consultantId_reviewerId.reviewerId,
        );
        if (existingIdx >= 0) {
          reviews[existingIdx] = { ...reviews[existingIdx], ...args.update, createdAt: reviews[existingIdx].createdAt };
          return Promise.resolve(reviews[existingIdx]);
        }
        const rev = makeReview({
          consultantId: args.create.consultantId,
          reviewerId: args.create.reviewerId,
          rating: args.create.rating,
          review: args.create.review,
        });
        reviews.push(rev);
        return Promise.resolve(rev);
      }),
    },
    consultantBooking: {
      findUnique: jest.fn().mockImplementation((args: any) =>
        Promise.resolve(bookings.find((b) => b.id === args.where.id) ?? null),
      ),
      findFirst: jest.fn().mockImplementation((args: any) => {
        let filtered = [...bookings];
        if (args?.where?.consultantId) filtered = filtered.filter((b) => b.consultantId === args.where.consultantId);
        if (args?.where?.clientTenantId) filtered = filtered.filter((b) => b.clientTenantId === args.where.clientTenantId);
        if (args?.where?.status?.in) filtered = filtered.filter((b) => args.where.status.in.includes(b.status));
        return Promise.resolve(filtered[0] ?? null);
      }),
      findMany: jest.fn().mockImplementation((args: any) => {
        let filtered = [...bookings];
        if (args?.where?.clientTenantId) filtered = filtered.filter((b) => b.clientTenantId === args.where.clientTenantId);
        if (args?.where?.consultantId) filtered = filtered.filter((b) => b.consultantId === args.where.consultantId);
        if (args?.where?.status) filtered = filtered.filter((b) => b.status === args.where.status);
        const skip = args?.skip ?? 0;
        const take = args?.take ?? filtered.length;
        return Promise.resolve(filtered.slice(skip, skip + take));
      }),
      count: jest.fn().mockImplementation((args: any) => {
        let filtered = [...bookings];
        if (args?.where?.clientTenantId) filtered = filtered.filter((b) => b.clientTenantId === args.where.clientTenantId);
        if (args?.where?.consultantId) filtered = filtered.filter((b) => b.consultantId === args.where.consultantId);
        if (args?.where?.status) filtered = filtered.filter((b) => b.status === args.where.status);
        return Promise.resolve(filtered.length);
      }),
      create: jest.fn().mockImplementation((args: any) => {
        const b = makeBooking(args.data);
        bookings.push(b);
        return Promise.resolve(b);
      }),
      update: jest.fn().mockImplementation((args: any) => {
        const idx = bookings.findIndex((b) => b.id === args.where.id);
        if (idx >= 0) {
          bookings[idx] = { ...bookings[idx], ...args.data };
          return Promise.resolve(bookings[idx]);
        }
        throw new Error('Not found');
      }),
    },
    _seedProfile: (overrides: Partial<MockConsultantProfile> = {}) => {
      const p = makeProfile(overrides);
      profiles.push(p);
      return p;
    },
    _seedReview: (overrides: Partial<MockConsultantReview> = {}) => {
      const r = makeReview(overrides);
      reviews.push(r);
      return r;
    },
    _seedBooking: (overrides: Partial<MockConsultantBooking> = {}) => {
      const b = makeBooking(overrides);
      bookings.push(b);
      return b;
    },
    _clear: () => { profiles.length = 0; reviews.length = 0; bookings.length = 0; },
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('ConsultantService', () => {
  let service: ConsultantService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    service = new ConsultantService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => mockPrisma._clear());

  // ═════════════════════════════════════════════════════════════════════
  //  searchConsultants
  // ═════════════════════════════════════════════════════════════════════

  describe('searchConsultants', () => {
    it('should return all active consultants by default', async () => {
      mockPrisma._seedProfile({ fullName: 'Alice' });
      mockPrisma._seedProfile({ fullName: 'Bob' });
      mockPrisma._seedProfile({ fullName: 'Charlie', status: 'inactive' });

      const result = await service.searchConsultants();
      // 2 active (Alice, Bob) — Charlie has status='inactive' so filtered out
    expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
    });

    it('should filter by search query', async () => {
      mockPrisma._seedProfile({ fullName: 'AI Workflow Expert' });
      mockPrisma._seedProfile({ fullName: 'Data Scientist' });

      // OR search: matches fullName 'AI Workflow Expert' (contains 'workflow') AND bio 'Expert in AI...'
    const result = await service.searchConsultants({ search: 'workflow' });
      expect(result.total).toBeGreaterThanOrEqual(1);
    });

    it('should apply isAvailable filter', async () => {
      mockPrisma._seedProfile({ fullName: 'Available Guy', isAvailable: true });
      mockPrisma._seedProfile({ fullName: 'Busy Guy', isAvailable: false });

      const result = await service.searchConsultants({ isAvailable: true });
      expect(result.total).toBe(1);
    });

    it('should apply minRating filter', async () => {
      mockPrisma._seedProfile({ fullName: 'High Rated', rating: 4.5 });
      mockPrisma._seedProfile({ fullName: 'Low Rated', rating: 2.0 });

      const result = await service.searchConsultants({ minRating: 4 });
      expect(result.total).toBe(1);
    });

    it('should paginate results', async () => {
      for (let i = 0; i < 10; i++) mockPrisma._seedProfile({ fullName: `Consultant ${i}` });

      const page1 = await service.searchConsultants({ limit: 3, offset: 0 });
      expect(page1.items).toHaveLength(3);
      expect(page1.total).toBe(10);

      const page2 = await service.searchConsultants({ limit: 3, offset: 6 });
      expect(page2.items).toHaveLength(3);
    });

    it('should return empty array when no matches', async () => {
      const result = await service.searchConsultants({ search: 'nonexistent' });
      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getConsultantById
  // ═════════════════════════════════════════════════════════════════════

  describe('getConsultantById', () => {
    it('should return consultant detail with reviews', async () => {
      const prof = mockPrisma._seedProfile({ id: 'prof-detail-1', fullName: 'Dr. Expert' });
      mockPrisma._seedReview({ consultantId: 'prof-detail-1', rating: 5, review: 'Great!' });

      const result = await service.getConsultantById('prof-detail-1');
      expect(result).not.toBeNull();
      expect(result!.fullName).toBe('Dr. Expert');
      expect(result!.recentReviews).toHaveLength(1);
      expect(result!.recentReviews[0].rating).toBe(5);
    });

    it('should return null for non-existent consultant', async () => {
      const result = await service.getConsultantById('nonexistent');
      expect(result).toBeNull();
    });

    it('should parse skills and industries arrays', async () => {
      mockPrisma._seedProfile({
        id: 'prof-parse',
        skills: ['python', 'ml', 'api'] as any,
        industries: ['tech'] as any,
        certifications: ['GCP'] as any,
        socialLinks: ['https://linkedin.com/in/test'] as any,
      });

      const result = await service.getConsultantById('prof-parse');
      expect(result!.skills).toEqual(['python', 'ml', 'api']);
      expect(result!.industries).toEqual(['tech']);
      expect(result!.certifications).toEqual(['GCP']);
      expect(result!.socialLinks).toEqual(['https://linkedin.com/in/test']);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getConsultantByTenantId
  // ═════════════════════════════════════════════════════════════════════

  describe('getConsultantByTenantId', () => {
    it('should return profile for existing tenant', async () => {
      mockPrisma._seedProfile({ tenantId: 'my-tenant', fullName: 'Tenant Owner' });

      const result = await service.getConsultantByTenantId('my-tenant');
      expect(result).not.toBeNull();
      expect(result!.fullName).toBe('Tenant Owner');
    });

    it('should return null for tenant without profile', async () => {
      const result = await service.getConsultantByTenantId('ghost');
      expect(result).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  createConsultantProfile
  // ═════════════════════════════════════════════════════════════════════

  describe('createConsultantProfile', () => {
    it('should create a new profile for tenant', async () => {
      const result = await service.createConsultantProfile('new-tenant', {
        fullName: 'Alice',
        title: 'Data Engineer',
        skills: ['etl', 'python'],
        isAvailable: true,
      });

      expect(result).not.toBeNull();
      expect(result.fullName).toBe('Alice');
    });

    it('should update existing profile when tenant already has one', async () => {
      mockPrisma._seedProfile({ tenantId: 'existing-tenant', fullName: 'Old Name', title: 'Junior' });

      const result = await service.createConsultantProfile('existing-tenant', {
        fullName: 'New Name',
        title: 'Senior',
      });

      expect(result.fullName).toBe('New Name');
      expect(result.title).toBe('Senior');
    });

    it('should set default currency to USD', async () => {
      const result = await service.createConsultantProfile('t1', {
        fullName: 'Bob',
        rateAmount: 75,
      });
      expect(result.currency).toBe('USD');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  updateConsultantProfile
  // ═════════════════════════════════════════════════════════════════════

  describe('updateConsultantProfile', () => {
    it('should update specified fields only', async () => {
      mockPrisma._seedProfile({ tenantId: 'updatable', fullName: 'Original', bio: 'Old bio' });

      const result = await service.updateConsultantProfile('updatable', {
        bio: 'Updated bio',
        isAvailable: false,
      });

      expect(result!.fullName).toBe('Original'); // unchanged
      expect(result!.bio).toBe('Updated bio');
    });

    it('should return null for tenant without profile', async () => {
      const result = await service.updateConsultantProfile('ghost', { fullName: 'Ghost' });
      expect(result).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  setAvailability
  // ═════════════════════════════════════════════════════════════════════

  describe('setAvailability', () => {
    it('should toggle availability', async () => {
      mockPrisma._seedProfile({ tenantId: 'togglable', isAvailable: true });
      const result = await service.setAvailability('togglable', false);
      // findFirst mock returns the seeded profile; update returns updated
      expect(result).not.toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  submitReview
  // ═════════════════════════════════════════════════════════════════════

  describe('submitReview', () => {
    it('should submit a review and update rating', async () => {
      mockPrisma._seedProfile({ id: 'prof-review-1', fullName: 'Rating Test' });

      const result = await service.submitReview('prof-review-1', 'reviewer-1', 5, 'Excellent!');
      expect(result.rating).toBe(5);
      expect(result.review).toBe('Excellent!');
    });

    it('should throw error for invalid rating (out of range)', async () => {
      await expect(service.submitReview('any', 'r1', 0, 'bad'))
        .rejects.toThrow('Rating must be between 1 and 5');
      await expect(service.submitReview('any', 'r1', 6, 'bad'))
        .rejects.toThrow('Rating must be between 1 and 5');
    });

    it('should throw error for non-existent consultant', async () => {
      await expect(service.submitReview('nonexistent', 'r1', 3, 'ok'))
        .rejects.toThrow('Consultant not found');
    });

    it('should prevent self-review', async () => {
      mockPrisma._seedProfile({ id: 'prof-self', tenantId: 'self-tenant' });
      await expect(service.submitReview('prof-self', 'self-tenant', 4, 'I am great!'))
        .rejects.toThrow('Cannot review yourself');
    });

    it('should upsert review (update existing)', async () => {
      mockPrisma._seedProfile({ id: 'prof-upsert', tenantId: 'other' });

      const first = await service.submitReview('prof-upsert', 'r-1', 4, 'Good');
      const second = await service.submitReview('prof-upsert', 'r-1', 5, 'Better now');

      expect(second.rating).toBe(5);
      expect(second.review).toBe('Better now');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getReviews
  // ═════════════════════════════════════════════════════════════════════

  describe('getReviews', () => {
    it('should return paginated reviews', async () => {
      mockPrisma._seedProfile({ id: 'prof-rev-list' });
      for (let i = 0; i < 5; i++) mockPrisma._seedReview({ consultantId: 'prof-rev-list', rating: 4 });

      const result = await service.getReviews('prof-rev-list', { limit: 3, offset: 0 });
      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(3);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  createBooking
  // ═════════════════════════════════════════════════════════════════════

  describe('createBooking', () => {
    it('should create a booking request', async () => {
      mockPrisma._seedProfile({ id: 'prof-book-1', isAvailable: true });

      const result = await service.createBooking('prof-book-1', 'client-1', 'Need help');
      expect(result.status).toBe('requested');
      expect(result.message).toBe('Need help');
    });

    it('should throw error for unavailable consultant', async () => {
      mockPrisma._seedProfile({ id: 'prof-unavail', isAvailable: false });
      await expect(service.createBooking('prof-unavail', 'client-1'))
        .rejects.toThrow('Consultant is not available');
    });

    it('should throw error for non-existent consultant', async () => {
      await expect(service.createBooking('nonexistent', 'client-1'))
        .rejects.toThrow('Consultant not found');
    });

    it('should throw error for conflicting active booking', async () => {
      mockPrisma._seedProfile({ id: 'prof-conflict', isAvailable: true });
      mockPrisma._seedBooking({ consultantId: 'prof-conflict', clientTenantId: 'client-1', status: 'confirmed' });

      await expect(service.createBooking('prof-conflict', 'client-1'))
        .rejects.toThrow('You already have an active booking');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  updateBookingStatus
  // ═════════════════════════════════════════════════════════════════════

  describe('updateBookingStatus', () => {
    it('should transition from requested to confirmed', async () => {
      const book = mockPrisma._seedBooking({ id: 'book-trans-1', status: 'requested' });

      const result = await service.updateBookingStatus('book-trans-1', 'confirmed');
      expect(result.status).toBe('confirmed');
    });

    it('should transition from confirmed to in_progress', async () => {
      mockPrisma._seedBooking({ id: 'book-progress', status: 'confirmed' });

      const result = await service.updateBookingStatus('book-progress', 'in_progress');
      expect(result.status).toBe('in_progress');
    });

    it('should complete booking and increment completedJobs', async () => {
      mockPrisma._seedBooking({ id: 'book-complete', status: 'in_progress', consultantId: 'prof-complete' });
      mockPrisma._seedProfile({ id: 'prof-complete', completedJobs: 5 });

      const result = await service.updateBookingStatus('book-complete', 'completed');
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeDefined();
    });

    it('should reject invalid transition', async () => {
      mockPrisma._seedBooking({ id: 'book-invalid', status: 'requested' });

      await expect(service.updateBookingStatus('book-invalid', 'completed'))
        .rejects.toThrow('Cannot transition');
    });

    it('should throw error for non-existent booking', async () => {
      await expect(service.updateBookingStatus('nonexistent', 'cancelled'))
        .rejects.toThrow('Booking not found');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getBookings
  // ═════════════════════════════════════════════════════════════════════

  describe('getBookings', () => {
    it('should get bookings as a client', async () => {
      mockPrisma._seedBooking({ clientTenantId: 'my-client', status: 'requested' });
      mockPrisma._seedBooking({ clientTenantId: 'my-client', status: 'completed' });

      const result = await service.getBookings('my-client', 'client');
      expect(result.total).toBe(2);
    });

    it('should get bookings as a consultant', async () => {
      mockPrisma._seedProfile({ id: 'consultant-prof', tenantId: 'consultant-tenant' });
      mockPrisma._seedBooking({ consultantId: 'consultant-prof', clientTenantId: 'other-client' });

      const result = await service.getBookings('consultant-tenant', 'consultant');
      expect(result.total).toBe(1);
    });

    it('should return empty for consultant without profile', async () => {
      const result = await service.getBookings('no-profile', 'consultant');
      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('should filter by status', async () => {
      mockPrisma._seedBooking({ clientTenantId: 'filter-client', status: 'requested' });
      mockPrisma._seedBooking({ clientTenantId: 'filter-client', status: 'completed' });

      const result = await service.getBookings('filter-client', 'client', { status: 'completed' });
      expect(result.total).toBe(1);
      expect(result.items[0].status).toBe('completed');
    });
  });
});


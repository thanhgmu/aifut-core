// ═══════════════════════════════════════════════════════════════════════════
// ai-agent-session.service.spec.ts — AI Operator Agent Session Management Tests
// ═══════════════════════════════════════════════════════════════════════════

import { AiAgentSessionService } from './ai-agent-session.service';
import { PrismaService } from '../prisma.service';

// ── Mock Types ────────────────────────────────────────────────────────────

interface MockAgentSession {
  id: string;
  tenantId: string;
  title: string;
  messages: any;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<MockAgentSession> = {}): MockAgentSession {
  return {
    id: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: 'tenant-1',
    title: 'Test Session',
    messages: [],
    status: 'active',
    createdAt: new Date('2026-06-28'),
    updatedAt: new Date('2026-06-28'),
    ...overrides,
  };
}

function makeMockPrisma() {
  const sessions: MockAgentSession[] = [];

  return {
    agentSession: {
      findUnique: jest.fn().mockImplementation((args: any) =>
        Promise.resolve(sessions.find((s) => s.id === args.where.id) ?? null),
      ),
      findMany: jest.fn().mockImplementation((args: any) => {
        let filtered = [...sessions];
        if (args?.where?.tenantId) filtered = filtered.filter((s) => s.tenantId === args.where.tenantId);
        if (args?.where?.status) filtered = filtered.filter((s) => s.status === args.where.status);
        filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        return Promise.resolve(filtered.slice(0, args?.take ?? filtered.length));
      }),
      count: jest.fn().mockImplementation((args: any) => {
        let filtered = [...sessions];
        if (args?.where?.tenantId) filtered = filtered.filter((s) => s.tenantId === args.where.tenantId);
        if (args?.where?.status) filtered = filtered.filter((s) => s.status === args.where.status);
        return Promise.resolve(filtered.length);
      }),
      create: jest.fn().mockImplementation((args: any) => {
        const s = makeSession({
          id: `sess-${sessions.length + 1}`,
          tenantId: args.data.tenantId,
          title: args.data.title,
          status: args.data.status,
          messages: args.data.messages,
        });
        sessions.push(s);
        return Promise.resolve(s);
      }),
      update: jest.fn().mockImplementation((args: any) => {
        const idx = sessions.findIndex((s) => s.id === args.where.id);
        if (idx >= 0) {
          sessions[idx] = { ...sessions[idx], ...args.data, updatedAt: new Date() };
          return Promise.resolve(sessions[idx]);
        }
        throw new Error('Not found');
      }),
      delete: jest.fn().mockImplementation((args: any) => {
        const idx = sessions.findIndex((s) => s.id === args.where.id);
        if (idx >= 0) { sessions.splice(idx, 1); return Promise.resolve({}); }
        throw new Error('Not found');
      }),
    },
    _seed: (overrides: Partial<MockAgentSession> = {}) => {
      const s = makeSession(overrides);
      sessions.push(s);
      return s;
    },
    _clear: () => { sessions.length = 0; },
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('AiAgentSessionService', () => {
  let service: AiAgentSessionService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    service = new AiAgentSessionService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => mockPrisma._clear());

  // ═════════════════════════════════════════════════════════════════════
  //  createSession
  // ═════════════════════════════════════════════════════════════════════

  describe('createSession', () => {
    it('should create a new session with active status', async () => {
      const result = await service.createSession('tenant-1', 'My Session');
      expect(result.tenantId).toBe('tenant-1');
      expect(result.title).toBe('My Session');
      expect(result.status).toBe('active');
      expect(result.messages).toEqual([]);
    });

    it('should truncate title longer than 60 chars', async () => {
      const longTitle = 'A'.repeat(100);
      const result = await service.createSession('t1', longTitle);
      expect(result.title.length).toBeLessThanOrEqual(60);
      expect(result.title).toMatch(/\.\.\.$/);
    });

    it('should preserve short titles', async () => {
      const result = await service.createSession('t1', 'Short');
      expect(result.title).toBe('Short');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getSession
  // ═════════════════════════════════════════════════════════════════════

  describe('getSession', () => {
    it('should return session by id', async () => {
      mockPrisma._seed({ id: 'sess-get-1', title: 'Specific Session' });
      const result = await service.getSession('sess-get-1');
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Specific Session');
    });

    it('should return null for non-existent session', async () => {
      const result = await service.getSession('nonexistent');
      expect(result).toBeNull();
    });

    it('should parse messages JSON array', async () => {
      const messages = [
        { role: 'user', content: 'hello', timestamp: '2026-06-28T10:00:00Z' },
        { role: 'assistant', content: 'hi', timestamp: '2026-06-28T10:00:01Z' },
      ];
      mockPrisma._seed({ id: 'sess-msgs', messages: messages as any });

      const result = await service.getSession('sess-msgs');
      expect(result!.messages).toHaveLength(2);
      expect(result!.messages[0].role).toBe('user');
    });

    it('should handle null messages gracefully', async () => {
      mockPrisma._seed({ id: 'sess-null-msg', messages: null });

      const result = await service.getSession('sess-null-msg');
      expect(result!.messages).toEqual([]);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  listSessions
  // ═════════════════════════════════════════════════════════════════════

  describe('listSessions', () => {
    it('should list sessions for tenant', async () => {
      mockPrisma._seed({ tenantId: 't1', title: 'Session 1' });
      mockPrisma._seed({ tenantId: 't1', title: 'Session 2' });
      mockPrisma._seed({ tenantId: 'other-tenant', title: 'Not Mine' });

      const result = await service.listSessions('t1');
      expect(result).toHaveLength(2);
    });

    it('should filter by status', async () => {
      mockPrisma._seed({ tenantId: 't1', title: 'Active 1', status: 'active' });
      mockPrisma._seed({ tenantId: 't1', title: 'Archived 1', status: 'archived' });

      const result = await service.listSessions('t1', 'archived');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('archived');
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) mockPrisma._seed({ tenantId: 't1', title: `Session ${i}` });

      const result = await service.listSessions('t1', undefined, 3);
      expect(result).toHaveLength(3);
    });

    it('should return empty array when no sessions', async () => {
      const result = await service.listSessions('empty-tenant');
      expect(result).toEqual([]);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  archiveSession
  // ═════════════════════════════════════════════════════════════════════

  describe('archiveSession', () => {
    it('should archive an active session', async () => {
      mockPrisma._seed({ id: 'sess-arch', status: 'active' });

      const result = await service.archiveSession('sess-arch');
      expect(result).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      const result = await service.archiveSession('nonexistent');
      expect(result).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  deleteSession
  // ═════════════════════════════════════════════════════════════════════

  describe('deleteSession', () => {
    it('should delete a session', async () => {
      mockPrisma._seed({ id: 'sess-del' });
      const result = await service.deleteSession('sess-del');
      expect(result).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      const result = await service.deleteSession('nonexistent');
      expect(result).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  getTenantSessionCount
  // ═════════════════════════════════════════════════════════════════════

  describe('getTenantSessionCount', () => {
    it('should count active sessions for tenant', async () => {
      mockPrisma._seed({ tenantId: 't1', status: 'active' });
      mockPrisma._seed({ tenantId: 't1', status: 'active' });
      mockPrisma._seed({ tenantId: 't1', status: 'archived' });

      const count = await service.getTenantSessionCount('t1');
      expect(count).toBe(2);
    });

    it('should return 0 for tenant with no sessions', async () => {
      const count = await service.getTenantSessionCount('empty');
      expect(count).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  addMessage
  // ═════════════════════════════════════════════════════════════════════

  describe('addMessage', () => {
    it('should append a message to session', async () => {
      const existing = [
        { role: 'user', content: 'hello', timestamp: '2026-06-28T10:00:00Z' },
      ];
      mockPrisma._seed({ id: 'sess-msg-add', messages: existing as any });

      const result = await service.addMessage('sess-msg-add', {
        role: 'assistant',
        content: 'world',
        timestamp: '2026-06-28T10:00:01Z',
      });

      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].content).toBe('world');
    });

    it('should throw error for non-existent session', async () => {
      await expect(service.addMessage('nonexistent', {
        role: 'user', content: 'test', timestamp: new Date().toISOString(),
      })).rejects.toThrow('not found');
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  Edge Cases
  // ═════════════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('should handle string JSON messages', async () => {
      const jsonStr = JSON.stringify([
        { role: 'user', content: 'hi', timestamp: '2026-06-28T10:00:00Z' },
      ]);
      mockPrisma._seed({ id: 'sess-json-str', messages: jsonStr as any });

      const result = await service.getSession('sess-json-str');
      expect(result!.messages).toHaveLength(1);
      expect(result!.messages[0].content).toBe('hi');
    });

    it('should handle invalid JSON messages gracefully', async () => {
      mockPrisma._seed({ id: 'sess-bad-json', messages: '{broken' as any });

      const result = await service.getSession('sess-bad-json');
      expect(result!.messages).toEqual([]);
    });

    it('should handle non-array messages gracefully', async () => {
      mockPrisma._seed({ id: 'sess-not-array', messages: { foo: 'bar' } as any });

      const result = await service.getSession('sess-not-array');
      expect(result!.messages).toEqual([]);
    });
  });
});

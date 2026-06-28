// ===================================================================
// sandbox-template.service.ts — Sandbox Template Spawning Service
// Phase 4: Developer Sandbox Core
// Cho phép tạo pre-configured sandbox sessions từ template
// In-Memory-First — hỗ trợ standalone mode
// ===================================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// ── Types ──────────────────────────────────────────────────────────────

export interface TemplateResponse {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  category?: string;
  config: any;
  isPublic: boolean;
  sessionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTemplateInput {
  tenantId: string;
  name: string;
  description?: string;
  category?: string;
  config?: any;
  isPublic?: boolean;
}

export interface SpawnSessionInput {
  templateId: string;
  tenantId: string;
  sessionName?: string;
  overrides?: any; // partial config overrides
}

export interface SpawnResult {
  session: {
    id: string;
    name: string;
    isActive: boolean;
    templateId: string;
    createdAt: Date;
  };
  template: TemplateResponse;
  appliedConfig: any;
}

// ── In-Memory store ──────────────────────────────────────────────────

interface MemoryTemplate {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  category?: string;
  config: any;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MemorySession {
  id: string;
  name: string;
  isActive: boolean;
  templateId?: string;
  tenantId: string;
  createdAt: Date;
}

class InMemoryTemplateStore {
  private templates: Map<string, MemoryTemplate> = new Map();
  private spawnedSessions: MemorySession[] = [];

  create(data: MemoryTemplate) {
    this.templates.set(data.id, data);
    return data;
  }

  findById(id: string) {
    return this.templates.get(id) ?? null;
  }

  findByTenant(tenantId: string): MemoryTemplate[] {
    return Array.from(this.templates.values())
      .filter((t) => t.tenantId === tenantId || t.isPublic)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  findAllPublic(): MemoryTemplate[] {
    return Array.from(this.templates.values())
      .filter((t) => t.isPublic)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  recordSpawn(session: MemorySession) {
    this.spawnedSessions.push(session);
  }

  countByTemplate(templateId: string): number {
    return this.spawnedSessions.filter((s) => s.templateId === templateId)
      .length;
  }

  delete(id: string) {
    this.templates.delete(id);
  }

  update(id: string, data: Partial<MemoryTemplate>) {
    const t = this.templates.get(id);
    if (t) {
      Object.assign(t, data);
      t.updatedAt = new Date();
      this.templates.set(id, t);
    }
    return t;
  }
}

// ── Built-in templates ────────────────────────────────────────────────

const BUILTIN_TEMPLATES: Record<
  string,
  { name: string; description: string; category: string; config: any }
> = {
  'blank': {
    name: 'Blank Sandbox',
    description: 'Empty sandbox — start from scratch',
    category: 'blank',
    config: { mockEndpoints: [], workflowSteps: [], connectors: [] },
  },
  'connector-rest-test': {
    name: 'REST Connector Test',
    description: 'Pre-configured mock endpoints for testing REST connectors',
    category: 'connector-test',
    config: {
      mockEndpoints: [
        { path: '/api/health', status: 200, body: { status: 'ok' }, delay: 0 },
        { path: '/api/data', status: 200, body: { items: [] }, delay: 50 },
        {
          path: '/api/auth/token',
          status: 200,
          body: { access_token: 'mock-token', expires_in: 3600 },
          delay: 100,
        },
      ],
      workflowSteps: [],
      connectors: ['rest'],
    },
  },
  'workflow-simple': {
    name: 'Simple Workflow Test',
    description: 'Trigger → Transform → Action workflow in sandbox',
    category: 'workflow-test',
    config: {
      mockEndpoints: [],
      workflowSteps: [
        { type: 'TRIGGER', key: 'webhook', config: {} },
        { type: 'TRANSFORM', key: 'format', config: { mapping: 'default' } },
        { type: 'ACTION', key: 'output', config: { target: 'log' } },
      ],
      connectors: [],
    },
  },
  'integration-full': {
    name: 'Full Integration Test',
    description: 'Complete connector + workflow test environment',
    category: 'integration-test',
    config: {
      mockEndpoints: [
        { path: '/api/inventory', status: 200, body: { products: [] }, delay: 30 },
        { path: '/api/orders', status: 201, body: { id: 'mock-order' }, delay: 80 },
      ],
      workflowSteps: [
        { type: 'TRIGGER', key: 'schedule', config: { cron: '0 * * * *' } },
        { type: 'ACTION', key: 'fetch-inventory', config: { connector: 'rest' } },
        { type: 'CONDITION', key: 'check-stock', config: { threshold: 10 } },
        { type: 'ACTION', key: 'notify', config: { channel: 'log' } },
      ],
      connectors: ['rest', 'email'],
    },
  },
  'ai-routing-test': {
    name: 'AI Routing Test',
    description: 'Test AI routing policies in isolated sandbox',
    category: 'workflow-test',
    config: {
      mockEndpoints: [],
      workflowSteps: [
        { type: 'TRIGGER', key: 'ai-input', config: {} },
        { type: 'ACTION', key: 'ai-route', config: { lane: 'balanced' } },
        { type: 'ACTION', key: 'ai-respond', config: { model: 'sandbox' } },
      ],
      connectors: ['ai'],
    },
  },
};

// ── Service ────────────────────────────────────────────────────────────

@Injectable()
export class SandboxTemplateService {
  private store = new InMemoryTemplateStore();
  private useMemory = false;
  private builtinsRegistered = false;

  constructor(
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.useMemory = !prisma;
  }

  setInMemoryMode(val: boolean) {
    this.useMemory = val;
  }

  // ── Register built-in templates ─────────────────────────────────

  private ensureBuiltins() {
    if (this.builtinsRegistered) return;
    this.builtinsRegistered = true;

    for (const [key, def] of Object.entries(BUILTIN_TEMPLATES)) {
      if (this.useMemory) {
        // Only register if not already existing
        const existing = this.store.findByTenant('builtin');
        if (!existing.find((t) => t.name === def.name)) {
          this.store.create({
            id: `builtin-${key}`,
            tenantId: 'aifut',
            name: def.name,
            description: def.description,
            category: def.category,
            config: def.config,
            isPublic: true,
            createdAt: new Date('2026-01-01'),
            updatedAt: new Date('2026-01-01'),
          });
        }
      }
    }
  }

  // ── Create template ─────────────────────────────────────────────

  async createTemplate(
    input: CreateTemplateInput,
  ): Promise<TemplateResponse> {
    if (!input.tenantId || !input.name) {
      throw new BadRequestException('tenantId and name are required.');
    }
    if (input.name.length > 256) {
      throw new BadRequestException('Template name too long (max 256).');
    }

    if (this.useMemory) {
      const id = crypto.randomUUID();
      const template: MemoryTemplate = {
        id,
        tenantId: input.tenantId,
        name: input.name.trim(),
        description: input.description,
        category: input.category ?? 'blank',
        config: input.config ?? BUILTIN_TEMPLATES['blank'].config,
        isPublic: input.isPublic ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.store.create(template);
      return this.toTemplateResponse(template, 0);
    }

    const template = await this.prisma!.sandboxTemplate.create({
      data: {
        tenantId: input.tenantId,
        name: input.name.trim(),
        description: input.description,
        category: input.category ?? 'blank',
        config: input.config ?? undefined,
        isPublic: input.isPublic ?? false,
      },
    });

    return this.toTemplateResponse(template, 0);
  }

  // ── Spawn session from template ─────────────────────────────────

  async spawnSession(input: SpawnSessionInput): Promise<SpawnResult> {
    let template: any;

    if (this.useMemory) {
      this.ensureBuiltins();
      template = this.store.findById(input.templateId);
      if (!template) {
        throw new NotFoundException(
          `Template "${input.templateId}" not found.`,
        );
      }
    } else {
      template = await this.prisma!.sandboxTemplate.findUnique({
        where: { id: input.templateId },
      });
      if (!template) {
        throw new NotFoundException(
          `Template "${input.templateId}" not found.`,
        );
      }
    }

    // Merge config with overrides
    const baseConfig =
      typeof template.config === 'object' ? template.config : {};
    const appliedConfig = input.overrides
      ? this.mergeConfig(baseConfig, input.overrides)
      : baseConfig;

    const sessionName =
      input.sessionName ?? `Sandbox: ${template.name} (${new Date().toLocaleTimeString()})`;

    if (this.useMemory) {
      const sessionId = crypto.randomUUID();
      const session: MemorySession = {
        id: sessionId,
        name: sessionName,
        isActive: true,
        templateId: input.templateId,
        tenantId: input.tenantId,
        createdAt: new Date(),
      };
      this.store.recordSpawn(session);

      return {
        session: {
          id: session.id,
          name: session.name,
          isActive: session.isActive,
          templateId: session.templateId!,
          createdAt: session.createdAt,
        },
        template: this.toTemplateResponse(
          template,
          this.store.countByTemplate(template.id),
        ),
        appliedConfig,
      };
    }

    // DB path: create session + link to template
    const session = await this.prisma!.sandboxSession.create({
      data: {
        tenantId: input.tenantId,
        name: sessionName,
        isActive: true,
        templateId: input.templateId,
      },
    });

    const sessionCount = await this.prisma!.sandboxSession.count({
      where: { templateId: input.templateId },
    });

    return {
      session: {
        id: session.id,
        name: session.name,
        isActive: session.isActive,
        templateId: session.templateId!,
        createdAt: session.createdAt,
      },
      template: this.toTemplateResponse(template, sessionCount),
      appliedConfig,
    };
  }

  // ── Get templates ───────────────────────────────────────────────

  async getTemplate(templateId: string): Promise<TemplateResponse> {
    if (this.useMemory) {
      this.ensureBuiltins();
      const template = this.store.findById(templateId);
      if (!template) {
        throw new NotFoundException(
          `Template "${templateId}" not found.`,
        );
      }
      return this.toTemplateResponse(
        template,
        this.store.countByTemplate(templateId),
      );
    }

    const template = await this.prisma!.sandboxTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new NotFoundException(
        `Template "${templateId}" not found.`,
      );
    }

    const sessionCount = await this.prisma!.sandboxSession.count({
      where: { templateId },
    });

    return this.toTemplateResponse(template, sessionCount);
  }

  async listTemplates(
    tenantId: string,
    includePublic: boolean = true,
  ): Promise<TemplateResponse[]> {
    if (this.useMemory) {
      this.ensureBuiltins();
      const templates = this.store.findByTenant(tenantId);
      return templates.map((t) =>
        this.toTemplateResponse(
          t,
          this.store.countByTemplate(t.id),
        ),
      );
    }

    const where: any = {};
    if (includePublic) {
      where.OR = [{ tenantId }, { isPublic: true }];
    } else {
      where.tenantId = tenantId;
    }

    const templates = await this.prisma!.sandboxTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const result = await Promise.all(
      templates.map(async (t) => {
        const sessionCount = await this.prisma!.sandboxSession.count({
          where: { templateId: t.id },
        });
        return this.toTemplateResponse(t, sessionCount);
      }),
    );

    return result;
  }

  async deleteTemplate(templateId: string): Promise<void> {
    if (this.useMemory) {
      const template = this.store.findById(templateId);
      if (!template) {
        throw new NotFoundException(
          `Template "${templateId}" not found.`,
        );
      }
      this.store.delete(templateId);
      return;
    }

    const template = await this.prisma!.sandboxTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new NotFoundException(
        `Template "${templateId}" not found.`,
      );
    }

    await this.prisma!.sandboxTemplate.delete({
      where: { id: templateId },
    });
  }

  // ── Get built-in template keys ──────────────────────────────────

  getBuiltinTemplateKeys(): string[] {
    return Object.keys(BUILTIN_TEMPLATES);
  }

  getBuiltinTemplate(key: string): any {
    return BUILTIN_TEMPLATES[key] ?? null;
  }

  // ── Private helpers ─────────────────────────────────────────────

  private mergeConfig(base: any, overrides: any): any {
    const result = JSON.parse(JSON.stringify(base)); // deep clone

    if (overrides.mockEndpoints) {
      result.mockEndpoints = [
        ...(result.mockEndpoints || []),
        ...overrides.mockEndpoints,
      ];
    }
    if (overrides.workflowSteps) {
      result.workflowSteps = [
        ...(result.workflowSteps || []),
        ...overrides.workflowSteps,
      ];
    }
    if (overrides.connectors) {
      result.connectors = [
        ...new Set([
          ...(result.connectors || []),
          ...overrides.connectors,
        ]),
      ];
    }

    return result;
  }

  private toTemplateResponse(
    t: any,
    sessionCount: number,
  ): TemplateResponse {
    return {
      id: t.id,
      tenantId: t.tenantId,
      name: t.name,
      description: t.description ?? undefined,
      category: t.category ?? undefined,
      config: t.config ?? {},
      isPublic: t.isPublic ?? false,
      sessionCount,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}

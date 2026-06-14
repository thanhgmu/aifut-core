import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface CreateTemplateDto {
  tenantId: string;
  key: string;
  name: string;
  channel: string;
  subjectTemplate?: string;
  bodyTemplate: string;
  format?: 'text' | 'html' | 'markdown';
  metadata?: Record<string, any>;
}

export interface UpdateTemplateDto {
  name?: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
  format?: 'text' | 'html' | 'markdown';
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /** List templates for a tenant */
  async list(tenantId: string) {
    return this.prisma.notificationTemplate.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Get a single template by id */
  async getById(tenantId: string, id: string) {
    const tpl = await this.prisma.notificationTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!tpl) throw new NotFoundException('Notification template not found');
    return tpl;
  }

  /** Get a single template by tenant+key */
  async getByKey(tenantId: string, key: string) {
    const tpl = await this.prisma.notificationTemplate.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    if (!tpl) throw new NotFoundException(`Template '${key}' not found`);
    return tpl;
  }

  /** Create a new template */
  async create(dto: CreateTemplateDto) {
    const existing = await this.prisma.notificationTemplate.findUnique({
      where: { tenantId_key: { tenantId: dto.tenantId, key: dto.key } },
    });
    if (existing) {
      throw new ConflictException(`Template key '${dto.key}' already exists`);
    }
    return this.prisma.notificationTemplate.create({
      data: {
        tenantId: dto.tenantId,
        key: dto.key,
        name: dto.name,
        channel: dto.channel.toUpperCase() as any,
        subjectTemplate: dto.subjectTemplate ?? null,
        bodyTemplate: dto.bodyTemplate,
        format: dto.format ?? 'text',
        metadata: dto.metadata ?? undefined,
      },
    });
  }

  /** Update an existing template */
  async update(tenantId: string, id: string, dto: UpdateTemplateDto) {
    const existing = await this.getById(tenantId, id);
    return this.prisma.notificationTemplate.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        subjectTemplate: dto.subjectTemplate !== undefined ? dto.subjectTemplate : existing.subjectTemplate,
        bodyTemplate: dto.bodyTemplate ?? existing.bodyTemplate,
        format: dto.format ?? existing.format as any,
        metadata: dto.metadata !== undefined ? dto.metadata : (existing.metadata ?? undefined),
      },
    });
  }

  /** Delete a template */
  async delete(tenantId: string, id: string) {
    await this.getById(tenantId, id);
    return this.prisma.notificationTemplate.delete({ where: { id } });
  }

  /** Render a template with data */
  async render(tenantId: string, key: string, data: Record<string, any>) {
    const tpl = await this.getByKey(tenantId, key);
    const rendered = {
      subject: tpl.subjectTemplate
        ? renderInline(tpl.subjectTemplate, data)
        : undefined,
      body: renderInline(tpl.bodyTemplate, data),
      format: tpl.format,
    };
    return rendered;
  }
}

/** Simple template renderer supporting {{key}} and {{key|default}} placeholders */
export function renderInline(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{\s*(\w[\w.]*)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g, (_match, key, fallback) => {
    const val = key.split('.').reduce((obj, k) => (obj != null ? obj[k] : undefined), data as any);
    return val !== undefined && val !== null ? String(val) : (fallback ?? `{{${key}}}`);
  });
}

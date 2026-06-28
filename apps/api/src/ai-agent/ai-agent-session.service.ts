// ═══════════════════════════════════════════════════════════════════════════
// ai-agent-session.service.ts — AI Operator Agent Session Management
// ═══════════════════════════════════════════════════════════════════════════
// Persistence-backed session store cho per-tenant AI Agent.
// Mỗi tenant có N session, mỗi session chứa lịch sử chat.
// ── Chuyển từ in-memory Map → Prisma Tenant + AgentSession model ──
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface AgentSession {
  id: string;
  tenantId: string;
  title: string;
  messages: ChatMessage[];
  status: 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class AiAgentSessionService {
  private readonly logger = new Logger(AiAgentSessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * createSession
   * ─────────────
   * Tạo session mới — persisted to DB.
   */
  async createSession(tenantId: string, title: string): Promise<AgentSession> {
    const record = await this.prisma.agentSession.create({
      data: {
        tenantId,
        title: title.length > 60 ? `${title.slice(0, 57)}...` : title,
        status: 'active',
        messages: Prisma.JsonNull,
      },
    });
    return this.toAgentSession(record);
  }

  /**
   * getSession
   * ──────────
   * Lấy session từ DB theo id.
   */
  async getSession(id: string): Promise<AgentSession | null> {
    const record = await this.prisma.agentSession.findUnique({
      where: { id },
    });
    return record ? this.toAgentSession(record) : null;
  }

  /**
   * listSessions
   * ────────────
   * Liệt kê sessions của tenant từ DB.
   */
  async listSessions(
    tenantId: string,
    status?: string,
    limit = 50,
  ): Promise<AgentSession[]> {
    const where: Prisma.AgentSessionWhereInput = { tenantId };
    if (status) where.status = status;

    const records = await this.prisma.agentSession.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return records.map((r) => this.toAgentSession(r));
  }

  /**
   * archiveSession
   * ──────────────
   * Đánh dấu session là archived.
   */
  async archiveSession(id: string): Promise<boolean> {
    try {
      await this.prisma.agentSession.update({
        where: { id },
        data: { status: 'archived' },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * deleteSession
   * ─────────────
   * Xoá session khỏi DB.
   */
  async deleteSession(id: string): Promise<boolean> {
    try {
      await this.prisma.agentSession.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * getTenantSessionCount
   * ──────────────────────
   * Đếm active sessions của tenant.
   */
  async getTenantSessionCount(tenantId: string): Promise<number> {
    return this.prisma.agentSession.count({
      where: { tenantId, status: 'active' },
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  //  Message helpers
  // ═════════════════════════════════════════════════════════════════════

  /**
   * addMessage
   * ──────────
   * Thêm message vào session và update DB.
   */
  async addMessage(
    sessionId: string,
    message: ChatMessage,
  ): Promise<AgentSession> {
    const record = await this.prisma.agentSession.findUnique({
      where: { id: sessionId },
    });
    if (!record) throw new Error(`Session ${sessionId} not found`);

    const currentMessages = this.parseMessages(record.messages);
    const updatedMessages = [...currentMessages, message];

    const updated = await this.prisma.agentSession.update({
      where: { id: sessionId },
      data: { messages: updatedMessages as any },
    });
    return this.toAgentSession(updated);
  }

  // ═════════════════════════════════════════════════════════════════════
  //  Internal helpers
  // ═════════════════════════════════════════════════════════════════════

  private parseMessages(messages: unknown): ChatMessage[] {
    if (!messages) return [];
    if (Array.isArray(messages)) return messages as ChatMessage[];
    try {
      const parsed = typeof messages === 'string' ? JSON.parse(messages) : messages;
      return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
    } catch {
      return [];
    }
  }

  private toAgentSession(record: any): AgentSession {
    return {
      id: record.id,
      tenantId: record.tenantId,
      title: record.title,
      messages: this.parseMessages(record.messages),
      status: record.status as 'active' | 'archived',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ai-agent-session.service.ts — AI Operator Agent Session Management
// ═══════════════════════════════════════════════════════════════════════════
// In-memory session store cho per-tenant AI Agent.
// Mỗi tenant có N session, mỗi session chứa lịch sử chat.
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable } from '@nestjs/common';

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
  private sessions: Map<string, AgentSession> = new Map();

  /**
   * createSession
   * ─────────────
   * Tạo một session mới cho tenant.
   */
  createSession(tenantId: string, title: string): AgentSession {
    const id = this.generateId();
    const now = new Date();
    const session: AgentSession = {
      id,
      tenantId,
      title: title.length > 60 ? `${title.slice(0, 57)}...` : title,
      messages: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(id, session);
    return session;
  }

  /**
   * getSession
   * ──────────
   * Lấy session theo id.
   */
  getSession(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * listSessions
   * ────────────
   * Liệt kê session của tenant.
   */
  listSessions(tenantId: string, status?: string): AgentSession[] {
    const all = Array.from(this.sessions.values())
      .filter((s) => s.tenantId === tenantId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    if (status) {
      return all.filter((s) => s.status === status);
    }
    return all;
  }

  /**
   * archiveSession
   * ──────────────
   * Đánh dấu session là archived.
   */
  archiveSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.status = 'archived';
    session.updatedAt = new Date();
    return true;
  }

  /**
   * deleteSession
   * ─────────────
   * Xoá session.
   */
  deleteSession(id: string): boolean {
    return this.sessions.delete(id);
  }

  /**
   * getTenantSessionCount
   * ──────────────────────
   * Đếm session của tenant.
   */
  getTenantSessionCount(tenantId: string): number {
    return Array.from(this.sessions.values()).filter(
      (s) => s.tenantId === tenantId,
    ).length;
  }

  private generateId(): string {
    return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

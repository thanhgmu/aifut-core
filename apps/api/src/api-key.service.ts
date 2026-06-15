import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import * as crypto from 'crypto';

export interface ApiKeyInfo {
  id: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a new API key for a tenant.
   */
  async generateKey(input: {
    tenantId: string;
    userId: string;
    name: string;
    scopes?: string[];
    expiresInDays?: number;
  }): Promise<{ key: string; info: ApiKeyInfo }> {
    const rawKey = `aifut_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12);

    const session = await this.prisma.session.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        type: 'API_KEY',
        tokenHash,
        name: input.name || 'API Key',
        scopes: input.scopes || ['read'],
        expiresAt: input.expiresInDays
          ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      key: rawKey,
      info: {
        id: session.id,
        keyPrefix,
        name: input.name,
        scopes: input.scopes || ['read'],
        expiresAt: session.expiresAt,
        lastUsedAt: null,
        createdAt: session.createdAt,
      },
    };
  }

  /**
   * List all API keys for a tenant/user.
   */
  async listKeys(tenantId: string, userId: string): Promise<ApiKeyInfo[]> {
    const sessions = await this.prisma.session.findMany({
      where: { tenantId, userId, type: 'API_KEY', revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      keyPrefix: s.tokenHash.slice(0, 12),
      name: s.name || 'Unnamed',
      scopes: (s as any).scopes || ['read'],
      expiresAt: s.expiresAt,
      lastUsedAt: s.lastSeenAt,
      createdAt: s.createdAt,
    }));
  }

  /**
   * Revoke an API key.
   */
  async revokeKey(keyId: string, tenantId: string): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { id: keyId, tenantId, type: 'API_KEY' },
    });
    if (!session) throw new NotFoundException('API key not found');

    await this.prisma.session.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Validate an API key and return the associated session.
   */
  async validateKey(rawKey: string): Promise<{ tenantId: string; userId: string; scopes: string[] } | null> {
    const tokenHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash,
        type: 'API_KEY',
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) return null;

    // Update last used
    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      tenantId: session.tenantId,
      userId: session.userId,
      scopes: (session as any).scopes || ['read'],
    };
  }

  getCapabilities() {
    return {
      capability: 'api-keys',
      status: 'active',
      features: {
        keyGeneration: true,
        scopeBasedAccess: true,
        expiration: true,
        revocation: true,
        usageTracking: true,
      },
    };
  }
}

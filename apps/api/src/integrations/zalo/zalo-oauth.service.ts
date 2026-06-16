import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  ZALO_ENDPOINTS,
  ZALO_ERROR_CODES,
  ZALO_RATE_LIMITS,
} from './zalo.constants';
import type {
  ZaloTokenInfo,
  ZaloTokenRefreshResponse,
  ZaloOaConnectionRecord,
  ZaloConnectInput,
  ZaloConnectionStatus,
} from './zalo.types';
import * as crypto from 'crypto';

/**
 * Manages multi-tenant Zalo OA OAuth2 tokens.
 * Each tenant can connect one OA.
 * Tokens are encrypted at rest and cached in-memory with automatic refresh.
 */
@Injectable()
export class ZaloOAuthService {
  private readonly logger = new Logger(ZaloOAuthService.name);

  /**
   * In-memory token cache: tenantId → { accessToken, refreshToken, expiresAt }
   * refreshPromise prevents concurrent refresh storms for the same tenant.
   */
  private tokenCache = new Map<
    string,
    { accessToken: string; expiresAt: number }
  >();
  private refreshPromise = new Map<string, Promise<string>>();

  /** Encryption key derived from env — all deployments MUST set this */
  private get encryptionKey(): string {
    return process.env.ZALO_ENCRYPTION_KEY || 'dev-insecure-fallback-key-32chr!';
  }

  constructor(private readonly prisma: PrismaService) {}

  // ── Connection Management ───────────────────────────────────────────────

  /** Create or update a Zalo OA connection for a tenant */
  async connect(
    tenantId: string,
    input: ZaloConnectInput,
  ): Promise<ZaloOaConnectionRecord> {
    const encrypted = this.encryptFields(input);
    const existing = await this.prisma.zaloOaConnection.findUnique({
      where: { tenantId },
    });

    let record: any;
    if (existing) {
      record = await this.prisma.zaloOaConnection.update({
        where: { id: existing.id },
        data: {
          oaId: input.oaId,
          appId: input.appId,
          encryptedSecret: encrypted.secretKey,
          encryptedRefreshToken: encrypted.refreshToken,
          status: 'ACTIVE',
        },
      });
    } else {
      record = await this.prisma.zaloOaConnection.create({
        data: {
          tenantId,
          oaId: input.oaId,
          appId: input.appId,
          encryptedSecret: encrypted.secretKey,
          encryptedRefreshToken: encrypted.refreshToken,
          status: 'ACTIVE',
        },
      });
    }

    // Fetch initial token (auth code flow — simplified: uses refresh token)
    try {
      const token = await this.exchangeRefreshToken(record);
      record = await this.prisma.zaloOaConnection.update({
        where: { id: record.id },
        data: {
          encryptedAccessToken: this.encrypt(token.accessToken),
          tokenExpiresAt: new Date(token.expiresAt),
          lastVerifiedAt: new Date(),
        },
      });
      this.tokenCache.set(tenantId, {
        accessToken: token.accessToken,
        expiresAt: token.expiresAt,
      });
    } catch (err: any) {
      this.logger.warn(
        `[${tenantId}] Initial token fetch failed: ${err.message}`,
      );
    }

    return {
      id: record.id,
      tenantId: record.tenantId,
      oaId: record.oaId,
      appId: record.appId,
      status: record.status,
      dailyQuotaTotal: record.dailyQuotaTotal,
      dailyQuotaUsed: record.dailyQuotaUsed,
      quotaResetAt: record.quotaResetAt,
    };
  }

  /** Disconnect / revoke a Zalo OA connection */
  async disconnect(tenantId: string): Promise<void> {
    const existing = await this.prisma.zaloOaConnection.findUnique({
      where: { tenantId },
    });
    if (!existing) throw new NotFoundException('Zalo OA connection not found');

    await this.prisma.zaloOaConnection.update({
      where: { id: existing.id },
      data: { status: 'REVOKED', encryptedAccessToken: null },
    });
    this.tokenCache.delete(tenantId);
    this.refreshPromise.delete(tenantId);
  }

  // ── Token Retrieval ─────────────────────────────────────────────────────

  /** Get a valid access token for the tenant. Auto-refreshes if expired. */
  async getAccessToken(tenantId: string): Promise<string> {
    // Check cache first
    const cached = this.tokenCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now() + ZALO_RATE_LIMITS.TOKEN_REFRESH_MARGIN_MS) {
      return cached.accessToken;
    }

    // Deduplicate concurrent refresh requests
    const pending = this.refreshPromise.get(tenantId);
    if (pending) return pending;

    const promise = this.refreshAccessToken(tenantId);
    this.refreshPromise.set(tenantId, promise);
    try {
      return await promise;
    } finally {
      this.refreshPromise.delete(tenantId);
    }
  }

  /** Refresh access token using stored refresh token */
  private async refreshAccessToken(tenantId: string): Promise<string> {
    const record = await this.getConnectionRecord(tenantId);
    const token = await this.exchangeRefreshToken(record);
    const encryptedAccess = this.encrypt(token.accessToken);

    await this.prisma.zaloOaConnection.update({
      where: { id: record.id },
      data: {
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: this.encrypt(token.refreshToken),
        tokenExpiresAt: new Date(token.expiresAt),
        lastVerifiedAt: new Date(),
      },
    });

    this.tokenCache.set(tenantId, {
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
    });

    return token.accessToken;
  }

  /** POST to Zalo OAuth endpoint to refresh token */
  private async exchangeRefreshToken(
    record: any,
  ): Promise<ZaloTokenInfo> {
    const secretKey = this.decrypt(record.encryptedSecret);
    const refreshToken = this.decrypt(record.encryptedRefreshToken);
    const appId = record.appId;

    const res = await fetch(ZALO_ENDPOINTS.ACCESS_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        app_id: appId,
        secret_key: secretKey,
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(ZALO_RATE_LIMITS.TIMEOUT_MS),
    });

    const json: ZaloTokenRefreshResponse & { error?: number; message?: string } =
      await res.json();

    if (!json.access_token) {
      throw new Error(
        `Zalo token refresh failed: ${json.error} ${json.message ?? ''}`,
      );
    }

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || refreshToken,
      expiresAt: Date.now() + (json.expires_in || 3600) * 1000 - ZALO_RATE_LIMITS.TOKEN_REFRESH_MARGIN_MS,
      oaId: record.oaId,
    };
  }

  // ── Connection Status ───────────────────────────────────────────────────

  /** Get OA connection status for a tenant */
  async getStatus(tenantId: string): Promise<ZaloConnectionStatus> {
    const record = await this.getConnectionRecord(tenantId);
    const cached = this.tokenCache.get(tenantId);
    const tokenValid =
      cached && cached.expiresAt > Date.now() + ZALO_RATE_LIMITS.TOKEN_REFRESH_MARGIN_MS;

    return {
      connected: record.status === 'ACTIVE',
      tenantId: record.tenantId,
      oaId: record.oaId,
      status: record.status,
      dailyQuotaTotal: record.dailyQuotaTotal,
      dailyQuotaUsed: record.dailyQuotaUsed,
      remainingQuota: Math.max(0, record.dailyQuotaTotal - record.dailyQuotaUsed),
      quotaResetAt: record.quotaResetAt?.toISOString() ?? null,
      lastVerifiedAt: record.lastVerifiedAt?.toISOString() ?? null,
    };
  }

  /** Find connection record or throw */
  async getConnectionRecord(
    tenantId: string,
  ): Promise<ZaloOaConnectionRecord & { id: string; encryptedSecret: string; encryptedRefreshToken: string; encryptedAccessToken: string | null; tokenExpiresAt: Date | null; lastVerifiedAt: Date | null }> {
    const record = await this.prisma.zaloOaConnection.findUnique({
      where: { tenantId },
    });
    if (!record || record.status === 'REVOKED') {
      throw new NotFoundException(
        `Zalo OA not connected for tenant ${tenantId}. Use POST /zalo/connect first.`,
      );
    }
    return record;
  }

  // ── Webhook Verification ────────────────────────────────────────────────

  /** Verify HMAC-SHA256 webhook signature from Zalo */
  verifyWebhookSignature(
    signature: string | undefined,
    rawBody: string,
    webhookSecret: string,
  ): boolean {
    if (!signature || !webhookSecret) return false;
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  // ── Encryption Helpers ──────────────────────────────────────────────────

  private encryptFields(input: {
    secretKey: string;
    refreshToken: string;
    webhookUrl?: string;
  }): { secretKey: string; refreshToken: string } {
    return {
      secretKey: this.encrypt(input.secretKey),
      refreshToken: this.encrypt(input.refreshToken),
    };
  }

  private encrypt(plaintext: string): string {
    // Simple AES-256-CBC encryption using derived key
    const key = crypto.scryptSync(this.encryptionKey, 'zalo-salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 2) return ciphertext; // fallback for unencrypted test data
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const key = crypto.scryptSync(this.encryptionKey, 'zalo-salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

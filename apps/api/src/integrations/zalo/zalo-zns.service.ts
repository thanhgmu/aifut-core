import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ZaloOAuthService } from './zalo-oauth.service';
import { ZaloMeterService } from './zalo.meter.service';
import {
  ZALO_ENDPOINTS,
  ZALO_ERROR_CODES,
  ZALO_RATE_LIMITS,
} from './zalo.constants';
import type {
  ZnsSendRequest,
  ZnsSendResponse,
  ZaloTextSendRequest,
  ZaloTextSendResponse,
  ZaloQuotaInfo,
  ZaloOaInfo,
  ZaloDeliveryResult,
} from './zalo.types';

/**
 * Core ZNS delivery engine.
 * Handles: ZNS template send, text send, quota query, OA info query.
 * Integrates with token management, rate limiting, and billing metering.
 */
@Injectable()
export class ZaloZnsService {
  private readonly logger = new Logger(ZaloZnsService.name);

  /**
   * Simple per-second rate limiter per tenant.
   * Map: tenantId → { timestamps: number[] }
   */
  private rateLimiter = new Map<string, { timestamps: number[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: ZaloOAuthService,
    private readonly meter: ZaloMeterService,
  ) {}

  // ── Send ZNS Template ──────────────────────────────────────────────────

  /**
   * Send a ZNS (Zalo Notification Service) template message.
   * This is the official message type with guaranteed delivery and higher trust.
   */
  async sendZnsTemplate(
    tenantId: string,
    request: ZnsSendRequest,
  ): Promise<ZaloDeliveryResult> {
    const start = Date.now();
    this.validateZnsRequest(request);

    // Check daily quota before sending
    const quotaOk = await this.checkQuotaBeforeSend(tenantId, 1);
    if (!quotaOk) {
      return {
        success: false,
        error: `Daily ZNS quota exceeded for tenant ${tenantId}`,
        quotaCost: 0,
        durationMs: Date.now() - start,
      };
    }

    // Enforce per-second rate limit
    this.enforceRateLimit(tenantId, 'zns');

    const accessToken = await this.oauth.getAccessToken(tenantId);

    try {
      const body: Record<string, any> = {
        recipient: { user_id: request.userId },
        template_id: request.templateId,
        template_data: request.templateData,
        language: request.language ?? 'VI',
      };
      if (request.trackingId) {
        body.tracking_id = request.trackingId;
      }

      const result = await this.fetchWithRetry<ZnsSendResponse>(
        ZALO_ENDPOINTS.SEND_ZNS,
        accessToken,
        body,
        tenantId,
      );

      const success = result.error === ZALO_ERROR_CODES.SUCCESS;
      const quotaCost = result.data?.quota_estimated ?? 1;

      // Persist sent message log
      await this.persistZnsMessage(tenantId, {
        messageType: 'ZNS_TEMPLATE',
        templateId: request.templateId,
        recipientId: request.userId,
        templateData: request.templateData,
        zaloMessageId: result.data?.message_id,
        sendStatus: success ? 'SENT' : 'FAILED',
        errorCode: result.error,
        errorMessage: result.message,
        quotaCost,
      });

      // Record billing usage asynchronously
      if (success) {
        this.meter.recordZnsUsage(tenantId, result.data?.message_id, quotaCost).catch(
          (err) => this.logger.warn(`[${tenantId}] Meter recording failed: ${err.message}`),
        );
      }

      return {
        success,
        providerMessageId: result.data?.message_id,
        error: success ? undefined : `${result.error}: ${result.message}`,
        quotaCost,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      this.logger.error(`[${tenantId}] ZNS send failed: ${err.message}`);
      return {
        success: false,
        error: err.message,
        quotaCost: 0,
        durationMs: Date.now() - start,
      };
    }
  }

  // ── Send Text (legacy CS) ──────────────────────────────────────────────

  /**
   * Send a plain text message via Zalo Customer Support endpoint.
   * No ZNS quota deducted — uses free-tier text path.
   */
  async sendText(
    tenantId: string,
    request: ZaloTextSendRequest,
  ): Promise<ZaloDeliveryResult> {
    const start = Date.now();

    if (!request.userId) {
      throw new BadRequestException('Zalo user_id is required');
    }
    const text = request.text?.substring(0, ZALO_RATE_LIMITS.MAX_TEXT_LENGTH) ?? '';

    if (!text) {
      throw new BadRequestException('Message text is required');
    }

    this.enforceRateLimit(tenantId, 'text');

    const accessToken = await this.oauth.getAccessToken(tenantId);

    try {
      const body: Record<string, any> = {
        recipient: { user_id: request.userId },
        message: { text },
      };
      if (request.trackingId) {
        body.tracking_id = request.trackingId;
      }

      const result = await this.fetchWithRetry<ZaloTextSendResponse>(
        ZALO_ENDPOINTS.SEND_TEXT,
        accessToken,
        body,
        tenantId,
      );

      const success = result.error === ZALO_ERROR_CODES.SUCCESS;

      // Persist log (text messages don't consume ZNS quota)
      await this.persistZnsMessage(tenantId, {
        messageType: 'TEXT',
        recipientId: request.userId,
        content: text,
        zaloMessageId: result.data?.message_id,
        sendStatus: success ? 'SENT' : 'FAILED',
        errorCode: result.error,
        errorMessage: result.message,
        quotaCost: 0,
      });

      return {
        success,
        providerMessageId: result.data?.message_id,
        error: success ? undefined : `${result.error}: ${result.message}`,
        quotaCost: 0,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      this.logger.error(`[${tenantId}] Text send failed: ${err.message}`);
      return {
        success: false,
        error: err.message,
        quotaCost: 0,
        durationMs: Date.now() - start,
      };
    }
  }

  // ── Quota ──────────────────────────────────────────────────────────────

  /** Get current ZNS daily quota usage */
  async getRemainingQuota(tenantId: string): Promise<{
    total: number;
    used: number;
    remaining: number;
    resetAt: string | null;
  }> {
    const record = await this.oauth.getConnectionRecord(tenantId);

    // Try to fetch live quota from Zalo API (cached per-tenant for 5 min)
    const now = Date.now();
    const threshold = 5 * 60 * 1000;
    if (
      record.quotaResetAt &&
      record.lastVerifiedAt &&
      record.lastVerifiedAt.getTime() + threshold > now
    ) {
      // Use cached values
      return {
        total: record.dailyQuotaTotal,
        used: record.dailyQuotaUsed,
        remaining: Math.max(0, record.dailyQuotaTotal - record.dailyQuotaUsed),
        resetAt: record.quotaResetAt?.toISOString() ?? null,
      };
    }

    // Fetch fresh from API
    try {
      const accessToken = await this.oauth.getAccessToken(tenantId);
      const res = await fetch(ZALO_ENDPOINTS.GET_QUOTA, {
        method: 'GET',
        headers: { access_token: accessToken },
        signal: AbortSignal.timeout(ZALO_RATE_LIMITS.TIMEOUT_MS),
      });
      const json: ZaloQuotaInfo = await res.json();

      if (json.error === 0 && json.data) {
        const quotaData = {
          total: json.data.dailyQuota,
          used: json.data.usedQuota,
          remaining: json.data.remainingQuota,
          resetAt: json.data.resetTime,
        };

        // Update DB cache
        await this.prisma.zaloOaConnection.update({
          where: { id: record.id },
          data: {
            dailyQuotaTotal: json.data.dailyQuota,
            dailyQuotaUsed: json.data.usedQuota,
            quotaResetAt: new Date(json.data.resetTime),
            lastVerifiedAt: new Date(),
          },
        });

        return quotaData;
      }
    } catch (err: any) {
      this.logger.warn(`[${tenantId}] Quota fetch failed: ${err.message}`);
    }

    // Fallback to DB values
    return {
      total: record.dailyQuotaTotal,
      used: record.dailyQuotaUsed,
      remaining: Math.max(0, record.dailyQuotaTotal - record.dailyQuotaUsed),
      resetAt: record.quotaResetAt?.toISOString() ?? null,
    };
  }

  // ── OA Info ────────────────────────────────────────────────────────────

  /** Get OA information (name, avatar, package, etc.) */
  async getOaInfo(tenantId: string): Promise<ZaloOaInfo['data'] | null> {
    const accessToken = await this.oauth.getAccessToken(tenantId);
    const res = await fetch(ZALO_ENDPOINTS.GET_OA_INFO, {
      method: 'GET',
      headers: { access_token: accessToken },
      signal: AbortSignal.timeout(ZALO_RATE_LIMITS.TIMEOUT_MS),
    });
    const json: ZaloOaInfo = await res.json();

    if (json.error !== 0) {
      throw new Error(`Zalo OA info failed: ${json.message ?? json.error}`);
    }

    return json.data ?? null;
  }

  // ── Update message status from webhook ──────────────────────────────────

  /** Called by webhook service when delivery/read receipt arrives */
  async updateMessageStatus(
    zaloMessageId: string,
    eventName: string,
    payload: any,
  ): Promise<void> {
    const msg = await this.prisma.zaloSentMessage.findFirst({
      where: { zaloMessageId },
    });
    if (!msg) {
      this.logger.warn(`Zalo message ${zaloMessageId} not found in DB`);
      return;
    }

    const updates: Record<string, any> = {};
    if (eventName === 'message_status') {
      const status = payload.status;
      if (status === 1) updates.sendStatus = 'DELIVERED';
      else if (status === 2) updates.sendStatus = 'READ';
      if (status === 1) updates.deliveredAt = new Date();
      else if (status === 2) updates.readAt = new Date();
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.zaloSentMessage.update({
        where: { id: msg.id },
        data: updates,
      });
    }
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  private validateZnsRequest(request: ZnsSendRequest): void {
    if (!request.userId) {
      throw new BadRequestException('Zalo user_id is required');
    }
    if (!request.templateId) {
      throw new BadRequestException('ZNS template_id is required');
    }
    if (!request.templateData || Object.keys(request.templateData).length === 0) {
      throw new BadRequestException('ZNS template_data is required');
    }
    const paramCount = Object.keys(request.templateData).length;
    if (paramCount > ZALO_RATE_LIMITS.MAX_TEMPLATE_PARAMS) {
      throw new BadRequestException(
        `ZNS template data exceeds ${ZALO_RATE_LIMITS.MAX_TEMPLATE_PARAMS} parameters (got ${paramCount})`,
      );
    }
  }

  /** Check if sending N messages would exceed daily quota */
  private async checkQuotaBeforeSend(
    tenantId: string,
    estimatedCost: number,
  ): Promise<boolean> {
    try {
      const quota = await this.getRemainingQuota(tenantId);
      return quota.remaining >= estimatedCost;
    } catch {
      // If quota cannot be determined, allow the send (fail-open)
      return true;
    }
  }

  /** Simple sliding-window per-second rate limiter */
  private enforceRateLimit(tenantId: string, type: 'text' | 'zns'): void {
    const now = Date.now();
    const windowMs = 1000;
    const maxPerSecond =
      type === 'zns'
        ? ZALO_RATE_LIMITS.ZNS_PER_SECOND
        : ZALO_RATE_LIMITS.TEXT_PER_SECOND;

    let limiter = this.rateLimiter.get(tenantId);
    if (!limiter) {
      limiter = { timestamps: [] };
      this.rateLimiter.set(tenantId, limiter);
    }

    // Remove timestamps outside the window
    limiter.timestamps = limiter.timestamps.filter((t) => now - t < windowMs);

    if (limiter.timestamps.length >= maxPerSecond) {
      throw new BadRequestException(
        `Zalo rate limit exceeded for ${type} messages (max ${maxPerSecond}/s)`,
      );
    }

    limiter.timestamps.push(now);
  }

  /** POST with auto-retry on token expiry (-124) */
  private async fetchWithRetry<T>(
    url: string,
    accessToken: string,
    body: Record<string, any>,
    tenantId: string,
    attempt = 1,
  ): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: accessToken,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ZALO_RATE_LIMITS.TIMEOUT_MS),
    });

    const json: any = await res.json();

    // Auto-refresh token on -124 and retry
    if (
      json.error === ZALO_ERROR_CODES.UNAUTHORIZED &&
      attempt <= ZALO_RATE_LIMITS.MAX_RETRIES
    ) {
      this.logger.warn(`[${tenantId}] Token expired, refreshing (attempt ${attempt})`);
      // Invalidate cache so next getAccessToken refreshes
      const freshToken = await this.oauth.getAccessToken(tenantId);
      return this.fetchWithRetry<T>(url, freshToken, body, tenantId, attempt + 1);
    }

    // Rate limited — exponential backoff
    if (
      json.error === ZALO_ERROR_CODES.RATE_LIMITED &&
      attempt <= ZALO_RATE_LIMITS.MAX_RETRIES
    ) {
      const delay = ZALO_RATE_LIMITS.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      this.logger.warn(`[${tenantId}] Rate limited, retrying in ${delay}ms (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, delay));
      return this.fetchWithRetry<T>(url, accessToken, body, tenantId, attempt + 1);
    }

    return json as T;
  }

  /** Persist a sent message to ZaloSentMessage table */
  private async persistZnsMessage(
    tenantId: string,
    data: {
      messageType: 'ZNS_TEMPLATE' | 'TEXT';
      templateId?: string;
      recipientId: string;
      templateData?: Record<string, any>;
      content?: string;
      zaloMessageId?: string;
      sendStatus: string;
      errorCode?: number;
      errorMessage?: string;
      quotaCost: number;
    },
  ): Promise<void> {
    const record = await this.prisma.zaloOaConnection.findUnique({
      where: { tenantId },
    });
    if (!record) return;

    await this.prisma.zaloSentMessage.create({
      data: {
        connectionId: record.id,
        tenantId,
        messageType: data.messageType as any,
        templateId: data.templateId ?? null,
        recipientId: data.recipientId,
        templateData: data.templateData ?? undefined,
        content: data.content ?? null,
        zaloMessageId: data.zaloMessageId ?? null,
        sendStatus: data.sendStatus as any,
        errorCode: data.errorCode ?? null,
        errorMessage: data.errorMessage ?? null,
        quotaCost: data.quotaCost,
      },
    });
  }
}

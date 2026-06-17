/**
 * PayPal Gateway SDK — Configuration provider + OAuth2 token cache.
 *
 * Centralizes PayPal REST API credentials and endpoints, sourced from
 * environment variables. Boots in an unconfigured state when credentials are
 * absent (so the module can load on environments where PayPal is disabled),
 * and fails fast via `require()` inside payment flows where a missing
 * configuration is a hard error.
 *
 * Unlike VNPay/MoMo (static HMAC secrets), PayPal authenticates each REST call
 * with a short-lived OAuth2 bearer token. This config holds an in-memory token
 * cache `{ accessToken, expiresAt }` so `PayPalService.getAccessToken()` can
 * reuse a still-valid token (with a 60s safety margin) instead of minting a new
 * one on every request. A lightweight refresh lock prevents a concurrent
 * thundering herd of token mints.
 *
 * Specification: https://developer.paypal.com/api/rest/
 */

import { Injectable } from '@nestjs/common';

export type PayPalMode = 'sandbox' | 'live';

export interface PayPalCredentials {
  /** PayPal REST API client ID. */
  clientId: string;
  /** PayPal REST API secret. Never logged. */
  clientSecret: string;
  /** Webhook ID from PayPal Developer Dashboard, used for signature verify. */
  webhookId: string;
  /** API base, e.g. https://api-m.sandbox.paypal.com | https://api-m.paypal.com */
  baseUrl: string;
  /** Default ISO 4217 currency for PayPal transactions (e.g. USD). */
  defaultCurrency: string;
  /** Resolved operating mode. */
  mode: PayPalMode;
}

interface CachedToken {
  accessToken: string;
  expiresAt: Date;
}

const SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';
const LIVE_BASE_URL = 'https://api-m.paypal.com';
/** Refresh the token this many ms before its real expiry (safety margin). */
const TOKEN_SAFETY_MARGIN_MS = 60_000;

@Injectable()
export class PayPalConfig {
  private credentials: PayPalCredentials | null = null;
  private cachedToken: CachedToken | null = null;
  /** In-flight refresh promise; coalesces concurrent token mints. */
  private refreshLock: Promise<string> | null = null;

  onModuleInit(): void {
    this.load();
  }

  /** Load credentials from environment. Safe to call repeatedly. */
  load(): void {
    const clientId = process.env['PAYPAL_CLIENT_ID'];
    const clientSecret = process.env['PAYPAL_CLIENT_SECRET'];

    if (!clientId || !clientSecret) {
      this.credentials = null;
      return;
    }

    const mode: PayPalMode =
      process.env['PAYPAL_MODE'] === 'live' ? 'live' : 'sandbox';

    this.credentials = {
      clientId,
      clientSecret,
      webhookId: process.env['PAYPAL_WEBHOOK_ID'] || '',
      baseUrl: mode === 'live' ? LIVE_BASE_URL : SANDBOX_BASE_URL,
      defaultCurrency: process.env['PAYPAL_CURRENCY'] || 'USD',
      mode,
    };
  }

  /** True when valid credentials are present. */
  get isConfigured(): boolean {
    return this.credentials !== null;
  }

  /**
   * Resolve credentials or throw. Use inside payment flows where a missing
   * configuration is a hard error rather than a silently skipped feature.
   */
  require(): PayPalCredentials {
    if (!this.credentials) {
      throw new Error(
        'PayPal gateway not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.',
      );
    }
    return this.credentials;
  }

  /** Non-throwing accessor; returns null when unconfigured. */
  tryGet(): PayPalCredentials | null {
    return this.credentials;
  }

  /** Base64 `client_id:secret` for the OAuth2 Basic Authorization header. */
  basicAuthHeader(): string {
    const creds = this.require();
    return Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString(
      'base64',
    );
  }

  // ── OAuth2 token cache ────────────────────────────────────────────────────

  /**
   * Return the cached token when it is still valid (with safety margin),
   * otherwise null so the caller mints a fresh one.
   */
  getCachedToken(): string | null {
    if (!this.cachedToken) return null;
    const stillValid =
      this.cachedToken.expiresAt.getTime() - TOKEN_SAFETY_MARGIN_MS > Date.now();
    return stillValid ? this.cachedToken.accessToken : null;
  }

  /**
   * Store a freshly minted token. `expiresInSeconds` is PayPal's `expires_in`.
   */
  setCachedToken(accessToken: string, expiresInSeconds: number): void {
    this.cachedToken = {
      accessToken,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  /** Drop the cached token (e.g. after a 401) so the next call re-mints. */
  clearCachedToken(): void {
    this.cachedToken = null;
  }

  /** Accessor for the concurrent-refresh coalescing lock. */
  getRefreshLock(): Promise<string> | null {
    return this.refreshLock;
  }

  setRefreshLock(lock: Promise<string> | null): void {
    this.refreshLock = lock;
  }
}

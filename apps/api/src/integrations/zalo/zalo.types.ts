// ── Token / OAuth ───────────────────────────────────────────────────────
export interface ZaloTokenInfo {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  oaId: string;
}

export interface ZaloTokenRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
}

export interface ZaloOaConnectionRecord {
  id: string;
  tenantId: string;
  oaId: string;
  appId: string;
  status: string;
  dailyQuotaTotal: number;
  dailyQuotaUsed: number;
  quotaResetAt: Date | null;
}

// ── ZNS Template Message ────────────────────────────────────────────────
export interface ZnsTemplateData {
  /** Value object mapped to ZNS template parameter keys */
  [key: string]: string | number;
}

export interface ZnsSendRequest {
  /** Zalo user ID (user_id from OA follower list) */
  userId: string;
  /** ZNS template ID registered on Zalo OA portal (e.g. "189282") */
  templateId: string;
  /** Template data — keys must match ZNS template parameters */
  templateData: ZnsTemplateData;
  /** Optional tracking id for idempotency (prevent duplicate send) */
  trackingId?: string;
  /** Phone country code (default: 84 for Vietnam) */
  phoneCountryCode?: string;
  /** Template language (default: 'VI') */
  language?: 'VI' | 'EN';
}

export interface ZnsSendResponse {
  error: number;
  message: string;
  data?: {
    message_id: string;
    /** Estimated quota units consumed for this send */
    quota_estimated?: number;
  };
}

// ── Text Message (legacy CS endpoint) ───────────────────────────────────
export interface ZaloTextSendRequest {
  userId: string;
  text: string;
  trackingId?: string;
}

export interface ZaloTextSendResponse {
  error: number;
  message: string;
  data?: {
    message_id: string;
  };
}

// ── Quota ───────────────────────────────────────────────────────────────
export interface ZaloQuotaInfo {
  error: number;
  data?: {
    /** Total daily quota */
    dailyQuota: number;
    /** Used quota today */
    usedQuota: number;
    /** Remaining quota today */
    remainingQuota: number;
    /** Quota reset time (ISO string) */
    resetTime: string;
  };
}

// ── OA Info ─────────────────────────────────────────────────────────────
export interface ZaloOaInfo {
  error: number;
  message?: string;
  data?: {
    oa_id: string;
    name: string;
    avatar: string;
    description: string;
    cover: string;
    package_name: string;
    package_quota: number;
    verified: boolean;
    follow_o_a: number;
  };
}

// ── Webhook Events ──────────────────────────────────────────────────────
export type ZaloWebhookEventType =
  | 'user_send_text'
  | 'user_send_image'
  | 'user_send_file'
  | 'user_send_location'
  | 'user_send_sticker'
  | 'user_send_link'
  | 'follow'
  | 'unfollow'
  | 'message_status'
  | 'oa_send_text'
  | 'oa_send_zns'
  | 'oa_send_image'
  | 'oa_send_file'
  | 'oa_send_list';

export interface ZaloWebhookSender {
  id: string;
}

export interface ZaloWebhookRecipient {
  id: string;
}

export interface ZaloWebhookMessage {
  msg_id: string;
  text?: string;
  attachments?: Array<{ type: string; payload: Record<string, any> }>;
}

export interface ZaloWebhookPayload {
  app_id: string;
  sender: ZaloWebhookSender;
  recipient: ZaloWebhookRecipient;
  event_name: ZaloWebhookEventType;
  message?: ZaloWebhookMessage;
  timestamp: number;
  /** Only present on message_status events */
  status?: number;
}

// ── Service Result ──────────────────────────────────────────────────────
export interface ZaloDeliveryResult {
  success: boolean;
  providerMessageId?: string;
  statusCode?: number;
  error?: string;
  quotaCost: number;
  durationMs: number;
}

// ── Connect / Disconnect Input ──────────────────────────────────────────
export interface ZaloConnectInput {
  oaId: string;
  appId: string;
  secretKey: string;
  refreshToken: string;
  webhookUrl?: string;
}

export interface ZaloConnectionStatus {
  connected: boolean;
  tenantId: string;
  oaId: string;
  status: string;
  dailyQuotaTotal: number;
  dailyQuotaUsed: number;
  remainingQuota: number;
  quotaResetAt: string | null;
  lastVerifiedAt: string | null;
}

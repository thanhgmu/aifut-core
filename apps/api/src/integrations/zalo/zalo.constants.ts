// ── Zalo OA API Base URLs ────────────────────────────────────────────────
export const ZALO_OAUTH_BASE = 'https://oauth.zaloapp.com/v4/oa';
export const ZALO_OPENAPI_BASE = 'https://openapi.zalo.me/v3.0/oa';
export const ZALO_SOCIAL_BASE = 'https://graph.zalo.me/v2.0';

// ── Endpoints ───────────────────────────────────────────────────────────
export const ZALO_ENDPOINTS = {
  /** OAuth token endpoint (POST) — used for both initial token + refresh */
  ACCESS_TOKEN: `${ZALO_OAUTH_BASE}/access_token`,
  /** OA information */
  GET_OA_INFO: `${ZALO_OPENAPI_BASE}/getoa`,
  /** Send customer support text message */
  SEND_TEXT: `${ZALO_OPENAPI_BASE}/message/cs`,
  /** Send ZNS template message (official notification) */
  SEND_ZNS: `${ZALO_OPENAPI_BASE}/message/template`,
  /** Send file attachment */
  SEND_FILE: `${ZALO_OPENAPI_BASE}/message/file`,
  /** Send image message */
  SEND_IMAGE: `${ZALO_OPENAPI_BASE}/message/image`,
  /** Get daily quota info */
  GET_QUOTA: `${ZALO_OPENAPI_BASE}/quota`,
  /** Setup/manage webhook */
  WEBHOOK_SETUP: `${ZALO_OPENAPI_BASE}/webhook`,
  /** Get user info by user_id */
  GET_USER_INFO: `${ZALO_OPENAPI_BASE}/userinfo`,
  /** Get follower list */
  GET_FOLLOWERS: `${ZALO_OPENAPI_BASE}/followers`,
} as const;

// ── Rate Limits & Quota ──────────────────────────────────────────────────
export const ZALO_RATE_LIMITS = {
  /** Text messages per second (OA per-app rate) */
  TEXT_PER_SECOND: 5,
  /** Text messages per day (OA free tier) */
  TEXT_PER_DAY: 10000,
  /** ZNS template messages per second */
  ZNS_PER_SECOND: 10,
  /** ZNS template messages per day (free tier default, overridable per OA package) */
  ZNS_PER_DAY: 500,
  /** Maximum text body length in characters */
  MAX_TEXT_LENGTH: 2000,
  /** Maximum ZNS template data fields */
  MAX_TEMPLATE_PARAMS: 10,
  /** HTTP request timeout (ms) */
  TIMEOUT_MS: 10000,
  /** Refresh token N ms before actual expiry */
  TOKEN_REFRESH_MARGIN_MS: 60000,
  /** Max retry attempts on transient failure */
  MAX_RETRIES: 3,
  /** Base delay for exponential backoff (ms) */
  RETRY_BASE_DELAY_MS: 1000,
} as const;

// ── Zalo Error Codes ────────────────────────────────────────────────────
export const ZALO_ERROR_CODES = {
  SUCCESS: 0,
  /** Token expired or invalid — trigger auto-refresh */
  UNAUTHORIZED: -124,
  /** Daily ZNS quota exceeded */
  QUOTA_EXCEEDED: -216,
  /** Rate limited — slow down */
  RATE_LIMITED: 7,
  /** ZNS template ID not found or not registered */
  TEMPLATE_NOT_FOUND: -215,
  /** Recipient hasn't followed OA (cannot send) */
  INVALID_RECIPIENT: -218,
  /** Duplicate message (idempotency key matched) */
  MESSAGE_DUPLICATE: -110,
} as const;

// ── ZNS Template Category Codes ─────────────────────────────────────────
export const ZNS_TEMPLATE_CATEGORIES = {
  ORDER_CONFIRMATION: 'order_confirmation',
  SHIPPING_UPDATE: 'shipping_update',
  DELIVERY_CONFIRMATION: 'delivery_confirmation',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  CART_RECOVERY: 'cart_recovery',
  PAYMENT_CONFIRMATION: 'payment_confirmation',
  MEMBERSHIP_WELCOME: 'membership_welcome',
  CUSTOMER_FEEDBACK: 'customer_feedback',
  SERVICE_REMINDER: 'service_reminder',
  SECURITY_ALERT: 'security_alert',
} as const;

// ── Webhook Event Names ─────────────────────────────────────────────────
export const ZALO_WEBHOOK_EVENTS = [
  'user_send_text',
  'user_send_image',
  'user_send_file',
  'user_send_location',
  'user_send_sticker',
  'user_send_link',
  'follow',
  'unfollow',
  'message_status',
  'oa_send_text',
  'oa_send_zns',
  'oa_send_image',
  'oa_send_file',
  'oa_send_list',
] as const;

// ── Roadmap status for the Zalo capability ──────────────────────────────
export const ZALO_ROADMAP = [
  { id: 'multi-tenant-oa-connection', status: 'done' },
  { id: 'zns-template-send', status: 'done' },
  { id: 'text-message-send', status: 'done' },
  { id: 'token-auto-refresh', status: 'done' },
  { id: 'quota-monitoring', status: 'done' },
  { id: 'webhook-receiver', status: 'done' },
  { id: 'delivery-status-tracking', status: 'done' },
  { id: 'zns-billing-meter', status: 'done' },
  { id: 'health-check', status: 'done' },
  { id: 'zns-template-pack-marketplace', status: 'pending' },
  { id: 'follow-unfollow-automation', status: 'pending' },
  { id: 'zns-analytics-dashboard', status: 'pending' },
  { id: 'rate-limit-adaptive-throttling', status: 'pending' },
  { id: 'inbound-message-ai-reply', status: 'pending' },
] as const;

export type ZaloWebhookEvent = (typeof ZALO_WEBHOOK_EVENTS)[number];

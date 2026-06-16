/**
 * Developer Sandbox — constants, defaults, templates.
 * Isolated environment for testing connectors without production impact.
 */

export const SANDBOX_VERSION = '0.1.0';
export const SANDBOX_DEFAULT_TIMEOUT_MS = 30_000;
export const SANDBOX_MAX_ENV_KEYS = 256;
export const SANDBOX_MAX_RUN_HISTORY = 50;

/** Default environment variables injected into every new sandbox */
export const SANDBOX_DEFAULT_ENV: Record<string, string> = {
  AIFUT_SANDBOX: 'true',
  AIFUT_SANDBOX_VERSION: SANDBOX_VERSION,
  LOG_LEVEL: 'debug',
  NODE_ENV: 'development',
};

/** Predefined environment templates for common connector types */
export const SANDBOX_ENV_TEMPLATES: Record<string, Record<string, string>> = {
  generic_rest: {
    REQUEST_TIMEOUT_MS: '15000',
    MAX_RETRIES: '3',
    RETRY_DELAY_MS: '1000',
    FOLLOW_REDIRECTS: 'true',
  },
  webhook: {
    WEBHOOK_MAX_RETRIES: '3',
    WEBHOOK_RETRY_BASE_MS: '1000',
    WEBHOOK_SIGNATURE_ALGO: 'HMAC-SHA256',
  },
  oauth: {
    OAUTH_TOKEN_URL: 'https://oauth.mock.aifut.local/token',
    OAUTH_AUTH_URL: 'https://oauth.mock.aifut.local/auth',
    OAUTH_SCOPE: 'read write',
  },
  database: {
    DB_CONNECTION_TIMEOUT_MS: '5000',
    DB_MAX_POOL_SIZE: '5',
    DB_SSL: 'false',
  },
};

/** Action types a sandbox can simulate */
export const SANDBOX_SUPPORTED_ACTIONS = ['ais.discovery', 'ais.action.invoke', 'ais.trigger.poll', 'ais.health.check'] as const;

export type SandboxActionKind = (typeof SANDBOX_SUPPORTED_ACTIONS)[number];

/** Error codes scoped to sandbox operations */
export const SANDBOX_ERRORS = {
  NOT_FOUND: 'SANDBOX_NOT_FOUND',
  EXPIRED: 'SANDBOX_EXPIRED',
  ENV_LIMIT: 'SANDBOX_ENV_LIMIT_EXCEEDED',
  UNSUPPORTED_ACTION: 'SANDBOX_UNSUPPORTED_ACTION',
  EXECUTION_FAILED: 'SANDBOX_EXECUTION_FAILED',
  INVALID_INPUT: 'SANDBOX_INVALID_INPUT',
} as const;

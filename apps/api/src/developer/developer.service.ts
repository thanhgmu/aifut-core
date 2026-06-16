import { Injectable } from '@nestjs/common';
import { AIS_SPEC, DEV_PORTAL_ROADMAP, CERTIFICATION_CHECKLIST } from './developer.constants';

export interface ApiEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
  params?: Record<string, string>;
  auth: boolean;
  phase: string;
}

@Injectable()
export class DeveloperService {
  /**
   * Get the AIFUT Integration Standard (AIS) spec.
   */
  getAisSpec() {
    return AIS_SPEC;
  }

  /**
   * Get the developer portal roadmap.
   */
  getRoadmap() {
    return { capability: 'developer', roadmap: DEV_PORTAL_ROADMAP };
  }

  /**
   * Get the connector certification checklist.
   */
  getCertification() {
    return { standard: 'AIS', version: '0.1.0-draft', checklist: CERTIFICATION_CHECKLIST };
  }

  /**
   * Get SDK information.
   */
  getSdks() {
    return {
      sdks: [
        {
          language: 'Node.js / TypeScript',
          status: 'available' as const,
          eta: 'Now',
          description: 'AIS-compliant connector SDK for Node.js with type definitions, FastAPI server, workflow integration.',
          packageName: '@aifut/connector-sdk',
          docsUrl: '/foundation/developer',
        },
        {
          language: 'Python',
          status: 'available' as const,
          eta: 'Now',
          description: 'Python SDK for building AIS-compliant connectors with FastAPI server support.',
          packageName: 'aifut-connector-sdk',
          docsUrl: '/foundation/developer',
        },
        {
          language: 'REST API',
          status: 'available' as const,
          eta: null,
          description: 'HTTP API with 39+ endpoints for full platform control.',
          packageName: null,
          docsUrl: '/developer',
        },
      ],
      sandbox: {
        available: true,
        eta: 'Now',
        description: 'Isolated development environment for testing connectors without affecting production.',
        endpoints: [
          'POST /api/sandbox — Create sandbox',
          'GET /api/sandbox — List sandboxes',
          'GET /api/sandbox/:id — Get sandbox',
          'GET /api/sandbox/:id/env — Get sandbox env',
          'PUT /api/sandbox/:id/env — Set sandbox env',
          'POST /api/sandbox/:id/execute — Execute connector in sandbox',
          'GET /api/sandbox/:id/traces — List run traces',
          'GET /api/sandbox/:id/traces/:runId — Get run trace',
          'DELETE /api/sandbox/:id — Delete sandbox',
        ],
      },
    };
  }

  /**
   * Get webhook & event documentation.
   */
  getWebhookDocs() {
    return {
      standard: 'AIFUT Webhook v1',
      baseUrl: 'https://api.aifut.app/webhooks',
      features: [
        'HMAC-SHA256 payload signing',
        'Exponential backoff retry (1s, 2s, 4s, 8s, 16s, max 3)',
        'Event deduplication via event_id',
        'Batch delivery (concurrency: 5)',
        'Delivery logging with status tracking',
      ],
      events: [
        { type: 'workflow.completed', description: 'A workflow execution completed successfully' },
        { type: 'workflow.failed', description: 'A workflow execution failed' },
        { type: 'connector.error', description: 'A connector reported an error' },
        { type: 'billing.limit_reached', description: 'Tenant reached a billing limit' },
        { type: 'backup.completed', description: 'A backup job completed' },
        { type: 'subscription.changed', description: 'Subscription plan changed' },
      ],
      payloadFormat: {
        event_id: 'uuid',
        event_type: 'string',
        occurred_at: 'ISO-8601 timestamp',
        tenant_id: 'string (optional)',
        data: 'object',
      },
    };
  }

  getApiDocs(): ApiEndpoint[] {
    return [
      // ── Auth ─────────────────────────────────────────────────────────────────
      { path: '/auth/register', method: 'POST', description: 'Register new user + tenant', auth: false, phase: '1' },
      { path: '/auth/login', method: 'POST', description: 'Login with email/password → JWT', auth: false, phase: '1' },
      { path: '/auth/me', method: 'GET', description: 'Current user profile + tenant', auth: true, phase: '1' },
      { path: '/auth/context', method: 'GET', description: 'Resolve actor context', auth: true, phase: '1' },
      { path: '/auth/capabilities', method: 'GET', description: 'Auth module capabilities', auth: false, phase: '1' },

      // ── Tenancy ──────────────────────────────────────────────────────────────
      { path: '/tenancy/current', method: 'GET', description: 'Current tenant info', auth: true, phase: '1' },
      { path: '/tenancy/workspaces', method: 'GET', description: 'List workspaces of user', auth: true, phase: '1' },
      { path: '/tenancy/summary', method: 'GET', description: 'Platform summary (admin)', auth: true, phase: '1' },

      // ── Workflows ────────────────────────────────────────────────────────────
      { path: '/workflows/templates', method: 'POST', description: 'Create workflow template', auth: true, phase: '1' },
      { path: '/workflows/templates', method: 'GET', description: 'List workflow templates', auth: true, phase: '1' },
      { path: '/workflows/templates/:key', method: 'GET', description: 'Get workflow template', auth: true, phase: '1' },
      { path: '/workflows/templates/:key', method: 'PUT', description: 'Update workflow template', auth: true, phase: '1' },
      { path: '/workflows/templates/:key/execute', method: 'POST', description: 'Execute workflow', auth: true, phase: '1' },
      { path: '/workflows/executions', method: 'GET', description: 'List executions', auth: true, phase: '1' },
      { path: '/workflows/executions/:id', method: 'GET', description: 'Get execution detail', auth: true, phase: '1' },

      // ── AWL ──────────────────────────────────────────────────────────────────
      { path: '/workflows/awl/deploy', method: 'POST', description: 'Deploy AWL document → workflow', auth: true, phase: '2' },
      { path: '/workflows/awl/validate', method: 'POST', description: 'Validate AWL document', auth: false, phase: '2' },
      { path: '/workflows/awl/execute', method: 'POST', description: 'Deploy + execute AWL in one call', auth: true, phase: '2' },
      { path: '/workflows/templates/:key/export', method: 'GET', description: 'Export workflow as AWL', auth: true, phase: '2' },

      // ── Notifications ────────────────────────────────────────────────────────
      { path: '/notifications/send', method: 'POST', description: 'Send notification (webhook/email/log)', auth: true, phase: '1' },
      { path: '/notifications/webhook', method: 'POST', description: 'Send webhook notification', auth: true, phase: '1' },

      // ── Connectors ───────────────────────────────────────────────────────────
      { path: '/connectors/registry', method: 'GET', description: 'List registered connectors', auth: false, phase: '1' },
      { path: '/connectors/templates', method: 'GET', description: 'Connector template blueprints', auth: false, phase: '1' },

      // ── Backups ──────────────────────────────────────────────────────────────
      { path: '/backups/schedules', method: 'POST', description: 'Create backup schedule', auth: true, phase: '1' },
      { path: '/backups/schedules', method: 'GET', description: 'List backup schedules', auth: true, phase: '1' },
      { path: '/backups/schedules/:key/execute', method: 'POST', description: 'Execute backup now', auth: true, phase: '1' },
      { path: '/backups/jobs', method: 'GET', description: 'List backup jobs', auth: true, phase: '1' },

      // ── Billing ──────────────────────────────────────────────────────────────
      { path: '/billing/plans', method: 'GET', description: 'List subscription plans (?currency=USD)', auth: false, phase: '1' },
      { path: '/billing/subscribe', method: 'POST', description: 'Subscribe to a plan', auth: true, phase: '1' },
      { path: '/billing/subscription', method: 'GET', description: 'Current subscription', auth: true, phase: '1' },
      { path: '/billing/usage', method: 'POST', description: 'Record usage metric', auth: true, phase: '1' },
      { path: '/billing/usage', method: 'GET', description: 'Get usage history', auth: true, phase: '1' },

      // ── Marketplace ──────────────────────────────────────────────────────────
      { path: '/marketplace/listings', method: 'GET', description: 'Browse marketplace', auth: false, phase: '1' },
      { path: '/marketplace/listings/:key/install', method: 'POST', description: 'Install listing', auth: true, phase: '1' },

      // ── Reseller ─────────────────────────────────────────────────────────────
      { path: '/reseller/register', method: 'POST', description: 'Register as reseller', auth: true, phase: '1' },
      { path: '/reseller/sub-tenants', method: 'POST', description: 'Onboard sub-tenant', auth: true, phase: '1' },
      { path: '/reseller/sub-tenants', method: 'GET', description: 'List sub-tenants', auth: true, phase: '1' },

      // ── Globalization ────────────────────────────────────────────────────────
      { path: '/globalization/locales', method: 'GET', description: 'Supported locales', auth: false, phase: '2' },
      { path: '/globalization/translations/:locale', method: 'GET', description: 'All translations', auth: false, phase: '2' },
    ];
  }

  getApiDocsByPhase(phase: string) {
    return this.getApiDocs().filter((e) => e.phase === phase);
  }

  getStats() {
    const docs = this.getApiDocs();
    return {
      total: docs.length,
      byPhase: {
        phase1: docs.filter((d) => d.phase === '1').length,
        phase2: docs.filter((d) => d.phase === '2').length,
      },
      byMethod: {
        GET: docs.filter((d) => d.method === 'GET').length,
        POST: docs.filter((d) => d.method === 'POST').length,
        PUT: docs.filter((d) => d.method === 'PUT').length,
        DELETE: docs.filter((d) => d.method === 'DELETE').length,
      },
      authRequired: docs.filter((d) => d.auth).length,
      public: docs.filter((d) => !d.auth).length,
    };
  }
}

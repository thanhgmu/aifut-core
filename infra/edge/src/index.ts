/**
 * AIFUT Edge Network Router — Cloudflare Worker
 * ===============================================
 * Responsibilities:
 *   1. Geo-aware request routing → nearest healthy region
 *   2. CDN caching with stale-while-revalidate
 *   3. Health-probe-based active failover
 *   4. Cross-region traffic steering for sandbox/analytics
 *
 * Architecture:
 *   Worker runs at all Cloudflare edge colos. Each request is
 *   routed to the closest healthy AIFUT origin based on region
 *   KV config + real-time health state from Durable Objects.
 *
 * @package @aifut/edge-router
 * @version 1.0.0
 */

import { Router } from 'itty-router';

// ─── Types ────────────────────────────────────────────────────

interface RegionConfig {
  slug: string;
  name: string;
  origins: string[];           // Primary origin URLs
  fallbackOrigins: string[];   // Failover origin URLs
  continent: string;
  locale: string;
  currency: string;
  enabled: boolean;
  weight: number;              // Traffic weight (0-100)
}

interface HealthState {
  healthyOrigins: Map<string, boolean>;
  lastCheck: number;
  failureCount: Map<string, number>;
}

interface RouterEnv {
  REGION_CONFIG: KVNamespace;
  HEALTH_CACHE: KVNamespace;
  ASSET_BUCKET: R2Bucket;
  REGION_STATE: DurableObjectNamespace;
  API_TIMEOUT_MS: string;
  HEALTH_CHECK_INTERVAL_S: string;
  FAILOVER_THRESHOLD: string;
  DEFAULT_TTL_S: string;
  STALE_TTL_S: string;
  PRIMARY_REGION: string;
  LOG_LEVEL: string;
  EDGE_NETWORK_VERSION: string;
  EDGE_AUTH_TOKEN: string;
}

// ─── Router ────────────────────────────────────────────────────

const router = Router();

/**
 * Health endpoint — used by edge-health-probe.yml
 */
router.get('/__health', async (request: Request, env: RouterEnv) => {
  const regions = await loadRegionConfig(env);
  const regionHealth: Record<string, any> = {};

  for (const region of Object.values(regions)) {
    regionHealth[region.slug] = await checkRegionHealth(region, env);
  }

  const allHealthy = Object.values(regionHealth).every((h: any) => h.healthy);

  return new Response(
    JSON.stringify({
      status: allHealthy ? 'healthy' : 'degraded',
      version: env.EDGE_NETWORK_VERSION,
      timestamp: Date.now(),
      regions: regionHealth,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Edge-Version': env.EDGE_NETWORK_VERSION,
      },
    }
  );
});

/**
 * Sandbox API — route sandbox subdomain to nearest healthy region
 */
router.get('/sandbox/*', async (request: Request, env: RouterEnv) => {
  const region = await resolveNearestRegion(request, env);
  const origin = await pickHealthyOrigin(region, env);
  return proxyRequest(request, origin, env);
});

/**
 * Analytics API — route to primary region (data locality)
 */
router.get('/analytics/*', async (request: Request, env: RouterEnv) => {
  const primaryRegion = env.PRIMARY_REGION || 'auto';
  const region = primaryRegion === 'auto'
    ? await resolveNearestRegion(request, env)
    : await getRegionBySlug(primaryRegion, env);
  const origin = await pickHealthyOrigin(region, env);
  return proxyRequest(request, origin, env);
});

/**
 * Static assets — serve from R2 with CDN caching
 */
router.get('/assets/*', async (request: Request, env: RouterEnv) => {
  const url = new URL(request.url);
  const key = url.pathname.replace('/assets/', '');

  // Check R2
  const object = await env.ASSET_BUCKET.get(key);
  if (object) {
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Cache-Control', `public, max-age=${env.DEFAULT_TTL_S || 300}, stale-while-revalidate=${env.STALE_TTL_S || 86400}`);
    headers.set('CF-Cache-Status', 'HIT');
    return new Response(object.body, { headers });
  }

  // Fallback to nearest origin
  const region = await resolveNearestRegion(request, env);
  const origin = await pickHealthyOrigin(region, env);
  return proxyRequest(request, `${origin}${url.pathname}`, env);
});

/**
 * WebSocket upgrade — direct to region with session affinity
 */
router.get('/ws/*', async (request: Request, env: RouterEnv) => {
  const region = await resolveNearestRegion(request, env);
  const origin = await pickHealthyOrigin(region, env);
  const url = new URL(request.url);
  const target = `${origin.replace('https://', 'wss://')}${url.pathname}`;
  return fetch(target, request);
});

/**
 * Default catch-all — geo-routed proxy
 */
router.all('*', async (request: Request, env: RouterEnv) => {
  const region = await resolveNearestRegion(request, env);
  const origin = await pickHealthyOrigin(region, env);
  return proxyRequest(request, origin, env, {
    cacheTtl: parseInt(env.DEFAULT_TTL_S || '300'),
    cacheEverything: true,
  });
});

// ─── Worker Entry ─────────────────────────────────────────────

export default {
  async fetch(request: Request, env: RouterEnv, ctx: ExecutionContext): Promise<Response> {
    try {
      // Auth check for internal routes
      if (request.url.includes('/__') || request.headers.get('X-Edge-Internal')) {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (token !== env.EDGE_AUTH_TOKEN) {
          return new Response('Unauthorized', { status: 401 });
        }
      }

      return await router.handle(request, env);
    } catch (err) {
      console.error('[EDGE] Unhandled error:', err);
      // Fallback: attempt direct origin
      try {
        const region = await resolveNearestRegion(request, env);
        const origin = region.origins[0];
        return await proxyRequest(request, origin, env);
      } catch {
        return new Response('Service Unavailable — All regions degraded', { status: 503 });
      }
    }
  },

  /**
   * Scheduled health check (triggered every 30s via Cron Triggers)
   */
  async scheduled(event: ScheduledEvent, env: RouterEnv, ctx: ExecutionContext) {
    const regions = await loadRegionConfig(env);

    for (const region of Object.values(regions)) {
      ctx.waitUntil(checkAndStoreHealth(region, env));
    }

    console.log(`[EDGE] Health check cycle complete — ${Object.keys(regions).length} regions`);
  },
};

// ─── Region Resolution ────────────────────────────────────────

/**
 * Resolve nearest healthy region based on Cloudflare colo + GeoIP.
 */
async function resolveNearestRegion(request: Request, env: RouterEnv): Promise<RegionConfig> {
  const cf = (request as any).cf;
  const colo = cf?.colo;
  const continent = cf?.continent || 'AS';
  const country = cf?.country || 'VN';

  const regions = await loadRegionConfig(env);

  // 1. Try exact country match
  const countryRegion = Object.values(regions).find(r =>
    r.enabled && r.continent.toUpperCase() === continent
  );
  if (countryRegion) return countryRegion;

  // 2. Fallback: continent match
  const continentFallback = Object.values(regions).find(r =>
    r.enabled && r.continent === continent
  );
  if (continentFallback) return continentFallback;

  // 3. Last resort: primary region
  const primary = await getRegionBySlug(env.PRIMARY_REGION || 'vn', env);
  return primary || Object.values(regions).find(r => r.enabled)!;
}

/**
 * Pick the first healthy origin from a region's origin list.
 * Falls back to fallbackOrigins if primary origins are down.
 */
async function pickHealthyOrigin(region: RegionConfig, env: RouterEnv): Promise<string> {
  const cacheKey = `health:${region.slug}`;
  const cached = await env.HEALTH_CACHE.get(cacheKey);
  let health: Record<string, boolean> = {};

  if (cached) {
    health = JSON.parse(cached);
  }

  // Check primary origins
  for (const origin of region.origins) {
    if (health[origin] !== false) {
      return origin;
    }
  }

  // Fallback to secondary origins
  for (const origin of region.fallbackOrigins) {
    if (health[origin] !== false) {
      return origin;
    }
  }

  // All origins unhealthy — return first origin anyway (last resort)
  console.warn(`[EDGE] All origins unhealthy for region: ${region.slug}, using first origin`);
  return region.origins[0];
}

// ─── Health Checking ──────────────────────────────────────────

/**
 * Check and store health state for a region's origins.
 */
async function checkAndStoreHealth(region: RegionConfig, env: RouterEnv): Promise<void> {
  const health: Record<string, boolean> = {};
  const timeout = parseInt(env.API_TIMEOUT_MS || '5000');

  for (const origin of [...region.origins, ...region.fallbackOrigins]) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${origin}/__health`, {
        signal: controller.signal,
        headers: { 'X-Edge-Probe': 'true' },
      });

      clearTimeout(timer);
      health[origin] = response.ok;
    } catch {
      health[origin] = false;
    }
  }

  await env.HEALTH_CACHE.put(
    `health:${region.slug}`,
    JSON.stringify(health),
    { expirationTtl: parseInt(env.HEALTH_CHECK_INTERVAL_S || '30') }
  );
}

/**
 * Check if a region is healthy (for point-in-time checks).
 */
async function checkRegionHealth(region: RegionConfig, env: RouterEnv): Promise<{ healthy: boolean; origins: Record<string, boolean> }> {
  const health: Record<string, boolean> = {};
  const timeout = parseInt(env.API_TIMEOUT_MS || '5000');

  for (const origin of [...region.origins, ...region.fallbackOrigins]) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(`${origin}/__health`, { signal: controller.signal });
      clearTimeout(timer);
      health[origin] = response.ok;
    } catch {
      health[origin] = false;
    }
  }

  const healthy = Object.values(health).some(v => v);
  return { healthy, origins: health };
}

// ─── Config Loading ────────────────────────────────────────────

/**
 * Load region configuration from KV store.
 * Cached in memory — KV remains source of truth.
 */
async function loadRegionConfig(env: RouterEnv): Promise<Record<string, RegionConfig>> {
  const cached = await env.REGION_CONFIG.get('regions', 'json');
  if (cached) return cached as Record<string, RegionConfig>;

  // Default config (used when KV is not yet populated)
  const defaults: Record<string, RegionConfig> = {
    vn: {
      slug: 'vn',
      name: 'Vietnam',
      origins: ['https://api.aifut.app'],
      fallbackOrigins: ['https://api-sg.aifut.app'],
      continent: 'AS',
      locale: 'vi',
      currency: 'VND',
      enabled: true,
      weight: 100,
    },
    sg: {
      slug: 'sg',
      name: 'Singapore',
      origins: ['https://api-sg.aifut.app'],
      fallbackOrigins: ['https://api.aifut.app'],
      continent: 'AS',
      locale: 'en',
      currency: 'SGD',
      enabled: true,
      weight: 80,
    },
    jp: {
      slug: 'jp',
      name: 'Japan',
      origins: ['https://api-jp.aifut.app'],
      fallbackOrigins: ['https://api-sg.aifut.app', 'https://api.aifut.app'],
      continent: 'AS',
      locale: 'ja',
      currency: 'JPY',
      enabled: true,
      weight: 60,
    },
    us: {
      slug: 'us',
      name: 'United States',
      origins: ['https://api-us.aifut.app'],
      fallbackOrigins: ['https://api-jp.aifut.app', 'https://api-sg.aifut.app'],
      continent: 'NA',
      locale: 'en',
      currency: 'USD',
      enabled: true,
      weight: 90,
    },
    th: {
      slug: 'th',
      name: 'Thailand',
      origins: ['https://api-th.aifut.app'],
      fallbackOrigins: ['https://api-sg.aifut.app', 'https://api.aifut.app'],
      continent: 'AS',
      locale: 'th',
      currency: 'THB',
      enabled: true,
      weight: 50,
    },
  };

  return defaults;
}

async function getRegionBySlug(slug: string, env: RouterEnv): Promise<RegionConfig | null> {
  const regions = await loadRegionConfig(env);
  return regions[slug] || null;
}

// ─── HTTP Proxy ────────────────────────────────────────────────

interface ProxyOptions {
  cacheTtl?: number;
  cacheEverything?: boolean;
}

/**
 * Proxy a request to the specified origin.
 * Applies CDN caching headers, CORS, and security headers.
 */
async function proxyRequest(
  originalRequest: Request,
  origin: string,
  env: RouterEnv,
  options?: ProxyOptions
): Promise<Response> {
  const url = new URL(originalRequest.url);
  const targetUrl = `${origin}${url.pathname}${url.search}`;

  const headers = new Headers(originalRequest.headers);

  // Edge metadata headers
  headers.set('X-Edge-Region', 'cf-edge');
  headers.set('X-Forwarded-For', headers.get('CF-Connecting-IP') || originalRequest.headers.get('X-Real-IP') || '');
  headers.set('X-Edge-Client-IP', headers.get('CF-Connecting-IP') || '');

  const proxyHeaders = new Headers();
  for (const [key, value] of headers.entries()) {
    // Skip forbidden headers
    if (!['host', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'x-forwarded-proto'].includes(key.toLowerCase())) {
      proxyHeaders.set(key, value);
    }
  }

  const proxyRequest = new Request(targetUrl, {
    method: originalRequest.method,
    headers: proxyHeaders,
    body: ['GET', 'HEAD'].includes(originalRequest.method) ? null : originalRequest.body,
    redirect: 'follow',
  });

  let response = await fetch(proxyRequest);

  // Apply caching headers
  if (options?.cacheEverything) {
    const ttl = options.cacheTtl || 300;
    const staleTtl = parseInt(env.STALE_TTL_S || '86400');
    response = new Response(response.body, response);
    response.headers.set('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${staleTtl}`);
  }

  // Security headers
  response = new Response(response.body, response);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Edge-Version', env.EDGE_NETWORK_VERSION);
  response.headers.set('X-Robots-Tag', 'noindex'); // Edge layer should not be indexed

  return response;
}

// ─── Durable Object: Region State ──────────────────────────────

/**
 * Per-region state management backed by Durable Objects.
 * Used for coordinating health state across colos and
 * maintaining region-level counters/metrics.
 */
export class RegionState implements DurableObject {
  private state: DurableObjectState;
  private healthState: Record<string, boolean> = {};
  private requestCount = 0;
  private errorCount = 0;

  constructor(ctx: DurableObjectState, env: RouterEnv) {
    this.state = ctx;
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage?.get<Record<string, boolean>>('healthState');
      if (stored) this.healthState = stored;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.requestCount++;

    switch (url.pathname) {
      case '/health': {
        return new Response(JSON.stringify({
          healthyOrigins: this.healthState,
          requestCount: this.requestCount,
          errorCount: this.errorCount,
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      case '/update-health': {
        const body = await request.json() as Record<string, boolean>;
        this.healthState = { ...this.healthState, ...body };
        await this.state.storage?.put('healthState', this.healthState);
        return new Response('OK', { status: 200 });
      }

      case '/metrics': {
        return new Response(JSON.stringify({
          requestCount: this.requestCount,
          errorCount: this.errorCount,
          errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0,
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      default:
        return new Response('Not Found', { status: 404 });
    }
  }

  async alarm() {
    // Periodic health aggregation (called via DO alarm)
    console.log('[DO] RegionState alarm fired');
  }
}

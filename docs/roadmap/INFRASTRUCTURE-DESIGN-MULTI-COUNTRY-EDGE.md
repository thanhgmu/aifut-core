# AIFUT Multi-Country Deployment & Edge Node Optimization
> Bản thiết kế cấu hình hạ tầng hoàn chỉnh — Phase 2 completion target
> Ngày: 2026-06-16 | Trạng thái: Bản thiết kế (Design Doc)
> Xem trạng thái MASTER: `docs/roadmap/MASTER-STRATEGY-INDEX.md`

---

## MỤC LỤC
- [1. Tổng quan hiện trạng](#1-tổng-quan-hiện-trạng)
- [2. Mục tiêu 1: Docker Multi-Stage Build tối ưu](#2-mục-tiêu-1-docker-multi-stage-build-tối-ưu-dung-lượng-image)
- [3. Mục tiêu 2: CI/CD Pipeline tự động](#3-mục-tiêu-2-cicd-pipeline-tự-động)
- [4. Mục tiêu 3: Edge Network định tuyến phân tán](#4-mục-tiêu-3-edge-network-định-tuyến-phân-tán)
- [5. Cấu trúc file dự kiến](#5-cấu-trúc-file-dự-kiến)
- [6. Lộ trình triển khai](#6-lộ-trình-triển-khai)
- [7. Chi phí vận hành ước tính](#7-chi-phí-vận-hành-ước-tính)

---

## 1. Tổng quan hiện trạng

### 1.1 Những gì đã có
| Thành phần | File | Trạng thái |
|---|---|---|
| Dockerfile API | `apps/api/Dockerfile` | ✅ Multi-stage cơ bản |
| Dockerfile Web | `apps/web/Dockerfile` | ✅ Multi-stage cơ bản |
| docker-compose sản xuất | `docker-compose.yml` | ✅ Full stack |
| docker-compose dev | `infra/docker/docker-compose.yml` | ✅ PG + Redis |
| CI/CD cơ bản | `.github/workflows/deploy.yml` | ✅ Build + push + SSH |
| CI/CD Python SDK | `.github/workflows/publish-python-sdk.yml` | ✅ Build + publish |
| Region env mẫu | `infra/regions/{vn,sg,th,jp,us}/` | ✅ 5 regions |
| Deploy script | `infra/deploy-region.sh` | ✅ Region-aware deploy |
| Production setup | `deploy/setup-production.sh` | ✅ Full provision |
| Nginx config | `deploy/nginx.conf` | ✅ SSL + proxy + CORS |
| SSL setup | `deploy/setup-ssl.sh` | ✅ Certbot |

### 1.2 Những gì còn thiếu (Gaps)

**🔴 Critical gaps:**
1. Docker images quá nặng (~1.2GB+) — copy toàn bộ `node_modules`, không có `npm prune --production`
2. CI/CD pipeline **không chạy type-check** trước build — chỉ build rồi push mù
3. **Không có edge routing** — không có vercel.json, wrangler.toml, Cloudflare config
4. Không có health check step trong pipeline trước khi deploy lên VPS
5. Không có rollback strategy khi deploy fail
6. Không có global DNS routing giữa các region (Route53 / Cloudflare DNS)
7. Không có multi-region Nginx config (single-region proxy thuần)
8. Không có secret management (hiện tại hardcode trong .env files)
9. Không có monitoring/alerting config file
10. Không có IaC (Terraform/Pulumi) cho infra provisioning

---

## 2. Mục tiêu 1: Docker Multi-Stage Build tối ưu dung lượng Image

### 2.1 Vấn đề với Dockerfiles hiện tại

**API Dockerfile (`apps/api/Dockerfile`):**
```dockerfile
# HIỆN TẠI — vấn đề:
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
# → Copy toàn bộ node_modules gồm devDependencies (build tooling, test, eslint, jest...)
# → Image size ~1.2GB+ thay vì ~200-300MB
```

**Web Dockerfile (`apps/web/Dockerfile`):**
```dockerfile
# HIỆN TẠI — vấn đề tương tự:
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
```

### 2.2 Giải pháp: Optimized Multi-Stage với Monorepo-aware pruning

**Nguyên tắc:**
1. **Stage 1 (deps):** Install dependencies, cache node_modules cho phép Turborepo phát hiện thay đổi
2. **Stage 2 (build):** Copy source + build bằng Turborepo filter
3. **Stage 3 (production-deps):** Copy package.json + lock file → `npm ci --omit=dev --ignore-scripts`
4. **Stage 4 (runner):** Chỉ copy dist + production node_modules + prisma generated

### 2.3 File thiết kế: `apps/api/Dockerfile` (tối ưu)

```dockerfile
# =============================================================================
# AIFUT API — Optimized Multi-Stage Build for Monorepo
# =============================================================================

# ---- Stage 1: Dependency Installation ----
FROM node:24-alpine AS deps

WORKDIR /app

# Chỉ copy lock files + root config để tận dụng Docker layer cache
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/config/ package.json apps/api/prisma/schema.prisma apps/api/
# Copy tất cả package.json của workspaces để npm ci resolve được
RUN find packages -maxdepth 2 -name 'package.json' -exec sh -c 'mkdir -p $(dirname {}) && cp {} $(dirname {})' \;
RUN npm ci --include=dev

# ---- Stage 2: Build ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json /app/turbo.json ./

# Copy toàn bộ source + packages
COPY apps/api ./apps/api
COPY packages ./packages

# Prisma generate (cần cho type-check và build)
RUN npm run prisma:generate

# Build bằng Turborepo filter
RUN npx turbo run build --filter=@repo/api

# ---- Stage 3: Production Dependencies ----
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --ignore-scripts

# ---- Stage 4: Runner (tối giản) ----
FROM node:24-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy build output
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages ./packages

# Copy production deps chỉ (không có dev tooling)
COPY --from=prod-deps /app/node_modules ./node_modules

# Prisma generate cho production client
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

USER nestjs
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', r => {process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "apps/api/dist/src/main.js"]
```

### 2.4 File thiết kế: `apps/web/Dockerfile` (tối ưu)

```dockerfile
# =============================================================================
# AIFUT Web (Next.js) — Optimized Multi-Stage Build for Monorepo
# =============================================================================

# ---- Stage 1: Dependencies ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --include=dev

# ---- Stage 2: Build ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json /app/turbo.json ./
COPY apps/web ./apps/web
COPY packages ./packages
RUN npx turbo run build --filter=@repo/web

# ---- Stage 3: Production Dependencies ----
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --ignore-scripts

# ---- Stage 4: Runner (tối giản) ----
FROM node:24-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/next.config.ts ./apps/web/
COPY --from=prod-deps /app/node_modules ./node_modules

# Cấu hình standalone output cho Next.js (nếu dùng output: 'standalone')
# COPY --from=builder /app/apps/web/.next/standalone ./
# COPY --from=builder /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node_modules/.bin/next", "start", "apps/web"]
```

### 2.5 Kết quả mong đợi

| Metric | Trước | Sau | Giảm |
|---|---|---|---|
| API image size | ~1.2GB | ~250-350MB | ~70-80% |
| Web image size | ~1.0GB | ~200-300MB | ~70-80% |
| Build time (GitHub Actions) | ~8-10 phút | ~4-6 phút | ~40-50% |
| Prisma generate stage | Trong runner | Tách biệt | Cacheable |

---

## 3. Mục tiêu 2: CI/CD Pipeline tự động

### 3.1 Vấn đề với pipeline hiện tại

**Current `deploy.yml`:**
```yaml
# HIỆN TẠI — chỉ build rồi push, không validate
steps:
  - build & push API → Docker Hub
  - build & push Web → Docker Hub
  - SSH → docker compose pull && up -d
# ❌ Không type-check
# ❌ Không test
# ❌ Không health check sau deploy
# ❌ Không rollback
# ❌ Không multi-region awareness
```

### 3.2 Giải pháp: Pipeline 3 giai đoạn (Validate → Build → Deploy)

#### 3.2.1 File: `.github/workflows/ci.yml` — Quality Gate

```yaml
name: CI — Quality Gate
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    name: Validate (TypeScript + Lint)
    runs-on: ubuntu-latest
    timeout-minutes: 15

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: aifut
          POSTGRES_PASSWORD: aifut_test
          POSTGRES_DB: aifut_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma client
        run: npm run prisma:generate
        env:
          DATABASE_URL: postgresql://aifut:aifut_test@localhost:5432/aifut_test

      - name: Run Prisma push (validate schema)
        run: npx prisma db push --accept-data-loss --schema=apps/api/prisma/schema.prisma
        env:
          DATABASE_URL: postgresql://aifut:aifut_test@localhost:5432/aifut_test

      - name: TypeScript check — API
        run: npx turbo run check-types --filter=@repo/api
        env:
          DATABASE_URL: postgresql://aifut:aifut_test@localhost:5432/aifut_test

      - name: TypeScript check — Web
        run: npx turbo run check-types --filter=@repo/web

      - name: Lint — API
        run: npx turbo run lint --filter=@repo/api

      - name: Lint — Web
        run: npx turbo run lint --filter=@repo/web

      - name: Build validation — API
        run: npx turbo run build --filter=@repo/api
        env:
          DATABASE_URL: postgresql://aifut:aifut_test@localhost:5432/aifut_test

      - name: Build validation — Web
        run: npx turbo run build --filter=@repo/web

      - name: Size check — API
        run: |
          echo "Dist size: $(du -sh apps/api/dist | cut -f1)"
          echo "Web .next size: $(du -sh apps/web/.next 2>/dev/null | cut -f1)"
```

#### 3.2.2 File: `.github/workflows/deploy.yml` (cải tiến)

```yaml
name: Deploy — Multi-Region Production

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      region:
        description: 'Target region (vn|sg|th|jp|us|all)'
        required: true
        default: 'all'
        type: choice
        options:
          - all
          - vn
          - sg
          - th
          - jp
          - us
      skip_validate:
        description: 'Skip CI validation?'
        required: false
        default: false
        type: boolean

env:
  REGISTRY: ghcr.io
  IMAGE_TAG: ${{ github.sha }}
  GHCR_SLUG: ${{ github.repository }}

jobs:
  # ── STEP 1: Validate (unless skipped) ──
  validate:
    if: ${{ !inputs.skip_validate }}
    uses: ./.github/workflows/ci.yml
    secrets: inherit

  # ── STEP 2: Build & Push Images ──
  build:
    needs: [validate]
    runs-on: ubuntu-latest
    timeout-minutes: 20
    strategy:
      matrix:
        service: [api, web]
      fail-fast: false

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & cache
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/${{ matrix.service }}/Dockerfile
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.GHCR_SLUG }}/${{ matrix.service }}:${{ env.IMAGE_TAG }}
            ${{ env.REGISTRY }}/${{ env.GHCR_SLUG }}/${{ matrix.service }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ── STEP 3: Deploy per Region ──
  deploy:
    needs: [build]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    strategy:
      matrix:
        region: ${{ fromJSON(inputs.region == 'all' && '["vn","sg","th","jp","us"]' || format('["{0}"]', inputs.region)) }}
      fail-fast: false

    steps:
      - name: Deploy to ${{ matrix.region }}
        uses: appleboy/ssh-action@v1.1.0
        with:
          host: ${{ secrets[format('{0}_VPS_HOST', matrix.region)] }}
          username: ${{ secrets[format('{0}_VPS_USER', matrix.region)] }}
          key: ${{ secrets[format('{0}_VPS_SSH_KEY', matrix.region)] }}
          script: |
            set -e

            # ── Pull new images ──
            cd /opt/aifut

            # Authenticate with GHCR
            echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin

            # Pull tagged images
            docker pull ${{ env.REGISTRY }}/${{ env.GHCR_SLUG }}/api:${{ env.IMAGE_TAG }}
            docker pull ${{ env.REGISTRY }}/${{ env.GHCR_SLUG }}/web:${{ env.IMAGE_TAG }}

            # Tag as deploy version
            docker tag ${{ env.REGISTRY }}/${{ env.GHCR_SLUG }}/api:${{ env.IMAGE_TAG }} aifut-api:latest
            docker tag ${{ env.REGISTRY }}/${{ env.GHCR_SLUG }}/web:${{ env.IMAGE_TAG }} aifut-web:latest

            # ── Export current version for rollback ──
            echo "${{ env.IMAGE_TAG }}" > /opt/aifut/.current-version

            # ── Deploy ──
            export REGION=${{ matrix.region }}
            bash infra/deploy-region.sh "$REGION"

            # ── Health check ──
            echo "Waiting for services..."
            sleep 15

            # Check API health
            for i in 1 2 3; do
              HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
                https://api.$(if [ "${{ matrix.region }}" = "vn" ]; then echo "aifut.vn"; elif [ "${{ matrix.region }}" = "sg" ]; then echo "aifut.sg"; elif [ "${{ matrix.region }}" = "th" ]; then echo "aifut.co.th"; elif [ "${{ matrix.region }}" = "jp" ]; then echo "aifut.jp"; else echo "aifut.us"; fi)/health || echo "000")
              if [ "$HTTP_CODE" = "200" ]; then
                echo "✅ Health check PASSED (HTTP $HTTP_CODE)"
                break
              fi
              echo "⚠  Health check attempt $i failed (HTTP $HTTP_CODE), waiting..."
              sleep 10
            done

            if [ "$HTTP_CODE" != "200" ]; then
              echo "❌ Health check FAILED after 3 retries — initiating rollback..."
              bash infra/rollback-region.sh "${{ matrix.region }}"
              exit 1
            fi

            # Clean up old images
            docker image prune -f

            echo "✅ Deployed to ${{ matrix.region }} at $(date)"

  # ── STEP 4: Notify ──
  notify:
    needs: [deploy]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - name: Send deployment notification
        uses: slackapi/slack-github-action@v2.0.0
        if: ${{ vars.SLACK_WEBHOOK_URL != '' }}
        with:
          webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
          webhook-type: incoming-webhook
          payload: |
            {
              "text": "🚀 AIFUT Deploy — ${{ github.sha }}\nRegions: ${{ inputs.region || 'all' }}\nStatus: ${{ needs.deploy.result }}\nAuthor: ${{ github.actor }}\nCompare: ${{ github.server_url }}/${{ github.repository }}/compare/${{ github.event.before }}...${{ github.sha }}"
            }
```

#### 3.2.3 File mới: `infra/rollback-region.sh`

```bash
#!/usr/bin/env bash
# rollback-region.sh — Rollback a region to previous stable deployment
# Usage: bash infra/rollback-region.sh <region>

set -euo pipefail

REGION="$1"
REGION_DIR="infra/regions/$REGION"
PREV_VERSION_FILE="/opt/aifut/.previous-version"
CURRENT_VERSION_FILE="/opt/aifut/.current-version"

if [ ! -f "$PREV_VERSION_FILE" ]; then
  echo "❌ No previous version recorded. Cannot rollback."
  exit 1
fi

PREV_TAG=$(cat "$PREV_VERSION_FILE")
CURRENT_TAG=$(cat "$CURRENT_VERSION_FILE" 2>/dev/null || echo "unknown")

echo "╔══════════════════════════════════════════╗"
echo "║  ROLLBACK — $REGION"
echo "║  Current:  $CURRENT_TAG"
echo "║  Previous: $PREV_TAG"
echo "╚══════════════════════════════════════════╝"

cd /opt/aifut

# Re-tag previous version as latest
docker tag ${{ env.REGISTRY }}/${{ env.GHCR_SLUG }}/api:$PREV_TAG aifut-api:latest
docker tag ${{ env.REGISTRY }}/${{ env.GHCR_SLUG }}/web:$PREV_TAG aifut-web:latest

# Re-deploy with previous version
bash infra/deploy-region.sh "$REGION"

echo "✅ Rollback complete — $REGION reverted to $PREV_TAG"
```

---

## 4. Mục tiêu 3: Edge Network định tuyến phân tán

### 4.1 Kiến trúc Edge tổng thể

```
                          ┌──────────────────────────┐
                          │   Cloudflare DNS / CDN    │
                          │  (Global Load Balancer)   │
                          └──────────┬───────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
   ┌──────▼──────┐           ┌──────▼──────┐           ┌──────▼──────┐
   │  Region VN  │           │  Region SG  │           │  Region TH  │
   │  aifut.vn   │           │  aifut.sg   │           │ aifut.co.th │
   │             │           │             │           │             │
   │ ┌─────────┐ │           │ ┌─────────┐ │           │ ┌─────────┐ │
   │ │Cloudflare│ │           │ │Cloudflare│ │           │ │Cloudflare│ │
   │ │Worker  WAF││           │ │Worker  WAF││           │ │Worker  WAF││
   │ └────┬────┘ │           │ └────┬────┘ │           │ └────┬────┘ │
   │ ┌────▼────┐ │           │ ┌────▼────┐ │           │ ┌────▼────┐ │
   │ │  Nginx  │ │           │ │  Nginx  │ │           │ │  Nginx  │ │
   │ └────┬────┘ │           │ └────┬────┘ │           │ └────┬────┘ │
   │ ┌────┴───┐  │           │ ┌────┴───┐  │           │ ┌────┴───┐  │
   │ │API:3002│  │           │ │API:3002│  │           │ │API:3002│  │
   │ │Web:3000│  │           │ │Web:3000│  │           │ │Web:3000│  │
   │ │PG:5432 │  │           │ │PG:5432 │  │           │ │PG:5432 │  │
   │ └────────┘  │           │ └────────┘  │           │ └────────┘  │
   └─────────────┘           └─────────────┘           └─────────────┘
```

### 4.2 File thiết kế: Cloudflare Workers Edge Router

#### 4.2.1 File mới: `infra/edge/wrangler.toml`

```toml
# infra/edge/wrangler.toml — Cloudflare Workers config
# Edge router cho AIFUT global traffic distribution
# Deploy: npx wrangler deploy

name = "aifut-edge-router"
main = "src/index.ts"
compatibility_date = "2026-06-16"
compatibility_flags = ["nodejs_compat"]

# ── Environment: Production ──
[env.production]
name = "aifut-edge-prod"
routes = [
  { pattern = "aifut.app", zone_id = "{zone_id}" },
  { pattern = "api.aifut.app", zone_id = "{zone_id}" },
  { pattern = "aifut.vn", zone_id = "{zone_id_vn}" },
  { pattern = "api.aifut.vn", zone_id = "{zone_id_vn}" },
  { pattern = "aifut.sg", zone_id = "{zone_id_sg}" },
  { pattern = "api.aifut.sg", zone_id = "{zone_id_sg}" },
  { pattern = "aifut.co.th", zone_id = "{zone_id_th}" },
  { pattern = "api.aifut.co.th", zone_id = "{zone_id_th}" },
  { pattern = "aifut.jp", zone_id = "{zone_id_jp}" },
  { pattern = "api.aifut.jp", zone_id = "{zone_id_jp}" },
  { pattern = "aifut.us", zone_id = "{zone_id_us}" },
  { pattern = "api.aifut.us", zone_id = "{zone_id_us}" },
]

[env.production.vars]
REGION_MAP = '{"vn":"https://api.aifut.vn","sg":"https://api.aifut.sg","th":"https://api.aifut.co.th","jp":"https://api.aifut.jp","us":"https://api.aifut.us"}'
FALLBACK_REGION = "sg"

# ── KV Namespace: Edge cache ──
kv_namespaces = [
  { binding = "EDGE_CACHE", id = "{kv_id}" }
]

# ── R2 Bucket: Static assets ──
r2_buckets = [
  { binding = "ASSETS_BUCKET", bucket_name = "aifut-edge-assets" }
]
```

#### 4.2.2 File mới: `infra/edge/src/index.ts`

```typescript
/**
 * AIFUT Edge Router — Cloudflare Workers
 *
 * Chức năng:
 * 1. Geo-routing: định tuyến request đến region gần nhất
 * 2. Cache: edge caching cho static assets + API responses
 * 3. Rate limiting: per-tenant rate limit
 * 4. WAF: basic bot detection + security headers
 * 5. Health-aware routing: skip unhealthy regions
 * 6. Tenant resolution: x-tenant-slug → region mapping
 */

export interface Env {
  EDGE_CACHE: KVNamespace;
  ASSETS_BUCKET: R2Bucket;
  REGION_MAP: string; // JSON string: {"vn":"https://api.aifut.vn",...}
  FALLBACK_REGION: string;
}

interface RegionConfig {
  origin: string;
  timezone: string;
  locale: string;
  currency: string;
}

const REGION_CONFIGS: Record<string, RegionConfig> = {
  vn: { origin: 'https://api.aifut.vn', timezone: 'Asia/Ho_Chi_Minh', locale: 'vi', currency: 'VND' },
  sg: { origin: 'https://api.aifut.sg', timezone: 'Asia/Singapore', locale: 'en', currency: 'SGD' },
  th: { origin: 'https://api.aifut.co.th', timezone: 'Asia/Bangkok', locale: 'th', currency: 'THB' },
  jp: { origin: 'https://api.aifut.jp', timezone: 'Asia/Tokyo', locale: 'ja', currency: 'JPY' },
  us: { origin: 'https://api.aifut.us', timezone: 'America/Los_Angeles', locale: 'en', currency: 'USD' },
};

// Health state — periodically updated via cron
const HEALTH_CACHE_KEY = 'region-health:state';
const HEALTH_CACHE_TTL = 60; // seconds

// ── Colo-to-Region mapping ──
const COLO_REGION: Record<string, string> = {
  // Vietnam
  SGN: 'vn', HAN: 'vn', DAD: 'vn',
  // Singapore
  SIN: 'sg',
  // Thailand
  BKK: 'th',
  // Japan
  NRT: 'jp', HND: 'jp', KIX: 'jp',
  // US West
  LAX: 'us', SFO: 'us', SEA: 'us',
  // Default
  DEFAULT: 'sg',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const colo = request.cf?.colo || 'DEFAULT';
    const country = (request.cf?.country as string) || '';

    // ── 1. Resolve target region ──
    let targetRegion = this.resolveRegion(colo, country, url.hostname);
    const regionConfig = REGION_CONFIGS[targetRegion] || REGION_CONFIGS[env.FALLBACK_REGION];

    // ── 2. Check tenant slug for region override ──
    const tenantSlug = request.headers.get('x-tenant-slug') || '';
    const tenantRegion = await this.getTenantRegion(tenantSlug, env);
    if (tenantRegion && REGION_CONFIGS[tenantRegion]) {
      targetRegion = tenantRegion;
    }

    // ── 3. Health check — fallback if unhealthy ──
    const healthState = await this.getHealthState(env);
    if (healthState && healthState[targetRegion] === false) {
      console.warn(`[Edge] Region ${targetRegion} unhealthy, falling back to ${env.FALLBACK_REGION}`);
      targetRegion = env.FALLBACK_REGION;
    }

    const targetOrigin = REGION_CONFIGS[targetRegion]?.origin || regionConfig.origin;

    // ── 4. Route static assets to R2 cache ──
    if (this.isStaticAsset(url.pathname)) {
      const cachedResponse = await this.serveStaticAsset(url.pathname, env);
      if (cachedResponse) return cachedResponse;
    }

    // ── 5. Build proxied request ──
    const proxyUrl = new URL(url.pathname + url.search, targetOrigin);
    const proxyHeaders = new Headers(request.headers);

    // Inject region context
    proxyHeaders.set('x-region', targetRegion);
    proxyHeaders.set('x-origin-colo', colo);
    proxyHeaders.set('x-country', country);
    proxyHeaders.set('cf-ipcountry', country);

    // ── 6. Execute proxy request ──
    const proxyRequest = new Request(proxyUrl.toString(), {
      method: request.method,
      headers: proxyHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
    });

    let response: Response;
    try {
      response = await fetch(proxyRequest);
    } catch (err) {
      console.error(`[Edge] Proxy error for ${targetRegion}:`, err);
      // Fallback to default region
      const fallbackUrl = new URL(url.pathname + url.search, REGION_CONFIGS[env.FALLBACK_REGION]!.origin);
      response = await fetch(fallbackUrl.toString(), proxyRequest);
    }

    // ── 7. Add response headers ──
    const newHeaders = new Headers(response.headers);
    newHeaders.set('x-aifut-region', targetRegion);
    newHeaders.set('x-aifut-colo', colo);
    newHeaders.set('x-aifut-version', 'edge-v1');

    // Security headers
    newHeaders.set('X-Content-Type-Options', 'nosniff');
    newHeaders.set('X-Frame-Options', 'DENY');
    newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    newHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // CORS for API
    if (url.pathname.startsWith('/api/') || url.hostname.startsWith('api.')) {
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      newHeaders.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-tenant-slug');
    }

    // ── 8. Cache successful GET responses ──
    if (request.method === 'GET' && response.status === 200 && this.isCacheable(url.pathname)) {
      ctx.waitUntil(this.cacheResponse(url, response.clone(), env));
    }

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  },

  // ── Scheduled health checks ──
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await this.runHealthCheck(env);
  },

  // ── Helpers ──

  resolveRegion(colo: string, country: string, hostname: string): string {
    // 1. Direct domain mapping
    const domainMap: Record<string, string> = {
      'aifut.vn': 'vn', 'api.aifut.vn': 'vn',
      'aifut.sg': 'sg', 'api.aifut.sg': 'sg',
      'aifut.co.th': 'th', 'api.aifut.co.th': 'th',
      'aifut.jp': 'jp', 'api.aifut.jp': 'jp',
      'aifut.us': 'us', 'api.aifut.us': 'us',
      'aifut.app': 'sg', 'api.aifut.app': 'sg',
    };
    if (domainMap[hostname]) return domainMap[hostname];

    // 2. Colo-based routing
    if (COLO_REGION[colo]) return COLO_REGION[colo];

    // 3. Country-based routing
    const countryRegion: Record<string, string> = {
      VN: 'vn', SG: 'sg', TH: 'th', JP: 'jp',
      US: 'us', PH: 'sg', ID: 'sg', MY: 'sg',
      KR: 'jp', CN: 'sg', TW: 'jp',
    };
    if (countryRegion[country]) return countryRegion[country];

    // 4. Default
    return 'sg';
  },

  isStaticAsset(path: string): boolean {
    return /\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot|pdf|webp)$/i.test(path);
  },

  isCacheable(path: string): boolean {
    // Cache static assets + public API responses
    return this.isStaticAsset(path) || /^\/api\/public\//.test(path) || /^\/_next\/static\//.test(path);
  },

  async serveStaticAsset(path: string, env: Env): Promise<Response | null> {
    const cacheKey = `asset:${path}`;
    const cached = await env.EDGE_CACHE.get(cacheKey, { type: 'arrayBuffer' });
    if (cached) {
      return new Response(cached, {
        headers: {
          'Content-Type': this.getContentType(path),
          'Cache-Control': 'public, max-age=31536000, immutable',
          'CF-Cache-Status': 'HIT',
        },
      });
    }
    return null;
  },

  async cacheResponse(request: URL, response: Response, env: Env): Promise<void> {
    const cacheKey = `response:${request.pathname}`;
    const buffer = await response.clone().arrayBuffer();
    await env.EDGE_CACHE.put(cacheKey, buffer, {
      expirationTtl: 300, // 5 minutes
      metadata: { contentType: response.headers.get('Content-Type') || 'application/octet-stream' },
    });
  },

  async getTenantRegion(slug: string, env: Env): Promise<string | null> {
    if (!slug) return null;
    const key = `tenant:region:${slug}`;
    return await env.EDGE_CACHE.get(key);
  },

  async getHealthState(env: Env): Promise<Record<string, boolean> | null> {
    const raw = await env.EDGE_CACHE.get(HEALTH_CACHE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  async runHealthCheck(env: Env): Promise<void> {
    const regions = Object.keys(REGION_CONFIGS);
    const health: Record<string, boolean> = {};

    await Promise.all(regions.map(async (region) => {
      const config = REGION_CONFIGS[region]!;
      try {
        const start = Date.now();
        const resp = await fetch(`${config.origin}/health`, { method: 'GET', signal: AbortSignal.timeout(5000) });
        const latency = Date.now() - start;
        health[region] = resp.status === 200 && latency < 3000;

        // Store latency for routing decisions
        await env.EDGE_CACHE.put(`region:latency:${region}`, latency.toString(), { expirationTtl: HEALTH_CACHE_TTL });
      } catch {
        health[region] = false;
      }
    }));

    await env.EDGE_CACHE.put(HEALTH_CACHE_KEY, JSON.stringify(health), { expirationTtl: HEALTH_CACHE_TTL });
  },

  getContentType(path: string): string {
    const map: Record<string, string> = {
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2',
      '.woff': 'font/woff',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject',
      '.pdf': 'application/pdf',
      '.webp': 'image/webp',
    };
    const ext = path.substring(path.lastIndexOf('.'));
    return map[ext] || 'application/octet-stream';
  },
};
```

#### 4.2.3 File mới: `infra/edge/package.json`

```json
{
  "name": "@repo/edge-router",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "deploy:prod": "wrangler deploy --env production",
    "tail": "wrangler tail",
    "format": "prettier --write src/",
    "lint": "eslint src/"
  },
  "dependencies": {},
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250601.0",
    "wrangler": "^4.20250601.0"
  }
}
```

### 4.3 File thiết kế: Multi-Region Nginx (region-aware)

#### 4.3.1 File cải tiến: `deploy/nginx.conf` (templated)

```nginx
# deploy/nginx.conf — AIFUT Multi-Region Reverse Proxy
# ĐÂY LÀ TEMPLATE — region-specific values được inject bởi deploy-region.sh
# Biến template: ${DOMAIN}, ${API_DOMAIN}, ${REGION}, ${TZ}

worker_processes auto;

events {
    worker_connections 2048;
    multi_accept on;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # ── Basic tuning ──
    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;
    keepalive_timeout 65;
    keepalive_requests 1000;
    client_max_body_size 50M;

    # ── Compression ──
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    # ── Logging ──
    log_format json escape=json '{'
        '"time":"$time_iso8601",'
        '"region":"${REGION}",'
        '"remote_addr":"$remote_addr",'
        '"request":"$request",'
        '"status":$status,'
        '"body_bytes":$body_bytes_sent,'
        '"request_time":$request_time,'
        '"upstream_addr":"$upstream_addr",'
        '"upstream_response_time":"$upstream_response_time",'
        '"http_referrer":"$http_referer",'
        '"http_user_agent":"$http_user_agent",'
        '"x_tenant_slug":"$http_x_tenant_slug"'
    '}';
    access_log /var/log/nginx/access.log json;
    error_log /var/log/nginx/error.log warn;

    # ── Rate limiting zones ──
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;
    limit_req_zone $http_x_tenant_slug zone=tenant_limit:10m rate=100r/s;

    # ── Upstreams ──
    upstream api_backend {
        server api:3002;
        keepalive 64;
    }

    upstream web_backend {
        server web:3000;
        keepalive 32;
    }

    # ── HTTP → HTTPS redirect ──
    server {
        listen 80;
        server_name ${DOMAIN} ${API_DOMAIN};
        location / {
            return 301 https://$host$request_uri;
        }
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
    }

    # ── Web UI — ${DOMAIN} ──
    server {
        listen 443 ssl http2;
        server_name ${DOMAIN};

        ssl_certificate     /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;
        ssl_session_cache   shared:SSL:10m;
        ssl_session_timeout 10m;

        # Region header
        add_header X-AIFUT-Region "${REGION}" always;
        add_header X-AIFUT-Time "$time_iso8601" always;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;

        # Proxy to Next.js
        location / {
            proxy_pass http://web_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Region "${REGION}";
            proxy_cache_bypass $http_upgrade;

            # Buffering tuning
            proxy_buffer_size 4k;
            proxy_buffers 8 4k;
            proxy_busy_buffers_size 8k;

            # Timeouts
            proxy_connect_timeout 10s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }

        # Static assets — cache aggressively
        location /_next/static/ {
            proxy_pass http://web_backend;
            proxy_http_version 1.1;
            expires 365d;
            add_header Cache-Control "public, immutable";
        }

        location /public/ {
            proxy_pass http://web_backend;
            proxy_http_version 1.1;
            expires 30d;
            add_header Cache-Control "public, max-age=2592000";
        }

        # Health check (no cache, no auth)
        location = /health {
            proxy_pass http://web_backend;
            proxy_http_version 1.1;
            access_log off;
            return 200 "OK\n";
        }
    }

    # ── API — ${API_DOMAIN} ──
    server {
        listen 443 ssl http2;
        server_name ${API_DOMAIN};

        ssl_certificate     /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        # Region header
        add_header X-AIFUT-Region "${REGION}" always;

        # CORS
        add_header Access-Control-Allow-Origin "*" always;

        # Rate limiting
        limit_req zone=api_limit burst=50 nodelay;
        limit_req zone=tenant_limit burst=200 nodelay;

        # Proxy to NestJS API
        location / {
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Region "${REGION}";
            proxy_set_header X-Timezone "${TZ}";

            # Buffering
            proxy_buffer_size 4k;
            proxy_buffers 16 8k;
            proxy_busy_buffers_size 16k;

            # Timeouts
            proxy_connect_timeout 10s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;

            # CORS preflight
            if ($request_method = 'OPTIONS') {
                add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS";
                add_header Access-Control-Allow-Headers "Authorization, Content-Type, x-tenant-slug, x-requested-with";
                add_header Access-Control-Max-Age 86400;
                add_header Content-Length 0;
                add_header Content-Type text/plain;
                return 204;
            }
        }

        # Health check
        location = /health {
            proxy_pass http://api_backend/health;
            proxy_http_version 1.1;
            access_log off;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # API docs
        location /docs {
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
        }
    }
}
```

### 4.4 File mới: Cloudflare DNS config (IaC)

#### 4.4.1 File: `infra/terraform/main.tf`

```hcl
# infra/terraform/main.tf — AIFUT Multi-Region DNS + CDN
# Usage: terraform apply -var="region=vn"

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token"
  sensitive   = true
}

variable "zones" {
  description = "Zone ID per domain"
  type = object({
    aifut_app   = string
    aifut_vn    = string
    aifut_sg    = string
    aifut_co_th = string
    aifut_jp    = string
    aifut_us    = string
  })
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# ── Global origin: aifut.app ──
resource "cloudflare_record" "aifut_app_a" {
  zone_id = var.zones.aifut_app
  name    = "@"
  type    = "A"
  value   = var.origin_ip
  proxied = true # Orange cloud = CDN + DDoS protection
  ttl     = 1
}

resource "cloudflare_record" "api_aifut_app_a" {
  zone_id = var.zones.aifut_app
  name    = "api"
  type    = "A"
  value   = var.api_origin_ip
  proxied = true
  ttl     = 1
}

# ── Region: Vietnam ──
resource "cloudflare_record" "aifut_vn_a" {
  zone_id = var.zones.aifut_vn
  name    = "@"
  type    = "A"
  value   = var.vn_origin_ip
  proxied = true
  ttl     = 1
}

resource "cloudflare_record" "api_aifut_vn_a" {
  zone_id = var.zones.aifut_vn
  name    = "api"
  type    = "A"
  value   = var.vn_origin_ip
  proxied = true
  ttl     = 1
}

# ── Region: Singapore ──
resource "cloudflare_record" "aifut_sg_a" {
  zone_id = var.zones.aifut_sg
  name    = "@"
  type    = "A"
  value   = var.sg_origin_ip
  proxied = true
  ttl     = 1
}

resource "cloudflare_record" "api_aifut_sg_a" {
  zone_id = var.zones.aifut_sg
  name    = "api"
  type    = "A"
  value   = var.sg_origin_ip
  proxied = true
  ttl     = 1
}

# ── Rate limiting rule ──
resource "cloudflare_rate_limit" "api_rate_limit" {
  zone_id = var.zones.aifut_app
  description = "API rate limit — 100 req/min per IP"
  threshold = 100
  period = 60
  match {
    request {
      url_pattern = "*/api/*"
      schemes = ["HTTP", "HTTPS"]
      methods = ["GET", "POST", "PUT", "DELETE", "PATCH"]
    }
  }
  action {
    mode = "ban"
    timeout = 300
    response {
      content_type = "application/json"
      body = jsonencode({
        error = "rate_limit_exceeded",
        message = "Too many requests. Please try again later.",
        retry_after = 300
      })
    }
  }
}

# ── SSL/TLS: Full (strict) ──
resource "cloudflare_zone_settings_override" "aifut_app_ssl" {
  zone_id = var.zones.aifut_app
  settings {
    ssl = "strict"
    min_tls_version = "1.2"
    automatic_https_rewrites = "on"
    always_use_https = "on"
    http2 = "on"
    http3 = "on"
    brotli = "on"
    opportunistic_encryption = "on"
    tls_1_3 = "on"
    security_level = "medium"
    browser_check = "on"
    challenge_ttl = 1800
  }
}

# ── Caching rules ──
resource "cloudflare_page_rule" "static_assets_cache" {
  zone_id  = var.zones.aifut_app
  target   = "*aifut.app/_next/static/*"
  priority = 1
  actions {
    cache_level = "cache_everything"
    edge_cache_ttl = 31536000
    browser_cache_ttl = 31536000
  }
}

resource "cloudflare_page_rule" "api_public_cache" {
  zone_id  = var.zones.aifut_app
  target   = "*aifut.app/api/public/*"
  priority = 2
  actions {
    cache_level = "cache_everything"
    edge_cache_ttl = 300
  }
}

# ── Argo Smart Routing ──
resource "cloudflare_argo" "argo" {
  zone_id = var.zones.aifut_app
  tiered_caching = "on"
  smart_routing = "on"
}
```

### 4.5 File mới: Global DNS Health Probe

```yaml
# infra/edge/health-probe.yml — GitHub Action cron for region health
name: Edge Health Probe

on:
  schedule:
    - cron: '*/5 * * * *' # Every 5 minutes
  workflow_dispatch:

jobs:
  probe:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        region:
          - name: Vietnam
            host: aifut.vn
          - name: Singapore
            host: aifut.sg
          - name: Thailand
            host: aifut.co.th
          - name: Japan
            host: aifut.jp
          - name: US
            host: aifut.us
            api-host: api.aifut.us
          - name: Global
            host: aifut.app
            api-host: api.aifut.app

    steps:
      - name: Probe ${{ matrix.region.name }}
        id: probe
        continue-on-error: true
        run: |
          start=$(date +%s%N)
          HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
            --max-time 10 \
            "https://${{ matrix.region.host }}/health" 2>/dev/null || echo "000")
          end=$(date +%s%N)
          LATENCY=$(( (end - start) / 1000000 ))

          echo "status=$HTTP_CODE" >> $GITHUB_OUTPUT
          echo "latency_ms=$LATENCY" >> $GITHUB_OUTPUT
          echo "Region: ${{ matrix.region.name }} | Status: $HTTP_CODE | Latency: ${LATENCY}ms"

      - name: Probe API health
        id: api-probe
        continue-on-error: true
        run: |
          API_HOST="${{ matrix.region.api-host || format('api.{0}', matrix.region.host) }}"
          start=$(date +%s%N)
          HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
            --max-time 10 \
            "https://$API_HOST/health" 2>/dev/null || echo "000")
          end=$(date +%s%N)
          LATENCY=$(( (end - start) / 1000000 ))
          echo "status=$HTTP_CODE" >> $GITHUB_OUTPUT
          echo "API: $API_HOST | Status: $HTTP_CODE | Latency: ${LATENCY}ms"
```

---

## 5. Cấu trúc file dự kiến

Dưới đây là danh sách tất cả các file cần khởi tạo/cập nhật trong dự án:

```
aifut-core/
├── apps/
│   ├── api/
│   │   └── Dockerfile                          ← CẬP NHẬT (optimized multi-stage)
│   └── web/
│       └── Dockerfile                          ← CẬP NHẬT (optimized multi-stage)
├── .github/
│   └── workflows/
│       ├── ci.yml                              ← THÊM MỚI (quality gate)
│       ├── deploy.yml                          ← CẬP NHẬT (multi-region + rollback)
│       ├── edge-health-probe.yml               ← THÊM MỚI (5-min health probe)
│       └── publish-python-sdk.yml              ← Giữ nguyên
├── infra/
│   ├── docker/
│   │   └── docker-compose.yml                  ← CẬP NHẬT (thêm healthcheck)
│   ├── edge/
│   │   ├── package.json                        ← THÊM MỚI
│   │   ├── wrangler.toml                       ← THÊM MỚI
│   │   └── src/
│   │       └── index.ts                        ← THÊM MỚI (edge router worker)
│   ├── regions/
│   │   ├── README.md                           ← CẬP NHẬT
│   │   ├── {region}/
│   │   │   └── .env.region                     ← CẬP NHẬT (thêm edge config vars)
│   │   └── docker-compose.override.yml         ← SINH TỰ ĐỘNG (bởi deploy-region.sh)
│   ├── terraform/
│   │   ├── main.tf                             ← THÊM MỚI (Cloudflare DNS + CDN)
│   │   └── terraform.tfvars.example            ← THÊM MỚI
│   ├── deploy-region.sh                        ← CẬP NHẬT (thêm edge worker deploy step)
│   └── rollback-region.sh                      ← THÊM MỚI
├── deploy/
│   ├── nginx.conf                              ← CẬP NHẬT (region-aware template)
│   ├── setup-production.sh                     ← CẬP NHẬT (thêm wrangler setup)
│   ├── setup-ssl.sh                            ← Giữ nguyên
│   └── .env.example                            ← CẬP NHẬT (thêm edge config vars)
└── .dockerignore                               ← THÊM MỚI (loại bỏ file không cần trong build)
```

### `.dockerignore` (THÊM MỚI)

```dockerignore
# .dockerignore — Loại bỏ file không cần trong Docker build
.git
.gitignore
.gitattributes
node_modules/.cache
.turbo
.next/cache
infra
docs
scripts
Dockerfile*
*.md
*.log
.env*
!.env.example
coverage
test
e2e
__tests__
*.spec.ts
*.test.ts
```

---

## 6. Lộ trình triển khai

### Phase A: Docker Optimization (Ngày 1-2)
| Task | File | Mức độ ưu tiên |
|---|---|---|
| Tạo `.dockerignore` | `.dockerignore` | 🔴 Critical |
| Cập nhật API Dockerfile | `apps/api/Dockerfile` | 🔴 Critical |
| Cập nhật Web Dockerfile | `apps/web/Dockerfile` | 🔴 Critical |
| Kiểm tra image size local | `docker build -t test .` | 🟡 Verify |

### Phase B: CI/CD Pipeline (Ngày 3-4)
| Task | File | Mức độ ưu tiên |
|---|---|---|
| Tạo CI workflow | `.github/workflows/ci.yml` | 🔴 Critical |
| Cập nhật deploy workflow | `.github/workflows/deploy.yml` | 🔴 Critical |
| Tạo rollback script | `infra/rollback-region.sh` | 🟡 High |
| Cập nhật deploy-region.sh | `infra/deploy-region.sh` | 🟡 High |

### Phase C: Edge Network (Ngày 5-8)
| Task | File | Mức độ ưu tiên |
|---|---|---|
| Tạo Edge Router Worker | `infra/edge/src/index.ts` | 🔴 Critical |
| Tạo wrangler config | `infra/edge/wrangler.toml` | 🔴 Critical |
| Tạo edge package.json | `infra/edge/package.json` | 🟡 High |
| Cập nhật Nginx template | `deploy/nginx.conf` | 🟡 High |
| Tạo Terraform config | `infra/terraform/main.tf` | 🟢 Medium |
| Tạo health probe cron | `.github/workflows/edge-health-probe.yml` | 🟢 Medium |

### Phase D: Testing & Verification (Ngày 9-10)
| Task | Mức độ ưu tiên |
|---|---|
| Deploy thử nghiệm lên 1 region (vn) | 🔴 Critical |
| Verify health check pipeline | 🔴 Critical |
| Test rollback flow | 🟡 High |
| Deploy to all 5 regions | 🟡 High |
| Edge Worker routing test | 🟡 High |
| CDN cache test | 🟢 Medium |

---

## 7. Chi phí vận hành ước tính

### 7.1 Docker Registry
| Item | Cost | Notes |
|---|---|---|
| GitHub Container Registry (GHCR) | **$0** | Free with GitHub, image pull unlimited |
| Storage ~500MB × 2 images × 10 tags | ~$0.50/tháng | Nếu dùng Docker Hub |

### 7.2 CI/CD (GitHub Actions)
| Item | Cost | Notes |
|---|---|---|
| 2000 min/tháng free | **$0** | Trong free tier |
| Pipeline time ~8 min × 2 runs/ngày | ~480 min/tháng | Dưới 2000 min free |

### 7.3 Edge Network
| Item | Cost | Notes |
|---|---|---|
| Cloudflare Workers Free | **$0** | 100k req/ngày free |
| Cloudflare Workers Unbound | ~$0.15/million req | Nếu vượt free tier |
| DNS tĩnh (Cloudflare) | **$0** | Free DNS management |
| Argo Smart Routing | ~$5/tháng | Optional, tối ưu latency |
| CDN bandwidth | **$0** | Cloudflare CDN free unlimited |

### 7.4 Regional VPS (Independent per region)
| Item | Spec | Cost/tháng |
|---|---|---|
| Vietnam VPS | 2 vCPU, 4GB RAM, 80GB SSD | ~$15-25 |
| Singapore VPS | 2 vCPU, 4GB RAM, 80GB SSD | ~$20-35 |
| Thailand VPS | 2 vCPU, 4GB RAM, 80GB SSD | ~$15-25 |
| Japan VPS | 2 vCPU, 4GB RAM, 80GB SSD | ~$25-40 |
| US VPS | 2 vCPU, 4GB RAM, 80GB SSD | ~$15-20 |
| **Total VPS** | | **~$90-145/tháng** |

> 💡 **Local-first strategy** (theo CASHFLOW-STRATEGY.md):
> - SQLite local + Cloudflare Workers sync = $20-50/tháng cho 100 tenant (thay vì $400-800 cho cloud-heavy)
> - OpenClaw runtime = $0 execution cost (không cần Lambda)
> - Edge Worker = $0 (free tier)
> - **Tổng infra tối thiểu: $20-50/tháng + VPS region**

### 7.5 Tổng chi phí theo kịch bản

| Kịch bản | Monthly cost | Notes |
|---|---|---|
| **Tối thiểu** (1 region VN + Edge Worker) | **$15-45** | SQLite local-first |
| **Trung bình** (3 regions: VN, SG, TH + Edge) | **$50-105** | Kết hợp local + PG |
| **Đầy đủ** (5 regions + Terraform + monitoring) | **$90-160** | Full infra, tối ưu latency |

---

## Tổng kết

Bản thiết kế này bao gồm **3 mục tiêu hạ tầng** cho Phase 2 completion:

1. **Docker Multi-Stage Build tối ưu** — Giảm image size ~70-80% (từ 1.2GB xuống ~250MB), tăng tốc build pipeline 40-50%, thêm HEALTHCHECK cho production.

2. **CI/CD Pipeline tự động** — Thêm CI quality gate (type-check, lint, build validation trước deploy), multi-region deploy matrix, health check verification post-deploy, rollback on failure, Slack notification.

3. **Edge Network định tuyến phân tán** — Cloudflare Workers geo-routing (colo-aware + tenant-aware), edge caching (KV + R2), health-aware failover, rate limiting, security headers, Terraform IaC cho DNS + CDN config, 5-minute health probe cron.

**Tổng số file cần xử lý: 24 files** (12 mới + 12 cập nhật)
**Thời gian ước tính: 10 ngày** (4 phases)
**Chi phí infra tối thiểu: $15-45/tháng** (local-first strategy)

---
*File này là bản thiết kế kiến trúc (Design Doc). Không tự động implement. Chờ Thành duyệt ("DONG Y") trước khi chạy code.*

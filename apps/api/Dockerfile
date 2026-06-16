# syntax=docker/dockerfile:1
# ── AIFUT API — optimized multi-stage build (~250MB target) ──

# Stage 1: deps — install ALL deps once (cached by lockfile)
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json packages/ui/
RUN npm ci

# Stage 2: builder — compile NestJS + generate Prisma client
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json turbo.json ./
COPY apps/api apps/api
COPY packages packages
RUN cd apps/api && npx prisma generate
RUN npm run build --filter=@repo/api --no-daemon

# Stage 3: prod-deps — install production-only deps to slim the image
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json packages/ui/
RUN npm ci --omit=dev && npm cache clean --force

# Stage 4: runner — minimal production image
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

# Production node_modules only
COPY --from=prod-deps /app/node_modules ./node_modules
# Prisma generated client (engines) from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# Compiled app + runtime assets
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages ./packages

USER nestjs
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3002/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "apps/api/dist/src/main.js"]

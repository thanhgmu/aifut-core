# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/config/ packages/config/
COPY packages/eslint-config/ packages/eslint-config/
COPY packages/typescript-config/ packages/typescript-config/
COPY packages/ui/ packages/ui/
RUN npm ci

# Copy source
COPY apps/web apps/web
COPY packages packages

# Build
RUN npm run build --filter=@repo/web --no-daemon

# Stage 2: Production runner
FROM node:24-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built .next output
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/next.config.ts ./apps/web/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

USER nextjs

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node_modules/.bin/next", "start", "apps/web"]

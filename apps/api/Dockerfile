# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/config/ packages/config/
COPY packages/eslint-config/ packages/eslint-config/
COPY packages/typescript-config/ packages/typescript-config/
COPY packages/ui/ packages/ui/
RUN npm ci

# Copy source
COPY apps/api apps/api
COPY packages packages

# Build
RUN npm run build --filter=@repo/api --no-daemon

# Stage 2: Production
FROM node:24-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy built output + node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

# Prisma generate for production
RUN cd apps/api && npx prisma generate

USER nestjs

EXPOSE 3002

CMD ["node", "apps/api/dist/src/main.js"]

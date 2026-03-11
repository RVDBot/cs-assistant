FROM node:22-alpine AS base

RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Install deps
FROM base AS deps
COPY package*.json ./
RUN npm ci

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
RUN mkdir -p /app/knowledge && chown nextjs:nodejs /app/knowledge

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_PATH=/app/data/cs-assistant.db

CMD ["node", "server.js"]

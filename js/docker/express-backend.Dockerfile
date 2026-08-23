# Build context: repository js/ root
# docker build -f docker/express-backend.Dockerfile .

# --- Stage 1: Build ---
FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /usr/src/app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/

RUN pnpm install --frozen-lockfile

# Prisma client generation only parses the schema; the URL is never dialed.
# Pass --build-arg DATABASE_URL=... or the safe default below is used.
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
RUN pnpm --filter @spotalong/server exec prisma generate

RUN pnpm exec turbo run build --filter=@spotalong/server

# --- Stage 2: Runtime Runner ---
FROM node:20-alpine AS runner
RUN apk add --no-cache tini
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/pnpm-workspace.yaml ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/packages ./packages
COPY --from=builder /usr/src/app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /usr/src/app/apps/server/dist ./apps/server/dist
COPY --from=builder /usr/src/app/apps/server/node_modules ./apps/server/node_modules

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/server/dist/index.js"]

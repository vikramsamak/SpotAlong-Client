# Build context: repository js/ root
# docker build -f docker/server.Dockerfile .
# Server image (Coolify: Dockerfile Location = docker/server.Dockerfile, build context js/).

# --- Stage 1: Build ---
# node:22 required - pnpm 11 (packageManager field) needs >= 22.13
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /usr/src/app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/

RUN pnpm install --frozen-lockfile

# Generate the Prisma client (src/generated/ is gitignored, so this must run at
# build time). The URL is never dialed here - only the schema is parsed.
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

RUN pnpm --filter @spotalong/server exec prisma generate
RUN pnpm exec turbo run build --filter=@spotalong/server

# --- Stage 2: Runtime Runner ---
FROM node:22-alpine AS runner
RUN apk add --no-cache tini && corepack enable
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/pnpm-workspace.yaml ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/packages ./packages

# Server application + everything prisma migrate deploy needs at startup
COPY --from=builder /usr/src/app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /usr/src/app/apps/server/prisma.config.ts ./apps/server/prisma.config.ts
COPY --from=builder /usr/src/app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /usr/src/app/apps/server/dist ./apps/server/dist
COPY --from=builder /usr/src/app/apps/server/node_modules ./apps/server/node_modules

COPY docker/entrypoint.sh /usr/src/app/docker/entrypoint.sh
RUN chmod +x /usr/src/app/docker/entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/src/app/docker/entrypoint.sh"]

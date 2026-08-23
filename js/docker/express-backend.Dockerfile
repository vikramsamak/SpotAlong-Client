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

# Generate the Prisma client (schema lives in apps/server/prisma).
# A placeholder URL satisfies config validation; real value comes at runtime.
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"
RUN pnpm --filter @spotalong/server exec prisma generate

RUN pnpm exec turbo run build --filter=@spotalong/server

# --- Stage 2: Runtime Runner ---
FROM node:20-alpine AS runner
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

EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]

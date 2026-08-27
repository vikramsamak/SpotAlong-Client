# Build context: repository js/ root
# docker build -f docker/client.Dockerfile .

# --- Stage 1: Build ---
# node:22 required - pnpm 11 (packageManager field) needs >= 22.13
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /usr/src/app

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/client/ ./apps/client/

RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@spotalong/client

# --- Stage 2: Nginx Static Server ---
FROM nginx:stable-alpine AS runner
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /usr/src/app/apps/client/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

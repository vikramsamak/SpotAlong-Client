#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations..."
cd /usr/src/app/apps/server
pnpm exec prisma migrate deploy

echo "[entrypoint] Starting SpotAlong server..."
cd /usr/src/app
exec node apps/server/dist/index.js

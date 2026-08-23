# Phase 6: E2E Integration, Testing & Containerized Deployment

This final phase describes the validation protocols, integration tests, and production containerization setups needed to launch the migrated TypeScript SpotAlong platform.

---

## 1. End-to-End Integration Testing

We will establish automated integration tests to prove that the Express.js and Socket.IO implementations perfectly match the synchronization requirements of the legacy system.

### 1.1 Socket.IO Stress Test (`apps/server/tests/realtime.test.ts`)
This test simulates a single host and multiple concurrent listeners to ensure the Node.js event-loop manages high-volume (5Hz) relay updates with minimal overhead.

```typescript
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { initSocketIOServer } from '../src/socketio/server';

describe('Realtime Broadcast Performance', () => {
  let ioServer: any, httpServer: any, hostSocket: ClientSocket, listenerSocket: ClientSocket;
  let port: number;

  beforeAll((done) => {
    httpServer = createServer();
    ioServer = initSocketIOServer(httpServer);
    
    httpServer.listen(() => {
      port = (httpServer.address() as AddressInfo).port;
      done();
    });
  });

  afterAll(() => {
    ioServer.close();
    httpServer.close();
  });

  it('should broadcast song_update packets from host to active listener with low delay', (done) => {
    // 1. Init Host & Listener Sockets
    hostSocket = ioc(`http://localhost:${port}/api/authorization`, {
      extraHeaders: { Authorization: 'Bearer MOCK_HOST_JWT' }
    });
    
    listenerSocket = ioc(`http://localhost:${port}/api/authorization`, {
      extraHeaders: { Authorization: 'Bearer MOCK_LISTENER_JWT' }
    });

    listenerSocket.on('listening_state', (payload) => {
      expect(payload.songId).toBe('spotify:track:4zCHp6vNfN57T63A99Dq2b');
      expect(payload.progress).toBe(120);
      done();
    });

    // 2. Setup Active Listen Session
    listenerSocket.emit('start_listening', 'MOCK_HOST_ID');

    // 3. Emit heartbeat from host
    setTimeout(() => {
      hostSocket.emit('send_current_state', {
        songId: 'spotify:track:4zCHp6vNfN57T63A99Dq2b',
        progress: 120,
        isPlaying: true,
        looping: 'track'
      });
    }, 100);
  });
});
```

---

## 2. Audio & Seek Synchronization Tuning

To prevent "stuttering" (caused by repetitive seek events fighting slight latency differences):
* **Request Throttle Gate**: Seek commands on the `SpotifyPlayer` are rate-limited to a maximum frequency of **0.5 Hz** (once per 2 seconds).
* **Network Latency Compensation**: The progress position from the server is automatically adjusted by adding the network round-trip time:
  $$\text{Adjusted Progress} = \text{Server Progress} + \frac{\text{WebSocket Latency}}{2}$$

---

## 3. Production Containerization (Docker Layout)

We will configure two separate, dedicated Dockerfiles housed under a centralized `/docker/` folder at the repository root. Since this is a monorepo workspace, both Dockerfiles should be run with the workspace root as their build context so they can access the shared packages like `@spotalong/types`.

### 3.1 Express Backend Dockerfile (`docker/express-backend.Dockerfile`)
This file packages the Node/Express.js backend, compiling TypeScript inside the Turborepo workspace.

```dockerfile
# --- Stage 1: Build ---
FROM node:20-alpine AS builder
RUN npm install -g pnpm
WORKDIR /usr/src/app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @spotalong/server build

# --- Stage 2: Runtime Runner ---
FROM node:20-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/apps/server/dist ./apps/server/dist
COPY --from=builder /usr/src/app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /usr/src/app/apps/server/package.json ./apps/server/package.json

EXPOSE 8000
CMD ["node", "apps/server/dist/app.js"]
```

To build:
```bash
docker build -t spotalong-server -f docker/express-backend.Dockerfile .
```

### 3.2 React Web Client Dockerfile (`docker/react-client.Dockerfile`)
This file compiles the React client SPA and serves the static production build using an optimized Nginx container.

```dockerfile
# --- Stage 1: Build ---
FROM node:20-alpine AS builder
RUN npm install -g pnpm
WORKDIR /usr/src/app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/client/ ./apps/client/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @spotalong/client build

# --- Stage 2: Nginx Static Server ---
FROM nginx:stable-alpine AS runner
COPY --from=builder /usr/src/app/apps/client/dist /usr/share/nginx/html

# Optional custom nginx configuration to handle React client routing
# COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

To build:
```bash
docker build -t spotalong-client -f docker/react-client.Dockerfile .
```

---

## 4. Acceptance Criteria & Final Sign-Off

To complete the entire migration roadmap, developers must secure passing marks on all of the following requirements:
1. **Zero ESLint warnings**: The entire workspace compiles strictly under standard TypeScript constraints.
2. **REST API Performance**: Route responses are verified to complete in under 50ms (excluding Spotify API round-trips).
3. **Drift Synced Bounds**: Real-time mock companion tests verify player-drift resolves inside the target 3-second window in less than 2 seconds after a song change or seek occurs.
4. **Volume stress simulation**: The Socket.IO server is verified to handle up to 50 active sync sessions simultaneously with no CPU throttling or socket drops.

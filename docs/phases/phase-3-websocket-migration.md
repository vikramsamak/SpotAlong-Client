# Phase 3: Express & Socket.IO Realtime Gateway Migration

This phase focuses on migrating the real-time layer. We will replace the Python `AsyncServer` namespace implementation with a **Node.js Socket.IO server** running inside the same Express process.

---

## 1. Server Setup & Handshake Authorization

The server must attach Socket.IO to the Node HTTP server and intercept the connection handshake using a SpotAlong JWT authentication middleware.

### 1.1 Server Initialization (`apps/server/src/socketio/server.ts`)
```typescript
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../database'; // database wrapper
import { 
  ServerToClientEvents, 
  ClientToServerEvents 
} from '@spotalong/types';

export function initSocketIOServer(httpServer: HttpServer) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    path: '/socket.io' // standardized endpoint mapping
  });

  const authNamespace = io.of('/api/authorization');

  // Intercept connection for verification
  authNamespace.use(async (socket, next) => {
    const authHeader = socket.handshake.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new Error('Authentication error: Missing token'));
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
      if (decoded.type !== 'access') {
        return next(new Error('Authentication error: Invalid token type'));
      }
      
      const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      // Store identity context on socket instance
      socket.data.userId = user.id;
      next();
    } catch (err) {
      next(new Error('Authentication error: Token invalid or expired'));
    }
  });

  authNamespace.on('connection', (socket) => {
    handleSocketConnection(socket, authNamespace);
  });

  return io;
}
```

---

## 2. Handshake Startup Payload (Sequence Parity)

Upon authorization, the WebSocket connection acts as the client's initial sync gateway. It must immediately push the startup state.

### 2.1 Connection Event Sequence (`apps/server/src/socketio/handlers.ts`)
On a successful `connection` event, the server will fetch and push the user's relational profiles:

```typescript
import { Socket, Namespace } from 'socket.io';
import { prisma } from '../database';

export async function handleSocketConnection(socket: Socket, namespace: Namespace) {
  const userId = socket.data.userId;

  // 1. Mark Online & Set up socket room join
  await prisma.user.update({
    where: { id: userId },
    data: { lastOnline: new Date() }
  });
  socket.join(`user:${userId}`);

  // 2. Fetch Sync Data in Parallel (Performance optimization)
  const [friends, incomingReqs, outgoingReqs] = await Promise.all([
    fetchFriendsList(userId),
    fetchIncomingRequests(userId),
    fetchOutgoingRequests(userId)
  ]);

  // 3. Emit Snapshot Sequentially
  socket.emit('Authorized', userId);
  socket.emit('friend_list', friends);
  socket.emit('friend_requests', incomingReqs);
  socket.emit('outbound_friend_requests', outgoingReqs);

  // 4. Wire up State Receivers
  registerEventHandlers(socket, namespace);
}
```

---

## 3. Realtime Event Handlers Porting

We must map python-socketio handlers directly to JS events, maintaining exact payload contracts.

### 3.1 `on_send_current_state` (Live Sync Heartbeat)
Clients report progress up to 5 times per second.
```typescript
socket.on('send_current_state', async (data) => {
  const userId = socket.data.userId;

  // 1. Update DB Presence Snapshot for late joiners
  await prisma.user.update({
    where: { id: userId },
    data: {
      lastSongId: data.songId,
      lastProgress: Math.floor(data.progress),
      lastIsPlaying: data.isPlaying,
      lastOnline: new Date()
    }
  });

  // 2. Fetch Active Sync Receivers (Listeners)
  const activeSessions = await prisma.listenSession.findMany({
    where: { targetId: userId, active: true },
    select: { listenerId: true }
  });

  // 3. Sync Relay Mechanics
  // Quirks Note: The legacy python server emitted "listening_state" back to the host (sender).
  // We will support BOTH: emitting back to host for legacy sync loop, AND fanning out to true listeners.
  
  // A. Echo to Sender (Legacy compat)
  socket.emit('listening_state', data);

  // B. Propagate to active listener rooms (True Real-time Fan-out)
  for (const session of activeSessions) {
    namespace.to(`user:${session.listenerId}`).emit('listening_state', data);
  }
});
```

### 3.2 Listen Controls (`start_listening` & `end_listening`)
Handles session bindings between the synchronization hosts and their listening companions.

* **`start_listening(targetId)`**:
  1. Upsert a `ListenSession` record with `active: true`.
  2. Locate target sockets via the room `user:${targetId}`.
  3. Emit a `start_listening_from_user` payload, triggering the host client to force-push their next song metadata.

* **`end_listening(targetId)`**:
  1. Deactivate the `ListenSession` record (`active: false`).
  2. Push `end_listening_from_user` to `user:${targetId}` to clean up local companion queues.

---

## 4. Disconnect Handling

When the WebSocket disconnects, the server registers presence departure:
```typescript
socket.on('disconnect', async () => {
  const userId = socket.data.userId;
  if (!userId) return;

  await prisma.user.update({
    where: { id: userId },
    data: { lastOnline: new Date() } // Last seen marker
  });
});
```

---

## 5. Acceptance Criteria & Verification

To mark Phase 3 as complete, developers must verify:
1. Connect client testing utilizing Socket.IO test tooling (`socket.io-client`).
2. Verify that unauthorized connections (missing headers or bad JWT signatures) are rejected during the handshake lifecycle.
3. Validate that a mocked host emitting `send_current_state` triggers the dual sync logic: echo received by host, and broadcast received by registered listeners.

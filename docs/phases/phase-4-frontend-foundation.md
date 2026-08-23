# Phase 4: React Client & Frontend State Architecture

This phase focuses on bootstrapping the **React SPA** (Vite + TypeScript) and implementing a unified client-side state machine. This replaces PyQt5's thread-heavy polling model with React's native, event-driven architecture.

---

## 1. Vite & React Shell Setup (`apps/client/`)

We will initialize a modern, fast React client configured to compile cleanly inside our Turborepo pipeline.

### 1.1 Development Dependencies
Add standard build packages in `apps/client/package.json`:
```json
{
  "name": "@spotalong/client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "socket.io-client": "^4.7.0",
    "zustand": "^4.5.0",
    "lucide-react": "^0.300.0"
  },
  "devDependencies": {
    "@spotalong/types": "workspace:*",
    "@spotalong/typescript-config": "workspace:*",
    "vite": "^5.2.0"
  }
}
```

---

## 2. Global State Orchestration (Zustand Store)

In Python, the UI depends on thread workers (`worker`...`worker5`) constantly polling local memory buffers and triggering heavy Qt layout recalculations. 

In React, **Zustand** will maintain a single, reactive in-memory state store. This store subscribes directly to Socket.IO events, rendering Python's QThreads/Runnables entirely obsolete.

### 2.1 UI State Definition (`apps/client/src/store/useSpotAlongStore.ts`)
```typescript
import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { User, Friend, SpotifySong } from '@spotalong/types';

interface SpotAlongState {
  // Authentication & Status
  userId: string | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  
  // Real-time Lists
  friendsList: User[];
  friendRequests: Friend[];
  outboundRequests: Friend[];
  
  // Current Playback Snapshot
  ownPlayback: SpotifySong | null;
  friendPlaybacks: Record<string, SpotifySong>; // friendId -> playback state

  // Socket Instance
  socket: Socket | null;

  // Actions
  initializeSession: (token: string) => void;
  setOwnPlayback: (song: SpotifySong) => void;
  updateFriendPlayback: (userId: string, song: SpotifySong) => void;
  terminateSession: () => void;
}

export const useSpotAlongStore = create<SpotAlongState>((set, get) => ({
  userId: null,
  accessToken: null,
  isAuthenticated: false,
  friendsList: [],
  friendRequests: [],
  outboundRequests: [],
  ownPlayback: null,
  friendPlaybacks: {},
  socket: null,

  initializeSession: (token) => {
    const socket = io(`${import.meta.env.VITE_API_URL}/api/authorization`, {
      headers: { authorization: `Bearer ${token}` },
      autoConnect: true
    });

    socket.on('Authorized', (userId) => set({ userId, isAuthenticated: true }));
    socket.on('friend_list', (friendsList) => set({ friendsList }));
    socket.on('song_update', ({ userId, song }) => {
      set((state) => ({
        friendPlaybacks: { ...state.friendPlaybacks, [userId]: song }
      }));
    });

    set({ socket, accessToken: token });
  },

  setOwnPlayback: (ownPlayback) => set({ ownPlayback }),
  
  updateFriendPlayback: (userId, song) => set((state) => ({
    friendPlaybacks: { ...state.friendPlaybacks, [userId]: song }
  })),

  terminateSession: () => {
    const { socket } = get();
    socket?.disconnect();
    set({ userId: null, accessToken: null, isAuthenticated: false, socket: null });
  }
}));
```

---

## 3. Desktop Integration: Tauri / Electron

The Python PyQt5 client handles native operations like frameless dragging, tray minimizes, and single-instance locks manually via OS handles. If deployed as a desktop client, React will be wrapped in **Tauri** or **Electron**:

### 3.1 Single-Instance Prevention
In PyQt5, a local TCP port check on `49475` is used to raise existing instances.
* **Electron Alternative**: Native orchestration is built-in:
  ```typescript
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit(); // Exit immediately if an instance is running
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus(); // Bring window to front
      }
    });
  }
  ```
* **Tauri Alternative**: Use the standard `tauri-plugin-single-instance` library.

### 3.2 Dynamic DPI Scaling
The legacy python file `uiutils.py` contains 300 lines of complex scaling calculations designed to adjust elements on non-1080p high-DPI displays. In React, browsers natively apply scaling based on display DPI settings, completely eliminating the need for custom scaling calculations.

---

## 4. UI Layout & Stylesheets (Vanilla CSS)

To preserve the clean aesthetic of SpotAlong without introducing bulky UI libraries, we will use modular **Vanilla CSS**.

```css
/* apps/client/src/styles/app.css */
:root {
  --background-dark: #121212;
  --surface-dark: #1c1c1c;
  --accent-blue: #1db954; /* Spotify green default, dynamically replaced */
  --text-main: #ffffff;
  --text-muted: #b3b3b3;
  --sidebar-width: 60px;
}

body {
  margin: 0;
  background-color: var(--background-dark);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--text-main);
  user-select: none;
}

/* Custom Drag Zone for Frameless Window */
.titlebar-drag {
  -webkit-app-region: drag;
  height: 32px;
  background-color: var(--surface-dark);
  display: flex;
  align-items: center;
  padding: 0 16px;
}

.titlebar-button {
  -webkit-app-region: no-drag;
  cursor: pointer;
}
```

---

## 5. Acceptance Criteria & Verification

To mark Phase 4 as complete, developers must:
1. Boot the dev environment using `pnpm run dev` inside `apps/client`.
2. Confirm the app loads with no styling or viewport scaling issues on multiple screen sizes.
3. Verify through Redux/Zustand DevTools that Socket.IO events commit correctly to the store.

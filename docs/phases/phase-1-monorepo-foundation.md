# Phase 1: Monorepo Foundation & Shared Package Architecture

This phase focuses on initializing the workspace foundation using **Turborepo** and setting up standard linting, compiling, and data structures. By sharing type definitions and configurations, we guarantee absolute synchronicity between client and server APIs.

---

## 1. Setup Turborepo and Workspace

First, we will initialize a root monorepo directory utilizing `pnpm` workspaces (highly recommended for Turborepo's caching efficiency) or standard `npm` workspaces.

### 1.1 Create Root `package.json`
```json
{
  "name": "spot-along-monorepo",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "clean": "turbo run clean"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

### 1.2 Create `pnpm-workspace.yaml`
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 1.3 Create `turbo.json`
Configure task pipeline caching so that shared configurations and builds run in optimal order:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

---

## 2. Standardize Developer Configurations (`packages/*`)

We will define base configurations inside standard, re-usable internal packages to eliminate redundancy.

### 2.1 TypeScript Shared Base (`packages/typescript-config`)
Create `packages/typescript-config/base.json` to enforce strict type checking across the entire project:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

### 2.2 ESLint & Prettier Base (`packages/eslint-config`)
Enforce standardized TypeScript syntax guidelines, preventing the usage of type escapes (like `any` or `@ts-ignore` comments).

---

## 3. Shared Types Package (`packages/types`)

This is the core of our type-safe communication layer. By defining models and communication interfaces once, we prevent API mismatch bugs.

### 3.1 Define Entities (`packages/types/src/models.ts`)
Map Python's model layers directly to TS types:
```typescript
export interface User {
  id: string;
  friendCode: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  lastOnline?: string;
  lastSongId?: string;
  lastProgress?: number;
  lastIsPlaying?: boolean;
  privacyMode: 'friends' | 'none' | 'everyone';
}

export interface Friend {
  userId: string;
  friendId: string;
  direction: 'sent' | 'received';
  status: 'pending' | 'accepted' | 'declined';
}

export interface SpotifySong {
  songName: string;
  songId: string;
  songLink: string;
  songAuthors: Array<{ name: string; url: string }>;
  contextType?: string;
  contextData?: string;
  contextUrl?: string;
  progress: number;       // In seconds
  duration: number;       // In milliseconds (matches legacy raw API unit mismatch)
  albumName: string;
  albumLink: string;
  albumImageLink?: string;
  isPlaying: boolean;
  playingType: 'track' | 'ad' | 'local file' | 'episode' | 'None';
  clientUsername?: string;
  clientAvatar?: string;
  clientId?: string;
  friendCode?: string;
  playingStatus: 'Listening' | 'Online' | 'Offline';
  lastSong?: SpotifySong;
  lastSongTimestamp?: string;
}
```

### 3.2 Define WebSocket Interfaces (`packages/types/src/websocket.ts`)
Expose the contract of the Socket.IO `/api/authorization` namespace.

```typescript
export interface ServerToClientEvents {
  Authorized: (userId: string) => void;
  friend_list: (friends: User[]) => void;
  friend_requests: (requests: Friend[]) => void;
  outbound_friend_requests: (requests: Friend[]) => void;
  song_update: (payload: { userId: string; song: SpotifySong }) => void;
  user_update: (payload: { userId: string; user: Partial<User> }) => void;
  new_request: (request: Friend) => void;
  remove_request: (payload: { requesterId: string }) => void;
  new_friend: (friend: User) => void;
  remove_friend: (payload: { friendId: string }) => void;
  start_listening_from_user: (listenerId: string) => void;
  end_listening_from_user: (listenerId: string) => void;
  listening_state: (state: { songId: string; progress: number; isPlaying: boolean; looping: string }) => void;
}

export interface ClientToServerEvents {
  send_current_state: (state: { songId: string; progress: number; isPlaying: boolean; looping: string }) => void;
  start_listening: (targetId: string) => void;
  end_listening: (targetId: string) => void;
}
```

---

## 4. Acceptance Criteria & Verification

To mark Phase 1 as complete, developers must verify:
1. Root-level execution of `pnpm run build` succeeds using Turborepo's pipeline.
2. The `packages/types` builds and generates valid `.d.ts` declaration files.
3. Importing `@spotalong/types` inside boilerplate scripts compiles with no module resolution errors under NodeNext.

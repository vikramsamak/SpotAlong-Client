# SpotAlong Migration Plan: Python to TypeScript/Turbo Monorepo

This document outlines the high-level strategy for migrating SpotAlong from its legacy Python architecture (PyQt5 client + FastAPI & Socket.IO server) to a modern, unified **TypeScript Monorepo** powered by **Turborepo**, featuring a **React client** and an **Express.js backend**.

---

## 1. Architectural Evolution

The migration transitions the project from dual Python environments (PyQt5 client-side, FastAPI server-side) to a single language stack (TypeScript). This simplifies code-sharing, type-safety, and local development.

### Legacy vs. Modern Stack Comparison

| Component | Legacy Python Stack | Modern TypeScript Monorepo Stack |
| :--- | :--- | :--- |
| **Monorepo Orchestrator** | None (separate directories, venv) | **Turborepo** |
| **Package Manager** | pip (requirements.txt) | **pnpm** (preferred for Turbo workspaces) |
| **Client Shell** | **PyQt5** (Desktop App) | **Electron** or **Tauri** wrapping a **React SPA** (Vite + TS) |
| **Client Styling** | Qt Stylesheets (QSS) | **Vanilla CSS** (retaining existing dark/clean aesthetic) |
| **Backend Framework** | **FastAPI** | **Express.js** (TypeScript) |
| **Realtime Gateway** | `python-socketio` | **Socket.IO (Node.js)** |
| **Database ORM** | SQLAlchemy (Async) | **Prisma** or **Drizzle ORM** |
| **Database Engine** | MySQL (asyncmy driver) | MySQL (native via mysql2) |
| **Spotify Integration** | Custom unofficial web player client | Ported Node/TS Unofficial Player or Spotify Web Playback SDK |

---

## 2. Target Monorepo Structure

We will structure the new codebase using a Turborepo layout, allowing shared types and configurations to be imported natively by both the server and the client.

```
spot-along/
├── turbo.json                  # Turborepo task pipeline configuration
├── package.json                # Workspace root package definition
├── pnpm-workspace.yaml        # PNPM workspace definition
├── apps/
│   ├── client/                 # React SPA (Vite + TypeScript)
│   │   ├── src/
│   │   │   ├── components/     # UI widgets (Status, Playback, Tooltips)
│   │   │   ├── hooks/          # Custom react hooks (useSpotify, useSocket)
│   │   │   ├── store/          # Zustand / global client-side state
│   │   │   └── main.tsx        # React client entry point
│   │   └── package.json
│   └── server/                 # Express.js API + Socket.IO Server (TypeScript)
│       ├── src/
│       │   ├── routes/         # REST routers (auth, friends, me, cache)
│       │   ├── services/       # Core business logic (spotify_oauth, friend_service)
│       │   ├── socketio/       # Live WebSocket namespace & handlers
│       │   ├── models/         # Database integration (Prisma Schema / Drizzle models)
│       │   └── app.ts          # Express application entry
│       └── package.json
└── packages/
    ├── types/                  # Shared TypeScript typings (Events, Payloads, Schemas)
    │   ├── src/
    │   │   ├── index.ts        # Exports shared models
    │   │   ├── websocket.ts    # WS Event payloads (listening_state, song_update)
    │   │   └── api.ts          # REST response & request schemas
    │   └── package.json
    ├── typescript-config/      # Shared tsconfig bases
    └── eslint-config/          # Shared ESLint/Prettier linting standards
```

---

## 3. Migration Roadmap (Phases)

To ensure high-fidelity parity, the migration is broken down into **6 chronological phases**. Each phase is fully detailed in its respective markdown file within the `docs/phases/` folder:

1. **[Phase 1: Monorepo Foundation](./phase-1-monorepo-foundation.md)**
   * Setting up the Turborepo workspace, establishing workspace dependencies, configure TypeScript/ESlint configurations, and writing the shared types package.
2. **[Phase 2: Backend REST API Migration](./phase-2-backend-migration.md)**
   * Porting the FastAPI routing architecture to Express.js, setting up Prisma or Drizzle for MySQL, implementing OAuth code-redemption flows, and building the read-through cache endpoints.
3. **[Phase 3: WebSocket Relay Migration](./phase-3-websocket-migration.md)**
   * Rebuilding the Socket.IO namespace server, authenticating handshake connections using JWTs, managing real-time session stores, and porting the song state relay mechanics.
4. **[Phase 4: Frontend Shell & Custom UI](./phase-4-frontend-foundation.md)**
   * Bootstrapping the React SPA with Vite, establishing a global state store (Zustand) to mirror PyQt5's update loops, and porting custom dark UI layouts/stylesheets to Vanilla CSS.
5. **[Phase 5: Spotify Unofficial Web Player & Listener Port](./phase-5-spotify-player-port.md)**
   * Translating the custom Python-based unofficial Spotify playback engine (dealer WebSocket connection, Connect device registration, cookie extraction) into Node/TypeScript. Re-implementing the `SpotifyListener` drift-sync loops.
6. **[Phase 6: E2E Integration & Deployment](./phase-6-e2e-testing-validation.md)**
   * Orchestrating integration tests, validating audio-sync performance between mock players, preparing two separate Dockerfiles (one for Web App and one for Express) inside the docker/ folder, and finalizing the production sign-off.

---

## 4. Key Migration Risk Areas & Mitigations

### 1. The Unofficial Spotify Web Player Protocol
* **Risk:** The Python `SpotifyPlayer` performs advanced cookie extraction (Chrome scraping) and maintains a low-level WebSocket connection to `wss://guc3-dealer.spotify.com` to register as a fake Connect device and bypass Premium checks.
* **Mitigation:** Sectioned out in Phase 5, this core logic must be ported to TypeScript. In a browser React SPA environment, CORS blocks these raw calls. Therefore, the React client must either run inside an Electron/Tauri shell (to bypass CORS and utilize native system keyrings/cookie paths) or the Express backend must act as a proxy/agent executing the low-level Connect emulation on behalf of clients.

### 2. Audio and Seek Synchronization Drift
* **Risk:** Python's PyQt5 listener uses microsecond precision and an active 1-second interval loop (`spotifylistener.py`) to keep clients synced within 3 seconds of the host.
* **Mitigation:** React's component state-render lifecycle must not block the precision sync timer. We will isolate the synchronization engine inside a dedicated Web Worker or an unblocked JS interval loop outside the React render thread, writing sync directives directly to Spotify via the ported player.

### 3. JWT and Spotify Token Security
* **Risk:** Storing raw secrets or OAuth credentials on disk in cleartext.
* **Mitigation:** Maintain parity with the legacy client's OS Keyring utilization. For an Electron/Tauri application, we will use native integration packages like `keytar` or `tauri-plugin-stronghold` to interact safely with Windows Credential Manager / macOS Keychain.

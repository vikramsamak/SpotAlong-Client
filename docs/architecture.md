# SpotAlong Architecture

SpotAlong is a "listen along to your friends on Spotify" app. It has two halves:

- `client/` — the PyQt5 desktop app users install and run
- `server/` — the FastAPI + Socket.IO backend all clients connect to

---

## 1. The `client/` folder

The **desktop app users actually run** — a PyQt5 GUI for SpotAlong.

### Role of each part inside `client/`

| File/Folder                           | Role                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `app.py`                              | Entry point — starts UI + update threads                                      |
| `mainclient.py`                       | WebSocket (Socket.IO) link to the SpotAlong server; syncs friends' song state |
| `ui/`                                 | All visible windows/widgets (login screen, main app)                          |
| `spotifyclient/`                      | Talks to Spotify's API to control playback & track what friends play          |
| `utils/`                              | Login/auth helpers, constants, image/color utilities                          |
| `build.py`, `install.nsi`, `app.spec` | Packaging into the Windows installer                                          |

### Block diagram

```
                 ┌──────────────────────────────┐
                 │        client/  (this app)   │
                 │                              │
   You type /    │  ┌────────┐    ┌──────────┐  │      ┌─────────┐     ┌──────────┐
   click here ──►│  │  ui/   │◄──►│mainclient│◄─┼─────►│ server/ │◄───►│ Friends' │
                 │  └────────┘    └────┬─────┘  │ ws   │ (relay) │     │ clients  │
                 │                     ▼        │      └─────────┘     └──────────┘
                 │             ┌────────────────┐│
                 │             │ spotifyclient/ │──► Spotify API
                 │             └────────────────┘   (play/pause your music)
                 └──────────────────────────────┘
```

**Flow:** You see friends in the `ui/` → `mainclient.py` receives their song over WebSocket → `spotifyclient/` tells Spotify to play the same song → you listen along together.

---

## 2. The `server/` folder

The **backend brain** — a FastAPI + Socket.IO app that all clients connect to. It stores users/friends in MySQL, handles Spotify login (OAuth), and **relays "who is playing what" between friends**. Launched via `run_server.py` at the repo root.

### Role of each part inside `server/`

| File/Folder          | Role                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `app.py`             | Entry point — FastAPI app + Socket.IO mounted together, CORS, optional ngrok public tunnel |
| `config.py`          | Settings from `.env` (DB URL, JWT secret, Spotify keys, port)                              |
| `database.py`        | Async SQLAlchemy connection to MySQL + table creation                                      |
| `routes/`            | REST API: `auth` (login/callback), `friends`, `me`, `cache`                                |
| `socketio/server.py` | WebSocket events: token auth on connect, sends friend list, relays song state              |
| `services/`          | Business logic: auth, friends, listen sessions, Spotify OAuth token refresh                |
| `models/`            | Database tables: `User`, `Friend`, `ListenSession`, cache                                  |
| `schemas/`           | Pydantic shapes for API requests/responses                                                 |
| `utils.py`           | JWT encode/decode                                                                          |

### Block diagram

```
        ┌────────────────────────────────────────────┐
        │              server/  (this app)           │
        │                                            │
 client │  ┌─────────┐   ┌──────────┐   ┌─────────┐  │
 ───────┼─►│ routes/ │──►│services/ │──►│ models/ │──┼──► MySQL
 (REST) │  │ (REST)  │   │(logic)   │   │(tables) │  │
        │  └─────────┘   └──────────┘   └─────────┘  │
        │                                            │
 client │  ┌──────────────────────────────────────┐  │
 ◄──────┼──┤ socketio/server.py (live websocket)  │  │
 (ws)   │  │  auth → send friend_list → relay     │  │
        │  │  "listening_state" to friends        │  │
        │  └──────────────────────────────────────┘  │
        └────────────────────────────────────────────┘
```

**Flow:** Client logs in via `routes/auth` (Spotify OAuth) → connects WebSocket → server checks JWT, pushes friend list → whenever a friend changes song, `socketio/server.py` relays it to everyone listening along → clients' Spotify starts playing the same track.

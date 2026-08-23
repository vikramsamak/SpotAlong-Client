# SpotAlong Server — Deep Dive

Complete reference for everything inside `server/` — the FastAPI + Socket.IO backend.
Companion doc: [`client-deep-dive.md`](client-deep-dive.md).

---

## Table of Contents

1. [Big Picture](#1-big-picture)
2. [app.py — Application Assembly](#2-apppy--application-assembly)
3. [config.py — Settings](#3-configpy--settings)
4. [database.py — Async SQLAlchemy](#4-databasepy--async-sqlalchemy)
5. [models/ — Database Tables](#5-models--database-tables)
6. [schemas/ — Pydantic Shapes](#6-schemas--pydantic-shapes)
7. [utils.py — Codes & JWTs](#7-utilspy--codes--jwts)
8. [services/ — Business Logic](#8-services--business-logic)
9. [routes/ — REST API](#9-routes--rest-api)
10. [socketio/server.py — Realtime Layer](#10-socketioserverpy--realtime-layer)
11. [run_server.py & Deployment](#11-run_serverpy--deployment)
12. [End-to-End Flows](#12-end-to-end-flows)
13. [Quirks & Gotchas](#13-quirks--gotchas)

---

## 1. Big Picture

```
                        ┌──────────────────────────────────────────────────┐
   SpotAlong clients    │                    server/                       │
                        │                                                  │
  REST (login, friends, │  ┌─────────┐  calls  ┌──────────┐  uses  ┌─────┐ │       ┌───────┐
  cache, me) ───────────┼─►│ routes/ ├────────►│services/ ├───────►│models├─┼──►──►│ MySQL │
                        │  └─────────┘         └────▲─────┘        └─────┘ │       └───────┘
                        │                           │                      │
  WebSocket (live song  │  ┌────────────────────────┴──────────────┐       │
  state, listen-along,  │  │ socketio/server.py                    │       │
  friend events) ◄──────┼─►│ /api/authorization namespace          │       │
                        │  │ auth → snapshots → relay              │       │
                        │  └───────────────────────────────────────┘       │
                        │                                                  │
                        │  app.py: FastAPI + socketio.ASGIApp (one port)   │
                        │  + optional ngrok tunnel                         │
                        └──────────────────────────────────────────────────┘
                                        │
                                        ▼
                          Spotify OAuth (accounts.spotify.com / api.spotify.com)
```

One process serves **both** HTTP and WebSocket on the same port: `socketio.ASGIApp(sio, other_asgi_app=app)`.

Two token domains exist and must not be confused:

| Token                   | Issued by                                 | Purpose                                                                  |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| **SpotAlong JWT**       | this server (`utils.create_access_token`) | authenticates clients to this server (REST header + websocket handshake) |
| **Spotify OAuth token** | accounts.spotify.com                      | lets the server pull the user's profile at login; stored on the User row |

---

## 2. app.py — Application Assembly

- Creates `FastAPI(title="SpotAlong Server")` with permissive CORS (`allow_origins=["*"]`).
- Mounts routers in order: `auth`, `friends`, `cache`, `me`.
- Wraps everything: `socket_app = socketio.ASGIApp(sio, other_asgi_app=app)` — **this** is what uvicorn runs.
- `startup` event:
  - `init_db()` — creates any missing tables.
  - If `NGROK_ENABLED`, opens a public tunnel (auth token/domain from settings) and stores the URL in the module-global `public_url`.
- `GET /api/ngrok-url` — returns `{url}` so clients can discover a publicly reachable base URL during development.

## 3. config.py — Settings

`pydantic_settings.BaseSettings` reading `server/.env`:

| Setting                                 | Default                                            | Meaning                        |
| --------------------------------------- | -------------------------------------------------- | ------------------------------ |
| `DATABASE_URL`                          | `mysql+asyncmy://root@localhost:3306/spotalong`    | async MySQL via asyncmy driver |
| `JWT_SECRET` / `JWT_ALGORITHM`          | dev secret / HS256                                 | SpotAlong token signing        |
| `ACCESS_TOKEN_EXPIRE_MINUTES`           | 60                                                 | SpotAlong access JWT lifetime  |
| `REFRESH_TOKEN_EXPIRE_DAYS`             | 30                                                 | SpotAlong refresh JWT lifetime |
| `SPOTIFY_CLIENT_ID/SECRET/REDIRECT_URI` | — / — / `http://localhost:8000/api/login/callback` | Spotify OAuth app              |
| `SERVER_HOST` / `SERVER_PORT`           | `0.0.0.0` / `8000`                                 | bind address                   |
| `NGROK_ENABLED/AUTH_TOKEN/DOMAIN`       | True / — / —                                       | public tunnel for local dev    |

## 4. database.py — Async SQLAlchemy

- `create_async_engine(settings.DATABASE_URL)` + `async_sessionmaker(expire_on_commit=False)`.
- `Base(DeclarativeBase)` — all models inherit from this.
- `get_db()` — FastAPI dependency yielding an `AsyncSession`.
- `init_db()` — `Base.metadata.create_all` inside a connection (run once at startup).

## 5. models/ — Database Tables

### `User` (users)

The central table; doubles as login-staging area before the account is "real".

| Column group      | Columns                                                                         | Notes                                              |
| ----------------- | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| Identity          | `id`, `friend_code` (unique, 6 chars), `display_name`, `username`, `avatar_url` | filled after Spotify callback                      |
| SpotAlong tokens  | `access_token`, `refresh_token`, `token_expiry`                                 | current valid pair (rotation enforced)             |
| Spotify tokens    | `spotify_access_token`, `spotify_refresh_token`, `spotify_token_expiry`         | from OAuth exchange                                |
| Login staging     | `spotify_state`, `login_code`, `login_code_expiry`                              | OAuth CSRF state + 6-digit redeem code (5 min TTL) |
| Presence/playback | `last_online`, `last_song_id`, `last_progress`, `last_is_playing`               | playback snapshot written by websocket             |
| Privacy           | `privacy_mode` enum(`friends`,`none`,`everyone`)                                | broadcast setting                                  |
| Timestamps        | `created_at`, `updated_at`                                                      |                                                    |

### `Friend` (friends)

A friendship is **two mirrored directed rows**:

```
row A: user_id=Alice, friend_id=Bob, direction='sent',     status='pending'
row B: user_id=Bob,   friend_id=Alice, direction='received', status='pending'
```

- `status` ∈ {`pending`, `accepted`, `declined`} — updated on both rows together.
- Unique constraint `(user_id, friend_id)`; FKs cascade on delete.

### `ListenSession` (listen_sessions)

Who is listening along to whom: `(listener_id, target_id)` unique pair with `active` bool + optional `state` text. Sessions are upserted/deactivated rather than deleted.

### `CacheEntry` (cache_entries)

Generic key/value store keyed by namespaced strings:

- `album_colors:{album_id}` → RGB triples JSON
- `album_feather:{album_id}` → feathered image data
- `song_name:{uri}` → track name

Has `expires_at` + indexes on key/expiry.

## 6. schemas/ — Pydantic Shapes

- `auth.py`: `LoginResponse{auth_url, expiry_timestamp}`, `RedeemRequest{code}`, `RedeemResponse{access_token, refresh_token, timeout}`, `RefreshRequest{access_token, refresh_token}`, `RefreshResponse{token, refresh_token, timeout}`, `TokenData{user_id}`.
- `user.py`: `UserResponse`, `FriendResponse` (serialization shapes).
- `friend.py`: `FriendRequest{friend_code}`, `FriendAction{requester_id}`.

Note: routes mostly return plain dicts; schemas document intent more than they enforce.

## 7. utils.py — Codes & JWTs

- `generate_friend_code()` — 6 chars `[A-Z0-9]` (what users share to add each other).
- `generate_login_code()` — 6 digits (also reused as OAuth `state`).
- `create_access_token(user_id)` / `create_refresh_token(user_id)` — python-jose JWTs, claims `{sub: str(user_id), exp, type: access|refresh}`.
- `decode_token(token)` — verify + return payload or `None`.

## 8. services/ — Business Logic

### spotify_oauth.py

Thin httpx wrappers around Spotify:

- `get_authorize_url(state)` — build authorize URL (scopes: `user-read-playback-state user-modify-playback-state user-read-currently-playing streaming app-remote-control`).
- `exchange_code(code)` — authorization-code grant → tokens dict.
- `refresh_spotify_token(refresh_token)` — refresh grant.
- `get_spotify_user_info(access_token)` — GET `/v1/me` (display name, id, avatar).

### auth_service.py — the login state machine

```
initiate_login()            handle_spotify_callback()      redeem_login_code()
────────────────            ─────────────────────────      ───────────────────
dummy User row        ───►  find row by spotify_state ───► validate code+expiry
+ login_code (6 dig)        exchange code for tokens       mint SpotAlong JWT pair
+ state                     fetch /v1/me profile           store tokens on row
+ 5 min expiry              save spotify tokens/profile    clear login_code
                            (returns login_code)           return {access,refresh,timeout}
```

- `refresh_access_token(old_access, old_refresh)` — decodes the **refresh** JWT, requires it to match the one stored on the User row (single-session rotation), then issues and stores a fresh pair. Returns `{token, refresh_token, timeout}`.
- `check_eligible(token)` — validates an access JWT and that `user.token_expiry` is still in the future (the client's session-liveness probe).

### friend_service.py

- `send_friend_request(user_id, friend_code)` — resolves target by code, rejects self/duplicate, creates the two mirrored pending rows.
- `respond_friend_request(user_id, requester_id, accept)` — flips both rows' status to accepted/declined.
- `remove_friend(user_id, friend_id)` — deletes both mirrored rows.
- `get_friends` / `get_friend_requests` / `get_outbound_requests` — queries by status/direction.

### listen_service.py

- `start_listening(listener_id, target_id)` — upsert `ListenSession(active=True)`.
- `end_listening(listener_id, target_id)` — set `active=False`.
- `get_listeners(target_id)` — all active listeners of a target.

## 9. routes/ — REST API

All authenticated routes read the raw `authorization` header and decode it as a SpotAlong JWT (no FastAPI dependency abstraction — each route does `decode_token(request.headers.get("authorization"))`).

### `/api/login` (routes/auth.py)

| Method & path                | Body/params                     | Returns                                  | Notes                                                                             |
| ---------------------------- | ------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| GET `/api/login`             | —                               | `{auth_url, expiry_timestamp}`           | creates dummy user + login code + state; builds Spotify authorize URL server-side |
| GET `/api/login/callback`    | `?code&state`                   | `{message, code}`                        | OAuth redirect target; returns the 6-digit code the user types into the client    |
| GET `/api/login/redeem_code` | `?code`                         | `{access_token, refresh_token, timeout}` | swaps code for JWTs                                                               |
| GET `/api/login/eligible`    | header token                    | `{eligible: true}`                       | 401 `"Timed out."` when expired — the client's liveness probe                     |
| POST `/api/login/refresh`    | `{access_token, refresh_token}` | `{token, refresh_token, timeout}`        | rotates the pair                                                                  |

### `/api/friends` (routes/friends.py)

| Method & path          | Input                | Effect              |
| ---------------------- | -------------------- | ------------------- |
| POST `/friend_request` | body `{friend_code}` | create pending pair |
| POST `/remove_friend`  | body `{friend_code}` | delete both rows    |
| POST `/accept`         | query `requester_id` | accept              |
| POST `/decline`        | query `requester_id` | decline             |

### `/api/me` (routes/me.py)

- POST `/status_broadcast` — updates `privacy_mode` from JSON body (key `privacy_mode`).

### `/api/cache` (routes/cache.py)

Read-through cache endpoints backed by `CacheEntry`:

- GET `/colors/{album_id}` → `{colors}`
- GET `/album/{album_id}` → `{image}`
- GET `/name/{song_uri}` → `{name}`
- POST `/precache` → `{success: true}` (accepts the client's queue upload; currently a stub — nothing is persisted)

404 when the key isn't cached; 401 without a valid JWT.

## 10. socketio/server.py — Realtime Layer

Single namespace: **`/api/authorization`** (`AuthorizationNamespace`), an `AsyncServer(async_mode="asgi", cors_allowed_origins="*")`.

### Handshake — `on_connect(sid, environ)`

1. Requires HTTP header `authorization: Bearer <access JWT>` on the connect request.
2. Decodes JWT (`type == "access"`), loads the User row; rejects otherwise.
3. Stamps `last_online = now`, saves `{user_id}` into the socket session.
4. Emits the full startup snapshot to just this socket:
   - `Authorized {user_id}`
   - `friend_list [...]`
   - `friend_requests [...]`
   - `outbound_friend_requests [...]`

### `on_disconnect`

Updates `last_online` (presence tracking).

### `on_send_current_state(sid, data)`

The heartbeat of listen-along:

1. Writes `{songid, progress, is_playing}` onto the sender's User row (so late joiners see state).
2. Loads active listeners via `get_listeners`.
3. Emits `listening_state <data>` — currently back **to the sender** (`to=sid`) rather than fan-out to listeners (see §13).

### `on_start_listening(sid, target_id)` / `on_end_listening(sid, target_id)`

Persists/deactivates the `ListenSession`, then notifies the **target**: emits `start_listening_from_user <listener_id>` / `end_listening_from_user <listener_id>` to the target's sockets.

### Serialization helpers

`_get_friends_data`, `_get_friend_requests_data`, `_get_outbound_requests_data` convert DB rows into the flat dicts the legacy client expects (`id, friend_code, display_name, username, avatar_url, last_online, last_song_id`, …).

## 11. run_server.py & Deployment

Repo-root launcher:

```python
uvicorn.run("server.app:socket_app", host=settings.SERVER_HOST,
            port=settings.SERVER_PORT, reload=True)
```

- Always run through `run_server.py` (or reference `server.app:socket_app`) — running `server.app:app` directly would serve REST but **not** websockets.
- `server/__init__.py` etc. make `server` a package; `app.py` inserts the repo root into `sys.path` so `from server.config import ...` works either way.
- Ngrok tunnel gives the client's `url.json` a public `REGULAR_BASE` for LAN-free testing.

## 12. End-to-End Flows

### Login (code-based OAuth)

```
Client                 Server                                Spotify
  │ GET /api/login        │                                     │
  │◄─ auth_url, expiry ───│ (dummy user + state + login_code)   │
  │ browser opens auth_url ───────────────────────────────────►│
  │                       │◄─ GET /callback?code&state ─────────│ redirect
  │                       │ exchange code, GET /v1/me           │
  │ user types 6-digit code shown in browser                     │
  │ GET /redeem_code?code │                                     │
  │◄─ {access, refresh, timeout} (JWTs stored on User row)       │
  │ ws connect (Bearer JWT) → Authorized + friend_list …         │
```

### Live listen-along relay

```
Host client                    Server                         Listener client
  │ send_current_state          │                                │
  │ {songid,progress,...} ─────►│ store on User                  │
  │                             │ listening_state ──────────────►│ recieve_state:
  │                             │                                │ play/pause/seek/song
  │ start_listening(target) ───►│ ListenSession active=True      │
  │                             │ start_listening_from_user ────►│ (host notified)
```

### Friend requests

```
A POST /friend_request {friend_code:B} → rows(A→B sent, B→A received, pending)
B POST /accept?requester_id=A          → both rows 'accepted'
next B ws reconnect snapshot includes A in friend_list
```

## 13. Quirks & Gotchas

Things worth knowing before changing code (all verified against current source):

1. **`listening_state` goes to the sender** — `on_send_current_state` iterates listeners but emits `to=sid`. In this simplified implementation the echo drives the sender's own sync path; true fan-out would emit per-listener sid.
2. **`/api/me/status_broadcast` key mismatch** — route reads `privacy_mode` from the body while the legacy client posts `{'broadcast': bool}`; the toggle silently no-ops unless keys align.
3. **`/precache` is a stub** — accepts and acknowledges queue uploads but stores nothing.
4. **Accept/decline take `requester_id` as a query param**, not the `FriendAction` schema.
5. **Token rotation = single session** — refresh requires the presented refresh JWT to equal the stored one; logging in elsewhere invalidates the previous session's refresh ability.
6. **CORS wide open** (`*`) and default dev `JWT_SECRET` — fine locally, must be tightened for production.
7. **`login_code` lookup is global** — codes are unique by generation but there's no rate limiting on `/redeem_code`; add throttling before exposing publicly.
8. **MySQL-specific defaults** — `DateTime(3)` millisecond precision assumes MySQL/MariaDB via asyncmy.

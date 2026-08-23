# SpotAlong Client — Deep Dive

Complete reference for everything inside `client/` — the PyQt5 desktop app users install.
Companion doc: [`server-deep-dive.md`](server-deep-dive.md).

---

## Table of Contents

1. [Big Picture](#1-big-picture)
2. [app.py — Entry Point & MainUI](#2-apppy--entry-point--mainui)
3. [mainclient.py — MainClient (the orchestrator)](#3-mainclientpy--mainclient-the-orchestrator)
4. [spotifyclient/ — Spotify Integration](#4-spotifyclient--spotify-integration)
5. [ui/ — Windows, Widgets & Update Threads](#5-ui--windows-widgets--update-threads)
6. [utils/ — Helpers](#6-utils--helpers)
7. [Packaging (build.py, app.spec, install.nsi)](#7-packaging)
8. [On-Disk Data Layout](#8-on-disk-data-layout)
9. [End-to-End Flows](#9-end-to-end-flows)

---

## 1. Big Picture

```
┌───────────────────────────────────────────────────────────────────┐
│                            client/                                │
│                                                                   │
│  ┌───────────────┐  signals   ┌─────────────────────────────┐     │
│  │     ui/       │◄──────────►│        mainclient.py        │     │
│  │ PyQt5 windows │            │  socket.io ⇄ SpotAlong      │◄─┐  │
│  │ + QThreads    │            │  REST ⇄ SpotAlong           │  │  │
│  └───────▲       │            └──────────┬──────────┬───────┘  │  │
│          │       │                       │          │          │  │
│          │       │            emit state │          │ receive  │  │
│          │       │                       ▼          ▼ friend    │  │
│  ┌───────┴───────┴──────┐     ┌──────────────────────────┐     │  │
│  │ utils/ (colors, DPI, │     │ spotifyclient/           │     │  │
│  │ login, eliding…)     │     │ SpotifyPlayer  (control) │     │  │
│  └──────────────────────┘     │ SpotifyListener(sync)    │     │  │
│                               │ SpotifyClient/Song(data) │     │  │
│                               └────────────┬─────────────┘     │  │
└────────────────────────────────────────────┼───────────────────┘  │
                                             ▼                      │
                                      open.spotify.com              │
                                   (unofficial web API)             │
                                                                    │
                    SpotAlong server ◄──────────────────────────────┘
                    (friends, auth, relay)
```

Three "worlds" the client lives in:

| World             | Talks to                                     | Via                                                       |
| ----------------- | -------------------------------------------- | --------------------------------------------------------- |
| SpotAlong network | `server/`                                    | Socket.IO websocket (`/api/authorization`) + FastAPI REST |
| Spotify           | `open.spotify.com` unofficial web-player API | HTTPS + raw WebSocket (`guc3-dealer.spotify.com`)         |
| Local machine     | data dir, keyring, localhost TCP             | files, `keyring`, sockets                                 |

---

## 2. app.py — Entry Point & MainUI

### 2.1 Startup sequence (`if __name__ == '__main__'`)

1. **Singleton guard** — before Qt even loads:
   - Checks if TCP port `49475` (override with `--port=N` / `-p=N`) is in use via `psutil.net_connections()`.
   - If occupied, connects and sends `b'raise'` so the running instance brings its window to front, then exits.
   - `--ignore-singleton` skips this check.
2. **Py3.10+ shim** — aliases `collections.MutableMapping` (old dependency compat).
3. **Logging** — four sinks: console, rotating file `spotalong.log`, an in-memory `StringIO` (fed to the in-app Log Viewer), and `mainclient.watcher` (a second StringIO used to detect dead sockets).
4. **Custom `sys.excepthook`** — prints and exits on uncaught exceptions.
5. **IPv6 disabled** for `requests` (speed hack).
6. **QApplication setup** — Windows AppUserModelID (`CriticalElement.SpotAlong`) so the taskbar groups correctly.
7. **First run** — if `<data_dir>/icons` is missing, shows a placeholder window while `DefaultFilesExtractor` unzips `default_files.zip`.
8. **The `starting` dict** — a crude state machine shared between threads/windows:
   - `'first'` → successful `login()` result `(access_token, refresh_token, timeout)`
   - `'second'` → login failed, show the manual login screen
   - `'third'` / `'fourth'` → constructed `MainClient`
   - `'previous_exit_code'` → survives restarts of the flow
9. **Login thread** — `login_to_api()` runs `utils.login.login()`; on failure sets `'second'`.
10. **Window chain** — `LoggingInUi` → (`LoadingScreenUi` → builds `MainUI`) or (`LoginUi`).
11. **Restart loop** — `while (exit_code := app.exec()) >= 1:` restarts the whole login flow.
    Exit codes: `0` clean quit · `1` re-login after code redemption · `3` missing/corrupt default files (re-extract) · `4` log out · `-3`/`-4` fatal errors.

### 2.2 `MainUI(UiMainWindow)` class

Decorated with `@adjust_sizing()` (see [utils/uiutils](#6-utils--helpers)) which rescales every child widget for non-1080p@120dpi screens.

Responsibilities:

- **Frameless chrome** — custom title bar (`label_4`/`label_7` drag zones), min/max/close buttons, `QSizeGrip`, double-click-to-maximize, all handled in `eventFilter`.
- **Widget construction at load** — for each friend it spawns `Runnable` threads that build `PartialStatusWidget`, `PartialPastFriendStatus`, `PartialAdvancedUserStatus` off the GUI thread, then blocks with `processEvents()` loops until each lands (progress bar steps 60→80).
- **Friend buckets** — dicts `listeningfriendlist` / `onlinefriendlist` / `offlinefriendlist` mapped into three columns with count labels.
- **Sidebar navigation** — `set_main_menu(page, button, icon, name)` swaps the stacked-widget page and restyles buttons with the accent color; hamburger button animates sidebar width (60↔150 px).
- **Settings UI**
  - 9 accent-color checkboxes → `change_accent_color()` rewrites stylesheets across every registered widget and persists.
  - Window transparency slider (0–100).
  - Album cache size slider/text box (10 MB–5 GB, accepts `MB`/`GB` strings).
  - Clear album cache button, View Logs button (`LogViewer`).
- **Friend-code entry** — regex validator `\d{4}-\d{4}-\d{4}`; client-side checks (self-friend, already friends, pending either direction) before POSTing `/api/friends/friend_request`.
- **Update workers** (QThreads, see section 5.4): `worker`…`worker5`, plus a 1-second `QTimer` driving `worker2.update_friend_statuses`.
- **Snack bars** — `show_snack_bar()` shows one toast at a time (4 s); `show_snack_bar_threadsafe()` marshals cross-thread calls through a `Runnable`; falls back to tray balloon notifications when minimized.
- **Tray icon** — Show / Minimize To Tray / Quit menu; click restores window (Win32 `SetForegroundWindow`).
- **Overlays** — semi-transparent `overlay` behind dialogs, `DisconnectBanner` during websocket reconnects.
- **Persistence** — `change_file()` writes `config.json`: `{accent_color, window_transparency, album_cache_maxsize}`.
- **Teardown** — `stop_all()` stops every timer/thread, sends `b'close'` to the singleton socket, disconnects client + player; `stop_all_fast()` closes first.

---

## 3. mainclient.py — MainClient (the orchestrator)

`MainClient` owns the connection to the SpotAlong server and keeps the authoritative in-memory state the UI polls.

### 3.1 Construction

```python
MainClient(access_token, refresh_token, timeout, progress_bar)
```

- Loads two JSON caches from the data dir: `color_cache.json` (album colors) and `profile_cache.json` (avatar colors).
- Creates `SpotifyPlayer`:
  1. Try stored cookie from keyring (`cookie0..cookieN` chunks + `cookie_len`).
  2. Fallback: scrape Chrome cookies via `browser_cookie3`.
  3. If both fail → `spotifyplayer = None` → playback/listen-along features disabled with a dialog.
- Registers itself as an event receiver on the player (`send_next_for_listening`, `send_state_for_listening`).
- Connects Socket.IO to `REGULAR_BASE` with headers `{authorization: Bearer <token>, version: VERSION}`, namespace `/api/authorization`.

### 3.2 Dynamic attributes (`__getattribute__` magic)

Two _virtual_ attributes are computed on access instead of stored:

- `client.mainstatus` → own current `SpotifySong` (parsed fresh from `spotifyclient.song_data`).
- `client.friendstatus` → `{friend_id: SpotifySong}` for every friend.

This means the UI always reads live state without needing refresh calls.

### 3.3 Socket.IO event handlers

Registered in `add_event_listeners()`:

| Event                                                     | Handler behavior                                                                                                                                                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect`                                                 | clears `disconnected` flag                                                                                                                                                             |
| `Authorized`                                              | stores `id`/`friend_code`, creates own `SpotifyClient` (progress bar → 40)                                                                                                             |
| `friend_list`                                             | fills `self.friends` with a `SpotifyClient` per friend                                                                                                                                 |
| `friend_requests` / `outbound_friend_requests`            | fill request dicts                                                                                                                                                                     |
| `song_update`                                             | routes payload to self or the right friend's `SpotifyClient.song_data`; caches album colors + downloads feathered album art                                                            |
| `user_update`                                             | updates profile info; caches circular-cropped avatars + dominant colors; counts `initialized_friends` until all friends loaded → `initialized = True`                                  |
| `new_request` / `remove_request` / `new_outbound_request` | maintain request dicts                                                                                                                                                                 |
| `new_friend` / `remove_friend`                            | add/remove `SpotifyClient`s + snackbar                                                                                                                                                 |
| `settings`                                                | privacy toggle → `song_broadcast`                                                                                                                                                      |
| `start_listening_from_user`                               | adds listener id, starts 1 s UI timer, snackbar, force-pushes next queue item                                                                                                          |
| `end_listening_from_user`                                 | removes listener, stops timer when none left                                                                                                                                           |
| `add_to_queue`                                            | clears manual queue then queues the requested track (waits out last 3 s of current song first)                                                                                         |
| `listening_state`                                         | **listen-along sync**: match play/pause, repeat mode, seek if drift > 3 s, or play the host's songid entirely; bumps `external_handle` so the local `SpotifyListener` loop stands down |
| `disconnect_user` / `connect_error` / `disconnect`        | reconnect machinery below                                                                                                                                                              |

### 3.4 Reconnection logic

- On generic disconnect: ends any listen session, shows `DisconnectBanner`, then loops: rebuild a fresh `Client`, re-register listeners, reconnect; sleep 5 s between failures.
- On `Invalid credentials`: calls `refresh()` once and reconnects with the new token.
- `Duplicate session detected` → treated as fatal logout path.
- Background task `check_logs()` watches the internal log stream for `packet queue is empty, aborting` (python-socketio death symptom) and kills the client so the reconnect path takes over.

### 3.5 REST helper — `invoke_request(url, data, request_type, callback, failed)`

- Waits out concurrent token refreshes (`_is_refreshing` flag).
- Auto-refreshes the access token when `time.time() > timeout`; on HTTP 401 re-checks `/login/eligible` and retries once; exits with code 401 if refresh fails.
- Invokes `callback(resp)` whether the callback takes 0 or 1 args (introspected via `inspect.signature`).

### 3.6 Listen-along broadcasting (when _others_ listen to you)

- `send_state_for_listening()` — throttled to 5 Hz; emits `send_current_state {songid, progress, is_playing, looping}`.
- `send_next_for_listening(force)` — emits `upload_precache <next_track_uri>` when your queue head changes, so listeners can pre-fetch.
- `send_queue_for_caching()` — POSTs your whole queue JSON to `/cache/precache`.

### 3.7 `quit(code)`

Stops UI threads (`stop_all_fast` for code 0 else `stop_all`), disconnects player + socket, exits the Qt loop; negative codes hard-exit via `os._exit`.

---

## 4. spotifyclient/ — Spotify Integration

### 4.1 `SpotifySong` (spotifysong.py)

Immutable-ish value object (~20 fields) describing one playback snapshot:

- Track: `songname, songid, songlink, song_authors(+urls)`
- Context: `contexttype/contextdata/contexturl` (playlist/album/artist it was started from)
- Timing: `progress` (**seconds**) vs `duration` (**milliseconds**) — beware mixed units
- Album: `albumname, albumnlink (sic), albumimagelink`
- State: `is_playing`, `playing_type` ∈ {`track`, `ad`, `local file`, `episode`, `None`}
- Owner: `clientusername, clientavatar, client_id, friend_code`
- Presence: `playing_status` ∈ {`Listening`, `Online`, `Offline`}
- History: `last_song` (nested `SpotifySong`) + `last_song_timestamp` (UTC → local tz)

### 4.2 `SpotifyClient` (spotifyclient.py)

One instance per known user (you + each friend). Holds `user_data` (profile) and `song_data` (raw currently-playing payload).

- `spotifySongParse(track)` — converts Spotify's raw payload into a `SpotifySong`, special-casing:
  - ads (`currently_playing_type == 'ad'`)
  - local files (`item.is_local`)
  - nothing playing → placeholder with `playing_type='None'`
- `spotifysong()` — parse-or-placeholder accessor used by `MainClient.mainstatus`/`friendstatus`.
- `user_update()` — extracts display name + smallest avatar URL.

### 4.3 `SpotifyPlayer` (spotifyplayer.py) — the unofficial web-player API

Mimics what open.spotify.com does, granting premium-like remote control **without Premium**.

**Auth chain**

1. `get_access_token()` — GET `open.spotify.com/get_access_token?...productType=web_player` using cookies:
   - preferred: cookie string stored in keyring by the installer/login flow,
   - fallback: live Chrome cookies via `browser_cookie3.chrome()` (requires `sp_t` cookie).
2. WebSocket connect to `wss://guc3-dealer.spotify.com/?access_token=...` → captures `Spotify-Connection-Id`.
3. Registers a **fake Connect device**: random 40-char `device_id`, name "Spotify Player", model `web_player`, full capability manifest → POST `track-playback/v1/devices`, PUT hobs device state, PUT notifications subscription.
4. Runs three asyncio tasks in a background `Thread` (with a `SelectorEventLoop` workaround): websocket reader, 30 s ping loop, scheduled token refresh.

**State tracked from cluster updates:** `player_state` (queue, position, timestamps), `devices`, `active_device_id`, `current_volume`, `playing`, `shuffling`, `looping` (`track`/`context`/`off`), `queue_revision`.

**Command vocabulary** (class attrs / static builders returning command dicts):

`pause, resume, skip, previous, repeating_track, repeating_context, no_repeat, shuffle, stop_shuffle, volume(v), seek_to(ms), add_to_queue(id), play(id), remove_from_queue, clear_queue, queue_playlist, play_playlist, queue_from_uris, play_from_uris, play_from_context, queue_from_context`

**`command(dict)` execution**

- Resolves target device (`active_device_id`, else queries `/v1/me/player`, transferring playback if needed).
- POSTs to `connect-state/v1/player/command/from/{our_device}/to/{target}`.
- Retries once on failure; on `queue_revision_mismatch` patches the revision and retries.
- Sleeps 0.5 s after every command (rate limiting).

**Position extrapolation** — `get_position()` = `_last_position + (now − server_time_diff − _last_timestamp)`; frozen when paused.

**Resilience** — on websocket death: marks disconnected, notifies receivers, then loops `_authorize()` retries (15 s backoff) until restored; receivers are re-added afterwards.

### 4.4 `SpotifyListener` (spotifylistener.py) — following a friend

Created per listen-along session (`ListeningToFriends` page).

- `play_song(song)` — waits while you're hearing an ad, then starts `listener()` thread.
- `listener()` loop:
  - Ends session when: player disconnected (after 7 s grace), friend removed/offline, host stops playing a playable track, or `running=False`.
  - Same song as host? If progress drift > 3 s → `sync()`. Else idle 1 s.
  - Different song? If either side is within 3 s of song end → `wait_for_song_to_end()` (avoids cutting tracks off); otherwise immediately `play(host_songid)`; then waits until song ids match.
  - Defers while `external_handle > 0` (server-pushed state being applied).
- `sync()` — throttled to 2 s: pause/resume to match `is_playing`, seek to host progress.
- `end(reason)` — emits `end_listening` to server + snackbar.

---

## 5. ui/ — Windows, Widgets & Update Threads

### 5.1 `mainui.py` — `UiMainWindow`

Pure autogenerated Qt Designer output (`setupUi` / `retranslateUi`): frames, stacked pages (Home, Settings, Friends, Add Friend, Listen Along), scroll areas, sliders, checkboxes. No logic — everything is wired in `app.py`.

### 5.2 `loginwidgets.py` — the boot-time windows

| Class                   | Purpose                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LoggingInUi`           | First "Logging in…" window. A 100 ms QTimer polls the `starting` dict: `'first'` → loading screen, `'second'` → login screen; 15 s timeout → error dialog. `placeholder=True` mode runs `DefaultFilesExtractor` instead. `error_callback()` maps messages (`Spotify server error`, `Duplicate session detected`, `Outdated version`, `Timeout`) to QMessageBoxes. |
| `LoadingScreenUi`       | Splash image + progress bar. Polls for `starting['third']` (constructed `MainClient`), reads `config.json`, instantiates `MainUI`. Fatal errors → `exit_with_fatal_error()` with codes `-3`/`-4`.                                                                                                                                                                 |
| `LoginUi`               | Manual login. "Login with Spotify" → `create_user(emitter)` returns `(auth_url, expiry)`; browser opens Spotify OAuth; user types the 6-digit code shown on the website; "Verify Code" → `redeem_code()` stores tokens in keyring and exits with code `1` (restart flow).                                                                                         |
| `DefaultFilesExtractor` | QThread that unzips `default_files.zip` into the data dir.                                                                                                                                                                                                                                                                                                        |

### 5.3 `customwidgets.py` — runtime widgets (~5000 lines)

Naming convention: **`Partial*` classes do heavy work off the GUI thread** (image download, color extraction, layout math); `.convert_to_widget()` (called on the GUI thread via signals) instantiates the real QWidget.

| Widget                                           | Role                                                                                                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `StatusWidget` / `FriendsListStatusWidget`       | Top-bar card + friends-panel card showing avatar, name, song, colored accent button ("Listen Along" etc.)                                                                                |
| `BasicUserStatusWidget`                          | Your own large status card (home page header)                                                                                                                                            |
| `PlaybackController`                             | Bottom player bar: transport controls, shuffle/repeat, volume slider, seek slider, device picker, queue interactions; drives `SpotifyPlayer.command`; regenerates themed icons on resize |
| `InboundFriendRequest` / `OutboundFriendRequest` | Request cards; accept/decline call `/api/friends/accept                                                                                                                                  | decline` |
| `PastFriendStatus`                               | Friend-history cards ("Now" or time-ago)                                                                                                                                                 |
| `AdvancedUserStatus`                             | Detailed card with live per-second progress bar                                                                                                                                          |
| `ListedFriendStatus`                             | Compact rows for Listening/Online/Offline columns                                                                                                                                        |
| `DeviceList` / `Device`                          | Spotify Connect device popup; click → `transfer(device_id)`                                                                                                                              |
| `Dialog`                                         | Modal confirm popup (title/description/accept/cancel), draggable, closable by clicking outside                                                                                           |
| `Tooltip`                                        | Custom hover tooltip                                                                                                                                                                     |
| `ListeningToFriends`                             | "Listen Along" page: who's listening to you, session durations, end-session controls                                                                                                     |
| `DisconnectBanner`                               | Full-window overlay during websocket reconnects                                                                                                                                          |
| `SnackBar`                                       | Animated toast notifications                                                                                                                                                             |
| `LogViewer`                                      | In-app table view of the captured log stream                                                                                                                                             |

### 5.4 Update threads (bottom of customwidgets.py)

All poll in-memory state every ~0.25 s and push diffs to the GUI via `pyqtSignal` emitters (never touch widgets directly).

| Thread                                | Watches                                    | Emits                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MainUpdateThread` (worker)           | your own song/avatar/status/name/id        | `PartialBasicUserStatusWidget`, `PartialPlaybackController`, `PartialListeningToFriends`; also triggers queue caching when status becomes Listening                 |
| `FriendUpdateThread` (worker2)        | every friend's snapshot vs rendered widget | tuple of 4 partial widgets per changed friend, or `DeleteWidget` for gone friends; `update_friend_statuses()` recomputes counts + "X listening along (1m 20s)" text |
| `RequestUpdateThread` (worker3)       | inbound/outbound request dicts             | new `Partial*FriendRequest` or `DeleteWidget`                                                                                                                       |
| `FriendHistoryUpdateThread` (worker4) | friends' last-played changes               | `PartialPastFriendStatus` / `DeleteWidget`                                                                                                                          |
| `SocketListener` (worker5)            | localhost TCP server on port 49475         | `b'raise'` → restore window; `b'close'` → shut down singleton socket                                                                                                |

`DeleteWidget` is a plain wrapper that lets a signal carry "delete these widget keys" payloads.

---

## 6. utils/ — Helpers

### constants.py

- `BASE_URL` (REST, default `http://localhost:8000/api`) and `REGULAR_BASE` (default `http://localhost:8000/`) read from `<data_dir>/url.json` (created with defaults if missing) — this is how you point the client at a different server.
- `VERSION = '1.0.2'` — sent in websocket headers; server rejects mismatches ("Outdated version").

### login.py — SpotAlong auth API wrappers

- `login()` — reads `auth_token` JSON from keyring; refreshes if expired; verifies via GET `/login/eligible`; returns `(access_token, refresh_token, timeout)` or False.
- `refresh(access, refresh)` — POST `/login/refresh`; persists new tokens to keyring.
- `create_user(emitter)` — GET `/login` → `(auth_url, expiry_timestamp)` pushed through a list-as-emitter for cross-thread handoff.
- `redeem_code(code)` — GET `/login/redeem_code?code=` → tokens stored in keyring.

### utils.py — images & colors

- `extract_color(url)` (`lru_cache`d) — dominant/dark/text color triple for album art. Cascade: local `color_cache.json` → server `/cache/colors/{id}` → local ColorThief palette + luminance math (brightness thresholds 107/121/169, vividness weighting, closeness checks) to guarantee readable contrast. Result cached to disk.
- `feather_image(url)` — bakes a 35 px alpha fade on all edges of the raw album art (used when the server's pre-feathered copy is unavailable).
- `download_album(url)` — fetches raw art to `partialalbum{id}.png`, tries the server's feathered copy (`/cache/album/{id}`), cleans cache in a background thread.
- `clean_album_image_cache(url)` — enforces the MB limit by deleting oldest `*album*` files (protecting `unknown_album.png` variants).
- `convert_from_utc_timestamp(ts)` — UTC → local epoch.

### uiutils.py — DPI/scaling witchcraft

The app was authored at 1080p @ 120 dpi (125%); everything scales relative to that baseline.

- `get_ratio()` — `min(dpi/120, height/1080)`, floored at ⅓.
- `DpiFont(QFont)` — monkeypatched over `QtGui.QFont` to rescale point sizes.
- `adj(r, *sizes)` — clamps scaled sizes to Qt's 16777215 max.
- `adj_style(r, stylesheet)` — regex-scales every `Npx` value in a stylesheet (keeps ≥1 px borders alive).
- `adjust_sizing()` — class decorator that walks every QWidget/layout/spacer attribute and rescales geometry, margins, spacing, stylesheets; honors `widgets_to_ignore` / `styles_to_ignore`.
- `scale_images` / `scale_one` — resize icon PNGs, writing `*scaled.png` variants.
- Text eliding: `limit_text` (char count), `limit_text_smart` (fontMetrics), `limit_text_rich` (bold-segment aware recursion).
- `Runnable(QThread)` — run any callable off-thread, deliver its return value via `callback` signal (the app's universal threading primitive).
- `safe_color` — decorator marking widgets whose stylesheets must never be accent-recoloried (`/* NO ACCENT COLOR */`).

---

## 7. Packaging

| File                | Role                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `build.py`          | One-shot build script: PyInstaller exe → zips deps → compiles NSIS installer (`SpotAlong-Installer.exe`). Requires makensis + nsisunz/ApplicationID plugins. |
| `app.spec`          | PyInstaller spec (entry `app.py`, bundled assets).                                                                                                           |
| `install.nsi`       | NSIS installer definition.                                                                                                                                   |
| `default_files.zip` | Icons, mask.png, splash, default images — extracted to the data dir on first run (or exit code 3).                                                           |
| `version_info.txt`  | Windows version resource metadata.                                                                                                                           |

---

## 8. On-Disk Data Layout

Everything lives under `user_data_dir('SpotAlong', 'CriticalElement')` (e.g. `%APPDATA%\SpotAlong\`):

```
SpotAlong/
├── spotalong.log          # file log sink
├── config.json            # accent_color, window_transparency, album_cache_maxsize
├── url.json               # BASE_URL / REGULAR_BASE override
├── color_cache.json       # album_id -> [dominant, dark, text] RGB triples
├── profile_cache.json     # user_id -> [dominant, dark, text]
├── icons/                 # extracted from default_files.zip (+ *scaled.png variants)
├── mask.png               # circular avatar mask
├── splash/, logo.ico, default images…
├── partialalbum{id}.png   # raw album art
├── album{id}.png          # feathered album art
└── icon{user_id}.png      # circular avatars
```

Credentials live in the **OS keyring** under service `SpotAlong`:
`auth_token` (JSON: access/refresh/timeout), `cookie0..cookieN` + `cookie_len` (Spotify web cookie).

---

## 9. End-to-End Flows

### Login

```
app.py ──login()──► keyring token valid? ──yes──► MainClient(ws connect)
   │ no/failed                                        │ Authorized
   ▼                                                  ▼
LoginUi ──browser OAuth──► server /login/callback ──► 6-digit code
   └──redeem_code(code)──► JWTs → keyring ──restart flow──┘
```

### Someone listens along to you

```
Friend clicks Listen Along
→ server: start_listening + emits start_listening_from_user
→ your MainClient.start_listening: snackbar + timer + send_next_for_listening(force)
→ your SpotifyPlayer events fire send_state_for_listening (≤5 Hz)
→ server relays listening_state → friend's recieve_state syncs their player
```

### You listen along to a friend

```
Click "Listen Along" on a StatusWidget
→ SpotifyListener(friend_id): wait out ad → play friend's songid
→ listener() loop: drift>3s ? sync() : wait ; song change ? play(new id)
→ any condition breaks (host stops, player dies) → end() → emit end_listening
```

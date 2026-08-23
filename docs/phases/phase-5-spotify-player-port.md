# Phase 5: Unofficial Spotify Player & Synchronization Sync Port

This phase addresses the translation of SpotAlong's most critical feature: the **unofficial Spotify playback engine (`spotifyplayer.py`)** and the **listen-along synchronization loop (`spotifylistener.py`)**. We will port these from Python to TypeScript.

---

## 1. Architectural Strategy: Client vs. Server Execution

In Python, the desktop app executes raw system cookie scraping and links directly to Spotify's dealer WS.
To adapt this under React, we choose between two architectures depending on the frontend container:

1. **Desktop App (Tauri / Electron) - Preferred**: 
   The player logic runs directly inside the client's Node/Native background thread. It enjoys direct access to keyrings, system cookies (`browser_cookie3` equivalent), and has no CORS limitations when calling Spotify's low-level sockets.
2. **Web SPA App (Standard Browser)**:
   The low-level dealer WebSocket and fake connect registration are hosted on the **Express.js backend** acting as a proxy. The browser React SPA simply sends simple command triggers to Express.

*The instructions below assume the **Tauri/Electron Client-Side Background Thread** model to preserve legacy premium-free local playback mechanics.*

---

## 2. Porting the Unofficial Web Player API

The `SpotifyPlayer` class will be rewritten as a TypeScript service utilizing `ws` for connection and native node extensions for credentials.

### 2.1 Web Player Engine Schema (`apps/client/src/services/spotifyPlayer.ts`)
```typescript
import WebSocket from 'ws';
import axios from 'axios';

export class SpotifyPlayer {
  private ws: WebSocket | null = null;
  private connectionId: string | null = null;
  private deviceId: string;
  private accessToken: string | null = null;

  // Track Positions
  private lastPosition: number = 0;
  private lastTimestamp: number = 0;
  private serverTimeDifference: number = 0;
  private isPaused: boolean = true;

  constructor() {
    this.deviceId = this.generateRandomDeviceId(40);
  }

  private generateRandomDeviceId(length: number): string {
    const chars = 'abcdef0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  /**
   * Step 1: Request Unofficial Web Player Token using stored sp_t cookie
   */
  async fetchWebPlayerToken(sptCookie: string): Promise<string> {
    const response = await axios.get('https://open.spotify.com/get_access_token', {
      params: {
        reason: 'transport',
        productType: 'web_player'
      },
      headers: {
        Cookie: `sp_t=${sptCookie}`
      }
    });
    this.accessToken = response.data.accessToken;
    return this.accessToken!;
  }

  /**
   * Step 2: Establish the Dealer WebSocket Connection
   */
  async connectToDealer(): Promise<void> {
    if (!this.accessToken) throw new Error('AccessToken missing');

    const url = `wss://guc3-dealer.spotify.com/?access_token=${encodeURIComponent(this.accessToken)}`;
    this.ws = new WebSocket(url);

    this.ws.on('message', (rawData: string) => {
      const data = JSON.parse(rawData);
      
      // Capture Spotity Connection Id
      if (data.headers && data.headers['Spotify-Connection-Id']) {
        this.connectionId = data.headers['Spotify-Connection-Id'];
        this.registerFakeConnectDevice();
      }

      this.handleDealerMessage(data);
    });
  }

  /**
   * Step 3: Register a Fake Web Connect Device (Premium Bypassing)
   */
  private async registerFakeConnectDevice(): Promise<void> {
    if (!this.connectionId || !this.accessToken) return;

    await axios.post(
      'https://g.spotify.com/track-playback/v1/devices',
      {
        device: {
          brand: 'spotify',
          capabilities: {
            change_volume: true,
            enable_play_token: true,
            supports_file_media_type: true
          },
          device_id: this.deviceId,
          name: 'SpotAlong Player',
          platform_identifier: 'web_player',
          type: 'computer'
        },
        connection_id: this.connectionId
      },
      {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      }
    );
  }

  /**
   * Extrapolate position cleanly between interval updates
   */
  public getPosition(): number {
    if (this.isPaused) return this.lastPosition;
    const elapsed = Date.now() - this.serverTimeDifference - this.lastTimestamp;
    return this.lastPosition + elapsed;
  }
}
```

---

## 3. Porting the Sync Listener (`spotifylistener.py`)

The companion sync loop will run inside a standard JavaScript interval, executing on-drift corrections without clogging the primary React renderer.

### 3.1 Sync Loop Engine (`apps/client/src/services/spotifyListener.ts`)
```typescript
import { SpotifySong } from '@spotalong/types';
import { SpotifyPlayer } from './spotifyPlayer';

export class SpotifyListener {
  private player: SpotifyPlayer;
  private intervalId: NodeJS.Timeout | null = null;
  private activeHostState: SpotifySong | null = null;

  constructor(player: SpotifyPlayer) {
    this.player = player;
  }

  public beginSyncSession(hostInitState: SpotifySong) {
    this.activeHostState = hostInitState;
    this.player.playSongUri(hostInitState.songId); // Force start

    this.intervalId = setInterval(() => this.runSyncLoop(), 1000);
  }

  private async runSyncLoop() {
    if (!this.activeHostState) return;

    const host = this.activeHostState;
    const localPositionSeconds = this.player.getPosition() / 1000;
    const drift = Math.abs(host.progress - localPositionSeconds);

    // 1. Skip check: Match Track Identity
    if (host.songId !== this.player.getCurrentTrackId()) {
      // Safe transition mechanism: prevent interrupting final seconds of local tracks
      const hostRemaining = host.duration / 1000 - host.progress;
      if (hostRemaining <= 3) {
        // Hold execution, allow song to resolve naturally
        return;
      }
      await this.player.playSongUri(host.songId);
      return;
    }

    // 2. Play/Pause state alignment
    if (host.isPlaying && this.player.isLocalPaused()) {
      await this.player.resume();
    } else if (!host.isPlaying && !this.player.isLocalPaused()) {
      await this.player.pause();
    }

    // 3. Position alignment (Drift larger than 3 seconds)
    if (drift > 3 && host.isPlaying) {
      await this.player.seek(host.progress * 1000);
    }
  }

  public endSyncSession() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.player.pause();
  }
}
```

---

## 4. Web Player Limitations & Mitigations

* **Ad Playback Safeguard**: When Spotify serves audio advertisements (`playingType === 'ad'`), the synchronization loops will automatically pause alignment corrections, restoring execution only once playable music media resolves.
* **Premium Warning Fallback**: If the Spotify token generation errors out (e.g. invalid `sp_t` cookie state), the app must gracefully display an overlay pointing users to execute a fresh Chrome cookie retrieval step.

---

## 5. Acceptance Criteria & Verification

To mark Phase 5 as complete, developers must verify:
1. Connecting a test client to `wss://guc3-dealer.spotify.com` completes handshake and yields valid connection IDs.
2. Confirm that running a mock host state update triggers correct play/pause alignment signals inside the Spotify Connect API.
3. Assert that drift values < 3 seconds do NOT trigger redundant REST API requests.

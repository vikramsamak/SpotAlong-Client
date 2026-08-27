import WebSocket from 'ws';
import axios, { AxiosInstance } from 'axios';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.66 Safari/537.36';

const DEFAULT_HEADERS: Record<string, string> = {
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': UA
};

export interface SpotifyAccessTokenResponse {
  accessToken: string;
  accessTokenExpirationTimestampMs: number;
}

export interface ClusterPlayerState {
  timestamp?: number;
  position_as_of_timestamp?: number;
  duration?: number;
  is_paused?: boolean;
  queue_revision?: number;
  next_tracks?: Array<{ uri: string; provider: string; metadata: Record<string, unknown> }>;
  options?: { shuffling_context?: boolean; repeating_context?: boolean; repeating_track?: boolean };
  track?: { uri?: string; metadata?: Record<string, unknown> };
}

export interface EngineState {
  playing: boolean;
  shuffling: boolean;
  looping: 'off' | 'track' | 'context';
  activeDeviceId: string;
  volume: number;
  positionMs: number;
  durationMs: number;
  trackUri?: string;
  queueRevision?: number;
  /** Track metadata extracted from the cluster update (title, album, artists, art) */
  track?: {
    name: string;
    album: string;
    artists: Array<{ name: string; url: string }>;
    albumImage?: string;
    songLink?: string;
    uri?: string;
  };
}

export interface EngineDevice {
  id: string;
  name: string;
  type?: string;
  isActive: boolean;
  volume?: number;
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export class SpotifyPlayerEngine {
  readonly deviceId = randomString(40);

  private http: AxiosInstance;
  private ws: WebSocket | null = null;

  private spTCookie: string;
  private accessToken = '';
  private accessTokenExpirySec = 0;
  private connectionId: string | null = null;
  private queueRevision?: number;
  private devices: Record<string, { name?: string; type?: string; volume?: number }> = {};

  private initialized = false;
  private forceDisconnect = false;
  private reconnecting = false;

  private pingTimer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  private lastTimestampMs = 0;
  private lastPositionMs = 0;
  private clockDiffSec = 0;

  state: EngineState = {
    playing: false,
    shuffling: false,
    looping: 'off',
    activeDeviceId: '',
    volume: 65535,
    positionMs: 0,
    durationMs: 0
  };

  onStateChange: ((state: EngineState) => void) | null = null;
  onDisconnected: (() => void) | null = null;

  constructor(spTCookie: string) {
    this.spTCookie = spTCookie.startsWith('sp_t=') ? spTCookie : `sp_t=${spTCookie}`;
    this.http = axios.create({
      timeout: 15000,
      validateStatus: () => true,
      headers: DEFAULT_HEADERS
    });
  }

  async start(): Promise<void> {
    await this.authorize();
  }

  async stop(): Promise<void> {
    this.forceDisconnect = true;
    this.teardownTimers();
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
  }

  getPositionSec(): number {
    if (!this.state.playing) return this.lastPositionMs / 1000;
    let diff = Date.now() / 1000 - this.clockDiffSec - this.lastTimestampMs / 1000 - 1;
    if (diff < 0) diff = 0;
    return this.lastPositionMs / 1000 + diff;
  }

  getSnapshot(): EngineState & { positionSec: number } {
    return {
      ...this.state,
      positionSec: Math.floor(this.getPositionSec()),
      durationMs: this.state.durationMs
    };
  }

  getDevices(): EngineDevice[] {
    return Object.entries(this.devices).map(([id, device]) => ({
      id,
      name: device.name ?? id,
      type: device.type,
      volume: device.volume,
      isActive: id === this.state.activeDeviceId
    }));
  }

  private async authorize(): Promise<void> {
    this.initialized = false;
    this.connectionId = null;
    this.queueRevision = undefined;

    const token = await this.fetchAccessToken();
    this.accessToken = token.accessToken;
    this.accessTokenExpirySec = token.accessTokenExpirationTimestampMs / 1000;

    await this.openDealerSocket();

    const deadline = Date.now() + 10_000;
    while (!this.connectionId) {
      if (Date.now() > deadline) throw new Error('Timed out waiting for Spotify connection id');
      await sleep(200);
    }

    await this.registerDevice();
    await this.subscribeNotifications();
    await this.registerHobs();
    await this.hydrateInitialState();

    this.initialized = true;
    this.scheduleTokenRefresh();
  }

  private async fetchAccessToken(attempt = 0): Promise<SpotifyAccessTokenResponse> {
    try {
      const response = await this.http.get<SpotifyAccessTokenResponse>(
        'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
        {
          headers: {
            ...DEFAULT_HEADERS,
            cookie: this.spTCookie,
            referer: 'https://accounts.spotify.com'
          }
        }
      );
      if (response.status !== 200 || !response.data?.accessToken) {
        throw new Error(`Access token request failed (${response.status})`);
      }
      return response.data;
    } catch (error) {
      if (attempt >= 2) throw error;
      await sleep(1000);
      return this.fetchAccessToken(attempt + 1);
    }
  }

  private openDealerSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://guc3-dealer.spotify.com/?access_token=${this.accessToken}`;
      const ws = new WebSocket(url, { headers: { 'User-Agent': UA } });
      this.ws = ws;

      const failTimer = setTimeout(() => reject(new Error('Dealer socket handshake timeout')), 10_000);

      ws.on('open', () => {
        clearTimeout(failTimer);
        resolve();
        this.startPingLoop();
      });

      ws.on('message', (raw) => {
        this.handleDealerMessage(String(raw));
      });

      ws.on('close', () => {
        this.stopPingLoop();
        if (!this.forceDisconnect) void this.scheduleReconnect();
        else this.onDisconnected?.();
      });

      ws.on('error', (error) => {
        clearTimeout(failTimer);
        if (!this.forceDisconnect) console.error('Dealer socket error:', error.message);
      });
    });
  }

  private handleDealerMessage(raw: string): void {
    let message: {
      headers?: Record<string, string>;
      payloads?: Array<{ items?: unknown[]; cluster?: ClusterStateCluster; update_reason?: string }>;
    };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    const connectionHeader = message.headers?.['Spotify-Connection-Id'];
    if (connectionHeader) {
      this.connectionId = connectionHeader;
      return;
    }

    const payload = message.payloads?.[0];
    if (!payload) return;

    if (payload.items) return;

    const cluster = payload.cluster as ClusterStateCluster | undefined;
    if (!cluster) return;

    this.applyCluster(cluster);
  }

  private applyCluster(cluster: ClusterStateCluster): void {
    const playerState = cluster.player_state ?? {};
    this.queueRevision = playerState.queue_revision;

    const activeDevice = cluster.active_device_id ?? '';
    this.state.activeDeviceId = activeDevice;
    this.devices = cluster.devices ?? {};
    if (activeDevice && cluster.devices?.[activeDevice]) {
      this.state.volume = cluster.devices[activeDevice].volume ?? 0;
    }

    this.state.playing = !playerState.is_paused;
    this.state.shuffling = playerState.options?.shuffling_context ?? false;
    this.state.looping = playerState.options?.repeating_track
      ? 'track'
      : playerState.options?.repeating_context
        ? 'context'
        : 'off';

    this.lastPositionMs = Number(playerState.position_as_of_timestamp ?? 0);
    this.lastTimestampMs = Number(playerState.timestamp ?? 0);
    if (typeof playerState.duration === 'number') this.state.durationMs = playerState.duration;
    this.state.trackUri = playerState.track?.uri;
    this.state.positionMs = this.lastPositionMs;

    this.state.track = this.extractTrack(playerState);

    this.onStateChange?.(this.getSnapshot());
  }

  private extractTrack(
    playerState: ClusterPlayerState
  ): EngineState['track'] | undefined {
    const metadata = playerState.track?.metadata;
    if (!metadata) return undefined;
    const uri = playerState.track?.uri;
    const name = String(metadata.title ?? metadata.name ?? '');
    const album = String(metadata.album_title ?? metadata.album_name ?? '');
    if (!name && !uri) return undefined;
    const albumImage =
      String(metadata.image_xlarge_url ?? metadata.image_url ?? '') || undefined;
    return {
      name: name || uri || '',
      album,
      artists: Array.isArray(metadata.artist_name)
        ? (metadata.artist_name as string[]).map((n) => ({ name: String(n), url: '' }))
        : metadata.artist_name
          ? [{ name: String(metadata.artist_name), url: '' }]
          : [],
      albumImage,
      uri
    };
  }

  private async registerDevice(): Promise<void> {
    const body = {
      device: {
        brand: 'spotify',
        capabilities: {
          change_volume: true,
          enable_play_token: true,
          supports_file_media_type: true,
          play_token_lost_behavior: 'pause',
          disable_connect: true,
          audio_podcasts: true,
          video_playback: true,
          manifest_formats: [
            'file_urls_mp3',
            'manifest_ids_video',
            'file_urls_external',
            'file_ids_mp4',
            'file_ids_mp4_dual'
          ]
        },
        device_id: this.deviceId,
        device_type: 'computer',
        metadata: {},
        model: 'web_player',
        name: 'SpotAlong',
        platform_identifier: 'web_player windows 10;chrome 87.0.4280.66;desktop'
      },
      connection_id: this.connectionId,
      client_version: 'harmony:4.11.0-af0ef98',
      volume: 65535
    };

    await withRetry(() =>
      this.http.post('https://guc-spclient.spotify.com/track-playback/v1/devices', body, {
        headers: this.authedHeaders()
      })
    );
  }

  private async subscribeNotifications(): Promise<void> {
    await withRetry(() =>
      this.http.put(
        `https://api.spotify.com/v1/me/notifications/user?connection_id=${this.connectionId}`,
        null,
        { headers: this.authedHeaders() }
      )
    );
  }

  private async registerHobs(): Promise<void> {
    await withRetry(() =>
      this.http.put(
        `https://guc-spclient.spotify.com/connect-state/v1/devices/hobs_${this.deviceId}`,
        {
          member_type: 'CONNECT_STATE',
          device: { device_info: { capabilities: { can_be_player: false, hidden: true } } }
        },
        {
          headers: {
            ...this.authedHeaders(),
            'x-spotify-connection-id': this.connectionId ?? ''
          }
        }
      )
    );
  }

  private async hydrateInitialState(): Promise<void> {
    const response = await this.http.get(
      'https://guc-spclient.spotify.com/connect-state/v1/devices/hobbit:_current',
      { headers: { ...this.authedHeaders(), 'x-spotify-connection-id': this.connectionId ?? '' } }
    );
    if (response.status === 200 && response.data) {
      const data = response.data as ClusterStateCluster;
      if (data.player_state) this.applyCluster(data);
    }
  }

  async command(commandBody: Record<string, unknown>): Promise<void> {
    await this.ensureReady();
    const targetDevice = await this.resolveTargetDevice();
    const url = `https://guc-spclient.spotify.com/connect-state/v1/player/command/from/${this.deviceId}/to/${targetDevice}`;
    await this.postCommand(url, commandBody);
    await sleep(500);
  }

  private async postCommand(url: string, body: Record<string, unknown>, attempt = 0): Promise<void> {
    const response = await this.http.post(url, body, { headers: this.authedHeaders() });
    if (response.status === 200) return;
    if (attempt > 0) throw new Error(`Command failed (${response.status})`);

    const description = (response.data as { error_description?: string } | undefined)?.error_description;
    if (description === 'queue_revision_mismatch' && typeof body.command === 'object' && body.command !== null) {
      (body.command as Record<string, unknown>).queue_revision = this.queueRevision;
    }
    await sleep(1000);
    await this.postCommand(url, body, attempt + 1);
  }

  private async resolveTargetDevice(): Promise<string> {
    if (this.state.activeDeviceId) return this.state.activeDeviceId;

    const playing = await this.http.get('https://api.spotify.com/v1/me/player', {
      headers: this.authedHeaders()
    });
    const playingDevice = (playing.data as { device?: { id?: string } } | undefined)?.device?.id;
    if (playingDevice) return playingDevice;

    const devices = await this.http.get('https://api.spotify.com/v1/me/player/devices', {
      headers: this.authedHeaders()
    });
    const fallback = (devices.data as { devices?: Array<{ id: string }> } | undefined)?.devices?.[0]?.id;
    if (!fallback) throw new Error('No active Spotify device found');
    await this.transfer(fallback);
    await sleep(1000);
    return this.state.activeDeviceId || fallback;
  }

  async transfer(deviceId: string): Promise<void> {
    await withRetry(() =>
      this.http.post(
        `https://guc-spclient.spotify.com/connect-state/v1/connect/transfer/from/${this.deviceId}/to/${deviceId}`,
        { transfer_options: { restore_paused: 'restore' } },
        { headers: this.authedHeaders() }
      )
    );
  }

  async setVolume(percent: number): Promise<void> {
    await this.ensureReady();
    const deviceId = this.state.activeDeviceId;
    const params = new URLSearchParams({
      volume_percent: String(Math.max(0, Math.min(100, Math.round(percent))))
    });
    const url = `https://api.spotify.com/v1/me/player/volume?${params.toString()}${deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : ''}`;
    const response = await this.http.put(url, null, { headers: this.authedHeaders() });
    if (response.status !== 204) throw new Error(`Volume command failed (${response.status})`);
    this.state.volume = Math.round(percent * 655.35);
  }

  static pause(): Record<string, unknown> {
    return { command: { endpoint: 'pause' } };
  }

  static resume(): Record<string, unknown> {
    return { command: { endpoint: 'resume' } };
  }

  static skipNext(): Record<string, unknown> {
    return { command: { endpoint: 'skip_next' } };
  }

  static skipPrev(): Record<string, unknown> {
    return { command: { endpoint: 'skip_prev' } };
  }

  static seekTo(ms: number): Record<string, unknown> {
    return { command: { value: ms, endpoint: 'seek_to' } };
  }

  static setShuffle(value: boolean): Record<string, unknown> {
    return { command: { value, endpoint: 'set_shuffling_context' } };
  }

  static setRepeat(mode: 'off' | 'track' | 'context'): Record<string, unknown> {
    return {
      command: {
        repeating_context: mode !== 'off',
        repeating_track: mode === 'track',
        endpoint: 'set_options'
      }
    };
  }

  static play(trackId: string): Record<string, unknown> {
    return {
      command: {
        context: {
          uri: `spotify:track:${trackId}`,
          url: `context://spotify:track:${trackId}`,
          metadata: {}
        },
        play_origin: { feature_identifier: 'harmony', feature_version: '4.11.0-af0ef98' },
        options: { license: 'on-demand', skip_to: { track_index: 0 }, player_options_override: {} },
        endpoint: 'play'
      }
    };
  }

  static addToQueue(trackId: string): Record<string, unknown> {
    return {
      command: {
        track: { uri: `spotify:track:${trackId}`, metadata: { is_queued: true }, provider: 'queue' },
        endpoint: 'add_to_queue'
      }
    };
  }

  private authedHeaders(): Record<string, string> {
    return { ...DEFAULT_HEADERS, authorization: `Bearer ${this.accessToken}` };
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30_000);
  }

  private stopPingLoop(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private scheduleTokenRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const delayMs = Math.max(this.accessTokenExpirySec * 1000 - Date.now() - 60_000, 60_000);
    this.refreshTimer = setTimeout(() => {
      void this.reauthorize();
    }, delayMs);
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.reconnecting || this.forceDisconnect) return;
    this.reconnecting = true;
    while (!this.initialized && !this.forceDisconnect) {
      try {
        console.log('SpotifyPlayerEngine: reconnecting...');
        await this.authorize();
        this.reconnecting = false;
        console.log('SpotifyPlayerEngine: reconnected');
        return;
      } catch (error) {
        console.error('SpotifyPlayerEngine reconnect failed, retrying in 15s:', error);
        await sleep(15_000);
      }
    }
    this.reconnecting = false;
  }

  private async reauthorize(): Promise<void> {
    if (this.forceDisconnect) return;
    try {
      this.initialized = false;
      this.teardownTimers();
      try {
        this.ws?.close();
      } catch {
        /* noop */
      }
      await sleep(1000);
      await this.authorize();
    } catch (error) {
      console.error('SpotifyPlayerEngine refresh failed:', error);
      void this.scheduleReconnect();
    }
  }

  private async ensureReady(): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (!this.initialized) {
      if (Date.now() > deadline) throw new Error('Engine not ready');
      await sleep(250);
    }
    if (Date.now() / 1000 >= this.accessTokenExpirySec) {
      await this.reauthorize();
      await this.ensureReady();
    }
  }

  private teardownTimers(): void {
    this.stopPingLoop();
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}

interface ClusterStateCluster {
  active_device_id?: string;
  devices?: Record<string, { name?: string; type?: string; volume?: number }>;
  player_state?: ClusterPlayerState;
  update_reason?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn: () => Promise<unknown>, attempt = 0): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (attempt >= 1) throw error;
    await sleep(1000);
    return withRetry(fn, attempt + 1);
  }
}

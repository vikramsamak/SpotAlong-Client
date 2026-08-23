import { SpotifyPlayerEngine } from './SpotifyPlayerEngine.js';

type Snapshot = ReturnType<SpotifyPlayerEngine['getSnapshot']>;

export class PlayerSessionManager {
  private sessions = new Map<string, SpotifyPlayerEngine>();

  /** Set externally (broadcaster) to fan out state updates */
  onState: ((userId: string, snapshot: Snapshot) => void) | null = null;
  onStopped: ((userId: string) => void) | null = null;

  has(userId: string): boolean {
    return this.sessions.has(userId);
  }

  get(userId: string): SpotifyPlayerEngine | undefined {
    return this.sessions.get(userId);
  }

  async start(userId: string, spTCookie: string): Promise<Snapshot> {
    const existing = this.sessions.get(userId);
    if (existing) await this.stop(userId);

    const engine = new SpotifyPlayerEngine(spTCookie);
    this.sessions.set(userId, engine);

    engine.onStateChange = () => {
      if (!this.sessions.has(userId)) return;
      this.onState?.(userId, engine.getSnapshot());
    };
    engine.onDisconnected = () => {
      if (this.sessions.get(userId) === engine) {
        this.sessions.delete(userId);
        this.onStopped?.(userId);
      }
    };

    try {
      await engine.start();
    } catch (error) {
      this.sessions.delete(userId);
      throw error;
    }
    return engine.getSnapshot();
  }

  async stop(userId: string): Promise<void> {
    const engine = this.sessions.get(userId);
    if (!engine) return;
    this.sessions.delete(userId);
    await engine.stop();
    this.onStopped?.(userId);
  }
}

export const playerSessions = new PlayerSessionManager();

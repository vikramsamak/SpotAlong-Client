import type { PlayerStateSnapshot } from '@spotalong/types';

const API_URL: string = import.meta.env.VITE_API_URL ?? '';

export interface PlayerSessionInfo {
  active: boolean;
  state?: PlayerStateSnapshot;
}

export type PlayerAction =
  | 'pause'
  | 'resume'
  | 'next'
  | 'previous'
  | 'seek'
  | 'play'
  | 'queue'
  | 'shuffle'
  | 'repeat'
  | 'transfer';

let authToken: string | null = null;

export function setPlayerAuthToken(token: string | null): void {
  authToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/api/player${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init?.headers
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { detail?: string }).detail ?? `Request failed (${response.status})`);
  }
  return body as T;
}

export const playerApi = {
  async start(spTCookie: string): Promise<PlayerSessionInfo> {
    return request<PlayerSessionInfo>('/start', {
      method: 'POST',
      body: JSON.stringify({ cookie: spTCookie })
    });
  },

  async stop(): Promise<{ success: boolean }> {
    return request<{ success: boolean }>('/stop', { method: 'POST' });
  },

  async state(): Promise<PlayerSessionInfo> {
    return request<PlayerSessionInfo>('/state');
  },

  async command(action: PlayerAction, value?: unknown): Promise<PlayerSessionInfo & { success: boolean }> {
    return request<PlayerSessionInfo & { success: boolean }>('/command', {
      method: 'POST',
      body: JSON.stringify({ action, value })
    });
  }
};

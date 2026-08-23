import type { Friend, User } from '@spotalong/types';

const API_URL: string = import.meta.env.VITE_API_URL ?? '';

export interface LoginInitiation {
  authUrl: string;
  expiryTimestamp: number;
}

export interface RedeemResult {
  accessToken: string;
  refreshToken: string;
  timeout: number;
}

export interface RefreshResult {
  token: string;
  refreshToken: string;
  timeout: number;
}

export interface FriendsData {
  friends: User[];
  friendRequests: Friend[];
  outboundFriendRequests: Friend[];
}

let authToken: string | null = null;

export function setApiAuthToken(token: string | null): void {
  authToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
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

export const api = {
  async initiateLogin(): Promise<LoginInitiation> {
    return request<LoginInitiation>('/api/login');
  },

  async spotifyCallback(
    code: string,
    state: string,
    redirectUri?: string
  ): Promise<{ message: string; code: string }> {
    const params = new URLSearchParams({ code, state });
    if (redirectUri) params.set('redirect_uri', redirectUri);
    return request<{ message: string; code: string }>(`/api/login/callback?${params.toString()}`);
  },

  async redeemLoginCode(loginCode: string): Promise<RedeemResult> {
    return request<RedeemResult>(`/api/login/redeem_code?code=${encodeURIComponent(loginCode)}`);
  },

  async checkEligible(): Promise<boolean> {
    try {
      await request<{ eligible: boolean }>('/api/login/eligible');
      return true;
    } catch {
      return false;
    }
  },

  async refreshTokens(accessToken: string, refreshToken: string): Promise<RefreshResult> {
    return request<RefreshResult>('/api/login/refresh', {
      method: 'POST',
      body: JSON.stringify({ accessToken, refreshToken })
    });
  },

  async getFriends(): Promise<FriendsData> {
    return request<FriendsData>('/api/friends');
  },

  async sendFriendRequest(friendCode: string): Promise<{ friendId: string }> {
    return request<{ friendId: string }>(`/api/friends/request/${encodeURIComponent(friendCode)}`, {
      method: 'POST'
    });
  },

  async respondToRequest(requesterId: string, action: 'accept' | 'decline'): Promise<void> {
    await request(`/api/friends/respond/${encodeURIComponent(requesterId)}`, {
      method: 'POST',
      body: JSON.stringify({ action })
    });
  },

  async removeFriend(friendCode: string): Promise<void> {
    await request(`/api/friends/remove/${encodeURIComponent(friendCode)}`, { method: 'POST' });
  },

  async setStatusBroadcast(privacyMode: string): Promise<void> {
    await request('/api/me/status_broadcast', {
      method: 'POST',
      body: JSON.stringify({ privacyMode })
    });
  }
};

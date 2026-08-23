import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { User, Friend, SpotifySong, PlayerStateSnapshot } from '@spotalong/types';
import { api, setApiAuthToken } from '../services/api';
import { setPlayerAuthToken } from '../services/playerApi';

export interface ListeningState {
  songId: string;
  progress: number;
  isPlaying: boolean;
  looping: string;
  receivedAt: number;
}

export interface HostPlayerSession {
  active: boolean;
  snapshot?: PlayerStateSnapshot;
}

interface SpotAlongState {
  // Authentication & Status
  userId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  authError: string | null;

  // Real-time Lists
  friendsList: User[];
  friendRequests: Friend[];
  outboundRequests: Friend[];

  // Current Playback Snapshot
  ownPlayback: SpotifySong | null;
  friendPlaybacks: Record<string, SpotifySong>;
  listeningStates: Record<string, ListeningState>;
  syncedPositions: Record<string, number>;
  hostPlayer: HostPlayerSession;

  // Socket Instance
  socket: Socket | null;
  refreshTimer: ReturnType<typeof setTimeout> | null;

  // Actions
  initializeSession: (accessToken: string, refreshToken?: string) => void;
  restoreSession: () => Promise<boolean>;
  scheduleTokenRefresh: (timeoutMs: number) => void;
  setAuthError: (message: string | null) => void;
  setOwnPlayback: (song: SpotifySong) => void;
  updateFriendPlayback: (userId: string, song: SpotifySong) => void;
  setSyncedPosition: (userId: string, positionSec: number) => void;
  setHostPlayer: (session: HostPlayerSession) => void;
  terminateSession: () => void;
}

const SESSION_KEY = 'spotalong.session';

interface PersistedSession {
  accessToken: string;
  refreshToken: string;
}

function persistSession(session: PersistedSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function readPersistedSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const useSpotAlongStore = create<SpotAlongState>((set, get) => ({
  userId: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  authError: null,
  friendsList: [],
  friendRequests: [],
  outboundRequests: [],
  ownPlayback: null,
  friendPlaybacks: {},
  listeningStates: {},
  syncedPositions: {},
  hostPlayer: { active: false },
  socket: null,
  refreshTimer: null,

  initializeSession: (accessToken, refreshToken) => {
    get().terminateSession();

    if (refreshToken) persistSession({ accessToken, refreshToken });
    setApiAuthToken(accessToken);
    setPlayerAuthToken(accessToken);

    const socket = io(`${import.meta.env.VITE_API_URL}/api/authorization`, {
      extraHeaders: { authorization: `Bearer ${accessToken}` },
      autoConnect: true
    });

    socket.on('Authorized', (userId) => set({ userId, isAuthenticated: true }));

    socket.on('friend_list', (friendsList) => set({ friendsList }));
    socket.on('friend_requests', (friendRequests) => set({ friendRequests }));
    socket.on('outbound_friend_requests', (outboundRequests) => set({ outboundRequests }));

    socket.on('song_update', ({ userId: id, song }) => {
      set((state) => ({
        friendPlaybacks: { ...state.friendPlaybacks, [id]: song }
      }));
    });

    socket.on('user_update', ({ userId: id, user }) => {
      set((state) => ({
        friendsList: state.friendsList.map((f) => (f.id === id ? { ...f, ...user } : f))
      }));
    });

    socket.on('new_request', (request) => {
      set((state) =>
        state.friendRequests.some((r) => r.userId === request.userId)
          ? { friendRequests: state.friendRequests }
          : { friendRequests: [...state.friendRequests, request] }
      );
    });

    socket.on('remove_request', ({ requesterId }) => {
      set((state) => ({
        friendRequests: state.friendRequests.filter(
          (r) => r.otherUser?.id !== requesterId && r.friendId !== requesterId
        )
      }));
    });

    socket.on('new_friend', (friend) => {
      set((state) =>
        state.friendsList.some((f) => f.id === friend.id)
          ? { friendsList: state.friendsList }
          : {
              friendsList: [...state.friendsList, friend],
              friendRequests: state.friendRequests.filter(
                (r) => r.otherUser?.id !== friend.id && r.friendId !== friend.id
              )
            }
      );
    });

    socket.on('remove_friend', (friend) => {
      set((state) => {
        const playbacks = { ...state.friendPlaybacks };
        delete playbacks[friend.id];
        return {
          friendsList: state.friendsList.filter((f) => f.id !== friend.id),
          friendPlaybacks: playbacks
        };
      });
    });

    socket.on('listening_state', ({ userId, songId, progress, isPlaying, looping }) => {
      set((state) => ({
        listeningStates: {
          ...state.listeningStates,
          [userId]: { songId, progress, isPlaying, looping, receivedAt: Date.now() }
        }
      }));
    });

    socket.on('player_state', ({ userId, state }) => {
      set((prev) => ({
        listeningStates: {
          ...prev.listeningStates,
          [userId]: {
            songId: songIdFromUri(state.trackUri),
            progress: Math.round(state.positionSec),
            isPlaying: state.playing,
            looping: state.looping,
            receivedAt: Date.now()
          }
        }
      }));
    });

    socket.on('player_stopped', () => {
      set({ hostPlayer: { active: false } });
    });

    set({ socket, accessToken: accessToken, refreshToken: refreshToken ?? null, authError: null });
  },

  restoreSession: async () => {
    const persisted = readPersistedSession();
    if (!persisted) return false;

    try {
      const refreshed = await api.refreshTokens(persisted.accessToken, persisted.refreshToken);
      get().initializeSession(refreshed.token, refreshed.refreshToken);
      get().scheduleTokenRefresh(Math.max(refreshed.timeout - Date.now() - 60_000, 60_000));
      return true;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return false;
    }
  },

  scheduleTokenRefresh: (timeoutMs) => {
    const existing = get().refreshTimer;
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      const { accessToken, refreshToken } = get();
      if (!accessToken || !refreshToken) return;
      try {
        const result = await api.refreshTokens(accessToken, refreshToken);
        persistSession({ accessToken: result.token, refreshToken: result.refreshToken });
        setApiAuthToken(result.token);
        setPlayerAuthToken(result.token);
        set({ accessToken: result.token, refreshToken: result.refreshToken });
        get().scheduleTokenRefresh(Math.max(result.timeout - Date.now() - 60_000, 60_000));
      } catch {
        get().terminateSession();
      }
    }, timeoutMs);
    set({ refreshTimer: timer });
  },

  setAuthError: (authError) => set({ authError }),

  setOwnPlayback: (ownPlayback) => set({ ownPlayback }),

  updateFriendPlayback: (userId, song) =>
    set((state) => ({
      friendPlaybacks: { ...state.friendPlaybacks, [userId]: song }
    })),

  setSyncedPosition: (userId, positionSec) =>
    set((state) => ({
      syncedPositions: { ...state.syncedPositions, [userId]: positionSec }
    })),

  setHostPlayer: (hostPlayer) => set({ hostPlayer }),

  terminateSession: () => {
    const { socket, refreshTimer } = get();
    socket?.disconnect();
    if (refreshTimer) clearTimeout(refreshTimer);
    localStorage.removeItem(SESSION_KEY);
    setApiAuthToken(null);
    setPlayerAuthToken(null);    set({
      userId: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      friendsList: [],
      friendRequests: [],
      outboundRequests: [],
      friendPlaybacks: {},
      listeningStates: {},
      syncedPositions: {},
      hostPlayer: { active: false },
      socket: null,
      refreshTimer: null
    });
  }
}));

function songIdFromUri(uri: string | undefined): string {
  return uri ? uri.replace('spotify:track:', '') : '';
}

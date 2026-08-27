import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { User, Friend, SpotifySong, PlayerStateSnapshot } from '@spotalong/types';
import { api, setApiAuthToken } from '../services/api';
import {
  PlayerDevice,
  playerApi,
  setPlayerAuthToken
} from '../services/playerApi';

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

export interface SnackbarMessage {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

interface SpotAlongState {
  // Authentication & Status
  userId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  authError: string | null;
  connected: boolean;

  // Real-time Lists
  friendsList: User[];
  friendRequests: Friend[];
  outboundRequests: Friend[];
  /** userIds currently listening along to you */
  listeners: string[];

  // Current Playback Snapshot
  ownPlayback: SpotifySong | null;
  friendPlaybacks: Record<string, SpotifySong>;
  listeningStates: Record<string, ListeningState>;
  syncedPositions: Record<string, number>;
  hostPlayer: HostPlayerSession;
  playerDevices: PlayerDevice[];
  devicesOpen: boolean;

  // UI
  snackbar: SnackbarMessage | null;

  // Socket Instance
  socket: Socket | null;
  refreshTimer: ReturnType<typeof setTimeout> | null;

  // Actions
  initializeSession: (accessToken: string, refreshToken?: string) => void;
  restoreSession: () => Promise<boolean>;
  scheduleTokenRefresh: (timeoutMs: number) => void;
  setAuthError: (message: string | null) => void;
  setConnected: (connected: boolean) => void;
  setOwnPlayback: (song: SpotifySong) => void;
  updateFriendPlayback: (userId: string, song: SpotifySong) => void;
  setSyncedPosition: (userId: string, positionSec: number) => void;
  setHostPlayer: (session: HostPlayerSession) => void;
  setPlayerDevices: (devices: PlayerDevice[]) => void;
  setDevicesOpen: (open: boolean) => void;
  setListeners: (listeners: string[]) => void;
  showSnackbar: (text: string, kind?: SnackbarMessage['kind']) => void;
  startPlayerSession: (spTCookie?: string) => Promise<void>;
  stopPlayerSession: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  sendNextForListening: (trackUri: string) => void;
  startListeningFromUser: (userId: string) => void;
  stopListeningFromUser: (userId: string) => void;
  terminateSession: () => void;
}

const SESSION_KEY = 'spotalong.session';
const MAX_SNACKBAR_MS = 4000;

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
  connected: false,
  friendsList: [],
  friendRequests: [],
  outboundRequests: [],
  listeners: [],
  ownPlayback: null,
  friendPlaybacks: {},
  listeningStates: {},
  syncedPositions: {},
  hostPlayer: { active: false },
  playerDevices: [],
  devicesOpen: false,
  snackbar: null,
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

    socket.on('connect', () => get().setConnected(true));
    socket.on('disconnect', () => get().setConnected(false));
    socket.on('connect_error', () => get().setConnected(false));

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
      get().showSnackbar(
        `${request.otherUser?.displayName ?? 'Someone'} sent you a friend request`,
        'info'
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
      get().showSnackbar(`You are now friends with ${friend.displayName}`, 'success');
    });

    socket.on('remove_friend', (friend) => {
      set((state) => {
        const playbacks = { ...state.friendPlaybacks };
        const states = { ...state.listeningStates };
        const positions = { ...state.syncedPositions };
        delete playbacks[friend.id];
        delete states[friend.id];
        delete positions[friend.id];
        return {
          friendsList: state.friendsList.filter((f) => f.id !== friend.id),
          friendPlaybacks: playbacks,
          listeningStates: states,
          syncedPositions: positions,
          listeners: state.listeners.filter((l) => l !== friend.id)
        };
      });
      get().showSnackbar(`${friend.displayName} was removed from your friends`, 'info');
    });

    socket.on('listening_state', ({ userId, songId, progress, isPlaying, looping }) => {
      set((state) => ({
        listeningStates: {
          ...state.listeningStates,
          [userId]: { songId, progress, isPlaying, looping, receivedAt: Date.now() }
        }
      }));
    });

    // The server pushes precise player snapshots (with track metadata) to listeners
    // of the host's session. It is also used to teach the host's own UI its state.
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
      // If this is our own session, refresh the host player snapshot.
      if (userId === get().userId) {
        set({ hostPlayer: { active: true, snapshot: state } });
      }
    });

    socket.on('player_stopped', ({ userId }) => {
      if (userId === get().userId) {
        set({ hostPlayer: { active: false } });
      }
    });

    socket.on('start_listening_from_user', (listenerId) => {
      set((state) =>
        state.listeners.includes(listenerId)
          ? { listeners: state.listeners }
          : { listeners: [...state.listeners, listenerId] }
      );
      const listener = get().friendsList.find((f) => f.id === listenerId);
      get().showSnackbar(
        `${listener?.displayName ?? 'Someone'} is listening along with you`,
        'info'
      );
    });

    socket.on('end_listening_from_user', (listenerId) => {
      set((state) => ({
        listeners: state.listeners.filter((l) => l !== listenerId)
      }));
    });

    // A friend's upcoming track, so we can pre-fetch (ignored for now; used for cache).
    socket.on('precache', () => {
      // Reserved for album-art pre-fetching; nothing to render.
    });

    set({ socket, accessToken, refreshToken: refreshToken ?? null, authError: null });
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

  setConnected: (connected) => set({ connected }),

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

  setPlayerDevices: (playerDevices) => set({ playerDevices }),

  setDevicesOpen: (devicesOpen) => set({ devicesOpen }),

  setListeners: (listeners) => set({ listeners }),

  showSnackbar: (text, kind = 'info') => set({ snackbar: { id: Date.now(), text, kind } }),

  startPlayerSession: async (spTCookie) => {
    try {
      const session = await playerApi.start(spTCookie);
      set({ hostPlayer: { active: session.active, snapshot: session.state } });
      get().showSnackbar('Spotify player connected', 'success');
      await get().refreshDevices();
    } catch (error) {
      get().showSnackbar(
        error instanceof Error ? error.message : 'Could not start the Spotify player',
        'error'
      );
      throw error;
    }
  },

  stopPlayerSession: async () => {
    try {
      await playerApi.stop();
    } finally {
      set({ hostPlayer: { active: false }, playerDevices: [], devicesOpen: false });
    }
  },

  refreshDevices: async () => {
    try {
      const session = await playerApi.devices();
      set({ playerDevices: session.devices ?? [] });
    } catch {
      // ignore; devices are best-effort
    }
  },

  sendNextForListening: (trackUri) => {
    const socket = get().socket;
    if (!socket) return;
    socket.emit('upload_precache', { trackUri });
  },

  startListeningFromUser: (userId) => {
    const socket = get().socket;
    if (!socket) return;
    socket.emit('start_listening', userId);
  },

  stopListeningFromUser: (userId) => {
    const socket = get().socket;
    if (!socket) return;
    socket.emit('end_listening', userId);
  },

  terminateSession: () => {
    const { socket, refreshTimer } = get();
    socket?.disconnect();
    if (refreshTimer) clearTimeout(refreshTimer);
    localStorage.removeItem(SESSION_KEY);
    setApiAuthToken(null);
    setPlayerAuthToken(null);
    set({
      userId: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      connected: false,
      friendsList: [],
      friendRequests: [],
      outboundRequests: [],
      listeners: [],
      friendPlaybacks: {},
      listeningStates: {},
      syncedPositions: {},
      hostPlayer: { active: false },
      playerDevices: [],
      devicesOpen: false,
      snackbar: null,
      socket: null,
      refreshTimer: null
    });
  }
}));

let snackbarTimer: ReturnType<typeof setTimeout> | null = null;
useSpotAlongStore.subscribe((state, prev) => {
  if (state.snackbar !== prev.snackbar && state.snackbar) {
    if (snackbarTimer) clearTimeout(snackbarTimer);
    snackbarTimer = setTimeout(() => {
      useSpotAlongStore.setState({ snackbar: null });
      snackbarTimer = null;
    }, MAX_SNACKBAR_MS);
  }
});

function songIdFromUri(uri: string | undefined): string {
  return uri ? uri.replace('spotify:track:', '') : '';
}

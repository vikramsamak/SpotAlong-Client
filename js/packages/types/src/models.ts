export interface User {
  id: string;
  friendCode: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  lastOnline?: string;
  lastSongId?: string;
  lastProgress?: number;
  lastIsPlaying?: boolean;
  privacyMode: 'friends' | 'none' | 'everyone';
}

export interface Friend {
  userId: string;
  friendId: string;
  direction: 'sent' | 'received';
  status: 'pending' | 'accepted' | 'declined';
  /** The other party in this relationship, populated server-side for UI rendering */
  otherUser?: User;
}

export interface SpotifySong {
  songName: string;
  songId: string;
  songLink: string;
  songAuthors: Array<{ name: string; url: string }>;
  contextType?: string;
  contextData?: string;
  contextUrl?: string;
  progress: number;       // In seconds
  duration: number;       // In milliseconds (matches legacy raw API unit mismatch)
  albumName: string;
  albumLink: string;
  albumImageLink?: string;
  isPlaying: boolean;
  playingType: 'track' | 'ad' | 'local file' | 'episode' | 'None';
  clientUsername?: string;
  clientAvatar?: string;
  clientId?: string;
  friendCode?: string;
  playingStatus: 'Listening' | 'Online' | 'Offline';
  lastSong?: SpotifySong;
  lastSongTimestamp?: string;
}

export interface PlayerStateSnapshot {
  playing: boolean;
  shuffling: boolean;
  looping: 'off' | 'track' | 'context';
  activeDeviceId: string;
  volume: number;
  durationMs: number;
  trackUri?: string;
  positionSec: number;
}

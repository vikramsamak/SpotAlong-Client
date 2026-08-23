import { User, Friend, SpotifySong, PlayerStateSnapshot } from './models';

export interface ServerToClientEvents {
  Authorized: (userId: string) => void;
  friend_list: (friends: User[]) => void;
  friend_requests: (requests: Friend[]) => void;
  outbound_friend_requests: (requests: Friend[]) => void;
  song_update: (payload: { userId: string; song: SpotifySong }) => void;
  user_update: (payload: { userId: string; user: Partial<User> }) => void;
  new_request: (request: Friend) => void;
  remove_request: (payload: { requesterId: string }) => void;
  new_friend: (friend: User) => void;
  remove_friend: (friend: User) => void;
  start_listening_from_user: (listenerId: string) => void;
  end_listening_from_user: (listenerId: string) => void;
  listening_state: (payload: {
    userId: string;
    songId: string;
    progress: number;
    isPlaying: boolean;
    looping: string;
  }) => void;
  player_state: (payload: { userId: string; state: PlayerStateSnapshot }) => void;
  player_stopped: (payload: { userId: string }) => void;
}

export interface ClientToServerEvents {
  send_current_state: (state: { songId: string; progress: number; isPlaying: boolean; looping: string }) => void;
  start_listening: (targetId: string) => void;
  end_listening: (targetId: string) => void;
}

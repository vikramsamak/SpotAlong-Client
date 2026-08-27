import type { User } from '@spotalong/types';

interface Props {
  user: User;
  lastSong?: SpotifySongLike;
}

interface SpotifySongLike {
  songName: string;
  songAuthors: Array<{ name: string }>;
  albumName?: string;
  albumImageLink?: string;
  lastSongTimestamp?: string;
}

export default function PastFriendStatus({ user, lastSong }: Props) {
  if (!lastSong?.songName) {
    return (
      <li className="past-card">
        <span className="friend-name">{user.displayName}</span>
        <span className="friend-song muted">No recent listens</span>
      </li>
    );
  }

  return (
    <li className="past-card">
      {lastSong.albumImageLink && (
        <img className="past-art" src={lastSong.albumImageLink} alt="" />
      )}
      <div className="past-meta">
        <span className="friend-name">{user.displayName}</span>
        <span className="friend-song">{lastSong.songName}</span>
        <span className="friend-artist">{lastSong.songAuthors.map((a) => a.name).join(', ')}</span>
        {lastSong.lastSongTimestamp && (
          <span className="past-time">Last played {new Date(lastSong.lastSongTimestamp).toLocaleString()}</span>
        )}
      </div>
    </li>
  );
}

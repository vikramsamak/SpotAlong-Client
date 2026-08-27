import { useState, useEffect } from 'react';
import type { User, SpotifySong } from '@spotalong/types';
import { useSpotAlongStore } from '../store/useSpotAlongStore';

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface Props {
  user: User;
  song: SpotifySong | undefined;
}

export default function AdvancedUserStatus({ user, song }: Props) {
  const startListeningFromUser = useSpotAlongStore((s) => s.startListeningFromUser);
  const [progress, setProgress] = useState(song?.progress ?? 0);
  const songId = song?.songId;

  useEffect(() => {
    setProgress(song?.progress ?? 0);
  }, [songId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!song?.isPlaying) return;
    const started = Date.now();
    const initial = progress;
    const id = setInterval(
      () => setProgress(initial + (Date.now() - started) / 1000),
      1000
    );
    return () => clearInterval(id);
  }, [songId, song?.isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  const hidden = !song || user.privacyMode === 'none' || song.playingStatus === 'Offline';
  const durationSec = song ? song.duration / 1000 : 0;
  const cappedProgress = Math.min(progress, durationSec || progress);

  return (
    <li className="friend-card">
      <button
        className="friend-card-main"
        onClick={() => song && startListeningFromUser(user.id)}
        title={song ? `Listen along with ${user.displayName}` : `${user.displayName} isn't playing anything`}
        disabled={!song}
      >
        {user.avatarUrl ? (
          <img className="friend-avatar" src={user.avatarUrl} alt="" />
        ) : (
          <div className="friend-avatar placeholder">{user.displayName.slice(0, 1).toUpperCase()}</div>
        )}
        <div className="friend-info">
          <span className="friend-name">{user.displayName}</span>
          {hidden || !song?.songName ? (
            <span className="friend-song muted">Not sharing what's playing</span>
          ) : (
            <>
              <span className="friend-song">{song.songName}</span>
              <span className="friend-artist">
                {song.songAuthors.map((a) => a.name).join(', ') || '—'}
              </span>
              {durationSec > 0 && (
                <div className="friend-progress">
                  <div
                    className="friend-progress-fill"
                    style={{ width: `${Math.min(100, (cappedProgress / durationSec) * 100)}%` }}
                  />
                  <span className="friend-progress-time">
                    {formatTime(cappedProgress)} / {formatTime(durationSec)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </button>
    </li>
  );
}

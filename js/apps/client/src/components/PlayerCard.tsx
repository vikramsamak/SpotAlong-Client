import { useEffect, useState } from 'react';
import { Headphones, HeadphoneOff } from 'lucide-react';
import { SpotifySong } from '@spotalong/types';
import { useSpotAlongStore } from '../store/useSpotAlongStore';

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface PlayerCardProps {
  userId: string;
  song: SpotifySong;
}

export default function PlayerCard({ userId, song }: PlayerCardProps) {
  const socket = useSpotAlongStore((s) => s.socket);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!socket) return;
    const onStart = (listenerId: string) => {
      if (listenerId === userId) setListening(true);
    };
    const onEnd = (listenerId: string) => {
      if (listenerId === userId) setListening(false);
    };
    socket.on('start_listening_from_user', onStart);
    socket.on('end_listening_from_user', onEnd);
    return () => {
      socket.off('start_listening_from_user', onStart);
      socket.off('end_listening_from_user', onEnd);
    };
  }, [socket, userId]);

  const toggleListening = () => {
    if (!socket) return;
    socket.emit(listening ? 'end_listening' : 'start_listening', userId);
    setListening(!listening);
  };

  const progressPct = Math.min(100, ((song.progress * 1000) / Math.max(1, song.duration)) * 100);

  return (
    <article className="player-card">
      {song.albumImageLink && (
        <img className="player-art" src={song.albumImageLink} alt={song.albumName} />
      )}
      <h2 className="player-song">
        <a href={song.songLink} target="_blank" rel="noreferrer">
          {song.songName}
        </a>
      </h2>
      <p className="player-artists">
        {song.songAuthors.map((a) => (
          <a key={a.name} href={a.url} target="_blank" rel="noreferrer">
            {a.name}
          </a>
        ))}
      </p>
      <p className="player-album">
        <a href={song.albumLink} target="_blank" rel="noreferrer">
          {song.albumName}
        </a>
      </p>
      <div className="player-progress">
        <span>{formatTime(song.progress)}</span>
        <div className="player-progress-track">
          <div className="player-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <span>{formatTime(song.duration / 1000)}</span>
      </div>
      <button
        className={`listen-button${listening ? ' active' : ''}`}
        onClick={toggleListening}
      >
        {listening ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
        {listening ? 'Stop listening along' : 'Listen along'}
      </button>
    </article>
  );
}

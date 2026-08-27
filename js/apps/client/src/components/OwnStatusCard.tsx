import { useSpotAlongStore } from '../store/useSpotAlongStore';
import { Music2 } from 'lucide-react';

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function OwnStatusCard() {
  const hostPlayer = useSpotAlongStore((s) => s.hostPlayer);
  const listeners = useSpotAlongStore((s) => s.listeners);
  const friendsList = useSpotAlongStore((s) => s.friendsList);

  const track = hostPlayer.snapshot?.track;

  const listenerNames = listeners
    .map((id) => friendsList.find((f) => f.id === id)?.displayName)
    .filter(Boolean)
    .join(', ');

  return (
    <section className="own-status">
      <div className="own-status-header">
        <h2>You</h2>
        {listeners.length > 0 && (
          <span className="listener-badge">
            {listeners.length} {listeners.length === 1 ? 'friend' : 'friends'} listening
            {listenerNames ? `: ${listenerNames}` : ''}
          </span>
        )}
      </div>

      {hostPlayer.active && track ? (
        <div className="own-status-body">
          {track.albumImage && <img className="own-status-art" src={track.albumImage} alt="" />}
          <div className="own-status-meta">
            <span className="own-status-title">{track.name || 'Unknown track'}</span>
            <span className="own-status-artists">
              {track.artists.map((a) => a.name).join(', ') || '—'}
            </span>
            <span className="own-status-album">{track.album}</span>
            <span className={`play-indicator${hostPlayer.snapshot?.playing ? ' playing' : ''}`}>
              {hostPlayer.snapshot?.playing ? `Playing` : 'Paused'} ·{' '}
              {formatTime(hostPlayer.snapshot?.positionSec ?? 0)} /{' '}
              {formatTime((hostPlayer.snapshot?.durationMs ?? 0) / 1000)}
            </span>
          </div>
        </div>
      ) : (
        <p className="own-status-empty">
          <Music2 size={16} /> Connect your player below to share what you're listening to.
        </p>
      )}
    </section>
  );
}

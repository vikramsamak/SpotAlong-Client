import { useSpotAlongStore } from '../store/useSpotAlongStore';
import PlayerCard from './PlayerCard';
import type { User } from '@spotalong/types';

interface Props {
  friend: User;
  onBack: () => void;
}

export default function FriendDetailPage({ friend, onBack }: Props) {
  const friendPlaybacks = useSpotAlongStore((s) => s.friendPlaybacks);
  const song = friendPlaybacks[friend.id];

  return (
    <div className="page">
      <button className="back-button" onClick={onBack}>
        ← Back
      </button>
      <section className="friend-detail">
        <div className="friend-detail-head">
          {friend.avatarUrl ? (
            <img className="friend-avatar large" src={friend.avatarUrl} alt="" />
          ) : (
            <div className="friend-avatar placeholder large">
              {friend.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h2>{friend.displayName}</h2>
            <span className="friend-code">Code: {friend.friendCode}</span>
          </div>
        </div>
        {song ? (
          <PlayerCard userId={friend.id} song={song} />
        ) : (
          <p className="empty-state">Nothing playing right now.</p>
        )}
      </section>
    </div>
  );
}

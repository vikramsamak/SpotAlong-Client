import { useSpotAlongStore } from '../store/useSpotAlongStore';
import OwnStatusCard from './OwnStatusCard';
import AdvancedUserStatus from './AdvancedUserStatus';
import PastFriendStatus from './PastFriendStatus';

interface PageProps {
  viewFriend: (userId: string) => void;
}

export default function FriendsPage({ viewFriend }: PageProps) {
  const friendsList = useSpotAlongStore((s) => s.friendsList);
  const friendPlaybacks = useSpotAlongStore((s) => s.friendPlaybacks);

  const online = friendsList.filter(
    (f) => f.privacyMode !== 'none' || friendPlaybacks[f.id]
  );

  return (
    <div className="page">
      <OwnStatusCard />
      <section className="friends-section">
        <h2>Friends</h2>
        {friendsList.length === 0 ? (
          <p className="friends-empty">
            You don't have any friends yet. Share your friend code to get started.
          </p>
        ) : (
          <ul className="friend-list">
            {online.map((friend) => (
              <div
                key={friend.id}
                onClick={() => viewFriend(friend.id)}
                role="button"
                tabIndex={0}
              >
                <AdvancedUserStatus user={friend} song={friendPlaybacks[friend.id]} />
              </div>
            ))}
            {friendsList.map(
              (friend) =>
                !online.includes(friend) && (
                  <PastFriendStatus key={friend.id} user={friend} />
                )
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

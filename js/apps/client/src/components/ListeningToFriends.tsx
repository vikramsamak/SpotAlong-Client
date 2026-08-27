import { useSpotAlongStore } from '../store/useSpotAlongStore';

export default function ListeningToFriends() {
  const listeners = useSpotAlongStore((s) => s.listeners);
  const friendsList = useSpotAlongStore((s) => s.friendsList);

  const listenerUsers = listeners
    .map((id) => friendsList.find((f) => f.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));

  return (
    <div className="page">
      <section className="friends-section">
        <h2>Listening along with you</h2>
        {listenerUsers.length === 0 ? (
          <p className="friends-empty">
            No friends are listening along right now. Share your playback so friends can join in.
          </p>
        ) : (
          <ul className="friend-list">
            {listenerUsers.map((user) => (
              <li className="friend-card" key={user.id}>
                {user.avatarUrl ? (
                  <img className="friend-avatar" src={user.avatarUrl} alt="" />
                ) : (
                  <div className="friend-avatar placeholder">
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="friend-info">
                  <span className="friend-name">{user.displayName}</span>
                  <span className="friend-song">Listening along</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

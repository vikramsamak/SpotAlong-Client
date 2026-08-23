import { FormEvent, useState } from 'react';
import { Check, X, UserPlus, Trash2 } from 'lucide-react';
import { useSpotAlongStore } from '../store/useSpotAlongStore';
import { api } from '../services/api';

export default function FriendsPanel() {
  const friendRequests = useSpotAlongStore((s) => s.friendRequests);
  const outboundRequests = useSpotAlongStore((s) => s.outboundRequests);
  const friendsList = useSpotAlongStore((s) => s.friendsList);

  const [friendCode, setFriendCode] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const addFriend = async (e: FormEvent) => {
    e.preventDefault();
    const code = friendCode.trim().toUpperCase();
    if (!code) return;
    try {
      await api.sendFriendRequest(code);
      setStatus(`Request sent to ${code}`);
      setFriendCode('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to send request');
    }
  };

  const respond = async (requesterId: string | undefined, action: 'accept' | 'decline') => {
    if (!requesterId) return;
    try {
      await api.respondToRequest(requesterId, action);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to respond');
    }
  };

  const removeFriend = async (friendCode: string | undefined) => {
    if (!friendCode) return;
    try {
      await api.removeFriend(friendCode);
      setStatus(`Removed ${friendCode}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to remove friend');
    }
  };

  return (
    <section className="friends-panel">
      <form className="add-friend" onSubmit={addFriend}>
        <input
          value={friendCode}
          onChange={(e) => setFriendCode(e.target.value)}
          placeholder="Friend code (e.g. A1B2C3)"
          maxLength={6}
        />
        <button type="submit" disabled={!friendCode.trim()}>
          <UserPlus size={16} /> Add
        </button>
      </form>

      {status && <p className="friends-status">{status}</p>}

      {friendRequests.length > 0 && (
        <div className="requests-section">
          <h3>Friend requests</h3>
          <ul>
            {friendRequests.map((request) => (
              <li key={`${request.userId}-${request.friendId}`}>
                <span>{request.otherUser?.displayName ?? request.userId}</span>
                <span className="request-actions">
                  <button onClick={() => respond(request.otherUser?.id, 'accept')} title="Accept">
                    <Check size={14} />
                  </button>
                  <button onClick={() => respond(request.otherUser?.id, 'decline')} title="Decline">
                    <X size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outboundRequests.length > 0 && (
        <div className="requests-section">
          <h3>Pending sent</h3>
          <ul>
            {outboundRequests.map((request) => (
              <li key={`${request.userId}-${request.friendId}`}>
                <span>{request.otherUser?.displayName ?? request.friendId}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {friendsList.length > 0 && (
        <div className="requests-section">
          <h3>Friends ({friendsList.length})</h3>
          <ul>
            {friendsList.map((friend) => (
              <li key={friend.id}>
                <span>
                  {friend.displayName} <small>{friend.friendCode}</small>
                </span>
                <button
                  className="remove-friend"
                  onClick={() => removeFriend(friend.friendCode)}
                  title={`Remove ${friend.displayName}`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

import { Users } from 'lucide-react';
import { useSpotAlongStore } from '../store/useSpotAlongStore';

interface SidebarProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function Sidebar({ selectedId, onSelect }: SidebarProps) {
  const friendsList = useSpotAlongStore((s) => s.friendsList);
  const friendPlaybacks = useSpotAlongStore((s) => s.friendPlaybacks);

  return (
    <aside className="sidebar">
      <div className="sidebar-header" title="Friends">
        <Users size={18} />
      </div>
      <ul>
        {friendsList.map((friend) => {
          const song = friendPlaybacks[friend.id];
          const isPlaying = Boolean(song?.isPlaying);
          return (
            <li key={friend.id}>
              <button
                className={`friend-item${friend.id === selectedId ? ' selected' : ''}`}
                onClick={() => onSelect(friend.id)}
                title={song ? `${song.songName} - ${song.songAuthors[0]?.name ?? ''}` : friend.displayName}
              >
                {friend.avatarUrl ? (
                  <img className="friend-avatar" src={friend.avatarUrl} alt="" />
                ) : (
                  <span className="friend-avatar friend-avatar-fallback">
                    {friend.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className={`status-dot${isPlaying ? ' playing' : ''}`} />
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

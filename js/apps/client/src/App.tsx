import { useEffect, useState } from 'react';
import { useSpotAlongStore } from './store/useSpotAlongStore';
import TitleBar from './components/TitleBar';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import PlayerCard from './components/PlayerCard';
import FriendsPanel from './components/FriendsPanel';
import { useSyncWorker } from './hooks/useSyncWorker';

export default function App() {
  const isAuthenticated = useSpotAlongStore((s) => s.isAuthenticated);
  const friendPlaybacks = useSpotAlongStore((s) => s.friendPlaybacks);
  const restoreSession = useSpotAlongStore((s) => s.restoreSession);
  const scheduleTokenRefresh = useSpotAlongStore((s) => s.scheduleTokenRefresh);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    void restoreSession().then((ok) => {
      if (ok) {
        // Refresh margin is handled inside initializeSession callers; a safe
        // default keeps long-lived sessions alive.
        scheduleTokenRefresh(25 * 60 * 1000);
      }
      setRestored(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useSyncWorker(selectedId);

  if (!isAuthenticated) {
    return (
      <>
        <TitleBar />
        {restored && <LoginScreen />}
      </>
    );
  }

  const activeId = selectedId ?? Object.keys(friendPlaybacks)[0] ?? null;
  const activeSong = activeId ? (friendPlaybacks[activeId] ?? null) : null;

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar selectedId={activeId} onSelect={setSelectedId} />
        <main className="app-main">
          {activeSong && activeId ? (
            <PlayerCard userId={activeId} song={activeSong} />
          ) : (
            <p className="empty-state">Nothing playing among your friends right now.</p>
          )}
        </main>
        <FriendsPanel />
      </div>
    </div>
  );
}

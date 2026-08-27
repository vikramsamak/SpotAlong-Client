import { useEffect, useState } from 'react';
import { useSpotAlongStore } from './store/useSpotAlongStore';
import TitleBar from './components/TitleBar';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import FriendsPanel from './components/FriendsPanel';
import PlaybackController from './components/PlaybackController';
import FriendsPage from './components/FriendsPage';
import ListeningToFriends from './components/ListeningToFriends';
import SettingsPanel from './components/SettingsPanel';
import FriendDetailPage from './components/FriendDetailPage';
import DisconnectBanner from './components/DisconnectBanner';
import SnackBar from './components/SnackBar';
import { useSyncWorker } from './hooks/useSyncWorker';

type Page = 'home' | 'listen' | 'settings' | { friendDetail: string };

export default function App() {
  const isAuthenticated = useSpotAlongStore((s) => s.isAuthenticated);
  const friendsList = useSpotAlongStore((s) => s.friendsList);
  const restoreSession = useSpotAlongStore((s) => s.restoreSession);
  const scheduleTokenRefresh = useSpotAlongStore((s) => s.scheduleTokenRefresh);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('home');
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
        <SnackBar />
      </>
    );
  }

  const viewFriend = (id: string) => {
    setSelectedId(id);
    setPage({ friendDetail: id });
  };

  const friendForDetail =
    page && typeof page === 'object' && 'friendDetail' in page
      ? friendsList.find((f) => f.id === page.friendDetail)
      : undefined;

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setPage({ friendDetail: id });
          }}
        />
        <main className="app-main">
          <nav className="main-nav">
            <button className={`nav-tab${page === 'home' ? ' active' : ''}`} onClick={() => setPage('home')}>
              Home
            </button>
            <button
              className={`nav-tab${page === 'listen' ? ' active' : ''}`}
              onClick={() => setPage('listen')}
            >
              Listen Along
            </button>
            <button
              className={`nav-tab${page === 'settings' ? ' active' : ''}`}
              onClick={() => setPage('settings')}
            >
              Settings
            </button>
          </nav>

          {typeof page === 'object' && friendForDetail ? (
            <FriendDetailPage friend={friendForDetail} onBack={() => setPage('home')} />
          ) : page === 'listen' ? (
            <ListeningToFriends />
          ) : page === 'settings' ? (
            <SettingsPanel />
          ) : (
            <FriendsPage viewFriend={viewFriend} />
          )}
        </main>
        <FriendsPanel />
      </div>
      <PlaybackController />
      <DisconnectBanner />
      <SnackBar />
    </div>
  );
}

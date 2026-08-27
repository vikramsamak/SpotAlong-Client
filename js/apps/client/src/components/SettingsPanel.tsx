import { useState } from 'react';
import { useSpotAlongStore } from '../store/useSpotAlongStore';
import Dialog from './Dialog';

export default function SettingsPanel() {
  const userId = useSpotAlongStore((s) => s.userId);
  const isAuthenticated = useSpotAlongStore((s) => s.isAuthenticated);
  const connected = useSpotAlongStore((s) => s.connected);
  const terminateSession = useSpotAlongStore((s) => s.terminateSession);

  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <div className="page">
      <section className="settings-section">
        <h2>Settings</h2>

        <div className="setting-row">
          <span className="setting-label">Account</span>
          <span className="setting-value">
            {isAuthenticated ? `Signed in (${userId ?? '…'})` : 'Not signed in'}
          </span>
        </div>

        <div className="setting-row">
          <span className="setting-label">Connection</span>
          <span className={`setting-value ${connected ? 'online' : 'offline'}`}>
            {connected ? 'Connected' : 'Reconnecting…'}
          </span>
        </div>

        <div className="setting-row buttons">
          <button className="settings-button" onClick={() => setConfirmLogout(true)}>
            Sign out
          </button>
        </div>
      </section>

      {confirmLogout && (
        <Dialog
          title="Sign out of SpotAlong?"
          description="You'll need to sign in again to reconnect with your friends."
          acceptLabel="Sign out"
          cancelLabel="Cancel"
          danger
          onCancel={() => setConfirmLogout(false)}
          onAccept={() => {
            terminateSession();
            setConfirmLogout(false);
          }}
        />
      )}
    </div>
  );
}

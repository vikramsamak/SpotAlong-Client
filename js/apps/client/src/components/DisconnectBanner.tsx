import { useSpotAlongStore } from '../store/useSpotAlongStore';

export default function DisconnectBanner() {
  const connected = useSpotAlongStore((s) => s.connected);
  const socket = useSpotAlongStore((s) => s.socket);

  if (connected || !socket) return null;

  return (
    <div className="disconnect-banner">
      <div className="disconnect-spinner" />
      <p>Reconnecting to SpotAlong…</p>
    </div>
  );
}

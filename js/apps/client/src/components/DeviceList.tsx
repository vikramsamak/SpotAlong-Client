import { useSpotAlongStore } from '../store/useSpotAlongStore';
import { playerApi } from '../services/playerApi';

export default function DeviceList() {
  const open = useSpotAlongStore((s) => s.devicesOpen);
  const devices = useSpotAlongStore((s) => s.playerDevices);
  const setDevicesOpen = useSpotAlongStore((s) => s.setDevicesOpen);
  const refreshDevices = useSpotAlongStore((s) => s.refreshDevices);
  const showSnackbar = useSpotAlongStore((s) => s.showSnackbar);

  if (!open) return null;

  const transfer = async (deviceId: string) => {
    try {
      await playerApi.command('transfer', deviceId);
      showSnackbar('Playback transferred', 'success');
      await refreshDevices();
    } catch (error) {
      showSnackbar(error instanceof Error ? error.message : 'Transfer failed', 'error');
    }
  };

  return (
    <div className="device-overlay" onClick={() => setDevicesOpen(false)}>
      <div className="device-popover" onClick={(e) => e.stopPropagation()}>
        <div className="device-header">
          <h4>Choose a device</h4>
          <button className="device-refresh" onClick={() => void refreshDevices()}>
            Refresh
          </button>
        </div>
        <ul className="device-list">
          {devices.length === 0 && <li className="device-empty">No devices found</li>}
          {devices.map((device) => (
            <li key={device.id}>
              <button
                className={`device-item${device.isActive ? ' active' : ''}`}
                onClick={() => void transfer(device.id)}
              >
                <span className="device-name">{device.name}</span>
                {device.isActive && <span className="device-active-badge">Active</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

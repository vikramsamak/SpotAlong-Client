import { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  MonitorSpeaker,
  Power
} from 'lucide-react';
import { useSpotAlongStore } from '../store/useSpotAlongStore';
import { playerApi, PlayerAction } from '../services/playerApi';
import DeviceList from './DeviceList';
import Tooltip from './Tooltip';

const COOKIE_KEY = 'spotalong.sp_t_cookie';

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function PlaybackController() {
  const hostPlayer = useSpotAlongStore((s) => s.hostPlayer);
  const startPlayerSession = useSpotAlongStore((s) => s.startPlayerSession);
  const stopPlayerSession = useSpotAlongStore((s) => s.stopPlayerSession);
  const setDevicesOpen = useSpotAlongStore((s) => s.setDevicesOpen);

  const [cookie, setCookie] = useState<string>(() => localStorage.getItem(COOKIE_KEY) ?? '');
  const [connecting, setConnecting] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  const snapshot = hostPlayer.snapshot;
  const active = hostPlayer.active;
  const track = snapshot?.track;

  useEffect(() => {
    if (snapshot?.positionSec !== undefined) setSeekValue(snapshot.positionSec);
  }, [snapshot?.positionSec]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const { hostPlayer: hp } = useSpotAlongStore.getState();
      const snap = hp.snapshot;
      if (snap?.playing) setSeekValue(snap.positionSec);
    }, 1000);
    return () => clearInterval(timer);
  }, [active]);

  const runCommand = async (action: PlayerAction, value?: unknown) => {
    try {
      const result = await playerApi.command(action, value);
      useSpotAlongStore.setState({
        hostPlayer: { active: true, snapshot: result.state ?? useSpotAlongStore.getState().hostPlayer.snapshot }
      });
    } catch (error) {
      useSpotAlongStore
        .getState()
        .showSnackbar(error instanceof Error ? error.message : 'Player command failed', 'error');
    }
  };

  const connect = async () => {
    setConnecting(true);
    try {
      const trimmed = cookie.trim();
      localStorage.setItem(COOKIE_KEY, trimmed);
      await startPlayerSession(trimmed);
    } catch {
      // snackbar is shown by the action
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await stopPlayerSession();
  };

  const togglePlay = () => runCommand(snapshot?.playing ? 'pause' : 'resume');

  if (!active || !snapshot) {
    return (
      <footer className="player-bar connect-bar">
        <div className="connect-player">
          <p className="connect-title">Connect your Spotify player</p>
          <p className="connect-hint">
            Paste your <code>sp_t</code> cookie so the SpotAlong server can control playback.
          </p>
          <div className="connect-row">
            <input
              type="password"
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              placeholder="sp_t cookie"
              autoComplete="off"
            />
            <button onClick={connect} disabled={connecting || !cookie.trim()}>
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </div>
      </footer>
    );
  }

  const durationSec = snapshot.durationMs / 1000 || 1;
  const progressPct = Math.min(100, (seekValue / durationSec) * 100);

  return (
    <footer className="player-bar">
      {track && (
        <div className="player-bar-now">
          {track.albumImage && <img className="player-bar-art" src={track.albumImage} alt="" />}
          <div className="player-bar-meta">
            <span className="player-bar-title">{track.name || 'Unknown track'}</span>
            <span className="player-bar-artists">
              {track.artists.map((a) => a.name).join(', ') || '—'}
            </span>
          </div>
        </div>
      )}

      <div className="player-bar-transport">
        <div className="transport-row">
          <button
            className={`transport-btn${snapshot.shuffling ? ' active' : ''}`}
            onClick={() => runCommand('shuffle', !snapshot.shuffling)}
          >
            <Shuffle size={16} />
          </button>
          <button className="transport-btn" onClick={() => runCommand('previous')}>
            <SkipBack size={18} />
          </button>
          <button className="transport-btn play-toggle" onClick={togglePlay}>
            {snapshot.playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button className="transport-btn" onClick={() => runCommand('next')}>
            <SkipForward size={18} />
          </button>
          <button
            className={`transport-btn${snapshot.looping !== 'off' ? ' active' : ''}`}
            onClick={() =>
              runCommand(
                'repeat',
                snapshot.looping === 'off'
                  ? 'context'
                  : snapshot.looping === 'context'
                    ? 'track'
                    : 'off'
              )
            }
          >
            {snapshot.looping === 'track' ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </button>
        </div>
        <div className="seek-row">
          <span className="time-label">{formatTime(seekValue)}</span>
          <input
            type="range"
            className="seek-slider"
            min={0}
            max={durationSec}
            step={1}
            value={seekValue}
            onChange={(e) => setSeekValue(Number(e.target.value))}
            onMouseUp={(e) => runCommand('seek', Math.round(Number((e.target as HTMLInputElement).value) * 1000))}
            style={{ ['--fill' as string]: `${progressPct}%` }}
          />
          <span className="time-label">{formatTime(durationSec)}</span>
        </div>
      </div>

      <div className="player-bar-tools">
        <Tooltip label={snapshot.volume <= 0 ? 'Unmute' : 'Mute'}>
          <button className="transport-btn" onClick={() => runCommand('volume', snapshot.volume <= 0 ? 50 : 0)}>
            {snapshot.volume <= 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </Tooltip>
        <input
          type="range"
          className="volume-slider"
          min={0}
          max={100}
          value={Math.round(snapshot.volume / 655.35)}
          onChange={(e) => runCommand('volume', Number(e.target.value))}
        />
        <Tooltip label="Devices">
          <button className="transport-btn" onClick={() => setDevicesOpen(true)}>
            <MonitorSpeaker size={16} />
          </button>
        </Tooltip>
        <Tooltip label="Disconnect player">
          <button className="transport-btn danger" onClick={disconnect}>
            <Power size={16} />
          </button>
        </Tooltip>
      </div>

      <DeviceList />
    </footer>
  );
}

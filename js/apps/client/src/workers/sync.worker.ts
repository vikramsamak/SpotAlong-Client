/// <reference lib="webworker" />

/**
 * Listener-side sync loop.
 *
 * Receives authoritative snapshots relayed from the host (via the server) and
 * interpolates the playback position locally at 0.5Hz so the UI stays smooth
 * without hammering the network. Applies RTT/2 latency compensation when a new
 * snapshot arrives and freezes on pause. Ad breaks are flagged and never
 * interpolated.
 */

export interface SyncStartMessage {
  type: 'sync';
  songId: string;
  positionMs: number;
  isPlaying: boolean;
  isAd: boolean;
  /** performance.now() at the moment the snapshot left the server */
  serverTimestamp: number;
  /** measured round-trip time of the socket, ms; half is subtracted */
  rttMs: number;
}

export interface SyncStopMessage {
  type: 'stop';
}

export type SyncIncomingMessage = SyncStartMessage | SyncStopMessage;

export interface TickOutgoingMessage {
  type: 'tick';
  songId: string;
  positionSec: number;
  isPlaying: boolean;
  isAd: boolean;
  driftWarning: boolean;
}

const TICK_INTERVAL_MS = 2000;

let currentSongId = '';
let basePositionMs = 0;
let localAnchorMs = 0;
let lastSnapshotAt = 0;
let playing = false;
let isAd = false;

const DRIFT_SNAPSHOT_MAX_AGE_MS = 15_000;

function now(): number {
  return performance.now();
}

function computePosition(): number {
  if (!playing || isAd) return basePositionMs / 1000;
  const elapsed = Math.max(now() - localAnchorMs - rttHalf, 0);
  return (basePositionMs + elapsed) / 1000;
}

let rttHalf = 0;

self.onmessage = (event: MessageEvent<SyncIncomingMessage>) => {
  const message = event.data;

  if (message.type === 'stop') {
    currentSongId = '';
    playing = false;
    isAd = false;
    return;
  }

  currentSongId = message.songId;
  isAd = message.isAd;
  playing = message.isPlaying && !isAd;
  basePositionMs = message.positionMs;
  localAnchorMs = message.serverTimestamp ?? now();
  lastSnapshotAt = now();
  rttHalf = Math.max(message.rttMs ?? 0, 0) / 2;
};

function tick(): void {
  if (!currentSongId) return;

  const positionSec = computePosition();
  const driftWarning =
    !isAd && playing && now() - lastSnapshotAt > DRIFT_SNAPSHOT_MAX_AGE_MS;

  const output: TickOutgoingMessage = {
    type: 'tick',
    songId: currentSongId,
    positionSec,
    isPlaying: playing,
    isAd,
    driftWarning
  };
  self.postMessage(output);
}

setInterval(tick, TICK_INTERVAL_MS);

export {};

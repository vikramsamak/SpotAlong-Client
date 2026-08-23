import { useEffect, useRef } from 'react';
import { useSpotAlongStore } from '../store/useSpotAlongStore';

/**
 * Drives the sync Web Worker for the friend currently being followed.
 * Feeds authoritative listening snapshots in and writes interpolated
 * positions back into the store at 0.5Hz.
 */
export function useSyncWorker(followedUserId: string | null): void {
  const workerRef = useRef<Worker | null>(null);
  const listeningStates = useSpotAlongStore((s) => s.listeningStates);
  const setSyncedPosition = useSpotAlongStore((s) => s.setSyncedPosition);

  useEffect(() => {
    if (!followedUserId) return;
    const worker = new Worker(new URL('../workers/sync.worker.ts', import.meta.url), {
      type: 'module'
    });
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data as {
        type: string;
        songId: string;
        positionSec: number;
        isPlaying: boolean;
        isAd: boolean;
        driftWarning: boolean;
      };
      if (message.type === 'tick') {
        setSyncedPosition(followedUserId, message.positionSec);
      }
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [followedUserId, setSyncedPosition]);

  const snapshot = followedUserId ? listeningStates[followedUserId] : undefined;
  const lastPushedAt = useRef(0);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || !snapshot || !followedUserId) return;

    const rttEstimateMs = Math.min(Date.now() - snapshot.receivedAt, 2000);
    worker.postMessage({
      type: 'sync',
      songId: snapshot.songId,
      positionMs: snapshot.progress * 1000,
      isPlaying: snapshot.isPlaying,
      isAd: false,
      serverTimestamp: performance.now() - rttEstimateMs,
      rttMs: rttEstimateMs
    });
    lastPushedAt.current = snapshot.receivedAt;
  }, [snapshot, followedUserId]);
}

import type { Namespace } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@spotalong/types';

export type AuthNamespace = Namespace<ClientToServerEvents, ServerToClientEvents>;

let authNamespace: AuthNamespace | null = null;

export function setAuthNamespace(namespace: AuthNamespace): void {
  authNamespace = namespace;
}

export function getAuthNamespace(): AuthNamespace | null {
  return authNamespace;
}

export function emitToUser<K extends keyof ServerToClientEvents>(
  userId: string,
  event: K,
  ...args: Parameters<ServerToClientEvents[K]>
): void {
  if (!authNamespace) return;
  authNamespace.to(`user:${userId}`).emit(event, ...args);
}

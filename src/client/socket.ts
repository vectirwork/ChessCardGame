// Connexion temps réel unique, partagée par toutes les pages.
import { io, Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../shared/protocol';

export type AppSocket = Socket<ServerToClient, ClientToServer>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({ transports: ['websocket', 'polling'], withCredentials: true });
  }
  return socket;
}

/** À appeler après connexion / déconnexion : le serveur relit l'identité dans les cookies. */
export function resetSocket() {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}

export function emitAck<T>(event: string, payload: unknown, timeout = 8000): Promise<T> {
  const s = getSocket() as any;
  return new Promise((resolve, reject) => {
    s.timeout(timeout).emit(event, payload, (err: unknown, res: T) => (err ? reject(new Error('Le serveur ne répond pas.')) : resolve(res)));
  });
}

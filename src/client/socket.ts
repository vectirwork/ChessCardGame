// Connexion temps réel unique, partagée par toutes les pages.
//
// Version du protocole : le client l'annonce à la connexion (auth.v, PROTOCOL_VERSION figée au build : __SM__) ; un
// onglet resté ouvert après une mise en ligne reçoit server:outdated et recharge la page (au plus une fois par minute).
import { io, Socket } from 'socket.io-client';
import type { ManagerOptions, SocketOptions } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../shared/protocol';
import { ApiError } from './api';

export type AppSocket = Socket<ServerToClient, ClientToServer>;

/**
 * Réglages de la connexion, passés à io(). Seuls ceux qui diffèrent de socket.io-client sont écrits (chaque octet du
 * paquet principal compte) ; les autres valent ses défauts : reconnexion sans fin (`reconnection: true`), après 1 s
 * puis jusqu'à 5 s (`reconnectionDelay: 1000`, `reconnectionDelayMax: 5000`, ± 50 % : `randomizationFactor: 0.5`) ;
 * connexion abandonnée puis reprise au bout de 20 s (`timeout: 20_000`). Pour en changer un, l'ajouter ici.
 */
export const SOCKET: Partial<ManagerOptions & SocketOptions> = {
  // WebSocket d'emblée, l'interrogation HTTP en secours (défaut : interrogation d'abord, puis WebSocket, WebTransport)
  transports: ['websocket', 'polling'],
};
/** Délai de réponse d'une action (emitAck), en ms. */
export const ACK_TIMEOUT_MS = 8000;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({ ...SOCKET, withCredentials: true, auth: { v: __SM__.protocole } });
    socket.on('server:outdated', reloadForNewVersion);
  }
  return socket;
}

/** À appeler après connexion / déconnexion : le serveur relit l'identité dans les cookies. */
export function resetSocket() {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}

/**
 * Nouvelle version du site (code introuvable, server:outdated) : recharge la page, au plus une fois par minute pour ne
 * jamais boucler. Rien dans la minute qui suit un rechargement, ni si le stockage de session est indisponible (aucun
 * risque de boucle).
 */
export function reloadForNewVersion(): void {
  try {
    if (Date.now() - Number(sessionStorage.getItem(__SM__.cleRechargement) ?? 0) < 60_000) return;
    sessionStorage.setItem(__SM__.cleRechargement, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
}

// Actions avec accusé de réception, typées par le contrat ClientToServer (src/shared/protocol.ts).
export type AckEvent = { [K in keyof ClientToServer]: Parameters<ClientToServer[K]> extends [unknown, (r: never) => void] ? K : never }[keyof ClientToServer];
export type AckPayload<K extends AckEvent> = Parameters<ClientToServer[K]>[0];
export type AckReply<K extends AckEvent> = Parameters<Parameters<ClientToServer[K]>[1]>[0];

/**
 * Envoie une action et attend la réponse du serveur ; au-delà du délai, rejette avec une ApiError « Le serveur ne
 * répond pas. ». Événement,
 * charge et réponse sont ceux de ClientToServer : `emitAck('game:join', { id })` rend une JoinReply.
 */
export function emitAck<K extends AckEvent>(event: K, payload: AckPayload<K>, timeout?: number): Promise<AckReply<K>>;
/**
 * Forme historique : type de réponse donné à la main (`emitAck<Ack>('game:move', …)`), vérifié contre les réponses
 * possibles ; l'événement et la charge restent contrôlés.
 * @deprecated écrire `emitAck('game:move', …)` : la réponse est déduite de l'événement.
 */
export function emitAck<R extends AckReply<AckEvent>>(event: AckEvent, payload: AckPayload<AckEvent>, timeout?: number): Promise<R>;
/**
 * Événement calculé, typé `string` (GamePage.send).
 * @deprecated typer l'événement (`AckEvent`) : un nom mal écrit passerait ici sans erreur.
 */
export function emitAck<R extends AckReply<AckEvent>>(event: string, payload: object, timeout?: number): Promise<R>;
export function emitAck(event: string, payload: unknown, timeout = ACK_TIMEOUT_MS): Promise<unknown> {
  const s = getSocket() as unknown as {
    timeout(ms: number): { emit(ev: string, p: unknown, ack: (err: unknown, res: unknown) => void): void };
  };
  return new Promise((resolve, reject) => {
    // Pas de réponse dans le délai : ApiError (statut 0, comme un échec réseau), dont errMsg relaie le message
    s.timeout(timeout).emit(event, payload, (err, res) => (err ? reject(new ApiError('Le serveur ne répond pas.', 0)) : resolve(res)));
  });
}

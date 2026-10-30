// Messages échangés entre le navigateur et le serveur (Socket.IO et API).

import type { Color, PieceType } from './chess';
import type { CardInfo, GameState, MoveInfo } from './game';

/** Cadence en secondes ; null = sans pendule. */
export interface TimeControl {
  initial: number;
  increment: number;
}

export const TIME_CONTROLS: { id: string; label: string; tc: TimeControl | null; family: string }[] = [
  { id: '1+0', label: '1 + 0', tc: { initial: 60, increment: 0 }, family: 'Bullet' },
  { id: '3+2', label: '3 + 2', tc: { initial: 180, increment: 2 }, family: 'Blitz' },
  { id: '5+0', label: '5 + 0', tc: { initial: 300, increment: 0 }, family: 'Blitz' },
  { id: '10+0', label: '10 + 0', tc: { initial: 600, increment: 0 }, family: 'Rapide' },
  { id: '15+10', label: '15 + 10', tc: { initial: 900, increment: 10 }, family: 'Rapide' },
  { id: 'none', label: 'Sans limite', tc: null, family: 'Libre' },
];

export const QUICK_CONTROLS = ['3+2', '5+0', '10+0', '15+10'];

export function tcFromId(id: string): TimeControl | null | undefined {
  return TIME_CONTROLS.find(t => t.id === id)?.tc;
}

export type GameMode = 'invite' | 'quick' | 'bot';
export type GameStatus = 'waiting' | 'active' | 'ended';

export interface SeatView {
  kind: 'user' | 'guest' | 'bot';
  name: string;
  username: string | null;
  rating: number | null;
  skin: string;
  online: boolean;
  level?: number;
}

export interface ClockView {
  initial: number;
  increment: number;
  /** Temps restant en millisecondes au moment `serverNow`. */
  w: number;
  b: number;
  running: Color | null;
  serverNow: number;
  /** Multiplicateur de vitesse (Distorsion temporelle). */
  rate: Record<Color, number>;
}

export interface GameView {
  id: string;
  mode: GameMode;
  rated: boolean;
  status: GameStatus;
  seats: Record<Color, SeatView | null>;
  /** Couleur du spectateur, null s'il ne joue pas. */
  you: Color | null;
  state: GameState;
  clock: ClockView | null;
  drawOffer: Color | null;
  rematch: { w: boolean; b: boolean; next: string | null };
  ratingDiff: Record<Color, number> | null;
  /** Échéance pour jouer le premier coup (sinon la partie est annulée). */
  firstMoveDeadline: number | null;
  /** Depuis quand chaque joueur est déconnecté (horodatage serveur). */
  away: Record<Color, number | null>;
  claimAfterMs: number;
  createdAt: number;
  /** Les deux joueurs ont la même main. */
  mirror: boolean;
  /** Chaque joueur a joué son premier coup : la partie ne peut plus être annulée. */
  started: boolean;
}

export type GameEvent =
  | { type: 'move'; color: Color; info: MoveInfo }
  | { type: 'card'; info: CardInfo }
  | { type: 'start' }
  | { type: 'end' }
  | { type: 'sync' };

export interface GameUpdate {
  view: GameView;
  event: GameEvent;
}

export interface JoinReply {
  ok: boolean;
  error?: string;
  needName?: boolean;
  view?: GameView;
}

export interface Ack {
  ok: boolean;
  error?: string;
}

export const EMOTES: Record<string, string> = {
  gg: 'Bien joué !',
  wow: 'Waouh !',
  oops: 'Oups…',
  hi: 'Salut !',
  thanks: 'Merci !',
  luck: 'Bonne chance !',
};

export interface ServerToClient {
  'game:update': (u: GameUpdate) => void;
  'game:emote': (p: { gameId: string; color: Color; key: string }) => void;
  'game:redirect': (p: { from: string; to: string }) => void;
  'queue:matched': (p: { gameId: string }) => void;
  'queue:status': (p: { waiting: boolean; tc: string | null; since: number | null; players: number }) => void;
}

export interface ClientToServer {
  'game:join': (p: { id: string; name?: string; sit?: boolean }, ack: (r: JoinReply) => void) => void;
  'game:leave': (p: { id: string }) => void;
  'game:move': (p: { id: string; from: number; to: number; promo?: PieceType }, ack: (r: Ack) => void) => void;
  'game:card': (p: { id: string; index: number; targets: number[] }, ack: (r: Ack) => void) => void;
  'game:resign': (p: { id: string }, ack: (r: Ack) => void) => void;
  'game:abort': (p: { id: string }, ack: (r: Ack) => void) => void;
  'game:draw': (p: { id: string; action: 'offer' | 'accept' | 'decline' }, ack: (r: Ack) => void) => void;
  'game:claim': (p: { id: string }, ack: (r: Ack) => void) => void;
  'game:rematch': (p: { id: string }, ack: (r: Ack) => void) => void;
  'game:emote': (p: { id: string; key: string }) => void;
  'queue:join': (p: { tc: string }, ack: (r: Ack) => void) => void;
  'queue:leave': () => void;
}

/** Utilisateur connecté, tel que renvoyé par /api/me. */
export interface MeUser {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  equippedSkin: string;
  equippedBoard: string;
  items: string[];
  isAdmin: boolean;
  createdAt: string;
}

export interface MeResponse {
  user: MeUser | null;
  guestId: string;
  payments: 'stripe' | 'demo' | 'off';
  appName: string;
}

export interface GameSummary {
  id: string;
  mode: GameMode;
  rated: boolean;
  status: GameStatus;
  white: string | null;
  black: string | null;
  whiteRating: number | null;
  blackRating: number | null;
  winner: Color | 'draw' | null;
  reason: string | null;
  timeControl: string;
  createdAt: string;
  plies: number;
}

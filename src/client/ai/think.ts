// Décision de l'IA pour un tour complet : les cartes éventuelles, puis le coup joué après elles.
// Fonction pure, exécutée dans le Web Worker (bot.worker.ts) ou, à défaut, sur le fil principal. La décision est
// decideTurn (shared/bot.ts), la même que sur le serveur (bot-worker.ts).
import { decideTurn } from '../../shared/bot';
import type { BotLevel } from '../../shared/bot';
import type { Move } from '../../shared/chess';
import type { GameState } from '../../shared/game';
import type { BotCard, BotRequest as SharedRequest } from '../../shared/botProtocol';

export interface BotDecision {
  /** Première carte à lancer avant le coup (index dans la main, cibles), ou null (`cards[0] ?? null`). */
  card: BotCard | null;
  /** Cartes à lancer, dans l'ordre (autant que les règles de la partie en permettent). */
  cards: BotCard[];
  /** Coup à jouer après les cartes, calculé sur la position qui en résulte (null si une carte a fini le tour). */
  move: Move | null;
}

export type BotRequest = SharedRequest;

export interface BotReply extends BotDecision {
  id: number;
  error?: string;
}

/** Options d'une demande : `cards: false` pour le coup seul (sans carte). */
export type ThinkOptions = SharedRequest['opts'];

export function think(s: GameState, level: BotLevel, opts?: ThinkOptions): BotDecision {
  const d = decideTurn(s, level, opts);
  return { card: d.cards[0] ?? null, cards: d.cards, move: d.move };
}

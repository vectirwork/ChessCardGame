// Messages échangés avec un fil de calcul de l'IA : thread du serveur (bot-worker.ts, bot-pool.ts) ou Web Worker du
// navigateur (client/ai). Types seulement : le contrat est le même des deux côtés.
//
// Une décision couvre un tour complet : les cartes à lancer (dans l'ordre, autant que les règles de la partie en
// permettent : castsLeft), puis le coup. `card` reste la première carte, pour les appelants qui n'en lisent qu'une.

import type { BotLevel } from './bot';
import type { PieceType } from './chess';
import type { GameState } from './game';

/** Carte à lancer : index dans la main du camp au trait, cases désignées. */
export interface BotCard {
  index: number;
  targets: number[];
}

/** Coup à jouer après les cartes, calculé sur la position qui en résulte. */
export interface BotMove {
  from: number;
  to: number;
  promo?: PieceType;
}

export interface BotRequest {
  id: number;
  state: GameState;
  level: BotLevel;
  /** `cards: false` : l'IA ne lance aucune carte (seulement le coup). Défaut : cartes permises. */
  opts?: { cards?: boolean };
}

/** Décision de l'IA pour le camp au trait. */
export interface BotDecision {
  /** Première carte à lancer, ou null (identique à `cards[0] ?? null`). */
  card: BotCard | null;
  /** Cartes à lancer, dans l'ordre (absent : `card` seule, réponse d'un fil plus ancien). */
  cards?: BotCard[];
  /** Coup à jouer après les cartes, ou null si une carte a terminé le tour (Rituel) ou si la partie est finie. */
  move: BotMove | null;
}

export interface BotReply extends BotDecision {
  id: number;
  /** Erreur du calcul ; la décision est alors vide. */
  error?: string;
}

/** Cartes d'une réponse, qu'elle vienne d'un fil récent (`cards`) ou ancien (`card`). */
export function cardsOfReply(r: BotDecision): BotCard[] {
  return r.cards ?? (r.card ? [r.card] : []);
}

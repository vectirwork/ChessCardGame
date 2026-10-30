// Décision de l'IA pour un tour complet : une carte éventuelle, puis le coup joué après elle.
// Fonction pure, exécutée dans le Web Worker (bot.worker.ts) ou, à défaut, sur le fil principal.
import { chooseBotCard, chooseBotMove } from '../../shared/bot';
import type { BotLevel } from '../../shared/bot';
import type { Move } from '../../shared/chess';
import { playCard } from '../../shared/game';
import type { GameState } from '../../shared/game';

export interface BotDecision {
  /** Carte à lancer avant le coup (index dans la main, cibles), ou null. */
  card: { index: number; targets: number[] } | null;
  /** Coup à jouer après la carte, calculé sur la position qui en résulte (null si la carte a fini le tour). */
  move: Move | null;
}

export interface BotRequest {
  id: number;
  state: GameState;
  level: BotLevel;
}

export interface BotReply extends BotDecision {
  id: number;
  error?: string;
}

export function think(s: GameState, level: BotLevel): BotDecision {
  const me = s.pos.turn;
  if (s.result) return { card: null, move: null };
  let card: BotDecision['card'] = null;
  let after = s;
  if (!s.cardPlayed && s.hands[me].some(h => !h.used && h.card)) {
    const c = chooseBotCard(s, level);
    if (c) {
      const r = playCard(s, me, c.index, c.targets, '');
      if (r.ok) {
        card = c;
        after = r.state;
      }
    }
  }
  const move = !after.result && after.pos.turn === me ? chooseBotMove(after, level) : null;
  return { card, move };
}

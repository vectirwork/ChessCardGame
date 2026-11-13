// Thread de calcul de l'IA : la recherche ne bloque jamais la boucle d'événements du serveur.
// La décision d'un tour est decideTurn (shared/bot.ts), la même que dans le navigateur (client/ai/think.ts).
import { parentPort } from 'node:worker_threads';
import type { GameState } from '../shared/game';
import { decideTurn } from '../shared/bot';
import type { BotLevel } from '../shared/bot';
import type { BotReply, BotRequest } from '../shared/botProtocol';

export type { BotReply, BotRequest } from '../shared/botProtocol';

/**
 * Tour complet de l'IA : `cards` (dans l'ordre, autant que les règles de la partie en permettent), puis le coup.
 * `card` reste la première carte, pour les appelants qui n'en lisent qu'une.
 */
export function decide(state: GameState, level: BotLevel, opts?: BotRequest['opts']): Omit<BotReply, 'id'> {
  const d = decideTurn(state, level, opts);
  const m = d.move;
  return { card: d.cards[0] ?? null, cards: d.cards, move: m ? { from: m.from, to: m.to, promo: m.promo } : null };
}

parentPort?.on('message', (req: BotRequest) => {
  try {
    parentPort!.postMessage({ id: req.id, ...decide(req.state, req.level, req.opts) } satisfies BotReply);
  } catch (e) {
    parentPort!.postMessage({ id: req.id, card: null, cards: [], move: null, error: String(e) } satisfies BotReply);
  }
});

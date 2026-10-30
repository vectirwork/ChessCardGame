// Thread de calcul de l'IA : la recherche ne bloque jamais la boucle d'événements du serveur.
import { parentPort } from 'node:worker_threads';
import { playCard, GameState } from '../shared/game';
import { BotLevel, chooseBotCard, chooseBotMove } from '../shared/bot';

export interface BotRequest { id: number; state: GameState; level: BotLevel }
export interface BotReply {
  id: number;
  card: { index: number; targets: number[] } | null;
  move: { from: number; to: number; promo?: string } | null;
  error?: string;
}

export function decide(state: GameState, level: BotLevel): Omit<BotReply, 'id'> {
  let card = chooseBotCard(state, level);
  let after = state;
  if (card) {
    const r = playCard(state, state.pos.turn, card.index, card.targets, '');
    if (r.ok) after = r.state;
    else card = null;
  }
  // Après un Retour arrière (Duel) ou un Rituel (Grande Marée, qui tient lieu de coup), c'est à l'adversaire de
  // jouer : pas de coup à calculer. Après un Déjà-vu, l'IA rejoue, sans la pièce interdite (legalMovesOf).
  const m = after.pos.turn === state.pos.turn && !after.result ? chooseBotMove(after, level) : null;
  return { card, move: m ? { from: m.from, to: m.to, promo: m.promo } : null };
}

parentPort?.on('message', (req: BotRequest) => {
  try {
    parentPort!.postMessage({ id: req.id, ...decide(req.state, req.level) } satisfies BotReply);
  } catch (e) {
    parentPort!.postMessage({ id: req.id, card: null, move: null, error: String(e) } satisfies BotReply);
  }
});

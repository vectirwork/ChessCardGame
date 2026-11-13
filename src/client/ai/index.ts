// IA dans le navigateur : un Web Worker partagé, avec repli sur le fil principal s'il ne démarre pas.
//
//   const d = await askBot(state, 2);   // { card, cards: [{ index, targets }…], move: Move | null }
//   const m = await askBot(state, 2, { cards: false });   // le coup seul, sans carte
//
// La décision est calculée sur `state` tel quel : l'appelant vérifie que la position n'a pas changé entre-temps.
import type { BotLevel } from '../../shared/bot';
import type { GameState } from '../../shared/game';
import { think } from './think';
import type { BotDecision, BotReply, ThinkOptions } from './think';

export type { BotDecision } from './think';
export { BOT_PROFILES } from '../../shared/bot';
export type { BotLevel } from '../../shared/bot';

interface Pending {
  resolve: (d: BotDecision) => void;
  state: GameState;
  level: BotLevel;
  opts: ThinkOptions;
  timer: number;
}

let worker: Worker | null | undefined;
let seq = 0;
const pending = new Map<number, Pending>();

/** Au-delà, on calcule sur le fil principal (Worker bloqué ou absent). */
const WORKER_TIMEOUT = 20000;

function settleLocally(id: number) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  window.clearTimeout(p.timer);
  // Un instant de répit pour laisser l'interface se peindre avant la recherche
  window.setTimeout(() => p.resolve(safeThink(p.state, p.level, p.opts)), 16);
}

function safeThink(state: GameState, level: BotLevel, opts: ThinkOptions): BotDecision {
  try {
    return think(state, level, opts);
  } catch {
    return { card: null, cards: [], move: null };
  }
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module', name: 'spellmate-ia' });
    worker.onmessage = (e: MessageEvent<BotReply>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      window.clearTimeout(p.timer);
      if (e.data.error) p.resolve(safeThink(p.state, p.level, p.opts));
      else p.resolve({ card: e.data.card, cards: e.data.cards ?? (e.data.card ? [e.data.card] : []), move: e.data.move });
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      for (const id of Array.from(pending.keys())) settleLocally(id);
    };
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Demande à l'IA son tour complet (cartes éventuelles puis coup) pour le camp au trait. `opts.cards: false` : le coup
 * seul (par exemple après une carte refusée), sans contourner les règles de la partie.
 */
export function askBot(state: GameState, level: BotLevel, opts?: ThinkOptions): Promise<BotDecision> {
  return new Promise(resolve => {
    const id = ++seq;
    const timer = window.setTimeout(() => settleLocally(id), WORKER_TIMEOUT);
    pending.set(id, { resolve, state, level, opts, timer });
    const w = getWorker();
    if (!w) {
      settleLocally(id);
      return;
    }
    try {
      w.postMessage(opts ? { id, state, level, opts } : { id, state, level });
    } catch {
      settleLocally(id);
    }
  });
}

/** Libère le Worker (inutile en temps normal : il est partagé par toutes les parties locales). */
export function disposeBot() {
  worker?.terminate();
  worker = undefined;
  for (const id of Array.from(pending.keys())) settleLocally(id);
}

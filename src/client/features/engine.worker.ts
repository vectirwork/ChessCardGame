// Web Worker du moteur d'analyse : analyse() de src/shared/bot.ts, hors du fil principal.
// Une requête « live » renvoie chaque profondeur terminée ; une requête « batch » analyse une suite de positions
// (relecture d'une partie) et renvoie chaque évaluation dès qu'elle est prête.
import { analyse } from '../../shared/bot';
import type { Analysis } from '../../shared/bot';
import type { GameState } from '../../shared/game';

export type EngineRequest =
  | { id: number; kind: 'live'; state: GameState; depth: number; ms: number }
  | { id: number; kind: 'batch'; states: GameState[]; depth: number; ms: number };

export type EngineReply =
  | { id: number; kind: 'depth'; a: Analysis; done: boolean }
  | { id: number; kind: 'item'; index: number; a: Analysis }
  | { id: number; kind: 'end' }
  | { id: number; kind: 'error'; message: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<EngineRequest>) => void) | null;
  postMessage: (msg: EngineReply) => void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = e => {
  const req = e.data;
  try {
    if (req.kind === 'live') {
      const a = analyse(req.state, req.depth, req.ms, d => scope.postMessage({ id: req.id, kind: 'depth', a: d, done: false }));
      scope.postMessage({ id: req.id, kind: 'depth', a, done: true });
    } else {
      req.states.forEach((s, index) => {
        scope.postMessage({ id: req.id, kind: 'item', index, a: analyse(s, req.depth, req.ms) });
      });
      scope.postMessage({ id: req.id, kind: 'end' });
    }
  } catch (err) {
    scope.postMessage({ id: req.id, kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

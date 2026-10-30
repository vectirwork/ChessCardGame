// Web Worker de l'IA : la recherche alpha-bêta tourne hors du fil principal, l'interface reste fluide.
import { think } from './think';
import type { BotReply, BotRequest } from './think';

interface WorkerScope {
  onmessage: ((e: MessageEvent<BotRequest>) => void) | null;
  postMessage: (msg: BotReply) => void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = e => {
  const { id, state, level } = e.data;
  try {
    scope.postMessage({ id, ...think(state, level) });
  } catch (err) {
    scope.postMessage({ id, card: null, move: null, error: err instanceof Error ? err.message : String(err) });
  }
};

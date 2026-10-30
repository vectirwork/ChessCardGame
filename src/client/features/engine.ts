// Moteur d'analyse dans un Web Worker (avec repli sur le fil principal si le Worker ne démarre pas).
//   const { analysis, running } = useEngine(state, actif);   // analyse progressive de la position
//   const stop = reviewStates(états, (i, a) => …, () => …);  // relecture : une évaluation par position
import { useEffect, useRef, useState } from 'react';
import { analyse } from '../../shared/bot';
import type { Analysis } from '../../shared/bot';
import type { GameState } from '../../shared/game';
import type { EngineReply, EngineRequest } from './engine.worker';

export type { Analysis } from '../../shared/bot';

/** Analyse continue : profondeur maximale et temps alloué par position. */
export const LIVE_DEPTH = 12;
export const LIVE_MS = 6000;
/** Relecture : profondeur fixe, temps borné par position. */
export const REVIEW_DEPTH = 3;
export const REVIEW_MS = 900;

function spawn(): Worker | null {
  try {
    return new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module', name: 'spellmate-analyse' });
  } catch {
    return null;
  }
}

class LiveRunner {
  private worker: Worker | null = null;
  private busy = false;
  private seq = 0;
  private failed = false;
  private fallbackTimer = 0;

  start(state: GameState, onDepth: (a: Analysis, done: boolean) => void) {
    this.stop();
    const id = ++this.seq;
    if (!this.failed && !this.worker) {
      this.worker = spawn();
      if (!this.worker) this.failed = true;
    }
    const w = this.worker;
    if (!w) {
      // Repli : calcul court sur le fil principal, après un instant pour laisser l'interface se peindre.
      this.fallbackTimer = window.setTimeout(() => {
        if (id !== this.seq) return;
        try {
          onDepth(analyse(state, 4, 600), true);
        } catch {
          // position non analysable
        }
      }, 30);
      return;
    }
    this.busy = true;
    w.onmessage = (e: MessageEvent<EngineReply>) => {
      const r = e.data;
      if (r.id !== this.seq) return;
      if (r.kind === 'depth') {
        if (r.done) this.busy = false;
        onDepth(r.a, r.done);
      } else if (r.kind === 'error') this.busy = false;
    };
    w.onerror = () => {
      this.kill();
      this.failed = true;
      this.start(state, onDepth);
    };
    const req: EngineRequest = { id, kind: 'live', state, depth: LIVE_DEPTH, ms: LIVE_MS };
    try {
      w.postMessage(req);
    } catch {
      this.kill();
      this.failed = true;
    }
  }

  /** Arrête le calcul en cours : un Worker occupé est remplacé (analyse() est synchrone, on ne peut pas l'interrompre). */
  stop() {
    this.seq++;
    window.clearTimeout(this.fallbackTimer);
    if (this.busy) this.kill();
  }

  private kill() {
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
  }

  dispose() {
    this.stop();
    this.kill();
  }
}

export interface EngineState {
  analysis: Analysis | null;
  running: boolean;
}

/** Analyse progressive de `state` tant que `enabled` ; se relance à chaque changement de position. */
export function useEngine(state: GameState | null, enabled: boolean): EngineState {
  const runner = useRef<LiveRunner | null>(null);
  const [res, setRes] = useState<{ for: GameState | null; a: Analysis | null; running: boolean }>({ for: null, a: null, running: false });
  useEffect(() => {
    runner.current = new LiveRunner();
    return () => runner.current?.dispose();
  }, []);
  useEffect(() => {
    const r = runner.current;
    if (!r) return;
    if (!enabled || !state || state.result) {
      r.stop();
      setRes({ for: state, a: null, running: false });
      return;
    }
    setRes({ for: state, a: null, running: true });
    const t = window.setTimeout(() => {
      r.start(state, (a, done) => setRes({ for: state, a, running: !done }));
    }, 140);
    return () => window.clearTimeout(t);
  }, [state, enabled]);
  if (res.for !== state) return { analysis: null, running: enabled && !!state && !state.result };
  return { analysis: res.a, running: res.running };
}

/** Évalue une suite de positions (relecture), dans un Worker dédié. Renvoie la fonction d'arrêt. */
export function reviewStates(states: GameState[], onItem: (index: number, a: Analysis) => void, onEnd: () => void): () => void {
  let stopped = false;
  const w = spawn();
  if (!w) {
    // Repli : une position par tranche de temps, sur le fil principal.
    let i = 0;
    const step = () => {
      if (stopped) return;
      if (i >= states.length) return onEnd();
      try {
        onItem(i, analyse(states[i], 2, 250));
      } catch {
        // position non analysable
      }
      i++;
      window.setTimeout(step, 10);
    };
    window.setTimeout(step, 30);
    return () => { stopped = true; };
  }
  w.onmessage = (e: MessageEvent<EngineReply>) => {
    if (stopped) return;
    const r = e.data;
    if (r.kind === 'item') onItem(r.index, r.a);
    else if (r.kind === 'end' || r.kind === 'error') {
      onEnd();
      w.terminate();
    }
  };
  w.onerror = () => {
    if (!stopped) onEnd();
    w.terminate();
  };
  const req: EngineRequest = { id: 1, kind: 'batch', states, depth: REVIEW_DEPTH, ms: REVIEW_MS };
  w.postMessage(req);
  return () => {
    stopped = true;
    w.terminate();
  };
}

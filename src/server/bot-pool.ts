// Pool de threads pour l'IA. Si les threads ne démarrent pas, le calcul se fait sur le thread principal.
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { GameState } from '../shared/game';
import type { BotLevel } from '../shared/bot';
import type { BotReply } from './bot-worker';

type Pending = { resolve: (r: BotReply) => void; reject: (e: Error) => void };

class BotPool {
  private workers: Worker[] = [];
  private next = 0;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private inline = false;

  start() {
    const devMode = import.meta.url.endsWith('.ts');
    const file = new URL(devMode ? './bot-worker-dev.mjs' : './bot-worker.js', import.meta.url);
    const count = Math.max(1, Math.min(4, cpus().length - 1));
    try {
      for (let i = 0; i < count; i++) {
        const w = new Worker(file);
        w.on('message', (r: BotReply) => {
          const p = this.pending.get(r.id);
          if (!p) return;
          this.pending.delete(r.id);
          p.resolve(r);
        });
        w.on('error', e => console.error('Thread IA :', e));
        w.unref();
        this.workers.push(w);
      }
    } catch (e) {
      console.warn('Threads IA indisponibles, calcul sur le thread principal :', e);
      this.inline = true;
    }
  }

  async decide(state: GameState, level: BotLevel): Promise<BotReply> {
    const id = ++this.seq;
    if (this.inline || !this.workers.length) {
      const { decide } = await import('./bot-worker');
      return { id, ...decide(state, level) };
    }
    const w = this.workers[this.next++ % this.workers.length];
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage({ id, state, level });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error('IA : délai dépassé'));
      }, 20_000);
    });
  }
}

export const botPool = new BotPool();

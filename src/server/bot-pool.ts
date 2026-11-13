// Fils de calcul de l'IA. Une décision est confiée à un fil, à tour de rôle ; si aucun fil ne démarre, le calcul se
// fait sur le fil principal (dans le processus).
//
// Un fil qui meurt (manque de mémoire, erreur de chargement : événement 'error' ou 'exit') sort aussitôt de la
// rotation ; ses demandes en attente sont rejetées tout de suite (au lieu d'attendre BOT_RUNTIME.timeoutMs), et il est
// remplacé. Au-delà de BOT_THREADS.maxRestarts remplacements en BOT_THREADS.restartWindowMs (un fil qui meurt dès son
// démarrage), on cesse de le remplacer ; quand il ne reste plus aucun fil, le calcul se fait dans le processus.
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { GameState } from '../shared/game';
import type { BotLevel } from '../shared/bot';
import type { BotReply } from './bot-worker';
import { BOT_RUNTIME, BOT_THREADS } from './settings';

/** Ce que le pool attend d'un fil (Worker de node, ou doublure des tests). */
export interface BotThread {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (r: BotReply) => void): unknown;
  on(event: 'error', listener: (e: Error) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  unref?(): void;
}

type Pending = { resolve: (r: BotReply) => void; reject: (e: Error) => void; thread: BotThread; timer: NodeJS.Timeout };

/** Fil de calcul du serveur : bot-worker.js une fois construit, bot-worker-dev.mjs en développement (tsx). */
function spawnWorker(): BotThread {
  const devMode = import.meta.url.endsWith('.ts');
  return new Worker(new URL(devMode ? './bot-worker-dev.mjs' : './bot-worker.js', import.meta.url));
}

/** Pool des fils de calcul. Exporté pour les tests (doublure de fil, nombre de fils). */
export class BotPool {
  private threads: BotThread[] = [];
  private next = 0;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private inline = false;
  /** Heures des derniers remplacements de fils morts. */
  private restarts: number[] = [];

  constructor(
    private spawn: () => BotThread = spawnWorker,
    private size: () => number = () => Math.max(1, Math.min(BOT_RUNTIME.maxThreads, cpus().length - 1)),
  ) {}

  /** Calcul dans le processus (aucun fil). */
  get isInline(): boolean {
    return this.inline || !this.threads.length;
  }

  /** Fils en service. */
  get threadCount(): number {
    return this.threads.length;
  }

  start() {
    const count = this.size();
    for (let i = 0; i < count; i++) {
      if (!this.add()) break;
    }
    if (!this.threads.length) {
      console.warn('Threads IA indisponibles : calcul sur le thread principal.');
      this.inline = true;
    }
  }

  /** Démarre un fil et l'ajoute à la rotation ; faux s'il ne démarre pas. */
  private add(): boolean {
    let t: BotThread;
    try {
      t = this.spawn();
    } catch (e) {
      console.warn('Thread IA : démarrage impossible :', e);
      return false;
    }
    t.on('message', (r: BotReply) => {
      const p = this.pending.get(r.id);
      if (!p) return;
      this.pending.delete(r.id);
      clearTimeout(p.timer);
      p.resolve(r);
    });
    t.on('error', e => this.lost(t, `erreur : ${e?.message ?? e}`));
    t.on('exit', code => this.lost(t, `arrêt (code ${code})`));
    t.unref?.();
    this.threads.push(t);
    return true;
  }

  /** Un fil est mort : il sort de la rotation, ses demandes échouent tout de suite, il est remplacé si possible. */
  private lost(t: BotThread, why: string) {
    const i = this.threads.indexOf(t);
    if (i < 0) return;
    this.threads.splice(i, 1);
    console.error(`Thread IA perdu (${why}).`);
    for (const [id, p] of this.pending) {
      if (p.thread !== t) continue;
      this.pending.delete(id);
      clearTimeout(p.timer);
      p.reject(new Error(`IA : thread de calcul perdu (${why})`));
    }
    const now = Date.now();
    this.restarts = this.restarts.filter(at => now - at < BOT_THREADS.restartWindowMs);
    if (this.restarts.length < BOT_THREADS.maxRestarts) {
      this.restarts.push(now);
      this.add();
    } else {
      console.error('Threads IA : trop de pertes successives, plus de remplacement.');
    }
    if (!this.threads.length) {
      console.warn('Threads IA indisponibles : calcul sur le thread principal.');
      this.inline = true;
    }
  }

  async decide(state: GameState, level: BotLevel): Promise<BotReply> {
    const id = ++this.seq;
    if (this.isInline) {
      const { decide } = await import('./bot-worker');
      return { id, ...decide(state, level) };
    }
    const thread = this.threads[this.next++ % this.threads.length];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error('IA : délai dépassé'));
      }, BOT_RUNTIME.timeoutMs);
      this.pending.set(id, { resolve, reject, thread, timer });
      thread.postMessage({ id, state, level });
    });
  }
}

export const botPool = new BotPool();

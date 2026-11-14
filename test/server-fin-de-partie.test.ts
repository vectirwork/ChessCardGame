// Fin de partie non enregistrée (relecture finale, lot 9f) : la base ne répond plus au moment où une partie classée se
// termine, au-delà des essais de persistResult (PERSIST). Avant le correctif, le ménage évinçait la salle terminée
// au bout de TIMINGS.endedRoomEvictMs ; game:join la relisait alors en base, où elle était encore « active » : la
// partie était reprise, et le perdant pouvait réclamer la victoire (game:claim), classement compris.
// Maintenant : une salle terminée dont le résultat attend son enregistrement (resultPending) n'est jamais évincée, et le
// ménage relance l'enregistrement (un seul à la fois : persisting) jusqu'au retour de la base : un essai par ménage,
// sans rien noter tant qu'il échoue (relecture du lot 9f : cinq lignes avec leur pile par minute et par partie), puis
// une ligne quand la base l'accepte.
// Chemin complet du socket (doublures de socket.io), base simulée en mémoire.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Base simulée : lignes de `games` (statut, données, classement appliqué), mises à jour des comptes, panne. */
const db = vi.hoisted(() => ({
  down: false,
  games: new Map<string, { status: string; data: string; ratingsApplied: boolean }>(),
  userUpdates: [] as unknown[][],
  selects: [] as string[],
}));

vi.mock('../src/server/db', () => {
  const run = async (sql: string, params: unknown[] = []) => {
    if (db.down) throw new Error('connexion refusée');
    const s = sql.trim();
    if (/^INSERT INTO games/.test(s)) {
      const id = params[0] as string;
      const prev = db.games.get(id);
      db.games.set(id, { status: params[3] as string, data: params[16] as string, ratingsApplied: prev?.ratingsApplied ?? false });
      return { rows: [], rowCount: 1 };
    }
    if (/^UPDATE games SET ratings_applied/.test(s)) {
      const g = db.games.get(params[0] as string);
      if (g && !g.ratingsApplied) {
        g.ratingsApplied = true;
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (/^UPDATE users/.test(s)) {
      db.userUpdates.push(params);
      return { rows: [], rowCount: 1 };
    }
    if (/^SELECT data FROM games WHERE id = \$1/.test(s)) {
      const g = db.games.get(params[0] as string);
      db.selects.push(params[0] as string);
      return { rows: g ? [{ data: JSON.parse(g.data) }] : [], rowCount: g ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    q: vi.fn(async (sql: string, params: unknown[]) => (await run(sql, params)).rows),
    one: vi.fn(async (sql: string, params: unknown[]) => (await run(sql, params)).rows[0] ?? null),
    tx: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => {
      if (db.down) throw new Error('connexion refusée');
      return fn({ query: run });
    }),
  };
});
vi.mock('../src/server/bot-pool', () => ({
  botPool: { decide: vi.fn(async () => ({ move: null, card: null })) },
}));

import type { Identity, UserRow } from '../src/server/auth';
import { tx } from '../src/server/db';
import { attachSockets, newRoom, persistResult } from '../src/server/games';
import { PERSIST, TIMINGS } from '../src/server/settings';
import { sqIndex as sq } from '../src/shared/chess';
import type { SeatArg } from './helpers/sieges';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
});
afterEach(() => {
  db.down = false;
  vi.clearAllTimers();
  vi.useRealTimers();
});

function user(id: string): UserRow {
  return {
    id, email: `${id}@test.fr`, username: id, password_hash: '', email_verified: true, rating: 1500, games_played: 10, wins: 1,
    losses: 1, draws: 1, equipped_skin: 'skin:arcane', equipped_board: 'board:arcane', equipped_king: 'king:arcane', is_admin: false,
    created_at: new Date(0), items: [],
  };
}
const account = (id: string): Identity => ({ user: user(id), guestId: `u-${id}`, sessionId: 's' });
const seat = (id: string): SeatArg => ({
  kind: 'user', key: `u:${id}`, userId: id, name: id, username: id, rating: 1500, gamesPlayed: 10, skin: '',
});

/** Doublure d'un socket du serveur (comme test/server-features.test.ts). */
class FakeSocket {
  static n = 0;
  id = `F${++FakeSocket.n}`;
  handlers = new Map<string, (...a: unknown[]) => unknown>();
  emitted: [string, unknown][] = [];
  handshake = { auth: {}, headers: {} };
  data: { identity: Identity };
  constructor(identity: Identity) {
    this.data = { identity };
  }
  on(ev: string, f: (...a: unknown[]) => unknown) {
    this.handlers.set(ev, f);
    return this;
  }
  use() {
    return this;
  }
  emit(ev: string, p: unknown) {
    this.emitted.push([ev, p]);
    return true;
  }
  join() {}
  leave() {}
  async fire(ev: string, ...args: unknown[]) {
    await this.handlers.get(ev)?.(...args);
  }
  async ask<T>(ev: string, p?: unknown): Promise<T> {
    let reply: T | undefined;
    await this.fire(ev, ...(p === undefined ? [] : [p]), (r: T) => (reply = r));
    for (let i = 0; i < 50 && reply === undefined; i++) await Promise.resolve();
    return reply as T;
  }
}
class FakeIO {
  connection: ((s: unknown) => void) | null = null;
  use() {}
  on(ev: string, f: (s: unknown) => void) {
    if (ev === 'connection') this.connection = f;
  }
  to() {
    return this;
  }
  emit() {
    return true;
  }
  in() {
    return { fetchSockets: async () => [] };
  }
  connect(s: FakeSocket) {
    this.connection!(s);
    return s;
  }
}

type View = { status: string; state: { result: unknown } };

describe('fin de partie non enregistrée (base injoignable au-delà des essais)', () => {
  it('la salle terminée reste en mémoire, même au-delà du délai d’éviction ; le ménage l’enregistre au retour de la base', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const io = new FakeIO();
      attachSockets(io as never);
      const room = newRoom({ mode: 'quick', rated: true, tc: '5+0', catalog: 'aucune', creator: 'u:a', seats: { w: seat('a'), b: seat('b') } });
      const id = room.d.id;
      const A = io.connect(new FakeSocket(account('a')));
      const B = io.connect(new FakeSocket(account('b')));
      expect(await A.ask('game:join', { id })).toMatchObject({ ok: true });
      expect(await B.ask('game:join', { id })).toMatchObject({ ok: true });
      expect(await A.ask('game:move', { id, from: sq('e2'), to: sq('e4') })).toEqual({ ok: true });
      expect(await B.ask('game:move', { id, from: sq('e7'), to: sq('e5') })).toEqual({ ok: true });
      await vi.advanceTimersByTimeAsync(TIMINGS.saveDebounceMs + 10);
      expect(db.games.get(id)?.status).toBe('active');

      // Panne de la base ; les Noirs abandonnent : les Blancs gagnent (+20 / −20).
      db.down = true;
      expect(await A.ask('game:move', { id, from: sq('g1'), to: sq('f3') })).toEqual({ ok: true });
      expect(await B.ask('game:resign', { id })).toEqual({ ok: true });
      const result = { winner: 'w', reason: 'resign' };
      expect(room.d.state.result).toEqual(result);
      await vi.advanceTimersByTimeAsync(PERSIST.retryMs * PERSIST.attempts + 100);
      expect(room.resultPending).toBe(true);
      const lignes = () => log.mock.calls.filter(([m]) => String(m).startsWith(`Fin de partie ${id}`)).map(([m]) => String(m));
      expect(lignes()).toHaveLength(PERSIST.attempts);
      expect(lignes().at(-1)).toMatch(/non enregistrée après \d+ essais \(nouvel essai à chaque ménage/);

      // Les deux joueurs ferment l'onglet ; la base reste injoignable bien au-delà du délai d'éviction. Le ménage relance
      // l'enregistrement : un essai à chaque passage, sans rien noter.
      await A.fire('disconnect');
      await B.fire('disconnect');
      vi.mocked(tx).mockClear();
      const menages = Math.floor((TIMINGS.endedRoomEvictMs + 3 * TIMINGS.housekeepingMs) / TIMINGS.housekeepingMs);
      await vi.advanceTimersByTimeAsync(TIMINGS.endedRoomEvictMs + 3 * TIMINGS.housekeepingMs);
      expect(db.games.get(id)?.status).toBe('active');
      expect(vi.mocked(tx).mock.calls.length).toBeGreaterThanOrEqual(menages - 1);
      expect(vi.mocked(tx).mock.calls.length).toBeLessThanOrEqual(menages + 1);
      expect(lignes()).toHaveLength(PERSIST.attempts);

      // Le perdant rouvre le lien : la salle est celle de la mémoire (aucune lecture en base), toujours terminée,
      // résultat inchangé ; réclamer la victoire est refusé.
      const B2 = io.connect(new FakeSocket(account('b')));
      const join = await B2.ask<{ ok: boolean; view: View }>('game:join', { id });
      expect(join.ok).toBe(true);
      expect(join.view.status).toBe('ended');
      expect(join.view.state.result).toEqual(result);
      expect(db.selects).not.toContain(id);
      await vi.advanceTimersByTimeAsync(TIMINGS.claimAfterMs + 10);
      expect(await B2.ask('game:claim', { id })).toMatchObject({ ok: false });
      expect(room.d.state.result).toEqual(result);
      await B2.fire('disconnect');

      // La base revient : le ménage suivant enregistre la fin de partie, classement compris, une seule fois.
      db.down = false;
      await vi.advanceTimersByTimeAsync(TIMINGS.housekeepingMs + 10);
      const row = db.games.get(id)!;
      expect(row.status).toBe('ended');
      expect(JSON.parse(row.data).state.result).toEqual(result);
      expect(row.ratingsApplied).toBe(true);
      expect(db.userUpdates).toEqual([[20, 'a'], [-20, 'b']]);
      expect(room.resultPending).toBe(false);
      expect(info).toHaveBeenCalledWith(`Fin de partie ${id} enregistrée (nouvel essai du ménage).`);
      expect(lignes()).toHaveLength(PERSIST.attempts);

      // Enregistrée, la salle est évincée au ménage suivant ; relue en base, elle est terminée, sans nouveau classement.
      await vi.advanceTimersByTimeAsync(TIMINGS.housekeepingMs + 10);
      const B3 = io.connect(new FakeSocket(account('b')));
      const again = await B3.ask<{ ok: boolean; view: View }>('game:join', { id });
      expect(db.selects).toContain(id);
      expect(again.view.status).toBe('ended');
      expect(again.view.state.result).toEqual(result);
      await vi.advanceTimersByTimeAsync(TIMINGS.housekeepingMs + 10);
      expect(db.userUpdates).toHaveLength(2);
    } finally {
      log.mockRestore();
      info.mockRestore();
    }
  });

  it('un seul enregistrement à la fois : un second appel pendant le premier ne relance rien', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const room = newRoom({ mode: 'quick', rated: true, tc: '5+0', catalog: 'aucune', creator: 'u:c', seats: { w: seat('c'), b: seat('d') } });
      room.d.status = 'ended';
      room.d.state = { ...room.d.state, result: { winner: null, reason: 'aborted' } };
      db.down = true;
      vi.mocked(tx).mockClear();
      const first = persistResult(room);
      const second = persistResult(room);
      await vi.advanceTimersByTimeAsync(PERSIST.retryMs * PERSIST.attempts);
      await expect(first).resolves.toBe(false);
      await expect(second).resolves.toBe(false);
      expect(tx).toHaveBeenCalledTimes(PERSIST.attempts);
      expect(room.resultPending).toBe(true);
      // Fini, un nouvel appel est permis (le ménage le relance).
      db.down = false;
      await expect(persistResult(room)).resolves.toBe(true);
      expect(room.resultPending).toBe(false);
    } finally {
      log.mockRestore();
    }
  });
});

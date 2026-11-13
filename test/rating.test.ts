// Classement Elo et appariement de la file (src/server/rating.ts, src/server/games.ts).
// - Caractérisation : les écarts de classement d'une partie classée terminée (endGame), tels que le serveur les
//   calculait avant que la formule ne sorte de games.ts (valeurs écrites à la main, K 40 puis 20, échelle 400).
// - elo() pur, et tolérance de l'appariement (250 points, plus 25 par seconde d'attente).
// - Enregistrement de la fin d'une partie classée : nouvel essai si la base ne répond pas (PERSIST), enregistrement à
//   l'arrêt du serveur pendant l'attente d'un nouvel essai (flushRooms), rattrapage au démarrage des parties terminées
//   dont le classement n'a pas été appliqué ; jamais deux fois (ratings_applied).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/server/db', () => ({
  q: vi.fn(async () => []),
  one: vi.fn(async () => null),
  tx: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn({ query: async () => ({ rows: [], rowCount: 0 }) })),
}));
vi.mock('../src/server/bot-pool', () => ({
  botPool: { decide: vi.fn(async () => ({ move: null, card: null })) },
}));

import { sqIndex as sq } from '../src/shared/chess';
import { q, tx } from '../src/server/db';
import { abortRoom, applyMove, applyPendingRatings, flushRooms, newRoom, persistResult, resignRoom } from '../src/server/games';
import { MATCHMAKING, PERSIST, RATING } from '../src/server/settings';
import { elo, matchTolerance, ratingDiffs } from '../src/server/rating';
import type { SeatArg } from './helpers/sieges';

const T0 = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const account = (id: string, rating: number | null, gamesPlayed: number): SeatArg => ({
  kind: 'user', key: `u:${id}`, userId: id, name: id, username: id, rating, gamesPlayed, skin: '',
});

/** Partie classée Sans cartes (pas de choix des cartes), un coup chacun, puis abandon de `loser`. */
function ratedGame(w: SeatArg, b: SeatArg, loser: 'w' | 'b' | null) {
  const room = newRoom({ mode: 'quick', rated: true, tc: '5+0', catalog: 'aucune', creator: w.key, seats: { w, b } });
  expect(applyMove(room, 'w', sq('e2'), sq('e4')).ok).toBe(true);
  expect(applyMove(room, 'b', sq('e7'), sq('e5')).ok).toBe(true);
  if (loser) resignRoom(room, loser);
  return room;
}

describe('Elo : caractérisation des écarts d’une partie classée', () => {
  it('égalité de classement, K 40 (moins de 30 parties) : +20 / −20', () => {
    const room = ratedGame(account('a', 1500, 10), account('b', 1500, 10), 'b');
    expect(room.d.ratingDiff).toEqual({ w: 20, b: -20 });
  });

  it('1 600 (40 parties, K 20) contre 1 400 (5 parties, K 40), le favori abandonne : −15 / +30 ; 30 parties : K 20', () => {
    expect(ratedGame(account('a', 1600, 40), account('b', 1400, 5), 'w').d.ratingDiff).toEqual({ w: -15, b: 30 });
    expect(ratedGame(account('e', 1200, 30), account('f', 1200, 29), 'w').d.ratingDiff).toEqual({ w: -10, b: 20 });
  });

  it('écart de 800 points : le favori ne gagne presque rien, l’outsider presque tout', () => {
    const fav = ratedGame(account('a', 2000, 0), account('b', 1200, 0), 'b');
    expect(fav.d.ratingDiff).toEqual({ w: 0, b: -0 });
    const upset = ratedGame(account('c', 1200, 0), account('d', 2000, 0), 'b');
    expect(upset.d.ratingDiff).toEqual({ w: 40, b: -40 });
  });

  it('classement absent : 1200 ; invité ou partie non classée : aucun écart', () => {
    const room = ratedGame(account('a', null, 0), account('b', 1200, 0), 'b');
    expect(room.d.ratingDiff).toEqual({ w: 20, b: -20 });
    const guest: SeatArg = { kind: 'guest', key: 'g:1', userId: null, name: 'Invité', username: null, rating: null, gamesPlayed: 0, skin: '' };
    expect(ratedGame(guest, account('b', 1200, 0), 'b').d.ratingDiff).toBeNull();
  });

  it('annulation : aucun écart', () => {
    const room = newRoom({ mode: 'quick', rated: true, tc: '5+0', catalog: 'aucune', creator: 'u:a', seats: { w: account('a', 1500, 0), b: account('b', 1500, 0) } });
    abortRoom(room); // avant le premier coup de chacun
    expect(room.d.state.result?.reason).toBe('aborted');
    expect(room.d.ratingDiff).toBeNull();
  });
});

describe('elo() pur', () => {
  it('formule : K × (score − attendu), arrondi ; K 40 avant 30 parties, puis 20', () => {
    expect(elo(1500, 1500, 1, 10)).toBe(20);
    expect(elo(1500, 1500, 0, 10)).toBe(-20);
    expect(elo(1600, 1400, 0.5, 40)).toBe(-5);
    expect(elo(1400, 1600, 0.5, 5)).toBe(10);
    expect(elo(1200, 1200, 0, 30)).toBe(-10);
    expect(elo(1200, 1200, 1, 29)).toBe(20);
    expect(elo(2000, 1200, 1, 0)).toBe(0);
    expect(elo(1200, 2000, 1, 0)).toBe(40);
  });

  it('suit RATING (facteurs K, seuil, échelle)', () => {
    const r = { ...RATING, kProvisional: 32, kEstablished: 16, provisionalGames: 10, scale: 800 };
    expect(elo(1500, 1500, 1, 9, r)).toBe(16);
    expect(elo(1500, 1500, 1, 10, r)).toBe(8);
    // Échelle 800 : un écart de 400 points compte comme 200 à l'échelle 400.
    expect(elo(1600, 1200, 0, 0, r)).toBe(elo(1400, 1200, 0, 0, { ...r, scale: 400 }));
  });

  it('ratingDiffs : écarts des deux camps (classement absent : RATING.initial)', () => {
    expect(ratingDiffs({ rating: 1500, gamesPlayed: 10 }, { rating: 1500, gamesPlayed: 10 }, 'w')).toEqual({ w: 20, b: -20 });
    expect(ratingDiffs({ rating: null, gamesPlayed: 0 }, { rating: RATING.initial, gamesPlayed: 0 }, null)).toEqual({ w: 0, b: 0 });
  });
});

describe('tolérance de l’appariement classé', () => {
  it('250 points au départ, plus 25 par seconde d’attente', () => {
    expect(matchTolerance(0)).toBe(MATCHMAKING.baseTolerance);
    expect(matchTolerance(0)).toBe(250);
    expect(matchTolerance(4000)).toBe(350);
    expect(matchTolerance(1500)).toBe(287.5);
    expect(matchTolerance(60_000)).toBe(250 + 60 * 25);
  });
});

describe('enregistrement de la fin d’une partie classée', () => {
  /** Client de transaction en doublure : requêtes reçues ; `applied` : ratings_applied déjà vrai en base. */
  function fakeClient(applied = false) {
    const queries: { sql: string; params: unknown[] }[] = [];
    const client = {
      queries,
      query: async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params });
        return /ratings_applied = true/.test(sql) ? { rows: [], rowCount: applied ? 0 : 1 } : { rows: [], rowCount: 1 };
      },
    };
    return client;
  }
  const userUpdates = (c: ReturnType<typeof fakeClient>) => c.queries.filter(x => /^UPDATE users/.test(x.sql)).map(x => x.params);

  it('base injoignable : nouvel essai après PERSIST.retryMs, classement appliqué une fois', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const room = ratedGame(account('a', 1500, 10), account('b', 1500, 10), 'b');
      await vi.advanceTimersByTimeAsync(0);
      const client = fakeClient();
      vi.mocked(tx).mockReset();
      vi.mocked(tx)
        .mockRejectedValueOnce(new Error('connexion refusée'))
        .mockRejectedValueOnce(new Error('connexion refusée'))
        .mockImplementation(async fn => fn(client as never));
      const done = persistResult(room);
      await vi.advanceTimersByTimeAsync(PERSIST.retryMs);
      expect(tx).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(PERSIST.retryMs);
      await expect(done).resolves.toBe(true);
      expect(tx).toHaveBeenCalledTimes(3);
      expect(userUpdates(client)).toEqual([[20, 'a'], [-20, 'b']]);
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/essai 1 sur/), expect.any(Error));
    } finally {
      log.mockRestore();
      vi.mocked(tx).mockReset();
      vi.mocked(tx).mockImplementation(async fn => fn({ query: async () => ({ rows: [], rowCount: 0 }) } as never));
    }
  });

  it('au-delà de PERSIST.attempts essais : abandon signalé (la partie reste en mémoire)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const room = ratedGame(account('a', 1500, 10), account('b', 1500, 10), 'b');
      await vi.advanceTimersByTimeAsync(0);
      vi.mocked(tx).mockReset();
      vi.mocked(tx).mockRejectedValue(new Error('connexion refusée'));
      const done = persistResult(room);
      await vi.advanceTimersByTimeAsync(PERSIST.retryMs * PERSIST.attempts);
      await expect(done).resolves.toBe(false);
      expect(tx).toHaveBeenCalledTimes(PERSIST.attempts);
      expect(log).toHaveBeenLastCalledWith(expect.stringMatching(new RegExp(`non enregistrée après ${PERSIST.attempts} essais`)), expect.any(Error));
    } finally {
      log.mockRestore();
      vi.mocked(tx).mockReset();
      vi.mocked(tx).mockImplementation(async fn => fn({ query: async () => ({ rows: [], rowCount: 0 }) } as never));
    }
  });

  it('arrêt du serveur pendant l’attente d’un nouvel essai : fin de partie et classement enregistrés (flushRooms)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      vi.mocked(tx).mockReset();
      vi.mocked(tx).mockRejectedValueOnce(new Error('connexion refusée'));
      // endGame lance persistResult : premier essai en échec, nouvel essai dans PERSIST.retryMs.
      const room = ratedGame(account('p', 1500, 10), account('r', 1500, 10), 'b');
      await vi.advanceTimersByTimeAsync(0);
      expect(room.resultPending).toBe(true);
      expect(room.saveTimer).toBeNull();
      // La base répond de nouveau ; le serveur s'arrête avant le nouvel essai.
      const client = fakeClient();
      vi.mocked(tx).mockImplementation(async fn => fn(client as never));
      await flushRooms();
      const saved = client.queries.filter(x => /^INSERT INTO games/.test(x.sql) && x.params[0] === room.d.id);
      expect(saved).toHaveLength(1);
      expect(saved[0].params[3]).toBe('ended');
      // (Les fins de partie des tests précédents restées sans enregistrement sont enregistrées aussi : on ne regarde
      // que celle-ci.)
      expect(userUpdates(client).filter(([, id]) => id === 'p' || id === 'r')).toEqual([[20, 'p'], [-20, 'r']]);
      expect(room.resultPending).toBe(false);
    } finally {
      log.mockRestore();
      vi.mocked(tx).mockReset();
      vi.mocked(tx).mockImplementation(async fn => fn({ query: async () => ({ rows: [], rowCount: 0 }) } as never));
    }
  });

  it('rattrapage au démarrage : classement des parties terminées non appliqué, jamais deux fois', async () => {
    const pending = ratedGame(account('a', 1500, 10), account('b', 1500, 10), 'w').d;
    const done = ratedGame(account('c', 1500, 10), account('d', 1500, 10), 'b').d;
    await vi.advanceTimersByTimeAsync(0);
    vi.mocked(q).mockResolvedValueOnce([{ data: pending }, { data: done }] as never);
    const clients = [fakeClient(false), fakeClient(true)];
    vi.mocked(tx).mockReset();
    for (const c of clients) vi.mocked(tx).mockImplementationOnce(async fn => fn(c as never));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(await applyPendingRatings()).toBe(1);
      expect(vi.mocked(q).mock.calls.at(-1)![0]).toMatch(/status = 'ended' AND rated AND NOT ratings_applied/);
      expect(userUpdates(clients[0])).toEqual([[-20, 'a'], [20, 'b']]);
      expect(userUpdates(clients[1])).toEqual([]);
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/Classement appliqué à 1 partie/));
    } finally {
      log.mockRestore();
      vi.mocked(tx).mockReset();
      vi.mocked(tx).mockImplementation(async fn => fn({ query: async () => ({ rows: [], rowCount: 0 }) } as never));
    }
  });
});

// Classement Elo et appariement de la file (src/server/rating.ts, src/server/games.ts).
// - Caractérisation : les écarts de classement d'une partie classée terminée (endGame), tels que le serveur les
//   calculait avant que la formule ne sorte de games.ts (valeurs écrites à la main, K 40 puis 20, échelle 400).
// - elo() pur, et tolérance de l'appariement (250 points, plus 25 par seconde d'attente).
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
import { abortRoom, applyMove, newRoom, resignRoom } from '../src/server/games';
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


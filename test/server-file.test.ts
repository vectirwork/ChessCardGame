// File d'attente (src/server/games.ts, joinQueue) : courses entre demandes simultanées, rendues reproductibles en
// retardant la lecture du classement en base (userById, par la doublure de la base). Les trois scénarios de l'audit :
// 1. A attend ; B et C arrivent ensemble : A n'est apparié qu'une fois, C reste en file ;
// 2. file vide ; B et C arrivent ensemble : ils sont appariés entre eux (aucune entrée perdue) ;
// 3. A attend ; B arrive ; A part pendant que B attend son classement : B n'est pas apparié avec A.
// Avant le correctif : 1 → deux parties pour A ; 2 → les deux attendent, l'une des entrées est perdue ; 3 → partie avec A.
// Création de la partie en échec après l'appariement : celui qui attendait reprend sa place (sauf s'il est parti).
// Files : une par cadence, classée ou amicale, et catalogue (MATCHMAKING.splitByCatalog), voir queuePool.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/server/db', () => ({
  q: vi.fn(async () => []),
  one: vi.fn(async () => null),
  tx: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn({ query: async () => ({ rows: [], rowCount: 0 }) })),
}));
vi.mock('../src/server/bot-pool', () => ({
  botPool: { decide: vi.fn(async () => ({ move: null, card: null })) },
}));

import type { Identity, UserRow } from '../src/server/auth';
import { one } from '../src/server/db';
import { setRulesOverride } from '../src/shared/rules';
import { setDealOverride } from '../src/server/settings';
// Mise en place de V1 (choix des cartes), quel que soit le DEAL du jour : la création en échec vient du choix (lot 9e).
import { reglerMiseEnPlaceV1 } from './helpers/v1-serveur';
import { activeRoomCount, joinQueue, queueKeys, queuePool, quitQueue } from '../src/server/games';
import { MATCHMAKING } from '../src/server/settings';

const POOL = '5+0|classee|climats';

/** Lectures du classement retenues jusqu'à `release(id)`. */
const gates = new Map<string, { promise: Promise<void>; open: () => void }>();
function hold(id: string) {
  let open!: () => void;
  const promise = new Promise<void>(r => (open = r));
  gates.set(id, { promise, open });
}
const release = (id: string) => gates.get(id)?.open();

function user(id: string, rating = 1500): UserRow {
  return {
    id, email: `${id}@test.fr`, username: id, password_hash: '', email_verified: true, rating, games_played: 3, wins: 1,
    losses: 1, draws: 1, equipped_skin: 'skin:arcane', equipped_board: 'board:arcane', equipped_king: 'king:arcane', is_admin: false,
    created_at: new Date(0), items: [],
  };
}
const users = new Map<string, UserRow>();

/** Socket réduit à ce que joinQueue lit : l'identité, et les événements émis (queue:status). */
function sock(id: string, rating = 1500) {
  const u = user(id, rating);
  users.set(id, u);
  const identity: Identity = { user: u, guestId: `u-${id}`, sessionId: 's' };
  const emit = vi.fn();
  return { data: { identity }, emit } as unknown as Parameters<typeof joinQueue>[0] & { emit: ReturnType<typeof vi.fn> };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const join = (s: ReturnType<typeof sock>) => joinQueue(s, '5+0', true);

beforeEach(() => {
  reglerMiseEnPlaceV1();
  vi.useFakeTimers();
  gates.clear();
  users.clear();
  vi.mocked(one).mockImplementation(async (_sql: string, params?: unknown[]) => {
    const id = String(params?.[0]);
    await gates.get(id)?.promise;
    return (users.get(id) ?? null) as never;
  });
});
afterEach(() => {
  setRulesOverride(null);
  setDealOverride(null);
  for (const k of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) quitQueue(`u:${k}`);
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('file d’attente : courses', () => {
  it('1. A attend ; B et C arrivent ensemble : une seule partie pour A, C reste en file', async () => {
    const a = sock('a');
    await join(a);
    expect(queueKeys()[POOL]).toEqual(['u:a']);
    const before = activeRoomCount().active;
    const [b, c] = [sock('b'), sock('c')];
    hold('b');
    hold('c');
    const pb = join(b);
    const pc = join(c);
    await flush();
    release('b');
    await flush();
    release('c');
    await Promise.all([pb, pc]);
    await flush();
    expect(activeRoomCount().active - before).toBe(1);
    expect(queueKeys()[POOL]).toEqual(['u:c']);
    expect(c.emit).toHaveBeenCalledWith('queue:status', expect.objectContaining({ waiting: true, tc: '5+0' }));
    expect(b.emit).not.toHaveBeenCalled();
  });

  it('2. file vide ; B et C arrivent ensemble : appariés entre eux, aucune entrée perdue', async () => {
    // Une file jamais ouverte (3+2) : avant le correctif, chacun gardait sa propre liste vide et la dernière écrite
    // effaçait l'autre.
    const before = activeRoomCount().active;
    const [b, c] = [sock('d'), sock('e')];
    hold('d');
    hold('e');
    const pb = joinQueue(b, '3+2', true);
    const pc = joinQueue(c, '3+2', true);
    await flush();
    release('e');
    release('d');
    await Promise.all([pb, pc]);
    await flush();
    expect(activeRoomCount().active - before).toBe(1);
    expect(queueKeys()['3+2|classee|climats']).toBeUndefined();
  });

  it('3. A attend ; B arrive ; A part pendant l’attente de B : pas de partie, B attend seul', async () => {
    const a = sock('f');
    await join(a);
    const before = activeRoomCount().active;
    const b = sock('g');
    hold('g');
    const pb = join(b);
    await flush();
    quitQueue('u:f');
    release('g');
    await pb;
    await flush();
    expect(activeRoomCount().active - before).toBe(0);
    expect(queueKeys()[POOL]).toEqual(['u:g']);
  });

  it('un joueur qui quitte la file pendant l’attente de son classement n’y entre pas', async () => {
    const before = activeRoomCount().queue;
    const h = sock('h');
    hold('h');
    const p = join(h);
    await flush();
    quitQueue('u:h');
    release('h');
    expect(await p).toEqual({ ok: true });
    expect(activeRoomCount().queue).toBe(before);
    expect(h.emit).not.toHaveBeenCalled();
  });

  it('classée : écart de classement accepté selon l’attente (250 + 25 par seconde)', async () => {
    const a = sock('a', 1500);
    await join(a);
    const before = activeRoomCount().active;
    // 1 800 : 300 points d'écart, refusés au départ…
    const b = sock('b', 1800);
    await join(b);
    expect(activeRoomCount().active - before).toBe(0);
    expect(queueKeys()[POOL]).toEqual(['u:a', 'u:b']);
    // … acceptés après 2 s d'attente (tolérance 300) : C, à 1 790, est apparié avec B (le plus proche), pas avec A.
    quitQueue('u:b');
    vi.advanceTimersByTime(0);
    const b2 = sock('b', 1800);
    await join(b2);
    vi.advanceTimersByTime(((300 - MATCHMAKING.baseTolerance) / MATCHMAKING.tolerancePerSecond) * 1000);
    const c = sock('c', 1790);
    await join(c);
    expect(activeRoomCount().active - before).toBe(1);
    expect(queueKeys()[POOL]).toEqual(['u:a']);
  });
});

describe('file d’attente : création de la partie en échec', () => {
  // Création impossible (ici : règles de test à 9 cartes, la réserve n'en a que 8 ; en vrai, une base qui ne répond pas
  // pendant la lecture des sièges). L'erreur remonte au demandeur.
  it('celui qui attendait reprend sa place en tête de file', async () => {
    const a = sock('a');
    await join(a);
    const before = activeRoomCount().active;
    setRulesOverride({ cardsPerPlayer: 9 });
    await expect(join(sock('b'))).rejects.toThrow(/Choix des cartes impossible/);
    expect(activeRoomCount().active - before).toBe(0);
    expect(queueKeys()[POOL]).toEqual(['u:a']);
    // Création de nouveau possible : A est apparié avec le suivant.
    setRulesOverride(null);
    await join(sock('c'));
    expect(activeRoomCount().active - before).toBe(1);
    expect(queueKeys()[POOL] ?? []).toEqual([]);
  });

  it('… sauf s’il a quitté la file pendant la lecture des sièges', async () => {
    const a = sock('d');
    await join(a);
    hold('d'); // lecture du siège de D (après l'appariement) retenue
    const pb = join(sock('e'));
    await flush();
    expect(queueKeys()[POOL] ?? []).toEqual([]);
    quitQueue('u:d');
    setRulesOverride({ cardsPerPlayer: 9 });
    release('d');
    await expect(pb).rejects.toThrow(/Choix des cartes impossible/);
    expect(queueKeys()[POOL] ?? []).toEqual([]);
  });
});

describe('files séparées par catalogue (MATCHMAKING.splitByCatalog)', () => {
  it('clé de file : cadence, classée ou amicale, catalogue ; une seule file (*) si les catalogues sont mêlés', () => {
    expect(MATCHMAKING.splitByCatalog).toBe(true);
    expect(queuePool('5+0', true, 'climats')).toBe(POOL);
    expect(queuePool('3+2', false, 'aucune')).toBe('3+2|amicale|aucune');
    expect(queuePool('3+2', false, 'aucune', false)).toBe('3+2|amicale|*');
  });
});

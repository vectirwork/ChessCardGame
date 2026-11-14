// Assise sur une invitation (src/server/games.ts, takeSeat) et spectateurs d'une partie (spectatorCount, /live).
// - Course à l'assise : deux comptes ouvrent le lien au même moment ; la lecture de leur siège en base (userById) est
//   retardée par la doublure. Le premier servi s'assoit, le second regarde en spectateur : avant le correctif, il
//   écrasait le siège et relançait le choix des cartes.
// - Spectateurs : les sockets qui ne jouent pas (avant : « sockets − 2 », faux contre l'IA, avec deux onglets, ou un
//   joueur déconnecté).
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
import { Room, newRoom, spectatorCount, takeSeat } from '../src/server/games';
import { setDealOverride } from '../src/server/settings';
import { bot, human } from './helpers/sieges';
// Mise en place de V1 (choix des cartes en 45 s), quel que soit le DEAL du jour (lot 9e).
import { DEAL_V1 } from './helpers/v1';
import { reglerMiseEnPlaceV1 } from './helpers/v1-serveur';

const T0 = 1_800_000_000_000;

const gates = new Map<string, { promise: Promise<void>; open: () => void }>();
function hold(id: string) {
  let open!: () => void;
  const promise = new Promise<void>(r => (open = r));
  gates.set(id, { promise, open });
}
const users = new Map<string, UserRow>();
function account(id: string): Identity {
  const u: UserRow = {
    id, email: `${id}@test.fr`, username: id, password_hash: '', email_verified: true, rating: 1500, games_played: 3, wins: 1,
    losses: 1, draws: 1, equipped_skin: 'skin:arcane', equipped_board: 'board:arcane', equipped_king: 'king:arcane', is_admin: false,
    created_at: new Date(0), items: [],
  };
  users.set(id, u);
  return { user: u, guestId: `u-${id}`, sessionId: 's' };
}
const guest = (id: string): Identity => ({ user: null, guestId: id, sessionId: null });
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  reglerMiseEnPlaceV1();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  gates.clear();
  users.clear();
  vi.mocked(one).mockImplementation(async (_sql: string, params?: unknown[]) => {
    const id = String(params?.[0]);
    await gates.get(id)?.promise;
    return (users.get(id) ?? null) as never;
  });
});
afterEach(() => {
  setDealOverride(null);
  vi.clearAllTimers();
  vi.useRealTimers();
});

/** Invitation en attente créée par l'invité g:1 (Blancs). */
const waiting = () => newRoom({ mode: 'invite', rated: false, tc: '5+0', catalog: 'climats', creator: 'g:1', seats: { w: human(1), b: null } });

describe('assise sur une invitation', () => {
  it('deux comptes en même temps : le premier servi s’assoit, l’autre regarde ; le choix n’est ouvert qu’une fois', async () => {
    const room = waiting();
    const [alice, bob] = [account('alice'), account('bob')];
    hold('alice');
    hold('bob');
    const pa = takeSeat(room, alice, {});
    const pb = takeSeat(room, bob, {});
    await flush();
    gates.get('bob')!.open();
    await flush();
    expect(room.d.seats.b?.key).toBe('u:bob');
    expect(room.d.status).toBe('active');
    const deadline = room.d.draft?.deadline;
    expect(deadline).toBe(T0 + DEAL_V1.draftMs);
    vi.advanceTimersByTime(3000);
    gates.get('alice')!.open();
    expect(await pa).toBeNull();
    expect(await pb).toBe('b');
    // Le siège de Bob n'est pas écrasé, et le choix des cartes n'est pas relancé (même échéance).
    expect(room.d.seats.b?.key).toBe('u:bob');
    expect(room.d.draft?.deadline).toBe(deadline);
  });

  it('le même compte depuis deux onglets : la même couleur, une seule assise', async () => {
    const room = waiting();
    const alice = account('alice');
    hold('alice');
    const p1 = takeSeat(room, alice, {});
    const p2 = takeSeat(room, alice, {});
    await flush();
    gates.get('alice')!.open();
    expect(await p1).toBe('b');
    expect(await p2).toBe('b');
    expect(room.d.seats.b?.key).toBe('u:alice');
  });

  it('invité : pseudo demandé s’il manque ; joueur déjà assis : sa couleur ; spectateur demandé (sit: false) : null', async () => {
    const room = waiting();
    expect(await takeSeat(room, guest('x'), {})).toBe('needName');
    expect(await takeSeat(room, guest('x'), { name: 'a' })).toBe('needName');
    expect(await takeSeat(room, guest('x'), { sit: false })).toBeNull();
    expect(room.d.status).toBe('waiting');
    expect(await takeSeat(room, guest('1'), {})).toBe('w');
    expect(await takeSeat(room, guest('x'), { name: 'Xavier' })).toBe('b');
    expect(room.d.seats.b?.name).toBe('Xavier');
    expect(await takeSeat(room, guest('y'), { name: 'Yves' })).toBeNull();
  });
});

describe('spectateurs', () => {
  /** Socket réduit à son identité. */
  const socketOf = (key: string) => {
    const [kind, id] = key.split(':');
    const identity: Identity = kind === 'u' ? { user: { id } as UserRow, guestId: `u-${id}`, sessionId: 's' } : guest(id);
    return { data: { identity } } as unknown as Room['sockets'] extends Set<infer S> ? S : never;
  };

  it('compte les sockets qui ne jouent pas (contre l’IA, onglets en double, joueur parti)', () => {
    const vsBot = newRoom({ mode: 'bot', rated: false, tc: 'none', catalog: 'aucune', creator: 'g:1', seats: { w: human(1), b: bot(2) } });
    vsBot.sockets.add(socketOf('g:1'));
    vsBot.sockets.add(socketOf('g:9'));
    // Avant : sockets − 2 = 0 spectateur.
    expect(spectatorCount(vsBot)).toBe(1);

    const duel = newRoom({ mode: 'invite', rated: false, tc: 'none', catalog: 'aucune', creator: 'g:1', seats: { w: human(1), b: human(2) } });
    duel.sockets.add(socketOf('g:1'));
    duel.sockets.add(socketOf('g:1')); // deuxième onglet du même joueur
    duel.sockets.add(socketOf('g:2'));
    expect(spectatorCount(duel)).toBe(0);
    duel.sockets.add(socketOf('g:7'));
    duel.sockets.add(socketOf('g:8'));
    expect(spectatorCount(duel)).toBe(2);

    // Un joueur déconnecté : ses sockets sont partis, les spectateurs restent comptés tels quels.
    const gone = newRoom({ mode: 'invite', rated: false, tc: 'none', catalog: 'aucune', creator: 'g:1', seats: { w: human(1), b: human(2) } });
    gone.sockets.add(socketOf('g:1'));
    gone.sockets.add(socketOf('g:7'));
    expect(spectatorCount(gone)).toBe(1);
  });
});

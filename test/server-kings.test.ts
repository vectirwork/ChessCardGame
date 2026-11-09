// Le roi voyage avec le siège (src/server/games.ts) : pris à l'assise (compte, invité, IA), vu de tous (les deux
// joueurs et les spectateurs), normalisé (siège enregistré avant les rois, identifiant inconnu), relu à la revanche.
// Et la table des colonnes d'équipement (SLOT_COLUMN), source unique des colonnes du serveur.
// La base et les threads de l'IA sont remplacés par des doublures, comme dans server-draft.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/server/db', () => ({
  q: vi.fn(async () => []),
  one: vi.fn(async () => null),
  tx: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn({ query: async () => ({ rows: [], rowCount: 0 }) })),
}));
vi.mock('../src/server/bot-pool', () => ({
  botPool: { decide: vi.fn(async () => ({ move: null, card: null })) },
}));

import { BOT_LOOK, COLLECTIONS, SLOTS } from '../src/shared/catalog';
import type { Color } from '../src/shared/chess';
import type { Identity, UserRow } from '../src/server/auth';
import { SLOT_COLUMN, toMe } from '../src/server/auth';
import { one } from '../src/server/db';
import { Room, botSeat, createRematch, newRoom, seatFor, seatView, viewFor } from '../src/server/games';
import { UNEQUIP_LOST_SQL } from '../src/server/shop';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.mocked(one).mockReset();
  vi.mocked(one).mockImplementation(async () => null);
});

type SeatArg = Parameters<typeof newRoom>[0]['seats']['w'];
const seat = (n: number, extra: Partial<NonNullable<SeatArg>> = {}): SeatArg => ({
  kind: 'guest', key: `g:${n}`, userId: null, name: `Joueur ${n}`, username: null, rating: null, gamesPlayed: 0, skin: 'skin:arcane',
  ...extra,
});
const invite = (w: SeatArg, b: SeatArg) => newRoom({ mode: 'invite', rated: false, tc: '5+0', catalog: 'climats', creator: 'g:1', seats: { w, b } });
const collection = (id: string) => {
  const c = COLLECTIONS.find(x => x.id === id)!;
  return [c.king, c.board, c.skin];
};

function user(id: string, extra: Partial<UserRow> = {}): UserRow {
  return {
    id, email: `${id}@test.fr`, username: id, password_hash: '', email_verified: true, rating: 1500, games_played: 3, wins: 1,
    losses: 1, draws: 1, equipped_skin: 'skin:arcane', equipped_board: 'board:arcane', equipped_king: 'king:arcane', is_admin: false,
    created_at: new Date(0), items: [], ...extra,
  };
}
const identity = (u: UserRow | null, guestId = 'invite'): Identity => ({ user: u, guestId, sessionId: u ? 's' : null });

describe('le roi dans la vue de la partie', () => {
  it('le roi de chaque siège est le même chez les deux joueurs et chez un spectateur', () => {
    const room = invite(seat(1, { king: 'king:braise', seal: 'col:inferno' }), seat(2, { king: 'king:astral' }));
    for (const you of ['w', 'b', null] as (Color | null)[]) {
      const v = viewFor(room, you);
      expect(v.seats.w?.king, String(you)).toBe('king:braise');
      expect(v.seats.b?.king, String(you)).toBe('king:astral');
      expect(v.seats.w?.seal).toBe('col:inferno');
      expect(v.seats.b?.seal).toBeNull();
    }
  });

  it('siège sans roi (partie enregistrée avant les rois) ou identifiant inconnu : le roi Arcane', () => {
    const room = invite(seat(1), seat(2, { king: 'king:inconnu' }));
    expect(seatView(room, 'w')?.king).toBe('king:arcane');
    expect(seatView(room, 'b')?.king).toBe('king:arcane');
    const odd = invite(seat(1, { king: 'skin:inferno' }), seat(2, { king: '__proto__' }));
    expect(seatView(odd, 'w')?.king).toBe('king:arcane');
    expect(seatView(odd, 'b')?.king).toBe('king:arcane');
  });

  it('aller-retour JSON des données de la salle (reprise au redémarrage) sans perte', () => {
    const room = invite(seat(1, { king: 'king:rubis', seal: 'col:ecarlate' }), seat(2));
    const again = new Room(JSON.parse(JSON.stringify(room.d)));
    expect(viewFor(again, null).seats).toEqual(viewFor(room, null).seats);
    expect(again.d.seats.w?.king).toBe('king:rubis');
  });
});

describe('le roi pris à l’assise', () => {
  it('IA : sorts et roi de BOT_LOOK selon le niveau', () => {
    for (const level of [1, 2, 3] as const) {
      const s = botSeat(level);
      expect({ skin: s.skin, king: s.king }).toEqual(BOT_LOOK[level]);
      expect(s.seal).toBeNull();
      expect(s.level).toBe(level);
    }
    const room = newRoom({ mode: 'bot', rated: false, tc: 'none', catalog: 'climats', creator: 'g:1', seats: { w: seat(1), b: botSeat(3) } });
    expect(viewFor(room, 'w').seats.b?.king).toBe('king:eclipse');
  });

  it('compte : le roi équipé et le sceau de ses objets ; invité : Arcane, sans sceau', async () => {
    const alice = user('alice', { equipped_king: 'king:astral', items: collection('col:celeste') });
    const s = await seatFor(identity(alice));
    expect(s.king).toBe('king:astral');
    expect(s.seal).toBe('col:celeste');
    const plain = await seatFor(identity(user('bob', { equipped_king: '' })));
    expect(plain.king).toBe('king:arcane');
    expect(plain.seal).toBeNull();
    const guest = await seatFor(identity(null), 'Invité');
    expect(guest.king).toBe('king:arcane');
    expect(guest.seal).toBeNull();
  });

  it('revanche : couleurs inversées, roi et sceau relus en base', async () => {
    const room = invite(seat(1, { kind: 'user', key: 'u:alice', userId: 'alice', king: 'king:braise' }), seat(2, { kind: 'user', key: 'u:bob', userId: 'bob' }));
    room.d.status = 'ended';
    const rows: Record<string, unknown> = {
      alice: { rating: 1510, games_played: 4, equipped_skin: 'skin:void', equipped_king: 'king:eclipse', items: collection('col:neant') },
      bob: { rating: 1490, games_played: 4, equipped_skin: 'skin:arcane', equipped_king: 'king:arcane', items: [] },
    };
    vi.mocked(one).mockImplementation(async (_sql: string, params?: unknown[]) => (rows[String(params?.[0])] ?? null) as never);
    const next = await createRematch(room);
    expect(next).not.toBeNull();
    const v = viewFor(next!, null);
    expect(v.seats.b?.name).toBe('Joueur 1');
    expect(v.seats.b?.king).toBe('king:eclipse');
    expect(v.seats.b?.seal).toBe('col:neant');
    expect(v.seats.b?.skin).toBe('skin:void');
    expect(v.seats.w?.king).toBe('king:arcane');
    // La partie terminée garde le roi d'origine
    expect(viewFor(room, null).seats.w?.king).toBe('king:braise');
    expect(await createRematch(room)).toBeNull();
  });
});

describe('colonnes d’équipement', () => {
  it('SLOT_COLUMN couvre chaque emplacement ; toMe renvoie le roi équipé', () => {
    expect(Object.keys(SLOT_COLUMN).sort()).toEqual([...SLOTS].sort());
    expect(SLOT_COLUMN).toEqual({ king: 'equipped_king', board: 'equipped_board', skin: 'equipped_skin' });
    const me = toMe(user('alice', { equipped_king: 'king:laure', items: ['king:laure'] }));
    expect(me.equippedKing).toBe('king:laure');
    expect(me.items).toContain('king:arcane');
    expect(me.items).toContain('king:laure');
  });

  it('remboursement : la remise au défaut couvre les trois colonnes, dans l’ordre des paramètres', () => {
    const cols = Object.values(SLOT_COLUMN);
    for (const [i, col] of cols.entries()) expect(UNEQUIP_LOST_SQL).toContain(`THEN ${col} ELSE $${i + 3} END`);
    expect(UNEQUIP_LOST_SQL.startsWith('UPDATE users SET ')).toBe(true);
  });
});

// Choix des cartes au début d'une vraie partie (décision D5, docs/PLAN-V2.md) : moteur (réserve, validation,
// complément au hasard, mains données), IA (heuristique avec hasard) et serveur (src/server/games.ts : secret,
// idempotence, échéance (DEAL.draftMs), IA, abandon, redémarrage, anciennes parties, sans cartes).
// Les salles sont créées avec RULES_V1 (3 cartes) : ces tests décrivent le choix tel qu'il est au réglage historique,
// et passent quel que soit GAME_RULES (les autres nombres de cartes : test/server-regles.test.ts). Délais lus dans
// DEAL et TIMINGS, jamais recopiés.
// Le temps est simulé (horloge factice de vitest) ; la base et les threads de l'IA sont remplacés par des doublures.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/server/db', () => ({
  q: vi.fn(async () => []),
  one: vi.fn(async () => null),
  tx: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn({ query: async () => ({ rows: [], rowCount: 0 }) })),
}));
vi.mock('../src/server/bot-pool', () => ({
  botPool: { decide: vi.fn(async () => ({ move: null, card: null })) },
}));

import { sqIndex as q } from '../src/shared/chess';
import { CARDS, CardId, cardsOf } from '../src/shared/cards';
import { chooseBotDraft } from '../src/shared/bot';
import { cardPool, completeDraft, createGame, dealHands, draftRefusal, positionKey, withHands } from '../src/shared/game';
import { DEAL } from '../src/shared/config/rules';
import { RULES_V1 } from '../src/shared/rules';
import { TIMINGS } from '../src/server/settings';
import {
  Room, RoomData, abortRoom, applyDraft, applyMove, closeDraft, draftView, newRoom, resignRoom, resumeRoom, submitDraft,
} from '../src/server/games';
import { botPool } from '../src/server/bot-pool';

const T0 = 1_800_000_000_000;
const POUVOIRS = cardsOf('climats');
const DRAFT_MS = DEAL.draftMs;
const FIRST_MOVE_MS = TIMINGS.firstMoveMs;
const CARDS_PER_PLAYER = RULES_V1.cardsPerPlayer;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

/** Générateur pseudo-aléatoire reproductible. */
function seeded(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 2 ** 32;
  };
}

type SeatArg = Parameters<typeof newRoom>[0]['seats']['w'];
const human = (n: number, userId: string | null = null): SeatArg => ({
  kind: userId ? 'user' : 'guest', key: userId ? `u:${userId}` : `g:${n}`, userId, name: `Joueur ${n}`, username: null,
  rating: userId ? 1500 : null, gamesPlayed: 10, skin: '',
});
const bot = (level: 1 | 2 | 3 = 2): SeatArg => ({
  kind: 'bot', key: `bot:${level}`, userId: null, name: 'IA', username: null, rating: 1300, gamesPlayed: 0, skin: '', level,
});

function invite(tc = '5+0', catalog: 'climats' | 'aucune' = 'climats', rated = false): Room {
  const ids = rated ? ['a1', 'b2'] : [null, null];
  return newRoom({ mode: rated ? 'quick' : 'invite', rated, tc, catalog, creator: 'g:1', seats: { w: human(1, ids[0]), b: human(2, ids[1]) }, rules: RULES_V1 });
}

// ---------------------------------------------------------------------------------------------

describe('choix des cartes : moteur', () => {
  it('réserve : les 8 pouvoirs ; sans le Sablier fou contre l’IA ou sans pendule ; vide sans cartes', () => {
    expect(cardPool('climats', true)).toEqual(POUVOIRS);
    expect(POUVOIRS).toHaveLength(8);
    expect(cardPool('climats', true, { vsBot: true })).toEqual(POUVOIRS.filter(c => c !== 'hourglass'));
    expect(cardPool('climats', false)).toEqual(POUVOIRS.filter(c => c !== 'hourglass'));
    expect(cardPool('aucune', true)).toEqual([]);
    // Le tirage de l'accueil passe par la même réserve.
    for (let k = 0; k < 50; k++) {
      const h = dealHands(false, false, seeded(k + 1), 'climats');
      expect([...h.w, ...h.b].includes('hourglass')).toBe(false);
    }
  });

  it('validation : 3 cartes différentes de la réserve, sans autre contrainte (trois Climats permis)', () => {
    const pool = cardPool('climats', true);
    expect(draftRefusal(pool, ['truce', 'blood_moon', 'blast'], false, CARDS_PER_PLAYER)).toBeNull();
    expect(draftRefusal(pool, ['ice_wall', 'rift', 'tide'], false, CARDS_PER_PLAYER)).toBeNull();
    expect(draftRefusal(pool, ['ice_wall', 'rift'], false, CARDS_PER_PLAYER)).toMatch(/3 cartes/);
    expect(draftRefusal(pool, ['ice_wall', 'rift', 'tide', 'truce'], false, CARDS_PER_PLAYER)).toMatch(/3 cartes/);
    expect(draftRefusal(pool, ['ice_wall', 'ice_wall', 'tide'], false, CARDS_PER_PLAYER)).toMatch(/différentes/);
    expect(draftRefusal(pool, ['ice_wall', 'rift', 'freeze'], false, CARDS_PER_PLAYER)).toMatch(/proposée/);
    expect(draftRefusal(pool, ['ice_wall', 'rift', '__proto__'], false, CARDS_PER_PLAYER)).toMatch(/proposée/);
    expect(draftRefusal(pool, ['ice_wall', 'rift', 42], false, CARDS_PER_PLAYER)).toMatch(/proposée/);
    expect(draftRefusal(cardPool('climats', true, { vsBot: true }), ['hourglass', 'rift', 'tide'], false, CARDS_PER_PLAYER)).toMatch(/proposée/);
    // Sélection provisoire : de 0 à 3 cartes.
    expect(draftRefusal(pool, [], true, CARDS_PER_PLAYER)).toBeNull();
    expect(draftRefusal(pool, ['tide'], true, CARDS_PER_PLAYER)).toBeNull();
    expect(draftRefusal(pool, ['tide', 'tide'], true, CARDS_PER_PLAYER)).toMatch(/différentes/);
  });

  it('complément au hasard : garde la sélection en tête, complète sans doublon, dans la réserve', () => {
    const pool = cardPool('climats', false);
    for (let k = 0; k < 200; k++) {
      const partial: CardId[] = k % 3 === 0 ? [] : k % 3 === 1 ? ['rift'] : ['tide', 'ice_wall'];
      const hand = completeDraft(pool, partial, seeded(k + 7), CARDS_PER_PLAYER);
      expect(hand).toHaveLength(CARDS_PER_PLAYER);
      expect(hand.slice(0, partial.length)).toEqual(partial);
      expect(new Set(hand).size).toBe(CARDS_PER_PLAYER);
      expect(hand.every(c => pool.includes(c))).toBe(true);
    }
    // Uniforme : chaque carte sort.
    const seen = new Set<CardId>();
    for (let k = 0; k < 100; k++) completeDraft(pool, [], seeded(k + 1), CARDS_PER_PLAYER).forEach(c => seen.add(c));
    expect([...seen].sort()).toEqual([...pool].sort());
  });

  it('mains données : dans l’ordre choisi, clé de la position de départ recalculée', () => {
    const s = createGame({ w: [], b: [] }, true, 'climats');
    const n = withHands(s, { w: ['tide', 'rift', 'truce'], b: ['ice_wall', 'blast', 'ice_age'] });
    expect(n.hands.w).toEqual([{ card: 'tide', used: false }, { card: 'rift', used: false }, { card: 'truce', used: false }]);
    expect(n.hands.b.map(h => h.card)).toEqual(['ice_wall', 'blast', 'ice_age']);
    expect(n.keys).toEqual([positionKey(n)]);
    expect(s.hands.w).toEqual([]);
    // Même clé que la partie créée directement avec ces mains.
    expect(n.keys[0]).toBe(createGame({ w: ['tide', 'rift', 'truce'], b: ['ice_wall', 'blast', 'ice_age'] }, true, 'climats').keys[0]);
  });
});

describe('choix des cartes : IA', () => {
  it('trois cartes différentes de la réserve, au plus deux Climats, pas toujours les mêmes', () => {
    for (const level of [1, 2, 3] as const) {
      const pool = cardPool('climats', true, { vsBot: true });
      const hands = new Set<string>();
      for (let k = 0; k < 300; k++) {
        const hand = chooseBotDraft(pool, level, seeded(k * 31 + level), { count: CARDS_PER_PLAYER });
        expect(draftRefusal(pool, hand, false, CARDS_PER_PLAYER)).toBeNull();
        expect(hand.filter(c => CARDS[c].family === 'climat').length).toBeLessThanOrEqual(2);
        hands.add([...hand].sort().join());
      }
      expect(hands.size).toBeGreaterThanOrEqual(level === 3 ? 4 : 8);
    }
  });

  it('préfère les cartes qu’elle exploite le mieux (l’Archimage prend souvent le Mur de glace)', () => {
    const pool = cardPool('climats', true, { vsBot: true });
    let wall = 0;
    for (let k = 0; k < 200; k++) if (chooseBotDraft(pool, 3, seeded(k + 3), { count: CARDS_PER_PLAYER }).includes('ice_wall')) wall++;
    expect(wall).toBeGreaterThan(150);
  });
});

// ---------------------------------------------------------------------------------------------

describe('choix des cartes : serveur', () => {
  it('partie entre humains : choix ouvert 45 s, mains vides, ni coup, ni pendule, ni délai du premier coup', () => {
    const room = invite();
    const d = room.d;
    expect(d.status).toBe('active');
    expect(d.mirror).toBe(false);
    expect(d.draft?.pool).toEqual(POUVOIRS);
    expect(d.draft?.deadline).toBe(T0 + DRAFT_MS);
    expect(d.state.hands).toEqual({ w: [], b: [] });
    expect(d.firstMoveDeadline).toBeNull();
    expect(d.clock?.running).toBeNull();
    expect(applyMove(room, 'w', q('e2'), q('e4'))).toEqual({ ok: false, error: 'Choisissez d’abord vos cartes.' });
    const v = draftView(d, 'w')!;
    expect(v).toMatchObject({ pool: POUVOIRS, count: 3, deadline: T0 + DRAFT_MS, msLeft: DRAFT_MS, totalMs: DRAFT_MS, chosen: { w: false, b: false }, mine: [] });
    vi.advanceTimersByTime(10_000);
    expect(draftView(d, 'b')!.msLeft).toBe(DRAFT_MS - 10_000);
  });

  it('secret : chacun ne voit que ses cartes ; l’adversaire et les spectateurs voient seulement qui a validé', () => {
    const room = invite();
    const d = room.d;
    expect(applyDraft(room, 'w', ['blast', 'tide', 'ice_wall'], true)).toEqual({ ok: true });
    expect(applyDraft(room, 'b', ['truce'], false)).toEqual({ ok: true });
    expect(draftView(d, 'w')).toMatchObject({ chosen: { w: true, b: false }, mine: ['blast', 'tide', 'ice_wall'] });
    expect(draftView(d, 'b')).toMatchObject({ chosen: { w: true, b: false }, mine: ['truce'] });
    expect(draftView(d, null)).toMatchObject({ chosen: { w: true, b: false }, mine: [] });
    // Rien d'autre ne trahit le choix : mains vides dans l'état, la réserve est la même pour tous.
    expect(d.state.hands).toEqual({ w: [], b: [] });
    expect(JSON.stringify(draftView(d, 'b')).match(/"(blast|tide|ice_wall)"/g)?.length).toBe(3); // la réserve seule
  });

  it('idempotent : le même choix est accepté (dans n’importe quel ordre), un autre est refusé ; cartes invalides refusées', () => {
    const room = invite();
    expect(applyDraft(room, 'w', ['ice_wall', 'rift'], true).ok).toBe(false);
    expect(applyDraft(room, 'w', ['ice_wall', 'rift', 'rift'], true).ok).toBe(false);
    expect(applyDraft(room, 'w', ['ice_wall', 'rift', 'swap'], true).ok).toBe(false);
    expect(applyDraft(room, 'w', ['ice_wall', 'rift', 'tide'], true)).toEqual({ ok: true });
    expect(applyDraft(room, 'w', ['ice_wall', 'rift', 'tide'], true)).toEqual({ ok: true });
    expect(applyDraft(room, 'w', ['tide', 'ice_wall', 'rift'], true)).toEqual({ ok: true });
    expect(applyDraft(room, 'w', ['tide', 'ice_wall', 'truce'], true)).toEqual({ ok: false, error: 'Vos cartes sont déjà choisies.' });
    expect(applyDraft(room, 'w', ['tide'], false).ok).toBe(false);
    expect(room.d.draft?.picks.w).toEqual(['ice_wall', 'rift', 'tide']);
  });

  it('les deux ont validé : mains révélées dans l’ordre choisi, puis délai du premier coup et coups permis', () => {
    const room = invite('3+2');
    const d = room.d;
    applyDraft(room, 'b', ['ice_age', 'blood_moon', 'hourglass'], true);
    vi.advanceTimersByTime(20_000);
    applyDraft(room, 'w', ['rift', 'truce', 'tide'], true);
    expect(d.draft).toBeNull();
    expect(d.state.hands.w.map(h => h.card)).toEqual(['rift', 'truce', 'tide']);
    expect(d.state.hands.b.map(h => h.card)).toEqual(['ice_age', 'blood_moon', 'hourglass']);
    expect(d.state.keys).toEqual([positionKey(d.state)]);
    expect(d.firstMoveDeadline).toBe(T0 + 20_000 + FIRST_MOVE_MS);
    expect(draftView(d, 'w')).toBeNull();
    expect(applyDraft(room, 'w', ['rift', 'truce', 'tide'], true)).toEqual({ ok: false, error: 'Aucun choix de cartes en cours.' });
    expect(applyMove(room, 'w', q('e2'), q('e4')).ok).toBe(true);
    // La pendule ne démarre qu'après le premier coup de chacun, comme avant.
    expect(d.clock?.running).toBeNull();
    expect(applyMove(room, 'b', q('e7'), q('e5')).ok).toBe(true);
    expect(d.clock?.running).toBe('w');
    expect(d.clock?.w).toBe(180_000);
  });

  it('échéance : le serveur complète au hasard ce qui manque (sélection provisoire gardée)', () => {
    const room = invite();
    const d = room.d;
    applyDraft(room, 'w', ['blast', 'rift', 'tide'], true);
    applyDraft(room, 'b', ['ice_wall'], false);
    applyDraft(room, 'b', ['ice_wall', 'truce'], false);
    vi.advanceTimersByTime(DRAFT_MS - 1);
    expect(d.draft).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(d.draft).toBeNull();
    expect(d.state.hands.w.map(h => h.card)).toEqual(['blast', 'rift', 'tide']);
    const b = d.state.hands.b.map(h => h.card);
    expect(b.slice(0, 2)).toEqual(['ice_wall', 'truce']);
    expect(draftRefusal(POUVOIRS, b, false, CARDS_PER_PLAYER)).toBeNull();
    expect(d.firstMoveDeadline).toBe(T0 + DRAFT_MS + FIRST_MOVE_MS);
    // Personne n'a choisi : trois cartes chacun au hasard.
    const idle = invite();
    vi.advanceTimersByTime(DRAFT_MS);
    for (const c of ['w', 'b'] as const) expect(draftRefusal(POUVOIRS, idle.d.state.hands[c].map(h => h.card), false, CARDS_PER_PLAYER)).toBeNull();
    // Puis, sans premier coup, la partie est annulée comme avant.
    vi.advanceTimersByTime(FIRST_MOVE_MS);
    expect(idle.d.status).toBe('ended');
    expect(idle.d.state.result).toEqual({ winner: null, reason: 'aborted' });
  });

  it('contre l’IA : elle choisit aussitôt, sans Sablier fou ; le choix du joueur révèle les mains', () => {
    const decide = vi.mocked(botPool.decide);
    decide.mockClear();
    const room = newRoom({ mode: 'bot', rated: false, tc: '3+2', catalog: 'climats', creator: 'g:1', seats: { w: bot(3), b: human(1) }, rules: RULES_V1 });
    const d = room.d;
    expect(d.draft?.pool).not.toContain('hourglass');
    expect(draftView(d, 'b')?.chosen).toEqual({ w: true, b: false });
    expect(d.draft?.picks.w).toHaveLength(3);
    expect(decide).not.toHaveBeenCalled(); // l'IA ne joue pas pendant le choix
    expect(applyDraft(room, 'b', ['hourglass', 'rift', 'tide'], true).ok).toBe(false);
    expect(applyDraft(room, 'b', ['ice_wall', 'rift', 'tide'], true)).toEqual({ ok: true });
    expect(d.draft).toBeNull();
    expect(d.state.hands.w).toHaveLength(3);
    expect(d.state.hands.w.some(h => h.card === 'hourglass')).toBe(false);
    expect(decide).toHaveBeenCalledTimes(1); // révélation : l'IA (Blancs) joue son premier coup
    expect(d.firstMoveDeadline).toBeNull(); // l'IA au trait : pas de délai
  });

  it('abandon ou annulation pendant le choix : partie annulée, sans effet sur le classement', () => {
    const room = invite('5+0', 'climats', true);
    applyDraft(room, 'w', ['ice_wall', 'rift', 'tide'], true);
    expect(resignRoom(room, 'b')).toEqual({ ok: true });
    expect(room.d.status).toBe('ended');
    expect(room.d.state.result).toEqual({ winner: null, reason: 'aborted' });
    expect(room.d.ratingDiff).toBeNull();
    expect(room.d.draft).toBeNull();
    // Plus aucun choix possible, et la minuterie de l'échéance est arrêtée.
    expect(applyDraft(room, 'b', ['ice_wall', 'rift', 'tide'], true).ok).toBe(false);
    vi.advanceTimersByTime(DRAFT_MS);
    expect(room.d.state.hands).toEqual({ w: [], b: [] });
    // Annulation explicite pendant le choix.
    const other = invite('5+0', 'climats', true);
    expect(abortRoom(other)).toEqual({ ok: true });
    expect(other.d.state.result).toEqual({ winner: null, reason: 'aborted' });
    expect(other.d.ratingDiff).toBeNull();
    // Après la révélation et les premiers coups, l'abandon redevient une défaite (et compte au classement).
    const played = invite('5+0', 'climats', true);
    applyDraft(played, 'w', ['ice_wall', 'rift', 'tide'], true);
    applyDraft(played, 'b', ['ice_wall', 'rift', 'tide'], true);
    applyMove(played, 'w', q('e2'), q('e4'));
    applyMove(played, 'b', q('e7'), q('e5'));
    expect(resignRoom(played, 'b')).toEqual({ ok: true });
    expect(played.d.state.result).toEqual({ winner: 'w', reason: 'resign' });
    expect(played.d.ratingDiff).not.toBeNull();
  });

  it('redémarrage pendant le choix : choix et sélections gardés, échéance entière à la reprise', () => {
    const room = invite();
    applyDraft(room, 'w', ['blood_moon', 'ice_age', 'truce'], true);
    applyDraft(room, 'b', ['tide', 'rift'], false);
    vi.advanceTimersByTime(30_000);
    const saved: RoomData = JSON.parse(JSON.stringify(room.d));
    // Arrêt du serveur : ses minuteries disparaissent avec lui.
    vi.clearAllTimers();
    vi.advanceTimersByTime(10 * 60_000);
    const back = new Room(saved);
    resumeRoom(back);
    const t = Date.now();
    expect(back.d.draft?.deadline).toBe(t + DRAFT_MS);
    expect(draftView(back.d, 'w')).toMatchObject({ chosen: { w: true, b: false }, mine: ['blood_moon', 'ice_age', 'truce'], msLeft: DRAFT_MS });
    expect(draftView(back.d, 'b')?.mine).toEqual(['tide', 'rift']);
    vi.advanceTimersByTime(DRAFT_MS);
    expect(back.d.draft).toBeNull();
    expect(back.d.state.hands.w.map(h => h.card)).toEqual(['blood_moon', 'ice_age', 'truce']);
    expect(back.d.state.hands.b.map(h => h.card).slice(0, 2)).toEqual(['tide', 'rift']);
    expect(back.d.firstMoveDeadline).toBe(t + DRAFT_MS + FIRST_MOVE_MS);
  });

  it('redémarrage d’une partie contre l’IA dont le joueur avait validé : révélation à la reprise', () => {
    const room = newRoom({ mode: 'bot', rated: false, tc: 'none', catalog: 'climats', creator: 'g:1', seats: { w: human(1), b: bot(1) }, rules: RULES_V1 });
    const saved: RoomData = JSON.parse(JSON.stringify(room.d));
    saved.draft!.picks.w = ['ice_wall', 'rift', 'tide'];
    vi.clearAllTimers();
    const back = new Room(saved);
    resumeRoom(back);
    expect(back.d.draft).toBeNull();
    expect(back.d.state.hands.w.map(h => h.card)).toEqual(['ice_wall', 'rift', 'tide']);
    expect(back.d.state.hands.b).toHaveLength(3);
  });

  it('anciennes parties sauvegardées sans choix des cartes : reprises et jouables telles quelles', () => {
    const state = createGame({ w: ['tide', 'rift', 'truce'], b: ['ice_wall', 'blast', 'ice_age'] }, true, 'climats');
    const old = {
      id: 'OLD001', mode: 'invite', rated: false, status: 'active', tc: '5+0', mirror: false, catalog: 'climats', creator: 'g:1',
      seats: { w: human(1), b: human(2) }, state,
      clock: { initial: 300, increment: 0, w: 300_000, b: 300_000, running: null, since: T0 },
      drawOffer: null, rematch: { w: false, b: false, next: null }, ratingDiff: null, firstMoveDeadline: T0 + 40_000, createdAt: T0,
    } as unknown as RoomData;
    const room = new Room(JSON.parse(JSON.stringify(old)));
    resumeRoom(room);
    expect(room.d.draft).toBeUndefined();
    expect(draftView(room.d, 'w')).toBeNull();
    expect(applyMove(room, 'w', q('e2'), q('e4')).ok).toBe(true);
    expect(room.d.state.hands.w.map(h => h.card)).toEqual(['tide', 'rift', 'truce']);
  });

  it('sans cartes : pas de choix, la partie commence comme avant', () => {
    const room = invite('5+0', 'aucune');
    expect(room.d.draft).toBeNull();
    expect(room.d.firstMoveDeadline).toBe(T0 + FIRST_MOVE_MS);
    expect(applyMove(room, 'w', q('e2'), q('e4')).ok).toBe(true);
  });

  it('invitation en attente : le choix ne s’ouvre qu’à l’arrivée du deuxième joueur', () => {
    const room = newRoom({ mode: 'invite', rated: false, tc: 'none', catalog: 'climats', creator: 'g:1', seats: { w: human(1), b: null }, rules: RULES_V1 });
    expect(room.d.status).toBe('waiting');
    expect(room.d.draft?.deadline).toBeNull();
    expect(room.d.draft?.pool).not.toContain('hourglass'); // sans pendule
    expect(draftView(room.d, 'w')).toBeNull();
    expect(submitDraft(room.d, 'w', ['ice_wall', 'rift', 'tide'], true)).toEqual({ ok: false, error: 'Aucun choix de cartes en cours.' });
    vi.advanceTimersByTime(5 * 60_000);
    // Une sauvegarde d'invitation en attente reprend sans choix ouvert.
    const back = new Room(JSON.parse(JSON.stringify(room.d)));
    resumeRoom(back);
    expect(back.d.draft?.deadline).toBeNull();
    // closeDraft n'est jamais appelé avant l'ouverture : il donnerait des mains au hasard.
    expect(closeDraft({ ...back.d, draft: null })).toEqual({ auto: [], filled: [] });
  });
});

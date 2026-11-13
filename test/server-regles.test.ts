// Règles par partie côté serveur (src/server/games.ts) : les nouvelles parties prennent les règles du moment de leur
// contexte (rulesFor, ici changées comme le fait le serveur jetable : setRulesOverride, setDealOverride), les parties
// enregistrées gardent les leurs.
// - choix des cartes à N = 1, 3 et 5 : count, totalMs, mains de N cartes à la clôture, `filled` (camps complétés au
//   hasard : sélection provisoire incomplète seulement) ; tirage partout (DEAL.draft faux) ;
// - reprise des salles témoins v1 alors que les règles du jour sont à 5 cartes : le choix en cours garde 3 cartes ;
// - revanche : pendule de la partie d'origine (cadence retirée comprise), mise en place reprise, règles du moment ;
//   cadence inconnue refusée ;
// - IA : cartes de la décision jouées une à une (pause entre elles), échecs répétés puis coup légal au hasard, niveau
//   inconnu ; fil de calcul mort (bot-pool) ;
// - carte à la place du coup (cardEndsTurn) : incrément et début de partie comme un coup ;
// - règles enregistrées illisibles à la reprise : partie annulée ;
// - mise en place lue à la création : contraintes du choix (DEAL.limitsInDraft) gardées dans la partie, tirage plus
//   court que les règles refusé ; échéance de la revanche (TIMINGS.rematchTtlMs).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/server/db', () => ({
  q: vi.fn(async () => []),
  one: vi.fn(async () => null),
  tx: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn({ query: async () => ({ rows: [], rowCount: 0 }) })),
}));
vi.mock('../src/server/bot-pool', () => ({
  botPool: { decide: vi.fn(async () => ({ move: null, card: null })) },
}));

import type { BotReply } from '../src/shared/botProtocol';
import type { CardId } from '../src/shared/cards';
import type { Color } from '../src/shared/chess';
import { DEAL } from '../src/shared/config/rules';
import { cardOptions, createGame, legalMovesOf, playCard } from '../src/shared/game';
import type { GameState } from '../src/shared/game';
import { RULES_V1, rulesFor, rulesOf, setRulesOverride } from '../src/shared/rules';
import type { Rules } from '../src/shared/rules';
import { botPool } from '../src/server/bot-pool';
import type { BotThread } from '../src/server/bot-pool';
import {
  CINEMATIC_MS, Room, RoomData, applyDraft, closeDraft, commitCard, contextOf, createRematch, draftView, newDraft, newRoom,
  rematchExpired, resignRoom, resumeRoom, setupOf, submitDraft, takeSeat,
} from '../src/server/games';
import { BOT_RUNTIME, BOT_THREADS, setDealOverride } from '../src/server/settings';
import { toSummary } from '../src/server/summary';
import { bot, human } from './helpers/sieges';

const T0 = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  vi.mocked(botPool.decide).mockReset();
  vi.mocked(botPool.decide).mockImplementation(async () => ({ id: 0, move: null, card: null }));
});
afterEach(() => {
  setRulesOverride(null);
  setDealOverride(null);
  vi.clearAllTimers();
  vi.useRealTimers();
});

/** Les règles du moment (comme SPELLMATE_TEST_RULES sur le serveur jetable). */
const withRules = (p: Parameters<typeof setRulesOverride>[0]) => setRulesOverride(p);
const invite = (tc = '5+0') => newRoom({ mode: 'invite', rated: false, tc, catalog: 'climats', creator: 'g:1', seats: { w: human(1), b: human(2) } });

describe('règles des nouvelles parties', () => {
  it('au défaut : aucune règle écrite dans l’état ; contexte d’après le mode', () => {
    const room = invite();
    expect('rules' in room.d.state).toBe(false);
    expect(rulesOf(room.d.state)).toBe(RULES_V1);
    expect(contextOf({ mode: 'invite', rated: false })).toBe('invitation');
    expect(contextOf({ mode: 'bot', rated: false })).toBe('ia');
    expect(contextOf({ mode: 'quick', rated: true })).toBe('classee');
    expect(contextOf({ mode: 'quick', rated: false })).toBe('amicale');
    expect(contextOf({ mode: 'quick', rated: false, relay: true })).toBe('accueil');
  });

  it('règles du moment photographiées dans la partie ; le Duel (plus proposé) suit RULES_V1', () => {
    withRules({ cardsPerPlayer: 5 });
    const room = invite();
    expect(room.d.state.rules).toBe(rulesFor('invitation'));
    expect(rulesOf(room.d.state).cardsPerPlayer).toBe(5);
    const duel = newRoom({ mode: 'invite', rated: false, tc: '5+0', catalog: 'duel', creator: 'g:1', seats: { w: human(1), b: human(2) }, deal: true });
    expect('rules' in duel.d.state).toBe(false);
    expect(duel.d.state.hands.w).toHaveLength(3);
  });

  it('cadence inconnue refusée (plus de partie « sans pendule » silencieuse)', () => {
    expect(() => invite('7+3')).toThrow(/Cadence inconnue/);
    // Pendule donnée (revanche) : acceptée même si la cadence n'est plus connue.
    const r = newRoom({ mode: 'invite', rated: false, tc: '7+3', clock: { initial: 420, increment: 3 }, catalog: 'aucune', creator: 'g:1', seats: { w: human(1), b: human(2) } });
    expect(r.d.clock).toMatchObject({ initial: 420, increment: 3, w: 420_000, b: 420_000 });
    expect(r.d.tc).toBe('7+3');
  });

  it('réserve trop petite pour le choix : refus explicite (plus de tirage silencieux)', () => {
    expect(newDraft('aucune', true, false, 3)).toBeNull();
    expect(newDraft('climats', false, true, 7)?.pool).toHaveLength(7);
    expect(() => newDraft('climats', false, true, 8)).toThrow(/la réserve n'a que 7 cartes pour 8 cartes par joueur/);
  });

  it('tirage plus court que les règles (R9 intenable) : refus explicite, jamais une main plus courte', () => {
    // 6 cartes avec au plus 2 Climats : la réserve n'a que 3 autres cartes (main valide maximale : 5).
    const six: Rules = { ...rulesFor('accueil'), cardsPerPlayer: 6 };
    const home = (rules?: Rules) =>
      newRoom({ mode: 'quick', rated: false, tc: 'none', catalog: 'climats', creator: 'g:1', seats: { w: human(1), b: human(2) }, deal: true, relay: true, rules });
    expect(() => home(six)).toThrow(/Tirage impossible : mains de 5 et 5 cartes pour 6 cartes par joueur/);
    expect(home({ ...six, cardsPerPlayer: 5 }).d.state.hands.w).toHaveLength(5);
    // Sans cartes : mains vides, rien à vérifier.
    const none = newRoom({ mode: 'invite', rated: false, tc: '5+0', catalog: 'aucune', creator: 'g:1', seats: { w: human(1), b: human(2) }, deal: true });
    expect(none.d.state.hands).toEqual({ w: [], b: [] });
  });
});

describe('choix des cartes à N cartes', () => {
  for (const n of [1, 3, 5]) {
    it(`${n} carte${n > 1 ? 's' : ''} : count, totalMs, mains de ${n} cartes, filled`, () => {
      withRules({ cardsPerPlayer: n });
      const room = invite();
      const d = room.d;
      expect(draftView(d, 'w')).toMatchObject({ count: n, totalMs: DEAL.draftMs, msLeft: DEAL.draftMs });
      const pool = d.draft!.pool as CardId[];
      // Les Blancs valident n cartes ; n + 1 sont refusées.
      expect(submitDraft(d, 'w', pool.slice(0, n + 1), true).ok).toBe(false);
      expect(submitDraft(d, 'w', pool.slice(0, n), true)).toEqual({ ok: true, validated: true, complete: false });
      // Les Noirs gardent une sélection provisoire complète (n cartes), sans valider.
      expect(submitDraft(d, 'b', pool.slice(-n), false).ok).toBe(true);
      const { auto, filled } = closeDraft(d, () => 0.5);
      expect(auto).toEqual(['b']);
      expect(filled).toEqual([]);
      expect(d.state.hands.w.map(h => h.card)).toEqual(pool.slice(0, n));
      expect(d.state.hands.b.map(h => h.card)).toEqual(pool.slice(-n));
    });
  }

  it('sélection provisoire incomplète (2 cartes sur 3) : camp complété au hasard, dans `filled` ; événement reveal', () => {
    const room = invite();
    const updates: unknown[] = [];
    room.sockets.add({ data: { identity: { user: null, guestId: '1', sessionId: null } }, emit: (_e: string, u: unknown) => updates.push(u) } as never);
    applyDraft(room, 'b', ['tide', 'rift'], false);
    vi.advanceTimersByTime(DEAL.draftMs);
    expect(room.d.draft).toBeNull();
    expect(room.d.state.hands.b.map(h => h.card).slice(0, 2)).toEqual(['tide', 'rift']);
    expect(room.d.state.hands.b).toHaveLength(3);
    const reveal = updates.map(u => (u as { event: { type: string } }).event).find(e => e.type === 'reveal');
    expect(reveal).toEqual({ type: 'reveal', auto: ['w', 'b'], filled: ['w', 'b'] });
  });

  it('tirage partout (DEAL.draft faux) : pas de choix, mains de N cartes tirées', () => {
    withRules({ cardsPerPlayer: 4 });
    setDealOverride({ draft: false });
    const room = invite();
    expect(room.d.draft).toBeNull();
    expect(room.d.state.hands.w).toHaveLength(4);
    expect(room.d.state.hands.b).toHaveLength(4);
    expect(room.d.firstMoveDeadline).not.toBeNull();
    const ia = newRoom({ mode: 'bot', rated: false, tc: 'none', catalog: 'climats', creator: 'g:1', seats: { w: human(1), b: bot(2) } });
    expect(ia.d.draft).toBeNull();
    expect(ia.d.state.hands.b.map(h => h.card)).not.toContain('hourglass');
  });

  it('durée du choix : DEAL.draftMs du serveur (surcharge de test)', () => {
    setDealOverride({ draftMs: 20_000 });
    const room = invite();
    expect(draftView(room.d, 'w')).toMatchObject({ totalMs: 20_000, msLeft: 20_000 });
    vi.advanceTimersByTime(20_000);
    expect(room.d.draft).toBeNull();
  });

  it('contraintes du choix (DEAL.limitsInDraft) lues à la création et gardées : un déploiement ne les change pas en route', () => {
    const climats: CardId[] = ['hourglass', 'truce', 'blood_moon'];
    // Au défaut : aucune contrainte, rien d'écrit dans le choix (le choix enregistré est le même qu'avant).
    const free = invite();
    expect('limits' in free.d.draft!).toBe(false);
    setDealOverride({ limitsInDraft: true });
    const bound = invite();
    expect(bound.d.draft!.limits).toEqual(DEAL.handLimits);
    // Le serveur redémarre avec DEAL.limitsInDraft faux : la partie créée avec R9 la garde, l'autre reste libre.
    setDealOverride(null);
    expect(submitDraft(bound.d, 'w', climats, true)).toEqual({ ok: false, error: 'Au plus deux Climats par main.' });
    expect(submitDraft(free.d, 'w', climats, true).ok).toBe(true);
    // Et l'inverse : R9 activée après la création d'une partie libre ne la contraint pas.
    setDealOverride({ limitsInDraft: true });
    expect(submitDraft(free.d, 'b', climats, true).ok).toBe(true);
  });

  it('l’IA choisit autant de cartes que la partie en demande', () => {
    withRules({ cardsPerPlayer: 5 });
    const room = newRoom({ mode: 'bot', rated: false, tc: '3+2', catalog: 'climats', creator: 'g:1', seats: { w: human(1), b: bot(3) } });
    expect(room.d.draft?.picks.b).toHaveLength(5);
  });
});

describe('reprise des salles témoins v1 avec les règles du jour à 5 cartes', () => {
  const salle = (nom: string): RoomData =>
    JSON.parse(readFileSync(new URL(`./fixtures/v1/salles/${nom}.json`, import.meta.url), 'utf8')) as RoomData;

  it('le choix en cours garde 3 cartes (les règles de la partie, RULES_V1)', () => {
    withRules({ cardsPerPlayer: 5 });
    const room = new Room(salle('choix-en-cours'));
    resumeRoom(room);
    const d = room.d;
    expect(draftView(d, 'b')).toMatchObject({ count: 3, mine: ['blast', 'truce'] });
    expect(submitDraft(d, 'b', ['blast', 'truce', 'tide', 'rift', 'ice_age'], true).ok).toBe(false);
    expect(submitDraft(d, 'b', ['blast', 'truce', 'ice_age'], true)).toMatchObject({ ok: true, complete: true });
    closeDraft(d);
    expect(d.state.hands.w).toHaveLength(3);
    expect(d.state.hands.b).toHaveLength(3);
    expect('rules' in d.state).toBe(false);
  });

  it('partie contre l’IA en plein choix : l’IA garde ses 3 cartes ; partie en cours : rejouable', () => {
    withRules({ cardsPerPlayer: 5, cardsPerTurn: 2 });
    const ia = new Room(salle('ia-choix'));
    resumeRoom(ia);
    expect(ia.d.draft?.picks.b).toHaveLength(3);
    expect(draftView(ia.d, 'w')?.count).toBe(3);
    const pouvoirs = new Room(salle('pouvoirs-en-cours'));
    resumeRoom(pouvoirs);
    expect(pouvoirs.d.status).toBe('active');
    expect(rulesOf(pouvoirs.d.state)).toBe(RULES_V1);
  });

  it('règles enregistrées illisibles (schéma inconnu, valeurs injouables) : partie annulée à la reprise', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      for (const rules of [{ ...RULES_V1, schema: 2 }, { ...RULES_V1, cardsPerTurn: 9 }]) {
        const data = salle('pouvoirs-en-cours');
        (data.state as unknown as { rules: unknown }).rules = rules;
        const room = new Room(data);
        resumeRoom(room);
        expect(room.d.status).toBe('ended');
        expect(room.d.state.result).toEqual({ winner: null, reason: 'aborted' }); // sans cause : annulée par le serveur
      }
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/annulée à la reprise : ses règles enregistrées sont illisibles/));
      // Des règles lisibles sont gardées telles quelles (gelées).
      const data = salle('pouvoirs-en-cours');
      (data.state as GameState).rules = { ...RULES_V1, cardsPerTurn: 2 } as Rules;
      const room = new Room(data);
      resumeRoom(room);
      expect(room.d.status).toBe('active');
      expect(rulesOf(room.d.state).cardsPerTurn).toBe(2);
      expect(Object.isFrozen(room.d.state.rules)).toBe(true);
    } finally {
      log.mockRestore();
    }
  });
});

describe('revanche', () => {
  it('pendule de la partie d’origine, cadence retirée comprise ; règles du moment', async () => {
    const room = newRoom({ mode: 'invite', rated: false, tc: '1+0', catalog: 'climats', creator: 'g:1', seats: { w: human(1), b: human(2) } });
    room.d.status = 'ended';
    // La cadence de la partie a disparu de TIME_CONTROLS depuis : la revanche garde sa pendule.
    room.d.tc = 'retiree';
    room.d.clock = { ...room.d.clock!, initial: 75, increment: 1 };
    withRules({ cardsPerPlayer: 5 });
    const next = (await createRematch(room))!;
    expect(next.d.tc).toBe('retiree');
    expect(next.d.clock).toMatchObject({ initial: 75, increment: 1, w: 75_000, b: 75_000 });
    expect(rulesOf(next.d.state).cardsPerPlayer).toBe(5);
    expect(draftView(next.d, 'w')?.count).toBe(5);
    expect(rulesOf(room.d.state)).toBe(RULES_V1);
  });

  it('échéance (TIMINGS.rematchTtlMs) : aucune au défaut ; sinon, comptée depuis la fin de la partie', () => {
    const room = invite();
    expect(rematchExpired(room, 60_000)).toBe(false); // partie en cours
    resignRoom(room, 'w');
    vi.advanceTimersByTime(60_000);
    expect(rematchExpired(room, 60_000)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(rematchExpired(room, 60_000)).toBe(true);
    // Défaut (null) : jamais, même des jours plus tard.
    vi.advanceTimersByTime(3 * 24 * 3600_000);
    expect(rematchExpired(room)).toBe(false);
    expect(rematchExpired(room, null)).toBe(false);
  });

  it('partie de l’accueil (relais) : mains tirées et relais repris ; sans pendule reste sans pendule', async () => {
    const home = newRoom({ mode: 'quick', rated: false, tc: 'none', catalog: 'climats', creator: 'g:1', seats: { w: human(1), b: human(2) }, deal: true, relay: true });
    expect(setupOf(home.d)).toEqual({ deal: true, relay: true });
    home.d.status = 'ended';
    const next = (await createRematch(home))!;
    expect(next.d.relay).toBe(true);
    expect(next.d.draft).toBeNull();
    expect(next.d.state.hands.w).toHaveLength(3);
    expect(next.d.clock).toBeNull();
    expect(setupOf(invite().d)).toEqual({ deal: false, relay: false });
  });
});

describe('IA', () => {
  /**
   * Partie contre l'IA (Blancs) avec ces mains et ces règles : créée en attente, puis l'humain s'assoit (takeSeat), ce
   * qui la lance et appelle l'IA sur cet état.
   */
  async function vsBot(hands: Record<Color, CardId[]>, rules: Rules) {
    const room = newRoom({ mode: 'bot', rated: false, tc: 'none', catalog: 'aucune', creator: 'g:1', seats: { w: bot(2), b: null } });
    room.d.state = createGame(hands, false, 'climats', { rules });
    expect(await takeSeat(room, { user: null, guestId: '1', sessionId: null }, { name: 'Joueur' })).toBe('b');
    return room;
  }
  /** Cartes jouables (premières cibles proposées) et coup légal ensuite, comme le rendrait le fil de calcul. */
  function decision(s: GameState, indexes: number[]): BotReply {
    let after = s;
    const cards = indexes.map(index => {
      const targets: number[] = [];
      const need = after.hands.w[index].card === 'ice_wall' || after.hands.w[index].card === 'rift' ? 1 : 0;
      while (targets.length < need) targets.push(cardOptions(after, 'w', index, targets)[0]);
      const r = playCard(after, 'w', index, targets, '');
      if (!r.ok) throw new Error(r.error);
      after = r.state;
      return { index, targets };
    });
    const m = legalMovesOf(after)[0];
    return { id: 1, card: cards[0] ?? null, cards, move: { from: m.from, to: m.to } };
  }
  const HANDS: Record<Color, CardId[]> = { w: ['ice_wall', 'rift', 'tide'], b: ['truce', 'blast', 'ice_age'] };
  const kinds = (room: Room) => room.d.state.log.map(e => e.k);

  it('deux cartes par tour : les cartes de la décision, dans l’ordre, une pause entre elles, puis le coup', async () => {
    withRules({ cardsPerTurn: 2 });
    vi.mocked(botPool.decide).mockImplementation(async s => decision(s, [0, 1]));
    const room = await vsBot(HANDS, rulesFor('ia'));
    await vi.advanceTimersByTimeAsync(BOT_RUNTIME.pauseMinMs + BOT_RUNTIME.pauseJitterMs);
    expect(kinds(room)).toEqual(['card']);
    await vi.advanceTimersByTimeAsync(BOT_RUNTIME.cardPauseMs);
    expect(kinds(room)).toEqual(['card', 'card']);
    expect(room.d.state.pos.turn).toBe('w');
    await vi.advanceTimersByTimeAsync(BOT_RUNTIME.cardPauseMs);
    expect(kinds(room)).toEqual(['card', 'card', 'move']);
    expect(room.d.state.pos.turn).toBe('b');
    expect(botPool.decide).toHaveBeenCalledTimes(1);
  });

  it('réponse d’un fil ancien (card seule, sans cards) : la carte, la pause, puis le coup, comme avant', async () => {
    vi.mocked(botPool.decide).mockImplementation(async s => {
      const { cards, ...old } = decision(s, [0]);
      expect(cards).toHaveLength(1);
      return old;
    });
    const room = await vsBot(HANDS, RULES_V1);
    await vi.advanceTimersByTimeAsync(BOT_RUNTIME.pauseMinMs + BOT_RUNTIME.pauseJitterMs);
    expect(kinds(room)).toEqual(['card']);
    await vi.advanceTimersByTimeAsync(BOT_RUNTIME.cardPauseMs);
    expect(kinds(room)).toEqual(['card', 'move']);
  });

  it('carte refusée : les cartes suivantes et le coup sont abandonnés, puis l’IA recalcule', async () => {
    withRules({ cardsPerTurn: 2 });
    let calls = 0;
    vi.mocked(botPool.decide).mockImplementation(async s => {
      calls++;
      const d = decision(s, [0]);
      // Première réponse : une carte inexistante (index 9), puis une vraie.
      return calls === 1 ? { ...d, card: { index: 9, targets: [] }, cards: [{ index: 9, targets: [] }, ...d.cards!] } : decision(s, []);
    });
    const room = await vsBot(HANDS, rulesFor('ia'));
    await vi.advanceTimersByTimeAsync(BOT_RUNTIME.pauseMinMs + BOT_RUNTIME.pauseJitterMs);
    expect(kinds(room)).toEqual([]);
    expect(room.botFailures).toBe(1);
    await vi.advanceTimersByTimeAsync(BOT_RUNTIME.retryMs + BOT_RUNTIME.pauseMinMs + BOT_RUNTIME.pauseJitterMs);
    expect(kinds(room)).toEqual(['move']);
    expect(room.botFailures).toBe(0);
  });

  it('échecs répétés (fil en panne) : après BOT_RUNTIME.maxFailures échecs, un coup légal au hasard', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      vi.mocked(botPool.decide).mockRejectedValue(new Error('IA : délai dépassé'));
      const room = newRoom({ mode: 'bot', rated: false, tc: 'none', catalog: 'aucune', creator: 'g:1', seats: { w: bot(2), b: human(1) } });
      for (let k = 1; k <= BOT_RUNTIME.maxFailures; k++) {
        await vi.advanceTimersByTimeAsync(0);
        expect(room.botFailures).toBe(k);
        await vi.advanceTimersByTimeAsync(BOT_RUNTIME.retryMs);
      }
      expect(botPool.decide).toHaveBeenCalledTimes(BOT_RUNTIME.maxFailures);
      expect(room.d.state.ply).toBe(0);
      await vi.advanceTimersByTimeAsync(BOT_RUNTIME.pauseMinMs + BOT_RUNTIME.pauseJitterMs);
      expect(room.d.state.ply).toBe(1);
      expect(room.botFailures).toBe(0);
      expect(botPool.decide).toHaveBeenCalledTimes(BOT_RUNTIME.maxFailures);
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/échecs de suite .* coup légal au hasard/));
    } finally {
      log.mockRestore();
    }
  });

  it('niveau inconnu (partie enregistrée par une autre version) : niveau par défaut', () => {
    const room = newRoom({ mode: 'bot', rated: false, tc: 'none', catalog: 'aucune', creator: 'g:1', seats: { w: { ...bot(2), level: 7 as never }, b: human(1) } });
    expect(botPool.decide).toHaveBeenCalledWith(room.d.state, 2);
  });
});

describe('carte à la place du coup (cardEndsTurn)', () => {
  /** Salle 3+2 dont la pendule des Blancs tourne depuis T0 (comme test/server-clock.test.ts). */
  function clockRoom(state: GameState): RoomData {
    return {
      id: 'T1', mode: 'invite', rated: false, status: 'active', tc: '3+2', mirror: false, catalog: 'climats', creator: 'g:1',
      seats: { w: null, b: null }, state, clock: { initial: 180, increment: 2, w: 180_000, b: 180_000, running: 'w', since: T0 },
      drawOffer: null, rematch: { w: false, b: false, next: null }, ratingDiff: null, firstMoveDeadline: null, createdAt: T0, started: false,
    };
  }
  const HANDS: Record<Color, CardId[]> = { w: ['ice_wall', 'rift', 'tide'], b: ['truce', 'blast', 'ice_age'] };

  it('toute carte tient lieu de coup : incrément, et la partie commence au deuxième', () => {
    withRules({ cardEndsTurn: true });
    const d = clockRoom(createGame(HANDS, true, 'climats', { rules: rulesFor('invitation') }));
    vi.advanceTimersByTime(1000);
    const wall = playCard(d.state, 'w', 0, [cardOptions(d.state, 'w', 0)[0]], '');
    if (!wall.ok) throw new Error(wall.error);
    expect(wall.info.ritual).toBeUndefined();
    expect(commitCard(d, 'w', wall.state, wall.info)).toBe(true);
    expect(d.clock!.w).toBe(180_000 - 1000 + 2000);
    expect(d.started).toBe(false);
    const truce = playCard(d.state, 'b', 0, [], '');
    if (!truce.ok) throw new Error(truce.error);
    expect(commitCard(d, 'b', truce.state, truce.info)).toBe(true);
    expect(d.started).toBe(true);
  });

  it('au défaut (RULES_V1) : la carte s’ajoute au coup, sans incrément', () => {
    const d = clockRoom(createGame(HANDS, true, 'climats', { rules: RULES_V1 }));
    vi.advanceTimersByTime(1000);
    const wall = playCard(d.state, 'w', 0, [cardOptions(d.state, 'w', 0)[0]], '');
    if (!wall.ok) throw new Error(wall.error);
    expect(commitCard(d, 'w', wall.state, wall.info)).toBe(false);
    // La pendule tourne toujours, créditée de la cinématique (R10) : 1 s écoulée, 1,2 s rendue.
    expect(d.clock!.running).toBe('w');
    expect(d.clock!.w).toBe(180_000 - 1000 + CINEMATIC_MS);
  });
});

describe('fil de calcul de l’IA mort (bot-pool)', () => {
  /** Doublure d'un fil : émet les événements qu'on lui donne, garde les messages reçus. */
  class FakeThread implements BotThread {
    listeners: Record<string, ((x: never) => void)[]> = {};
    sent: { id: number }[] = [];
    postMessage(m: unknown) {
      this.sent.push(m as { id: number });
    }
    on(event: string, listener: (x: never) => void) {
      (this.listeners[event] ??= []).push(listener);
      return this;
    }
    emit(event: string, x: unknown) {
      for (const l of this.listeners[event] ?? []) l(x as never);
    }
  }

  it('ses demandes échouent tout de suite, il est remplacé ; trop de pertes : calcul dans le processus', async () => {
    const { BotPool } = await vi.importActual<typeof import('../src/server/bot-pool')>('../src/server/bot-pool');
    const spawned: FakeThread[] = [];
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const pool = new BotPool(() => {
        const t = new FakeThread();
        spawned.push(t);
        return t;
      }, () => 2);
      pool.start();
      expect(pool.threadCount).toBe(2);
      const s = createGame({ w: [], b: [] }, false, 'aucune');
      const p1 = pool.decide(s, 2);
      const p2 = pool.decide(s, 2);
      // Le premier fil meurt : sa demande échoue aussitôt (pas au bout de BOT_RUNTIME.timeoutMs), il est remplacé.
      spawned[0].emit('exit', 1);
      await expect(p1).rejects.toThrow(/thread de calcul perdu/);
      expect(pool.threadCount).toBe(2);
      expect(spawned).toHaveLength(3);
      // L'autre fil répond normalement.
      spawned[1].emit('message', { id: spawned[1].sent[0].id, card: null, cards: [], move: { from: 12, to: 28 } });
      await expect(p2).resolves.toMatchObject({ move: { from: 12, to: 28 } });
      // 'error' puis 'exit' du même fil : une seule perte.
      spawned[1].emit('error', new Error('mémoire'));
      spawned[1].emit('exit', 1);
      expect(spawned).toHaveLength(4);
      // Les remplaçants meurent en boucle : au-delà de BOT_THREADS.maxRestarts, plus de remplacement, puis calcul ici.
      const dead = new Set<FakeThread>([spawned[0], spawned[1]]);
      for (let k = 0; k < 20 && !pool.isInline; k++) {
        const t = spawned.find(x => !dead.has(x))!;
        dead.add(t);
        t.emit('exit', 1);
      }
      expect(spawned).toHaveLength(2 + BOT_THREADS.maxRestarts);
      expect(pool.isInline).toBe(true);
      vi.useRealTimers();
      const inline = await pool.decide(s, 1);
      expect(inline.move).not.toBeNull();
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  });
});

describe('résumé d’une partie enregistrée (GameSummary, summary.ts)', () => {
  const salle = (nom: string): RoomData =>
    JSON.parse(readFileSync(new URL(`./fixtures/v1/salles/${nom}.json`, import.meta.url), 'utf8')) as RoomData;
  const ligne = (data: unknown) => ({
    id: 'abc123', mode: 'invite', rated: false, status: 'ended', white_name: 'Aurore', black_name: 'Basile', white_rating: null,
    black_rating: null, winner: 'draw', reason: 'fifty', time_control: '5+0', created_at: new Date(T0), plies: 120, data,
  });
  it('au défaut (règles absentes ou égales à RULES_V1) : les mêmes champs qu’avant, sans « rules »', () => {
    const attendu = {
      id: 'abc123', mode: 'invite', rated: false, status: 'ended', white: 'Aurore', black: 'Basile', whiteRating: null,
      blackRating: null, winner: 'draw', reason: 'fifty', timeControl: '5+0', createdAt: new Date(T0).toISOString(), plies: 120,
    };
    for (const data of [salle('terminee-classee'), salle('pouvoirs-en-cours'), { state: { rules: RULES_V1 } }, {}, null]) {
      expect(JSON.stringify(toSummary(ligne(data)))).toBe(JSON.stringify(attendu));
    }
  });
  it('règles hors RULES_V1 : envoyées ; illisibles : absentes (le client suit alors RULES_V1)', () => {
    const r: Rules = { ...RULES_V1, fiftyHalfmoves: 150 };
    expect(toSummary(ligne({ state: { rules: r } })).rules).toEqual(r);
    expect(toSummary(ligne({ state: { rules: { ...RULES_V1, schema: 2 } } }))).not.toHaveProperty('rules');
    expect(toSummary(ligne({ state: { rules: { ...RULES_V1, cardsPerTurn: 9 } } }))).not.toHaveProperty('rules');
  });
});

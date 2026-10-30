// Tirage pondéré (R9) et parties au hasard : des centaines de parties avec des cartes au hasard, en vérifiant
// les invariants du moteur après chaque action.
import { describe, expect, it } from 'vitest';
import { CARDS, CardId, Catalog, cardsOf } from '../src/shared/cards';
import { Color, F_BLAST, F_PORTAL, F_RELAXED, opposite } from '../src/shared/chess';
import {
  GameState, cardOptions, cardPlayable, createGame, dealHands, legalMovesOf, modsFromEffects, playCard, playMove,
  sideInCheck,
} from '../src/shared/game';

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('tirage pondéré (R9)', () => {
  it('jamais deux Légendaires ni trois Climats dans une main ; fréquences proches de la table', () => {
    const rand = rng(7);
    const N = 40000;
    const seen: Partial<Record<CardId, number>> = {};
    for (let i = 0; i < N; i++) {
      const { w, b } = dealHands(true, false, rand, 'climats');
      for (const hand of [w, b]) {
        expect(new Set(hand).size).toBe(3);
        expect(hand.filter(id => CARDS[id].rarity === 'légendaire').length).toBeLessThanOrEqual(1);
        expect(hand.filter(id => CARDS[id].family === 'climat').length).toBeLessThanOrEqual(2);
      }
      for (const id of w) seen[id] = (seen[id] ?? 0) + 1;
    }
    // Table R9 (part des mains qui contiennent la carte, avec pendule et entre humains)
    const table: Record<string, number> = {
      ice_wall: 40, rift: 40, truce: 32, portals: 31, tide: 31, hourglass: 24, ice_age: 24, cavalcade: 24,
      blood_moon: 17, coronation: 17, deja_vu: 10, blast: 8,
    };
    for (const [id, pct] of Object.entries(table)) {
      expect(Math.abs(((seen[id as CardId] ?? 0) / N) * 100 - pct), id).toBeLessThan(2);
    }
  });

  it('Sablier fou exclu sans pendule et contre l’IA ; miroir ; catalogues Duel et sans cartes', () => {
    const rand = rng(11);
    for (let i = 0; i < 3000; i++) {
      expect(dealHands(true, false, rand, 'climats', { vsBot: true }).w).not.toContain('hourglass');
      expect(dealHands(false, false, rand, 'climats').b).not.toContain('hourglass');
      const m = dealHands(true, true, rand, 'climats');
      expect(m.b).toEqual(m.w);
      const d = dealHands(true, false, rand, 'duel');
      expect(d.w.every(id => CARDS[id].catalogs.includes('duel'))).toBe(true);
    }
    expect(dealHands(true, false, rand, 'aucune')).toEqual({ w: [], b: [] });
  });

  it('un générateur dégénéré donne quand même une main valide', () => {
    const { w } = dealHands(true, false, () => 0, 'climats');
    expect(w).toHaveLength(3);
    expect(w.filter(id => CARDS[id].family === 'climat').length).toBeLessThanOrEqual(2);
  });
});

/** Invariants d'un état de partie. */
function checkInvariants(s: GameState) {
  const kings: Record<Color, number> = { w: 0, b: 0 };
  for (const p of s.pos.board) if (p?.t === 'k') kings[p.c]++;
  expect(kings).toEqual({ w: 1, b: 1 });
  const blocked = modsFromEffects(s.effects).blocked;
  for (let i = 0; i < 64; i++) expect(blocked[i] && !!s.pos.board[i], `pièce sur une case bloquée ${i}`).toBe(false);
  const climates = s.effects.filter(e => CARDS[e.card].family === 'climat');
  expect(climates.filter(e => !e.pending).length).toBeLessThanOrEqual(1);
  expect(climates.filter(e => e.pending).length).toBeLessThanOrEqual(1);
  for (const e of s.effects) {
    expect(e.remaining).toBeGreaterThan(0);
    if (e.pending) expect([1, 2]).toContain(e.delay);
  }
  if (s.result) {
    if (s.result.reason === 'checkmate') {
      expect(s.result.winner).toBe(opposite(s.pos.turn));
      expect(sideInCheck(s)).toBe(true);
    }
    return;
  }
  // Le camp qui n'a pas le trait n'est jamais en échec (il pourrait être pris).
  expect(sideInCheck(s, opposite(s.pos.turn)), 'camp sans le trait en échec').toBe(false);
  // Le camp au trait a un coup, ou doit jouer une carte qui en redonne un.
  if (!legalMovesOf(s).length) {
    expect(s.cardPlayed).toBe(false);
    expect(s.hands[s.pos.turn].some((_, i) => cardPlayable(s, s.pos.turn, i))).toBe(true);
  }
}

function roundTrip(s: GameState) {
  const copy = JSON.parse(JSON.stringify(s)) as GameState;
  expect(copy).toEqual(s);
  expect(legalMovesOf(copy)).toEqual(legalMovesOf(s));
}

function randomTargets(s: GameState, me: Color, index: number, rand: () => number): number[] | null {
  const need = CARDS[s.hands[me][index].card!].targets;
  const out: number[] = [];
  for (let k = 0; k < need; k++) {
    const opts = cardOptions(s, me, index, out);
    if (!opts.length) return null;
    out.push(opts[Math.floor(rand() * opts.length)]);
  }
  return out;
}

/** Ce que les parties au hasard ont exercé : cartes jouées, coups particuliers. */
const stats = new Map<string, number>();
const bump = (k: string) => stats.set(k, (stats.get(k) ?? 0) + 1);

/** Une partie au hasard ; renvoie le nombre de cartes jouées. */
function randomGame(seed: number, catalog: Catalog, maxPlies: number): { cards: number; plies: number } {
  const rand = rng(seed);
  const timed = rand() < 0.6;
  const pool = cardsOf(catalog);
  const pick = () => Array.from({ length: 3 }, () => pool[Math.floor(rand() * pool.length)]);
  const hands = !pool.length || rand() < 0.5 ? dealHands(timed, rand() < 0.2, rand, catalog) : { w: pick(), b: pick() };
  let s = createGame(hands, timed, catalog);
  let cards = 0;
  const log: string[] = [];
  try {
    for (let step = 0; step < maxPlies * 2 && !s.result && s.ply < maxPlies; step++) {
      const me = s.pos.turn;
      const moves = legalMovesOf(s);
      if (!s.cardPlayed && (rand() < 0.3 || !moves.length)) {
        const free = s.hands[me].map((_, i) => i).filter(i => !s.hands[me][i].used);
        const order = free.sort(() => rand() - 0.5);
        for (const i of order) {
          const card = s.hands[me][i].card!;
          const targets = randomTargets(s, me, i, rand);
          if (!targets) continue;
          const r = playCard(s, me, i, targets, '');
          // Les cibles proposées par cardOptions sont toujours acceptées ; sans cible, cardPlayable dit vrai.
          if (CARDS[card].targets > 0 || cardPlayable(s, me, i)) expect(r.ok, `${card} ${targets} : ${r.ok ? '' : r.error}`).toBe(true);
          if (!r.ok) continue;
          log.push(`[${card} ${targets.join(',')}]`);
          bump(card);
          s = r.state;
          cards++;
          checkInvariants(s);
          break;
        }
        if (s.result || s.pos.turn !== me) continue;
      }
      const legal = legalMovesOf(s);
      if (!legal.length) {
        // Aucun coup : la partie n'est pas finie seulement si une carte peut sauver (et elle n'a pas été tirée).
        expect(s.cardPlayed).toBe(false);
        continue;
      }
      const m = legal[Math.floor(rand() * legal.length)];
      const r = playMove(s, m.from, m.to, m.promo);
      expect(r.ok, r.ok ? '' : r.error).toBe(true);
      if (!r.ok) break;
      log.push(r.info.san);
      if (m.flags & F_RELAXED) bump('relaxed');
      if (m.flags & F_PORTAL) bump('portal');
      if (m.flags & F_BLAST) bump('blast-capture');
      if (r.state.result) bump(r.state.result.reason);
      s = r.state;
      checkInvariants(s);
      if (s.ply % 8 === 0) roundTrip(s);
    }
    roundTrip(s);
  } catch (e) {
    throw new Error(`Partie ${catalog} n° ${seed} : ${(e as Error).message}\n${log.join(' ')}`);
  }
  return { cards, plies: s.ply };
}

describe('parties au hasard', () => {
  it('300 parties Climats : aucune exception, invariants tenus, état sérialisable', () => {
    let cards = 0;
    let plies = 0;
    for (let g = 1; g <= 300; g++) {
      const r = randomGame(1000 + g, 'climats', 90);
      cards += r.cards;
      plies += r.plies;
    }
    expect(cards).toBeGreaterThan(300);
    expect(plies).toBeGreaterThan(5000);
    // Toutes les cartes et les coups particuliers ont été exercés.
    for (const id of cardsOf('climats')) expect(stats.get(id) ?? 0, id).toBeGreaterThan(5);
    for (const k of ['relaxed', 'portal', 'blast-capture']) expect(stats.get(k) ?? 0, k).toBeGreaterThan(0);
    console.log(Object.fromEntries([...stats].sort()));
  }, 180_000);

  it('100 parties Duel et 30 sans cartes', () => {
    for (let g = 1; g <= 100; g++) randomGame(5000 + g, 'duel', 90);
    for (let g = 1; g <= 30; g++) randomGame(9000 + g, 'aucune', 120);
  }, 120_000);
});

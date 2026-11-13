// Fréquences du tirage des mains (dealHands, catalogue Pouvoirs) calculées par énumération exacte, au lieu d'une table
// recopiée à la main (ancienne table de climats-random.test.ts, valable pour 3 cartes, les poids 4/3/2/1 et R9
// seulement). Le tirage du moteur :
// - tirage pondéré sans remise (poids de la rareté), recommencé tant que la main est invalide (contraintes du tirage,
//   R9), au plus `redrawAttempts` fois ;
// - au-delà, tirage contraint carte par carte (les cartes qui rendraient la main invalide, ou impossible à compléter
//   jusqu'à n cartes, ou jusqu'à la plus grande main valide si la réserve n'en permet pas n, sont écartées du sac).
// La loi exacte d'une main H valide est donc : p(H) × (1 − q^A) / (1 − q) + q^A × c(H), où p est la loi du tirage
// pondéré, q la probabilité d'une main invalide, A le nombre d'essais et c la loi du tirage contraint.
// Les fréquences observées sur des dizaines de milliers de tirages doivent être à quelques écarts-types de la loi.
import { describe, expect, it } from 'vitest';
import { CARDS } from '../src/shared/cards';
import type { CardId, Rarity } from '../src/shared/cards';
import type { HandLimits } from '../src/shared/config/rules';
import { cardPool, dealHands } from '../src/shared/game';
import { mulberry32 } from './helpers/rng';

interface Tirage {
  pool: readonly CardId[];
  n: number;
  weights: Readonly<Record<Rarity, number>>;
  limits: HandLimits;
  attempts: number;
}

/** Une main respecte-t-elle les contraintes (au plus N cartes d'une famille ou d'une rareté) ? */
function valide(hand: readonly CardId[], l: HandLimits): boolean {
  const compte = (pred: (id: CardId) => boolean) => hand.filter(pred).length;
  for (const [f, max] of Object.entries(l.maxPerFamily)) if (max !== undefined && compte(id => CARDS[id].family === f) > max) return false;
  for (const [r, max] of Object.entries(l.maxPerRarity)) if (max !== undefined && compte(id => CARDS[id].rarity === r) > max) return false;
  return true;
}

const cle = (hand: readonly CardId[]) => [...hand].sort().join(',');

/**
 * Taille de la plus grande main valide de la réserve qui contient `hand`, par force brute sur les parties de la
 * réserve (indépendante de canComplete et completionTarget du moteur), mémorisée.
 */
function plusGrandeMain(t: Tirage, hand: readonly CardId[], memo: Map<string, number>): number {
  const k = cle(hand);
  const vu = memo.get(k);
  if (vu !== undefined) return vu;
  const reste = t.pool.filter(x => !hand.includes(x));
  let best = valide(hand, t.limits) ? hand.length : -1;
  for (let mask = 1; mask < 1 << reste.length; mask++) {
    const main = [...hand, ...reste.filter((_, i) => mask & (1 << i))];
    if (main.length > best && valide(main, t.limits)) best = main.length;
  }
  memo.set(k, best);
  return best;
}

/**
 * Loi des mains (clé : cartes triées) d'un tirage pondéré sans remise ; `contraint` : sac filtré après chaque carte,
 * on ne garde que les cartes après lesquelles la main reste valide et complétable jusqu'à la cible (n, ou la plus
 * grande main valide de la réserve si elle est plus petite).
 */
function loiPonderee(t: Tirage, contraint: boolean): Map<string, number> {
  const loi = new Map<string, number>();
  const w = (id: CardId) => t.weights[CARDS[id].rarity];
  const memo = new Map<string, number>();
  const cible = Math.min(t.n, plusGrandeMain(t, [], memo));
  const garde = (suite: CardId[], x: CardId) => plusGrandeMain(t, [...suite, x], memo) >= cible;
  const visiter = (hand: CardId[], bag: CardId[], p: number) => {
    if (hand.length === t.n || !bag.length) {
      loi.set(cle(hand), (loi.get(cle(hand)) ?? 0) + p);
      return;
    }
    const total = bag.reduce((s, id) => s + w(id), 0);
    for (const id of bag) {
      const suite = [...hand, id];
      let reste = bag.filter(x => x !== id);
      if (contraint) reste = reste.filter(x => garde(suite, x));
      visiter(suite, reste, (p * w(id)) / total);
    }
  };
  visiter([], contraint ? t.pool.filter(id => garde([], id)) : [...t.pool], 1);
  return loi;
}

/** Loi exacte des mains de dealHands (une main, le tirage d'un camp). */
function loiExacte(t: Tirage): Map<string, number> {
  const libre = loiPonderee(t, false);
  const contrainte = loiPonderee(t, true);
  let q = 0;
  for (const [k, p] of libre) if (!valide(k.split(',') as CardId[], t.limits)) q += p;
  const loi = new Map<string, number>();
  const essais = q === 1 ? 0 : (1 - q ** t.attempts) / (1 - q);
  for (const [k, p] of libre) if (valide(k.split(',') as CardId[], t.limits)) loi.set(k, p * essais);
  for (const [k, p] of contrainte) loi.set(k, (loi.get(k) ?? 0) + q ** t.attempts * p);
  return loi;
}

/** Probabilité que chaque carte soit dans la main. */
function frequences(loi: Map<string, number>): Map<CardId, number> {
  const out = new Map<CardId, number>();
  for (const [k, p] of loi) for (const id of k.split(',') as CardId[]) out.set(id, (out.get(id) ?? 0) + p);
  return out;
}

/** Mise en place du défaut (DEAL au lot 0b) : poids 4/3/2/1, au plus 1 Légendaire et 2 Climats, 64 essais. */
const DEFAUT = {
  n: 3,
  weights: { commune: 4, rare: 3, épique: 2, légendaire: 1 },
  limits: { maxPerRarity: { légendaire: 1 }, maxPerFamily: { climat: 2 } },
  attempts: 64,
} as const;

/** Tirages observés : part des mains (des Blancs) qui contiennent chaque carte. */
function observees(N: number, graine: number, tirer: (rand: () => number) => CardId[]): Map<CardId, number> {
  const rand = mulberry32(graine);
  const vu = new Map<CardId, number>();
  for (let i = 0; i < N; i++) for (const id of tirer(rand)) vu.set(id, (vu.get(id) ?? 0) + 1);
  return new Map([...vu].map(([id, c]) => [id, c / N]));
}

/** Chaque fréquence observée est à moins de 5 écarts-types de la loi exacte (et aucune carte inattendue). */
function compare(exacte: Map<CardId, number>, obs: Map<CardId, number>, N: number) {
  for (const id of obs.keys()) expect(exacte.has(id), id).toBe(true);
  for (const [id, p] of exacte) {
    const sigma = Math.sqrt((p * (1 - p)) / N);
    expect(Math.abs((obs.get(id) ?? 0) - p), `${id} : exacte ${(p * 100).toFixed(2)} %`).toBeLessThan(5 * sigma + 1e-9);
  }
}

describe('fréquences du tirage (énumération exacte)', () => {
  it('la loi exacte est une loi de probabilité, sur des mains valides seulement', () => {
    const loi = loiExacte({ ...DEFAUT, pool: cardPool('climats', true) });
    const total = [...loi.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 12);
    for (const k of loi.keys()) expect(valide(k.split(',') as CardId[], DEFAUT.limits), k).toBe(true);
  });

  it('avec pendule, entre humains : l’ancienne table (8 cartes, 3 par main) est retrouvée à 0,25 point près', () => {
    const f = frequences(loiExacte({ ...DEFAUT, pool: cardPool('climats', true) }));
    // Table estimée sur 400 000 tirages (écart-type d'environ 0,08 point) : elle n'est retrouvée qu'à 3 écarts-types.
    const ancienne: Record<string, number> = {
      ice_wall: 52.3, rift: 52.3, truce: 42.7, tide: 41.7, hourglass: 33.1, ice_age: 33.0, blood_moon: 22.4, blast: 22.5,
    };
    for (const [id, pct] of Object.entries(ancienne)) expect(Math.abs(f.get(id as CardId)! * 100 - pct), id).toBeLessThan(0.25);
  });

  for (const [nom, timed, vsBot] of [
    ['avec pendule, entre humains', true, false],
    ['sans pendule (accueil)', false, false],
    ['contre l’IA, avec pendule', true, true],
  ] as const) {
    it(`dealHands suit la loi exacte : ${nom}`, () => {
      const N = 30_000;
      const exacte = frequences(loiExacte({ ...DEFAUT, pool: cardPool('climats', timed, { vsBot }) }));
      const obs = observees(N, 17 + Number(timed) * 2 + Number(vsBot), rand => dealHands(timed, rand, 'climats', { vsBot }).w);
      compare(exacte, obs, N);
    });
  }

  it('autres réglages : 5 cartes par main, autres poids, autres contraintes, impasses (le tirage lit les règles et DEAL donnés)', () => {
    const pool = cardPool('climats', true);
    const autres: (Omit<Tirage, 'pool'> & { N?: number })[] = [
      { ...DEFAUT, n: 5 },
      { ...DEFAUT, n: 2, weights: { commune: 1, rare: 2, épique: 5, légendaire: 1 } },
      { ...DEFAUT, n: 3, limits: { maxPerRarity: { rare: 1 }, maxPerFamily: { climat: 1 } }, attempts: 2 },
      // Impasses possibles (une Rare climatique d'abord ne laisse que 4 cartes) : le tirage contraint les évite. Tirage
      // contraint une fois sur deux, plus coûteux : moins de tirages observés.
      { ...DEFAUT, n: 5, limits: { maxPerRarity: { rare: 1 }, maxPerFamily: { climat: 2 } }, attempts: 1, N: 8_000 },
    ];
    for (const [i, t] of autres.entries()) {
      const N = t.N ?? 20_000;
      const exacte = frequences(loiExacte({ ...t, pool }));
      const deal = { handLimits: t.limits, rarityWeight: t.weights, redrawAttempts: t.attempts };
      const obs = observees(N, 101 + i, rand => dealHands(true, rand, 'climats', { rules: { cardsPerPlayer: t.n }, deal }).w);
      compare(exacte, obs, N);
    }
  }, 60_000);
});

// Tableau de bord des réglages (src/shared/config) et règles d'une partie (src/shared/rules.ts) : valeurs par
// défaut, configurations impossibles refusées avec une phrase claire, règles historiques figées.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { CARDS, RARITY_WEIGHT, cardsOf } from '../src/shared/cards';
import type { CardId } from '../src/shared/cards';
import {
  BOUNDS, DEAL, GAME_RULES, RULES_BY_CONTEXT, RULES_CONTEXTS, RULES_V1, SUSPENDED_CARDS,
} from '../src/shared/config/rules';
import type { Rules } from '../src/shared/config/rules';
import { CARDS_PER_PLAYER, DRAFT_MS, cardPool, createGame } from '../src/shared/game';
import {
  basicFenError, cardEndsTurn, castsLeft, checkRules, maxValidHand, parseRules, poolOf, rulesFor, rulesOf, rulesSummary,
  sameRules, setRulesOverride, stampRules, tuneOf, validHand,
} from '../src/shared/rules';

afterEach(() => setRulesOverride(null));

const RESERVES = [
  { timed: true, vsBot: false },
  { timed: false, vsBot: false },
  { timed: true, vsBot: true },
  { timed: false, vsBot: true },
];

/** Plus grande main valide par énumération de toutes les sous-parties (référence de maxValidHand). */
function bruteMax(pool: readonly CardId[], ok: (h: CardId[]) => boolean): number {
  let best = 0;
  for (let mask = 0; mask < 1 << pool.length; mask++) {
    const hand = pool.filter((_, i) => mask & (1 << i));
    if (hand.length > best && ok(hand)) best = hand.length;
  }
  return best;
}

/** R9 telle que game.ts l'écrit aujourd'hui (validClimatsHand) : au plus 1 Légendaire et 2 Climats. */
const r9Actuelle = (hand: CardId[]) =>
  hand.filter(id => CARDS[id].rarity === 'légendaire').length <= 1 && hand.filter(id => CARDS[id].family === 'climat').length <= 2;

describe('valeurs par défaut', () => {
  it('GAME_RULES, DEAL et les alias du moteur', () => {
    expect(GAME_RULES).toEqual({
      cardsPerPlayer: 3, cardsPerTurn: 1, cardEndsTurn: false, handsVisible: true, presageDelay: 2, fiftyHalfmoves: 100,
      repetitions: 3, startFen: null,
    });
    expect(CARDS_PER_PLAYER).toBe(3);
    expect(DRAFT_MS).toBe(45_000);
    expect(DEAL.draft).toBe(true);
    expect(DEAL.draftMs).toBe(45_000);
    expect(DEAL.handLimits).toEqual({ maxPerRarity: { légendaire: 1 }, maxPerFamily: { climat: 2 } });
    expect(DEAL.limitsInDraft).toBe(false);
    expect(DEAL.rarityWeight).toEqual(RARITY_WEIGHT);
    expect(DEAL.redrawAttempts).toBe(64);
    expect(RULES_BY_CONTEXT).toEqual({});
    expect(SUSPENDED_CARDS).toEqual([]);
    expect(BOUNDS).toEqual({ cardsPerPlayer: [1, 6], cardsPerTurn: [1, 3], presageDelay: [2, 6] });
  });
  it('les réglages sont gelés', () => {
    expect(Object.isFrozen(GAME_RULES)).toBe(true);
    expect(Object.isFrozen(DEAL.handLimits.maxPerFamily)).toBe(true);
    expect(() => {
      (RULES_V1.tuning.rift!.ranks as number[]).push(5);
    }).toThrow();
  });
  it('checkRules : aucune erreur au défaut', () => {
    expect(checkRules()).toEqual([]);
  });
});

describe('RULES_V1, figé pour toujours', () => {
  it('égal à test/fixtures/rules-v1.json', () => {
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/rules-v1.json', import.meta.url), 'utf8'));
    expect(RULES_V1).toEqual(fixture);
    expect(JSON.parse(JSON.stringify(RULES_V1))).toEqual(fixture);
  });
  it('rulesFor(ctx) égal à RULES_V1 dans chaque contexte, et rien à écrire dans la partie', () => {
    for (const ctx of RULES_CONTEXTS) {
      expect(rulesFor(ctx), ctx).toEqual(RULES_V1);
      expect(rulesFor(ctx), ctx).toBe(RULES_V1);
      expect(stampRules(rulesFor(ctx)), ctx).toBeUndefined();
    }
  });
  it('équilibrage de RULES_V1 = celui de CARDS aujourd’hui', () => {
    for (const id of cardsOf('climats')) {
      const d = CARDS[id];
      const t = RULES_V1.tuning[id] ?? {};
      expect(t.coups, id).toBe(d.coups);
      expect(t.ranks, id).toEqual(d.ranks);
      expect(t.clockRate, id).toBe(d.clockRate);
    }
  });
  it('rulesOf : RULES_V1 pour une partie sans règles, comme celles créées aujourd’hui', () => {
    const s = createGame({ w: ['truce'], b: ['rift'] }, true, 'climats');
    expect('rules' in s).toBe(false);
    expect('cardsThisTurn' in s).toBe(false);
    expect(rulesOf(s)).toBe(RULES_V1);
  });
});

describe('rulesFor, stampRules, sameRules', () => {
  it('mémorisé et gelé', () => {
    expect(rulesFor('ia')).toBe(rulesFor('ia'));
    expect(Object.isFrozen(rulesFor('ia'))).toBe(true);
  });
  it('sameRules : égalité de valeur, ordre des clés indifférent', () => {
    const copie = JSON.parse(JSON.stringify(RULES_V1)) as Rules;
    expect(sameRules(copie, RULES_V1)).toBe(true);
    const melange = { ...copie, tuning: Object.fromEntries(Object.entries(copie.tuning).reverse()) } as Rules;
    expect(sameRules(melange, RULES_V1)).toBe(true);
    expect(sameRules({ ...copie, cardsPerPlayer: 5 }, RULES_V1)).toBe(false);
    expect(sameRules({ ...copie, tuning: { ...copie.tuning, rift: { coups: 6, ranks: [3, 4] } } }, RULES_V1)).toBe(false);
  });
  it('surcharge de test : de nouvelles règles, écrites dans la partie', () => {
    setRulesOverride({ cardsPerPlayer: 5 });
    const r = rulesFor('amicale');
    expect(r.cardsPerPlayer).toBe(5);
    expect(r.tuning).toEqual(RULES_V1.tuning);
    expect(stampRules(r)).toBe(r);
    expect(checkRules()).toEqual([]);
    setRulesOverride(null);
    expect(rulesFor('amicale')).toBe(RULES_V1);
  });
  it('surcharge de test refusée en production', () => {
    const avant = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => setRulesOverride({ cardsPerPlayer: 5 })).toThrow(/production/);
      expect(() => setRulesOverride(null)).not.toThrow();
    } finally {
      process.env.NODE_ENV = avant;
    }
  });
  it('parseRules : forme connue, sinon null', () => {
    expect(parseRules(JSON.parse(JSON.stringify(RULES_V1)))).toBe(RULES_V1);
    const cinq = parseRules({ ...JSON.parse(JSON.stringify(RULES_V1)), cardsPerPlayer: 5 });
    expect(cinq?.cardsPerPlayer).toBe(5);
    expect(Object.isFrozen(cinq)).toBe(true);
    expect(parseRules({ ...RULES_V1, schema: 2 })).toBeNull();
    expect(parseRules({ ...RULES_V1, cardsPerPlayer: '3' })).toBeNull();
    expect(parseRules(null)).toBeNull();
  });
  it('résumé pour le journal du serveur', () => {
    expect(rulesSummary(RULES_V1)).toMatch(/^3 cartes par joueur, 1 par tour, avant le coup, mains visibles/);
  });
});

describe('lecture des règles par le moteur', () => {
  it('tuneOf : équilibrage de la partie, sinon celui de CARDS', () => {
    const s = createGame({ w: [], b: [] }, true, 'climats');
    expect(tuneOf(s, 'hourglass')).toEqual({ coups: 6, clockRate: 2 });
    expect(tuneOf(s, 'ice_wall')).toEqual({ ranks: [2, 3, 4, 5] });
    expect(tuneOf(s, 'freeze')).toEqual({});
    const autres = { ...s, rules: { ...RULES_V1, tuning: { ...RULES_V1.tuning, rift: { coups: 6, ranks: [2, 5] } } } };
    expect(tuneOf(autres, 'rift')).toEqual({ coups: 6, ranks: [2, 5] });
  });
  it('castsLeft : 1 avant la carte, 0 après ; compteur pour plusieurs cartes par tour', () => {
    expect(castsLeft({ cardPlayed: false })).toBe(1);
    expect(castsLeft({ cardPlayed: true })).toBe(0);
    const deux = { ...RULES_V1, cardsPerTurn: 2 };
    expect(castsLeft({ cardPlayed: false, rules: deux })).toBe(2);
    expect(castsLeft({ cardPlayed: false, cardsThisTurn: 1, rules: deux })).toBe(1);
    expect(castsLeft({ cardPlayed: true, cardsThisTurn: 2, rules: deux })).toBe(0);
  });
  it('cardEndsTurn : le Rituel toujours, toute carte si la règle le dit', () => {
    expect(cardEndsTurn(CARDS.tide, RULES_V1)).toBe(true);
    expect(cardEndsTurn(CARDS.truce, RULES_V1)).toBe(false);
    expect(cardEndsTurn(CARDS.truce, { cardEndsTurn: true })).toBe(true);
  });
});

describe('réserves et contraintes du tirage', () => {
  it('poolOf égale cardPool (game.ts) au défaut', () => {
    for (const c of ['climats', 'duel', 'aucune'] as const) {
      for (const r of RESERVES) expect(poolOf(c, r), `${c} ${JSON.stringify(r)}`).toEqual(cardPool(c, r.timed, { vsBot: r.vsBot }));
    }
  });
  it('validHand(DEAL.handLimits) = R9 actuelle, pour toutes les mains des Pouvoirs', () => {
    const all = cardsOf('climats');
    for (let mask = 0; mask < 1 << all.length; mask++) {
      const hand = all.filter((_, i) => mask & (1 << i));
      expect(validHand(hand, DEAL.handLimits), hand.join(',')).toBe(r9Actuelle(hand));
    }
  });
  it('maxValidHand vaut 5 pour chaque réserve des Pouvoirs (énumération exacte)', () => {
    for (const r of RESERVES) {
      const pool = poolOf('climats', r);
      expect(maxValidHand(pool, DEAL.handLimits), JSON.stringify(r)).toBe(5);
      expect(bruteMax(pool, h => validHand(h, DEAL.handLimits))).toBe(5);
    }
  });
  it('maxValidHand = énumération, sous d’autres contraintes et réserves', () => {
    const limites = [
      { maxPerRarity: {}, maxPerFamily: {} },
      { maxPerRarity: { légendaire: 0 }, maxPerFamily: {} },
      { maxPerRarity: { commune: 1, rare: 1 }, maxPerFamily: { climat: 1, terrain: 1 } },
      { maxPerRarity: { légendaire: 1, épique: 1 }, maxPerFamily: { climat: 3, duel: 4 } },
    ];
    const reserves = [cardsOf('climats'), cardsOf('duel'), [...cardsOf('climats').slice(0, 4), ...cardsOf('duel').slice(0, 5)]];
    for (const l of limites) {
      for (const pool of reserves) expect(maxValidHand(pool, l)).toBe(bruteMax(pool, h => validHand(h, l)));
    }
  });
});

describe('configurations impossibles', () => {
  it('6 cartes : main valide maximale 5 à l’accueil (tirage)', () => {
    expect(checkRules({ game: { ...GAME_RULES, cardsPerPlayer: 6 } })).toEqual([
      "6 cartes par joueur à l'accueil : impossible avec au plus 2 Climats, la réserve n'a que 3 cartes qui ne sont pas des Climats (main valide maximale : 5). Relevez DEAL.handLimits.maxPerFamily.climat, ou réglez RULES_BY_CONTEXT.accueil.",
    ]);
  });
  it('6 cartes avec le tirage partout : chaque contexte refuse', () => {
    const e = checkRules({ game: { ...GAME_RULES, cardsPerPlayer: 6 }, deal: { ...DEAL, draft: false } });
    for (const ctx of ['en partie classée', 'en partie amicale', 'en invitation', "contre l'IA", "à l'accueil"]) {
      expect(e.some(m => m.startsWith(`6 cartes par joueur ${ctx} : impossible avec au plus 2 Climats`)), ctx).toBe(true);
    }
  });
  it('6 cartes : possible si R9 est relevée', () => {
    expect(checkRules({ game: { ...GAME_RULES, cardsPerPlayer: 6 }, deal: { ...DEAL, handLimits: { maxPerRarity: {}, maxPerFamily: { climat: 3 } } } })).toEqual([]);
  });
  it('8 cartes en choix contre l’IA : la réserve n’a que 7 cartes', () => {
    const e = checkRules({ byContext: { ia: { cardsPerPlayer: 8 } } });
    expect(e).toContain("8 cartes par joueur contre l'IA : la réserve n'a que 7 cartes (hors Sablier fou). Baissez RULES_BY_CONTEXT.ia.cardsPerPlayer.");
    expect(e).toContain('RULES_BY_CONTEXT.ia.cardsPerPlayer vaut 8 : hors des bornes (1 à 6, BOUNDS).');
  });
  it('délai du Présage impair', () => {
    expect(checkRules({ game: { ...GAME_RULES, presageDelay: 3 } })).toEqual([
      "GAME_RULES.presageDelay vaut 3 : il doit être pair (un Présage arrive au début d'un tour de son lanceur).",
    ]);
  });
  it('la carte remplace le coup avec 2 cartes par tour', () => {
    expect(checkRules({ game: { ...GAME_RULES, cardsPerTurn: 2, cardEndsTurn: true } })).toEqual([
      'GAME_RULES.cardEndsTurn (la carte remplace le coup) impose 1 carte par tour, mais GAME_RULES.cardsPerTurn vaut 2.',
    ]);
  });
  it('mains cachées', () => {
    expect(checkRules({ game: { ...GAME_RULES, handsVisible: false } })).toEqual([
      'GAME_RULES.handsVisible vaut false : les mains cachées ne sont pas encore prises en charge.',
    ]);
  });
  it('plus de cartes par tour que de cartes en main', () => {
    expect(checkRules({ game: { ...GAME_RULES, cardsPerPlayer: 1, cardsPerTurn: 2 } })[0]).toBe("GAME_RULES.cardsPerTurn vaut 2 : une main n'a que 1 carte en partie classée.");
  });
  it('position de départ : roque standard seulement', () => {
    expect(checkRules({ game: { ...GAME_RULES, startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' } })).toEqual([]);
    expect(checkRules({ game: { ...GAME_RULES, startFen: '4k3/8/8/8/8/8/8/4K2R w Kq - 0 1' } })[0]).toMatch(/^GAME_RULES\.startFen : FEN invalide : un droit de roque/);
    expect(basicFenError('8/8/8/8/8/8/8/8 w - - 0 1')).toMatch(/un roi de chaque camp/);
    expect(basicFenError('pas un fen')).not.toBeNull();
  });
  it('équilibrage, cartes suspendues, mise en place', () => {
    expect(checkRules({ tuning: { ...RULES_V1.tuning, rift: { coups: 4, ranks: [3, 8] } } })[0]).toMatch(/^CARDS\.rift\.ranks/);
    expect(checkRules({ suspended: ['inconnue' as CardId] })[0]).toMatch(/^SUSPENDED_CARDS/);
    expect(checkRules({ deal: { ...DEAL, draftMs: 0 } })[0]).toMatch(/^DEAL\.draftMs/);
  });
  it('une carte suspendue rétrécit la réserve', () => {
    expect(poolOf('climats', { timed: true }, ['blast'])).not.toContain('blast');
    const e = checkRules({ suspended: ['blast', 'truce', 'rift', 'tide', 'ice_wall'] });
    expect(e.some(m => m.includes("la réserve n'a que 2 cartes"))).toBe(true);
  });
  it('une valeur absente d’un contexte ne remplace rien', () => {
    expect(checkRules({ byContext: { ia: { cardsPerPlayer: undefined } } })).toEqual([]);
  });
  it('la surcharge de test est vérifiée comme le reste', () => {
    setRulesOverride({ presageDelay: 5 });
    expect(checkRules()).toEqual([
      "SPELLMATE_TEST_RULES.presageDelay vaut 5 : il doit être pair (un Présage arrive au début d'un tour de son lanceur).",
    ]);
  });
});

// Tableau de bord des réglages (src/shared/config) et règles d'une partie (src/shared/rules.ts) : configurations
// impossibles refusées avec une phrase claire, règles historiques figées, lecture des règles par le moteur.
//
// Les cas partent d'une configuration FIGÉE (V1 et DEAL_V1 ci-dessous, celles de RULES_V1 et de la conception),
// jamais des réglages du jour : changer GAME_RULES ou DEAL ne fait pas échouer ce fichier. Les valeurs par défaut
// elles-mêmes sont gardées par test/garde-fous/defauts.test.ts.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { CARD_IDS, CARDS, cardsOf } from '../src/shared/cards';
import type { CardId } from '../src/shared/cards';
import {
  DEAL, GAME_RULES, RULES_BY_CONTEXT, RULES_CONTEXTS, RULES_V1, SUSPENDED_CARDS, deepFreeze,
} from '../src/shared/config/rules';
import type { CardTuning, DealSettings, GameRulesSettings, Rules } from '../src/shared/config/rules';
import { cardPool, createGame } from '../src/shared/game';
import { validateFen } from '../src/shared/pgn';
import {
  basicFenError, cardEndsTurn, castsLeft, checkRules, maxValidHand, parseRules, poolOf, rulesFor, rulesOf, rulesSummary,
  sameRules, setRulesOverride, settingsErrors, stampRules, tuneOf, validHand,
} from '../src/shared/rules';
import type { RulesConfig } from '../src/shared/rules';

afterEach(() => setRulesOverride(null));

/** Réglages de RULES_V1 (sans schéma ni équilibrage) : base figée des cas de ce fichier. */
const V1: GameRulesSettings = Object.freeze({
  cardsPerPlayer: 3, cardsPerTurn: 1, cardEndsTurn: false, handsVisible: true, presageDelay: 2, fiftyHalfmoves: 100,
  repetitions: 3, startFen: null,
});
/** Mise en place de la conception (choix des cartes en 45 s, R9 : au plus 1 Légendaire et 2 Climats). */
const DEAL_V1: DealSettings = deepFreeze({
  draft: true, draftMs: 45_000, handLimits: { maxPerRarity: { légendaire: 1 }, maxPerFamily: { climat: 2 } },
  limitsInDraft: false, rarityWeight: { commune: 4, rare: 3, épique: 2, légendaire: 1 }, redrawAttempts: 64,
});
/** Ce qui ne vient pas des réglages de règles, figé aussi : aucun contexte particulier, aucune carte suspendue. */
const FIGE: RulesConfig = { byContext: {}, deal: DEAL_V1, suspended: [], tuning: RULES_V1.tuning };
/** checkRules sur la configuration figée, avec des changements. */
const verifie = (p: RulesConfig = {}) => checkRules({ game: V1, ...FIGE, ...p });

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

/** Équilibrage lu dans CARDS, comme rulesFor le copie dans les règles d'une nouvelle partie. */
function tuningDeCards(): Partial<Record<CardId, CardTuning>> {
  const out: Partial<Record<CardId, CardTuning>> = {};
  for (const id of CARD_IDS) {
    const { coups, ranks, clockRate } = CARDS[id];
    const t: CardTuning = {};
    if (coups !== undefined) t.coups = coups;
    if (ranks !== undefined) t.ranks = ranks;
    if (clockRate !== undefined) t.clockRate = clockRate;
    if (Object.keys(t).length) out[id] = t;
  }
  return out;
}

describe('configuration du jour', () => {
  it('checkRules : aucune erreur (la configuration livrée est jouable)', () => {
    expect(checkRules()).toEqual([]);
  });
  it('base figée de ce fichier = RULES_V1', () => {
    const { schema, tuning, ...reglages } = RULES_V1;
    expect(schema).toBe(1);
    expect(tuning).toBeDefined();
    expect(reglages).toEqual(V1);
  });
  it('les réglages sont gelés', () => {
    expect(Object.isFrozen(GAME_RULES)).toBe(true);
    expect(Object.isFrozen(RULES_BY_CONTEXT)).toBe(true);
    expect(Object.isFrozen(SUSPENDED_CARDS)).toBe(true);
    expect(Object.isFrozen(DEAL.handLimits.maxPerFamily)).toBe(true);
    expect(() => {
      (RULES_V1.tuning.rift!.ranks as number[]).push(5);
    }).toThrow();
  });
  it('deepFreeze gèle aussi les enfants d’un objet déjà gelé en surface', () => {
    const o = deepFreeze(Object.freeze({ a: { b: 1 }, l: [1, 2] }));
    expect(Object.isFrozen(o.a)).toBe(true);
    expect(Object.isFrozen(o.l)).toBe(true);
    const cycle: { self?: unknown; x: { y: number } } = { x: { y: 1 } };
    cycle.self = cycle;
    expect(() => deepFreeze(cycle)).not.toThrow();
    expect(Object.isFrozen(cycle.x)).toBe(true);
  });
});

describe('RULES_V1, figé pour toujours', () => {
  it('égal à test/fixtures/rules-v1.json', () => {
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/rules-v1.json', import.meta.url), 'utf8'));
    expect(RULES_V1).toEqual(fixture);
    expect(JSON.parse(JSON.stringify(RULES_V1))).toEqual(fixture);
  });
  it('rulesFor(ctx) : RULES_V1 lui-même si les règles du contexte valent V1, sinon des règles écrites dans la partie', () => {
    for (const ctx of RULES_CONTEXTS) {
      const r = rulesFor(ctx);
      if (sameRules(r, RULES_V1)) {
        expect(r, ctx).toBe(RULES_V1);
        expect(stampRules(r), ctx).toBeUndefined();
      } else {
        expect(stampRules(r), ctx).toBe(r);
      }
    }
  });
  it('réglages V1 imposés (surcharge) : les règles de chaque contexte ont les valeurs V1 et l’équilibrage de CARDS', () => {
    setRulesOverride(V1);
    for (const ctx of RULES_CONTEXTS) {
      const r = rulesFor(ctx);
      expect(r, ctx).toMatchObject(V1);
      expect(r.tuning, ctx).toEqual(tuningDeCards());
      expect(stampRules(r), ctx).toBe(sameRules(r, RULES_V1) ? undefined : r);
    }
  });
  it('rulesOf : RULES_V1 pour une partie sans règles ; rien d’écrit dans la partie si les règles du jour valent V1', () => {
    const s = createGame({ w: ['truce'], b: ['rift'] }, true, 'climats');
    expect(rulesOf({ ...s, rules: undefined })).toBe(RULES_V1);
    expect(rulesOf(s)).toBe(s.rules ?? RULES_V1);
    if (RULES_CONTEXTS.every(ctx => rulesFor(ctx) === RULES_V1)) {
      expect('rules' in s).toBe(false);
      expect('cardsThisTurn' in s).toBe(false);
    }
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
    const avant = rulesFor('amicale');
    setRulesOverride({ ...V1, cardsPerPlayer: 5 });
    const r = rulesFor('amicale');
    expect(r.cardsPerPlayer).toBe(5);
    expect(r.cardsPerTurn).toBe(1);
    expect(r.tuning).toEqual(tuningDeCards());
    expect(stampRules(r)).toBe(r);
    expect(checkRules({ ...FIGE })).toEqual([]);
    setRulesOverride(null);
    expect(sameRules(rulesFor('amicale'), avant)).toBe(true);
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
    expect(parseRules({ ...RULES_V1, inconnu: 1 })).toBeNull();
    expect(parseRules({ ...RULES_V1, tuning: { truce: { coups: 3, vitesse: 2 } } })).toBeNull();
    expect(parseRules(null)).toBeNull();
    expect(parseRules([])).toBeNull();
  });
  it('parseRules : valeurs forgées refusées (elles bloqueraient la partie ou l’onglet)', () => {
    const base = JSON.parse(JSON.stringify(RULES_V1)) as Rules;
    const forges: Partial<Record<keyof Rules, unknown>>[] = [
      { presageDelay: 1e9 },
      { presageDelay: 3 },
      { cardsPerPlayer: 1000, cardsPerTurn: 0 },
      { cardsPerTurn: 2, cardEndsTurn: true },
      { fiftyHalfmoves: 0, repetitions: 0 },
      { handsVisible: false },
      { startFen: 'n importe quoi' },
      { startFen: '4k3/8/8/8/8/8/4R3/4K3 w - - 0 1' },
      { tuning: { ...base.tuning, hourglass: { coups: -5, clockRate: -1 } } },
      { tuning: { ...base.tuning, rift: { coups: 4, ranks: [99] } } },
      { tuning: { ...base.tuning, rift: { coups: 4, ranks: [] } } },
      { tuning: { ...base.tuning, hourglass: { coups: 6, clockRate: Infinity } } },
    ];
    for (const f of forges) expect(parseRules({ ...base, ...f }), JSON.stringify(f)).toBeNull();
    expect(parseRules({ ...base, startFen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1' })?.startFen).toBe('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  });
  it('résumé pour le journal du serveur', () => {
    expect(rulesSummary(RULES_V1)).toMatch(/^3 cartes par joueur, 1 par tour, avant le coup, mains visibles/);
    expect(rulesSummary({ ...RULES_V1, cardsPerPlayer: 1 })).toMatch(/^1 carte par joueur, /);
    // Mise en place : DEAL par défaut, celle du serveur sinon (dealSettings, surcharge de test comprise). Au défaut,
    // « en 45 s » ; sinon, la durée de DEAL (ou le tirage).
    const choix = DEAL.draft && DEAL.draftMs === DEAL_V1.draftMs ? /, choix des cartes en 45 s$/
      : DEAL.draft ? new RegExp(`, choix des cartes en ${DEAL.draftMs / 1000} s$`) : /, choix des cartes remplacé par le tirage$/;
    expect(rulesSummary(RULES_V1)).toMatch(choix);
    expect(rulesSummary(RULES_V1, { ...DEAL, draftMs: 30_000 })).toMatch(/, choix des cartes en 30 s$/);
    expect(rulesSummary(RULES_V1, { ...DEAL, draft: false })).toMatch(/, choix des cartes remplacé par le tirage$/);
  });
});

describe('lecture des règles par le moteur', () => {
  it('tuneOf : équilibrage de la partie, sinon celui de CARDS', () => {
    const s = { ...createGame({ w: [], b: [] }, true, 'climats'), rules: undefined };
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
  it('poolOf égale cardPool (game.ts), cartes suspendues retirées', () => {
    for (const c of ['climats', 'duel', 'aucune'] as const) {
      for (const r of RESERVES) {
        const attendu = cardPool(c, r.timed, { vsBot: r.vsBot }).filter(id => !SUSPENDED_CARDS.includes(id));
        expect(poolOf(c, r), `${c} ${JSON.stringify(r)}`).toEqual(attendu);
      }
    }
  });
  it('validHand(R9) = R9 actuelle, pour toutes les mains des Pouvoirs', () => {
    const all = cardsOf('climats');
    for (let mask = 0; mask < 1 << all.length; mask++) {
      const hand = all.filter((_, i) => mask & (1 << i));
      expect(validHand(hand, DEAL_V1.handLimits), hand.join(',')).toBe(r9Actuelle(hand));
    }
  });
  it('maxValidHand vaut 5 pour chaque réserve des Pouvoirs (énumération exacte)', () => {
    for (const r of RESERVES) {
      const pool = poolOf('climats', r, []);
      expect(maxValidHand(pool, DEAL_V1.handLimits), JSON.stringify(r)).toBe(5);
      expect(bruteMax(pool, h => validHand(h, DEAL_V1.handLimits))).toBe(5);
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
    expect(verifie({ game: { ...V1, cardsPerPlayer: 6 } })).toEqual([
      "6 cartes par joueur à l'accueil : impossible avec au plus 2 Climats, la réserve n'a que 3 cartes qui ne sont pas des Climats (main valide maximale : 5). Relevez DEAL.handLimits.maxPerFamily.climat, ou réglez RULES_BY_CONTEXT.accueil.",
    ]);
  });
  it('6 cartes avec le tirage partout : chaque contexte refuse', () => {
    const e = verifie({ game: { ...V1, cardsPerPlayer: 6 }, deal: { ...DEAL_V1, draft: false } });
    for (const ctx of ['en partie classée', 'en partie amicale', 'en invitation', "contre l'IA", "à l'accueil"]) {
      expect(e.some(m => m.startsWith(`6 cartes par joueur ${ctx} : impossible avec au plus 2 Climats`)), ctx).toBe(true);
    }
  });
  it('6 cartes : possible si R9 est relevée', () => {
    expect(verifie({ game: { ...V1, cardsPerPlayer: 6 }, deal: { ...DEAL_V1, handLimits: { maxPerRarity: {}, maxPerFamily: { climat: 3 } } } })).toEqual([]);
  });
  it('R9 à zéro : « sans aucun Climat »', () => {
    expect(verifie({ game: { ...V1, cardsPerPlayer: 4 }, deal: { ...DEAL_V1, handLimits: { maxPerRarity: {}, maxPerFamily: { climat: 0 } } } })).toEqual([
      "4 cartes par joueur à l'accueil : impossible sans aucun Climat, la réserve n'a que 3 cartes qui ne sont pas des Climats (main valide maximale : 3). Relevez DEAL.handLimits.maxPerFamily.climat, ou réglez RULES_BY_CONTEXT.accueil.",
    ]);
  });
  it('8 cartes en choix contre l’IA : la réserve n’a que 7 cartes', () => {
    const e = verifie({ byContext: { ia: { cardsPerPlayer: 8 } } });
    expect(e).toContain("8 cartes par joueur contre l'IA : la réserve n'a que 7 cartes (hors Sablier fou). Baissez RULES_BY_CONTEXT.ia.cardsPerPlayer.");
    expect(e).toContain('RULES_BY_CONTEXT.ia.cardsPerPlayer vaut 8 : hors des bornes (1 à 6, BOUNDS).');
  });
  it('délai du Présage impair', () => {
    expect(verifie({ game: { ...V1, presageDelay: 3 } })).toEqual([
      "GAME_RULES.presageDelay vaut 3 : il doit être pair (un Présage arrive au début d'un tour de son lanceur).",
    ]);
  });
  it('la carte remplace le coup avec 2 cartes par tour', () => {
    expect(verifie({ game: { ...V1, cardsPerTurn: 2, cardEndsTurn: true } })).toEqual([
      'GAME_RULES.cardEndsTurn (la carte remplace le coup) impose 1 carte par tour, mais GAME_RULES.cardsPerTurn vaut 2.',
    ]);
  });
  it('mains cachées', () => {
    expect(verifie({ game: { ...V1, handsVisible: false } })).toEqual([
      'GAME_RULES.handsVisible vaut false : les mains cachées ne sont pas encore prises en charge.',
    ]);
  });
  it('plus de cartes par tour que de cartes en main : une seule phrase si le réglage vaut partout', () => {
    expect(verifie({ game: { ...V1, cardsPerPlayer: 1, cardsPerTurn: 2 } })).toEqual([
      "GAME_RULES.cardsPerTurn vaut 2 : une main n'a qu'une carte (GAME_RULES.cardsPerPlayer).",
    ]);
    expect(verifie({ game: { ...V1, cardsPerTurn: 4 } })).toEqual([
      'GAME_RULES.cardsPerTurn vaut 4 : hors des bornes (1 à 3, BOUNDS).',
      "GAME_RULES.cardsPerTurn vaut 4 : une main n'a que 3 cartes (GAME_RULES.cardsPerPlayer).",
    ]);
  });
  it('plus de cartes par tour que de cartes en main, dans un seul contexte', () => {
    expect(verifie({ byContext: { amicale: { cardsPerTurn: 3, cardsPerPlayer: 2 } } })).toEqual([
      "RULES_BY_CONTEXT.amicale.cardsPerTurn vaut 3 : une main n'a que 2 cartes en partie amicale (RULES_BY_CONTEXT.amicale.cardsPerPlayer).",
    ]);
  });
  it('position de départ : vérification complète, roque standard seulement', () => {
    expect(verifie({ game: { ...V1, startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' } })).toEqual([]);
    expect(verifie({ game: { ...V1, startFen: '4k3/8/8/8/8/8/8/4K2R w Kq - 0 1' } })).toEqual([
      'GAME_RULES.startFen : Grand roque noir impossible dans cette position (roque standard seulement : roi en e1 ou e8, tour dans le coin).',
    ]);
    expect(verifie({ game: { ...V1, startFen: '4k3/8/8/8/8/8/8/P3K3 w - - 0 1' } })).toEqual([
      'GAME_RULES.startFen : Un pion ne peut pas se trouver sur la première ou la dernière rangée.',
    ]);
    // Mêmes contrôles et mêmes phrases que validateFen (pgn.ts), plus l'indication du roque standard.
    const sansIndication = (e: string | null) => e?.replace(/ \(roque standard seulement[^)]*\)/, '') ?? null;
    for (const fen of [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      '4k3/8/8/8/8/8/8/P3K3 w - - 0 1',
      '4k3/8/8/8/8/8/4R3/4K3 w - - 0 1',
      '4k3/8/8/8/8/8/8/4K3 w - e4 0 1',
      '4k4/8/8/8/8/8/8/4K3 w - - 0 1',
      '4k3/8/8/8/8/8/8/4KX2 w - - 0 1',
      '4k3/8/8/8/8/8/8/4K3 x - - 0 1',
      '4k3/8/8/8/8/8/8/4K3 w HAha - 0 1',
      '4k3/8/8/8/8/8/8/4K3 w - - a 1',
      '8/8/8/8/8/8/8/8 w - - 0 1',
      'pppppppp/pppppppp/8/8/8/8/8/4K2k w - - 0 1',
      '4k3/8/8/8/8/8/8/4K2R w Kq - 0 1',
      '4k3/8/8/8/8/8/8/R3K3 w K - 0 1',
      'pas un fen',
      'n importe quoi',
    ]) {
      expect(sansIndication(basicFenError(fen)), fen).toBe(validateFen(fen));
    }
  });
  it('équilibrage, cartes suspendues, mise en place', () => {
    expect(verifie({ tuning: { ...RULES_V1.tuning, rift: { coups: 4, ranks: [3, 8] } } })).toEqual([
      'CARDS.rift.ranks vaut [3,8] : des rangées de 0 à 7 sont attendues.',
    ]);
    expect(verifie({ tuning: { ...RULES_V1.tuning, hourglass: { coups: 0, clockRate: 0 } } })).toEqual([
      "CARDS.hourglass.coups vaut 0 : un entier d'au moins 1 est attendu.",
      'CARDS.hourglass.clockRate vaut 0 : une vitesse positive est attendue.',
    ]);
    expect(verifie({ suspended: ['inconnue' as CardId] })[0]).toMatch(/^SUSPENDED_CARDS/);
    expect(verifie({ deal: { ...DEAL_V1, draftMs: 0 } })).toEqual(["DEAL.draftMs vaut 0 : une durée d'au moins 1000 ms est attendue."]);
  });
  it('noms inconnus (fautes de frappe) : refusés avec la liste des noms permis', () => {
    const reglages = 'cardsPerPlayer, cardsPerTurn, cardEndsTurn, handsVisible, presageDelay, fiftyHalfmoves, repetitions, startFen';
    const inconnu = { cardsPerPlayer: 5, cardPerTurn: 2 } as Partial<GameRulesSettings>;
    expect(verifie({ byContext: { amicale: inconnu } })).toEqual([`RULES_BY_CONTEXT.amicale.cardPerTurn : réglage inconnu (réglages : ${reglages}).`]);
    expect(verifie({ byContext: { amical: {} } as RulesConfig['byContext'] })).toEqual([
      'RULES_BY_CONTEXT.amical : contexte inconnu (contextes : classee, amicale, invitation, ia, accueil).',
    ]);
    expect(verifie({ game: { ...V1, cardEndTurn: true } as GameRulesSettings })).toEqual([`GAME_RULES.cardEndTurn : réglage inconnu (réglages : ${reglages}).`]);
    expect(verifie({ deal: { ...DEAL_V1, drafMs: 3 } as DealSettings })).toEqual([
      'DEAL.drafMs : réglage inconnu (réglages : draft, draftMs, handLimits, limitsInDraft, rarityWeight, redrawAttempts).',
    ]);
    const limites = { maxPerRarity: { legendaire: 1 }, maxPerFamily: { climat: 2, climats: 1, terrain: -1 } } as unknown as DealSettings['handLimits'];
    expect(verifie({ deal: { ...DEAL_V1, handLimits: limites } })).toEqual([
      'DEAL.handLimits.maxPerFamily.climats : famille inconnue (familles : climat, terrain, evenement, duel).',
      'DEAL.handLimits.maxPerFamily.terrain vaut -1 : un entier positif ou nul est attendu.',
      'DEAL.handLimits.maxPerRarity.legendaire : rareté inconnue (raretés : commune, rare, épique, légendaire).',
    ]);
    setRulesOverride({ ...V1, cardPerTurn: 2 } as Partial<GameRulesSettings>);
    expect(checkRules({ ...FIGE })).toEqual([`SPELLMATE_TEST_RULES.cardPerTurn : réglage inconnu (réglages : ${reglages}).`]);
  });
  it('une carte suspendue rétrécit la réserve', () => {
    expect(poolOf('climats', { timed: true }, ['blast'])).not.toContain('blast');
    const e = verifie({ suspended: ['blast', 'truce', 'rift', 'tide', 'ice_wall'] });
    expect(e.some(m => m.includes("la réserve n'a que 2 cartes"))).toBe(true);
    const presque = verifie({ suspended: ['truce', 'blood_moon', 'ice_age', 'blast', 'ice_wall', 'rift', 'tide'] });
    expect(presque.some(m => m.includes("la réserve n'a qu'une carte (hors Trêve"))).toBe(true);
    expect(presque.some(m => m.includes("la réserve n'a aucune carte (hors Sablier fou"))).toBe(true);
  });
  it('une valeur absente d’un contexte ne remplace rien', () => {
    expect(verifie({ byContext: { ia: { cardsPerPlayer: undefined } } })).toEqual([]);
  });
  it('la surcharge de test est vérifiée comme le reste', () => {
    setRulesOverride({ ...V1, presageDelay: 5 });
    expect(checkRules({ ...FIGE })).toEqual([
      "SPELLMATE_TEST_RULES.presageDelay vaut 5 : il doit être pair (un Présage arrive au début d'un tour de son lanceur).",
    ]);
  });
  it('une valeur du mauvais type est citée telle quelle', () => {
    setRulesOverride({ ...V1, cardsPerPlayer: '3' as unknown as number, cardEndsTurn: 'non' as unknown as boolean });
    expect(checkRules({ ...FIGE })).toEqual([
      'SPELLMATE_TEST_RULES.cardsPerPlayer vaut "3" : un nombre entier est attendu (de 1 à 6, BOUNDS).',
      'SPELLMATE_TEST_RULES.cardEndsTurn vaut "non" : true ou false est attendu.',
    ]);
  });
  it('settingsErrors : un jeu de réglages seul, noms nus par défaut', () => {
    expect(settingsErrors(V1)).toEqual([]);
    expect(settingsErrors({ ...V1, fiftyHalfmoves: 0, repetitions: 1 })).toEqual([
      'fiftyHalfmoves vaut 0 : un nombre entier de demi-coups est attendu, au moins 2 (100 pour 50 coups).',
      "repetitions vaut 1 : un nombre entier d'au moins 2 est attendu.",
    ]);
  });
});

// Règles du jeu et mise en place des nouvelles parties : LE réglage du fondateur.
//
// Aucun import à l'exécution (seulement `import type`) : ce module peut être lu partout, y compris par le paquet
// principal du site (pied de page, menus), sans y faire entrer le moteur (game.ts, cards.ts, chess.ts).
//
// Trois natures de réglages (docs de conception, § 1) :
// - GAME_RULES et RULES_BY_CONTEXT : règles qui touchent la légalité. Elles sont photographiées dans chaque partie
//   (GameState.rules) si elles diffèrent de RULES_V1 : une partie en cours garde toujours ses règles.
// - DEAL : mise en place (choix ou tirage des cartes, durée du choix, contraintes du tirage). Lue à la création
//   seulement : son résultat (les mains) est déjà stocké dans la partie.
// - RULES_V1 : règles historiques, celles de toute partie qui n'a pas de champ `rules`. Ne jamais les modifier.
//
// Une configuration impossible (6 cartes avec au plus 2 Climats, 2 cartes par tour avec « la carte remplace le
// coup »…) est refusée par checkRules (src/shared/rules.ts) : au build, au démarrage du serveur et dans les tests.

import type { CardId, Family, Rarity } from '../cards';

/** Équilibrage d'une carte, copié dans les règles de la partie à sa création. */
export interface CardTuning {
  /** Durée de l'effet en coups des deux camps (demi-coups), comptés depuis son arrivée. */
  coups?: number;
  /** Rangées concernées, de 0 à 7 (relatives au camp du pion pour la Grande Marée). */
  ranks?: readonly number[];
  /** Vitesse d'écoulement des pendules sous l'effet (Sablier fou : 2). */
  clockRate?: number;
}

/** Règles qui touchent la légalité : photographiées dans la partie si elles diffèrent de RULES_V1. */
export interface Rules {
  /** Forme de cet objet. Une partie dont le schéma est inconnu est refusée (reprise) ou signalée (relecture). */
  schema: 1;
  /** Cartes dans chaque main. */
  cardsPerPlayer: number;
  /** Cartes qu'un joueur peut lancer pendant un même tour. */
  cardsPerTurn: number;
  /** true : toute carte tient lieu de coup (le trait passe) ; false : elle s'ajoute au coup, sauf un Rituel. */
  cardEndsTurn: boolean;
  /** Mains visibles des deux joueurs. false est refusé par checkRules dans cette version. */
  handsVisible: boolean;
  /** Présage : demi-coups entre l'annonce et l'arrivée (pair : l'effet arrive au début d'un tour du lanceur). */
  presageDelay: number;
  /** Règle des 50 coups, en demi-coups (100). */
  fiftyHalfmoves: number;
  /** Nulle par répétition à la N-ième occurrence d'une position (3 : triple répétition). */
  repetitions: number;
  /** Position de départ (FEN, roque standard seulement), ou null pour la position standard. */
  startFen: string | null;
  /** Équilibrage des cartes, copié depuis CARDS à la création (les anciennes parties gardent l'ancien). */
  tuning: Readonly<Partial<Record<CardId, CardTuning>>>;
}

/** Ce que le fondateur règle : les règles, sans le schéma ni l'équilibrage (qui vient de CARDS). */
export type GameRulesSettings = Omit<Rules, 'schema' | 'tuning'>;

/** Contraintes d'une main tirée au hasard (R9) : au plus N cartes d'une rareté ou d'une famille. */
export interface HandLimits {
  maxPerRarity: Readonly<Partial<Record<Rarity, number>>>;
  maxPerFamily: Readonly<Partial<Record<Family, number>>>;
}

/** Mise en place des nouvelles parties. */
export interface DealSettings {
  /** true : chacun choisit ses cartes au début de la partie ; false : tirage au hasard partout. L'accueil tire toujours. */
  draft: boolean;
  /** Durée du choix des cartes (ms). À l'échéance, le serveur complète au hasard ce qui manque. */
  draftMs: number;
  /** Contraintes du tirage (R9). */
  handLimits: HandLimits;
  /** true : les contraintes du tirage s'appliquent aussi au choix des cartes (refus immédiat). */
  limitsInDraft: boolean;
  /** Poids du tirage pondéré (catalogue Pouvoirs) : les cartes rares sortent moins souvent. */
  rarityWeight: Readonly<Record<Rarity, number>>;
  /** Tirages recommencés tant que la main est invalide, avant un tirage contraint carte par carte. */
  redrawAttempts: number;
}

/** Contextes de création d'une partie : chacun peut avoir ses propres règles (RULES_BY_CONTEXT). */
export type RulesContext = 'classee' | 'amicale' | 'invitation' | 'ia' | 'accueil';
export const RULES_CONTEXTS: readonly RulesContext[] = ['classee', 'amicale', 'invitation', 'ia', 'accueil'];

/** Version de la forme de `Rules`. */
export const RULES_SCHEMA = 1;

/** Gèle un objet et tout ce qu'il contient (les règles sont partagées : personne ne doit pouvoir les modifier). */
export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

// ---------------------------------------------------------------------------------------------
// LES RÉGLAGES

/**
 * ← RÈGLES DES NOUVELLES PARTIES. Les parties en cours, les relectures et les sauvegardes gardent les leurs.
 * Pas de `as const` : le type littéral `3` ferait refuser `n === 1` par TypeScript dans les phrases dérivées.
 */
export const GAME_RULES: GameRulesSettings = /* @__PURE__ */ Object.freeze({
  cardsPerPlayer: 3,
  cardsPerTurn: 1,
  cardEndsTurn: false,
  handsVisible: true,
  presageDelay: 2,
  fiftyHalfmoves: 100,
  repetitions: 3,
  startFen: null,
});

/**
 * Essayer une variante dans un seul contexte, par exemple `amicale: { cardsPerPlayer: 5 }`. Vide : les mêmes
 * règles partout.
 */
export const RULES_BY_CONTEXT: Readonly<Partial<Record<RulesContext, Partial<GameRulesSettings>>>> = /* @__PURE__ */ Object.freeze({});

/** ← MISE EN PLACE des nouvelles parties : lue à la création seulement (le résultat est stocké). */
export const DEAL: Readonly<DealSettings> = /* @__PURE__ */ deepFreeze({
  draft: true,
  draftMs: 45_000,
  handLimits: { maxPerRarity: { légendaire: 1 }, maxPerFamily: { climat: 2 } },
  limitsInDraft: false,
  rarityWeight: { commune: 4, rare: 3, épique: 2, légendaire: 1 },
  redrawAttempts: 64,
});

/**
 * Cartes retirées des nouvelles réserves (tirage, choix, IA) sans annuler les parties en cours : pour suspendre
 * une carte défectueuse. Différent de `retired` (cards.ts), qui retire une carte pour de bon.
 */
export const SUSPENDED_CARDS: readonly CardId[] = /* @__PURE__ */ Object.freeze([]);

/** Bornes acceptées par checkRules (les mises en page sont prévues de 1 à 6 cartes par main). */
export const BOUNDS = {
  cardsPerPlayer: [1, 6],
  cardsPerTurn: [1, 3],
  presageDelay: [2, 6],
} as const;

/**
 * Règles des parties créées avant le versionnement des règles, et de toute partie sans champ `rules`.
 * NE JAMAIS MODIFIER : des milliers de parties enregistrées se relisent avec (test de figement :
 * test/fixtures/rules-v1.json).
 */
export const RULES_V1: Rules = /* @__PURE__ */ deepFreeze({
  schema: 1,
  cardsPerPlayer: 3,
  cardsPerTurn: 1,
  cardEndsTurn: false,
  handsVisible: true,
  presageDelay: 2,
  fiftyHalfmoves: 100,
  repetitions: 3,
  startFen: null,
  tuning: {
    hourglass: { coups: 6, clockRate: 2 },
    truce: { coups: 3 },
    blood_moon: { coups: 3 },
    ice_age: { coups: 4 },
    blast: { coups: 4 },
    rift: { coups: 4, ranks: [3, 4] },
    ice_wall: { ranks: [2, 3, 4, 5] },
    tide: { ranks: [1, 2, 3, 4] },
  },
});

// Noyau des règles d'une partie, ce que le moteur, l'IA et le client en lisent : règles des nouvelles parties
// (rulesFor), d'une partie existante (rulesOf), équilibrage (tuneOf), budget de cartes (castsLeft, cardEndsTurn),
// réserves et contraintes du tirage (poolOf, validHand, maxValidHand), position de départ (basicFenError).
//
// - rulesFor(ctx) : GAME_RULES, plus RULES_BY_CONTEXT[ctx], plus l'équilibrage lu dans CARDS. Objet gelé et
//   mémorisé : ne jamais le cloner ni le modifier, il est partagé.
// - rulesOf(s) : règles d'une partie, RULES_V1 si elle n'en porte pas. Relectures, reprises et sauvegardes rejouent
//   toujours avec les règles de la partie, jamais avec celles du jour.
// - stampRules(r) : ce qu'on écrit dans une nouvelle partie. undefined si r égale RULES_V1 : au réglage par défaut,
//   aucune partie, aucune vue, aucune sauvegarde ne change d'un octet.
//
// La validation (checkRules, parseRules…) est dans rules.ts, qui réexporte aussi tout ce module. Le code chargé par
// l'accueil (moteur, IA, client) importe CE module, jamais rules.ts : sinon Rollup range la validation avec le moteur,
// dans le morceau de l'accueil (+1,1 ko compressé mesuré). Le serveur, l'Analyse (pgn.ts) et les tests importent rules.ts.
//
// Le moteur ne lit les règles que dans game.ts (rulesOf, tuneOf), jamais dans chess.ts, la recherche de l'IA ou
// positionKey.

import { CARD_IDS, CARDS, cardsOf } from './cards';
import type { CardDef, CardId, Catalog, Family, Rarity } from './cards';
import { NO_MODS, fromFen, inCheck, opposite, rankOf, sqIndex } from './chess';
import type { Color, PieceType } from './chess';
import {
  GAME_RULES, RULES_BY_CONTEXT, RULES_SCHEMA, RULES_V1, SUSPENDED_CARDS, deepFreeze,
} from './config/rules';
import type { CardTuning, GameRulesSettings, HandLimits, Rules, RulesContext } from './config/rules';

export type { CardTuning, GameRulesSettings, HandLimits, Rules, RulesContext } from './config/rules';
export { RULES_V1 } from './config/rules';

// ---------------------------------------------------------------------------------------------
// Règles des nouvelles parties

/** Surcharge de test (serveur jetable, SPELLMATE_TEST_RULES) : prioritaire sur GAME_RULES et RULES_BY_CONTEXT. */
let override: Readonly<Partial<GameRulesSettings>> | null = null;
const memo = new Map<RulesContext, Rules>();

/** Noms des réglages de règles (GAME_RULES, RULES_BY_CONTEXT, surcharge de test). */
export const SETTING_KEYS: readonly (keyof GameRulesSettings)[] = [
  'cardsPerPlayer', 'cardsPerTurn', 'cardEndsTurn', 'handsVisible', 'presageDelay', 'fiftyHalfmoves', 'repetitions',
  'startFen',
];

/** Équilibrage d'une carte tel que CARDS le décrit aujourd'hui (coups, rangées, vitesse des pendules). */
function cardTuning(def: CardDef): CardTuning | null {
  const t: { coups?: number; ranks?: readonly number[]; clockRate?: number } = {};
  if (def.coups !== undefined) t.coups = def.coups;
  if (def.ranks !== undefined) t.ranks = [...def.ranks];
  if (def.clockRate !== undefined) t.clockRate = def.clockRate;
  return Object.keys(t).length ? t : null;
}

/** Équilibrage de toutes les cartes qui en ont un, lu dans CARDS (gelé, calculé une fois). */
export const CARD_TUNING: Readonly<Partial<Record<CardId, CardTuning>>> = deepFreeze(
  CARD_IDS.reduce<Partial<Record<CardId, CardTuning>>>((acc, id) => {
    const t = cardTuning(CARDS[id]);
    if (t) acc[id] = t;
    return acc;
  }, {}),
);
const NO_TUNING: CardTuning = Object.freeze({});

/** Superpose des réglages partiels ; une valeur `undefined` ne remplace rien. */
export function overlay(base: GameRulesSettings, ...parts: (Readonly<Partial<GameRulesSettings>> | null | undefined)[]): GameRulesSettings {
  const out = { ...base } as Record<string, unknown>;
  for (const p of parts) for (const [k, v] of Object.entries(p ?? {})) if (v !== undefined) out[k] = v;
  return out as unknown as GameRulesSettings;
}

/** Réglages effectifs d'un contexte : GAME_RULES, puis RULES_BY_CONTEXT[ctx], puis la surcharge de test. */
export function settingsFor(ctx: RulesContext): GameRulesSettings {
  return overlay(GAME_RULES, RULES_BY_CONTEXT[ctx], override);
}

/** Règles d'une nouvelle partie créée dans ce contexte. Gelées et mémorisées : le même objet à chaque appel. */
export function rulesFor(ctx: RulesContext): Rules {
  let r = memo.get(ctx);
  if (!r) {
    const s = settingsFor(ctx);
    const picked = Object.fromEntries(SETTING_KEYS.map(k => [k, s[k]])) as unknown as GameRulesSettings;
    r = deepFreeze({ schema: RULES_SCHEMA, ...picked, tuning: CARD_TUNING } as Rules);
    // Au défaut, le même objet que RULES_V1 : une seule référence à comparer, rien à cloner.
    if (sameRules(r, RULES_V1)) r = RULES_V1;
    memo.set(ctx, r);
  }
  return r;
}

/** Règles d'une partie : celles qu'elle porte, sinon RULES_V1 (parties d'avant le versionnement, et défaut). */
export const rulesOf = (s: { rules?: Rules }): Rules => s.rules ?? RULES_V1;

/** Ce qu'on écrit dans `GameState.rules` à la création : rien si les règles égalent RULES_V1. */
export function stampRules(r: Rules): Rules | undefined {
  return sameRules(r, RULES_V1) ? undefined : r;
}

/** Égalité de valeur de deux jeux de règles (ordre des clés indifférent). */
export function sameRules(a: Rules, b: Rules): boolean {
  return a === b || deepEqual(a, b);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter(k => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter(k => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * Surcharge de test des règles des nouvelles parties (serveur jetable des tests de bout en bout,
 * SPELLMATE_TEST_RULES), ou null pour la retirer. Refusée en production : le serveur n'accepte jamais de règles
 * venues de l'extérieur.
 */
export function setRulesOverride(p: Partial<GameRulesSettings> | null): void {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  if (p && env?.NODE_ENV === 'production') throw new Error('Règles de test refusées en production (SPELLMATE_TEST_RULES).');
  override = p ? Object.freeze({ ...p }) : null;
  memo.clear();
}

/** Surcharge de test en cours (checkRules, dans rules.ts, vérifie aussi ses noms de réglages), ou null. */
export function rulesOverride(): Readonly<Partial<GameRulesSettings>> | null {
  return override;
}

// ---------------------------------------------------------------------------------------------
// Lecture des règles par le moteur

/** Équilibrage d'une carte dans une partie : celui de ses règles, sinon celui de CARDS (cartes du Duel). */
export function tuneOf(s: { rules?: Rules }, id: CardId): CardTuning {
  return rulesOf(s).tuning[id] ?? CARD_TUNING[id] ?? NO_TUNING;
}

/** Cartes que le camp au trait peut encore lancer ce tour. */
export function castsLeft(s: { cardPlayed: boolean; cardsThisTurn?: number; rules?: Rules }): number {
  return s.cardPlayed ? 0 : Math.max(0, rulesOf(s).cardsPerTurn - (s.cardsThisTurn ?? 0));
}

/** La carte termine-t-elle le tour (le trait passe) ? Un Rituel toujours ; toute carte si `cardEndsTurn`. */
export function cardEndsTurn(def: Pick<CardDef, 'ritual'>, r: Pick<Rules, 'cardEndsTurn'>): boolean {
  return !!def.ritual || r.cardEndsTurn;
}

// ---------------------------------------------------------------------------------------------
// Réserves et contraintes du tirage

/**
 * Réserve d'une partie : les cartes du catalogue, sans les cartes retirées (`retired`) ou suspendues
 * (SUSPENDED_CARDS), sans les cartes `timedOnly` sans pendule ni les cartes `humanOnly` contre l'IA.
 */
export function poolOf(catalog: Catalog, opts: { timed: boolean; vsBot?: boolean }, suspended: readonly CardId[] = SUSPENDED_CARDS): CardId[] {
  return cardsOf(catalog).filter(id => {
    const d = CARDS[id];
    return !d.retired && !suspended.includes(id) && (opts.timed || !d.timedOnly) && !(opts.vsBot && d.humanOnly);
  });
}

/** Une main respecte-t-elle les contraintes du tirage (R9) ? */
export function validHand(hand: readonly CardId[], l: HandLimits): boolean {
  const fam = new Map<Family, number>();
  const rar = new Map<Rarity, number>();
  for (const id of hand) {
    const d = CARDS[id];
    fam.set(d.family, (fam.get(d.family) ?? 0) + 1);
    rar.set(d.rarity, (rar.get(d.rarity) ?? 0) + 1);
  }
  for (const [f, n] of fam) if (n > (l.maxPerFamily[f] ?? Infinity)) return false;
  for (const [k, n] of rar) if (n > (l.maxPerRarity[k] ?? Infinity)) return false;
  return true;
}

/**
 * Taille de la plus grande main valide qu'on peut tirer de cette réserve (5 aujourd'hui pour chaque réserve des
 * Pouvoirs : au plus 2 des Climats, plus les 3 autres cartes). Calcul exact : chaque carte a une famille et une
 * rareté, chacune plafonnée ; c'est un flot maximal famille → rareté, de capacité le nombre de cartes de chaque paire.
 */
export function maxValidHand(pool: readonly CardId[], l: HandLimits): number {
  const families = [...new Set(pool.map(id => CARDS[id].family))];
  const rarities = [...new Set(pool.map(id => CARDS[id].rarity))];
  // Nœuds : 0 source, 1..F familles, F+1..F+R raretés, F+R+1 puits.
  const F = families.length;
  const N = F + rarities.length + 2;
  const sink = N - 1;
  const cap: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  families.forEach((f, i) => (cap[0][1 + i] = Math.min(l.maxPerFamily[f] ?? pool.length, pool.length)));
  rarities.forEach((k, j) => (cap[1 + F + j][sink] = Math.min(l.maxPerRarity[k] ?? pool.length, pool.length)));
  for (const id of pool) cap[1 + families.indexOf(CARDS[id].family)][1 + F + rarities.indexOf(CARDS[id].rarity)]++;
  let flow = 0;
  for (;;) {
    // Chemin augmentant le plus court (Edmonds-Karp), sur un graphe de quelques nœuds.
    const prev = new Array<number>(N).fill(-1);
    prev[0] = 0;
    const queue = [0];
    while (queue.length && prev[sink] < 0) {
      const u = queue.shift()!;
      for (let v = 0; v < N; v++) {
        if (prev[v] >= 0 || cap[u][v] <= 0) continue;
        prev[v] = u;
        queue.push(v);
      }
    }
    if (prev[sink] < 0) return flow;
    let push = Infinity;
    for (let v = sink; v !== 0; v = prev[v]) push = Math.min(push, cap[prev[v]][v]);
    for (let v = sink; v !== 0; v = prev[v]) {
      cap[prev[v]][v] -= push;
      cap[v][prev[v]] += push;
    }
    flow += push;
  }
}

/**
 * La main `hand` (valide) peut-elle être complétée jusqu'à `size` cartes, toujours valides, avec des cartes de `rest`
 * (cartes qui ne sont pas dans `hand`) ? Recherche exhaustive, sur des réserves de quelques cartes. Sert aux tirages
 * carte par carte (tirage contraint, complément d'un choix, choix de l'IA) : une carte n'est prise que si la main
 * reste complétable, sans quoi un premier choix glouton (une Rare quand les Rares sont plafonnées…) laisserait une main
 * trop courte.
 */
export function canComplete(hand: readonly CardId[], rest: readonly CardId[], l: HandLimits, size: number): boolean {
  if (hand.length >= size) return true;
  for (let i = 0; i < rest.length; i++) {
    const next = [...hand, rest[i]];
    if (validHand(next, l) && canComplete(next, rest.slice(i + 1), l, size)) return true;
  }
  return false;
}

/** Taille visée par un tirage carte par carte : `size`, ou moins si aucune main valide de cette taille ne contient `hand`. */
export function completionTarget(hand: readonly CardId[], rest: readonly CardId[], l: HandLimits, size: number): number {
  let target = size;
  while (target > hand.length && !canComplete(hand, rest, l, target)) target--;
  return target;
}

/**
 * Vérification complète d'une position de départ, avec chess.ts seulement (mêmes contrôles et mêmes phrases que
 * validateFen de pgn.ts, que ce module ne peut pas importer sans cycle) : 8 rangées de 8 cases, caractères connus,
 * trait, prise en passant, un roi par camp, aucun pion sur la première ou la dernière rangée, au plus 8 pions par
 * camp, camp sans le trait hors d'échec, et roque standard seulement.
 */
export function basicFenError(fen: string): string | null {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) return 'Le FEN doit contenir au moins la position et le trait.';
  const rows = parts[0].split('/');
  if (rows.length !== 8) return 'La position doit compter 8 rangées séparées par « / ».';
  for (const row of rows) {
    let n = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) n += Number(ch);
      else if (/[prnbqkPRNBQK]/.test(ch)) n++;
      else return `Caractère inconnu dans la position : « ${ch} ».`;
    }
    if (n !== 8) return 'Chaque rangée doit compter exactement 8 cases.';
  }
  if (!/^[wb]$/.test(parts[1])) return 'Le trait doit être « w » (Blancs) ou « b » (Noirs).';
  if (parts[2] && !/^(-|K?Q?k?q?)$/.test(parts[2])) return 'Droits de roque invalides (roque standard seulement : KQkq).';
  if (parts[3] && !/^(-|[a-h][36])$/.test(parts[3])) return 'Case de prise en passant invalide.';
  if (parts[4] && !/^\d+$/.test(parts[4])) return 'Compteur des 50 coups invalide.';
  if (parts[5] && !/^\d+$/.test(parts[5])) return 'Numéro de coup invalide.';
  let pos;
  try {
    pos = fromFen(fen).pos;
  } catch {
    return 'FEN illisible.';
  }
  const board = pos.board;
  const count = (t: PieceType, c: Color) => board.filter(p => p && p.t === t && p.c === c).length;
  if (count('k', 'w') !== 1 || count('k', 'b') !== 1) return 'Il faut exactement un roi blanc et un roi noir.';
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.t === 'p' && (rankOf(i) === 0 || rankOf(i) === 7)) return 'Un pion ne peut pas se trouver sur la première ou la dernière rangée.';
  }
  if (count('p', 'w') > 8 || count('p', 'b') > 8) return 'Pas plus de 8 pions par camp.';
  if (inCheck(pos, opposite(pos.turn), NO_MODS)) return 'Le camp qui n’a pas le trait ne peut pas être en échec.';
  const is = (sq: string, t: PieceType, c: Color) => board[sqIndex(sq)]?.t === t && board[sqIndex(sq)]?.c === c;
  const standard = ' (roque standard seulement : roi en e1 ou e8, tour dans le coin)';
  if (pos.castling & 1 && !(is('e1', 'k', 'w') && is('h1', 'r', 'w'))) return `Petit roque blanc impossible dans cette position${standard}.`;
  if (pos.castling & 2 && !(is('e1', 'k', 'w') && is('a1', 'r', 'w'))) return `Grand roque blanc impossible dans cette position${standard}.`;
  if (pos.castling & 4 && !(is('e8', 'k', 'b') && is('h8', 'r', 'b'))) return `Petit roque noir impossible dans cette position${standard}.`;
  if (pos.castling & 8 && !(is('e8', 'k', 'b') && is('a8', 'r', 'b'))) return `Grand roque noir impossible dans cette position${standard}.`;
  return null;
}

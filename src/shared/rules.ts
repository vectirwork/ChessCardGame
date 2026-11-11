// Règles d'une partie : celles des nouvelles parties (rulesFor), celles d'une partie existante (rulesOf), et la
// validation de la configuration (checkRules).
//
// - rulesFor(ctx) : GAME_RULES, plus RULES_BY_CONTEXT[ctx], plus l'équilibrage lu dans CARDS. Objet gelé et
//   mémorisé : ne jamais le cloner ni le modifier, il est partagé.
// - rulesOf(s) : règles d'une partie, RULES_V1 si elle n'en porte pas. Relectures, reprises et sauvegardes rejouent
//   toujours avec les règles de la partie, jamais avec celles du jour.
// - stampRules(r) : ce qu'on écrit dans une nouvelle partie. undefined si r égale RULES_V1 : au réglage par défaut,
//   aucune partie, aucune vue, aucune sauvegarde ne change d'un octet.
// - checkRules() : liste des erreurs de configuration, en français ; vide si tout est jouable. Appelée au build, au
//   démarrage du serveur et dans les tests. Un nom de réglage, de contexte, de famille ou de rareté inconnu (faute de
//   frappe) est une erreur, comme une valeur hors bornes.
// - parseRules(x) : règles lues d'une source extérieure (sauvegarde, en-tête PGN, reprise), refusées si leur forme
//   ou leurs valeurs ne sont pas jouables (mêmes vérifications que checkRules : settingsErrors, tuningErrors).
//
// Le moteur ne lit les règles que dans game.ts (rulesOf, tuneOf), jamais dans chess.ts, la recherche de l'IA ou
// positionKey.

import { CARD_IDS, CARDS, CATALOGS, cardsOf } from './cards';
import type { CardDef, CardId, Catalog, Family, Rarity } from './cards';
import { NO_MODS, fromFen, inCheck, opposite, rankOf, sqIndex } from './chess';
import type { Color, PieceType } from './chess';
import { HOME } from './config/home';
import {
  BOUNDS, DEAL, GAME_RULES, RULES_BY_CONTEXT, RULES_CONTEXTS, RULES_SCHEMA, RULES_V1, SUSPENDED_CARDS, deepFreeze,
} from './config/rules';
import type { CardTuning, DealSettings, GameRulesSettings, HandLimits, Rules, RulesContext } from './config/rules';
import { TIME_CONTROLS } from './protocol';
import { compte } from './text/fr';

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
/** Noms des réglages de la mise en place (DEAL) et de l'équilibrage d'une carte. */
const DEAL_KEYS: readonly (keyof DealSettings)[] = ['draft', 'draftMs', 'handLimits', 'limitsInDraft', 'rarityWeight', 'redrawAttempts'];
const TUNING_KEYS: readonly (keyof CardTuning)[] = ['coups', 'ranks', 'clockRate'];

/** Équilibrage d'une carte tel que CARDS le décrit aujourd'hui (coups, rangées, vitesse des pendules). */
function cardTuning(def: CardDef): CardTuning | null {
  const t: { coups?: number; ranks?: readonly number[]; clockRate?: number } = {};
  if (def.coups !== undefined) t.coups = def.coups;
  if (def.ranks !== undefined) t.ranks = [...def.ranks];
  if (def.clockRate !== undefined) t.clockRate = def.clockRate;
  return Object.keys(t).length ? t : null;
}

/** Équilibrage de toutes les cartes qui en ont un, lu dans CARDS (gelé, calculé une fois). */
const CARD_TUNING: Readonly<Partial<Record<CardId, CardTuning>>> = deepFreeze(
  CARD_IDS.reduce<Partial<Record<CardId, CardTuning>>>((acc, id) => {
    const t = cardTuning(CARDS[id]);
    if (t) acc[id] = t;
    return acc;
  }, {}),
);
const NO_TUNING: CardTuning = Object.freeze({});

/** Superpose des réglages partiels ; une valeur `undefined` ne remplace rien. */
function overlay(base: GameRulesSettings, ...parts: (Readonly<Partial<GameRulesSettings>> | null | undefined)[]): GameRulesSettings {
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

const isPlainObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * Règles lues d'une source extérieure (sauvegarde, en-tête PGN, reprise) : l'objet si sa forme est celle de
 * `Rules` au schéma connu ET si ses valeurs sont jouables, sinon null. Null pour un schéma inconnu (partie plus
 * récente que ce code), des données abîmées, ou des valeurs forgées qui bloqueraient la partie ou l'onglet
 * (Présage à 1e9 demi-coups, 0 coup avant la nulle, rangée 99…) : mêmes vérifications que checkRules
 * (settingsErrors, tuningErrors). L'équilibrage d'une carte inconnue de ce code est gardé tel quel.
 */
export function parseRules(x: unknown): Rules | null {
  if (!isPlainObject(x) || x.schema !== RULES_SCHEMA) return null;
  if (Object.keys(x).some(k => k !== 'schema' && k !== 'tuning' && !(SETTING_KEYS as readonly string[]).includes(k))) return null;
  if (!isPlainObject(x.tuning)) return null;
  for (const t of Object.values(x.tuning)) {
    if (!isPlainObject(t) || Object.keys(t).some(k => !(TUNING_KEYS as readonly string[]).includes(k))) return null;
  }
  if (settingsErrors(x as unknown as GameRulesSettings).length) return null;
  if (tuningErrors(x.tuning as Partial<Record<CardId, CardTuning>>).length) return null;
  const parsed = deepFreeze(JSON.parse(JSON.stringify(x)) as Rules);
  return sameRules(parsed, RULES_V1) ? RULES_V1 : parsed;
}

/** Résumé d'une ligne des règles, pour le journal du serveur (nombre de cartes, par tour, moment de la carte…). */
export function rulesSummary(r: Rules): string {
  return [
    `${compte(r.cardsPerPlayer, 'carte')} par joueur`,
    `${r.cardsPerTurn} par tour`,
    r.cardEndsTurn ? 'à la place du coup' : 'avant le coup',
    r.handsVisible ? 'mains visibles' : 'mains cachées',
    `Présage en ${r.presageDelay} demi-coups`,
    `nulle après ${compte(r.fiftyHalfmoves / 2, 'coup')} sans prise ni coup de pion`,
    `répétition ×${r.repetitions}`,
    r.startFen ? `départ ${r.startFen}` : 'position standard',
    `choix des cartes ${DEAL.draft ? `en ${DEAL.draftMs / 1000} s` : 'remplacé par le tirage'}`,
  ].join(', ');
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

// ---------------------------------------------------------------------------------------------
// Validation de la configuration

/** Ce que checkRules vérifie ; chaque champ absent prend la configuration réelle. */
export interface RulesConfig {
  game?: GameRulesSettings;
  byContext?: Readonly<Partial<Record<RulesContext, Partial<GameRulesSettings>>>>;
  deal?: Readonly<DealSettings>;
  suspended?: readonly CardId[];
  /** Équilibrage à vérifier (défaut : celui de CARDS). */
  tuning?: Readonly<Partial<Record<CardId, CardTuning>>>;
  /** Vérification d'une position de départ (défaut : basicFenError, aussi complète que validateFen de pgn.ts). */
  fenError?: (fen: string) => string | null;
}

const CONTEXT_LABEL: Record<RulesContext, string> = {
  classee: 'en partie classée',
  amicale: 'en partie amicale',
  invitation: 'en invitation',
  ia: "contre l'IA",
  accueil: "à l'accueil",
};

/**
 * Noms des familles et des raretés dans les messages : singulier, pluriel, genre, et complément de « qui n'est pas »
 * (une carte) ou « qui ne sont pas » (plusieurs).
 */
interface Mots {
  one: string;
  many: string;
  f: boolean;
  notOne: string;
  notMany: string;
}
const FAMILY_WORDS: Record<Family, Mots> = {
  climat: { one: 'Climat', many: 'Climats', f: false, notOne: 'un Climat', notMany: 'des Climats' },
  terrain: { one: 'Terrain', many: 'Terrains', f: false, notOne: 'un Terrain', notMany: 'des Terrains' },
  evenement: { one: 'Événement', many: 'Événements', f: false, notOne: 'un Événement', notMany: 'des Événements' },
  duel: { one: 'carte du Duel', many: 'cartes du Duel', f: true, notOne: 'du Duel', notMany: 'du Duel' },
};
const RARITY_WORDS: Record<Rarity, Mots> = {
  commune: { one: 'Commune', many: 'Communes', f: true, notOne: 'Commune', notMany: 'Communes' },
  rare: { one: 'Rare', many: 'Rares', f: true, notOne: 'Rare', notMany: 'Rares' },
  épique: { one: 'Épique', many: 'Épiques', f: true, notOne: 'Épique', notMany: 'Épiques' },
  légendaire: { one: 'Légendaire', many: 'Légendaires', f: true, notOne: 'Légendaire', notMany: 'Légendaires' },
};

/** « n'a que 5 cartes », « n'a qu'une carte », « n'a aucune carte ». */
function naQue(n: number): string {
  return n <= 0 ? "n'a aucune carte" : n === 1 ? "n'a qu'une carte" : `n'a que ${n} cartes`;
}

/** Valeur citée dans un message : 3, false, null, "3" (texte, par exemple venu de SPELLMATE_TEST_RULES), [3,8]. */
function montre(v: unknown): string {
  if (v === undefined || typeof v === 'number' || typeof v === 'bigint') return String(v);
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

/** Clés de `o` absentes de `connues` (fautes de frappe). */
function inconnues(o: unknown, connues: readonly string[]): string[] {
  return isPlainObject(o) ? Object.keys(o).filter(k => !connues.includes(k)) : [];
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

export interface SettingsErrorOptions {
  /** Nom du réglage dans les messages (défaut : son nom seul, « cardsPerTurn »). */
  where?: (k: keyof GameRulesSettings) => string;
  /** Lieu des parties concernées, ajouté au message « une main n'a que … » (« en partie amicale »). */
  label?: string;
  /** Vérification d'une position de départ (défaut : basicFenError). */
  fenError?: (fen: string) => string | null;
}

/**
 * Erreurs d'un jeu de réglages de règles, sans les réserves (celles-ci dépendent du contexte : checkRules) :
 * types, bornes de BOUNDS, parité du délai du Présage, cartes par tour ≤ cartes en main, carte à la place du coup
 * seulement avec cardsPerTurn à 1, mains visibles, règles des 50 coups et de répétition, position de départ.
 * Sert à checkRules et à parseRules (règles venues de l'extérieur).
 */
export function settingsErrors(s: Readonly<GameRulesSettings>, opts: SettingsErrorOptions = {}): string[] {
  const where = opts.where ?? ((k: keyof GameRulesSettings) => k);
  const fenError = opts.fenError ?? basicFenError;
  const v = s as unknown as Record<keyof GameRulesSettings, unknown>;
  const errors: string[] = [];
  const isInt = (x: unknown): x is number => Number.isInteger(x);

  for (const k of ['cardsPerPlayer', 'cardsPerTurn', 'presageDelay'] as const) {
    const [lo, hi] = BOUNDS[k];
    const x = v[k];
    if (!isInt(x)) errors.push(`${where(k)} vaut ${montre(x)} : un nombre entier est attendu (de ${lo} à ${hi}, BOUNDS).`);
    else if (x < lo || x > hi) errors.push(`${where(k)} vaut ${x} : hors des bornes (${lo} à ${hi}, BOUNDS).`);
  }
  for (const k of ['cardEndsTurn', 'handsVisible'] as const) {
    if (typeof v[k] !== 'boolean') errors.push(`${where(k)} vaut ${montre(v[k])} : true ou false est attendu.`);
  }
  if (isInt(v.cardsPerTurn) && isInt(v.cardsPerPlayer) && v.cardsPerTurn > v.cardsPerPlayer) {
    const lieu = opts.label ? ` ${opts.label}` : '';
    errors.push(`${where('cardsPerTurn')} vaut ${v.cardsPerTurn} : une main ${naQue(v.cardsPerPlayer)}${lieu} (${where('cardsPerPlayer')}).`);
  }
  if (v.cardEndsTurn === true && v.cardsPerTurn !== 1) {
    errors.push(`${where('cardEndsTurn')} (la carte remplace le coup) impose 1 carte par tour, mais ${where('cardsPerTurn')} vaut ${montre(v.cardsPerTurn)}.`);
  }
  if (isInt(v.presageDelay) && v.presageDelay % 2 !== 0) {
    errors.push(`${where('presageDelay')} vaut ${v.presageDelay} : il doit être pair (un Présage arrive au début d'un tour de son lanceur).`);
  }
  if (v.handsVisible === false) errors.push(`${where('handsVisible')} vaut false : les mains cachées ne sont pas encore prises en charge.`);
  if (!(isInt(v.fiftyHalfmoves) && v.fiftyHalfmoves >= 2)) {
    errors.push(`${where('fiftyHalfmoves')} vaut ${montre(v.fiftyHalfmoves)} : un nombre entier de demi-coups est attendu, au moins 2 (100 pour 50 coups).`);
  }
  if (!(isInt(v.repetitions) && v.repetitions >= 2)) errors.push(`${where('repetitions')} vaut ${montre(v.repetitions)} : un nombre entier d'au moins 2 est attendu.`);
  if (typeof v.startFen === 'string') {
    const e = fenError(v.startFen);
    if (e) errors.push(`${where('startFen')} : ${e}`);
  } else if (v.startFen !== null) {
    errors.push(`${where('startFen')} vaut ${montre(v.startFen)} : une position FEN (texte) ou null est attendue.`);
  }
  return errors;
}

/**
 * Erreurs d'un équilibrage de cartes : `coups` entier d'au moins 1, `ranks` rangées entières de 0 à 7 (au moins
 * une), `clockRate` vitesse finie et positive. `prefix` nomme la source dans les messages (CARDS).
 */
export function tuningErrors(tuning: Readonly<Partial<Record<CardId, CardTuning>>>, prefix = 'CARDS'): string[] {
  const errors: string[] = [];
  for (const [id, t] of Object.entries(tuning) as [string, CardTuning | undefined][]) {
    if (!isPlainObject(t)) {
      errors.push(`${prefix}.${id} vaut ${montre(t)} : un équilibrage { coups, ranks, clockRate } est attendu.`);
      continue;
    }
    for (const k of inconnues(t, TUNING_KEYS)) errors.push(`${prefix}.${id}.${k} : réglage inconnu (réglages : ${TUNING_KEYS.join(', ')}).`);
    const coups = t.coups as unknown;
    if (coups !== undefined && !(Number.isInteger(coups) && (coups as number) >= 1)) errors.push(`${prefix}.${id}.coups vaut ${montre(coups)} : un entier d'au moins 1 est attendu.`);
    const r = t.ranks as unknown;
    if (r !== undefined && !(Array.isArray(r) && r.length > 0 && r.every(x => Number.isInteger(x) && x >= 0 && x <= 7))) {
      errors.push(`${prefix}.${id}.ranks vaut ${montre(r)} : des rangées de 0 à 7 sont attendues.`);
    }
    const c = t.clockRate as unknown;
    if (c !== undefined && !(typeof c === 'number' && Number.isFinite(c) && c > 0)) {
      errors.push(`${prefix}.${id}.clockRate vaut ${montre(c)} : une vitesse positive est attendue.`);
    }
  }
  return errors;
}

/** Erreurs de la mise en place : noms inconnus, types, durée, contraintes du tirage (familles et raretés), poids. */
function dealErrors(deal: Readonly<DealSettings>): string[] {
  const errors: string[] = [];
  const d = deal as unknown as Record<string, unknown>;
  for (const k of inconnues(d, DEAL_KEYS)) errors.push(`DEAL.${k} : réglage inconnu (réglages : ${DEAL_KEYS.join(', ')}).`);
  for (const k of ['draft', 'limitsInDraft'] as const) {
    if (typeof d[k] !== 'boolean') errors.push(`DEAL.${k} vaut ${montre(d[k])} : true ou false est attendu.`);
  }
  if (!(Number.isInteger(d.draftMs) && (d.draftMs as number) >= 1000)) errors.push(`DEAL.draftMs vaut ${montre(d.draftMs)} : une durée d'au moins 1000 ms est attendue.`);
  if (!(Number.isInteger(d.redrawAttempts) && (d.redrawAttempts as number) >= 1)) errors.push(`DEAL.redrawAttempts vaut ${montre(d.redrawAttempts)} : un entier d'au moins 1 est attendu.`);
  const families = Object.keys(FAMILY_WORDS);
  const rarities = Object.keys(RARITY_WORDS);
  const limits = d.handLimits;
  if (!isPlainObject(limits)) {
    errors.push(`DEAL.handLimits vaut ${montre(limits)} : { maxPerRarity, maxPerFamily } est attendu.`);
  } else {
    for (const k of inconnues(limits, ['maxPerRarity', 'maxPerFamily'])) errors.push(`DEAL.handLimits.${k} : réglage inconnu (réglages : maxPerRarity, maxPerFamily).`);
    const table = [
      ['maxPerFamily', families, 'famille inconnue', 'familles'],
      ['maxPerRarity', rarities, 'rareté inconnue', 'raretés'],
    ] as const;
    for (const [key, known, inconnu, noms] of table) {
      const m = limits[key];
      if (!isPlainObject(m)) {
        errors.push(`DEAL.handLimits.${key} vaut ${montre(m)} : un objet est attendu (par exemple { ${known[0]}: 2 }).`);
        continue;
      }
      for (const k of inconnues(m, known)) errors.push(`DEAL.handLimits.${key}.${k} : ${inconnu} (${noms} : ${known.join(', ')}).`);
      for (const [k, x] of Object.entries(m)) {
        if (x !== undefined && !(Number.isInteger(x) && (x as number) >= 0)) errors.push(`DEAL.handLimits.${key}.${k} vaut ${montre(x)} : un entier positif ou nul est attendu.`);
      }
    }
  }
  const w = d.rarityWeight;
  if (!isPlainObject(w)) errors.push(`DEAL.rarityWeight vaut ${montre(w)} : un poids par rareté est attendu.`);
  else {
    for (const k of inconnues(w, rarities)) errors.push(`DEAL.rarityWeight.${k} : rareté inconnue (raretés : ${rarities.join(', ')}).`);
    for (const [k, x] of Object.entries(w)) if (!(typeof x === 'number' && Number.isFinite(x) && x > 0)) errors.push(`DEAL.rarityWeight.${k} vaut ${montre(x)} : un poids positif est attendu.`);
  }
  return errors;
}

interface Reserve {
  timed: boolean;
  vsBot: boolean;
}

/** Réserves possibles d'un contexte (avec ou sans pendule, contre l'IA ou non) et mode de constitution des mains. */
function reservesOf(ctx: RulesContext, deal: Readonly<DealSettings>): { catalogs: Catalog[]; reserves: Reserve[]; drawn: boolean } {
  const offered = CATALOGS.map(c => c.id).filter(c => cardsOf(c).length > 0);
  const live = TIME_CONTROLS.filter(t => !t.archived);
  const quick = live.filter(t => t.quick);
  const variants = (list: typeof live, vsBot: boolean): Reserve[] => {
    const out: Reserve[] = [];
    if (list.some(t => t.tc)) out.push({ timed: true, vsBot });
    if (list.some(t => !t.tc)) out.push({ timed: false, vsBot });
    return out;
  };
  switch (ctx) {
    case 'classee':
    case 'amicale':
      return { catalogs: offered, reserves: variants(quick, false), drawn: !deal.draft };
    case 'invitation':
      return { catalogs: offered, reserves: variants(live, false), drawn: !deal.draft };
    case 'ia':
      return { catalogs: offered, reserves: variants(live, true), drawn: !deal.draft };
    case 'accueil':
      // Contre l'Oracle, et en direct entre deux visiteurs : toujours tiré au hasard.
      return { catalogs: [HOME.catalog], reserves: [{ timed: HOME.timed, vsBot: HOME.vsBot }, { timed: HOME.timed, vsBot: false }], drawn: true };
  }
}

/**
 * Erreurs de configuration, en français (une phrase par erreur, avec le réglage à changer) ; vide si toutes les
 * parties sont jouables : chaque contexte (classée, amicale, invitation, IA, accueil) × chaque réserve (avec ou sans
 * pendule, contre l'IA ou non). Un nom inconnu (réglage, contexte, famille, rareté, carte suspendue) est une erreur :
 * une faute de frappe ne passe jamais pour un réglage pris en compte.
 */
export function checkRules(cfg: RulesConfig = {}): string[] {
  const game = cfg.game ?? GAME_RULES;
  const ov = cfg.game ? null : override;
  const byContext = cfg.byContext ?? RULES_BY_CONTEXT;
  const deal = cfg.deal ?? DEAL;
  const suspended = cfg.suspended ?? SUSPENDED_CARDS;
  const tuning = cfg.tuning ?? CARD_TUNING;
  const fenError = cfg.fenError ?? basicFenError;
  const errors = new Set<string>();
  const reglages = SETTING_KEYS.join(', ');

  // Noms inconnus (fautes de frappe)
  for (const k of inconnues(game, SETTING_KEYS)) errors.add(`GAME_RULES.${k} : réglage inconnu (réglages : ${reglages}).`);
  for (const k of inconnues(ov, SETTING_KEYS)) errors.add(`SPELLMATE_TEST_RULES.${k} : réglage inconnu (réglages : ${reglages}).`);
  for (const [ctx, own] of Object.entries(byContext)) {
    if (!(RULES_CONTEXTS as readonly string[]).includes(ctx)) {
      errors.add(`RULES_BY_CONTEXT.${ctx} : contexte inconnu (contextes : ${RULES_CONTEXTS.join(', ')}).`);
      continue;
    }
    if (own !== undefined && !isPlainObject(own)) errors.add(`RULES_BY_CONTEXT.${ctx} vaut ${montre(own)} : un objet de réglages est attendu.`);
    for (const k of inconnues(own, SETTING_KEYS)) errors.add(`RULES_BY_CONTEXT.${ctx}.${k} : réglage inconnu (réglages : ${reglages}).`);
  }

  // Équilibrage des cartes, cartes suspendues, mise en place
  for (const e of tuningErrors(tuning)) errors.add(e);
  for (const id of suspended) if (!Object.hasOwn(CARDS, id)) errors.add(`SUSPENDED_CARDS contient « ${id} », qui n'est pas une carte.`);
  for (const e of dealErrors(deal)) errors.add(e);

  for (const ctx of RULES_CONTEXTS) {
    const own = isPlainObject(byContext[ctx]) ? byContext[ctx] : {};
    const s = overlay(game, own, ov);
    const has = (o: Readonly<Partial<GameRulesSettings>> | null, k: keyof GameRulesSettings) => !!o && o[k] !== undefined;
    const where = (k: keyof GameRulesSettings) =>
      has(ov, k) ? `SPELLMATE_TEST_RULES.${k}` : has(own, k) ? `RULES_BY_CONTEXT.${ctx}.${k}` : `GAME_RULES.${k}`;
    // Le nombre de cartes vient-il du contexte lui-même ? Sinon, on propose aussi de le régler pour ce contexte.
    const fix = where('cardsPerPlayer').startsWith('GAME_RULES') ? `, ou réglez RULES_BY_CONTEXT.${ctx}` : '';
    // Cartes par tour et cartes en main valent-elles partout la même chose ? Alors une seule phrase, sans contexte.
    const propre = has(own, 'cardsPerTurn') || has(own, 'cardsPerPlayer');

    // Types, bornes et cohérence
    for (const e of settingsErrors(s, { where, label: propre ? CONTEXT_LABEL[ctx] : undefined, fenError })) errors.add(e);

    // Réserves
    const n = s.cardsPerPlayer;
    if (!Number.isInteger(n) || n < 1 || !isPlainObject(deal.handLimits)) continue;
    const { catalogs, reserves, drawn } = reservesOf(ctx, deal);
    for (const catalog of catalogs) {
      for (const res of reserves) {
        const pool = poolOf(catalog, res, suspended);
        const out = cardsOf(catalog).filter(id => !pool.includes(id)).map(id => CARDS[id].name);
        const hors = out.length ? ` (hors ${out.join(', ')})` : '';
        if (n > pool.length) {
          errors.add(`${compte(n, 'carte')} par joueur ${CONTEXT_LABEL[ctx]} : la réserve ${naQue(pool.length)}${hors}. Baissez ${where('cardsPerPlayer')}${fix}.`);
          continue;
        }
        if (!drawn && !deal.limitsInDraft) continue;
        const max = maxValidHand(pool, deal.handLimits);
        if (n <= max) continue;
        errors.add(`${compte(n, 'carte')} par joueur ${CONTEXT_LABEL[ctx]} : ${limitsExplanation(pool, deal.handLimits, max)}${fix}.`);
      }
    }
  }
  return [...errors];
}

/** Pourquoi la plus grande main valide est trop petite, et quel réglage relever. */
function limitsExplanation(pool: readonly CardId[], l: HandLimits, max: number): string {
  const binding: { what: string; key: string; mots: Mots; outside: number; cap: number }[] = [];
  const add = (cap: number, mots: Mots, key: string, inside: number) => {
    const what = cap <= 0 ? `${mots.f ? 'aucune' : 'aucun'} ${mots.one}` : `au plus ${cap} ${cap > 1 ? mots.many : mots.one}`;
    binding.push({ what, key, mots, outside: pool.length - inside, cap });
  };
  for (const [f, cap] of Object.entries(l.maxPerFamily) as [Family, number | undefined][]) {
    const inside = pool.filter(id => CARDS[id].family === f).length;
    if (cap !== undefined && inside > cap) add(cap, FAMILY_WORDS[f], `maxPerFamily.${f}`, inside);
  }
  for (const [k, cap] of Object.entries(l.maxPerRarity) as [Rarity, number | undefined][]) {
    const inside = pool.filter(id => CARDS[id].rarity === k).length;
    if (cap !== undefined && inside > cap) add(cap, RARITY_WORDS[k], `maxPerRarity.${k}`, inside);
  }
  if (binding.length === 1) {
    const b = binding[0];
    const avec = b.cap <= 0 ? `sans ${b.what}` : `avec ${b.what}`;
    const autres =
      b.outside <= 0
        ? `la réserve n'a aucune autre carte`
        : b.outside === 1
          ? `la réserve n'a qu'une carte qui n'est pas ${b.mots.notOne}`
          : `la réserve n'a que ${b.outside} cartes qui ne sont pas ${b.mots.notMany}`;
    return `impossible ${avec}, ${autres} (main valide maximale : ${max}). Relevez DEAL.handLimits.${b.key}`;
  }
  return `impossible avec les contraintes du tirage (${binding.map(b => b.what).join(', ')}) : main valide maximale ${max}. Relevez DEAL.handLimits`;
}

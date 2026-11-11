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
//   démarrage du serveur et dans les tests.
//
// Le moteur ne lit les règles que dans game.ts (rulesOf, tuneOf), jamais dans chess.ts, la recherche de l'IA ou
// positionKey.

import { CARD_IDS, CARDS, CATALOGS, cardsOf } from './cards';
import type { CardDef, CardId, Catalog, Family, Rarity } from './cards';
import { fromFen } from './chess';
import { HOME } from './config/home';
import {
  BOUNDS, DEAL, GAME_RULES, RULES_BY_CONTEXT, RULES_CONTEXTS, RULES_SCHEMA, RULES_V1, SUSPENDED_CARDS, deepFreeze,
} from './config/rules';
import type { CardTuning, DealSettings, GameRulesSettings, HandLimits, Rules, RulesContext } from './config/rules';
import { TIME_CONTROLS } from './protocol';

export type { CardTuning, GameRulesSettings, HandLimits, Rules, RulesContext } from './config/rules';
export { RULES_V1 } from './config/rules';

// ---------------------------------------------------------------------------------------------
// Règles des nouvelles parties

/** Surcharge de test (serveur jetable, SPELLMATE_TEST_RULES) : prioritaire sur GAME_RULES et RULES_BY_CONTEXT. */
let override: Readonly<Partial<GameRulesSettings>> | null = null;
const memo = new Map<RulesContext, Rules>();

const SETTING_KEYS: readonly (keyof GameRulesSettings)[] = [
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

/**
 * Règles lues d'une source extérieure (sauvegarde, en-tête PGN, reprise) : l'objet si sa forme est celle de
 * `Rules` au schéma connu, sinon null (schéma inconnu : partie plus récente que ce code, ou données abîmées).
 */
export function parseRules(x: unknown): Rules | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (r.schema !== RULES_SCHEMA) return null;
  const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v);
  if (!int(r.cardsPerPlayer) || !int(r.cardsPerTurn) || !int(r.presageDelay) || !int(r.fiftyHalfmoves) || !int(r.repetitions)) return null;
  if (typeof r.cardEndsTurn !== 'boolean' || typeof r.handsVisible !== 'boolean') return null;
  if (r.startFen !== null && typeof r.startFen !== 'string') return null;
  if (!r.tuning || typeof r.tuning !== 'object') return null;
  for (const t of Object.values(r.tuning as Record<string, unknown>)) {
    if (!t || typeof t !== 'object') return null;
    const c = t as Record<string, unknown>;
    if (c.coups !== undefined && !int(c.coups)) return null;
    if (c.clockRate !== undefined && typeof c.clockRate !== 'number') return null;
    if (c.ranks !== undefined && !(Array.isArray(c.ranks) && c.ranks.every(int))) return null;
  }
  const parsed = deepFreeze(JSON.parse(JSON.stringify(x)) as Rules);
  return sameRules(parsed, RULES_V1) ? RULES_V1 : parsed;
}

/** Résumé d'une ligne des règles, pour le journal du serveur (nombre de cartes, par tour, moment de la carte…). */
export function rulesSummary(r: Rules): string {
  return [
    `${r.cardsPerPlayer} cartes par joueur`,
    `${r.cardsPerTurn} par tour`,
    r.cardEndsTurn ? 'à la place du coup' : 'avant le coup',
    r.handsVisible ? 'mains visibles' : 'mains cachées',
    `Présage en ${r.presageDelay} demi-coups`,
    `${r.fiftyHalfmoves / 2} coups sans prise`,
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
  /** Vérification d'une position de départ (défaut : vérification de base ; pgn.ts a validateFen, plus complète). */
  fenError?: (fen: string) => string | null;
}

const CONTEXT_LABEL: Record<RulesContext, string> = {
  classee: 'en partie classée',
  amicale: 'en partie amicale',
  invitation: 'en invitation',
  ia: "contre l'IA",
  accueil: "à l'accueil",
};

/** Noms des familles et des raretés dans les messages : singulier, pluriel, et « qui ne sont pas … ». */
const FAMILY_WORDS: Record<Family, { one: string; many: string; not: string }> = {
  climat: { one: 'Climat', many: 'Climats', not: 'des Climats' },
  terrain: { one: 'Terrain', many: 'Terrains', not: 'des Terrains' },
  evenement: { one: 'Événement', many: 'Événements', not: 'des Événements' },
  duel: { one: 'carte du Duel', many: 'cartes du Duel', not: 'du Duel' },
};
const RARITY_WORDS: Record<Rarity, { one: string; many: string; not: string }> = {
  commune: { one: 'Commune', many: 'Communes', not: 'Communes' },
  rare: { one: 'Rare', many: 'Rares', not: 'Rares' },
  épique: { one: 'Épique', many: 'Épiques', not: 'Épiques' },
  légendaire: { one: 'Légendaire', many: 'Légendaires', not: 'Légendaires' },
};
const cartes = (n: number) => `${n} ${n > 1 ? 'cartes' : 'carte'}`;

/** Vérification de base d'une position de départ : forme du FEN, un roi par camp, roque standard seulement. */
export function basicFenError(fen: string): string | null {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2 || parts[0].split('/').length !== 8) return 'FEN invalide (position et trait attendus).';
  if (!/^[wb]$/.test(parts[1])) return 'FEN invalide : le trait doit être « w » ou « b ».';
  if (parts[2] && !/^(-|K?Q?k?q?)$/.test(parts[2])) return 'FEN invalide : droits de roque (roque standard seulement : KQkq).';
  let board;
  try {
    board = fromFen(fen).pos.board;
  } catch {
    return 'FEN illisible.';
  }
  const kings = (c: 'w' | 'b') => board.filter(p => p?.t === 'k' && p.c === c).length;
  if (kings('w') !== 1 || kings('b') !== 1) return 'FEN invalide : il faut exactement un roi de chaque camp.';
  const at = (i: number, t: string, c: 'w' | 'b') => board[i]?.t === t && board[i]?.c === c;
  const cr = parts[2] ?? '-';
  if ((cr.includes('K') && !(at(4, 'k', 'w') && at(7, 'r', 'w'))) || (cr.includes('Q') && !(at(4, 'k', 'w') && at(0, 'r', 'w')))
    || (cr.includes('k') && !(at(60, 'k', 'b') && at(63, 'r', 'b'))) || (cr.includes('q') && !(at(60, 'k', 'b') && at(56, 'r', 'b')))) {
    return 'FEN invalide : un droit de roque ne correspond pas au roi et à la tour en place (roque standard seulement).';
  }
  return null;
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
 * pendule, contre l'IA ou non).
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

  // Équilibrage des cartes
  for (const [id, t] of Object.entries(tuning) as [CardId, CardTuning][]) {
    if (t.coups !== undefined && !(Number.isInteger(t.coups) && t.coups >= 1)) errors.add(`CARDS.${id}.coups vaut ${t.coups} : un entier d'au moins 1 est attendu.`);
    if (t.ranks !== undefined && (!t.ranks.length || !t.ranks.every(x => Number.isInteger(x) && x >= 0 && x <= 7))) {
      errors.add(`CARDS.${id}.ranks vaut [${t.ranks.join(', ')}] : des rangées de 0 à 7 sont attendues.`);
    }
    if (t.clockRate !== undefined && !(t.clockRate > 0)) errors.add(`CARDS.${id}.clockRate vaut ${t.clockRate} : une vitesse positive est attendue.`);
  }
  for (const id of suspended) if (!Object.hasOwn(CARDS, id)) errors.add(`SUSPENDED_CARDS contient « ${id} », qui n'est pas une carte.`);

  // Mise en place
  if (!(Number.isInteger(deal.draftMs) && deal.draftMs >= 1000)) errors.add(`DEAL.draftMs vaut ${deal.draftMs} : une durée d'au moins 1000 ms est attendue.`);
  if (!(Number.isInteger(deal.redrawAttempts) && deal.redrawAttempts >= 1)) errors.add(`DEAL.redrawAttempts vaut ${deal.redrawAttempts} : au moins 1.`);
  for (const [k, w] of Object.entries(deal.rarityWeight)) if (!(w > 0)) errors.add(`DEAL.rarityWeight.${k} vaut ${w} : un poids positif est attendu.`);

  for (const ctx of RULES_CONTEXTS) {
    const own = byContext[ctx] ?? {};
    const s = overlay(game, own, ov);
    const has = (o: Readonly<Partial<GameRulesSettings>> | null, k: keyof GameRulesSettings) => !!o && o[k] !== undefined;
    const where = (k: keyof GameRulesSettings) =>
      has(ov, k) ? `SPELLMATE_TEST_RULES.${k}` : has(own, k) ? `RULES_BY_CONTEXT.${ctx}.${k}` : `GAME_RULES.${k}`;
    // Le nombre de cartes vient-il du contexte lui-même ? Sinon, on propose aussi de le régler pour ce contexte.
    const fix = where('cardsPerPlayer').startsWith('GAME_RULES') ? `, ou réglez RULES_BY_CONTEXT.${ctx}` : '';

    // Bornes et cohérence
    for (const k of ['cardsPerPlayer', 'cardsPerTurn', 'presageDelay'] as const) {
      const [lo, hi] = BOUNDS[k];
      if (!Number.isInteger(s[k]) || s[k] < lo || s[k] > hi) errors.add(`${where(k)} vaut ${s[k]} : hors des bornes (${lo} à ${hi}, BOUNDS).`);
    }
    if (s.cardsPerTurn > s.cardsPerPlayer) {
      errors.add(`${where('cardsPerTurn')} vaut ${s.cardsPerTurn} : une main n'a que ${cartes(s.cardsPerPlayer)} ${CONTEXT_LABEL[ctx]}.`);
    }
    if (s.cardEndsTurn && s.cardsPerTurn !== 1) {
      errors.add(`${where('cardEndsTurn')} (la carte remplace le coup) impose 1 carte par tour, mais ${where('cardsPerTurn')} vaut ${s.cardsPerTurn}.`);
    }
    if (s.presageDelay % 2 !== 0) {
      errors.add(`${where('presageDelay')} vaut ${s.presageDelay} : il doit être pair (un Présage arrive au début d'un tour de son lanceur).`);
    }
    if (!s.handsVisible) errors.add(`${where('handsVisible')} vaut false : les mains cachées ne sont pas encore prises en charge.`);
    if (!(Number.isInteger(s.fiftyHalfmoves) && s.fiftyHalfmoves >= 2)) errors.add(`${where('fiftyHalfmoves')} vaut ${s.fiftyHalfmoves} : un nombre entier de demi-coups est attendu (100 pour 50 coups).`);
    if (!(Number.isInteger(s.repetitions) && s.repetitions >= 2)) errors.add(`${where('repetitions')} vaut ${s.repetitions} : au moins 2.`);
    if (s.startFen !== null) {
      const e = fenError(s.startFen);
      if (e) errors.add(`${where('startFen')} : ${e}`);
    }

    // Réserves
    const n = s.cardsPerPlayer;
    if (!Number.isInteger(n) || n < 1) continue;
    const { catalogs, reserves, drawn } = reservesOf(ctx, deal);
    for (const catalog of catalogs) {
      for (const res of reserves) {
        const pool = poolOf(catalog, res, suspended);
        const out = cardsOf(catalog).filter(id => !pool.includes(id)).map(id => CARDS[id].name);
        const hors = out.length ? ` (hors ${out.join(', ')})` : '';
        if (n > pool.length) {
          errors.add(`${n} cartes par joueur ${CONTEXT_LABEL[ctx]} : la réserve n'a que ${cartes(pool.length)}${hors}. Baissez ${where('cardsPerPlayer')}${fix}.`);
          continue;
        }
        if (!drawn && !deal.limitsInDraft) continue;
        const max = maxValidHand(pool, deal.handLimits);
        if (n <= max) continue;
        errors.add(`${n} cartes par joueur ${CONTEXT_LABEL[ctx]} : ${limitsExplanation(pool, deal.handLimits, max)}${fix}.`);
      }
    }
  }
  return [...errors];
}

/** Pourquoi la plus grande main valide est trop petite, et quel réglage relever. */
function limitsExplanation(pool: readonly CardId[], l: HandLimits, max: number): string {
  const binding: { what: string; key: string; not: string; outside: number }[] = [];
  const add = (cap: number, w: { one: string; many: string; not: string }, key: string, inside: number) => {
    binding.push({ what: `au plus ${cap} ${cap > 1 ? w.many : w.one}`, key, not: w.not, outside: pool.length - inside });
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
    return `impossible avec ${b.what}, la réserve n'a que ${cartes(b.outside)} qui ne sont pas ${b.not} (main valide maximale : ${max}). Relevez DEAL.handLimits.${b.key}`;
  }
  return `impossible avec les contraintes du tirage (${binding.map(b => b.what).join(', ')}) : main valide maximale ${max}. Relevez DEAL.handLimits`;
}

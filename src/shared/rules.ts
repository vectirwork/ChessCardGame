// Règles d'une partie : le noyau (rulesCore.ts, réexporté ici en entier) et la validation, celle de la configuration
// du jour (checkRules) et celle des règles venues de l'extérieur (parseRules : sauvegarde, en-tête PGN, reprise).
//
// - rulesFor(ctx), rulesOf(s), stampRules(r), tuneOf, castsLeft, cardEndsTurn, poolOf, validHand, maxValidHand,
//   basicFenError : voir rulesCore.ts.
// - checkRules() : liste des erreurs de configuration, en français ; vide si tout est jouable. Appelée au build, au
//   démarrage du serveur et dans les tests. Un nom de réglage, de contexte, de famille ou de rareté inconnu (faute de
//   frappe) est une erreur, comme une valeur hors bornes.
// - parseRules(x) : règles lues d'une source extérieure, refusées si leur forme ou leurs valeurs ne sont pas jouables
//   (mêmes vérifications que checkRules : settingsErrors, tuningErrors).
//
// Le serveur, l'Analyse (pgn.ts) et les tests importent ce module. Le code chargé par l'accueil (moteur, IA, client)
// importe rulesCore.ts : la validation reste ainsi hors du morceau de l'accueil.

import { CARDS, CATALOGS, cardsOf } from './cards';
import type { CardId, Catalog, Family, Rarity } from './cards';
import { fromFen, hasLegalMove } from './chess';
import { HOME } from './config/home';
import {
  BOUNDS, DEAL, GAME_RULES, RULES_BY_CONTEXT, RULES_CONTEXTS, RULES_SCHEMA, RULES_V1, SUSPENDED_CARDS, deepFreeze,
} from './config/rules';
import type { CardTuning, DealSettings, GameRulesSettings, HandLimits, Rules, RulesContext } from './config/rules';
import { TIME_CONTROLS } from './protocol';
import {
  CARD_TUNING, SETTING_KEYS, basicFenError, maxValidHand, overlay, poolOf, rulesOverride, sameRules,
} from './rulesCore';
import { compte } from './text/fr';

export * from './rulesCore';

/** Rangées permises à la Grande Marée (relatives au camp du pion, 0 à 7) : de la 2e à la 6e. */
const TIDE_RANKS = [1, 5] as const;

/** Noms des réglages de la mise en place (DEAL) et de l'équilibrage d'une carte. */
const DEAL_KEYS: readonly (keyof DealSettings)[] = ['draft', 'draftMs', 'handLimits', 'limitsInDraft', 'rarityWeight', 'redrawAttempts'];
const TUNING_KEYS: readonly (keyof CardTuning)[] = ['coups', 'ranks', 'clockRate'];

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

/**
 * Résumé d'une ligne des règles, pour le journal du serveur (nombre de cartes, par tour, moment de la carte…), avec la
 * mise en place `deal` (défaut : DEAL ; le serveur passe la sienne, surcharge de test comprise : dealSettings()).
 */
export function rulesSummary(r: Rules, deal: Readonly<Pick<DealSettings, 'draft' | 'draftMs'>> = DEAL): string {
  return [
    `${compte(r.cardsPerPlayer, 'carte')} par joueur`,
    `${r.cardsPerTurn} par tour`,
    r.cardEndsTurn ? 'à la place du coup' : 'avant le coup',
    r.handsVisible ? 'mains visibles' : 'mains cachées',
    `Présage en ${r.presageDelay} demi-coups`,
    `nulle après ${compte(r.fiftyHalfmoves / 2, 'coup')} sans prise ni coup de pion`,
    `répétition ×${r.repetitions}`,
    r.startFen ? `départ ${r.startFen}` : 'position standard',
    `choix des cartes ${deal.draft ? `en ${deal.draftMs / 1000} s` : 'remplacé par le tirage'}`,
  ].join(', ');
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

/** La position n'a-t-elle aucun coup pour le camp au trait (mat ou pat) ? Une forme illisible relève de fenError. */
function finished(fen: string): boolean {
  try {
    return !hasLegalMove(fromFen(fen).pos);
  } catch {
    return false;
  }
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
    // Position valable mais sans coup pour le camp au trait : la partie naîtrait bloquée (createGame ne juge pas la fin).
    else if (finished(v.startFen)) errors.push(`${where('startFen')} : la position de départ est déjà finie (mat ou pat).`);
  } else if (v.startFen !== null) {
    errors.push(`${where('startFen')} vaut ${montre(v.startFen)} : une position FEN (texte) ou null est attendue.`);
  }
  return errors;
}

/**
 * Erreurs d'un équilibrage de cartes : `coups` entier d'au moins 1, `ranks` rangées entières de 0 à 7 (au moins
 * une ; de 1 à 5 pour la Grande Marée, relatives au camp du pion), `clockRate` vitesse finie et positive. `prefix`
 * nomme la source dans les messages (CARDS).
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
    } else if (id === 'tide' && Array.isArray(r) && !r.every(x => x >= TIDE_RANKS[0] && x <= TIDE_RANKS[1])) {
      // Grande Marée : rangées relatives au camp du pion. Un pion poussé depuis la 7e rangée atteindrait la dernière
      // sans être promu, et la 8e n'a pas de case suivante.
      errors.push(`${prefix}.tide.ranks vaut ${montre(r)} : de ${TIDE_RANKS[0]} à ${TIDE_RANKS[1]} seulement pour la Grande Marée (un pion poussé depuis la 7e rangée atteindrait la promotion sans être promu).`);
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
  const ov = cfg.game ? null : rulesOverride();
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

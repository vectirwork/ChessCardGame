// Grammaire française des textes du site : nombres en lettres, pluriels, possessifs, durées, ordinaux, listes,
// prix. Aucun import. Remplace les copies éparses (WORDS de CardDraft, trois `plural`, quatre `mm:ss`, ordinal de
// PageScene, chiffres romains en liste, 'fr-FR' écrit en dur).
//
// Orthographe traditionnelle des nombres : « vingt et un », « soixante et onze », « quatre-vingts »,
// « quatre-vingt-un ». Pas d'espace insécable : le site n'en écrit nulle part aujourd'hui.

/** Langue et région des formats (nombres, dates, prix). */
export const LOCALE = 'fr-FR';

export type Genre = 'm' | 'f';

const UNITES = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/**
 * Nombre en lettres, de 0 à 99 (au-delà, ou non entier : en chiffres). `genre` accorde « un » : « une carte »,
 * « vingt et une cartes », « quatre-vingt-une cartes ».
 */
export function enLettres(n: number, genre: Genre = 'm'): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  const un = genre === 'f' ? 'une' : 'un';
  if (n === 1) return un;
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7 || d === 9) {
    // 70 à 79 : soixante-dix, soixante et onze… ; 90 à 99 : quatre-vingt-dix, quatre-vingt-onze…
    const base = d === 7 ? 'soixante' : 'quatre-vingt';
    const reste = 10 + u;
    if (d === 7 && u === 1) return `${base} et ${UNITES[11]}`;
    return `${base}-${UNITES[reste]}`;
  }
  if (d === 8) return u === 0 ? 'quatre-vingts' : `quatre-vingt-${u === 1 ? un : UNITES[u]}`;
  if (u === 0) return DIZAINES[d];
  if (u === 1) return `${DIZAINES[d]} et ${un}`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

/** Première lettre en capitale : « trois » → « Trois ». */
export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Forme d'un nom : un mot (pluriel en « s ») ou une paire [singulier, pluriel]. */
export type Nom = string | readonly [string, string];

/** Singulier pour 0 et 1 (règle française), pluriel au-delà : pluriel(2, 'carte') → « cartes ». */
export function pluriel(n: number, nom: Nom): string {
  const [sg, pl] = typeof nom === 'string' ? [nom, `${nom}s`] : nom;
  return Math.abs(n) < 2 ? sg : pl;
}

export interface CompteOptions {
  /** Nombre en lettres (0 à 99) plutôt qu'en chiffres. */
  lettres?: boolean;
  /** Genre du nom, pour « une » en lettres. */
  genre?: Genre;
}

/** Nombre et nom accordé : compte(1, 'carte') → « 1 carte » ; compte(3, 'carte', { lettres: true, genre: 'f' }) → « trois cartes ». */
export function compte(n: number, nom: Nom, opts: CompteOptions = {}): string {
  const nombre = opts.lettres ? enLettres(n, opts.genre) : String(n);
  return `${nombre} ${pluriel(n, nom)}`;
}

export interface PossessifOptions {
  genre?: Genre;
  /** 'vous' : votre, vos (défaut) ; 'il' : son, sa, ses. */
  personne?: 'vous' | 'il';
}

/**
 * Possessif et nombre en lettres : possessif(3, 'carte', { genre: 'f' }) → « vos trois cartes » ;
 * possessif(1, 'carte') → « votre carte » ; personne 'il' : « ses trois cartes », « sa carte », « son sort ».
 */
export function possessif(n: number, nom: Nom, opts: PossessifOptions = {}): string {
  const [sg, pl] = typeof nom === 'string' ? [nom, `${nom}s`] : nom;
  if (opts.personne === 'il') {
    if (n === 1) return `${opts.genre === 'f' && !/^[aeiouyhéèêàâîôûœ]/i.test(sg) ? 'sa' : 'son'} ${sg}`;
    return `ses ${enLettres(n, opts.genre)} ${pl}`;
  }
  return n === 1 ? `votre ${sg}` : `vos ${enLettres(n, opts.genre)} ${pl}`;
}

const UNITES_DUREE: readonly { s: number; nom: readonly [string, string]; court: string; genre: Genre }[] = [
  { s: 86_400, nom: ['jour', 'jours'], court: 'j', genre: 'm' },
  { s: 3600, nom: ['heure', 'heures'], court: 'h', genre: 'f' },
  { s: 60, nom: ['minute', 'minutes'], court: 'min', genre: 'f' },
  { s: 1, nom: ['seconde', 'secondes'], court: 's', genre: 'f' },
];

export interface DureeOptions {
  /** Unités abrégées : « 45 s », « 2 min 30 s », « 1 h ». */
  court?: boolean;
  /** Nombres en lettres : « une heure », « quarante-cinq secondes ». */
  lettres?: boolean;
}

/**
 * Durée lisible, en millisecondes arrondies à la seconde : 45 000 → « 45 secondes » ; 30 000 → « 30 secondes » ;
 * 90 000 → « 1 minute et 30 secondes » ; 3 600 000 → « 1 heure » ; 3 jours → « 3 jours ». Les unités nulles sont omises.
 */
export function duree(ms: number, opts: DureeOptions = {}): string {
  let reste = Math.max(0, Math.round(ms / 1000));
  const parts: string[] = [];
  for (const u of UNITES_DUREE) {
    const k = Math.floor(reste / u.s);
    reste -= k * u.s;
    if (!k) continue;
    if (opts.court) parts.push(`${opts.lettres ? enLettres(k, u.genre) : k} ${u.court}`);
    else parts.push(compte(k, u.nom, { lettres: opts.lettres, genre: u.genre }));
  }
  if (!parts.length) return opts.court ? '0 s' : opts.lettres ? 'zéro seconde' : '0 seconde';
  return opts.court ? parts.join(' ') : liste(parts);
}

export interface MmssOptions {
  /** Au-delà d'une heure : « 1:05:00 » (sinon les minutes continuent : « 65:00 »). */
  heures?: boolean;
}

/** Secondes en « m:ss » : 75 → « 1:15 », 9 → « 0:09 ». Les secondes sont arrondies à l'entier inférieur. */
export function mmss(secondes: number, opts: MmssOptions = {}): string {
  const s = Math.max(0, Math.floor(secondes));
  const p = (x: number) => String(x).padStart(2, '0');
  if (opts.heures && s >= 3600) return `${Math.floor(s / 3600)}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  return `${Math.floor(s / 60)}:${p(s % 60)}`;
}

/** Ordinal abrégé : 1 → « 1er » (« 1re » au féminin), 2 → « 2e ». */
export function ordinal(n: number, genre: Genre = 'm'): string {
  if (n === 1) return genre === 'f' ? '1re' : '1er';
  return `${n}e`;
}

/** Ordinal en lettres : 1 → « premier » (« première »), 2 → « deuxième », 21 → « vingt et unième », 80 → « quatre-vingtième ». */
export function ordinalLettres(n: number, genre: Genre = 'm'): string {
  if (n === 1) return genre === 'f' ? 'première' : 'premier';
  const c = enLettres(n);
  if (c === String(n)) return `${n}e`;
  const base = c
    .replace(/quatre-vingts$/, 'quatre-vingt')
    .replace(/cinq$/, 'cinqu')
    .replace(/neuf$/, 'neuv')
    .replace(/e$/, '');
  return `${base}ième`;
}

const ROMAINS: readonly [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** Chiffres romains, de 1 à 3999 (au-delà, ou non entier : en chiffres) : 4 → « IV ». */
export function romain(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n);
  let out = '';
  let r = n;
  for (const [v, s] of ROMAINS) {
    while (r >= v) {
      out += s;
      r -= v;
    }
  }
  return out;
}

/**
 * Énumération : liste(['a', 'b', 'c']) → « a, b et c » ; avec 'ou' → « a, b ou c » ; avec ',' → « a, b, c ».
 */
export function liste(items: readonly string[], conj: 'et' | 'ou' | ',' = 'et'): string {
  if (conj === ',' || items.length < 2) return items.join(', ');
  return `${items.slice(0, -1).join(', ')} ${conj} ${items[items.length - 1]}`;
}

/** Prix en centimes, au format du site : 299 → « 2,99 € ». */
export function prix(centimes: number, devise = 'EUR'): string {
  return (centimes / 100).toLocaleString(LOCALE, { style: 'currency', currency: devise });
}

/** Nombre au format du site : 9120 → « 9 120 » (espace fine insécable de Intl). */
export function nombre(n: number, opts?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(LOCALE, opts);
}

/**
 * Apostrophes d'un texte : 'droite' (') ou 'courbe' (’). Certaines pages écrivent l'une, d'autres l'autre : une
 * phrase partagée garde ainsi le caractère exact de chaque page.
 */
export function apostrophes(s: string, style: 'droite' | 'courbe'): string {
  return style === 'droite' ? s.replace(/’/g, "'") : s.replace(/'/g, '’');
}

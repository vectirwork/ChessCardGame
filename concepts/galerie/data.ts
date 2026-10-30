// Spellmate · La Galerie : textes et données éditoriales.
import type { CardId } from '../../src/shared/cards';
import { ITEMS, PRODUCTS, formatPrice } from '../../src/shared/catalog';
import type { Flourish, ParticleShape } from '../../src/shared/catalog';
import { isHouseItem } from './maison';

export interface Room {
  id: string;
  num: string;
  /** Nom court (navigation). */
  short: string;
  /** Nom complet du lieu. */
  name: string;
}

export const ROOMS: Room[] = [
  { id: 'hall', num: '01', short: 'Le Hall', name: 'Le Hall' },
  { id: 'pouvoirs', num: '02', short: 'Pouvoirs', name: 'La Salle des pouvoirs' },
  { id: 'atelier', num: '03', short: 'Atelier', name: 'Atelier des skins' },
  { id: 'salon', num: '04', short: 'Salon', name: 'Le Salon de jeu' },
  { id: 'sortie', num: '05', short: 'Sortie', name: 'La Sortie' },
];

/** Accrochage de la Salle des pouvoirs : trois ailes par rareté, chacune ouverte par une pièce phare. */
export interface Wing {
  id: string;
  n: string;
  /** Titre en deux lignes ; la seconde est en italique. */
  title: [string, string];
  text: string;
  flagship: CardId;
  cards: { id: CardId; place: 'haut' | 'bas'; note?: string }[];
}

export const WINGS: Wing[] = [
  {
    id: 'communes',
    n: 'I',
    title: ['Aile des', 'communes'],
    text: 'Quatre gestes simples, qu’on apprend en une partie et qu’on maîtrise en cent : le froid, l’armure, l’élan.',
    flagship: 'ice_wall',
    cards: [
      { id: 'freeze', place: 'bas' },
      { id: 'shield', place: 'haut' },
      { id: 'knight_leap', place: 'bas' },
    ],
  },
  {
    id: 'rares',
    n: 'II',
    title: ['Aile des', 'rares'],
    text: 'Cinq pouvoirs qui tordent les lois du plateau. La foudre, la pesanteur, les murs qu’on traverse, le temps.',
    flagship: 'lightning',
    cards: [
      { id: 'gravity', place: 'haut' },
      { id: 'swap', place: 'bas' },
      { id: 'phase', place: 'haut' },
      { id: 'time_warp', place: 'bas', note: 'Parties avec pendule uniquement.' },
    ],
  },
  {
    id: 'epique',
    n: 'III',
    title: ['Cabinet', 'épique'],
    text: 'Une seule pièce dans cette alcôve : ramener ce que l’on croyait perdu.',
    flagship: 'revive',
    cards: [],
  },
];

/** Ordre de la collection (N° 01 à N° 11), utilisé aussi par les graphiques. */
export const COLLECTION: CardId[] = [...WINGS.flatMap(w => [w.flagship, ...w.cards.map(c => c.id)]), 'rewind'];

export const MASTERPIECE: CardId = 'rewind';

export const RULES = [
  {
    n: 'I',
    title: 'Une vraie partie d’échecs.',
    text: 'Roque, prise en passant, promotion, pendule : toutes les règles, sans exception. Votre talent reste votre meilleure arme.',
  },
  {
    n: 'II',
    title: 'Trois cartes en main.',
    text: 'Distribuées au hasard, cachées à l’adversaire. Chacune ne sert qu’une fois : tout l’art est de choisir le moment.',
  },
  {
    n: 'III',
    title: 'Une par tour, avant votre coup.',
    text: 'La carte ne remplace pas le coup : elle le prépare. Et parfois, elle vous sauve du mat.',
  },
];

const PARTICLE_FR: Record<ParticleShape, string> = {
  glow: 'lueurs',
  ember: 'braises',
  pixel: 'pixels',
  star: 'poussière d’étoiles',
  petal: 'pétales',
  void: 'ombres',
};
const FLOURISH_FR: Record<Flourish, string> = {
  runes: 'cercle de runes',
  flames: 'couronne de flammes',
  grid: 'grille synthwave',
  constellation: 'constellations',
  vortex: 'vortex',
  petals: 'souffle de printemps',
};

export function priceOf(id: string): string {
  const item = ITEMS.find(i => i.id === id);
  if (item?.free) return 'Offert';
  const p = PRODUCTS.find(pr => pr.items.length === 1 && pr.items[0] === id);
  return p ? formatPrice(p.priceCents) : '';
}

export const SKINS = ITEMS.filter(i => i.kind === 'skin' && !isHouseItem(i.id)).map((i, k) => ({
  id: i.id,
  ref: `S/${String(k + 1).padStart(2, '0')}`,
  name: i.name,
  description: i.description,
  free: i.free,
  price: priceOf(i.id),
  matter: `${PARTICLE_FR[i.skin!.particle]}, ${FLOURISH_FR[i.skin!.flourish]}`,
  primary: i.skin!.primary,
  secondary: i.skin!.secondary,
  accent: i.skin!.accent,
}));

export const BOARDS = ITEMS.filter(i => i.kind === 'board' && !isHouseItem(i.id)).map((i, k) => ({
  id: i.id,
  ref: `P/${String(k + 1).padStart(2, '0')}`,
  name: i.name,
  description: i.description,
  free: i.free,
  price: priceOf(i.id),
  style: i.board!,
}));

export const PACK = PRODUCTS.find(p => p.id === 'pack:all')!;

export const LEVELS = [
  { name: 'Apprenti', rating: 800, text: 'Joue vite, lance ses cartes au hasard.' },
  { name: 'Sorcier', rating: 1300, text: 'Calcule deux coups et garde ses sorts.' },
  { name: 'Archimage', rating: 1800, text: 'Calcule en profondeur. Bonne chance.' },
];

/** Courbe Elo d'exemple (saison I), pour la table classée. */
export const ELO_CURVE = [1200, 1188, 1214, 1236, 1229, 1251, 1274, 1262, 1290, 1318, 1309, 1334, 1352, 1347, 1371, 1398, 1386, 1412];

export const LEGAL = ['Mentions légales', 'CGU', 'CGV', 'Confidentialité'];

/** Consignes de ciblage au vouvoiement (la partie locale tutoie). */
export const PROMPT_VOUS: Partial<Record<CardId, string[]>> = {
  ice_wall: ['Choisissez une case vide à geler'],
  freeze: ['Choisissez une pièce adverse à geler'],
  shield: ['Choisissez une de vos pièces à protéger'],
  swap: ['Choisissez la première pièce', 'Choisissez la pièce avec laquelle l’échanger'],
  revive: ['Choisissez où faire renaître votre pièce'],
  knight_leap: ['Choisissez la pièce qui pourra sauter'],
  lightning: ['Choisissez le pion adverse à foudroyer'],
  phase: ['Choisissez la pièce qui deviendra spectrale'],
};

// ---------------------------------------------------------------------------------------------
// Cabinet des affinités : données de conception (estimations), à remplacer par les statistiques des parties.

const PAIRS: [CardId, CardId, number][] = [
  ['ice_wall', 'gravity', 0.84],
  ['ice_wall', 'freeze', 0.66],
  ['freeze', 'lightning', 0.71],
  ['shield', 'swap', 0.69],
  ['time_warp', 'rewind', 0.67],
  ['knight_leap', 'phase', 0.62],
  ['gravity', 'freeze', 0.58],
  ['shield', 'revive', 0.55],
  ['swap', 'phase', 0.52],
  ['knight_leap', 'swap', 0.48],
  ['rewind', 'shield', 0.47],
  ['time_warp', 'gravity', 0.44],
  ['lightning', 'revive', 0.41],
  ['ice_wall', 'knight_leap', 0.38],
  ['rewind', 'lightning', 0.36],
  ['phase', 'gravity', 0.33],
  ['revive', 'rewind', 0.31],
];

/** Affinité de deux cartes jouées dans la même partie, de 0 à 1 (symétrique). */
export function affinity(a: CardId, b: CardId): number {
  const hit = PAIRS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (hit) return hit[2];
  // Fond : faible et stable, dérivé des identifiants
  let h = 7;
  for (const ch of a < b ? a + b : b + a) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return 0.06 + (h % 19) / 100;
}

/** À quel coup chaque carte est lancée : premier quartile, médiane, troisième quartile. */
export const TIMING: Record<CardId, [number, number, number]> = {
  lightning: [6, 11, 19],
  ice_wall: [8, 14, 22],
  knight_leap: [9, 15, 24],
  freeze: [10, 17, 26],
  swap: [11, 19, 29],
  shield: [12, 20, 31],
  phase: [13, 21, 30],
  gravity: [14, 22, 33],
  rewind: [15, 27, 38],
  revive: [22, 31, 42],
  time_warp: [25, 34, 44],
};

/** Prochaine exposition : deux pouvoirs « globaux » à l'étude (voir concepts/CARTES-GLOBALES.md). */
export const UPCOMING = [
  {
    ref: 'Esquisse S2/01',
    name: 'Sablier fou',
    family: 'Climat · Rare · 3 tours',
    motto: 'Le temps s’emballe pour tout le monde.',
    rule: 'Les deux pendules s’écoulent deux fois plus vite. Le lanceur ne gagne rien : il choisit le moment où la précipitation l’arrange.',
  },
  {
    ref: 'Esquisse S2/02',
    name: 'Faille',
    family: 'Terrain · Rare · 2 tours',
    motto: 'Le plateau se fend en deux.',
    rule: 'Une rangée centrale se fend : ses cases vides deviennent infranchissables, pour les deux camps. Les cavaliers sautent par-dessus.',
  },
];

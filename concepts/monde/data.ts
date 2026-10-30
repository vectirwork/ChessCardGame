// Textes et données du concept « Le Monde-Échiquier ».
import type { CardId } from '../../src/shared/cards';

/** Les lieux, dans l'ordre du voyage (rangée 1 vers rangée 8). */
export const LIEUX = [
  { id: 'seuil', rank: 1, name: 'Le Seuil', short: 'Seuil', hue: 190 },
  { id: 'regle', rank: 3, name: 'La Règle', short: 'Règle', hue: 75 },
  { id: 'allee', rank: 4, name: "L'Allée des pouvoirs", short: 'Pouvoirs', hue: 320 },
  { id: 'forge', rank: 6, name: 'La Forge', short: 'Forge', hue: 24 },
  { id: 'portes', rank: 7, name: 'Les Trois Portes', short: 'Portes', hue: 190 },
  { id: 'promotion', rank: 8, name: 'La Promotion', short: 'Promotion', hue: 45 },
] as const;

export type LieuId = (typeof LIEUX)[number]['id'];

/** Hauteur de chaque lieu dans la page (en hauteurs d'écran). */
export const LIEU_HEIGHT: Record<LieuId, number> = {
  seuil: 1.35,
  regle: 2,
  allee: 3.6,
  forge: 2.2,
  portes: 2,
  promotion: 1.9,
};

/** Main de démonstration de la Règle (trois cartes dressées). */
export const HAND: CardId[] = ['ice_wall', 'lightning', 'rewind'];

/** Ordre des onze cartes dans l'Allée. */
export const AVENUE: CardId[] = [
  'lightning', 'ice_wall', 'freeze', 'shield', 'gravity', 'swap',
  'knight_leap', 'phase', 'time_warp', 'revive', 'rewind',
];

export const STEPS = [
  {
    n: '01',
    title: 'Tu reçois trois cartes',
    text: 'Tirées au hasard au début de la partie. Ton adversaire ne les voit pas.',
  },
  {
    n: '02',
    title: 'Tu lances, puis tu joues',
    text: 'À ton tour, une carte avant ton coup : geler une pièce, foudroyer un pion, effacer son dernier coup.',
  },
  {
    n: '03',
    title: 'Une seule par tour',
    text: 'Trois cartes pour toute la partie. Le bon moment vaut plus qu’une dame.',
  },
];

export const SKIN_PORTALS = [
  { id: 'skin:arcane', price: 'Offert' },
  { id: 'skin:inferno', price: '2,99 €' },
  { id: 'skin:neon', price: '2,99 €' },
  { id: 'skin:celestial', price: '3,99 €' },
  { id: 'skin:void', price: '3,99 €' },
  { id: 'skin:sakura', price: '2,99 €' },
];

/** Plateaux : choisir un thème habille le sol du monde entier. */
export const BOARD_THEMES = [
  { id: 'board:arcane', price: 'Offert' },
  { id: 'board:wood', price: 'Offert' },
  { id: 'board:slate', price: 'Offert' },
  { id: 'board:marble', price: '1,99 €' },
  { id: 'board:obsidian', price: '1,99 €' },
  { id: 'board:jade', price: '1,99 €' },
  { id: 'board:ruby', price: '1,99 €' },
];

export const MODES = [
  {
    id: 'ami',
    color: '#c8ff3d',
    tag: 'Sans compte',
    title: 'Défier un ami',
    text: 'Un lien, aucune inscription. Tu l’envoies, il clique, la partie commence.',
    cta: 'Copier un lien',
  },
  {
    id: 'ia',
    color: '#38e8ff',
    tag: '3 niveaux',
    title: 'Affronter l’IA',
    text: 'Elle garde ses sorts pour le pire moment. Choisis son niveau :',
    cta: 'Jouer contre l’IA',
  },
  {
    id: 'classe',
    color: '#ff3ea5',
    tag: 'Elo',
    title: 'Partie classée',
    text: 'File d’attente, cote Elo, classement. Chaque victoire te fait monter.',
    cta: 'Entrer dans la file',
  },
] as const;

/** Niveaux de l'IA (dans ce prototype, la petite IA locale lance plus ou moins souvent ses cartes). */
export const LEVELS = [
  { id: 'apprenti', name: 'Apprenti', elo: '≈ 900', chance: 0.2 },
  { id: 'sorcier', name: 'Sorcier', elo: '≈ 1300', chance: 0.4 },
  { id: 'archimage', name: 'Archimage', elo: '≈ 1800', chance: 0.65 },
] as const;

export type LevelId = (typeof LEVELS)[number]['id'];

export const LEGAL = ['Règles', 'Classement', 'Boutique', 'Mentions légales', 'CGU', 'CGV', 'Confidentialité', 'Contact'];

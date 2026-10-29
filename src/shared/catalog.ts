// Catalogue de la boutique : skins d'animation des cartes et thèmes de plateau.
// Les prix sont en centimes d'euro, TTC. Modifier ce fichier suffit pour changer l'offre.

export type ItemKind = 'skin' | 'board';

export type ParticleShape = 'glow' | 'ember' | 'pixel' | 'star' | 'petal' | 'void';
export type Flourish = 'runes' | 'flames' | 'grid' | 'constellation' | 'vortex' | 'petals';

export interface SkinStyle {
  /** Couleur principale des effets. */
  primary: string;
  secondary: string;
  /** Couleur des éclats et des contours. */
  accent: string;
  particle: ParticleShape;
  flourish: Flourish;
  /** Les particules montent (flammes) ou tombent (pétales) ; 0 = flottent. */
  drift: number;
  /** Intensité du flash d'activation (0 à 1). */
  flash: number;
  /** Secousse de l'échiquier à l'impact (0 à 1). */
  shake: number;
}

export interface BoardStyle {
  light: string;
  dark: string;
  /** Cadre autour de l'échiquier. */
  frame: string;
  /** Texture superposée aux cases. */
  texture: 'none' | 'wood' | 'marble' | 'stone' | 'grain';
  coords: string;
}

export interface Item {
  id: string;
  kind: ItemKind;
  name: string;
  description: string;
  free: boolean;
  skin?: SkinStyle;
  board?: BoardStyle;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  items: string[];
  /** Prix barré affiché pour les packs. */
  compareAtCents?: number;
  badge?: string;
}

export const ITEMS: Item[] = [
  {
    id: 'skin:arcane',
    kind: 'skin',
    name: 'Arcane',
    description: 'Runes cyan et violettes, la magie d’origine. Offert à tous.',
    free: true,
    skin: { primary: '#5ee7ff', secondary: '#a77bff', accent: '#e9fbff', particle: 'glow', flourish: 'runes', drift: 0.2, flash: 0.55, shake: 0.25 },
  },
  {
    id: 'skin:inferno',
    kind: 'skin',
    name: 'Inferno',
    description: 'Chaque carte s’embrase : braises, cercle de flammes et onde de chaleur.',
    free: false,
    skin: { primary: '#ff7a1a', secondary: '#ff2d55', accent: '#ffe08a', particle: 'ember', flourish: 'flames', drift: 1, flash: 0.8, shake: 0.6 },
  },
  {
    id: 'skin:neon',
    kind: 'skin',
    name: 'Néon 2084',
    description: 'Grille synthwave, pixels lumineux et glitch rétro-futuriste.',
    free: false,
    skin: { primary: '#ff3ec8', secondary: '#38f2ff', accent: '#fff36b', particle: 'pixel', flourish: 'grid', drift: 0, flash: 0.7, shake: 0.35 },
  },
  {
    id: 'skin:celestial',
    kind: 'skin',
    name: 'Céleste',
    description: 'Poussière d’étoiles dorée et constellations qui dessinent vos coups.',
    free: false,
    skin: { primary: '#ffd36b', secondary: '#fff7e0', accent: '#ffffff', particle: 'star', flourish: 'constellation', drift: -0.2, flash: 0.9, shake: 0.2 },
  },
  {
    id: 'skin:void',
    kind: 'skin',
    name: 'Néant',
    description: 'Un trou noir s’ouvre sous l’échiquier. Particules d’ombre et lueurs pourpres.',
    free: false,
    skin: { primary: '#8b3dff', secondary: '#1a0033', accent: '#d9b8ff', particle: 'void', flourish: 'vortex', drift: -0.6, flash: 0.45, shake: 0.7 },
  },
  {
    id: 'skin:sakura',
    kind: 'skin',
    name: 'Sakura',
    description: 'Une pluie de pétales roses et un souffle de printemps à chaque sort.',
    free: false,
    skin: { primary: '#ff8fc7', secondary: '#ffd1e8', accent: '#ffffff', particle: 'petal', flourish: 'petals', drift: -0.8, flash: 0.5, shake: 0.15 },
  },

  {
    id: 'board:arcane',
    kind: 'board',
    name: 'Nuit arcane',
    description: 'Le plateau d’origine, violet profond.',
    free: true,
    board: { light: '#d8d3ee', dark: '#6f62ad', frame: '#1c1838', texture: 'grain', coords: '#3b3270' },
  },
  {
    id: 'board:wood',
    kind: 'board',
    name: 'Bois de chêne',
    description: 'L’élégance d’un échiquier de club.',
    free: true,
    board: { light: '#ecd5ae', dark: '#a9784f', frame: '#4a2f1d', texture: 'wood', coords: '#6b4428' },
  },
  {
    id: 'board:slate',
    kind: 'board',
    name: 'Ardoise',
    description: 'Bleu-gris sobre, reposant pour les longues parties.',
    free: true,
    board: { light: '#dfe6ee', dark: '#7b8fa6', frame: '#1f2833', texture: 'none', coords: '#465568' },
  },
  {
    id: 'board:marble',
    kind: 'board',
    name: 'Marbre de Carrare',
    description: 'Marbre blanc veiné et marbre gris anthracite.',
    free: false,
    board: { light: '#f2f0ec', dark: '#8c8c94', frame: '#2b2b30', texture: 'marble', coords: '#55555c' },
  },
  {
    id: 'board:obsidian',
    kind: 'board',
    name: 'Obsidienne & Or',
    description: 'Pierre volcanique noire sertie d’or.',
    free: false,
    board: { light: '#c9b27a', dark: '#26232b', frame: '#0d0c10', texture: 'stone', coords: '#a68b4c' },
  },
  {
    id: 'board:jade',
    kind: 'board',
    name: 'Palais de jade',
    description: 'Jade impérial et ivoire, pour des parties sereines.',
    free: false,
    board: { light: '#e9f1e3', dark: '#3f8a6b', frame: '#123326', texture: 'marble', coords: '#2c6650' },
  },
  {
    id: 'board:ruby',
    kind: 'board',
    name: 'Rubis',
    description: 'Rouge profond et crème, taillé pour l’attaque.',
    free: false,
    board: { light: '#f3e1d6', dark: '#9e2f45', frame: '#2e0b14', texture: 'stone', coords: '#7a2234' },
  },
];

const premiumSkins = ITEMS.filter(i => i.kind === 'skin' && !i.free).map(i => i.id);
const premiumBoards = ITEMS.filter(i => i.kind === 'board' && !i.free).map(i => i.id);

export const PRODUCTS: Product[] = [
  { id: 'skin:inferno', name: 'Skin Inferno', description: 'Skin d’animation Inferno', priceCents: 299, items: ['skin:inferno'], badge: 'Populaire' },
  { id: 'skin:neon', name: 'Skin Néon 2084', description: 'Skin d’animation Néon 2084', priceCents: 299, items: ['skin:neon'] },
  { id: 'skin:sakura', name: 'Skin Sakura', description: 'Skin d’animation Sakura', priceCents: 299, items: ['skin:sakura'] },
  { id: 'skin:celestial', name: 'Skin Céleste', description: 'Skin d’animation Céleste', priceCents: 399, items: ['skin:celestial'] },
  { id: 'skin:void', name: 'Skin Néant', description: 'Skin d’animation Néant', priceCents: 399, items: ['skin:void'], badge: 'Nouveau' },
  { id: 'board:marble', name: 'Plateau Marbre de Carrare', description: 'Thème de plateau', priceCents: 199, items: ['board:marble'] },
  { id: 'board:obsidian', name: 'Plateau Obsidienne & Or', description: 'Thème de plateau', priceCents: 199, items: ['board:obsidian'] },
  { id: 'board:jade', name: 'Plateau Palais de jade', description: 'Thème de plateau', priceCents: 199, items: ['board:jade'] },
  { id: 'board:ruby', name: 'Plateau Rubis', description: 'Thème de plateau', priceCents: 199, items: ['board:ruby'] },
  {
    id: 'pack:skins',
    name: 'Collection légendaire',
    description: 'Les 5 skins d’animation premium, et les prochains offerts.',
    priceCents: 999,
    compareAtCents: 1695,
    items: premiumSkins,
    badge: '-41 %',
  },
  {
    id: 'pack:all',
    name: 'Grimoire complet',
    description: 'Tous les skins et tous les plateaux premium.',
    priceCents: 1299,
    compareAtCents: 2491,
    items: [...premiumSkins, ...premiumBoards],
    badge: 'Meilleure offre',
  },
];

export const DEFAULT_SKIN = 'skin:arcane';
export const DEFAULT_BOARD = 'board:arcane';

export const itemById = (id: string) => ITEMS.find(i => i.id === id);
export const productById = (id: string) => PRODUCTS.find(p => p.id === id);
export const FREE_ITEMS = ITEMS.filter(i => i.free).map(i => i.id);

export function skinStyle(id: string | undefined): SkinStyle {
  return (itemById(id ?? '')?.skin ?? itemById(DEFAULT_SKIN)!.skin)!;
}
export function boardStyle(id: string | undefined): BoardStyle {
  return (itemById(id ?? '')?.board ?? itemById(DEFAULT_BOARD)!.board)!;
}

export function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

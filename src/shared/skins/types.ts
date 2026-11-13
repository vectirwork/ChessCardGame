// Types du catalogue des skins : emplacements (roi, échiquier, sorts : slots.ts), raretés, collections et produits.
// Les données sont dans les fichiers voisins (un par emplacement) ; src/shared/catalog.ts les assemble.
import type { Color } from '../chess';
import type { ItemKind } from './slots';

/**
 * Emplacement d'un objet : une clé de SLOT_DEFS (slots.ts). `skin` désigne les sorts (habillage des effets des cartes) :
 * l'identifiant technique est gardé parce que `skin:*` est déjà en base (user_items, equipped_skin, achats). À l'écran :
 * « Sorts ».
 */
export type { ItemKind };

/**
 * Rareté d'un objet ou d'une collection. Invariant testé : `free ⇔ rarity === 'offert'`. Ne pas confondre avec
 * `Rarity` des cartes de pouvoir (cards.ts), dont les valeurs portent des accents.
 */
export type SkinRarity = 'offert' | 'rare' | 'epique' | 'legendaire';

/** Forme des particules d'un skin de sorts (une texture par valeur, src/client/vfx/textures.ts). */
export type ParticleShape = 'glow' | 'ember' | 'pixel' | 'star' | 'petal' | 'void' | 'shard';
/** Motif d'ornement (cercle tracé sous l'échiquier) d'un skin de sorts. */
export type Flourish = 'runes' | 'flames' | 'grid' | 'constellation' | 'vortex' | 'petals' | 'laurel' | 'filigree';

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

/** Motif du cadre d'un échiquier (statique). */
export type BoardFrameArt =
  /** Frise en `border-image: url(svg) slice / 10px round`. */
  | { kind: 'border'; svg: string; slice: number }
  /** Une même image posée aux quatre coins (`size` px), et aux milieux des côtés si `mid` (px). */
  | { kind: 'corners'; svg: string; size: number; mid?: number };

export interface BoardStyle {
  light: string;
  dark: string;
  /** Cadre autour de l'échiquier. */
  frame: string;
  /** Texture superposée aux cases. */
  texture: 'none' | 'wood' | 'marble' | 'stone' | 'grain';
  coords: string;
  /** Liseré de 1,5 px entre le cadre et les cases (box-shadow statique sur .squares). */
  fillet?: string;
  /** Incrustation : SVG complet, viewBox 0 0 800 800, preserveAspectRatio none, ≤ 2 Ko, posé une fois sur la grille. */
  inlay?: string;
  frameArt?: BoardFrameArt;
  /** Calques CSS statiques du cadre, sans url() : fond ajouté devant var(--frame), ombres ajoutées à la liste. */
  frameGlow?: { background?: string; shadow?: string };
  /** Halo des vignettes de la boutique. */
  gem?: string;
}

/** Métadonnées d'un roi (vignettes, portrait, sceau). Le dessin est dans KING_ART, hors de Item. */
export interface KingStyle {
  /** Teinte du halo des vignettes et du portrait. */
  gem: string;
}

/**
 * Peinture d'un ornement : aplat, ou dégradé linéaire. `stops` : [décalage 0..1, couleur]. Sans `vector`, dégradé
 * vertical sur la boîte de l'ornement (objectBoundingBox) ; avec `vector` [x1, y1, x2, y2], dégradé en coordonnées
 * absolues du SVG 100 × 100 (userSpaceOnUse).
 */
export type KingPaint =
  | string
  | { stops: readonly (readonly [number, string])[]; vector?: readonly [number, number, number, number] };

/** Ornement d'un roi (gemme, fleuron, croix, couronne, gravure colorée), dessiné par-dessus le corps (ou dessous). */
export interface KingOrnament {
  d: string;
  /** Remplissage par camp, ou aucun (ornement en trait seul). */
  fill: Record<Color, KingPaint> | 'none';
  /** Contour par camp ; absent : le contour du corps du camp ; 'none' : sans contour. */
  stroke?: Record<Color, string> | 'none';
  /** Largeur du contour (défaut 1,6). */
  sw?: number;
  opacity?: number;
  strokeOpacity?: number;
  rule?: 'evenodd';
  /** Peint avant le corps (anneau arrière, couronne radiée). */
  under?: boolean;
}

/** Palette du corps d'un roi, par camp (même rôle que PALETTE dans pieces.ts). */
export interface KingPalette {
  top: string;
  bottom: string;
  stroke: string;
  detail: string;
}

/**
 * Dessin d'un roi : SVG 100 × 100. Gabarit imposé (celui de la chute du mat, board.css) : tous les tracés dans
 * x 22..78 et y 3,5..90, `body` commence par le pied BASE commun à toutes les pièces.
 */
export interface KingArt {
  /** Silhouette : dégradé du camp, contour de 3,2, reflet. */
  body: string;
  /** Gravures (trait de `detailWidth`, opacité 0,9). */
  details: string;
  /** Largeur des gravures (défaut 2,2). */
  detailWidth?: number;
  pal: Record<Color, KingPalette>;
  ornaments: readonly KingOrnament[];
}

export interface Item {
  /** Préfixe = emplacement : 'king:braise', 'board:ruby', 'skin:inferno'. Un identifiant vendu n'est JAMAIS renommé. */
  id: string;
  kind: ItemKind;
  name: string;
  description: string;
  /** Invariant testé : free ⇔ rarity === 'offert'. */
  free: boolean;
  rarity: SkinRarity;
  /** Prix à l'unité quand il s'écarte de la grille PRICE (centimes TTC) : un prix déjà pratiqué ne monte jamais. */
  priceCents?: number;
  /** Nouveauté de la saison (badge « Nouveau »). */
  isNew?: boolean;
  /** Badge de mise en avant (« Populaire ») : l'emporte sur « Nouveau ». */
  badge?: string;
  /**
   * Retiré de la vente : hors des rayons, du Trésor et des packs, son produit n'est plus en vente ; toujours résolu
   * (possédé, équipé, historique des achats, remboursement). Ne jamais supprimer ni recycler son identifiant.
   */
  retired?: boolean;
  skin?: SkinStyle;
  board?: BoardStyle;
  king?: KingStyle;
}

/** Collection : un objet par emplacement (champs `king`, `board`, `skin` : identifiants des objets). */
export interface Collection extends Record<ItemKind, string> {
  /** 'col:inferno'. Jamais réutilisé. */
  id: string;
  name: string;
  tagline: string;
  rarity: SkinRarity;
  /** Teinte du sceau et du triptyque. */
  gem: string;
  /** Nom du sceau de la collection (« Sceau de la Forge ») ; défaut : « Sceau <nom> ». */
  sealName?: string;
}

export interface Product {
  /** = id de l'objet (à l'unité), 'col:*' (collection) ou 'pack:*'. JAMAIS réutilisé. */
  id: string;
  kind: 'item' | 'collection' | 'pack';
  name: string;
  description: string;
  /** Prix plein (centimes TTC). Le prix payé est productPrice(produit, objets possédés). */
  priceCents: number;
  items: string[];
  /** Prix barré : somme des prix à l'unité (calculé). */
  compareAtCents?: number;
  badge?: string;
  /** Collection d'un produit `collection`. */
  collection?: string;
  /** Promesse « et les prochains offerts » : les objets payants de ces emplacements ajoutés plus tard sont livrés. */
  future?: ItemKind[];
  /** Retiré de la vente (caché, refusé au paiement) mais toujours résolu : historique, remboursement, administration. */
  retired?: boolean;
  /**
   * Pack : où la boutique le montre, en tête du rayon d'un emplacement (carte de pack) ou en bandeau sous les
   * collections. Sans `display`, il n'est montré qu'à l'accueil.
   */
  display?: ItemKind | 'banner';
  /** Nom court dans les phrases (« le prix du Grimoire ne change pas », « Acheter le Trésor »). */
  shortName?: string;
}

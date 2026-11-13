// L'Odyssée : les lieux traversés pendant la descente, et ce que l'échiquier y joue.
// Les cartes présentées sont celles du catalogue de l'accueil (HOME.catalog : les Pouvoirs, « climats ») : chaque
// pouvoir touche les deux camps et les mains sont visibles des deux côtés (décision du fondateur du 30 octobre). Le
// Duel n'est plus proposé nulle part.
//
// PLACES est la source des lieux : ancre, pose du moteur (PoseKey, poseFor dans engine.ts), décor (SCENES de
// scenery.tsx, par identifiant), numéro, nom, altitude, apparence de l'échiquier. Leur ordre est celui de la descente :
// l'index d'un lieu (placeIndex) est son numéro pour le moteur (data-place, data-scene) et pour les ciels de
// odyssee.css (.o-sky-<index>, .o-scene-<index>). Le premier lieu est l'Observatoire, l'échiquier jouable du héros.
//
// Les textes chiffrés (cartes par joueur, sorts par tour, niveaux de l'IA, portes) sont dérivés des règles
// (src/shared/text/regles.ts, text/fr.ts) : au réglage par défaut, ce sont les phrases d'avant, au caractère près
// (test/accueil.test.ts). Ils sont calculés une fois par objet de règles, jamais dans un rendu fréquent.
import { BOT_LEVELS, BOT_PROFILES } from '../../shared/bot';
import type { BotLevel } from '../../shared/bot';
import { cardsOf, isCardId } from '../../shared/cards';
import type { CardCatalog, CardDef, CardId } from '../../shared/cards';
import { ITEMS, PRODUCTS, formatPrice, itemById, unitPrice } from '../../shared/catalog';
import type { FeatureKey } from '../../shared/config/features';
import { HOME } from '../../shared/config/home';
import { GAME_RULES } from '../../shared/config/rules';
import type { GameRulesSettings } from '../../shared/config/rules';
import { SLOT_DEFS } from '../../shared/skins/slots';
import type { ItemKind } from '../../shared/skins/slots';
import { apostrophes, cap, enLettres, ordinalLettres, pluriel, romain } from '../../shared/text/fr';
import {
  cartesDePouvoir, cartesVisibles, constitutionMains, niveauxIA, nomsNiveaux, refusBudget, sortParTour, sortsEnMain, vosSorts,
} from '../../shared/text/regles';

export type PoseKey = 'hero' | 'foret' | 'pics' | 'sablier' | 'bazar' | 'seuil';

export interface Place {
  id: PoseKey;
  /** Ancre de la section (#observatoire) : altimètre, liens de défilement. */
  anchor: string;
  /** Numéro affiché (I, II…) : la place du lieu dans la descente, en chiffres romains. */
  num: string;
  name: string;
  /** Altitude affichée par l'altimètre en arrivant dans le lieu. */
  alt: number;
  /**
   * Plateau, sorts et roi de l'échiquier qui accompagne la descente : une collection par lieu (Pics : Néant ; Sablier :
   * Forge d'Inferno ; Seuil : Voûte céleste). La Forêt garde l'apparence offerte (on y apprend les cartes du froid) ;
   * au Bazar, le visiteur choisit. Le héros est la partie du visiteur (ses objets, l'Oracle en Roi éclipse).
   */
  theme: string;
  skin: string;
  /** Roi des deux camps (objet king:*). */
  king: string;
  /** Teinte du lieu (r g b), reprise par le rideau du mode jeu. */
  tint: string;
}

/** ← Lieux de la descente, dans l'ordre. Un lieu de plus : son entrée ici, sa pose (poseFor), sa scène (SCENES), son ciel. */
export const PLACES: readonly Place[] = (
  [
    { id: 'hero', anchor: 'observatoire', name: "L'Observatoire", alt: 9120, theme: 'board:arcane', skin: 'skin:celestial', king: 'king:arcane', tint: '120 92 255' },
    { id: 'foret', anchor: 'foret', name: 'La Forêt de givre', alt: 6480, theme: 'board:slate', skin: 'skin:arcane', king: 'king:arcane', tint: '94 214 240' },
    { id: 'pics', anchor: 'pics', name: "Les Pics de l'orage", alt: 4210, theme: 'board:horizon', skin: 'skin:void', king: 'king:eclipse', tint: '150 110 255' },
    { id: 'sablier', anchor: 'sablier', name: 'Le Sablier', alt: 1730, theme: 'board:obsidian', skin: 'skin:inferno', king: 'king:braise', tint: '240 150 70' },
    { id: 'bazar', anchor: 'bazar', name: 'Le Bazar céleste', alt: 640, theme: 'board:jade', skin: 'skin:sakura', king: 'king:printemps', tint: '236 120 180' },
    { id: 'seuil', anchor: 'seuil', name: 'Le Seuil', alt: 0, theme: 'board:ciel', skin: 'skin:celestial', king: 'king:astral', tint: '243 201 105' },
  ] satisfies Omit<Place, 'num'>[]
).map((p, i) => ({ ...p, num: romain(i + 1) }));

/** Lieux par identifiant : PLACE.bazar. */
export const PLACE = Object.fromEntries(PLACES.map(p => [p.id, p])) as Readonly<Record<PoseKey, Place>>;

/** Index d'un lieu dans la descente (numéro du lieu pour le moteur, data-place) ; -1 s'il n'existe pas. */
export function placeIndex(id: PoseKey): number {
  return PLACES.findIndex(p => p.id === id);
}

/** Attributs de la section d'un lieu, dans l'ordre où ils sont écrits. */
export interface PlaceAttrs {
  id: string;
  'data-pose': PoseKey;
  'data-scene': string;
  'data-place': string;
}
const PLACE_ATTRS = Object.fromEntries(
  PLACES.map((p, i) => [p.id, Object.freeze({ id: p.anchor, 'data-pose': p.id, 'data-scene': String(i), 'data-place': String(i) })]),
) as Record<PoseKey, Readonly<PlaceAttrs>>;

/**
 * Attributs de la section d'un lieu : ancre, pose du moteur, couche de décor et numéro de lieu (son index). Le même
 * objet à chaque appel : `<section {...placeAttrs('foret')}>` ne coûte rien aux rendus de l'accueil.
 */
export function placeAttrs(id: PoseKey): Readonly<PlaceAttrs> {
  return PLACE_ATTRS[id];
}

// ---------------------------------------------------------------------------------------------
// Catalogue de cartes

type StoryPlace = 'foret' | 'pics' | 'sablier';

/** Répartition des cartes du catalogue par lieu. Les identifiants inconnus sont ignorés. */
const LAYOUT: Record<StoryPlace, string[]> = {
  foret: ['ice_age', 'ice_wall', 'rift'],
  pics: ['blast', 'blood_moon', 'truce'],
  sablier: ['hourglass', 'tide'],
};

/** Cartes racontées dans chaque lieu (toutes les cartes du catalogue, chacune une fois). */
export function placeCards(catalog: CardCatalog = HOME.catalog): Record<StoryPlace, CardId[]> {
  const pool = cardsOf(catalog);
  const used = new Set<CardId>();
  const out: Record<StoryPlace, CardId[]> = { foret: [], pics: [], sablier: [] };
  for (const k of ['foret', 'pics', 'sablier'] as StoryPlace[]) {
    for (const id of LAYOUT[k]) {
      if (isCardId(id) && pool.includes(id) && !used.has(id)) {
        out[k].push(id);
        used.add(id);
      }
    }
  }
  // Cartes nouvelles, non prévues ci-dessus : dans le lieu le moins fourni
  for (const id of pool) {
    if (used.has(id)) continue;
    const k = (['foret', 'pics', 'sablier'] as StoryPlace[]).reduce((a, b) => (out[b].length < out[a].length ? b : a));
    out[k].push(id);
    used.add(id);
  }
  return out;
}

/** Ce que l'échiquier de démonstration lance quand on s'attarde dans un lieu sans chapitre actif. */
export function idleCasts(place: PoseKey, catalog: CardCatalog): CardId[] {
  const pc = placeCards(catalog);
  const all = cardsOf(catalog);
  const pick = (ids: CardId[], n: number) => ids.slice(0, n);
  switch (place) {
    case 'foret':
      return [];
    case 'pics':
      return pick(pc.pics, 1);
    case 'sablier':
      return pick(pc.sablier, 1);
    case 'bazar':
      return pick([...pc.pics, ...pc.foret], 4);
    case 'seuil':
      return pick([...pc.foret.slice(1), ...pc.pics], 2);
    default:
      return pick(all, 5);
  }
}

/** Ligne « En partie » d'un chapitre : comment la carte se joue. */
export function howToPlay(c: CardDef): string {
  if (c.ritual) return 'Rituel : la carte remplace votre coup.';
  if (c.presage) return "Présage : annoncée maintenant, elle arrive à votre tour suivant. L'adversaire a un coup pour s'y préparer.";
  return c.prompts[0] ?? 'Effet immédiat, sans cible.';
}

export interface Copy {
  title: [string, string];
  text: string;
}

/** Textes des lieux, par catalogue (celui de l'accueil, HOME.catalog ; repli : les Pouvoirs). */
export const PLACE_COPY: Partial<Record<CardCatalog, Record<StoryPlace, Copy>>> & { climats: Record<StoryPlace, Copy> } = {
  climats: {
    foret: {
      title: ['Ici, le froid', 'gagne la partie.'],
      text: 'Sous les pins gelés, on apprend à fermer le jeu : figer tous les pions, murer une case pour toute la partie, fendre le plateau. Le froid tient les deux camps.',
    },
    pics: {
      title: ['Là-haut,', 'le ciel tranche.'],
      text: "Des climats nés dans l'orage : chaque prise qui explose, des captures forcées, une trêve où plus personne ne prend. Pour les deux camps, toujours.",
    },
    sablier: {
      title: ['Le temps,', 'retourné.'],
      text: 'Au cœur du désert, le grand sablier obéit aux audacieux : affoler les deux pendules, lever la marée qui pousse tous les pions.',
    },
  },
};

export const INTERLUDE: Partial<Record<CardCatalog, Copy>> & { climats: Copy } = {
  climats: {
    title: ['Le monde change.', 'Pour les deux camps.'],
    text: 'Une carte ne vous donne pas un pouvoir : elle change la partie pour tout le monde. Vos cartes et celles de l’adversaire sont visibles : vous gagnez parce que vous avez choisi le moment.',
  },
};

// ---------------------------------------------------------------------------------------------
// Textes chiffrés : dérivés des règles

/** Règles que décrivent les textes de l'accueil : celles de la partie ouverte (rulesOf), ou GAME_RULES. */
export type TextRules = Pick<GameRulesSettings, 'cardsPerPlayer' | 'cardsPerTurn' | 'cardEndsTurn' | 'presageDelay'>;

/** Les trois principes (Forêt de givre), pour les règles des nouvelles parties. */
export function principle(r: TextRules = GAME_RULES) {
  const n = r.cardsPerPlayer;
  const k = r.cardsPerTurn;
  // Tours d'avance d'un Présage (délai en demi-coups, compté comme prochainTour de regles.ts)
  const tours = Math.max(1, Math.round(r.presageDelay / 2));
  const lance = k === 1 ? 'lancez une carte : elle change' : `lancez jusqu’à ${enLettres(k, 'f')} cartes : chacune change`;
  return [
    {
      n: '01',
      title: 'Les échecs, intacts.',
      text: 'Roque, prise en passant, promotion, pendule : toutes les règles, sans exception. Votre jeu reste votre meilleure arme.',
    },
    {
      n: '02',
      title: cartesVisibles(r),
      text: `Au début d'une partie, ${apostrophes(constitutionMains(r), 'droite')}. ${
        n === 1 ? "Visible des deux joueurs, elle ne sert qu'une fois." : "Visibles des deux joueurs, chacune ne sert qu'une fois."
      }`,
    },
    {
      n: '03',
      title: `${sortParTour(r, true)}.`,
      text: `${r.cardEndsTurn ? 'À la place de votre coup' : 'Avant votre coup'}, ${lance} la partie pour les deux camps. Certaines s’annoncent ${enLettres(tours)} ${pluriel(tours, 'tour')} à l’avance.`,
    },
  ];
}

/**
 * Textes de la partie ouverte sur l'accueil (héros, mini-main, consignes de la coque), selon ses règles
 * (rulesOf(état)). Calculés une fois par objet de règles (useMemo de l'accueil).
 */
export function liveTexts(r: TextRules) {
  const n = r.cardsPerPlayer;
  const touch = n === 1 ? 'Touchez-le pour le lire et le lancer' : 'Touchez-en un pour le lire et le lancer';
  return {
    /** Accroche du héros : « Une vraie partie d'échecs, <cartesDePouvoir>, <sortParTour>. » */
    lede: `Une vraie partie d'échecs, ${cartesDePouvoir(r)}, ${sortParTour(r)}.`,
    /** Mini-main : étiquette et intitulé avant le premier coup (vosSorts, en tête de phrase). */
    hand: vosSorts(r, true),
    /** Consigne sous la mini-main ; `ritual` : une carte de la main remplace le coup (Rituel). */
    touch(ritual: boolean): string {
      if (r.cardEndsTurn || (ritual && n === 1)) return `${touch}, à la place de votre coup.`;
      if (ritual) return `${touch} ; les autres sorts s’ajoutent à votre coup.`;
      return `${touch}, puis jouez votre coup.`;
    },
    /** Consigne de la coque, à votre tour, avant toute carte. */
    before: r.cardEndsTurn ? 'Lancez une carte à la place de votre coup, ou jouez directement.' : 'Lancez une carte avant votre coup, ou jouez directement.',
    /** Petite ligne de la consigne : refusBudget, puis « Revenez à la page… ». */
    budget: `${refusBudget(r)} Revenez à la page quand vous voulez : la partie vous attend.`,
  };
}
export type LiveTexts = ReturnType<typeof liveTexts>;

/** Textes de la page qui décrivent le jeu en général (règles des nouvelles parties). */
export const PAGE_TEXTS = {
  /** Titre de la Forêt de givre : « <em>{sortsEnMain}</em> en main. » */
  sortsEnMain: sortsEnMain(GAME_RULES, true),
};

// ---------------------------------------------------------------------------------------------
// Portes du Seuil, niveaux de l'IA

/** Description de chaque niveau de l'IA (le compilateur en exige une par niveau de BOT_LEVELS). */
const LEVEL_TEXT: Record<BotLevel, string> = {
  1: 'Joue vite, lance ses sorts au hasard.',
  2: 'Calcule, protège ses pièces, garde une carte pour la fin.',
  3: 'Calcule en profondeur et punit chaque sort gaspillé.',
};

/** Niveaux de l'Oracle : BOT_LEVELS, noms de BOT_PROFILES. */
export const LEVELS: readonly { level: BotLevel; name: string; text: string }[] = BOT_LEVELS.map(level => ({
  level,
  name: BOT_PROFILES[level].name,
  text: LEVEL_TEXT[level],
}));

export type ModeKey = 'ami' | 'ia' | 'elo';

/**
 * Portes du Seuil. `needs` : interrupteurs sans lesquels la porte n'est pas montrée (la création d'une partie demande
 * aussi newGames, et guestPlay pour un invité : voir l'accueil). Le nombre de portes et leurs numéros en découlent.
 */
export const MODES: readonly { key: ModeKey; title: string; tag: string; text: string; needs: readonly FeatureKey[] }[] = [
  {
    key: 'ami',
    title: 'Défier un ami',
    tag: 'Sans compte',
    text: 'Créez une partie, envoyez le lien. Votre ami la rejoint en un clic, sur mobile comme sur ordinateur.',
    needs: ['invites', 'newGames'],
  },
  {
    key: 'ia',
    title: "Affronter l'IA",
    tag: niveauxIA(BOT_LEVELS.length),
    text: `${nomsNiveaux(LEVELS.map(l => l.name))} : une IA qui calcule et garde ses sorts pour le bon moment.`,
    needs: [],
  },
  {
    key: 'elo',
    title: 'Parties classées',
    tag: 'Elo',
    text: "Montez au classement et gardez l'historique de vos parties. Un compte gratuit suffit.",
    needs: ['ranked', 'newGames'],
  },
];

/** « Trois portes » (étiquette au-dessus des portes). */
export const doorsLabel = (count: number) => `${cap(enLettres(count, 'f'))} ${pluriel(count, 'porte')}`;
/** Numéro d'une porte (index parmi les portes montrées) : « I », « II »… */
export const doorNum = (i: number) => romain(i + 1);
/** Surtitre de la feuille d'une porte : « Première porte », « Deuxième porte »… */
export const doorKicker = (i: number) => `${cap(ordinalLettres(i + 1, 'f'))} porte`;

// ---------------------------------------------------------------------------------------------
// Boutique (Bazar de l'accueil) : les objets et les prix du catalogue, sans rien recalculer ici

export const KINGS = ITEMS.filter(i => i.kind === 'king');
export const SKINS = ITEMS.filter(i => i.kind === 'skin');
export const BOARDS = ITEMS.filter(i => i.kind === 'board');
/** Packs en vente (un pack retiré n'est pas dans PRODUCTS). */
export const PACKS = PRODUCTS.filter(p => p.kind === 'pack');

/** Étagères dessinées du Bazar (rois, sorts, échiquiers), dans l'ordre d'affichage. */
export const BAZAR_SHELVES = ['king', 'skin', 'board'] as const satisfies readonly ItemKind[];
/** Emplacements de SLOT_DEFS sans étagère dessinée (un emplacement futur) : une étagère simple après les autres. */
export const MORE_SLOTS: readonly ItemKind[] = (Object.keys(SLOT_DEFS) as ItemKind[]).filter(k => !(BAZAR_SHELVES as readonly ItemKind[]).includes(k));
/** Objets d'un emplacement. */
export const itemsOf = (kind: ItemKind) => ITEMS.filter(i => i.kind === kind);

/** Prix lisible d'un objet à l'unité (« Offert » pour les objets gratuits) : unitPrice du catalogue. */
export function priceOf(itemId: string): string {
  const item = itemById(itemId);
  if (!item) return '';
  if (item.free) return 'Offert';
  const cents = unitPrice(itemId);
  return cents ? formatPrice(cents) : '';
}

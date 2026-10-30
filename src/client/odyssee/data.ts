// L'Odyssée : les lieux traversés pendant la descente, et ce que l'échiquier y joue.
// Les cartes présentées dépendent du catalogue disponible : les cartes « climats » dès qu'elles existent,
// sinon les cartes historiques (« duel »). Rien n'est figé : tout est relu dans CARDS au chargement.
import { CARDS, CARD_IDS, isCardId } from '../../shared/cards';
import type { CardDef, CardId, Catalog } from '../../shared/cards';
import { ITEMS, PRODUCTS, formatPrice } from '../../shared/catalog';
import { dealHands } from '../../shared/game';

export type PoseKey = 'hero' | 'foret' | 'pics' | 'sablier' | 'bazar' | 'seuil';

export interface Place {
  id: PoseKey;
  num: string;
  name: string;
  /** Altitude affichée par l'altimètre en arrivant dans le lieu. */
  alt: number;
  /** Plateau et skin de l'échiquier qui accompagne la descente. */
  theme: string;
  skin: string;
  /** Teinte du lieu (r g b), reprise par le rideau du mode jeu. */
  tint: string;
}

export const PLACES: Place[] = [
  { id: 'hero', num: 'I', name: "L'Observatoire", alt: 9120, theme: 'board:arcane', skin: 'skin:celestial', tint: '120 92 255' },
  { id: 'foret', num: 'II', name: 'La Forêt de givre', alt: 6480, theme: 'board:slate', skin: 'skin:arcane', tint: '94 214 240' },
  { id: 'pics', num: 'III', name: "Les Pics de l'orage", alt: 4210, theme: 'board:arcane', skin: 'skin:void', tint: '150 110 255' },
  { id: 'sablier', num: 'IV', name: 'Le Sablier', alt: 1730, theme: 'board:obsidian', skin: 'skin:inferno', tint: '240 150 70' },
  { id: 'bazar', num: 'V', name: 'Le Bazar céleste', alt: 640, theme: 'board:marble', skin: 'skin:neon', tint: '236 120 180' },
  { id: 'seuil', num: 'VI', name: 'Le Seuil', alt: 0, theme: 'board:arcane', skin: 'skin:celestial', tint: '243 201 105' },
];

// ---------------------------------------------------------------------------------------------
// Catalogue de cartes

/** Catalogue des parties locales : « climats » dès que le moteur en distribue, sinon « duel ». */
export function liveCatalog(): Exclude<Catalog, 'aucune'> {
  try {
    return dealHands(false, false, Math.random, 'climats').w.length > 0 ? 'climats' : 'duel';
  } catch {
    return 'duel';
  }
}

const cardsOf = (catalog: Catalog) => CARD_IDS.filter(id => CARDS[id].catalog === catalog);

type StoryPlace = 'foret' | 'pics' | 'sablier';

/** Répartition des cartes par lieu, selon le catalogue. Les identifiants inconnus sont ignorés. */
const LAYOUT: Record<Exclude<Catalog, 'aucune'>, Record<StoryPlace, string[]>> = {
  duel: {
    foret: ['ice_wall', 'freeze', 'phase'],
    pics: ['lightning', 'gravity', 'shield', 'knight_leap'],
    sablier: ['time_warp', 'rewind', 'revive', 'swap'],
  },
  climats: {
    foret: ['ice_age', 'ice_wall', 'truce', 'rift'],
    pics: ['blast', 'blood_moon', 'cavalcade', 'portals'],
    sablier: ['hourglass', 'deja_vu', 'tide', 'coronation'],
  },
};

/** Cartes racontées dans chaque lieu (toutes les cartes du catalogue, chacune une fois). */
export function placeCards(catalog: Exclude<Catalog, 'aucune'>): Record<StoryPlace, CardId[]> {
  const pool = cardsOf(catalog);
  const used = new Set<CardId>();
  const out: Record<StoryPlace, CardId[]> = { foret: [], pics: [], sablier: [] };
  for (const k of ['foret', 'pics', 'sablier'] as StoryPlace[]) {
    for (const id of LAYOUT[catalog][k]) {
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
export function idleCasts(place: PoseKey, catalog: Exclude<Catalog, 'aucune'>): CardId[] {
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

export const PLACE_COPY: Record<Exclude<Catalog, 'aucune'>, Record<StoryPlace, Copy>> = {
  duel: {
    foret: {
      title: ['Ici, le froid', 'est une arme.'],
      text: 'Sous les pins gelés, on apprend à fermer le jeu : figer une case, immobiliser une pièce, passer à travers ses propres rangs.',
    },
    pics: {
      title: ['Là-haut,', 'le ciel tranche.'],
      text: "Des sorts de force brute, nés dans l'orage : frapper, alourdir, protéger, bondir.",
    },
    sablier: {
      title: ['Le temps,', 'retourné.'],
      text: 'Au cœur du désert, le grand sablier obéit aux audacieux : affoler la pendule, effacer un coup, relever une pièce tombée.',
    },
  },
  climats: {
    foret: {
      title: ['Ici, le froid', 'gagne la partie.'],
      text: 'Sous les pins gelés, on apprend à fermer le jeu : figer tous les pions, murer une case, imposer la trêve, fendre le plateau.',
    },
    pics: {
      title: ['Là-haut,', 'le ciel tranche.'],
      text: "Des climats nés dans l'orage : chaque prise qui explose, des captures forcées, des pièces longues qui sautent, des portails.",
    },
    sablier: {
      title: ['Le temps,', 'retourné.'],
      text: 'Au cœur du désert, le grand sablier obéit aux audacieux : affoler les pendules, revivre le dernier tour, lever la marée, couronner un pion.',
    },
  },
};

export const INTERLUDE: Record<Exclude<Catalog, 'aucune'>, Copy> = {
  duel: {
    title: ['Trois sorts.', 'Un seul par tour.'],
    text: 'Chaque carte ne sert qu’une fois. Tout l’art est de choisir le moment.',
  },
  climats: {
    title: ['Le monde change.', 'Pour les deux camps.'],
    text: 'Une carte ne vous donne pas un pouvoir : elle change la partie pour tout le monde. Vous gagnez parce que vous avez choisi le moment.',
  },
};

export function principle(catalog: Exclude<Catalog, 'aucune'>) {
  return [
    {
      n: '01',
      title: 'Les échecs, intacts.',
      text: 'Roque, prise en passant, promotion, pendule : toutes les règles, sans exception. Votre jeu reste votre meilleure arme.',
    },
    {
      n: '02',
      title: 'Trois cartes en main.',
      text: "Distribuées au hasard, cachées à l'adversaire. Chacune ne sert qu'une seule fois par partie.",
    },
    {
      n: '03',
      title: 'Un sort par tour.',
      text:
        catalog === 'climats'
          ? 'Avant votre coup, lancez une carte : elle change la partie pour les deux camps. Certaines s’annoncent un tour à l’avance.'
          : 'Avant votre coup, lancez une carte. Elle ne remplace pas votre coup : elle le prépare.',
    },
  ];
}

export const MODES = [
  {
    key: 'ami',
    title: 'Défier un ami',
    tag: 'Sans compte',
    text: 'Créez une partie, envoyez le lien. Votre ami la rejoint en un clic, sur mobile comme sur ordinateur.',
  },
  {
    key: 'ia',
    title: "Affronter l'IA",
    tag: '3 niveaux',
    text: 'Apprenti, Sorcier ou Archimage : une IA qui calcule et garde ses sorts pour le bon moment.',
  },
  {
    key: 'elo',
    title: 'Parties classées',
    tag: 'Elo',
    text: "Montez au classement et gardez l'historique de vos parties. Un compte gratuit suffit.",
  },
] as const;

export const LEVELS = [
  { level: 1 as const, name: 'Apprenti', text: 'Joue vite, lance ses sorts au hasard.' },
  { level: 2 as const, name: 'Sorcier', text: 'Calcule, protège ses pièces, garde une carte pour la fin.' },
  { level: 3 as const, name: 'Archimage', text: 'Calcule en profondeur et punit chaque sort gaspillé.' },
];

// ---------------------------------------------------------------------------------------------
// Boutique

export const SKINS = ITEMS.filter(i => i.kind === 'skin');
export const BOARDS = ITEMS.filter(i => i.kind === 'board');
export const PACKS = PRODUCTS.filter(p => p.id.startsWith('pack:'));

/** Prix lisible d'un objet de la boutique (« Offert » pour les objets gratuits). */
export function priceOf(itemId: string): string {
  const item = ITEMS.find(i => i.id === itemId);
  if (item?.free) return 'Offert';
  const p = PRODUCTS.find(x => x.id === itemId) ?? PRODUCTS.find(x => x.items.length === 1 && x.items[0] === itemId);
  return p ? formatPrice(p.priceCents) : '';
}

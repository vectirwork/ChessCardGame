// L'Odyssée : les lieux traversés pendant la descente, et ce que l'échiquier y joue.
// Les cartes présentées sont les huit pouvoirs (catalogue « climats », libellé « Pouvoirs ») : chaque pouvoir touche
// les deux camps et les mains sont visibles des deux côtés (décision du fondateur du 30 octobre). Le Duel n'est plus
// proposé nulle part.
import { cardsOf, isCardId } from '../../shared/cards';
import type { CardDef, CardId, Catalog } from '../../shared/cards';
import { ITEMS, PRODUCTS, formatPrice } from '../../shared/catalog';

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

/**
 * Catalogue des parties locales et des démonstrations : toujours les Pouvoirs. Le type garde la forme d'origine
 * (`Exclude<Catalog, 'aucune'>`) pour les appelants (boutique, démonstrations).
 */
export function liveCatalog(): 'climats' {
  return 'climats';
}

type StoryPlace = 'foret' | 'pics' | 'sablier';

/** Répartition des huit pouvoirs par lieu. Les identifiants inconnus sont ignorés. */
const LAYOUT: Record<StoryPlace, string[]> = {
  foret: ['ice_age', 'ice_wall', 'rift'],
  pics: ['blast', 'blood_moon', 'truce'],
  sablier: ['hourglass', 'tide'],
};

/** Cartes racontées dans chaque lieu (toutes les cartes du catalogue, chacune une fois). */
export function placeCards(catalog: Exclude<Catalog, 'aucune'> = 'climats'): Record<StoryPlace, CardId[]> {
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

export const PLACE_COPY: Record<'climats', Record<StoryPlace, Copy>> = {
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

export const INTERLUDE: Record<'climats', Copy> = {
  climats: {
    title: ['Le monde change.', 'Pour les deux camps.'],
    text: 'Une carte ne vous donne pas un pouvoir : elle change la partie pour tout le monde. Vos cartes et celles de l’adversaire sont visibles : vous gagnez parce que vous avez choisi le moment.',
  },
};

export function principle(_catalog: Exclude<Catalog, 'aucune'> = 'climats') {
  return [
    {
      n: '01',
      title: 'Les échecs, intacts.',
      text: 'Roque, prise en passant, promotion, pendule : toutes les règles, sans exception. Votre jeu reste votre meilleure arme.',
    },
    {
      n: '02',
      title: 'Trois cartes, visibles.',
      text: "Distribuées au hasard parmi huit pouvoirs, visibles des deux joueurs. Chacune ne sert qu'une seule fois par partie.",
    },
    {
      n: '03',
      title: 'Un sort par tour.',
      text: 'Avant votre coup, lancez une carte : elle change la partie pour les deux camps. Certaines s’annoncent un tour à l’avance.',
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

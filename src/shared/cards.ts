// Catalogue des cartes de pouvoir. Les règles d'application sont dans game.ts.
// Deux catalogues de cartes (décision du fondateur du 30 octobre, docs/PLAN-ODYSSEE.md) :
// - 'climats' (« Pouvoirs ») : 8 pouvoirs qui touchent toujours les deux camps, mains visibles des deux côtés ;
// - 'duel' : les 11 cartes historiques, qui visent l'adversaire. Il n'est plus proposé : le moteur le garde
//   seulement pour relire ou reprendre les parties créées avant.
// Le Mur de glace appartient aux deux (permanent dans les Pouvoirs, 3 coups adverses dans le Duel).

export type CardId =
  // Pouvoirs : Climats
  | 'hourglass'
  | 'truce'
  | 'blood_moon'
  | 'ice_age'
  | 'blast'
  // Pouvoirs : Terrains (le Mur de glace sert aussi au catalogue Duel)
  | 'ice_wall'
  | 'rift'
  // Pouvoirs : Événement
  | 'tide'
  // Duel (cartes historiques)
  | 'time_warp'
  | 'gravity'
  | 'freeze'
  | 'shield'
  | 'swap'
  | 'rewind'
  | 'revive'
  | 'knight_leap'
  | 'lightning'
  | 'phase';

export type Rarity = 'commune' | 'rare' | 'épique' | 'légendaire';

/**
 * Catalogue utilisé par une partie :
 * - 'climats' (« Pouvoirs », par défaut) : 8 pouvoirs qui touchent les deux camps ;
 * - 'duel' : les 11 cartes historiques ; plus proposé, gardé pour les parties créées avant ;
 * - 'aucune' : échecs classiques, sans cartes.
 */
export type Catalog = 'climats' | 'duel' | 'aucune';
/** Catalogue qui contient des cartes. */
export type CardCatalog = Exclude<Catalog, 'aucune'>;
/** Catalogues proposés (interface, création de partie, file d'attente), le premier par défaut. */
export const CATALOGS: { id: Catalog; label: string; description: string }[] = [
  { id: 'climats', label: 'Pouvoirs', description: 'Huit pouvoirs, visibles des deux joueurs, qui changent la partie pour les deux camps.' },
  { id: 'aucune', label: 'Sans cartes', description: 'Les échecs classiques, rien d’autre.' },
];

/**
 * Catalogue d'une nouvelle partie demandé par un client : le Duel (ancien client, préférence enregistrée) est
 * ramené aux Pouvoirs, comme toute valeur inconnue ; seul « Sans cartes » est gardé tel quel.
 */
export function offeredCatalog(c: unknown): Catalog {
  return c === 'aucune' ? 'aucune' : 'climats';
}

/** Famille d'une carte : Climat (règle globale), Terrain (cases), Événement (instantané), Duel (catalogue historique). */
export type Family = 'climat' | 'terrain' | 'evenement' | 'duel';

export const FAMILY_LABEL: Record<Family, string> = {
  climat: 'Climat',
  terrain: 'Terrain',
  evenement: 'Événement',
  duel: 'Duel',
};

export interface CardDef {
  id: CardId;
  name: string;
  /** Phrase d'accroche, affichée sous le nom. */
  tagline: string;
  /** Règle exacte. */
  description: string;
  /** Nombre de cases à désigner (0, 1 ou 2). */
  targets: 0 | 1 | 2;
  /** Consigne affichée pendant la sélection de chaque cible. */
  prompts: string[];
  /** Durée lisible. */
  duration: string;
  rarity: Rarity;
  /** Teinte principale (degrés HSL) pour l'interface. */
  hue: number;
  /** Carte jouable seulement dans une partie avec pendule. */
  timedOnly?: boolean;
  /** Carte exclue du tirage des parties contre l'IA (Sablier fou). */
  humanOnly?: boolean;
  /** Duel : durée de l'effet, en coups du camp concerné (absent pour un effet instantané). */
  turns?: number;
  /** Duel : l'effet se décompte sur les coups de l'adversaire (sinon sur ceux du lanceur). */
  countsOnOpponent?: boolean;
  /**
   * Pouvoirs : durée de l'effet en coups des deux camps (demi-coups), comptés à partir de son arrivée
   * (Présage) ou du coup du lanceur (effet immédiat). Absent pour un Événement et un effet permanent.
   */
  coups?: number;
  /** Pouvoirs : l'effet dure jusqu'à la fin de la partie (Mur de glace). */
  permanent?: boolean;
  /** Catalogues auxquels la carte appartient (le Mur de glace est dans les deux). */
  catalogs: CardCatalog[];
  /**
   * @deprecated Premier catalogue de la carte (le Mur de glace est aussi du Duel) : utiliser `catalogs`,
   * `inCatalog(id, catalog)` ou `cardsOf(catalog)`.
   */
  catalog: CardCatalog;
  family: Family;
  /** Présage : l'effet est annoncé et n'arrive qu'au début du tour suivant du lanceur. */
  presage?: boolean;
  /** Rituel : la carte remplace le coup du lanceur. */
  ritual?: boolean;
}

const DEFS: Record<CardId, Omit<CardDef, 'catalog'>> = {
  // -------------------------------------------------------------------------------------------
  // Climats : une règle pour tout le plateau, annoncée un tour à l'avance (Présage). Un seul Climat à la fois.
  hourglass: {
    id: 'hourglass',
    catalogs: ['climats'],
    family: 'climat',
    name: 'Sablier fou',
    tagline: 'Le temps s’emballe pour tout le monde.',
    description:
      'Annoncé, il arrive au début de votre prochain tour. Pendant 6 coups, les deux pendules s’écoulent deux fois plus vite et les coups ne rapportent plus d’incrément.',
    targets: 0,
    prompts: [],
    duration: '6 coups (3 chacun)',
    rarity: 'rare',
    hue: 192,
    timedOnly: true,
    humanOnly: true,
    presage: true,
    coups: 6,
  },
  truce: {
    id: 'truce',
    catalogs: ['climats'],
    family: 'climat',
    name: 'Trêve',
    tagline: 'Les armes se taisent.',
    description:
      'Annoncée, elle arrive au début de votre prochain tour. Pendant 3 coups, aucune capture n’est permise (prise en passant comprise), sauf pour sortir d’un échec. L’adversaire reprend les captures le premier.',
    targets: 0,
    prompts: [],
    duration: '3 coups (vous, lui, vous)',
    rarity: 'commune',
    hue: 85,
    presage: true,
    coups: 3,
  },
  blood_moon: {
    id: 'blood_moon',
    catalogs: ['climats'],
    family: 'climat',
    name: 'Lune de sang',
    tagline: 'Qui peut prendre, doit prendre.',
    description:
      'Annoncée, elle arrive au début de votre prochain tour. Pendant 3 coups, un joueur qui peut capturer doit capturer ; il choisit la capture (prise en passant comprise). L’adversaire retrouve le premier sa liberté.',
    targets: 0,
    prompts: [],
    duration: '3 coups (vous, lui, vous)',
    rarity: 'épique',
    hue: 0,
    presage: true,
    coups: 3,
  },
  ice_age: {
    id: 'ice_age',
    catalogs: ['climats'],
    family: 'climat',
    name: 'Ère glaciaire',
    tagline: 'Le front se fige.',
    description:
      'Annoncée, elle arrive au début de votre prochain tour. Pendant 4 coups, tous les pions des deux camps sont gelés : ils ne bougent ni ne capturent. Un roi ne peut toujours pas se placer sur une case qu’attaque un pion adverse.',
    targets: 0,
    prompts: [],
    duration: '4 coups (2 chacun)',
    rarity: 'rare',
    hue: 222,
    presage: true,
    coups: 4,
  },
  blast: {
    id: 'blast',
    catalogs: ['climats'],
    family: 'climat',
    name: 'Déflagration',
    tagline: 'Chaque prise fait sauter le quartier.',
    description:
      'Annoncée, elle arrive au début de votre prochain tour. Pendant 4 coups, toute capture faite par une autre pièce qu’un roi explose : la pièce qui capture, sa victime et les pièces des 8 cases voisines disparaissent, sauf les pions et les rois. Un roi capture normalement.',
    targets: 0,
    prompts: [],
    duration: '4 coups (2 chacun)',
    rarity: 'légendaire',
    hue: 25,
    presage: true,
    coups: 4,
  },

  // -------------------------------------------------------------------------------------------
  // Terrains : des cases transformées pour les deux camps.
  ice_wall: {
    id: 'ice_wall',
    catalogs: ['climats', 'duel'],
    family: 'terrain',
    name: 'Mur de glace',
    tagline: 'Ici, plus personne ne passe.',
    description:
      'Une case vide entre la 3e et la 6e rangée devient infranchissable pour les deux camps, jusqu’à la fin de la partie : aucune pièce ne peut s’y arrêter ni la traverser. Un cavalier peut sauter par-dessus.',
    targets: 1,
    prompts: ['Choisissez une case vide entre la 3e et la 6e rangée'],
    duration: 'Jusqu’à la fin de la partie',
    rarity: 'commune',
    hue: 200,
    // Pouvoirs : permanent. Duel (anciennes parties) : 3 coups adverses, sur n'importe quelle case vide.
    permanent: true,
    turns: 3,
    countsOnOpponent: true,
  },
  rift: {
    id: 'rift',
    catalogs: ['climats'],
    family: 'terrain',
    name: 'Faille',
    tagline: 'Le plateau se fend en deux.',
    description:
      'Choisissez la 4e ou la 5e rangée. Pendant 4 coups, toutes ses cases vides deviennent un gouffre : aucune pièce ne peut s’y arrêter ni le traverser. Les cavaliers passent par-dessus.',
    targets: 1,
    prompts: ['Choisissez la 4e ou la 5e rangée (une case de la rangée)'],
    duration: '4 coups (2 chacun)',
    rarity: 'commune',
    hue: 285,
    coups: 4,
  },

  // -------------------------------------------------------------------------------------------
  // Événements : agissent une fois.
  tide: {
    id: 'tide',
    catalogs: ['climats'],
    family: 'evenement',
    name: 'Grande Marée',
    tagline: 'La mer avance pour tout le monde.',
    description:
      'Rituel : la carte remplace votre coup. Tous les pions des deux camps qui sont sur leurs 2e à 5e rangées avancent d’une case, si elle est libre. C’est ensuite à l’adversaire de jouer.',
    targets: 0,
    prompts: [],
    duration: 'Instantané',
    rarity: 'rare',
    hue: 172,
    ritual: true,
  },

  // -------------------------------------------------------------------------------------------
  // Duel : les cartes historiques.
  time_warp: {
    id: 'time_warp',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Distorsion temporelle',
    tagline: 'Le temps file entre ses doigts.',
    description: "La pendule adverse s'écoule deux fois plus vite pendant ses 3 prochains coups.",
    targets: 0,
    prompts: [],
    duration: '3 coups adverses',
    rarity: 'rare',
    hue: 192,
    timedOnly: true,
    turns: 3,
    countsOnOpponent: true,
  },
  gravity: {
    id: 'gravity',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Gravité',
    tagline: 'Chaque pas pèse une tonne.',
    description: 'La portée des tours, fous et dames adverses est divisée par deux : 3 cases au plus.',
    targets: 0,
    prompts: [],
    duration: '3 coups adverses',
    rarity: 'rare',
    hue: 268,
    turns: 3,
    countsOnOpponent: true,
  },
  freeze: {
    id: 'freeze',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Cryogénie',
    tagline: 'Figée dans la glace éternelle.',
    description: 'Gèle une pièce adverse (sauf le roi) : elle ne peut ni bouger, ni capturer, ni protéger.',
    targets: 1,
    prompts: ['Choisissez une pièce adverse à geler'],
    duration: '2 coups adverses',
    rarity: 'commune',
    hue: 185,
    turns: 2,
    countsOnOpponent: true,
  },
  shield: {
    id: 'shield',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Égide',
    tagline: 'Intouchable.',
    description: 'Une de vos pièces (sauf le roi) devient imprenable et insensible aux cartes adverses.',
    targets: 1,
    prompts: ['Choisissez une de vos pièces à protéger'],
    duration: '2 coups adverses',
    rarity: 'commune',
    hue: 44,
    turns: 2,
    countsOnOpponent: true,
  },
  swap: {
    id: 'swap',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Permutation',
    tagline: 'Deux âmes, deux places.',
    description:
      "Échange instantanément la place de deux de vos pièces (sauf le roi). Un pion ne peut pas arriver sur la première ou la dernière rangée.",
    targets: 2,
    prompts: ['Choisissez la première pièce', 'Choisissez la pièce avec laquelle échanger'],
    duration: 'Instantané',
    rarity: 'rare',
    hue: 300,
  },
  rewind: {
    id: 'rewind',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Retour arrière',
    tagline: 'Ce coup-là ? Il n’a jamais existé.',
    description: "Annule le dernier coup adverse. Votre adversaire doit rejouer, et pas le même coup.",
    targets: 0,
    prompts: [],
    duration: 'Instantané',
    rarity: 'légendaire',
    hue: 334,
  },
  revive: {
    id: 'revive',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Résurrection',
    tagline: 'Les héros ne meurent jamais vraiment.',
    description:
      'Ramène votre meilleure pièce capturée (tour, puis fou, puis cavalier) sur une case vide de votre première rangée, ou un pion sur votre deuxième rangée.',
    targets: 1,
    prompts: ['Choisissez où faire renaître votre pièce'],
    duration: 'Instantané',
    rarity: 'épique',
    hue: 140,
  },
  knight_leap: {
    id: 'knight_leap',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Saut du cavalier',
    tagline: "L'élan d'un destrier.",
    description: 'Pour ce tour, une de vos tours, fous ou dames peut aussi se déplacer comme un cavalier.',
    targets: 1,
    prompts: ['Choisissez la pièce qui pourra sauter'],
    duration: 'Ce tour',
    rarity: 'commune',
    hue: 28,
    turns: 1,
  },
  lightning: {
    id: 'lightning',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Foudre',
    tagline: 'Le ciel a tranché.',
    description: 'Pulvérise un pion adverse, où qu’il soit sur l’échiquier.',
    targets: 1,
    prompts: ['Choisissez le pion adverse à foudroyer'],
    duration: 'Instantané',
    rarity: 'rare',
    hue: 52,
  },
  phase: {
    id: 'phase',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Passe-muraille',
    tagline: 'Vos rangs s’écartent comme de la brume.',
    description:
      'Pour ce tour, une de vos tours, fous ou dames traverse vos propres pièces. Une pièce adverse l’arrête toujours.',
    targets: 1,
    prompts: ['Choisissez la pièce qui deviendra spectrale'],
    duration: 'Ce tour',
    rarity: 'rare',
    hue: 250,
    turns: 1,
  },
};

export const CARDS = Object.fromEntries(
  Object.entries(DEFS).map(([id, def]) => [id, { ...def, catalog: def.catalogs[0] }]),
) as Record<CardId, CardDef>;

/** Toutes les cartes, Pouvoirs d'abord. Pour les cartes d'un seul catalogue : `cardsOf`. */
export const CARD_IDS = Object.keys(CARDS) as CardId[];

/** La carte appartient-elle à ce catalogue ? */
export function inCatalog(id: CardId, catalog: Catalog): boolean {
  return catalog !== 'aucune' && CARDS[id].catalogs.includes(catalog);
}

/** Cartes d'un catalogue, dans l'ordre de présentation (vide pour 'aucune'). */
export function cardsOf(catalog: Catalog): CardId[] {
  return CARD_IDS.filter(id => inCatalog(id, catalog));
}

export const RARITY_LABEL: Record<Rarity, string> = {
  commune: 'Commune',
  rare: 'Rare',
  épique: 'Épique',
  légendaire: 'Légendaire',
};

/** Poids du tirage pondéré (catalogue Pouvoirs) : les cartes rares sortent moins souvent. */
export const RARITY_WEIGHT: Record<Rarity, number> = { commune: 4, rare: 3, épique: 2, légendaire: 1 };

export function isCardId(x: unknown): x is CardId {
  return typeof x === 'string' && Object.hasOwn(CARDS, x);
}

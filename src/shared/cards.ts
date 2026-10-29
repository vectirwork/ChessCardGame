// Catalogue des cartes de pouvoir. Les règles d'application sont dans game.ts.

export type CardId =
  | 'time_warp'
  | 'ice_wall'
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
  /** Durée de l'effet, en coups du camp concerné (absent pour un effet instantané). */
  turns?: number;
  /** L'effet se décompte sur les coups de l'adversaire (sinon sur ceux du lanceur). */
  countsOnOpponent?: boolean;
}

export const CARDS: Record<CardId, CardDef> = {
  time_warp: {
    id: 'time_warp',
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
  ice_wall: {
    id: 'ice_wall',
    name: 'Mur de glace',
    tagline: 'Ici, personne ne passe.',
    description: "Une case vide devient infranchissable : aucune pièce ne peut s'y arrêter ni la traverser.",
    targets: 1,
    prompts: ['Choisis une case vide à geler'],
    duration: '3 coups adverses',
    rarity: 'commune',
    hue: 200,
    turns: 3,
    countsOnOpponent: true,
  },
  gravity: {
    id: 'gravity',
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
    name: 'Cryogénie',
    tagline: 'Figée dans la glace éternelle.',
    description: 'Gèle une pièce adverse (sauf le roi) : elle ne peut ni bouger, ni capturer, ni protéger.',
    targets: 1,
    prompts: ['Choisis une pièce adverse à geler'],
    duration: '2 coups adverses',
    rarity: 'commune',
    hue: 185,
    turns: 2,
    countsOnOpponent: true,
  },
  shield: {
    id: 'shield',
    name: 'Égide',
    tagline: 'Intouchable.',
    description: 'Une de vos pièces (sauf le roi) devient imprenable et insensible aux cartes adverses.',
    targets: 1,
    prompts: ['Choisis une de tes pièces à protéger'],
    duration: '2 coups adverses',
    rarity: 'commune',
    hue: 44,
    turns: 2,
    countsOnOpponent: true,
  },
  swap: {
    id: 'swap',
    name: 'Permutation',
    tagline: 'Deux âmes, deux places.',
    description:
      "Échange instantanément la place de deux de vos pièces (sauf le roi). Un pion ne peut pas arriver sur la première ou la dernière rangée.",
    targets: 2,
    prompts: ['Choisis la première pièce', 'Choisis la pièce avec laquelle échanger'],
    duration: 'Instantané',
    rarity: 'rare',
    hue: 300,
  },
  rewind: {
    id: 'rewind',
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
    name: 'Résurrection',
    tagline: 'Les héros ne meurent jamais vraiment.',
    description:
      'Ramène votre meilleure pièce capturée (tour, puis fou, puis cavalier) sur une case vide de votre première rangée, ou un pion sur votre deuxième rangée.',
    targets: 1,
    prompts: ['Choisis où faire renaître ta pièce'],
    duration: 'Instantané',
    rarity: 'épique',
    hue: 140,
  },
  knight_leap: {
    id: 'knight_leap',
    name: 'Saut du cavalier',
    tagline: "L'élan d'un destrier.",
    description: 'Pour ce tour, une de vos tours, fous ou dames peut aussi se déplacer comme un cavalier.',
    targets: 1,
    prompts: ['Choisis la pièce qui pourra sauter'],
    duration: 'Ce tour',
    rarity: 'commune',
    hue: 28,
    turns: 1,
  },
  lightning: {
    id: 'lightning',
    name: 'Foudre',
    tagline: 'Le ciel a tranché.',
    description: 'Pulvérise un pion adverse, où qu’il soit sur l’échiquier.',
    targets: 1,
    prompts: ['Choisis le pion adverse à foudroyer'],
    duration: 'Instantané',
    rarity: 'rare',
    hue: 52,
  },
  phase: {
    id: 'phase',
    name: 'Passe-muraille',
    tagline: 'Tes rangs s’écartent comme de la brume.',
    description:
      'Pour ce tour, une de vos tours, fous ou dames traverse vos propres pièces. Une pièce adverse l’arrête toujours.',
    targets: 1,
    prompts: ['Choisis la pièce qui deviendra spectrale'],
    duration: 'Ce tour',
    rarity: 'rare',
    hue: 250,
    turns: 1,
  },
};

export const CARD_IDS = Object.keys(CARDS) as CardId[];

export const RARITY_LABEL: Record<Rarity, string> = {
  commune: 'Commune',
  rare: 'Rare',
  épique: 'Épique',
  légendaire: 'Légendaire',
};

export function isCardId(x: unknown): x is CardId {
  return typeof x === 'string' && x in CARDS;
}

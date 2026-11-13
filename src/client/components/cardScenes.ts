// Scènes explicatives des 8 pouvoirs : un cas typique sur un petit échiquier (CardScene).
//
// Deux sortes de scènes :
// - deux images, « avant » et « après » (`pair`) : la position de départ, puis l'effet du pouvoir. Les coups possibles
//   sont des points, comme sur l'échiquier ; une seule flèche fine, quand une prise doit se voir (Déflagration).
//   Animée (survol, bulle d'une carte) : l'image de droite rejoue l'action, celle de gauche reste le point de départ.
// - une seule image avec des flèches (Trêve, Lune de sang) : un coup interdit (flèche barrée) ou forcé.
// Coordonnées propres à la scène : colonnes a, b, c…, rangées 1 (en bas) à `rows`.
import type { CardId, PowerCardId } from '../../shared/cards';
import type { Color, PieceType } from '../../shared/chess';

export interface ScenePiece {
  id: string;
  c: Color;
  t: PieceType;
  at: string;
}

export interface SceneArrow {
  from: string;
  to: string;
  /** gold : le coup du joueur ; red : la réponse, ou l'interdit ; cyan : un mouvement d'ensemble ; white : discret */
  tone: 'gold' | 'red' | 'cyan' | 'white';
  /** Numéro de l'étape, affiché en petit au départ de la flèche. */
  n?: number;
  /** Coup interdit par le pouvoir : flèche barrée. */
  blocked?: boolean;
}

export interface SceneStep {
  /** Pièces déplacées : [identifiant, case d'arrivée]. */
  moves?: [string, string][];
  /** Pièces qui disparaissent (prise, explosion). */
  remove?: string[];
  /** Explosion sur cette case (Déflagration). */
  burst?: string;
  /** La pièce essaie, mais le pouvoir l'en empêche : elle tremble. */
  shake?: string;
  /** Pause après l'étape, en millisecondes (900 par défaut). */
  hold?: number;
}

export type SceneMark = { at: string; kind: 'wall' | 'rift' | 'frost' | 'scorch' };

/** Ce qu'une image d'une paire montre en plus des pièces. */
export interface PanelDecor {
  /** Coups possibles (points), comme sur l'échiquier. */
  dots?: string[];
  /** Prises possibles (anneaux). */
  rings?: string[];
  /** Cases du coup joué, surlignées comme le dernier coup d'une partie. */
  hl?: string[];
  marks?: SceneMark[];
  /** Une flèche fine et discrète. */
  arrow?: { from: string; to: string };
}

export interface CardSceneDef {
  cols: number;
  rows: number;
  pieces: ScenePiece[];
  /** Image unique : cases transformées (Mur de glace, gouffre de la Faille, givre sur un pion gelé). */
  marks?: SceneMark[];
  /** Teinte de l'échiquier pendant le pouvoir (image unique, ou image « après »). */
  tint?: 'moon' | 'frost' | 'truce' | 'blast' | 'rift' | 'tide';
  arrows: SceneArrow[];
  steps: SceneStep[];
  /** Ce que montre la scène, en une phrase (texte alternatif et légende). */
  caption: string;
  /** Sablier fou : des pendules au lieu d'un échiquier. */
  clocks?: boolean;
  /**
   * Deux images, avant et après. `afterAt` : étape à partir de laquelle l'image de droite montre l'effet (marques,
   * points, teinte) quand elle s'anime ; par défaut, la dernière.
   */
  pair?: { labels: [string, string]; before: PanelDecor; after: PanelDecor; afterAt?: number };
}

/** ← Scène de chaque Pouvoir (table exhaustive : un Pouvoir ajouté ne compile pas sans la sienne). */
const SCENES: Readonly<Record<PowerCardId, CardSceneDef>> = {
  blood_moon: {
    cols: 4,
    rows: 4,
    tint: 'moon',
    pieces: [
      { id: 'q', c: 'w', t: 'q', at: 'b1' },
      { id: 'p1', c: 'b', t: 'p', at: 'b3' },
      { id: 'p2', c: 'b', t: 'p', at: 'c4' },
    ],
    arrows: [
      { from: 'b1', to: 'b3', tone: 'gold', n: 1 },
      { from: 'c4', to: 'b3', tone: 'red', n: 2 },
    ],
    steps: [
      { moves: [['q', 'b3']], remove: ['p1'] },
      { moves: [['p2', 'b3']], remove: ['q'], hold: 1300 },
    ],
    caption: 'Qui peut prendre doit prendre : la dame prend le pion protégé, puis se fait reprendre.',
  },
  truce: {
    cols: 4,
    rows: 4,
    tint: 'truce',
    pieces: [
      { id: 'r', c: 'w', t: 'r', at: 'a1' },
      { id: 'n', c: 'b', t: 'n', at: 'a3' },
    ],
    arrows: [
      { from: 'a1', to: 'a3', tone: 'red', blocked: true },
      { from: 'a1', to: 'c1', tone: 'gold', n: 1 },
    ],
    steps: [{ shake: 'r' }, { moves: [['r', 'c1']], hold: 1300 }],
    caption: 'Trêve : personne ne prend. La tour ne peut pas prendre le cavalier, elle joue ailleurs.',
  },
  ice_age: {
    cols: 3,
    rows: 3,
    tint: 'frost',
    pieces: [
      { id: 'p', c: 'w', t: 'p', at: 'a2' },
      { id: 'x', c: 'b', t: 'p', at: 'b3' },
    ],
    arrows: [],
    steps: [{ hold: 1700 }],
    pair: {
      labels: ['Avant', 'Pions gelés : ils ne bougent plus'],
      before: { dots: ['a3'], rings: ['b3'] },
      after: { marks: [{ at: 'a2', kind: 'frost' }, { at: 'b3', kind: 'frost' }] },
      afterAt: 1,
    },
    caption: 'Ère glaciaire : avant, le pion peut avancer ou prendre ; pendant, les pions gelés ne bougent ni ne prennent.',
  },
  blast: {
    cols: 3,
    rows: 3,
    tint: 'blast',
    pieces: [
      { id: 'q', c: 'w', t: 'q', at: 'a1' },
      { id: 'n', c: 'b', t: 'n', at: 'c3' },
      { id: 'p', c: 'b', t: 'p', at: 'b3' },
    ],
    arrows: [],
    steps: [{ moves: [['q', 'c3']], hold: 500 }, { remove: ['q', 'n'], burst: 'c3', hold: 1700 }],
    pair: {
      labels: ['La dame prend le cavalier', 'Les deux disparaissent'],
      before: { hl: ['a1', 'c3'], arrow: { from: 'a1', to: 'c3' } },
      after: { marks: [{ at: 'c3', kind: 'scorch' }] },
      afterAt: 2,
    },
    caption: 'Déflagration : la dame prend le cavalier et explose avec lui. Le pion voisin ne craint rien.',
  },
  ice_wall: {
    cols: 3,
    rows: 3,
    pieces: [{ id: 'r', c: 'w', t: 'r', at: 'a2' }],
    arrows: [],
    steps: [{ hold: 1700 }],
    pair: {
      labels: ['Sans le mur', 'Le mur arrête la tour'],
      before: { dots: ['b2', 'c2', 'a1', 'a3'] },
      after: { marks: [{ at: 'b2', kind: 'wall' }], dots: ['a1', 'a3'] },
      afterAt: 1,
    },
    caption: 'Mur de glace : la case devient infranchissable jusqu’à la fin de la partie, la tour ne passe plus.',
  },
  rift: {
    cols: 3,
    rows: 3,
    tint: 'rift',
    pieces: [{ id: 'r', c: 'w', t: 'r', at: 'a1' }],
    arrows: [],
    steps: [{ hold: 1700 }],
    pair: {
      labels: ['Avant', 'La faille coupe le plateau'],
      before: { dots: ['a2', 'a3', 'b1', 'c1'] },
      after: {
        marks: [
          { at: 'a2', kind: 'rift' },
          { at: 'b2', kind: 'rift' },
          { at: 'c2', kind: 'rift' },
        ],
        dots: ['b1', 'c1'],
      },
      afterAt: 1,
    },
    caption: 'Faille : une rangée devient un gouffre. Aucune pièce ne la traverse, sauf le cavalier qui saute.',
  },
  tide: {
    cols: 4,
    rows: 3,
    tint: 'tide',
    pieces: [
      { id: 'w1', c: 'w', t: 'p', at: 'a1' },
      { id: 'w2', c: 'w', t: 'p', at: 'c1' },
      { id: 'b1', c: 'b', t: 'p', at: 'b3' },
      { id: 'b2', c: 'b', t: 'p', at: 'd3' },
    ],
    arrows: [],
    steps: [
      {
        moves: [
          ['w1', 'a2'],
          ['w2', 'c2'],
          ['b1', 'b2'],
          ['b2', 'd2'],
        ],
        hold: 1700,
      },
    ],
    pair: { labels: ['Avant', 'Tous les pions avancent'], before: {}, after: {}, afterAt: 1 },
    caption: 'Grande Marée : la carte remplace votre coup, tous les pions des deux camps avancent d’une case.',
  },
  hourglass: {
    cols: 2,
    rows: 2,
    clocks: true,
    pieces: [],
    arrows: [],
    steps: [{ hold: 2600 }],
    pair: { labels: ['Pendule normale', 'Deux fois plus vite, sans incrément'], before: {}, after: {}, afterAt: 1 },
    caption: 'Sablier fou : les deux pendules s’écoulent deux fois plus vite, et les coups ne rapportent plus d’incrément.',
  },
};

/** Scène d'une carte, par identifiant (les cartes du Duel n'en ont pas). */
export const CARD_SCENES: Partial<Record<CardId, CardSceneDef>> = SCENES;

/** Colonne et rangée (0 en bas) d'une case de scène (« b3 »). */
export function sceneXY(at: string): { x: number; y: number } {
  return { x: at.charCodeAt(0) - 97, y: Number(at.slice(1)) - 1 };
}

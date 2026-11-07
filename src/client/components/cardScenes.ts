// Scènes explicatives des 8 pouvoirs : un cas typique sur un petit échiquier (CardScene).
//
// Image fixe : la position de départ et des flèches numérotées (1, 2…) qui racontent le cas ; une flèche barrée dit
// ce qui est interdit. Animée (survol, bulle d'une carte) : les étapes se jouent, puis la scène recommence.
// Coordonnées propres à la scène : colonnes a, b, c…, rangées 1 (en bas) à `rows`.
import type { CardId } from '../../shared/cards';
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
  /** gold : le coup du lanceur ou du joueur ; red : la réponse, ou l'interdit ; cyan : un mouvement d'ensemble */
  tone: 'gold' | 'red' | 'cyan';
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

export interface CardSceneDef {
  cols: number;
  rows: number;
  pieces: ScenePiece[];
  /** Cases transformées : Mur de glace, gouffre de la Faille, givre sur un pion gelé. */
  marks?: { at: string; kind: 'wall' | 'rift' | 'frost' }[];
  /** Teinte de l'échiquier pendant le pouvoir. */
  tint?: 'moon' | 'frost' | 'truce' | 'blast' | 'rift' | 'tide';
  arrows: SceneArrow[];
  steps: SceneStep[];
  /** Ce que montre la scène, en une phrase (texte alternatif et légende). */
  caption: string;
  /** Sablier fou : deux pendules au lieu d'un échiquier. */
  clocks?: boolean;
}

export const CARD_SCENES: Partial<Record<CardId, CardSceneDef>> = {
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
    cols: 4,
    rows: 4,
    tint: 'frost',
    pieces: [
      { id: 'p', c: 'w', t: 'p', at: 'b2' },
      { id: 'x', c: 'b', t: 'p', at: 'c3' },
      { id: 'n', c: 'w', t: 'n', at: 'd1' },
    ],
    marks: [
      { at: 'b2', kind: 'frost' },
      { at: 'c3', kind: 'frost' },
    ],
    arrows: [
      { from: 'b2', to: 'c3', tone: 'red', blocked: true },
      { from: 'd1', to: 'c3', tone: 'gold', n: 1 },
    ],
    steps: [{ shake: 'p' }, { moves: [['n', 'c3']], remove: ['x'], hold: 1300 }],
    caption: 'Les pions gelés ne bougent ni ne prennent : ce sont les autres pièces qui jouent.',
  },
  blast: {
    cols: 4,
    rows: 4,
    tint: 'blast',
    pieces: [
      { id: 'n', c: 'w', t: 'n', at: 'b1' },
      { id: 'q', c: 'b', t: 'q', at: 'c3' },
      { id: 'p', c: 'b', t: 'p', at: 'd4' },
    ],
    arrows: [{ from: 'b1', to: 'c3', tone: 'gold', n: 1 }],
    steps: [{ moves: [['n', 'c3']], hold: 450 }, { remove: ['n', 'q'], burst: 'c3', hold: 1500 }],
    caption: 'Chaque prise est un sacrifice : le cavalier prend la dame et disparaît avec elle. Le pion voisin ne craint rien.',
  },
  ice_wall: {
    cols: 4,
    rows: 4,
    pieces: [
      { id: 'r', c: 'w', t: 'r', at: 'a2' },
      { id: 'n', c: 'b', t: 'n', at: 'd2' },
    ],
    marks: [{ at: 'c2', kind: 'wall' }],
    arrows: [
      { from: 'a2', to: 'd2', tone: 'red', blocked: true },
      { from: 'a2', to: 'b2', tone: 'gold', n: 1 },
    ],
    steps: [{ shake: 'r' }, { moves: [['r', 'b2']], hold: 1300 }],
    caption: 'Le Mur de glace ferme sa case jusqu’à la fin de la partie : la tour ne passe plus.',
  },
  rift: {
    cols: 4,
    rows: 4,
    tint: 'rift',
    pieces: [
      { id: 'r', c: 'w', t: 'r', at: 'b1' },
      { id: 'n', c: 'w', t: 'n', at: 'c1' },
      { id: 'p', c: 'b', t: 'p', at: 'b4' },
    ],
    marks: [
      { at: 'a2', kind: 'rift' },
      { at: 'b2', kind: 'rift' },
      { at: 'c2', kind: 'rift' },
      { at: 'd2', kind: 'rift' },
    ],
    arrows: [
      { from: 'b1', to: 'b4', tone: 'red', blocked: true },
      { from: 'c1', to: 'd3', tone: 'gold', n: 1 },
    ],
    steps: [{ shake: 'r' }, { moves: [['n', 'd3']], hold: 1300 }],
    caption: 'La Faille coupe le plateau : aucune pièce ne la traverse, sauf le cavalier qui saute.',
  },
  tide: {
    cols: 4,
    rows: 4,
    tint: 'tide',
    pieces: [
      { id: 'w1', c: 'w', t: 'p', at: 'a2' },
      { id: 'w2', c: 'w', t: 'p', at: 'c2' },
      { id: 'b1', c: 'b', t: 'p', at: 'b3' },
      { id: 'b2', c: 'b', t: 'p', at: 'd3' },
    ],
    arrows: [
      { from: 'a2', to: 'a3', tone: 'cyan' },
      { from: 'c2', to: 'c3', tone: 'cyan' },
      { from: 'b3', to: 'b2', tone: 'cyan' },
      { from: 'd3', to: 'd2', tone: 'cyan' },
    ],
    steps: [
      {
        moves: [
          ['w1', 'a3'],
          ['w2', 'c3'],
          ['b1', 'b2'],
          ['b2', 'd2'],
        ],
        hold: 1500,
      },
    ],
    caption: 'La carte remplace votre coup : tous les pions des deux camps avancent d’une case.',
  },
  hourglass: {
    cols: 4,
    rows: 2,
    clocks: true,
    pieces: [],
    arrows: [],
    steps: [{ hold: 2600 }],
    caption: 'Les deux pendules s’écoulent deux fois plus vite, et les coups ne rapportent plus d’incrément.',
  },
};

/** Colonne et rangée (0 en bas) d'une case de scène (« b3 »). */
export function sceneXY(at: string): { x: number; y: number } {
  return { x: at.charCodeAt(0) - 97, y: Number(at.slice(1)) - 1 };
}

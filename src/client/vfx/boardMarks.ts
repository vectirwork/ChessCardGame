// Marques d'un effet actif sur l'échiquier (Board) : la classe qu'il pose, et sur quoi. Record exhaustif : une carte
// ajoutée à CardId ne compile pas sans sa ligne (null : rien sur l'échiquier ; un Climat teint tout l'échiquier par la
// classe clim-<carte> de board.css). Aucun import à l'exécution : lu par Board.tsx, dont il suit le morceau.
// Séparé de CARD_FX (cardFx.ts, morceau des effets, chargé à la demande) pour ne rien ajouter à l'échiquier de l'accueil.
import type { CardId } from '../../shared/cards';

/** Classe posée sur des cases (board.css, .sq.<classe>). */
export type SquareMark = 'iced' | 'rift';
/** Classe posée sur des pièces (board.css, .piece.<classe>). */
export type PieceMark = 'frozen' | 'shielded' | 'leaping' | 'phasing' | 'weighted';

/**
 * Où l'effet se voit :
 * - `square` : sa case (Effect.square) ; `squares` : ses cases (Effect.squares) ;
 * - `piece` : sa pièce (Effect.pieceId) ;
 * - `sliders` : les pièces à longue portée (fous, tours, dames) du camp dont il décompte les coups (Effect.countsOn).
 */
export type BoardMark =
  | { on: 'square' | 'squares'; cls: SquareMark }
  | { on: 'piece' | 'sliders'; cls: PieceMark };

/** Ordre des classes sur une case et sur une pièce (celui d'avant ce registre). */
export const SQUARE_MARKS: readonly SquareMark[] = ['iced', 'rift'];
export const PIECE_MARKS: readonly PieceMark[] = ['frozen', 'shielded', 'leaping', 'phasing', 'weighted'];

/** ← Une ligne par carte. */
export const BOARD_MARKS: Readonly<Record<CardId, BoardMark | null>> = {
  // Pouvoirs
  hourglass: null,
  truce: null,
  blood_moon: null,
  ice_age: null,
  blast: null,
  ice_wall: { on: 'square', cls: 'iced' },
  rift: { on: 'squares', cls: 'rift' },
  tide: null,
  // Duel
  time_warp: null,
  gravity: { on: 'sliders', cls: 'weighted' },
  freeze: { on: 'piece', cls: 'frozen' },
  shield: { on: 'piece', cls: 'shielded' },
  swap: null,
  rewind: null,
  revive: null,
  knight_leap: { on: 'piece', cls: 'leaping' },
  lightning: null,
  phase: { on: 'piece', cls: 'phasing' },
};

// Problèmes : positions écrites à la main (FEN et solution), vérifiées par le moteur (test/puzzles.test.ts).
// Une étape de solution est un coup UCI (« e2e4 », « e7e8q ») ou une carte (« @ice_wall:f3 », « @truce ») ;
// plusieurs réponses acceptées se séparent par « | ». Le camp au trait du FEN est celui qui résout ;
// les étapes de l'adversaire sont jouées automatiquement.
// Problèmes à cartes : les huit pouvoirs (catalogue « Pouvoirs »), mains visibles des deux camps. Un problème peut
// commencer avec un pouvoir déjà en jeu (`effects` : une carte jouée avant la position).

import { Color, PieceType, rankOf, sqIndex } from './chess';
import { CARDS, CardId, Catalog, isCardId } from './cards';
import { Effect, GameState, cloneState, createGameFromFen, playCard, playMove, positionKey } from './game';

export type PuzzleTheme =
  | 'mat1' | 'mat2' | 'mat3' | 'fourchette' | 'clouage' | 'enfilade' | 'deviation' | 'decouverte' | 'finale' | 'cartes';

export const THEME_LABEL: Record<PuzzleTheme, string> = {
  mat1: 'Mat en 1',
  mat2: 'Mat en 2',
  mat3: 'Mat en 3',
  fourchette: 'Fourchette',
  clouage: 'Clouage',
  enfilade: 'Enfilade',
  deviation: 'Déviation',
  decouverte: 'Attaque à la découverte',
  finale: 'Mat élémentaire',
  cartes: 'Cartes',
};

export interface Puzzle {
  id: string;
  title: string;
  themes: PuzzleTheme[];
  /** 1 : facile, 2 : moyen, 3 : difficile. */
  level: 1 | 2 | 3;
  fen: string;
  solution: string[];
  /** Mat annoncé en N coups du camp qui résout. */
  mate?: number;
  /** Objectif affiché, quand il ne se déduit pas du thème. */
  goal?: string;
  hint: string;
  /** Ce qu'il faut retenir, affiché une fois le problème résolu. */
  moral: string;
  /** Mains de cartes (problèmes à cartes, catalogue Pouvoirs), visibles des deux joueurs. */
  hands?: Partial<Record<Color, CardId[]>>;
  /** Pouvoirs déjà en jeu au début du problème (la carte du lanceur est marquée comme jouée). */
  effects?: EffectSpec[];
}

/** Pouvoir déjà en jeu au début d'un problème ou d'une étape de leçon : une carte jouée avant la position. */
export interface EffectSpec {
  card: CardId;
  /** Camp qui l'a lancée. */
  by: Color;
  /** Coups restants, des deux camps (par défaut, la durée de la carte ; sans objet pour un Mur, permanent). */
  remaining?: number;
  /** Présage pas encore arrivé : coups avant son arrivée (1 : il arrive après le prochain coup). */
  pending?: 1 | 2;
  /** Mur de glace : sa case. Faille : une case de sa rangée (4e ou 5e). */
  square?: string;
}

/**
 * Met en jeu des pouvoirs déjà lancés (catalogue Pouvoirs : effets des deux camps). La carte correspondante,
 * si elle est dans la main du lanceur, y est marquée comme jouée.
 */
export function withEffects(s: GameState, specs: EffectSpec[]): GameState {
  if (!specs.length) return s;
  const n = cloneState(s);
  for (const sp of specs) {
    const def = CARDS[sp.card];
    const permanent = !!def.permanent;
    const total = permanent ? 0 : def.coups ?? 1;
    const e: Effect = {
      id: n.nextEffectId++, card: sp.card, caster: sp.by, countsOn: sp.by,
      remaining: permanent ? 0 : sp.remaining ?? total, total, skin: 'skin:arcane', global: true,
    };
    if (permanent) e.permanent = true;
    if (sp.pending) {
      e.pending = true;
      e.delay = sp.pending;
    }
    if (sp.square) {
      const q = sqIndex(sp.square);
      if (sp.card === 'rift') {
        e.squares = [];
        for (let f = 0; f < 8; f++) if (!n.pos.board[rankOf(q) * 8 + f]) e.squares.push(rankOf(q) * 8 + f);
      } else e.square = q;
    }
    n.effects.push(e);
    const h = n.hands[sp.by].find(x => x.card === sp.card && !x.used);
    if (h) h.used = true;
  }
  n.keys = [positionKey(n)];
  return n;
}

export const PUZZLES: Puzzle[] = [
  // ------------------------------------------------------------------------------------------
  // Mats en 1
  {
    id: 'couloir', title: 'Le mat du couloir', themes: ['mat1'], level: 1, mate: 1,
    fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', solution: ['d1d8'],
    hint: 'Les pions noirs enferment leur propre roi sur la dernière rangée.',
    moral: 'Un roi sans case de fuite derrière ses pions est à la merci d’une tour sur la 8e rangée.',
  },
  {
    id: 'etouffe', title: 'Le mat à l’étouffée', themes: ['mat1'], level: 1, mate: 1,
    fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', solution: ['g5f7'],
    hint: 'Le roi noir est entouré de ses propres pièces. Quelle pièce saute par-dessus ?',
    moral: 'Seul le cavalier peut mater un roi étouffé par ses propres pièces.',
  },
  {
    id: 'anastasie', title: 'Le mat d’Anastasie', themes: ['mat1'], level: 1, mate: 1,
    fen: '5r2/4Nppk/8/8/8/3R4/8/6K1 w - - 0 1', solution: ['d3h3'],
    hint: 'Le cavalier e7 contrôle g8 et g6. Il reste la colonne h.',
    moral: 'Cavalier en e7, tour sur la colonne h : le mat d’Anastasie.',
  },
  {
    id: 'berger', title: 'Le coup du berger', themes: ['mat1'], level: 1, mate: 1,
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', solution: ['h5f7'],
    hint: 'Le point f7 n’est défendu que par le roi, et le fou c4 le vise déjà.',
    moral: 'En début de partie, f7 (f2 pour les Blancs) est le point faible : ne le laissez pas sans défense.',
  },
  {
    id: 'epaulettes', title: 'Le mat des épaulettes', themes: ['mat1'], level: 1, mate: 1,
    fen: '3rkr2/pp4pp/8/8/8/7Q/PP4PP/6K1 w - - 0 1', solution: ['h3e6'],
    hint: 'Les deux tours noires bloquent les cases voisines de leur roi.',
    moral: 'Des pièces de part et d’autre du roi, comme des épaulettes, lui retirent ses cases de fuite.',
  },
  {
    id: 'arabe', title: 'Le mat arabe', themes: ['mat1'], level: 1, mate: 1,
    fen: '7k/1R6/5N2/8/8/8/8/6K1 w - - 0 1', solution: ['b7h7'],
    hint: 'Le cavalier f6 protège h7 et contrôle g8.',
    moral: 'Tour et cavalier coopèrent dans le coin : le plus ancien mat connu.',
  },
  {
    id: 'mat-du-sot', title: 'Le mat du sot', themes: ['mat1'], level: 1, mate: 1,
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2', solution: ['d8h4'],
    hint: 'Les Blancs ont ouvert la diagonale de leur roi.',
    moral: 'Le mat le plus rapide possible : deux coups de pion de trop sur l’aile du roi.',
  },
  {
    id: 'boden', title: 'Le mat de Boden', themes: ['mat1'], level: 2, mate: 1,
    fen: '2kr3r/p2n1ppp/2p5/8/5B2/8/PPP1BPPP/6K1 w - - 0 1', solution: ['e2a6'],
    hint: 'Le fou f4 tient déjà b8 et c7. Il manque une diagonale.',
    moral: 'Deux fous qui se croisent devant un grand roque : le mat de Boden.',
  },
  {
    id: 'couloir-noir', title: 'Le couloir, côté noir', themes: ['mat1'], level: 1, mate: 1,
    fen: '1r4k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', solution: ['b8b1'],
    hint: 'Le roi blanc a le même défaut que son adversaire.',
    moral: 'Un petit coup de pion (h3 ou g3) en temps utile évite bien des malheurs.',
  },
  {
    id: 'escalier', title: 'L’escalier', themes: ['mat1', 'finale'], level: 1, mate: 1,
    fen: '7k/R7/8/8/8/8/8/1R4K1 w - - 0 1', solution: ['b1b8'],
    hint: 'Une tour tient déjà la 7e rangée.',
    moral: 'Deux tours se relaient, une rangée chacune, comme les marches d’un escalier.',
  },
  {
    id: 'baiser', title: 'Le baiser de la mort', themes: ['mat1', 'finale'], level: 1, mate: 1,
    fen: '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', solution: ['g1g7'],
    hint: 'La dame peut venir tout contre le roi si elle est protégée.',
    moral: 'Dame collée au roi adverse et protégée par le sien : c’est le baiser de la mort.',
  },
  {
    id: 'greco', title: 'Dame et cavalier sur h7', themes: ['mat1'], level: 1, mate: 1,
    fen: '5rk1/pp3pp1/8/6N1/8/3Q4/5PPP/6K1 w - - 0 1', solution: ['d3h7'],
    hint: 'Le cavalier g5 vise h7.',
    moral: 'La case h7 (h2 chez les Blancs) devient fatale quand dame et cavalier la visent ensemble.',
  },

  // ------------------------------------------------------------------------------------------
  // Mats en 2
  {
    id: 'legs-de-philidor', title: 'Le legs de Philidor', themes: ['mat2', 'deviation'], level: 2, mate: 2,
    fen: '5r1k/pp4pp/7N/3Q4/8/8/6PP/6K1 w - - 0 1', solution: ['d5g8', 'f8g8', 'h6f7'],
    hint: 'Offrez la dame sur une case que le roi ne peut pas reprendre.',
    moral: 'Le sacrifice attire la tour en g8 : le roi s’étouffe lui-même.',
  },
  {
    id: 'anastasie-2', title: 'Anastasie, avec sacrifice', themes: ['mat2', 'deviation'], level: 2, mate: 2,
    fen: '5r1k/4Nppp/8/7Q/8/3R4/6PP/6K1 w - - 0 1', solution: ['h5h7', 'h8h7', 'd3h3'],
    hint: 'Le pion h7 est le seul obstacle sur la colonne h.',
    moral: 'Sacrifier pour ouvrir une colonne : le roi pris dans la nasse du cavalier e7.',
  },
  {
    id: 'couloir-2', title: 'La dame qui ouvre le couloir', themes: ['mat2', 'deviation'], level: 2, mate: 2,
    fen: 'r2q2k1/5ppp/8/8/8/3Q4/5PPP/3R2K1 w - - 0 1', solution: ['d3d8', 'a8d8', 'd1d8'],
    hint: 'La dame noire est la seule à garder la 8e rangée.',
    moral: 'Échanger le défenseur de la dernière rangée, puis frapper.',
  },
  {
    id: 'legal', title: 'Le piège de Légal', themes: ['mat2'], level: 2, mate: 2,
    fen: 'rn1qkbnr/ppp2p1p/3p2p1/4N3/2B1P3/2N5/PPPP1PPP/R1BbK2R w KQkq - 0 6', solution: ['c4f7', 'e8e7', 'c3d5'],
    hint: 'Les Noirs viennent de prendre la dame. Le roi noir n’a presque plus de cases.',
    moral: 'Le développement et l’attaque valent plus que la dame : trois pièces mineures suffisent.',
  },
  {
    id: 'boden-2', title: 'Boden, la partie', themes: ['mat2'], level: 2, mate: 2,
    fen: '2kr3r/pp1n1ppp/2n5/8/5B2/2Q5/PPP1BPPP/6K1 w - - 0 1', solution: ['c3c6', 'b7c6', 'e2a6'],
    hint: 'Il faut ouvrir la diagonale a6-c8.',
    moral: 'Le sacrifice de dame en c6 arrache le pion b7 : les deux fous font le reste.',
  },
  {
    id: 'opera', title: 'La partie de l’Opéra', themes: ['mat2'], level: 2, mate: 2,
    fen: '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16', solution: ['b3b8', 'd7b8', 'd1d8'],
    hint: 'Morphy, Paris 1858 : la tour d1 attend que la colonne s’ouvre.',
    moral: 'Le cavalier d7 ne peut pas tout garder : attiré en b8, il libère d8.',
  },
  {
    id: 'tour-tempo', title: 'Tour et roi : le coup d’attente', themes: ['mat2', 'finale'], level: 2, mate: 2,
    fen: '2k5/8/3K4/8/8/5R2/8/8 w - - 0 1', solution: ['f3b3', 'c8d8', 'b3b8'],
    hint: 'Les rois sont presque face à face. Coupez une colonne sans donner échec.',
    moral: 'Un coup d’attente oblige le roi noir à se placer face au roi blanc : la tour mate.',
  },
  {
    id: 'tour-coin', title: 'Tour et roi dans le coin', themes: ['mat2', 'finale'], level: 2, mate: 2,
    fen: '6k1/8/7K/8/7R/8/8/8 w - - 0 1', solution: ['h4f4', 'g8h8', 'f4f8'],
    hint: 'Le roi noir n’a que deux cases. Prenez-lui la colonne f.',
    moral: 'Réduire d’abord l’espace du roi, mater ensuite.',
  },
  {
    id: 'dame-approche', title: 'Dame et roi : le roi s’approche', themes: ['mat2', 'finale'], level: 2, mate: 2,
    fen: '2k5/Q7/5K2/8/8/8/8/8 w - - 0 1', solution: ['f6e6', 'c8d8', 'a7d7'],
    hint: 'La dame a fait sa part. Il manque le soutien du roi.',
    moral: 'La dame seule ne mate pas : son roi doit venir l’épauler.',
  },

  // ------------------------------------------------------------------------------------------
  // Mats en 3
  {
    id: 'philidor-3', title: 'L’étouffée de Philidor', themes: ['mat3', 'deviation'], level: 3, mate: 3,
    fen: '4r1k1/pp3Npp/8/8/2Q5/8/PP4PP/6K1 w - - 0 1', solution: ['f7h6', 'g8h8', 'c4g8', 'e8g8', 'h6f7'],
    hint: 'Un échec double pour commencer : le cavalier se dégage en démasquant la dame.',
    moral: 'Échec double, sacrifice de dame, mat à l’étouffée : la combinaison la plus célèbre.',
  },
  {
    id: 'anastasie-3', title: 'Anastasie en trois temps', themes: ['mat3'], level: 3, mate: 3,
    fen: '5rk1/5ppp/8/3N3Q/8/3R4/6PP/6K1 w - - 0 1', solution: ['d5e7', 'g8h8', 'h5h7', 'h8h7', 'd3h3'],
    hint: 'Placez d’abord le cavalier qui fermera la nasse, avec échec.',
    moral: 'L’ordre des coups compte : le cavalier d’abord, le sacrifice ensuite.',
  },
  {
    id: 'tour-3', title: 'Tour et roi, en trois coups', themes: ['mat3', 'finale'], level: 3, mate: 3,
    fen: '6k1/8/8/4K3/8/1R6/8/8 w - - 0 1', solution: ['e5f6', 'g8h8', 'f6g6', 'h8g8', 'b3b8'],
    hint: 'La tour est bien placée. Le roi blanc doit faire face au roi noir.',
    moral: 'Opposition des rois, puis échec de la tour sur la dernière rangée.',
  },
  {
    id: 'dame-3', title: 'Dame et roi, en trois coups', themes: ['mat3', 'finale'], level: 3, mate: 3,
    fen: '4k3/8/1Q6/3K4/8/8/8/8 w - - 0 1', solution: ['d5e6', 'e8f8', 'b6g1', 'f8e8', 'g1g8'],
    hint: 'Avancez le roi. La dame trouvera ensuite une colonne libre.',
    moral: 'Rapprocher le roi sans laisser de pat : la technique du mat avec la dame.',
  },

  // ------------------------------------------------------------------------------------------
  // Fourchettes
  {
    id: 'fourchette-c7', title: 'Le cavalier en c7', themes: ['fourchette'], level: 1,
    fen: 'r3k3/pp3ppp/8/1N6/8/8/PP3PPP/4K3 w - - 0 1', solution: ['b5c7', 'e8d7', 'c7a8'],
    hint: 'Une case attaque à la fois le roi et la tour.',
    moral: 'Un échec qui attaque une autre pièce : l’adversaire doit d’abord sauver son roi.',
  },
  {
    id: 'fourchette-e7', title: 'Échec et dame', themes: ['fourchette'], level: 1,
    fen: '2q3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1', solution: ['d5e7', 'g8h8', 'e7c8'],
    hint: 'Le cavalier peut attaquer g8 et c8 depuis la même case.',
    moral: 'Cherchez toujours les cases d’où le cavalier touche roi et dame à la fois.',
  },
  {
    id: 'fourchette-pion', title: 'La fourchette du pion', themes: ['fourchette'], level: 1,
    fen: '4k3/pp3ppp/2n1b3/8/3PP3/5N2/PP3PPP/4KB2 w - - 0 1', solution: ['d4d5', 'e8d7', 'd5e6'],
    hint: 'Le plus petit soldat attaque deux pièces à la fois.',
    moral: 'Un pion qui attaque deux pièces gagne presque toujours l’une d’elles.',
  },
  {
    id: 'fourchette-dame', title: 'La dame au centre', themes: ['fourchette'], level: 1,
    fen: '1r2k3/p4ppp/8/8/8/2Q5/PP3PPP/6K1 w - - 0 1', solution: ['c3e5', 'e8d7', 'e5b8'],
    hint: 'Échec sur la colonne e, et une diagonale vers b8.',
    moral: 'La dame attaque dans huit directions : un échec suffit souvent à ramasser une pièce.',
  },
  {
    id: 'fourchette-f6', title: 'Le cavalier en f6', themes: ['fourchette'], level: 1,
    fen: '6k1/3q1p1p/6p1/8/4N3/8/5PPP/6K1 w - - 0 1', solution: ['e4f6', 'g8f8', 'f6d7'],
    hint: 'Depuis f6, le cavalier voit g8 et d7.',
    moral: 'Sans pion en g7 pour la garder, la case f6 est un avant-poste idéal.',
  },
  {
    id: 'fourchette-noire', title: 'Le coup de la fourchette', themes: ['fourchette'], level: 2,
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1N3/5N2/PPPP1PPP/R1BQK2R b KQkq - 0 5', solution: ['d7d5', 'c4b5', 'd5e4'],
    hint: 'Les Noirs ont donné un cavalier contre un pion. Un pion peut le rendre.',
    moral: 'Un piège classique de l’ouverture italienne : la fourchette de pion regagne la pièce.',
  },

  // ------------------------------------------------------------------------------------------
  // Clouages
  {
    id: 'clouage-b5', title: 'La dame clouée', themes: ['clouage'], level: 1,
    fen: '4k3/pp1q1ppp/8/8/8/2N5/PP3PPP/5BK1 w - - 0 1', solution: ['f1b5', 'a7a6', 'b5d7'],
    hint: 'La dame noire et son roi sont sur la même diagonale.',
    moral: 'Une pièce clouée au roi ne peut plus quitter la ligne : le cavalier c3 protège le fou.',
  },
  {
    id: 'clouage-f4', title: 'Le pion contre la pièce clouée', themes: ['clouage'], level: 1,
    fen: '4k3/pp4pp/3p4/4n3/8/8/PP3PPP/4R1K1 w - - 0 1', solution: ['f2f4', 'e8d7', 'f4e5'],
    hint: 'Le cavalier e5 ne peut pas bouger. Attaquez-le.',
    moral: 'Attaquez une pièce clouée avec moins fort qu’elle, de préférence un pion.',
  },
  {
    id: 'clouage-d4', title: 'Sur la grande diagonale', themes: ['clouage'], level: 2,
    fen: '7k/pp3p1p/1B3q2/8/8/2P5/PP3PPP/R5K1 w - - 0 1', solution: ['b6d4', 'h8g7', 'd4f6'],
    hint: 'Le roi noir est en h8, sur la même diagonale que sa dame.',
    moral: 'Un fou protégé qui cloue la dame au roi la gagne contre lui-même.',
  },
  {
    id: 'clouage-e1', title: 'La colonne ouverte', themes: ['clouage'], level: 1,
    fen: '4k3/pp3ppp/4q3/8/8/8/PP1K1PPP/R7 w - - 0 1', solution: ['a1e1', 'e6e1', 'd2e1'],
    hint: 'Dame et roi noirs sur la même colonne, et une tour libre.',
    moral: 'Clouer la dame au roi : elle ne peut que se sacrifier.',
  },

  // ------------------------------------------------------------------------------------------
  // Enfilades
  {
    id: 'enfilade-tour', title: 'L’enfilade sur la rangée', themes: ['enfilade'], level: 1,
    fen: '8/8/8/8/4k2r/8/6PP/R6K w - - 0 1', solution: ['a1a4', 'e4f5', 'a4h4'],
    hint: 'Roi et tour noirs sont alignés sur la 4e rangée.',
    moral: 'L’enfilade est l’inverse du clouage : la pièce de devant doit s’écarter, celle de derrière tombe.',
  },
  {
    id: 'enfilade-fou', title: 'Le roi devant la dame', themes: ['enfilade'], level: 1,
    fen: '6q1/pp6/4k3/8/8/8/5PPP/3B3K w - - 0 1', solution: ['d1b3', 'e6f6', 'b3g8'],
    hint: 'Roi e6 et dame g8 sur la même diagonale.',
    moral: 'Un échec en enfilade gagne la pièce cachée derrière le roi.',
  },
  {
    id: 'enfilade-colonne', title: 'Échec sur la colonne', themes: ['enfilade'], level: 1,
    fen: '4q3/pp6/8/4k3/8/8/6PP/R6K w - - 0 1', solution: ['a1e1', 'e5d6', 'e1e8'],
    hint: 'La dame noire se cache derrière son roi.',
    moral: 'Quand roi et dame sont alignés, cherchez l’échec qui les traverse.',
  },

  // ------------------------------------------------------------------------------------------
  // Déviation, surcharge, découverte
  {
    id: 'surcharge', title: 'La tour surchargée', themes: ['deviation'], level: 2,
    fen: '3r2k1/5ppp/8/3q4/8/8/5PPP/3QR1K1 w - - 0 1', solution: ['d1d5'],
    goal: 'Les Blancs jouent et gagnent la dame.',
    hint: 'La tour d8 garde la dame… et la dernière rangée.',
    moral: 'Si la tour reprend en d5, Te8 est mat : un défenseur ne peut pas garder deux choses.',
  },
  {
    id: 'decouverte-d6', title: 'Échec double', themes: ['decouverte'], level: 1,
    fen: '4k3/pq4pp/8/8/4N3/8/PP3PPP/4R1K1 w - - 0 1', solution: ['e4d6', 'e8d7', 'd6b7'],
    hint: 'Le cavalier masque la tour e1. Où peut-il aller en attaquant la dame ?',
    moral: 'Une pièce qui se dégage avec un échec découvert peut attaquer ce qu’elle veut.',
  },
  {
    id: 'decouverte-h7', title: 'Le fou se démasque', themes: ['decouverte'], level: 2,
    fen: '6k1/4qppp/8/8/4B3/8/5PPP/4R1K1 w - - 0 1', solution: ['e4h7', 'g8f8', 'e1e7'],
    hint: 'La tour e1 vise la dame à travers son propre fou.',
    moral: 'Le fou part avec échec : la dame, démasquée, tombe au coup suivant.',
  },

  // ------------------------------------------------------------------------------------------
  // Cartes : les huit pouvoirs (catalogue « Pouvoirs »), mains visibles des deux côtés
  {
    id: 'carte-mur-sauve', title: 'Le Mur qui sauve', themes: ['cartes', 'mat1'], level: 1, mate: 1,
    fen: '6k1/5ppp/4p3/8/4q3/8/7P/3R2BK w - - 0 1', solution: ['@ice_wall:f3', 'd1d8'],
    hands: { w: ['ice_wall', 'rift', 'tide'], b: ['ice_wall', 'truce', 'ice_age'] },
    goal: 'Les Blancs sont en échec, sans aucun coup. Une carte, puis le mat.',
    hint: 'Un Mur se pose entre la 3e et la 6e rangée : une seule case de la diagonale convient.',
    moral: 'Sans coup légal, on doit jouer une carte qui en redonne un. Et le Mur noir n’y peut rien : on ne mure pas la 8e rangée.',
  },
  {
    id: 'carte-mur-enferme', title: 'Le Mur qui enferme', themes: ['cartes', 'mat1'], level: 2, mate: 1,
    fen: '6K1/5R2/8/8/1p6/k7/5R2/8 w - - 0 1', solution: ['@ice_wall:b3', 'f7a7'],
    hands: { w: ['ice_wall', 'rift', 'truce'] },
    goal: 'Les Blancs jouent une carte, puis matent.',
    hint: 'La tour f2 tient déjà la 2e rangée. Il ne manque qu’une case à fermer.',
    moral: 'Un Mur de glace ferme une case de fuite jusqu’à la fin de la partie : le roi n’y passera plus.',
  },
  {
    id: 'carte-faille', title: 'La Faille qui coupe', themes: ['cartes', 'mat1'], level: 2, mate: 1,
    fen: '6k1/R4ppp/8/8/4b3/8/5PPP/6K1 w - - 0 1', solution: ['@rift:d5', 'a7a8'],
    hands: { w: ['rift', 'truce', 'tide'] },
    goal: 'Les Blancs jouent une carte, puis matent.',
    hint: 'Le fou e4 garde a8 par la grande diagonale. Où la couper ?',
    moral: 'La Faille ouvre un gouffre sur toute une rangée : les lignes qui la traversent sont coupées, pour les deux camps.',
  },
  {
    id: 'carte-ere-glaciaire', title: 'Le pion gelé', themes: ['cartes', 'mat2'], level: 3, mate: 2,
    fen: '6k1/pp3pp1/7p/8/8/8/1r2R1PP/4RQK1 w - - 0 1', solution: ['@ice_age', 'e2e8', 'g8h7', 'f1d3'],
    hands: { w: ['ice_age', 'truce', 'rift'] },
    goal: 'Les Blancs jouent une carte et matent en 2.',
    hint: 'Après Te8+ Rh7, le roi noir compte sur un seul défenseur : le pion g7.',
    moral: 'Annoncée, l’Ère glaciaire arrive au début de votre tour suivant : le pion g7 ne peut plus s’interposer en g6.',
  },
  {
    id: 'carte-maree', title: 'La marée descend', themes: ['cartes', 'mat2'], level: 2, mate: 2,
    fen: '6k1/R4pp1/7p/3R4/8/6P1/3B1P1P/7K w - - 0 1', solution: ['@tide', 'g8h8', 'd5d8'],
    hands: { w: ['tide', 'ice_wall', 'truce'] },
    goal: 'Les Blancs matent en 2 : une carte tient lieu du premier coup.',
    hint: 'Les pions f7 et g7 bouchent la 7e rangée. Si tous les pions avançaient d’une case…',
    moral: 'La Grande Marée remplace votre coup et pousse les pions des deux camps : la 7e rangée s’est vidée, la tour a7 la tient.',
  },
  {
    id: 'carte-lune', title: 'La Lune retournée', themes: ['cartes', 'mat2', 'deviation'], level: 2, mate: 2,
    fen: '3r2k1/p4ppp/8/3p4/8/1B6/5PPP/R3R1K1 w - - 0 1', solution: ['b3d5', 'd8d5', 'e1e8'],
    hands: { b: ['blood_moon'] },
    effects: [{ card: 'blood_moon', by: 'b', remaining: 2 }],
    goal: 'La Lune de sang des Noirs est levée : qui peut prendre doit prendre. Les Blancs matent en 2.',
    hint: 'Vous aussi devez prendre. Choisissez la prise qui oblige la tour d8 à quitter la dernière rangée.',
    moral: 'Un pouvoir touche les deux camps : la Lune lancée par les Noirs force leur tour à prendre, et la 8e rangée tombe.',
  },
  {
    id: 'carte-deflagration', title: 'Une prise, trois pièces', themes: ['cartes'], level: 2,
    fen: '3qr1k1/pp1n1ppp/2p5/8/8/1QN5/P4PPP/3R2K1 w - - 0 1', solution: ['d1d7'],
    hands: { w: ['blast'] },
    effects: [{ card: 'blast', by: 'w', remaining: 4 }],
    goal: 'Votre Déflagration vient d’arriver. Les Blancs jouent et gagnent du matériel.',
    hint: 'Toute prise explose : la pièce qui prend saute aussi, avec ses voisines. Cherchez la case entourée de pièces noires.',
    moral: 'Sous la Déflagration, Dxb7 ferait sauter votre dame. Txd7 ne coûte qu’une tour : le cavalier, la dame et la tour noires partent avec elle.',
  },
  {
    id: 'carte-main-visible', title: 'Lisez sa main', themes: ['cartes', 'mat1'], level: 1, mate: 1,
    fen: '7k/5Q1p/8/8/8/8/PP3PPP/4B1K1 w - - 0 1', solution: ['f7f8'],
    hands: { b: ['ice_wall'] },
    goal: 'Les Noirs gardent un Mur de glace en main. Les Blancs matent en 1 malgré lui.',
    hint: 'Fc3+ semble mater. Mais où les Noirs poseraient-ils leur Mur ?',
    moral: 'Les mains sont visibles : un échec à distance qui traverse les rangées 3 à 6 se pare d’un Mur. Sur la 8e rangée, aucun Mur ne peut se poser.',
  },
];

// ---------------------------------------------------------------------------------------------
// Étapes

export type PuzzleAction =
  | { kind: 'move'; from: number; to: number; promo?: PieceType }
  | { kind: 'card'; card: CardId; targets: number[] };

export function parseAction(s: string): PuzzleAction | null {
  const t = s.trim();
  const card = /^@([a-z_]+)(?::([a-h][1-8](?:,[a-h][1-8])*))?$/.exec(t);
  if (card) {
    const id = card[1];
    if (!isCardId(id)) return null;
    return { kind: 'card', card: id, targets: card[2] ? card[2].split(',').map(sqIndex) : [] };
  }
  const mv = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(t);
  if (mv) return { kind: 'move', from: sqIndex(mv[1]), to: sqIndex(mv[2]), promo: mv[3] as PieceType | undefined };
  return null;
}

/** Réponses acceptées pour une étape. */
export function stepOptions(step: string): PuzzleAction[] {
  return step.split('|').map(parseAction).filter((a): a is PuzzleAction => !!a);
}

export function sameAction(a: PuzzleAction, b: PuzzleAction): boolean {
  if (a.kind === 'move' && b.kind === 'move') {
    return a.from === b.from && a.to === b.to && (a.promo ?? 'q') === (b.promo ?? 'q');
  }
  if (a.kind === 'card' && b.kind === 'card') {
    // Faille : la cible désigne une rangée ; n'importe quelle case de la rangée convient.
    const same = a.card === 'rift' ? (x: number, y: number) => rankOf(x) === rankOf(y) : (x: number, y: number) => x === y;
    return a.card === b.card && a.targets.length === b.targets.length && a.targets.every((t, i) => same(t, b.targets[i]));
  }
  return false;
}

/** Position de départ : catalogue Pouvoirs pour un problème à cartes, sans cartes sinon. */
export function puzzleStart(p: Puzzle): GameState {
  const catalog: Catalog = p.hands || p.effects ? 'climats' : 'aucune';
  const s = createGameFromFen(p.fen, { w: p.hands?.w ?? [], b: p.hands?.b ?? [] }, false, catalog);
  return withEffects(s, p.effects ?? []);
}

/** Joue une action (coup ou carte) pour le camp au trait. */
export function applyAction(s: GameState, a: PuzzleAction): GameState | null {
  if (a.kind === 'move') {
    const r = playMove(s, a.from, a.to, a.promo);
    return r.ok ? r.state : null;
  }
  const c = s.pos.turn;
  const index = s.hands[c].findIndex(h => h.card === a.card && !h.used);
  if (index < 0) return null;
  const r = playCard(s, c, index, a.targets, 'skin:arcane');
  return r.ok ? r.state : null;
}

/** Camp qui résout le problème. */
export function solverOf(p: Puzzle): Color {
  return p.fen.split(/\s+/)[1] === 'b' ? 'b' : 'w';
}

export function goalOf(p: Puzzle): string {
  if (p.goal) return p.goal;
  const side = solverOf(p) === 'w' ? 'Les Blancs' : 'Les Noirs';
  if (p.mate) return `${side} jouent et matent en ${p.mate}.`;
  return `${side} jouent et gagnent du matériel.`;
}

export function puzzleById(id: string | undefined): Puzzle | undefined {
  return PUZZLES.find(p => p.id === id);
}

/** Numéro du jour (calendrier local), stable quel que soit le fuseau ou l'heure d'été. */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** Problème du jour : déterministe selon la date, il parcourt toute la liste avant de se répéter. */
export function dailyPuzzle(d: Date = new Date()): Puzzle {
  const n = PUZZLES.length;
  const step = coprimeStep(n);
  const i = (((dayNumber(d) * step) % n) + n) % n;
  return PUZZLES[i];
}

function coprimeStep(n: number): number {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  for (let k = 7; k < 7 + n; k++) if (gcd(k, n) === 1) return k;
  return 1;
}

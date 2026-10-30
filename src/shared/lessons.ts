// Leçons interactives : une suite d'étapes sur un vrai échiquier (consigne, coup attendu, réaction, indice).
// Les coups s'écrivent en UCI (« e2e4 »), les cartes « @ice_wall:e5 » ; « | » sépare les réponses acceptées
// et « * » accepte n'importe quel coup légal. Vérifié par test/lessons.test.ts.
// Les leçons de cartes suivent le jeu final (catalogue « Pouvoirs ») : huit pouvoirs qui touchent les deux camps,
// mains visibles des deux côtés.

import { Color, Move, PieceType, fileOf, inCheck, kingSquare, rankOf } from './chess';
import type { CardId, Catalog } from './cards';
import { GameState, createGameFromFen, legalMovesOf, modsFromEffects, playMove } from './game';
import { EffectSpec, withEffects } from './puzzles';

export type LessonGoal =
  /** Lecture : un bouton « Continuer ». */
  | { kind: 'info' }
  /** La pièce doit passer par toutes les étoiles ; l'adversaire ne joue pas. */
  | { kind: 'stars'; stars: string[] }
  /** Suite imposée ; les coups adverses sont joués automatiquement. `mate` : le dernier coup peut être n'importe quel mat. */
  | { kind: 'line'; line: string[]; mate?: boolean }
  /** N'importe quel coup qui mate. */
  | { kind: 'mate' }
  /** N'importe quel coup légal. */
  | { kind: 'any' }
  /** Mater un roi seul qui se défend, en `maxMoves` coups au plus. */
  | { kind: 'hunt'; maxMoves: number };

export type LessonPanel = 'catalogs' | 'families' | 'presage' | 'ritual';

export interface LessonStep {
  fen: string;
  /** Consigne. */
  text: string;
  goal: LessonGoal;
  /** Réaction une fois l'étape réussie. */
  success?: string;
  hint?: string;
  /** Cases mises en valeur. */
  marks?: string[];
  /** Flèches d'illustration (« e2e4 »). */
  arrows?: string[];
  /** Dernier coup joué, pour le contexte (prise en passant). */
  last?: string;
  /** Mains des deux camps (visibles : la main adverse s'affiche aussi). */
  hands?: Partial<Record<Color, CardId[]>>;
  /** Pouvoirs déjà en jeu au début de l'étape. */
  effects?: EffectSpec[];
  /** Catalogue (par défaut : Pouvoirs avec des cartes ou des effets, sans cartes sinon). */
  catalog?: Catalog;
  /** Encart dynamique sous la consigne. */
  panel?: LessonPanel;
}

export interface Lesson {
  id: string;
  title: string;
  group: string;
  summary: string;
  steps: LessonStep[];
}

export const LESSON_GROUPS = ['Les pièces', 'Coups spéciaux', 'Échec, mat et pat', 'Mats élémentaires', 'Les cartes'];

export const LESSONS: Lesson[] = [
  // ------------------------------------------------------------------------------------------
  // Les pièces
  {
    id: 'tour', title: 'La tour', group: 'Les pièces',
    summary: 'Tout droit, aussi loin qu’on veut.',
    steps: [
      {
        fen: '8/8/8/8/3R4/8/8/8 w - - 0 1', goal: { kind: 'info' },
        text: 'La tour se déplace en ligne droite, horizontalement ou verticalement, d’autant de cases qu’elle veut. Elle ne saute jamais par-dessus une pièce.',
        arrows: ['d4d8', 'd4d1', 'd4a4', 'd4h4'],
      },
      {
        fen: '8/8/8/8/8/8/8/R7 w - - 0 1', goal: { kind: 'stars', stars: ['a6', 'f6', 'f2', 'h2'] },
        text: 'Faites passer la tour par toutes les étoiles, dans l’ordre que vous voulez.',
        hint: 'Un seul virage par coup : montez d’abord sur la colonne a.',
        success: 'Quatre étoiles, quatre coups en ligne droite.',
      },
      {
        fen: '8/8/3p4/8/8/8/6p1/3R4 w - - 0 1', goal: { kind: 'stars', stars: ['d6', 'g2'] },
        text: 'La tour prend comme elle se déplace : elle s’arrête sur la case de la pièce adverse. Prenez les deux pions.',
        hint: 'Le pion d6 est sur la même colonne que la tour.',
        success: 'Une pièce prise quitte l’échiquier.',
      },
    ],
  },
  {
    id: 'fou', title: 'Le fou', group: 'Les pièces',
    summary: 'En diagonale, toujours sur la même couleur.',
    steps: [
      {
        fen: '8/8/8/8/3B4/8/8/8 w - - 0 1', goal: { kind: 'info' },
        text: 'Le fou se déplace en diagonale, aussi loin qu’il veut. Il reste toute la partie sur les cases de sa couleur.',
        arrows: ['d4h8', 'd4a7', 'd4a1', 'd4g1'],
      },
      {
        fen: '8/8/8/8/8/8/8/2B5 w - - 0 1', goal: { kind: 'stars', stars: ['a3', 'e7', 'h4', 'f2'] },
        text: 'Ramassez toutes les étoiles avec le fou.',
        hint: 'Toutes les étoiles sont sur des cases foncées, comme le fou.',
        success: 'Un fou ne change jamais de couleur de case.',
      },
      {
        fen: '4n3/8/8/1n6/8/8/8/5B2 w - - 0 1', goal: { kind: 'stars', stars: ['b5', 'e8'] },
        text: 'Prenez les deux cavaliers noirs.',
        success: 'Le fou est une pièce de longue portée : il frappe de loin.',
      },
    ],
  },
  {
    id: 'dame', title: 'La dame', group: 'Les pièces',
    summary: 'La tour et le fou réunis.',
    steps: [
      {
        fen: '8/8/8/8/3Q4/8/8/8 w - - 0 1', goal: { kind: 'info' },
        text: 'La dame combine la tour et le fou : en ligne droite ou en diagonale, aussi loin qu’elle veut. C’est la pièce la plus puissante.',
        arrows: ['d4d8', 'd4h8', 'd4h4', 'd4g1', 'd4d1', 'd4a1', 'd4a4', 'd4a7'],
      },
      {
        fen: '8/8/8/8/8/8/8/3Q4 w - - 0 1', goal: { kind: 'stars', stars: ['d7', 'a4', 'h4', 'e7'] },
        text: 'Ramassez toutes les étoiles avec la dame.',
        success: 'Huit directions : la dame va presque partout en un ou deux coups.',
      },
      {
        fen: '8/1r6/8/8/5b2/8/8/1Q6 w - - 0 1', goal: { kind: 'stars', stars: ['b7', 'f4'] },
        text: 'Prenez la tour et le fou.',
        success: 'Gardez votre dame à l’abri : elle vaut à peu près deux tours.',
      },
    ],
  },
  {
    id: 'roi', title: 'Le roi', group: 'Les pièces',
    summary: 'Une case dans toutes les directions, jamais en danger.',
    steps: [
      {
        fen: '8/8/8/8/3K4/8/8/8 w - - 0 1', goal: { kind: 'info' },
        text: 'Le roi se déplace d’une seule case, dans n’importe quelle direction. S’il est pris, la partie est perdue : c’est pourquoi il ne peut jamais se mettre en danger.',
        marks: ['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e4', 'e5'],
      },
      {
        fen: '8/8/8/8/8/8/8/4K3 w - - 0 1', goal: { kind: 'stars', stars: ['e3', 'c4', 'd6'] },
        text: 'Promenez le roi jusqu’aux étoiles, une case à la fois.',
        success: 'Lent mais précieux : en fin de partie, le roi devient une pièce d’attaque.',
      },
      {
        fen: '8/8/2b5/8/8/8/8/4K3 w - - 0 1', goal: { kind: 'stars', stars: ['e6'] },
        text: 'Le fou noir contrôle ses diagonales : votre roi ne peut pas s’y arrêter. Rejoignez l’étoile par un chemin sûr.',
        hint: 'Évitez e4, f3 et d5 : passez par f4 et f5.',
        success: 'Une case attaquée est interdite au roi, même si l’adversaire ne joue pas.',
      },
    ],
  },
  {
    id: 'cavalier', title: 'Le cavalier', group: 'Les pièces',
    summary: 'En L, et par-dessus tout le monde.',
    steps: [
      {
        fen: '8/8/8/8/3N4/8/8/8 w - - 0 1', goal: { kind: 'info' },
        text: 'Le cavalier se déplace en L : deux cases dans un sens, puis une sur le côté. C’est la seule pièce qui saute par-dessus les autres.',
        marks: ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'],
      },
      {
        fen: '8/8/8/8/8/8/8/1N6 w - - 0 1', goal: { kind: 'stars', stars: ['c3', 'd5', 'f6', 'h7'] },
        text: 'Ramassez les étoiles avec le cavalier.',
        success: 'Le cavalier change de couleur de case à chaque saut.',
      },
      {
        fen: '8/8/2p5/4p3/8/8/3PPPPP/6N1 w - - 0 1', goal: { kind: 'stars', stars: ['e5', 'c6'] },
        text: 'Vos pions entourent le cavalier : peu importe, il saute. Prenez les deux pions noirs.',
        success: 'Aucun mur n’arrête un cavalier.',
      },
    ],
  },
  {
    id: 'pion', title: 'Le pion', group: 'Les pièces',
    summary: 'Il avance tout droit et prend en diagonale.',
    steps: [
      {
        fen: '8/8/8/8/8/8/4P3/8 w - - 0 1', goal: { kind: 'info' },
        text: 'Le pion avance d’une case tout droit, jamais en arrière. Depuis sa case de départ, il peut avancer de deux cases.',
        arrows: ['e2e3', 'e2e4'],
      },
      {
        fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', goal: { kind: 'line', line: ['e2e4'] },
        text: 'Avancez le pion e2 de deux cases.',
        success: 'Le premier coup le plus joué au monde.',
      },
      {
        fen: '4k3/8/8/3np3/4P3/8/8/4K3 w - - 0 1', goal: { kind: 'line', line: ['e4d5'] },
        text: 'Le pion ne prend pas tout droit mais en diagonale, d’une case vers l’avant. Prenez le cavalier.',
        hint: 'Le pion e5 bloque le chemin ; le cavalier est en diagonale.',
        success: 'Un pion qui prend change de colonne.',
      },
    ],
  },

  // ------------------------------------------------------------------------------------------
  // Coups spéciaux
  {
    id: 'roque', title: 'Le roque', group: 'Coups spéciaux',
    summary: 'Le roi à l’abri, la tour au centre, en un seul coup.',
    steps: [
      {
        fen: 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1', goal: { kind: 'info' },
        text: 'Le roque déplace le roi de deux cases vers une tour, et la tour passe de l’autre côté du roi. Conditions : ni le roi ni cette tour n’ont bougé, les cases entre eux sont vides, et le roi n’est pas en échec, ne traverse pas et n’arrive pas sur une case attaquée.',
        arrows: ['e1g1', 'h1f1'],
      },
      {
        fen: 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1', goal: { kind: 'line', line: ['e1g1'] },
        text: 'Faites le petit roque : prenez le roi et posez-le deux cases à droite, en g1.',
        success: 'Le roi est à l’abri en g1, la tour est venue en f1.',
      },
      {
        fen: 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1', goal: { kind: 'line', line: ['e1c1'] },
        text: 'Le grand roque, côté dame : posez le roi en c1.',
        success: 'La tour a sauté en d1, sur la colonne centrale.',
      },
      {
        fen: 'r3k2r/pppq1ppp/2n1bn2/4p3/2b1P3/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 1', goal: { kind: 'line', line: ['e1c1'] },
        text: 'Le fou noir c4 contrôle f1 : le petit roque est interdit, car le roi traverserait une case attaquée. Roquez de l’autre côté.',
        marks: ['f1'],
        hint: 'Le grand roque reste possible : b1, c1 et d1 sont libres et sûres.',
        success: 'Avant de roquer, vérifiez les cases que le roi traverse.',
      },
    ],
  },
  {
    id: 'prise-en-passant', title: 'La prise en passant', group: 'Coups spéciaux',
    summary: 'Le pion qui avance de deux cases peut être pris au passage.',
    steps: [
      {
        fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', goal: { kind: 'info' }, last: 'd7d5',
        text: 'Le pion noir vient d’avancer de deux cases, de d7 à d5, et s’arrête à côté de votre pion e5. Votre pion peut le prendre comme s’il n’avait avancé que d’une case : il va en d6 et le pion d5 disparaît.',
        arrows: ['e5d6'],
      },
      {
        fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', goal: { kind: 'line', line: ['e5d6'] }, last: 'd7d5',
        text: 'Prenez en passant : jouez votre pion e5 en d6.',
        success: 'Le pion d5 a été pris, alors que votre pion ne s’est pas posé sur sa case.',
      },
      {
        fen: '4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1', goal: { kind: 'info' },
        text: 'C’est maintenant ou jamais : la prise en passant n’est permise qu’au coup qui suit l’avance de deux cases. Ici, un coup a passé : elle n’est plus possible.',
      },
    ],
  },
  {
    id: 'promotion', title: 'La promotion', group: 'Coups spéciaux',
    summary: 'Le pion qui atteint le bout devient une pièce.',
    steps: [
      {
        fen: '8/4P1k1/8/8/8/8/8/4K3 w - - 0 1', goal: { kind: 'line', line: ['e7e8q'] },
        text: 'Un pion qui atteint la dernière rangée est promu : il devient une dame, une tour, un fou ou un cavalier. Avancez en e8 et choisissez la dame.',
        success: 'Une seconde dame ! On choisit la dame presque à chaque fois.',
      },
      {
        fen: '8/1q1P1k2/8/8/8/8/8/4K3 w - - 0 1', goal: { kind: 'line', line: ['d7d8n', 'f7g7', 'd8b7'] },
        text: 'Presque à chaque fois… Ici, promouvez en cavalier : il donnera échec et attaquera la dame.',
        hint: 'Depuis d8, un cavalier attaque f7 et b7.',
        success: 'Sous-promotion : le cavalier gagne la dame noire.',
      },
    ],
  },

  // ------------------------------------------------------------------------------------------
  // Échec, mat et pat
  {
    id: 'echec', title: 'L’échec', group: 'Échec, mat et pat',
    summary: 'Trois façons de protéger son roi.',
    steps: [
      {
        fen: '4r1k1/8/8/8/8/8/8/4K3 w - - 0 1', goal: { kind: 'info' },
        text: 'Un roi attaqué est « en échec ». Il faut parer tout de suite, de l’une de trois façons : déplacer le roi, interposer une pièce, ou prendre la pièce qui attaque.',
        arrows: ['e8e1'],
      },
      {
        fen: '4r1k1/8/8/8/8/8/8/4K3 w - - 0 1', goal: { kind: 'any' },
        text: 'Le roi blanc est en échec par la tour e8. Parez en déplaçant le roi.',
        success: 'Le roi a quitté la colonne de la tour.',
      },
      {
        fen: '6k1/8/8/8/2B5/8/6PP/r6K w - - 0 1', goal: { kind: 'line', line: ['c4f1'] },
        text: 'Cette fois, le roi ne peut pas bouger. Interposez une pièce entre la tour et le roi.',
        hint: 'Le fou c4 peut revenir sur la première rangée.',
        success: 'Le fou f1 coupe la ligne de la tour.',
      },
      {
        fen: '6k1/8/8/8/8/N7/5PPP/1r4K1 w - - 0 1', goal: { kind: 'line', line: ['a3b1'] },
        text: 'Ni fuite ni interposition possible. Prenez la pièce qui donne échec.',
        success: 'La meilleure parade : la menace disparaît.',
      },
    ],
  },
  {
    id: 'mat', title: 'L’échec et mat', group: 'Échec, mat et pat',
    summary: 'Un échec sans parade termine la partie.',
    steps: [
      {
        fen: '3R2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', goal: { kind: 'info' },
        text: 'Échec et mat : le roi est en échec et aucune parade n’existe. La partie est terminée, celui qui mate a gagné. Ici, le roi noir ne peut ni fuir, ni interposer, ni prendre.',
        marks: ['d8', 'g8'],
      },
      {
        fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', goal: { kind: 'mate' },
        text: 'À vous : matez en un coup.',
        hint: 'Le roi noir est enfermé derrière ses pions.',
        success: 'Échec et mat !',
      },
      {
        fen: 'k7/8/1K6/8/8/8/8/7Q w - - 0 1', goal: { kind: 'mate' },
        text: 'Matez en un coup avec la dame.',
        success: 'Le roi blanc tient a7 et b7 : la dame fait le reste.',
      },
    ],
  },
  {
    id: 'pat', title: 'Le pat', group: 'Échec, mat et pat',
    summary: 'Pas d’échec, pas de coup : partie nulle.',
    steps: [
      {
        fen: 'k7/2Q5/1K6/8/8/8/8/8 b - - 0 1', goal: { kind: 'info' },
        text: 'Pat : le camp au trait n’est pas en échec mais n’a aucun coup légal. La partie est nulle, même avec une dame de plus ! Ici, les Noirs n’ont aucun coup.',
        marks: ['a7', 'b7', 'b8'],
      },
      {
        fen: 'k7/8/1K6/2Q5/8/8/8/8 w - - 0 1', goal: { kind: 'mate' },
        text: 'Matez en un coup, sans faire pat. Méfiez-vous des coups qui enferment le roi sans l’attaquer.',
        hint: 'Il faut donner échec : sur la 8e rangée, ou en a7 protégée par votre roi.',
        success: 'Mat, et pas pat : le roi noir était bien attaqué.',
      },
    ],
  },

  // ------------------------------------------------------------------------------------------
  // Mats élémentaires
  {
    id: 'mat-couloir', title: 'Le mat du couloir', group: 'Mats élémentaires',
    summary: 'La dernière rangée, piège du roi roqué.',
    steps: [
      {
        fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', goal: { kind: 'mate' },
        text: 'Le roi noir a roqué, ses pions sont restés devant lui : la 8e rangée est un couloir sans issue. Matez.',
        success: 'La tour sur la dernière rangée : mat du couloir.',
      },
      {
        fen: '6k1/5ppp/8/8/8/8/Q4PPP/6K1 w - - 0 1', goal: { kind: 'mate' },
        text: 'Même idée avec la dame.',
        success: 'Rien ne peut s’interposer.',
      },
      {
        fen: '1r4k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1', goal: { kind: 'line', line: ['h2h3|g2g3|h2h4|g2g4|f2f3|f2f4'] },
        text: 'Les Noirs menacent Tb1 mat. Donnez de l’air à votre roi.',
        hint: 'Avancez un des pions devant le roi.',
        success: 'Le roi a maintenant une case de fuite : la menace ne fonctionne plus.',
      },
    ],
  },
  {
    id: 'mat-dame', title: 'Dame et roi contre roi', group: 'Mats élémentaires',
    summary: 'Repousser le roi au bord, puis mater sans faire pat.',
    steps: [
      {
        fen: '8/8/8/3k4/8/8/8/Q3K3 w - - 0 1', goal: { kind: 'info' },
        text: 'Avec une dame, on mate toujours : la dame enferme le roi adverse dans une boîte de plus en plus petite (à un saut de cavalier de lui), puis votre roi s’approche pour l’épauler. Attention au pat !',
      },
      {
        fen: '3k4/Q7/4K3/8/8/8/8/8 w - - 0 1', goal: { kind: 'mate' },
        text: 'Le roi noir est au bord. Matez en un coup.',
        success: 'La dame, protégée par le roi, couvre toutes les cases.',
      },
      {
        fen: '2k5/Q7/5K2/8/8/8/8/8 w - - 0 1', goal: { kind: 'line', line: ['f6e6', 'c8d8', 'a7d7'], mate: true },
        text: 'Mat en deux : la dame tient déjà la 7e rangée. Approchez d’abord votre roi.',
        hint: 'Le roi blanc doit venir en e6.',
        success: 'La dame seule ne mate pas : son roi doit l’épauler.',
      },
      {
        fen: '8/8/8/3k4/8/8/8/Q3K3 w - - 0 1', goal: { kind: 'hunt', maxMoves: 30 },
        text: 'À vous, sans aide : matez le roi noir, qui se défend. Vous avez 30 coups.',
        hint: 'Placez la dame à un saut de cavalier du roi, suivez-le, puis amenez votre roi.',
        success: 'Mat ! Vous savez maintenant gagner avec une dame.',
      },
    ],
  },
  {
    id: 'mat-tour', title: 'Tour et roi contre roi', group: 'Mats élémentaires',
    summary: 'L’opposition des rois, la tour sur le bord.',
    steps: [
      {
        fen: '4k3/8/4K3/8/8/8/8/7R w - - 0 1', goal: { kind: 'mate' },
        text: 'Les deux rois se font face (on dit qu’ils sont en opposition). La tour donne le mat sur le bord.',
        success: 'Le roi blanc tient d7, e7 et f7 ; la tour, toute la rangée.',
      },
      {
        fen: '2k5/8/3K4/8/8/5R2/8/8 w - - 0 1', goal: { kind: 'line', line: ['f3b3', 'c8d8', 'b3b8'], mate: true },
        text: 'Les rois ne sont pas tout à fait face à face. Jouez un coup d’attente avec la tour, sans donner échec, pour forcer l’opposition.',
        hint: 'Coupez la colonne b : la tour en b3.',
        success: 'Forcé de venir en d8, le roi noir se place face au vôtre.',
      },
      {
        fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', goal: { kind: 'hunt', maxMoves: 40 },
        text: 'À vous : matez le roi noir avec la tour. Vous avez 40 coups.',
        hint: 'La tour coupe le roi sur une rangée ; votre roi vient en opposition, puis la tour donne échec et le repousse.',
        success: 'Mat ! La technique la plus utile des finales.',
      },
    ],
  },
  {
    id: 'mat-escalier', title: 'Deux tours : l’escalier', group: 'Mats élémentaires',
    summary: 'Les tours se relaient, une rangée chacune.',
    steps: [
      {
        fen: '8/8/8/8/4k3/R7/1R6/7K w - - 0 1', goal: { kind: 'line', line: ['b2b4', 'e4e5', 'a3a5', 'e5e6', 'b4b6', 'e6e7', 'a5a7', 'e7e8', 'b6b8'], mate: true },
        text: 'La tour a3 interdit la 3e rangée. Donnez échec avec l’autre tour sur la 4e, puis alternez : chaque échec fait monter le roi d’une marche.',
        hint: 'Rangée par rangée : Tb4, Ta5, Tb6, Ta7, Tb8.',
        success: 'L’escalier : le roi est monté jusqu’au bord, où la dernière marche le mate.',
      },
      {
        fen: '8/8/8/3k4/8/8/8/R3K2R w - - 0 1', goal: { kind: 'hunt', maxMoves: 20 },
        text: 'À vous : matez avec les deux tours. Gardez-les loin du roi noir.',
        success: 'Mat ! Deux tours n’ont même pas besoin de leur roi.',
      },
    ],
  },

  // ------------------------------------------------------------------------------------------
  // Les cartes (catalogue « Pouvoirs » : huit pouvoirs qui touchent les deux camps, mains visibles)
  {
    id: 'cartes', title: 'Jouer une carte', group: 'Les cartes',
    summary: 'Trois cartes chacun, visibles des deux joueurs ; une par tour, avant le coup.',
    steps: [
      {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', goal: { kind: 'info' },
        hands: { w: ['ice_wall', 'truce', 'tide'], b: ['ice_age', 'rift', 'blood_moon'] },
        text: 'Spellmate, ce sont les échecs, plus trois cartes de pouvoir par joueur, tirées au hasard. Les deux mains sont visibles : vous voyez les cartes de l’adversaire, il voit les vôtres, et une carte jouée reste grisée à sa place. À votre tour, vous pouvez jouer une carte avant votre coup : une seule par tour, et chaque carte ne sert qu’une fois.',
      },
      {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', goal: { kind: 'line', line: ['@ice_wall:e5', '*'] },
        hands: { w: ['ice_wall'] },
        text: 'Posez un Mur de glace en e5 : choisissez la carte, puis la case. Un Mur se pose sur une case vide, de la 3e à la 6e rangée. Jouez ensuite votre coup.',
        marks: ['e5'],
        hint: 'Cliquez d’abord sur la carte « Mur de glace », sous l’échiquier.',
        success: 'La case e5 est infranchissable pour les deux camps, jusqu’à la fin de la partie. Seul un cavalier peut sauter par-dessus.',
      },
      {
        fen: '6kr/8/8/8/8/8/6P1/6RK w - - 0 1', goal: { kind: 'line', line: ['@ice_wall:h3|@ice_wall:h4|@ice_wall:h5|@ice_wall:h6'] },
        hands: { w: ['ice_wall'] },
        text: 'Votre roi est en échec et n’a aucun coup : sans carte, ce serait mat. Mais une carte peut sauver : posez un Mur entre la tour noire et votre roi.',
        hint: 'g2 et h2 sont sur la 2e rangée : le Mur va plus haut sur la colonne h.',
        success: 'Sauvé ! Un joueur sans coup légal doit jouer la carte qui lui en rend un. Une carte ne met jamais le roi adverse en échec, mais elle peut protéger le vôtre.',
      },
    ],
  },
  {
    id: 'catalogues', title: 'Pouvoirs et familles', group: 'Les cartes',
    summary: 'Avec les huit pouvoirs ou sans cartes ; Climats, Terrains, Événement.',
    steps: [
      {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', goal: { kind: 'info' }, panel: 'catalogs',
        text: 'Chaque partie choisit son jeu. Par défaut, les Pouvoirs : huit cartes qui changent la partie pour les deux camps. Ou sans cartes : les échecs classiques, rien d’autre.',
      },
      {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', goal: { kind: 'info' }, panel: 'families',
        text: 'Les huit pouvoirs forment trois familles. Un Climat change une règle sur tout le plateau pendant quelques coups (un seul à la fois). Un Terrain transforme des cases. Un Événement agit une fois, tout de suite.',
      },
    ],
  },
  {
    id: 'deux-camps', title: 'Pour les deux camps', group: 'Les cartes',
    summary: 'Chaque pouvoir change la partie pour tout le monde.',
    steps: [
      {
        fen: '8/8/8/8/8/8/8/3R4 w - - 0 1', goal: { kind: 'stars', stars: ['d5', 'd8'] },
        hands: { b: ['ice_wall'] }, effects: [{ card: 'ice_wall', by: 'b', square: 'd4' }],
        text: 'Les Noirs ont posé un Mur de glace en d4. Un pouvoir ne choisit pas son camp : le Mur bloque aussi votre tour. Faites-la passer par les deux étoiles.',
        hint: 'Contournez le Mur par la colonne c ou la colonne e.',
        success: 'Le Mur barre la route aux deux camps, jusqu’à la fin de la partie.',
      },
      {
        fen: 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP2BPPP/R1BQ1RK1 w - - 0 1', goal: { kind: 'any' },
        hands: { w: ['truce', 'rift', 'ice_wall'], b: ['ice_age', 'tide', 'blood_moon'] },
        effects: [{ card: 'ice_age', by: 'b', remaining: 3 }],
        text: 'Les Noirs ont fait venir l’Ère glaciaire : pendant quelques coups, aucun pion ne bouge, ni les leurs ni les vôtres. Jouez un coup : seules vos pièces le peuvent.',
        success: 'Vos pions sont gelés comme les leurs. Celui qui lance un pouvoir ne choisit pas qui il touche : il choisit le moment.',
      },
    ],
  },
  {
    id: 'presage-rituel', title: 'Présage et Rituel', group: 'Les cartes',
    summary: 'Le Climat s’annonce ; la marée remplace le coup.',
    steps: [
      {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', goal: { kind: 'info' }, panel: 'presage',
        text: 'Présage : un Climat s’annonce. Il n’arrive qu’au début de votre tour suivant, après la réponse adverse : votre adversaire voit venir le changement et a un coup pour s’y préparer. Un seul Climat peut être annoncé à la fois.',
      },
      {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', goal: { kind: 'line', line: ['@truce', '*', 'e7e5'] },
        hands: { w: ['truce'] },
        text: 'Annoncez la Trêve (aucune capture pendant 3 coups, sauf pour sortir d’un échec), puis jouez un coup. Les Noirs répondent ; la Trêve arrive ensuite.',
        hint: 'Cliquez sur la carte « Trêve » : elle n’a pas de cible.',
        success: 'La Trêve est arrivée : regardez la liste des effets sous l’échiquier. Elle vaut pour vous aussi : vous ne prendrez rien pendant 3 coups.',
      },
      {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', goal: { kind: 'info' }, panel: 'ritual',
        text: 'Rituel : la Grande Marée remplace votre coup. Tous les pions des deux camps sur leurs 2e à 5e rangées avancent d’une case, si elle est libre, puis c’est à l’adversaire de jouer.',
      },
      {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', goal: { kind: 'line', line: ['@tide', 'e6e5'] },
        hands: { w: ['tide'] },
        text: 'Lancez la Grande Marée. Elle tient lieu de coup : vous ne jouez rien d’autre.',
        success: 'Tous les pions ont avancé d’une case, les vôtres comme les siens, et c’est aux Noirs de jouer.',
      },
    ],
  },
  {
    id: 'mur-magie', title: 'Le Mur et la magie qui cède', group: 'Les cartes',
    summary: 'Un Mur dure toute la partie ; un camp bloqué par les pouvoirs joue quand même.',
    steps: [
      {
        fen: '6k1/5ppp/8/4b3/8/7K/6PP/8 w - - 0 1', goal: { kind: 'line', line: ['h3g4|h3h4'] },
        hands: { w: ['ice_wall'], b: ['ice_wall', 'ice_age'] },
        effects: [{ card: 'ice_age', by: 'b', remaining: 3 }, { card: 'ice_wall', by: 'w', square: 'g4' }, { card: 'ice_wall', by: 'b', square: 'h4' }],
        text: 'Pris dans la glace : deux Murs bloquent votre roi, le fou noir tient g3 et l’Ère glaciaire gèle vos pions. Aucun coup, sans être en échec : la magie cède, vous jouez comme si les pouvoirs n’existaient pas pour vos pièces. Marchez sur un Mur avec votre roi.',
        marks: ['g4', 'h4'],
        hint: 'Le roi va en g4 ou en h4, sur un Mur.',
        success: 'Le Mur a fondu sous vos pas. Un camp que les pouvoirs privent de tout coup n’est jamais pat : la magie cède pour lui, et le Terrain sur lequel une pièce s’arrête disparaît.',
      },
    ],
  },
  {
    id: 'mains-visibles', title: 'Lire la main adverse', group: 'Les cartes',
    summary: 'Ses cartes sont visibles : jouez en conséquence.',
    steps: [
      {
        fen: 'k7/p1Q5/8/8/8/8/5PPP/3B2K1 w - - 0 1', goal: { kind: 'mate' },
        hands: { b: ['rift'] },
        text: 'Les Noirs gardent une Faille en main : elle peut ouvrir un gouffre sur la 4e ou la 5e rangée, même pour parer un échec. Donnez un mat qu’elle ne peut pas arrêter.',
        hint: 'Ff3+ traverse e4 et d5 : la Faille couperait la diagonale. Cherchez un échec sur la 8e rangée.',
        success: 'Mat ! Avant un plan, regardez toujours ce que l’adversaire garde en main.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// Outils

export function lessonById(id: string | undefined): Lesson | undefined {
  return LESSONS.find(l => l.id === id);
}

/** Camp de l'élève (celui qui a le trait dans la position de départ de l'étape). */
export function studentOf(step: LessonStep): Color {
  return step.fen.split(/\s+/)[1] === 'b' ? 'b' : 'w';
}

export function stepStart(step: LessonStep): GameState {
  const catalog = step.catalog ?? (step.hands || step.effects ? 'climats' : 'aucune');
  const s = createGameFromFen(step.fen, { w: step.hands?.w ?? [], b: step.hands?.b ?? [] }, false, catalog);
  return withEffects(s, step.effects ?? []);
}

/** Coup libre (exercices des étoiles) : l'adversaire ne joue pas, l'élève garde le trait. */
export function freeMove(s: GameState, from: number, to: number, promo?: PieceType): GameState | null {
  const me = s.pos.turn;
  const r = playMove(s, from, to, promo);
  if (!r.ok) return null;
  return { ...r.state, pos: { ...r.state.pos, turn: me, ep: -1 }, result: null };
}

/**
 * Défense du roi seul (exercices de mat) : il choisit la case qui lui laisse le plus de place,
 * prend une pièce en prise s'il le peut, et préfère le centre.
 */
export function loneKingReply(s: GameState): Move | null {
  const moves = legalMovesOf(s);
  if (!moves.length) return null;
  const me = s.pos.turn;
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    const r = playMove(s, m.from, m.to, m.promo);
    if (!r.ok) continue;
    let score = 0;
    if (r.info.capturedId !== null) score += 1000;
    const after = r.state;
    if (after.result?.reason === 'stalemate') score += 500;
    // Cases de fuite à venir : on joue un coup « nul » de l'adversaire pour compter les coups du roi.
    const flipped = { ...after, pos: { ...after.pos, turn: me } };
    const k = kingSquare(after.pos, me);
    const mods = modsFromEffects(after.effects);
    let room = 0;
    for (const x of legalMovesOf({ ...flipped, result: null })) if (x.from === k) room++;
    if (inCheck(flipped.pos, me, mods)) room -= 2;
    score += room * 10;
    const f = fileOf(m.to), rk = rankOf(m.to);
    score -= (Math.abs(f - 3.5) + Math.abs(rk - 3.5)) * 3;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

/** L'étape « hunt » est-elle terminée par un mat de l'élève ? */
export function matedBy(s: GameState, student: Color): boolean {
  return s.result?.reason === 'checkmate' && s.result.winner === student;
}

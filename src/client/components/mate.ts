// Échec et mat : le roi maté vacille, bascule et se couche sur sa case (Board, prop `mated` ; board.css, .is-mated).
// Fonctions pures, testées dans test/mate.test.ts : les échiquiers qui montrent une vraie fin de partie (partie en
// ligne, accueil, problèmes, leçons, analyse, démonstration) calculent la case du roi maté depuis leur état.
import { kingSquare } from '../../shared/chess';
import type { Position } from '../../shared/chess';
import type { Result } from '../../shared/game';

/**
 * Durée de la chute (board.css, @keyframes pi-fall-*) : vacillement 0,4 s, chute, rebonds. Ce qui recouvrirait
 * l'échiquier (carte de fin de partie) attend qu'elle soit jouée.
 */
export const MATE_FALL_MS = 1250;

/**
 * Case du roi maté, null sans mat. Le camp maté est celui qui a le trait (evaluateEnd : plus aucun coup et roi en
 * échec) ; une position d'étude sans roi ne donne rien.
 */
export function matedKing(s: { pos: Position; result: Result | null }): number | null {
  if (s.result?.reason !== 'checkmate') return null;
  const k = kingSquare(s.pos, s.pos.turn);
  return k >= 0 ? k : null;
}

/**
 * Côté où tombe le roi, en colonnes : +1 vers la colonne h, -1 vers la colonne a. À l'opposé de la pièce qui vient
 * de jouer (`by`, case d'arrivée du dernier coup : d'ordinaire celle qui mate), comme si elle l'avait renversé ; sur
 * la même colonne, ou sans dernier coup (mat amené par une carte), vers le centre de l'échiquier, où la chute se
 * lit le mieux. En colonnes et non à l'écran : Board le traduit selon l'orientation, la chute reste la même vue des
 * deux côtés.
 */
export function fallSide(king: number, by: number | null | undefined): 1 | -1 {
  const file = king & 7;
  if (by != null && by >= 0) {
    const d = file - (by & 7);
    if (d) return d > 0 ? 1 : -1;
  }
  return file <= 3 ? 1 : -1;
}

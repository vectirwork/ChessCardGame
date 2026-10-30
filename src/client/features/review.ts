// Relecture d'une partie : classement des coups d'après les évaluations du moteur.
import type { Analysis } from '../../shared/bot';
import type { Color } from '../../shared/chess';
import type { TreeNode } from '../../shared/pgn';
import { evalCp } from './format';

export type Judgement = 'gaffe' | 'erreur';

export const JUDGEMENT_SIGN: Record<Judgement, string> = { gaffe: '??', erreur: '?' };
export const JUDGEMENT_LABEL: Record<Judgement, string> = { gaffe: 'Gaffe', erreur: 'Erreur' };

/** Chances de gain (−1 à 1) du point de vue des Blancs. */
export function winningChances(cp: number): number {
  return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
}

export interface Flag {
  node: TreeNode;
  index: number;
  color: Color;
  judgement: Judgement;
  /** Évaluations avant et après, en centipions (point de vue des Blancs). */
  before: number;
  after: number;
}

/**
 * Coups de la suite principale qui font chuter les chances de gain : gaffe au-delà de 0,3, erreur au-delà de 0,2
 * (échelle −1 à 1). `evals[i]` est l'évaluation de `line[i]` (la racine en premier).
 */
export function judge(line: TreeNode[], evals: (Analysis | null | undefined)[]): Flag[] {
  const out: Flag[] = [];
  for (let i = 1; i < line.length; i++) {
    const node = line[i];
    const e = node.entry;
    if (!e || e.k !== 'move') continue;
    const a = evals[i - 1], b = evals[i];
    if (!a || !b) continue;
    const before = evalCp(a.scoreWhite, a.mate);
    const after = evalCp(b.scoreWhite, b.mate);
    const sign = e.c === 'w' ? 1 : -1;
    const drop = (winningChances(before) - winningChances(after)) * sign;
    const judgement: Judgement | null = drop >= 0.3 ? 'gaffe' : drop >= 0.2 ? 'erreur' : null;
    if (judgement) out.push({ node, index: i, color: e.c, judgement, before, after });
  }
  return out;
}

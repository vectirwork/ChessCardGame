// Pré-coups : pendant que l'adversaire réfléchit, le joueur prépare ses coups suivants, sans limite de nombre.
//
// Comme sur les sites d'échecs habituels, un pré-coup suit seulement la géométrie de la pièce (la tour en ligne
// droite jusqu'au bord, le cavalier en L…), sans tenir compte des pièces sur le chemin : la position aura changé
// quand il sera joué. Les pré-coups s'enchaînent sur une position « virtuelle » où les précédents sont déjà joués.
// Au tour du joueur, le premier est joué s'il est légal ; sinon tous sont annulés. Les cartes ne se pré-jouent pas.
import type { Color, Piece, Position } from '../../shared/chess';

export interface Premove {
  /** Identifiant de la pièce qui joue (elle doit encore être sur `from` au moment de jouer). */
  id: number;
  from: number;
  to: number;
}

const file = (sq: number) => sq & 7;
const rank = (sq: number) => sq >> 3;
const on = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8;

/** Position virtuelle : la position réelle, puis chaque pré-coup joué dans l'ordre (promotion en dame). */
export function virtualBoard(board: readonly (Piece | null)[], queue: readonly Premove[]): (Piece | null)[] {
  const b = board.slice();
  for (const m of queue) {
    const p = b[m.from];
    if (!p) continue;
    b[m.from] = null;
    // Roque : la tour suit le roi
    if (p.t === 'k' && Math.abs(m.to - m.from) === 2) {
      const kingSide = m.to > m.from;
      const rookFrom = kingSide ? m.from + 3 : m.from - 4;
      const rookTo = kingSide ? m.from + 1 : m.from - 1;
      b[rookTo] = b[rookFrom];
      b[rookFrom] = null;
    }
    const last = p.c === 'w' ? 7 : 0;
    b[m.to] = p.t === 'p' && rank(m.to) === last ? { ...p, t: 'q' } : p;
  }
  return b;
}

/** Cases qu'une pièce peut viser en pré-coup depuis `from`, sur la position virtuelle `b`. */
export function premoveDests(b: readonly (Piece | null)[], from: number, castling: number, queue: readonly Premove[]): number[] {
  const p = b[from];
  if (!p) return [];
  const f = file(from);
  const r = rank(from);
  const out: number[] = [];
  const add = (df: number, dr: number) => on(f + df, r + dr) && out.push((r + dr) * 8 + f + df);
  const ray = (df: number, dr: number) => {
    for (let k = 1; on(f + df * k, r + dr * k); k++) out.push((r + dr * k) * 8 + f + df * k);
  };
  switch (p.t) {
    case 'p': {
      const dir = p.c === 'w' ? 1 : -1;
      add(0, dir);
      if (r === (p.c === 'w' ? 1 : 6)) add(0, 2 * dir);
      add(-1, dir);
      add(1, dir);
      break;
    }
    case 'n':
      for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) add(df, dr);
      break;
    case 'b':
      for (const [df, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ray(df, dr);
      break;
    case 'r':
      for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ray(df, dr);
      break;
    case 'q':
      for (const [df, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) ray(df, dr);
      break;
    case 'k': {
      for (const [df, dr] of [[1, 1], [1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, 0], [-1, -1]]) add(df, dr);
      // Roque : roi et tour encore chez eux, ni l'un ni l'autre déjà déplacé en pré-coup
      const home = p.c === 'w' ? 4 : 60;
      const moved = (id: number | undefined) => id !== undefined && queue.some(m => m.id === id);
      if (from === home && !moved(p.id)) {
        const [kBit, qBit] = p.c === 'w' ? [1, 2] : [4, 8];
        const rookOk = (sq: number) => b[sq]?.t === 'r' && b[sq]?.c === p.c && !moved(b[sq]?.id);
        if (castling & kBit && rookOk(home + 3)) out.push(home + 2);
        if (castling & qBit && rookOk(home - 4)) out.push(home - 2);
      }
      break;
    }
  }
  return out;
}

/** Cases d'où le joueur peut préparer un pré-coup (ses pièces sur la position virtuelle). */
export function premoveSources(b: readonly (Piece | null)[], color: Color): Set<number> {
  const s = new Set<number>();
  b.forEach((p, sq) => p?.c === color && s.add(sq));
  return s;
}

/** Position réelle → clé d'identité d'une partie : si le numéro de coup recule, c'est une autre partie (ou un retour). */
export const fullmoveOf = (pos: Position) => pos.fullmove * 2 + (pos.turn === 'b' ? 1 : 0);

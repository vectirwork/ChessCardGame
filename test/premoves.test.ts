// Pré-coups (src/client/components/premoves.ts) : géométrie des pièces, position virtuelle, roque.
import { describe, expect, it } from 'vitest';
import { fromFen } from '../src/shared/chess';
import { premoveDests, virtualBoard } from '../src/client/components/premoves';

const sq = (s: string) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
const names = (l: number[]) => l.map(n => 'abcdefgh'[n & 7] + ((n >> 3) + 1)).sort();

describe('pré-coups', () => {
  it('suivent la géométrie de la pièce, sans tenir compte des pièces sur le chemin', () => {
    const { pos } = fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    // La tour a1, bloquée par ses propres pièces, vise quand même toute la colonne et toute la rangée
    expect(names(premoveDests(pos.board, sq('a1'), pos.castling, []))).toEqual(names(['a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1'].map(sq)));
    // Pion de départ : une ou deux cases, et les deux diagonales (prise possible plus tard)
    expect(names(premoveDests(pos.board, sq('e2'), pos.castling, []))).toEqual(['d3', 'e3', 'e4', 'f3']);
    // Cavalier
    expect(names(premoveDests(pos.board, sq('g1'), pos.castling, []))).toEqual(['e2', 'f3', 'h3']);
  });

  it('s’enchaînent sur la position virtuelle', () => {
    const { pos } = fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const q = [{ id: pos.board[sq('g1')]!.id, from: sq('g1'), to: sq('f3') }];
    const vb = virtualBoard(pos.board, q);
    expect(vb[sq('g1')]).toBeNull();
    expect(vb[sq('f3')]?.t).toBe('n');
    expect(names(premoveDests(vb, sq('f3'), pos.castling, q))).toEqual(['d2', 'd4', 'e1', 'e5', 'g1', 'g5', 'h2', 'h4']);
  });

  it('roque : le roi vise g1 et c1 tant que roi et tours n’ont pas bougé', () => {
    const { pos } = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(premoveDests(pos.board, sq('e1'), pos.castling, [])).toEqual(expect.arrayContaining([sq('g1'), sq('c1')]));
    const rook = { id: pos.board[sq('h1')]!.id, from: sq('h1'), to: sq('h4') };
    const vb = virtualBoard(pos.board, [rook]);
    const d = premoveDests(vb, sq('e1'), pos.castling, [rook]);
    expect(d).not.toContain(sq('g1'));
    expect(d).toContain(sq('c1'));
    // Sans droit au roque, pas de roque
    expect(premoveDests(pos.board, sq('e1'), 0, [])).not.toContain(sq('g1'));
    // Le roque prévu déplace aussi la tour
    const castle = virtualBoard(pos.board, [{ id: pos.board[sq('e1')]!.id, from: sq('e1'), to: sq('g1') }]);
    expect(castle[sq('f1')]?.t).toBe('r');
    expect(castle[sq('h1')]).toBeNull();
  });

  it('un pion qui atteint la dernière rangée devient une dame dans la position virtuelle', () => {
    const { pos } = fromFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const vb = virtualBoard(pos.board, [{ id: pos.board[sq('a7')]!.id, from: sq('a7'), to: sq('a8') }]);
    expect(vb[sq('a8')]?.t).toBe('q');
  });
});

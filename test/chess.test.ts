import { describe, expect, it } from 'vitest';
import { fromFen, initialPosition, legalMoves, makeMove, unmakeMove, toFen, Position, toSan, sqIndex } from '../src/shared/chess';

function perft(pos: Position, depth: number): number {
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) {
    const u = makeMove(pos, m);
    n += perft(pos, depth - 1);
    unmakeMove(pos, u);
  }
  return n;
}

describe('générateur de coups (perft)', () => {
  it('position initiale', () => {
    const { pos } = initialPosition();
    expect(perft(pos, 1)).toBe(20);
    expect(perft(pos, 2)).toBe(400);
    expect(perft(pos, 3)).toBe(8902);
    expect(perft(pos, 4)).toBe(197281);
  });
  it('Kiwipete (roques, prises en passant, promotions)', () => {
    const { pos } = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect(perft(pos, 1)).toBe(48);
    expect(perft(pos, 2)).toBe(2039);
    expect(perft(pos, 3)).toBe(97862);
  });
  it('position 3 (finale, clouages et prise en passant)', () => {
    const { pos } = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    expect(perft(pos, 1)).toBe(14);
    expect(perft(pos, 2)).toBe(191);
    expect(perft(pos, 3)).toBe(2812);
    expect(perft(pos, 4)).toBe(43238);
  });
  it('position 4 (promotions et échecs)', () => {
    const { pos } = fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
    expect(perft(pos, 1)).toBe(6);
    expect(perft(pos, 2)).toBe(264);
    expect(perft(pos, 3)).toBe(9467);
  });
  it('position 5', () => {
    const { pos } = fromFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
    expect(perft(pos, 1)).toBe(44);
    expect(perft(pos, 2)).toBe(1486);
    expect(perft(pos, 3)).toBe(62379);
  });
  it('FEN aller-retour', () => {
    const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
    expect(toFen(fromFen(fen).pos)).toBe(fen);
  });
  it('notation algébrique avec ambiguïté', () => {
    const r = fromFen('4k3/8/8/8/8/8/4K3/R6R w - - 0 1').pos;
    const rl = legalMoves(r);
    const m = rl.find(x => x.from === sqIndex('a1') && x.to === sqIndex('d1'))!;
    expect(toSan(r, m, rl)).toBe('Rad1');
    const { pos } = fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    const legal = legalMoves(pos);
    const castle = legal.find(x => x.from === sqIndex('e1') && x.to === sqIndex('g1'))!;
    expect(toSan(pos, castle, legal)).toBe('O-O');
  });
});

import { describe, expect, it } from 'vitest';
import { sqName } from '../src/shared/chess';
import { analyse, chooseBotMove } from '../src/shared/bot';
import { createGame, createGameFromFen } from '../src/shared/game';

describe('IA et analyse', () => {
  it('trouve un mat en un coup et le signale', () => {
    const s = createGameFromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { w: [], b: [] }, false);
    const a = analyse(s, 4, 3000);
    expect(a.best && sqName(a.best.from) + sqName(a.best.to)).toBe('a1a8');
    expect(a.mate).toBe(1);
    expect(a.pv[0]).toEqual(a.best);
  });
  it('évalue la position initiale comme équilibrée et donne une suite', () => {
    const a = analyse(createGame({ w: [], b: [] }, false), 3, 3000);
    expect(Math.abs(a.scoreWhite)).toBeLessThan(80);
    expect(a.pv.length).toBeGreaterThanOrEqual(2);
  });
  it('voit qu’une dame en prise se perd (point de vue des Blancs, Noirs au trait)', () => {
    const s = createGameFromFen('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1', { w: [], b: [] }, false);
    const a = analyse(s, 3, 3000);
    expect(a.best && sqName(a.best.to)).toBe('d5');
    expect(a.scoreWhite).toBeGreaterThan(300);
  });
  it("l'IA joue un coup légal", () => {
    expect(chooseBotMove(createGame({ w: [], b: [] }, false), 2)).not.toBeNull();
  });
});

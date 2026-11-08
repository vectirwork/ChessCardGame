// Échec et mat : case du roi maté et côté de sa chute (src/client/components/mate.ts), et garde-fous de l'animation
// (board.css) : seulement rotate, translate, opacity et transform, rien en mouvement réduit, et la rotation qui
// redresse les pièces sur l'échiquier incliné reste intacte.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromFen, sqIndex as q } from '../src/shared/chess';
import { createGame, createGameFromFen, playMove } from '../src/shared/game';
import type { GameState } from '../src/shared/game';
import { MATE_FALL_MS, fallSide, matedKing } from '../src/client/components/mate';

function mv(s: GameState, from: string, to: string): GameState {
  const r = playMove(s, q(from), q(to));
  if (!r.ok) throw new Error(`${from}-${to}: ${r.error}`);
  return r.state;
}

describe('roi maté', () => {
  it('mat du lion : le roi blanc, au trait, est maté en e1', () => {
    let s = createGame({ w: [], b: [] }, false, 'aucune');
    s = mv(s, 'f2', 'f3');
    s = mv(s, 'e7', 'e5');
    s = mv(s, 'g2', 'g4');
    expect(matedKing(s)).toBeNull();
    s = mv(s, 'd8', 'h4');
    expect(s.result).toEqual({ winner: 'b', reason: 'checkmate' });
    expect(matedKing(s)).toBe(q('e1'));
  });

  it('mat du couloir : le roi noir en g8', () => {
    let s = createGameFromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { w: [], b: [] }, false, 'aucune');
    s = mv(s, 'a1', 'a8');
    expect(s.result?.reason).toBe('checkmate');
    expect(matedKing(s)).toBe(q('g8'));
  });

  it('rien sans mat : partie en cours, pat, abandon, temps, position sans roi', () => {
    const { pos } = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1');
    expect(matedKing({ pos, result: null })).toBeNull();
    expect(matedKing({ pos, result: { winner: null, reason: 'stalemate' } })).toBeNull();
    expect(matedKing({ pos, result: { winner: 'w', reason: 'resign' } })).toBeNull();
    expect(matedKing({ pos, result: { winner: 'w', reason: 'timeout' } })).toBeNull();
    const study = fromFen('8/8/8/8/8/8/8/R5K1 b - - 0 1').pos;
    expect(matedKing({ pos: study, result: { winner: 'w', reason: 'checkmate' } })).toBeNull();
  });
});

describe('côté de la chute', () => {
  // Rois et pièces posés à la main : fallSide ne regarde que la couleur des deux cases
  const board = (pieces: Record<string, 'w' | 'b'>, kings: Record<string, 'w' | 'b'>) => {
    const pos = fromFen('8/8/8/8/8/8/8/8 w - - 0 1').pos;
    let id = 1;
    for (const [sq, c] of Object.entries(pieces)) pos.board[q(sq)] = { id: id++, t: 'q', c };
    for (const [sq, c] of Object.entries(kings)) pos.board[q(sq)] = { id: id++, t: 'k', c };
    return pos;
  };

  it('à l’opposé de la pièce qui vient de jouer', () => {
    // Roi g8 : tour arrivée en a8 (à sa gauche) → il tombe vers la colonne h ; dame arrivée en h7 → vers la colonne a
    expect(fallSide(board({ a8: 'w' }, { g8: 'b' }), q('g8'), q('a8'))).toBe(1);
    expect(fallSide(board({ h7: 'w' }, { g8: 'b' }), q('g8'), q('h7'))).toBe(-1);
    expect(fallSide(board({ a2: 'b' }, { b1: 'w' }), q('b1'), q('a2'))).toBe(1);
    expect(fallSide(board({ h4: 'b' }, { e1: 'w' }), q('e1'), q('h4'))).toBe(-1);
  });

  it('même colonne, ou sans dernier coup : vers le centre', () => {
    expect(fallSide(board({ g7: 'w' }, { g8: 'b' }), q('g8'), q('g7'))).toBe(-1);
    expect(fallSide(board({ b6: 'w' }, { b8: 'b' }), q('b8'), q('b6'))).toBe(1);
    expect(fallSide(board({}, { d1: 'w' }), q('d1'), null)).toBe(1);
    expect(fallSide(board({}, { e8: 'b' }), q('e8'), undefined)).toBe(-1);
    expect(fallSide(board({}, { h1: 'w' }), q('h1'), -1)).toBe(-1);
  });

  it('mat par Rituel : le dernier coup est celui du camp maté, il ne compte pas', () => {
    // Grande Marée : le journal n'a qu'une entrée « card » ; le dernier coup est le roi noir parti de g8 vers h8, ou
    // une pièce noire en a8, ou une case vide (pièce prise depuis) : vers le centre, comme sans dernier coup
    expect(fallSide(board({}, { h8: 'b' }), q('h8'), q('h8'))).toBe(-1);
    expect(fallSide(board({ a8: 'b' }, { g8: 'b' }), q('g8'), q('a8'))).toBe(-1);
    expect(fallSide(board({}, { b8: 'b' }), q('b8'), q('e5'))).toBe(1);
  });

  it('le mat du lion, joué pour de bon : la dame noire arrive en h4, le roi blanc tombe vers la colonne a', () => {
    let s = createGame({ w: [], b: [] }, false, 'aucune');
    for (const [a, b] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) s = mv(s, a, b);
    expect(fallSide(s.pos, matedKing(s)!, q('h4'))).toBe(-1);
  });
});

describe('animation du mat (board.css)', () => {
  const css = readFileSync(path.resolve(__dirname, '../src/client/styles/board.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  /** Propriétés animées par une règle @keyframes. */
  const animated = (name: string) => {
    const body = css.split(`@keyframes ${name} {`)[1]?.split(/\n}\n/)[0] ?? '';
    expect(body).not.toBe('');
    return new Set([...body.matchAll(/^\s*([a-z-]+):/gm)].map(m => m[1]).filter(p => p !== 'animation-timing-function'));
  };

  it('chute en rotate et translate, poussière en opacity et transform : rien que le compositeur', () => {
    expect([...animated('pi-fall-r')].sort()).toEqual(['rotate', 'translate']);
    expect([...animated('pi-fall-l')].sort()).toEqual(['rotate', 'translate']);
    expect([...animated('pi-dust')].sort()).toEqual(['opacity', 'transform']);
  });

  it('mouvement réduit : ni vacillement ni chute, le roi est couché d’emblée', () => {
    const reduced = css.split('@media (prefers-reduced-motion: reduce)').slice(1).join('');
    expect(reduced).toMatch(/\.piece\.is-mated \.pi-fall,\s*\.piece\.is-mated \.pi-dust \{\s*animation: none;/);
    // L'état couché est la règle de base, pas la fin de l'animation
    expect(css).toMatch(/\.piece\.fall-r \.pi-fall \{\s*rotate: 90deg;\s*translate: -41% -34%;/);
    expect(css).toMatch(/\.piece\.fall-l \.pi-fall \{\s*rotate: -90deg;\s*translate: 41% -34%;/);
  });

  it('ne touche pas au transform de .pi (pièces redressées sur l’échiquier incliné)', () => {
    expect(css).toMatch(/\.board-wrap\.is-tilting \.pi \{\s*transform: rotateX\(calc\(var\(--tilt\) \* -1\)\);/);
    const mateRules = [...css.matchAll(/([^{}]*(?:is-mated|pi-fall|fall-[rl])[^{}]*)\{([^}]*)\}/g)];
    expect(mateRules.length).toBeGreaterThanOrEqual(5);
    for (const [, , body] of mateRules) expect(body).not.toMatch(/(^|[\s;])(transform|will-change|filter|clip-path):/);
    // La poussière, hors de .pi (et de son filtre), n'en porte pas non plus
    const dust = css.match(/\n\.pi-dust \{([^}]*)\}/)?.[1] ?? '';
    expect(dust).toContain('opacity: 0;');
    expect(dust).not.toMatch(/(^|[\s;])(transform|will-change|filter|clip-path):/);
  });

  it('MATE_FALL_MS suit la durée de la chute ; la poussière finit avant la carte de fin', () => {
    expect(css).toContain(`animation: pi-fall-r ${MATE_FALL_MS / 1000}s;`);
    expect(css).toContain(`animation: pi-fall-l ${MATE_FALL_MS / 1000}s;`);
    const m = css.match(/animation: pi-dust ([\d.]+)s [a-z-]+ ([\d.]+)s;/);
    expect(m).not.toBeNull();
    // GamePage montre la carte de fin à MATE_FALL_MS + 500 ms
    expect((Number(m![1]) + Number(m![2])) * 1000).toBeLessThanOrEqual(MATE_FALL_MS + 500);
  });
});

// Échec et mat : case du roi maté et côté de sa chute (src/client/components/mate.ts), et garde-fous de l'animation
// (board.css) : seulement rotate, translate, opacity et transform, rien en mouvement réduit, et la rotation qui
// redresse les pièces sur l'échiquier incliné reste intacte.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromFen, sqIndex as q } from '../src/shared/chess';
import { createGame, createGameFromFen, playMove } from '../src/shared/game';
import type { GameState } from '../src/shared/game';
import { fallSide, matedKing } from '../src/client/components/mate';

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
  it('à l’opposé de la pièce qui vient de jouer', () => {
    // Roi g8 : tour arrivée en a8 (à sa gauche) → il tombe vers la colonne h ; dame arrivée en h7 → vers la colonne a
    expect(fallSide(q('g8'), q('a8'))).toBe(1);
    expect(fallSide(q('g8'), q('h7'))).toBe(-1);
    expect(fallSide(q('b1'), q('a2'))).toBe(1);
    expect(fallSide(q('e1'), q('h4'))).toBe(-1);
  });

  it('même colonne, ou sans dernier coup : vers le centre', () => {
    expect(fallSide(q('g8'), q('g7'))).toBe(-1);
    expect(fallSide(q('b8'), q('b6'))).toBe(1);
    expect(fallSide(q('d1'), null)).toBe(1);
    expect(fallSide(q('e8'), undefined)).toBe(-1);
    expect(fallSide(q('h1'), -1)).toBe(-1);
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
    expect(reduced).toMatch(/\.piece\.is-mated \.pi-fall,\s*\.piece\.is-mated \.pi::before \{\s*animation: none;/);
    // L'état couché est la règle de base, pas la fin de l'animation
    expect(css).toMatch(/\.piece\.fall-r \.pi-fall \{\s*rotate: 90deg;\s*translate: -41% -34%;/);
    expect(css).toMatch(/\.piece\.fall-l \.pi-fall \{\s*rotate: -90deg;\s*translate: 41% -34%;/);
  });

  it('ne touche pas au transform de .pi (pièces redressées sur l’échiquier incliné)', () => {
    expect(css).toMatch(/\.board-wrap\.is-tilting \.pi \{\s*transform: rotateX\(calc\(var\(--tilt\) \* -1\)\);/);
    const mateRules = [...css.matchAll(/([^{}]*(?:is-mated|pi-fall|fall-[rl])[^{}]*)\{([^}]*)\}/g)];
    expect(mateRules.length).toBeGreaterThanOrEqual(5);
    for (const [, , body] of mateRules) expect(body).not.toMatch(/(^|[\s;])(transform|will-change|filter|clip-path):/);
  });
});

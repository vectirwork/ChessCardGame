import { describe, expect, it } from 'vitest';
import { analyse } from '../src/shared/bot';
import { legalMovesOf, sideInCheck } from '../src/shared/game';
import { material, uciOf, validateFen } from '../src/shared/pgn';
import {
  PUZZLES, Puzzle, applyAction, dailyPuzzle, goalOf, parseAction, puzzleById, puzzleStart, solverOf, stepOptions,
} from '../src/shared/puzzles';

/** Joue la ligne principale (première réponse acceptée de chaque étape) et renvoie les états successifs. */
function playLine(p: Puzzle) {
  let s = puzzleStart(p);
  const states = [s];
  const solver = solverOf(p);
  for (const [i, step] of p.solution.entries()) {
    const opts = stepOptions(step);
    expect(opts.length, `${p.id} étape ${i}`).toBeGreaterThan(0);
    // Toutes les réponses acceptées doivent être légales
    for (const o of opts) expect(applyAction(s, o), `${p.id} : ${step} illégal`).not.toBeNull();
    const isSolver = s.pos.turn === solver;
    if (opts[0].kind === 'card') expect(isSolver, `${p.id} : carte jouée par le solveur`).toBe(true);
    s = applyAction(s, opts[0])!;
    states.push(s);
  }
  return states;
}

describe('problèmes', () => {
  it('au moins 40 problèmes classiques et quelques problèmes à cartes, identifiants uniques', () => {
    const classic = PUZZLES.filter(p => !p.themes.includes('cartes'));
    expect(classic.length).toBeGreaterThanOrEqual(40);
    expect(PUZZLES.filter(p => p.themes.includes('cartes')).length).toBeGreaterThanOrEqual(4);
    expect(new Set(PUZZLES.map(p => p.id)).size).toBe(PUZZLES.length);
    for (const p of PUZZLES) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/);
      expect(validateFen(p.fen), p.id).toBeNull();
      expect(p.hint.length).toBeGreaterThan(10);
      expect(p.moral.length).toBeGreaterThan(10);
      expect(goalOf(p)).toMatch(/\.$/);
      expect(puzzleById(p.id)).toBe(p);
    }
  });

  it('chaque solution est légale, le solveur termine la ligne', () => {
    for (const p of PUZZLES) {
      const states = playLine(p);
      const last = states[states.length - 2];
      // La dernière étape est jouée par le camp qui résout
      expect(last.pos.turn, p.id).toBe(solverOf(p));
    }
  });

  it('les mats annoncés sont des mats, et le moteur les confirme', () => {
    for (const p of PUZZLES.filter(x => x.mate)) {
      const states = playLine(p);
      const end = states[states.length - 1];
      expect(end.result, p.id).toMatchObject({ reason: 'checkmate', winner: solverOf(p) });
      if (p.hands) continue; // le moteur ne joue pas les cartes : seul le mat final est vérifié
      const start = puzzleStart(p);
      const a = analyse(start, 2 * p.mate!, 60_000);
      const sign = solverOf(p) === 'w' ? 1 : -1;
      expect(a.mate, `${p.id} : mat en ${p.mate}`).toBe(p.mate! * sign);
      // Le coup clé de la solution mate aussi vite que celui du moteur
      const key = stepOptions(p.solution[0]).map(o => (o.kind === 'move' ? uciOf(o) : ''));
      if (p.mate === 1) expect(key, p.id).toContain(uciOf(a.best!));
    }
  }, 240_000);

  it('les problèmes tactiques gagnent du matériel, et le moteur trouve le coup clé', () => {
    for (const p of PUZZLES.filter(x => !x.mate && !x.hands)) {
      const states = playLine(p);
      const me = solverOf(p);
      const other = me === 'w' ? 'b' : 'w';
      const m0 = material(states[0]);
      const m1 = material(states[states.length - 1]);
      const gain = (m1[me] - m1[other]) - (m0[me] - m0[other]);
      expect(gain, `${p.id} : gain de matériel`).toBeGreaterThanOrEqual(2);
      const a = analyse(states[0], 4, 20_000);
      expect(stepOptions(p.solution[0]).map(o => (o.kind === 'move' ? uciOf(o) : '')), p.id).toContain(uciOf(a.best!));
    }
  }, 120_000);

  it('le problème « sauvetage » laisse un coup légal hors d’échec', () => {
    const p = puzzleById('carte-mur')!;
    const start = puzzleStart(p);
    expect(sideInCheck(start)).toBe(true);
    expect(legalMovesOf(start)).toHaveLength(0);
    for (const o of stepOptions(p.solution[0])) {
      const s = applyAction(start, o)!;
      expect(sideInCheck(s)).toBe(false);
      expect(legalMovesOf(s).length).toBeGreaterThan(0);
    }
  });

  it('problème du jour : déterministe, et toute la liste passe avant une répétition', () => {
    const d = new Date(2026, 9, 30, 8);
    expect(dailyPuzzle(d).id).toBe(dailyPuzzle(new Date(2026, 9, 30, 23, 59)).id);
    const seen = new Set<string>();
    for (let i = 0; i < PUZZLES.length; i++) seen.add(dailyPuzzle(new Date(2026, 0, 1 + i)).id);
    expect(seen.size).toBe(PUZZLES.length);
  });

  it('lit les étapes : coups, promotions, cartes et alternatives', () => {
    expect(parseAction('e7e8n')).toMatchObject({ kind: 'move', promo: 'n' });
    expect(parseAction('@swap:a1,d1')).toMatchObject({ kind: 'card', card: 'swap', targets: [0, 3] });
    expect(parseAction('@inconnue:a1')).toBeNull();
    expect(stepOptions('e2e4|d2d4')).toHaveLength(2);
  });
});

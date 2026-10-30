import { describe, expect, it } from 'vitest';
import { analyse } from '../src/shared/bot';
import { CARDS, CardId, cardsOf } from '../src/shared/cards';
import { Color, isCapture, sqIndex } from '../src/shared/chess';
import { GameState, cardOptions, legalMovesOf, playCard, playMove, sideInCheck } from '../src/shared/game';
import { material, uciOf, validateFen } from '../src/shared/pgn';
import {
  PUZZLES, Puzzle, PuzzleAction, applyAction, dailyPuzzle, goalOf, parseAction, puzzleById, puzzleStart, sameAction,
  solverOf, stepOptions,
} from '../src/shared/puzzles';

const cardPuzzles = PUZZLES.filter(p => p.themes.includes('cartes'));

/** Toutes les cartes jouables par `c`, avec toutes leurs cibles. */
function allCardPlays(s: GameState, c: Color): (PuzzleAction & { kind: 'card' })[] {
  const out: (PuzzleAction & { kind: 'card' })[] = [];
  s.hands[c].forEach((h, index) => {
    if (h.used) return;
    const need = CARDS[h.card].targets;
    const walk = (partial: number[]) => {
      if (partial.length === need) {
        if (playCard(s, c, index, partial, '').ok) out.push({ kind: 'card', card: h.card, targets: partial });
        return;
      }
      for (const t of cardOptions(s, c, index, partial)) walk([...partial, t]);
    };
    walk([]);
  });
  return out;
}

/** Mat en au plus `n` coups du camp `me`, selon le moteur (qui ignore les cartes encore en main). */
function mateWithin(s: GameState, me: Color, n: number): boolean {
  if (s.result) return s.result.reason === 'checkmate' && s.result.winner === me;
  if (!legalMovesOf(s).length) return false;
  const plies = s.pos.turn === me ? 2 * n - 1 : 2 * n;
  const a = analyse(s, plies + 1, 60_000);
  const sign = me === 'w' ? 1 : -1;
  return a.mate !== null && a.mate * sign > 0 && a.mate * sign <= n;
}

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
  it('au moins 40 problèmes classiques et 6 problèmes à cartes, identifiants uniques', () => {
    const classic = PUZZLES.filter(p => !p.themes.includes('cartes'));
    expect(classic.length).toBeGreaterThanOrEqual(40);
    expect(cardPuzzles.length).toBeGreaterThanOrEqual(6);
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
      if (p.hands || p.effects) continue; // problèmes à cartes : voir plus bas
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
    for (const p of PUZZLES.filter(x => !x.mate && !x.hands && !x.effects)) {
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

});

describe('problèmes à cartes', () => {
  it('seulement les huit pouvoirs, en mains de trois cartes au plus, catalogue Pouvoirs', () => {
    const allowed = cardsOf('climats');
    for (const p of cardPuzzles) {
      const s = puzzleStart(p);
      expect(s.catalog, p.id).toBe('climats');
      for (const c of ['w', 'b'] as Color[]) {
        expect(s.hands[c].length, p.id).toBeLessThanOrEqual(3);
        for (const h of s.hands[c]) expect(allowed, `${p.id} : ${h.card}`).toContain(h.card);
      }
      for (const e of p.effects ?? []) expect(allowed).toContain(e.card);
      for (const step of p.solution) for (const o of stepOptions(step)) if (o.kind === 'card') expect(allowed).toContain(o.card);
    }
    // Chaque famille est représentée, et au moins six pouvoirs différents servent
    const used = new Set<CardId>();
    for (const p of cardPuzzles) {
      for (const e of p.effects ?? []) used.add(e.card);
      for (const step of p.solution) for (const o of stepOptions(step)) if (o.kind === 'card') used.add(o.card);
    }
    expect(used.size).toBeGreaterThanOrEqual(6);
    expect(new Set([...used].map(id => CARDS[id].family))).toEqual(new Set(['climat', 'terrain', 'evenement']));
  });

  it('la carte est nécessaire et seule la solution convient (mat confirmé par le moteur)', () => {
    for (const p of cardPuzzles.filter(x => x.mate && stepOptions(x.solution[0])[0].kind === 'card')) {
      const start = puzzleStart(p);
      const me = solverOf(p);
      const n = p.mate!;
      // Sans carte : pas de mat aussi rapide
      expect(mateWithin(start, me, n), `${p.id} : mat sans carte`).toBe(false);
      // Chaque carte jouable (toutes cibles) : elle mène au mat en n si et seulement si la solution l'accepte
      const accepted = stepOptions(p.solution[0]);
      const plays = allCardPlays(start, me);
      expect(plays.length, p.id).toBeGreaterThan(0);
      for (const play of plays) {
        const after = applyAction(start, play)!;
        // Un Rituel tient lieu de coup : il reste n − 1 coups
        const works = after.pos.turn === me ? mateWithin(after, me, n) : mateWithin(after, me, n - 1);
        const isSolution = accepted.some(o => sameAction(o, play));
        expect(works, `${p.id} : @${play.card} ${play.targets.join(',')}`).toBe(isSolution);
      }
    }
  }, 240_000);

  it('un pouvoir déjà en jeu : il est nécessaire, et le moteur trouve la solution', () => {
    for (const p of cardPuzzles.filter(x => x.effects?.length)) {
      const start = puzzleStart(p);
      const me = solverOf(p);
      const bare = { ...start, effects: [] };
      expect(start.effects.length, p.id).toBe(p.effects!.length);
      // La carte du lanceur est marquée comme jouée
      for (const e of p.effects!) expect(start.hands[e.by].some(h => h.card === e.card && h.used), p.id).toBe(true);
      const key = stepOptions(p.solution[0]).map(o => (o.kind === 'move' ? uciOf(o) : ''));
      if (p.mate) {
        expect(mateWithin(start, me, p.mate), `${p.id} : mat avec le pouvoir`).toBe(true);
        expect(mateWithin(bare, me, p.mate), `${p.id} : mat sans le pouvoir`).toBe(false);
        // Le seul premier coup qui mate aussi vite
        for (const m of legalMovesOf(start)) {
          const r = playMove(start, m.from, m.to, m.promo);
          if (!r.ok) continue;
          expect(mateWithin(r.state, me, p.mate - 1) || r.state.result?.reason === 'checkmate', `${p.id} : ${uciOf(m)}`).toBe(key.includes(uciOf(m)));
        }
      } else {
        const a = analyse(start, 4, 20_000);
        expect(key, p.id).toContain(uciOf(a.best!));
        const b = analyse(bare, 4, 20_000);
        expect(key, `${p.id} : sans le pouvoir, le moteur jouerait autre chose`).not.toContain(uciOf(b.best!));
      }
    }
  }, 120_000);

  it('le Mur qui sauve : en échec sans coup, la partie continue ; le Mur rend un coup', () => {
    const p = puzzleById('carte-mur-sauve')!;
    const start = puzzleStart(p);
    expect(sideInCheck(start)).toBe(true);
    expect(legalMovesOf(start)).toHaveLength(0);
    expect(start.result).toBeNull();
    for (const o of stepOptions(p.solution[0])) {
      const s = applyAction(start, o)!;
      expect(sideInCheck(s)).toBe(false);
      expect(legalMovesOf(s).length).toBeGreaterThan(0);
      // Un Mur en g2 (2e rangée) n'est pas permis
      expect(applyAction(start, { kind: 'card', card: 'ice_wall', targets: [sqIndex('g2')] })).toBeNull();
    }
  });

  it('la Lune retournée : les deux camps doivent prendre', () => {
    const p = puzzleById('carte-lune')!;
    const start = puzzleStart(p);
    expect(legalMovesOf(start).every(isCapture)).toBe(true);
    const s = applyAction(start, stepOptions('b3d5')[0])!;
    expect(legalMovesOf(s).map(uciOf)).toEqual(['d8d5']);
  });

  it('la Déflagration : la bonne prise gagne du matériel, Dxb7 perd la dame', () => {
    const p = puzzleById('carte-deflagration')!;
    const start = puzzleStart(p);
    const gain = (s: GameState) => { const m = material(s); return m.w - m.b; };
    const good = applyAction(start, stepOptions('d1d7')[0])!;
    expect(gain(good) - gain(start)).toBeGreaterThanOrEqual(10);
    const bad = applyAction(start, stepOptions('b3b7')[0])!;
    expect(bad.pos.board[sqIndex('b7')]).toBeNull();
    expect(gain(bad) - gain(start)).toBeLessThan(0);
  });

  it('lisez sa main : le Mur noir pare Fc3+, pas Df8#', () => {
    const p = puzzleById('carte-main-visible')!;
    const start = puzzleStart(p);
    const fake = applyAction(start, stepOptions('e1c3')[0])!;
    expect(sideInCheck(fake)).toBe(true);
    expect(legalMovesOf(fake)).toHaveLength(0);
    expect(fake.result).toBeNull(); // les Noirs doivent jouer leur Mur
    expect(allCardPlays(fake, 'b').length).toBeGreaterThan(0);
    const real = applyAction(start, stepOptions('f7f8')[0])!;
    expect(real.result).toMatchObject({ reason: 'checkmate', winner: 'w' });
  });

  it('la Faille : n’importe quelle case de la rangée désigne la même Faille', () => {
    const a = parseAction('@rift:a5')!;
    expect(sameAction(a, parseAction('@rift:h5')!)).toBe(true);
    expect(sameAction(a, parseAction('@rift:a4')!)).toBe(false);
  });

});

describe('problème du jour et notation', () => {
  it('problème du jour : déterministe, et toute la liste passe avant une répétition', () => {
    const d = new Date(2026, 9, 30, 8);
    expect(dailyPuzzle(d).id).toBe(dailyPuzzle(new Date(2026, 9, 30, 23, 59)).id);
    const seen = new Set<string>();
    for (let i = 0; i < PUZZLES.length; i++) seen.add(dailyPuzzle(new Date(2026, 0, 1 + i)).id);
    expect(seen.size).toBe(PUZZLES.length);
  });

  it('lit les étapes : coups, promotions, cartes et alternatives', () => {
    expect(parseAction('e7e8n')).toMatchObject({ kind: 'move', promo: 'n' });
    expect(parseAction('@ice_wall:f3')).toMatchObject({ kind: 'card', card: 'ice_wall', targets: [21] });
    expect(parseAction('@coronation:a7')).toBeNull(); // carte retirée
    expect(parseAction('@inconnue:a1')).toBeNull();
    expect(stepOptions('e2e4|d2d4')).toHaveLength(2);
  });
});

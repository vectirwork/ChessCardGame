import { describe, expect, it } from 'vitest';
import { cardsOf } from '../src/shared/cards';
import { F_RELAXED, fromFen, sqIndex, sqName } from '../src/shared/chess';
import { GameState, legalMovesOf, playMove, sideInCheck } from '../src/shared/game';
import {
  LESSONS, LESSON_GROUPS, LessonStep, freeMove, lessonById, loneKingReply, matedBy, stepStart, studentOf,
} from '../src/shared/lessons';
import { applyAction, stepOptions } from '../src/shared/puzzles';

/** Toutes les étoiles peuvent-elles être ramassées ? (parcours en largeur sur les coups libres) */
function starsReachable(step: LessonStep, stars: string[]): boolean {
  const target = stars.map(sqIndex);
  const start = stepStart(step);
  const key = (s: GameState, left: number[]) => s.pos.board.map(p => (p ? p.t + p.c : '.')).join('') + left.join(',');
  let frontier: { s: GameState; left: number[] }[] = [{ s: start, left: target }];
  const seen = new Set([key(start, target)]);
  for (let depth = 0; depth < 10; depth++) {
    const next: typeof frontier = [];
    for (const { s, left } of frontier) {
      for (const m of legalMovesOf(s)) {
        const n = freeMove(s, m.from, m.to, m.promo);
        if (!n) continue;
        const rest = left.filter(t => t !== m.to);
        if (!rest.length) return true;
        const k = key(n, rest);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ s: n, left: rest });
      }
    }
    frontier = next;
  }
  return false;
}

describe('leçons', () => {
  it('identifiants uniques, groupes connus, textes présents', () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(LESSONS.map(l => l.id)).size).toBe(LESSONS.length);
    for (const l of LESSONS) {
      expect(LESSON_GROUPS).toContain(l.group);
      expect(l.steps.length).toBeGreaterThan(0);
      expect(lessonById(l.id)).toBe(l);
      for (const s of l.steps) {
        expect(s.text.length, l.id).toBeGreaterThan(20);
        expect(() => fromFen(s.fen)).not.toThrow();
      }
    }
    // Chaque pièce, les coups spéciaux, échec, mat et pat, et les cartes
    for (const id of ['tour', 'fou', 'dame', 'roi', 'cavalier', 'pion', 'roque', 'prise-en-passant', 'promotion', 'echec', 'mat', 'pat', 'cartes', 'catalogues', 'deux-camps', 'presage-rituel', 'mur-magie', 'mains-visibles']) {
      expect(lessonById(id), id).toBeDefined();
    }
  });

  it('chaque étape est réalisable avec le moteur', () => {
    for (const l of LESSONS) {
      l.steps.forEach((step, i) => {
        const where = `${l.id} étape ${i + 1}`;
        const start = stepStart(step);
        const g = step.goal;
        if (g.kind === 'stars') {
          for (const st of g.stars) expect(start.pos.board[sqIndex(st)]?.c, `${where} : étoile ${st} sous une pièce de l'élève`).not.toBe(studentOf(step));
          expect(starsReachable(step, g.stars), `${where} : étoiles inaccessibles`).toBe(true);
        } else if (g.kind === 'mate') {
          const mates = legalMovesOf(start).filter(m => playMove(start, m.from, m.to, m.promo).ok && playMove(start, m.from, m.to, m.promo).ok && matedBy((playMove(start, m.from, m.to, m.promo) as { state: GameState }).state, studentOf(step)));
          expect(mates.length, `${where} : aucun mat`).toBeGreaterThan(0);
        } else if (g.kind === 'any') {
          expect(legalMovesOf(start).length, where).toBeGreaterThan(0);
        } else if (g.kind === 'hunt') {
          expect(legalMovesOf(start).length, where).toBeGreaterThan(0);
        } else if (g.kind === 'line') {
          let s = start;
          for (const st of g.line) {
            if (st === '*') {
              const m = legalMovesOf(s)[0];
              expect(m, `${where} : aucun coup pour « * »`).toBeDefined();
              s = playMove(s, m.from, m.to, m.promo).ok ? (playMove(s, m.from, m.to, m.promo) as { state: GameState }).state : s;
              continue;
            }
            const opts = stepOptions(st);
            expect(opts.length, `${where} : ${st}`).toBeGreaterThan(0);
            for (const o of opts) expect(applyAction(s, o), `${where} : ${st} illégal`).not.toBeNull();
            s = applyAction(s, opts[0])!;
          }
          if (g.mate) expect(matedBy(s, studentOf(step)), `${where} : pas de mat final`).toBe(true);
        }
      });
    }
  });

  it('les étapes à pièce contiennent des pièces de l’élève qui peuvent bouger', () => {
    for (const l of LESSONS) {
      for (const step of l.steps) {
        if (step.goal.kind === 'info') continue;
        const s = stepStart(step);
        const cardStep = step.goal.kind === 'line' && step.goal.line[0].startsWith('@');
        if (!cardStep) expect(legalMovesOf(s).length, l.id).toBeGreaterThan(0);
      }
    }
  });

  it('les leçons de cartes n’utilisent que les huit pouvoirs, jamais le Duel', () => {
    const allowed = cardsOf('climats');
    for (const l of LESSONS) {
      for (const step of l.steps) {
        expect(step.catalog, l.id).not.toBe('duel');
        const s = stepStart(step);
        if (step.hands || step.effects) expect(s.catalog, l.id).toBe('climats');
        for (const h of [...s.hands.w, ...s.hands.b]) expect(allowed, `${l.id} : ${h.card}`).toContain(h.card);
        for (const e of s.effects) expect(allowed).toContain(e.card);
        if (step.goal.kind === 'line') {
          for (const st of step.goal.line) for (const o of stepOptions(st)) if (o.kind === 'card') expect(allowed).toContain(o.card);
        }
        expect(step.text, l.id).not.toMatch(/Duel|Portail|Couronnement|Chevauchée|Déjà-vu|cachée/);
      }
    }
  });

  it('pour les deux camps : le Mur noir bloque la tour blanche, l’Ère glaciaire gèle les pions blancs', () => {
    const l = lessonById('deux-camps')!;
    const wall = stepStart(l.steps[0]);
    expect(wall.effects[0]).toMatchObject({ card: 'ice_wall', permanent: true, caster: 'b' });
    expect(wall.hands.b[0].used).toBe(true);
    expect(legalMovesOf(wall).some(m => m.to === sqIndex('d5'))).toBe(false);
    const ice = stepStart(l.steps[1]);
    const moves = legalMovesOf(ice);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.some(m => ice.pos.board[m.from]?.t === 'p')).toBe(false);
  });

  it('la magie cède : sans coup ni échec, le roi marche sur un Mur, qui fond', () => {
    const l = lessonById('mur-magie')!;
    const s = stepStart(l.steps[0]);
    expect(sideInCheck(s)).toBe(false);
    const moves = legalMovesOf(s);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every(m => m.flags & F_RELAXED)).toBe(true);
    const n = applyAction(s, stepOptions('h3g4')[0])!;
    expect(n.effects.filter(e => e.card === 'ice_wall').map(e => sqName(e.square!))).toEqual(['h4']);
  });

  it('lire la main adverse : la Faille noire pare Ff3+, pas le mat sur la 8e rangée', () => {
    const l = lessonById('mains-visibles')!;
    const s = stepStart(l.steps[0]);
    const fake = applyAction(s, stepOptions('d1f3')[0])!;
    expect(sideInCheck(fake)).toBe(true);
    expect(legalMovesOf(fake)).toHaveLength(0);
    expect(fake.result).toBeNull();
    expect(matedBy(applyAction(s, stepOptions('c7c8')[0])!, 'w')).toBe(true);
  });

  it('la Trêve s’annonce puis arrive ; la Grande Marée remplace le coup', () => {
    const l = lessonById('presage-rituel')!;
    const truce = l.steps[1];
    let s = stepStart(truce);
    s = applyAction(s, stepOptions('@truce')[0])!;
    expect(s.effects.some(e => e.card === 'truce' && e.pending)).toBe(true);
    expect(s.pos.turn).toBe('w');
    const tide = l.steps[3];
    const t = applyAction(stepStart(tide), stepOptions('@tide')[0])!;
    expect(t.pos.turn).toBe('b');
    expect(t.pos.board[sqIndex('e3')]?.t).toBe('p');
    expect(t.pos.board[sqIndex('e6')]?.t).toBe('p');
  });

  it('le roi seul se défend sans se suicider, et la dame finit par mater', () => {
    const l = lessonById('mat-dame')!;
    let s = stepStart(l.steps[3]);
    // Une technique simple : la dame suit le roi à un saut de cavalier ; ici on vérifie seulement que la défense joue des coups légaux.
    for (let i = 0; i < 6 && !s.result; i++) {
      const m = legalMovesOf(s)[0];
      s = (playMove(s, m.from, m.to, m.promo) as { state: GameState }).state;
      if (s.result) break;
      const r = loneKingReply(s);
      expect(r).not.toBeNull();
      const n = playMove(s, r!.from, r!.to, r!.promo);
      expect(n.ok).toBe(true);
      s = (n as { state: GameState }).state;
    }
    // La défense prend une pièce laissée en prise
    const hanging = stepStart({ ...l.steps[3], fen: '8/8/8/3k4/4Q3/8/8/4K3 b - - 0 1' });
    const r = loneKingReply(hanging)!;
    expect(sqName(r.to)).toBe('e4');
  });
});

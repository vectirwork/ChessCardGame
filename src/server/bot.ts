// IA de Spellmate : recherche alpha-bêta avec quiescence, et usage des cartes évalué par la même recherche.

import {
  Color, F_CAPTURE, F_PROMO, Move, Mods, Position, VALUE, clonePosition, inCheck, legalMoves, makeMove,
  pseudoMoves, unmakeMove,
} from '../shared/chess';
import { CARDS, CardId } from '../shared/cards';
import {
  GameState, cardOptions, cardPlayable, legalMovesOf, modsFromEffects, playCard,
} from '../shared/game';

export type BotLevel = 1 | 2 | 3;

export const BOT_PROFILES: Record<BotLevel, { name: string; rating: number; depth: number; noise: number; cardThreshold: number; thinkMs: number }> = {
  1: { name: 'Apprenti', rating: 800, depth: 1, noise: 70, cardThreshold: 60, thinkMs: 350 },
  2: { name: 'Sorcier', rating: 1300, depth: 2, noise: 18, cardThreshold: 90, thinkMs: 700 },
  3: { name: 'Archimage', rating: 1800, depth: 5, noise: 0, cardThreshold: 70, thinkMs: 1500 },
};

// Tables de position simplifiées (point de vue blanc, a8 en premier comme on lit un diagramme).
const PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
  kEnd: [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
  ],
};

function pstIndex(sq: number, c: Color): number {
  const f = sq & 7, r = sq >> 3;
  return c === 'w' ? (7 - r) * 8 + f : r * 8 + f;
}

/** Évaluation du point de vue du camp au trait. */
function evaluate(pos: Position): number {
  let score = 0;
  let material = 0;
  for (const p of pos.board) if (p && p.t !== 'k' && p.t !== 'p') material += VALUE[p.t];
  const endgame = material <= 2600;
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (!p) continue;
    const v = VALUE[p.t] + PST[p.t === 'k' && endgame ? 'kEnd' : p.t][pstIndex(i, p.c)];
    score += p.c === 'w' ? v : -v;
  }
  return pos.turn === 'w' ? score : -score;
}

const MATE = 100000;

class Search {
  nodes = 0;
  aborted = false;
  constructor(private mods: Mods, private deadline: number) {}

  private order(pos: Position, moves: Move[]): Move[] {
    const score = (m: Move) => {
      let s = 0;
      if (m.flags & F_CAPTURE) {
        const victim = pos.board[m.to];
        s += 10 * (victim ? VALUE[victim.t] : 100) - VALUE[pos.board[m.from]!.t] / 10;
      }
      if (m.flags & F_PROMO) s += m.promo === 'q' ? 9000 : 100;
      return s;
    };
    return moves.map(m => ({ m, s: score(m) })).sort((a, b) => b.s - a.s).map(x => x.m);
  }

  private tick() {
    if ((++this.nodes & 1023) === 0 && Date.now() > this.deadline) this.aborted = true;
  }

  quiesce(pos: Position, alpha: number, beta: number, depth: number): number {
    this.tick();
    const stand = evaluate(pos);
    if (depth === 0 || this.aborted) return stand;
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    const us = pos.turn;
    const caps = this.order(pos, pseudoMoves(pos, this.mods).filter(m => m.flags & (F_CAPTURE | F_PROMO)));
    for (const m of caps) {
      const u = makeMove(pos, m);
      if (inCheck(pos, us, this.mods)) {
        unmakeMove(pos, u);
        continue;
      }
      const v = -this.quiesce(pos, -beta, -alpha, depth - 1);
      unmakeMove(pos, u);
      if (v >= beta) return beta;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  negamax(pos: Position, depth: number, alpha: number, beta: number, ply: number): number {
    this.tick();
    if (this.aborted) return 0;
    if (depth === 0) return this.quiesce(pos, alpha, beta, 4);
    const moves = legalMoves(pos, this.mods);
    if (!moves.length) return inCheck(pos, pos.turn, this.mods) ? -MATE + ply : 0;
    let best = -Infinity;
    for (const m of this.order(pos, moves)) {
      const u = makeMove(pos, m);
      const v = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1);
      unmakeMove(pos, u);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  /** Meilleurs coups à la racine (les coups racine viennent de l'état complet : effets et interdits compris). */
  /** `exact` : scores exacts pour tous les coups (utile quand on ajoute du bruit), au prix de l'élagage. */
  root(pos: Position, rootMoves: Move[], depth: number, exact = false, ordered = false): { move: Move; score: number }[] {
    const scored: { move: Move; score: number }[] = [];
    let alpha = -Infinity;
    for (const m of ordered ? rootMoves : this.order(pos, rootMoves)) {
      const u = makeMove(pos, m);
      const v = -this.negamax(pos, depth - 1, -Infinity, exact ? Infinity : -alpha, 1);
      unmakeMove(pos, u);
      if (this.aborted) break;
      scored.push({ move: m, score: v });
      if (v > alpha) alpha = v;
    }
    return scored.sort((a, b) => b.score - a.score);
  }
}

/** Score de la position pour `me` en cherchant à `depth` demi-coups. */
function scoreFor(s: GameState, me: Color, depth: number, deadline: number): number {
  if (s.result) return s.result.winner === null ? 0 : s.result.winner === me ? MATE : -MATE;
  const moves = legalMovesOf(s);
  const search = new Search(modsFromEffects(s.effects), deadline);
  const pos = clonePosition(s.pos);
  if (!moves.length) return 0;
  const best = search.root(pos, moves, depth)[0]?.score ?? 0;
  return s.pos.turn === me ? best : -best;
}

export function chooseBotMove(s: GameState, level: BotLevel): Move | null {
  const profile = BOT_PROFILES[level];
  let rootMoves = legalMovesOf(s);
  if (!rootMoves.length) return null;
  const deadline = Date.now() + profile.thinkMs;
  const mods = modsFromEffects(s.effects);
  let best: { move: Move; score: number }[] = [];
  for (let d = 1; d <= profile.depth; d++) {
    const search = new Search(mods, deadline);
    const res = search.root(clonePosition(s.pos), rootMoves, d, profile.noise > 0, d > 1);
    if (search.aborted && best.length) break;
    if (res.length) best = res;
    if (search.aborted) break;
    // Meilleurs coups d'abord à l'itération suivante : l'élagage est bien plus efficace.
    rootMoves = res.map(x => x.move);
    if (Math.abs(res[0].score) > MATE - 100) break;
  }
  if (!best.length) return rootMoves[Math.floor(Math.random() * rootMoves.length)];
  if (profile.noise > 0) {
    const noisy = best.map(x => ({ ...x, score: x.score + (Math.random() * 2 - 1) * profile.noise }));
    noisy.sort((a, b) => b.score - a.score);
    return noisy[0].move;
  }
  return best[0].move;
}

/** Choisit éventuellement une carte à jouer avant le coup. */
export function chooseBotCard(s: GameState, level: BotLevel): { index: number; targets: number[] } | null {
  const me = s.pos.turn;
  const profile = BOT_PROFILES[level];
  const playable = s.hands[me].map((_, i) => i).filter(i => cardPlayable(s, me, i));
  if (!playable.length) return null;
  const mustPlay = legalMovesOf(s).length === 0;
  // L'Apprenti joue ses cartes un peu au hasard, mais pas dès l'ouverture.
  if (level === 1 && !mustPlay) {
    if (s.ply < 8 || Math.random() > 0.22) return null;
    const index = playable[Math.floor(Math.random() * playable.length)];
    return { index, targets: randomTargets(s, me, index) };
  }
  const depth = Math.min(profile.depth, 2);
  const deadline = Date.now() + profile.thinkMs;
  const baseline = mustPlay ? -MATE : scoreFor(s, me, depth, deadline);
  let best: { index: number; targets: number[]; score: number } | null = null;
  for (const index of playable) {
    const card = s.hands[me][index].card as CardId;
    if (card === 'time_warp') {
      if (mustPlay || (s.ply >= 24 && Math.random() < 0.25)) return { index, targets: [] };
      continue;
    }
    for (const targets of candidateTargets(s, me, index).slice(0, 24)) {
      const r = playCard(s, me, index, targets, '');
      if (!r.ok) continue;
      const v = scoreFor(r.state, me, depth, deadline + 400);
      if (!best || v > best.score) best = { index, targets, score: v };
    }
  }
  if (!best) return null;
  // Une carte est une ressource : on la garde en ouverture, sauf gain net.
  const keep = profile.cardThreshold + Math.max(0, 30 - s.ply) * 6;
  if (mustPlay || best.score - baseline >= keep) return { index: best.index, targets: best.targets };
  return null;
}

function candidateTargets(s: GameState, me: Color, index: number): number[][] {
  const need = CARDS[s.hands[me][index].card as CardId].targets;
  if (need === 0) return [[]];
  const first = cardOptions(s, me, index);
  if (need === 1) return first.map(t => [t]);
  const out: number[][] = [];
  for (const a of first) for (const b of cardOptions(s, me, index, [a])) if (a < b) out.push([a, b]);
  return out;
}

function randomTargets(s: GameState, me: Color, index: number): number[] {
  const all = candidateTargets(s, me, index);
  return all[Math.floor(Math.random() * all.length)] ?? [];
}

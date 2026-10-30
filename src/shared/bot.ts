// IA de Spellmate : recherche alpha-bêta avec quiescence, et usage des cartes évalué par la même recherche.
// Partagée entre le serveur (threads IA) et le navigateur (partie contre l'IA sur l'accueil, page Analyse).

import {
  Color, F_CAPTURE, F_PROMO, Move, Mods, NO_MODS, Position, VALUE, applyMustCapture, clonePosition, fileOf, inCheck,
  isSlider, kingSquare, legalMoves, makeMove, opposite, pseudoMoves, rankOf, slideDirs, unmakeMove,
} from './chess';
import { CARDS, CardId } from './cards';
import {
  GameState, cardOptions, cardPlayable, legalMovesOf, magicYields, modsSequence, playCard,
} from './game';

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
/** Longueur de la suite de modificateurs précalculée (au-delà, les derniers servent). */
const MODS_PLIES = 32;

/**
 * Règles vues par la recherche : modificateurs coup par coup depuis la racine (`mods[k]` régit le k-ième
 * demi-coup, `mods[k + 1]` juge la sécurité du roi après ce coup), et « la magie cède » (Climats).
 * Sans cela, l'IA croirait qu'une Chevauchée ou une Trêve dure toute sa recherche, ou qu'un Climat annoncé
 * n'arrivera jamais.
 */
interface SearchRules {
  mods: Mods[];
  relax: boolean;
}

function rulesOf(s: GameState): SearchRules {
  return { mods: modsSequence(s, MODS_PLIES), relax: magicYields(s) };
}

class Search {
  nodes = 0;
  aborted = false;
  /** Variantes principales par profondeur (tableau triangulaire). */
  pv: Move[][] = [];
  constructor(private rules: SearchRules, private deadline: number) {}

  private modsAt(ply: number): Mods {
    const m = this.rules.mods;
    return m[Math.min(ply, m.length - 1)];
  }

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

  /**
   * Recherche des captures. Trêve : hors échec, aucune capture (seule l'immobilité compte).
   * Lune de sang : si une capture légale existe, pas d'immobilité (stand pat) : le camp doit prendre. Et si
   * c'est l'adversaire qui devra prendre au coup suivant, l'immobilité le laisse face à ses captures
   * obligatoires : on les cherche (coup nul) au lieu de s'arrêter sur l'évaluation statique. Sans cela, l'IA
   * ne voit pas l'appât qu'on lui tend : un pion offert, puis un coup d'attente, et sa capture forcée perd une
   * pièce.
   */
  quiesce(pos: Position, alpha: number, beta: number, depth: number, ply: number): number {
    this.tick();
    const now = this.modsAt(ply);
    const after = this.modsAt(ply + 1);
    const us = pos.turn;
    const stand = evaluate(pos);
    if (depth === 0 || this.aborted) return stand;
    let moves = pseudoMoves(pos, now, after).filter(m => m.flags & (F_CAPTURE | F_PROMO));
    if (now.truce && !inCheck(pos, us, after)) moves = moves.filter(m => !(m.flags & F_CAPTURE));
    const forced = now.mustCapture && moves.some(m => m.flags & F_CAPTURE && this.isLegal(pos, m, after));
    if (forced) moves = moves.filter(m => m.flags & F_CAPTURE);
    else {
      const idle = after.mustCapture && depth > 1 ? this.pass(pos, alpha, beta, depth, ply) : stand;
      if (idle >= beta) return beta;
      if (idle > alpha) alpha = idle;
    }
    let best = forced ? -Infinity : alpha;
    for (const m of this.order(pos, moves)) {
      const u = makeMove(pos, m);
      if (inCheck(pos, us, after)) {
        unmakeMove(pos, u);
        continue;
      }
      const v = -this.quiesce(pos, -beta, -Math.max(alpha, best), depth - 1, ply + 1);
      unmakeMove(pos, u);
      if (v >= beta) return beta;
      if (v > best) best = v;
    }
    return best;
  }

  /** Coup nul (le camp au trait « attend ») : valeur des captures de l'adversaire, vue du camp au trait. */
  private pass(pos: Position, alpha: number, beta: number, depth: number, ply: number): number {
    const ep = pos.ep;
    pos.turn = opposite(pos.turn);
    pos.ep = -1;
    const v = -this.quiesce(pos, -beta, -alpha, depth - 1, ply + 1);
    pos.turn = opposite(pos.turn);
    pos.ep = ep;
    return v;
  }

  private isLegal(pos: Position, m: Move, after: Mods): boolean {
    const us = pos.turn;
    const u = makeMove(pos, m);
    const ok = !inCheck(pos, us, after);
    unmakeMove(pos, u);
    return ok;
  }

  /** Coups d'un nœud : effets du coup, capture obligatoire, puis « la magie cède » (sauf en échec). */
  private nodeMoves(pos: Position, ply: number): { moves: Move[]; check: boolean } {
    const now = this.modsAt(ply);
    const after = this.modsAt(ply + 1);
    let moves = legalMoves(pos, now, after);
    if (now.mustCapture) moves = applyMustCapture(moves);
    if (moves.length) return { moves, check: false };
    const check = inCheck(pos, pos.turn, after);
    if (!check && this.rules.relax && (now !== NO_MODS)) moves = legalMoves(pos, NO_MODS, after);
    return { moves, check };
  }

  negamax(pos: Position, depth: number, alpha: number, beta: number, ply: number): number {
    this.tick();
    if (this.aborted) return 0;
    this.pv[ply] = [];
    if (depth === 0) return this.quiesce(pos, alpha, beta, 4, ply);
    const { moves, check } = this.nodeMoves(pos, ply);
    if (!moves.length) return check ? -MATE + ply : 0;
    let best = -Infinity;
    for (const m of this.order(pos, moves)) {
      const u = makeMove(pos, m);
      const v = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1);
      unmakeMove(pos, u);
      if (v > best) best = v;
      if (v > alpha) {
        alpha = v;
        this.pv[ply] = [m, ...(this.pv[ply + 1] ?? [])];
      }
      if (alpha >= beta) break;
    }
    return best;
  }

  /** Meilleurs coups à la racine (les coups racine viennent de l'état complet : effets et interdits compris). */
  /** `exact` : scores exacts pour tous les coups (utile quand on ajoute du bruit), au prix de l'élagage. */
  root(pos: Position, rootMoves: Move[], depth: number, exact = false, ordered = false): { move: Move; score: number; pv: Move[] }[] {
    const scored: { move: Move; score: number; pv: Move[] }[] = [];
    let alpha = -Infinity;
    for (const m of ordered ? rootMoves : this.order(pos, rootMoves)) {
      const u = makeMove(pos, m);
      const v = -this.negamax(pos, depth - 1, -Infinity, exact ? Infinity : -alpha, 1);
      unmakeMove(pos, u);
      if (this.aborted) break;
      scored.push({ move: m, score: v, pv: [m, ...(this.pv[1] ?? [])] });
      if (v > alpha) alpha = v;
    }
    return scored.sort((a, b) => b.score - a.score);
  }
}

/**
 * Score de la position pour `me` en cherchant à `depth` demi-coups ; null si le temps manque (une recherche
 * interrompue n'est pas comparable aux autres).
 */
function scoreFor(s: GameState, me: Color, depth: number, deadline: number): number | null {
  if (s.result) return s.result.winner === null ? 0 : s.result.winner === me ? MATE : -MATE;
  const moves = legalMovesOf(s);
  // Aucun coup mais la partie continue : une carte doit être jouée (R4c). On s'en tient à l'évaluation statique.
  if (!moves.length) return s.pos.turn === me ? evaluate(s.pos) : -evaluate(s.pos);
  const search = new Search(rulesOf(s), deadline);
  const res = search.root(clonePosition(s.pos), moves, Math.max(1, depth));
  if (search.aborted || !res.length) return null;
  return s.pos.turn === me ? res[0].score : -res[0].score;
}

export function chooseBotMove(s: GameState, level: BotLevel): Move | null {
  const profile = BOT_PROFILES[level];
  let rootMoves = legalMovesOf(s);
  if (!rootMoves.length) return null;
  const deadline = Date.now() + profile.thinkMs;
  const rules = rulesOf(s);
  let best: { move: Move; score: number }[] = [];
  for (let d = 1; d <= profile.depth; d++) {
    const search = new Search(rules, deadline);
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

/**
 * Choisit éventuellement une carte à jouer avant le coup.
 * Méthode : jouer la carte, puis chercher, et comparer avec la même recherche sans carte. La profondeur
 * suit la carte : un Présage n'arrive qu'après deux coups, on cherche donc un coup plus loin pour le voir agir
 * (et la ligne de base aussi, pour comparer à horizon égal) ; un Rituel remplace le coup, on cherche un coup de
 * moins. Tout tient dans le budget de temps du niveau : une recherche interrompue est écartée.
 */
export function chooseBotCard(s: GameState, level: BotLevel): { index: number; targets: number[] } | null {
  const me = s.pos.turn;
  const profile = BOT_PROFILES[level];
  const deadline = Date.now() + profile.thinkMs;
  // L'IA ne joue jamais le Sablier fou (carte réservée aux parties entre humains).
  const playable = s.hands[me].map((_, i) => i).filter(i => {
    const card = s.hands[me][i].card;
    return !!card && !CARDS[card].humanOnly && cardPlayable(s, me, i);
  });
  if (!playable.length) return null;
  const mustPlay = legalMovesOf(s).length === 0;
  // L'Apprenti joue ses cartes un peu au hasard, mais pas dès l'ouverture.
  if (level === 1 && !mustPlay) {
    if (s.ply < 8 || Math.random() > 0.22) return null;
    const index = playable[Math.floor(Math.random() * playable.length)];
    return { index, targets: randomTargets(s, me, index) };
  }
  const base = Math.min(profile.depth, 2);
  const depthFor = (card: CardId) => (CARDS[card].presage ? base + 1 : CARDS[card].ritual ? base - 1 : base);
  // Lignes de base, une par horizon (calculées à la demande).
  const baselines = new Map<number, number | null>();
  const baseline = (card: CardId) => {
    const d = CARDS[card].ritual ? base : depthFor(card);
    if (!baselines.has(d)) baselines.set(d, mustPlay ? -MATE : scoreFor(s, me, d, deadline));
    return baselines.get(d)!;
  };
  // Candidats : chaque carte avec ses meilleures cibles, entrelacés pour que toutes les cartes soient essayées
  // avant que le temps ne manque.
  const perCard: { index: number; targets: number[] }[][] = [];
  for (const index of playable) {
    const card = s.hands[me][index].card as CardId;
    if (card === 'time_warp') {
      // Duel : l'effet porte sur la pendule, que la recherche ne voit pas.
      if (mustPlay || (s.ply >= 24 && Math.random() < 0.25)) return { index, targets: [] };
      continue;
    }
    perCard.push(candidateTargets(s, me, index).slice(0, level === 3 ? 16 : 10).map(targets => ({ index, targets })));
  }
  const queue: { index: number; targets: number[] }[] = [];
  for (let k = 0; perCard.some(l => k < l.length); k++) for (const l of perCard) if (k < l.length) queue.push(l[k]);
  let best: { index: number; targets: number[]; gain: number } | null = null;
  for (const c of queue) {
    if (Date.now() > deadline) break;
    const card = s.hands[me][c.index].card as CardId;
    const ref = baseline(card);
    if (ref === null) continue;
    const r = playCard(s, me, c.index, c.targets, '');
    if (!r.ok) continue;
    const v = scoreFor(r.state, me, depthFor(card), deadline);
    if (v === null) continue;
    const gain = v - ref + cardBias(s, me, card);
    if (!best || gain > best.gain) best = { index: c.index, targets: c.targets, gain };
  }
  if (!best) {
    // Sans coup légal, une carte doit être jouée (R4c), même si le temps a manqué pour les comparer.
    if (!mustPlay) return null;
    return { index: playable[0], targets: candidateTargets(s, me, playable[0])[0] ?? [] };
  }
  // Une carte est une ressource : on la garde en ouverture, sauf gain net.
  const keep = profile.cardThreshold + Math.max(0, 30 - s.ply) * 6;
  if (mustPlay || best.gain >= keep) return { index: best.index, targets: best.targets };
  return null;
}

/**
 * Petites corrections de jugement que la recherche, à faible profondeur, ne voit pas.
 * - Un Climat annoncé remplacera le nôtre s'il est actif : la recherche le voit, mais on évite de gaspiller
 *   une carte pour chasser son propre Climat.
 * - Le Déjà-vu ne sert qu'à réparer : il faut un vrai gain (la recherche le mesure), on exige un peu plus.
 */
function cardBias(before: GameState, me: Color, card: CardId): number {
  let bias = 0;
  if (CARDS[card].family === 'climat' && before.effects.some(e => !e.pending && e.caster === me && CARDS[e.card].family === 'climat')) {
    bias -= 60;
  }
  if (card === 'deja_vu') bias -= 40;
  return bias;
}

/** Cibles candidates d'une carte, les plus prometteuses d'abord (une par résultat distinct). */
function candidateTargets(s: GameState, me: Color, index: number): number[][] {
  const card = s.hands[me][index].card as CardId;
  const need = CARDS[card].targets;
  if (need === 0) return [[]];
  const first = cardOptions(s, me, index);
  if (need === 1) {
    if (card === 'rift') {
      // La cible désigne une rangée : une seule case par rangée.
      const ranks = new Set<number>();
      return first.filter(t => !ranks.has(t >> 3) && ranks.add(t >> 3)).map(t => [t]);
    }
    if (card === 'portals') return first.filter(t => t < 63 - t || !first.includes(63 - t)).map(t => [t]);
    if (card === 'ice_wall') return rankWallSquares(s, me, first).map(t => [t]);
    return first.map(t => [t]);
  }
  const out: number[][] = [];
  for (const a of first) for (const b of cardOptions(s, me, index, [a])) if (a < b) out.push([a, b]);
  return out;
}

/**
 * Mur de glace : d'abord les cases qui coupent une ligne d'une pièce adverse vers notre roi, puis celles qui
 * touchent le roi adverse (cases de fuite), puis les cases centrales.
 */
function rankWallSquares(s: GameState, me: Color, squares: number[]): number[] {
  const b = s.pos.board;
  const score = new Map<number, number>(squares.map(q => [q, 0]));
  const myKing = kingSquare(s.pos, me);
  const theirKing = kingSquare(s.pos, opposite(me));
  const bump = (q: number, v: number) => { if (score.has(q)) score.set(q, score.get(q)! + v); };
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || p.c === me || !isSlider(p.t)) continue;
    for (const [df, dr] of slideDirs(p.t)) {
      const path: number[] = [];
      let f = fileOf(i) + df, r = rankOf(i) + dr;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const q = r * 8 + f;
        if (q === myKing) { for (const x of path) bump(x, 30); break; }
        if (b[q]) break;
        path.push(q);
        f += df; r += dr;
      }
    }
  }
  for (const q of squares) {
    if (theirKing >= 0 && Math.max(Math.abs(fileOf(q) - fileOf(theirKing)), Math.abs(rankOf(q) - rankOf(theirKing))) === 1) bump(q, 20);
    bump(q, 6 - Math.abs(3.5 - fileOf(q)) - Math.abs(3.5 - rankOf(q)));
  }
  return squares.slice().sort((x, y) => score.get(y)! - score.get(x)!);
}

function randomTargets(s: GameState, me: Color, index: number): number[] {
  const all = candidateTargets(s, me, index);
  return all[Math.floor(Math.random() * all.length)] ?? [];
}

// ---------------------------------------------------------------------------------------------
// Analyse (page Analyse, relecture des parties)

export interface Analysis {
  depth: number;
  /** Évaluation en centipions du point de vue des Blancs. */
  scoreWhite: number;
  /** Mat en N coups (positif : les Blancs matent), sinon null. */
  mate: number | null;
  best: Move | null;
  /** Meilleure suite, en coups (le premier est `best`). */
  pv: Move[];
  nodes: number;
}

/**
 * Analyse par approfondissement itératif jusqu'à `maxDepth` ou `timeMs`.
 * `onDepth` est appelé après chaque profondeur terminée (affichage progressif).
 * Les effets de cartes sont pris en compte coup par coup (expirations, arrivées des Présages).
 */
export function analyse(s: GameState, maxDepth = 6, timeMs = 3000, onDepth?: (a: Analysis) => void): Analysis {
  const sign = s.pos.turn === 'w' ? 1 : -1;
  const empty: Analysis = { depth: 0, scoreWhite: 0, mate: null, best: null, pv: [], nodes: 0 };
  if (s.result) {
    const w = s.result.winner;
    return { ...empty, scoreWhite: w === 'w' ? MATE : w === 'b' ? -MATE : 0 };
  }
  let rootMoves = legalMovesOf(s);
  if (!rootMoves.length) return empty;
  const deadline = Date.now() + timeMs;
  const rules = rulesOf(s);
  let last = empty;
  let nodes = 0;
  for (let depth = 1; depth <= maxDepth; depth++) {
    const search = new Search(rules, deadline);
    const res = search.root(clonePosition(s.pos), rootMoves, depth, false, depth > 1);
    nodes += search.nodes;
    if (!res.length || (search.aborted && last.best)) break;
    const top = res[0];
    const mateIn = Math.abs(top.score) > MATE - 1000 ? Math.ceil((MATE - Math.abs(top.score)) / 2) * Math.sign(top.score) * sign : null;
    last = { depth, scoreWhite: top.score * sign, mate: mateIn, best: top.move, pv: top.pv, nodes };
    onDepth?.(last);
    if (search.aborted || mateIn !== null) break;
    rootMoves = res.map(x => x.move);
  }
  return last;
}

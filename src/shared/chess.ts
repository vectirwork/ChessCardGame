// Moteur d'échecs de Spellmate.
// Règles complètes (roque, prise en passant, promotion) et modificateurs de cartes :
// cases bloquées, pièces gelées ou protégées, portée réduite, saut et passe-muraille.
// Cases : index = rangée * 8 + colonne, a1 = 0, h1 = 7, a8 = 56, h8 = 63.

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  id: number;
  t: PieceType;
  c: Color;
}

export interface Position {
  board: (Piece | null)[];
  turn: Color;
  /** Bits : 1 = petit roque blanc, 2 = grand roque blanc, 4 = petit roque noir, 8 = grand roque noir. */
  castling: number;
  /** Case de prise en passant, -1 si aucune. */
  ep: number;
  halfmove: number;
  fullmove: number;
}

export const F_CAPTURE = 1;
export const F_EP = 2;
export const F_DOUBLE = 4;
export const F_CASTLE_K = 8;
export const F_CASTLE_Q = 16;
export const F_PROMO = 32;
export const F_LEAP = 64;
export const F_PHASE = 128;

export interface Move {
  from: number;
  to: number;
  flags: number;
  promo?: PieceType;
}

/** Modificateurs actifs, calculés à partir des effets de cartes. */
export interface Mods {
  blocked: boolean[];
  frozen: Set<number>;
  shielded: Set<number>;
  range: Record<Color, number>;
  leap: Set<number>;
  phase: Set<number>;
}

export const NO_MODS: Mods = {
  blocked: new Array(64).fill(false),
  frozen: new Set(),
  shielded: new Set(),
  range: { w: 7, b: 7 },
  leap: new Set(),
  phase: new Set(),
};

export const opposite = (c: Color): Color => (c === 'w' ? 'b' : 'w');
export const fileOf = (sq: number) => sq & 7;
export const rankOf = (sq: number) => sq >> 3;
export const sq = (file: number, rank: number) => rank * 8 + file;
export const onBoard = (file: number, rank: number) => file >= 0 && file < 8 && rank >= 0 && rank < 8;
export const sqName = (i: number) => 'abcdefgh'[i & 7] + String((i >> 3) + 1);
export function sqIndex(name: string): number {
  if (!/^[a-h][1-8]$/.test(name)) return -1;
  return (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);
}
export const isLightSquare = (i: number) => ((i & 7) + (i >> 3)) % 2 === 1;

export const VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

const KNIGHT: [number, number][] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const QUEEN_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS];

export function slideDirs(t: PieceType): [number, number][] {
  return t === 'r' ? ROOK_DIRS : t === 'b' ? BISHOP_DIRS : t === 'q' ? QUEEN_DIRS : [];
}
export const isSlider = (t: PieceType) => t === 'r' || t === 'b' || t === 'q';

export function initialPosition(nextId = 1): { pos: Position; nextId: number } {
  const board: (Piece | null)[] = new Array(64).fill(null);
  const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  let id = nextId;
  for (let f = 0; f < 8; f++) {
    board[sq(f, 0)] = { id: id++, t: back[f], c: 'w' };
    board[sq(f, 1)] = { id: id++, t: 'p', c: 'w' };
  }
  for (let f = 0; f < 8; f++) {
    board[sq(f, 6)] = { id: id++, t: 'p', c: 'b' };
    board[sq(f, 7)] = { id: id++, t: back[f], c: 'b' };
  }
  return { pos: { board, turn: 'w', castling: 15, ep: -1, halfmove: 0, fullmove: 1 }, nextId: id };
}

export function clonePosition(p: Position): Position {
  return { ...p, board: p.board.slice() };
}

export function kingSquare(pos: Position, c: Color): number {
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (p && p.t === 'k' && p.c === c) return i;
  }
  return -1;
}

/** La case `target` est-elle attaquée par une pièce de couleur `by` ? */
export function isAttacked(pos: Position, target: number, by: Color, mods: Mods): boolean {
  const b = pos.board;
  const tf = fileOf(target);
  const tr = rankOf(target);
  // Pions
  const pr = by === 'w' ? tr - 1 : tr + 1;
  for (const df of [-1, 1]) {
    const f = tf + df;
    if (onBoard(f, pr)) {
      const p = b[sq(f, pr)];
      if (p && p.c === by && p.t === 'p' && !mods.frozen.has(p.id)) return true;
    }
  }
  // Cavaliers
  for (const [df, dr] of KNIGHT) {
    const f = tf + df, r = tr + dr;
    if (!onBoard(f, r)) continue;
    const p = b[sq(f, r)];
    if (p && p.c === by && p.t === 'n' && !mods.frozen.has(p.id)) return true;
  }
  // Roi
  for (const [df, dr] of KING) {
    const f = tf + df, r = tr + dr;
    if (!onBoard(f, r)) continue;
    const p = b[sq(f, r)];
    if (p && p.c === by && p.t === 'k') return true;
  }
  // Pièces à longue portée : on remonte chaque rayon depuis la cible
  const range = mods.range[by];
  for (const [df, dr] of QUEEN_DIRS) {
    const diag = df !== 0 && dr !== 0;
    let f = tf + df, r = tr + dr, dist = 1;
    while (onBoard(f, r) && dist <= range) {
      const s = sq(f, r);
      if (mods.blocked[s]) break;
      const p = b[s];
      if (p) {
        if (p.c === by && !mods.frozen.has(p.id) && (p.t === 'q' || (diag ? p.t === 'b' : p.t === 'r'))) return true;
        break;
      }
      f += df; r += dr; dist++;
    }
  }
  return false;
}

export function inCheck(pos: Position, c: Color, mods: Mods): boolean {
  const k = kingSquare(pos, c);
  return k >= 0 && isAttacked(pos, k, opposite(c), mods);
}

function canCapture(target: Piece | null, mover: Color, mods: Mods): boolean {
  return !!target && target.c !== mover && target.t !== 'k' && !mods.shielded.has(target.id);
}

function pushPawnMove(out: Move[], from: number, to: number, flags: number, lastRank: boolean) {
  if (lastRank) {
    for (const promo of ['q', 'r', 'b', 'n'] as PieceType[]) out.push({ from, to, flags: flags | F_PROMO, promo });
  } else {
    out.push({ from, to, flags });
  }
}

/** Coups pseudo-légaux du camp au trait (sans vérifier que le roi reste à l'abri). */
export function pseudoMoves(pos: Position, mods: Mods): Move[] {
  const out: Move[] = [];
  const b = pos.board;
  const us = pos.turn;
  const them = opposite(us);
  for (let from = 0; from < 64; from++) {
    const p = b[from];
    if (!p || p.c !== us || mods.frozen.has(p.id)) continue;
    const ff = fileOf(from), fr = rankOf(from);
    switch (p.t) {
      case 'p': {
        const dir = us === 'w' ? 1 : -1;
        const start = us === 'w' ? 1 : 6;
        const last = us === 'w' ? 7 : 0;
        const r1 = fr + dir;
        if (r1 < 0 || r1 > 7) break;
        const one = sq(ff, r1);
        if (!b[one] && !mods.blocked[one]) {
          pushPawnMove(out, from, one, 0, r1 === last);
          if (fr === start) {
            const two = sq(ff, fr + 2 * dir);
            if (!b[two] && !mods.blocked[two]) out.push({ from, to: two, flags: F_DOUBLE });
          }
        }
        for (const df of [-1, 1]) {
          const f = ff + df;
          if (f < 0 || f > 7) continue;
          const to = sq(f, r1);
          if (mods.blocked[to]) continue;
          if (canCapture(b[to], us, mods)) pushPawnMove(out, from, to, F_CAPTURE, r1 === last);
          else if (to === pos.ep && !b[to]) {
            const victim = b[sq(f, fr)];
            if (victim && victim.t === 'p' && victim.c === them && !mods.shielded.has(victim.id)) {
              out.push({ from, to, flags: F_CAPTURE | F_EP });
            }
          }
        }
        break;
      }
      case 'n':
        jumpMoves(pos, mods, from, KNIGHT, out, 0);
        break;
      case 'k':
        jumpMoves(pos, mods, from, KING, out, 0);
        castleMoves(pos, mods, from, out);
        break;
      default: {
        if (mods.phase.has(p.id)) phaseMoves(pos, mods, from, out);
        else slideMoves(pos, mods, from, out);
        if (mods.leap.has(p.id)) jumpMoves(pos, mods, from, KNIGHT, out, F_LEAP);
      }
    }
  }
  return out;
}

function jumpMoves(pos: Position, mods: Mods, from: number, deltas: [number, number][], out: Move[], extra: number) {
  const us = pos.turn;
  const ff = fileOf(from), fr = rankOf(from);
  for (const [df, dr] of deltas) {
    const f = ff + df, r = fr + dr;
    if (!onBoard(f, r)) continue;
    const to = sq(f, r);
    if (mods.blocked[to]) continue;
    const t = pos.board[to];
    if (!t) out.push({ from, to, flags: extra });
    else if (canCapture(t, us, mods)) out.push({ from, to, flags: F_CAPTURE | extra });
  }
}

function slideMoves(pos: Position, mods: Mods, from: number, out: Move[]) {
  const p = pos.board[from]!;
  const range = mods.range[p.c];
  const ff = fileOf(from), fr = rankOf(from);
  for (const [df, dr] of slideDirs(p.t)) {
    let f = ff + df, r = fr + dr, dist = 1;
    while (onBoard(f, r) && dist <= range) {
      const to = sq(f, r);
      if (mods.blocked[to]) break;
      const t = pos.board[to];
      if (!t) out.push({ from, to, flags: 0 });
      else {
        if (canCapture(t, p.c, mods)) out.push({ from, to, flags: F_CAPTURE });
        break;
      }
      f += df; r += dr; dist++;
    }
  }
}

/** Passe-muraille : la pièce traverse ses propres pièces ; une pièce adverse ou un mur de glace l'arrête. */
function phaseMoves(pos: Position, mods: Mods, from: number, out: Move[]) {
  const p = pos.board[from]!;
  const range = mods.range[p.c];
  const ff = fileOf(from), fr = rankOf(from);
  for (const [df, dr] of slideDirs(p.t)) {
    let f = ff + df, r = fr + dr, dist = 1, passed = false;
    while (onBoard(f, r) && dist <= range) {
      const to = sq(f, r);
      if (mods.blocked[to]) break;
      const t = pos.board[to];
      const flag = passed ? F_PHASE : 0;
      if (!t) out.push({ from, to, flags: flag });
      else if (t.c === p.c) passed = true;
      else {
        if (canCapture(t, p.c, mods)) out.push({ from, to, flags: F_CAPTURE | flag });
        break;
      }
      f += df; r += dr; dist++;
    }
  }
}

function castleMoves(pos: Position, mods: Mods, from: number, out: Move[]) {
  const us = pos.turn;
  const them = opposite(us);
  const home = us === 'w' ? 4 : 60;
  if (from !== home) return;
  const kBit = us === 'w' ? 1 : 4;
  const qBit = us === 'w' ? 2 : 8;
  if (!(pos.castling & (kBit | qBit))) return;
  if (isAttacked(pos, home, them, mods)) return;
  const b = pos.board;
  const rookOk = (s: number) => {
    const r = b[s];
    return !!r && r.t === 'r' && r.c === us && !mods.frozen.has(r.id);
  };
  const free = (s: number) => !b[s] && !mods.blocked[s];
  if (pos.castling & kBit && rookOk(home + 3) && free(home + 1) && free(home + 2) &&
      !isAttacked(pos, home + 1, them, mods) && !isAttacked(pos, home + 2, them, mods)) {
    out.push({ from: home, to: home + 2, flags: F_CASTLE_K });
  }
  if (pos.castling & qBit && rookOk(home - 4) && free(home - 1) && free(home - 2) && free(home - 3) &&
      !isAttacked(pos, home - 1, them, mods) && !isAttacked(pos, home - 2, them, mods)) {
    out.push({ from: home, to: home - 2, flags: F_CASTLE_Q });
  }
}

export interface Undo {
  move: Move;
  moved: Piece;
  captured: Piece | null;
  capturedSq: number;
  castling: number;
  ep: number;
  halfmove: number;
  fullmove: number;
}

const ROOK_HOME_BITS: Record<number, number> = { 7: 1, 0: 2, 63: 4, 56: 8 };

/** Joue le coup sur la position (mutation) et renvoie de quoi l'annuler. */
export function makeMove(pos: Position, m: Move): Undo {
  const b = pos.board;
  const moved = b[m.from]!;
  const undo: Undo = {
    move: m, moved, captured: null, capturedSq: -1,
    castling: pos.castling, ep: pos.ep, halfmove: pos.halfmove, fullmove: pos.fullmove,
  };
  let capSq = m.to;
  if (m.flags & F_EP) capSq = m.to + (moved.c === 'w' ? -8 : 8);
  if (m.flags & F_CAPTURE) {
    undo.captured = b[capSq];
    undo.capturedSq = capSq;
    b[capSq] = null;
  }
  b[m.from] = null;
  b[m.to] = m.promo ? { id: moved.id, t: m.promo, c: moved.c } : moved;
  if (m.flags & F_CASTLE_K) {
    b[m.to - 1] = b[m.to + 1];
    b[m.to + 1] = null;
  } else if (m.flags & F_CASTLE_Q) {
    b[m.to + 1] = b[m.to - 2];
    b[m.to - 2] = null;
  }
  if (moved.t === 'k') pos.castling &= moved.c === 'w' ? ~3 : ~12;
  if (ROOK_HOME_BITS[m.from] !== undefined) pos.castling &= ~ROOK_HOME_BITS[m.from];
  if (ROOK_HOME_BITS[m.to] !== undefined) pos.castling &= ~ROOK_HOME_BITS[m.to];
  pos.ep = m.flags & F_DOUBLE ? (m.from + m.to) / 2 : -1;
  pos.halfmove = moved.t === 'p' || m.flags & F_CAPTURE ? 0 : pos.halfmove + 1;
  if (pos.turn === 'b') pos.fullmove++;
  pos.turn = opposite(pos.turn);
  return undo;
}

export function unmakeMove(pos: Position, u: Undo) {
  const b = pos.board;
  const m = u.move;
  if (m.flags & F_CASTLE_K) {
    b[m.to + 1] = b[m.to - 1];
    b[m.to - 1] = null;
  } else if (m.flags & F_CASTLE_Q) {
    b[m.to - 2] = b[m.to + 1];
    b[m.to + 1] = null;
  }
  b[m.from] = u.moved;
  b[m.to] = null;
  if (u.captured) b[u.capturedSq] = u.captured;
  pos.castling = u.castling;
  pos.ep = u.ep;
  pos.halfmove = u.halfmove;
  pos.fullmove = u.fullmove;
  pos.turn = opposite(pos.turn);
}

/**
 * Coups légaux du camp au trait.
 * `modsNow` régit le déplacement ; `modsAfter` (effets après décompte du coup joué) sert à vérifier
 * que le roi du joueur n'est pas attaqué une fois le coup joué et les effets expirés retirés.
 */
export function legalMoves(pos: Position, modsNow: Mods = NO_MODS, modsAfter: Mods = modsNow): Move[] {
  const us = pos.turn;
  const res: Move[] = [];
  for (const m of pseudoMoves(pos, modsNow)) {
    const u = makeMove(pos, m);
    if (!inCheck(pos, us, modsAfter)) res.push(m);
    unmakeMove(pos, u);
  }
  return res;
}

/** Existe-t-il au moins un coup légal ? (arrêt au premier trouvé) */
export function hasLegalMove(pos: Position, modsNow: Mods = NO_MODS, modsAfter: Mods = modsNow, skip?: (m: Move) => boolean): boolean {
  const us = pos.turn;
  for (const m of pseudoMoves(pos, modsNow)) {
    if (skip && skip(m)) continue;
    const u = makeMove(pos, m);
    const ok = !inCheck(pos, us, modsAfter);
    unmakeMove(pos, u);
    if (ok) return true;
  }
  return false;
}

const SAN_LETTER: Record<PieceType, string> = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

/** Notation algébrique (lettres anglaises) ; `legal` sert à lever les ambiguïtés. */
export function toSan(pos: Position, m: Move, legal: Move[]): string {
  if (m.flags & F_CASTLE_K) return 'O-O';
  if (m.flags & F_CASTLE_Q) return 'O-O-O';
  const p = pos.board[m.from]!;
  let s = '';
  if (p.t === 'p') {
    if (m.flags & F_CAPTURE) s += 'abcdefgh'[fileOf(m.from)] + 'x';
    s += sqName(m.to);
    if (m.promo) s += '=' + SAN_LETTER[m.promo];
    return s;
  }
  s += SAN_LETTER[p.t];
  const rivals = legal.filter(o => o.to === m.to && o.from !== m.from && pos.board[o.from]?.t === p.t);
  if (rivals.length) {
    const sameFile = rivals.some(o => fileOf(o.from) === fileOf(m.from));
    const sameRank = rivals.some(o => rankOf(o.from) === rankOf(m.from));
    if (!sameFile) s += 'abcdefgh'[fileOf(m.from)];
    else if (!sameRank) s += String(rankOf(m.from) + 1);
    else s += sqName(m.from);
  }
  if (m.flags & F_CAPTURE) s += 'x';
  s += sqName(m.to);
  return s;
}

const FR_LETTER: Record<string, string> = { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' };
/** Convertit une notation anglaise en notation française (R, D, T, F, C). */
export function sanToFrench(san: string): string {
  if (san.startsWith('O-O')) return san;
  return san.replace(/[KQRBN]/g, ch => FR_LETTER[ch]);
}

/** Position depuis une chaîne FEN (tests et outils). */
export function fromFen(fen: string): { pos: Position; nextId: number } {
  const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
  const board: (Piece | null)[] = new Array(64).fill(null);
  let id = 1;
  const rows = placement.split('/');
  for (let i = 0; i < 8; i++) {
    let f = 0;
    for (const ch of rows[i]) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        const c: Color = ch === ch.toUpperCase() ? 'w' : 'b';
        board[sq(f, 7 - i)] = { id: id++, t: ch.toLowerCase() as PieceType, c };
        f++;
      }
    }
  }
  let cr = 0;
  if (castling && castling !== '-') {
    if (castling.includes('K')) cr |= 1;
    if (castling.includes('Q')) cr |= 2;
    if (castling.includes('k')) cr |= 4;
    if (castling.includes('q')) cr |= 8;
  }
  return {
    pos: {
      board, turn: turn === 'b' ? 'b' : 'w', castling: cr,
      ep: ep && ep !== '-' ? sqIndex(ep) : -1,
      halfmove: Number(half ?? 0), fullmove: Number(full ?? 1),
    },
    nextId: id,
  };
}

export function toFen(pos: Position): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = pos.board[sq(f, r)];
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += p.c === 'w' ? p.t.toUpperCase() : p.t;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  let cr = '';
  if (pos.castling & 1) cr += 'K';
  if (pos.castling & 2) cr += 'Q';
  if (pos.castling & 4) cr += 'k';
  if (pos.castling & 8) cr += 'q';
  return `${rows.join('/')} ${pos.turn} ${cr || '-'} ${pos.ep >= 0 ? sqName(pos.ep) : '-'} ${pos.halfmove} ${pos.fullmove}`;
}

// Règles d'une partie de Spellmate : coups, cartes, effets temporaires et fins de partie.
// Toutes les fonctions sont pures : elles renvoient un nouvel état sans modifier l'ancien.
// Le même code tourne sur le serveur (arbitre) et dans le navigateur (aperçu des coups possibles).

import {
  Color, F_PROMO, Move, Mods, Piece, PieceType, Position, clonePosition, fromFen, hasLegalMove, inCheck,
  initialPosition, isLightSquare, isSlider, legalMoves, makeMove, opposite, rankOf, sqName, toSan,
} from './chess';
import { CARDS, CARD_IDS, Catalog, CardId } from './cards';

export interface Effect {
  id: number;
  card: CardId;
  caster: Color;
  /** Couleur dont les coups font baisser le compteur. */
  countsOn: Color;
  remaining: number;
  total: number;
  square?: number;
  pieceId?: number;
  /** Skin d'animation du lanceur, pour que les deux joueurs voient le même effet. */
  skin: string;
  /** Présage : effet annoncé, pas encore actif (il le devient au tour suivant du lanceur). */
  pending?: boolean;
  /** Cases concernées quand il y en a plusieurs (Faille, Portails…). */
  squares?: number[];
}

export interface HandCard {
  /** null : carte adverse encore cachée (vue client). */
  card: CardId | null;
  used: boolean;
}

export type ResultReason =
  | 'checkmate'
  | 'stalemate'
  | 'resign'
  | 'timeout'
  | 'repetition'
  | 'fifty'
  | 'insufficient'
  | 'agreement'
  | 'abandon'
  | 'aborted';

export interface Result {
  winner: Color | null;
  reason: ResultReason;
}

export type LogEntry =
  | { k: 'move'; c: Color; san: string; from: number; to: number; promo?: PieceType; undone?: boolean }
  | { k: 'card'; c: Color; card: CardId; targets: number[] };

interface MoveRef {
  from: number;
  to: number;
  promo?: PieceType;
}

export interface Snapshot {
  pos: Position;
  effects: Effect[];
  captured: Record<Color, PieceType[]>;
  cardPlayed: boolean;
  ply: number;
  keysLen: number;
  forbidden: MoveRef | null;
  /** Coup joué depuis cette position et index de son entrée dans le journal. */
  next: MoveRef & { log: number };
}

export interface GameState {
  pos: Position;
  effects: Effect[];
  hands: Record<Color, HandCard[]>;
  /** Une carte a déjà été jouée pendant ce tour. */
  cardPlayed: boolean;
  /** Pièces capturées, rangées par couleur de la pièce perdue. */
  captured: Record<Color, PieceType[]>;
  nextPieceId: number;
  nextEffectId: number;
  ply: number;
  log: LogEntry[];
  keys: string[];
  /** Les deux dernières positions avant un coup, pour la carte Retour arrière. */
  snaps: Snapshot[];
  /** Coup interdit après un Retour arrière. */
  forbidden: MoveRef | null;
  timed: boolean;
  /** Catalogue de cartes de la partie (absent dans les parties antérieures : 'duel'). */
  catalog?: Catalog;
  result: Result | null;
}

export const CARDS_PER_PLAYER = 3;

// ---------------------------------------------------------------------------------------------
// Création

export function dealHands(timed: boolean, mirror: boolean, rand: () => number = Math.random, catalog: Catalog = 'duel'): Record<Color, CardId[]> {
  if (catalog === 'aucune') return { w: [], b: [] };
  const pool = CARD_IDS.filter(id => CARDS[id].catalog === catalog && (timed || !CARDS[id].timedOnly));
  const draw = () => {
    const a = pool.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, CARDS_PER_PLAYER);
  };
  const w = draw();
  return { w, b: mirror ? w.slice() : draw() };
}

export function createGame(hands: Record<Color, CardId[]>, timed: boolean, catalog: Catalog = 'duel'): GameState {
  const { pos, nextId } = initialPosition();
  const s: GameState = {
    pos,
    effects: [],
    hands: {
      w: hands.w.map(card => ({ card, used: false })),
      b: hands.b.map(card => ({ card, used: false })),
    },
    cardPlayed: false,
    captured: { w: [], b: [] },
    nextPieceId: nextId,
    nextEffectId: 1,
    ply: 0,
    log: [],
    keys: [],
    snaps: [],
    forbidden: null,
    timed,
    catalog,
    result: null,
  };
  s.keys.push(positionKey(s));
  return s;
}

/** Partie à partir d'une position FEN (tests, tutoriel). */
export function createGameFromFen(fen: string, hands: Record<Color, CardId[]>, timed = true): GameState {
  const s = createGame(hands, timed);
  const { pos, nextId } = fromFen(fen);
  s.pos = pos;
  s.nextPieceId = nextId;
  s.keys = [positionKey(s)];
  return s;
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    pos: clonePosition(s.pos),
    effects: s.effects.slice(),
    hands: { w: s.hands.w.map(h => ({ ...h })), b: s.hands.b.map(h => ({ ...h })) },
    captured: { w: s.captured.w.slice(), b: s.captured.b.slice() },
    log: s.log.slice(),
    keys: s.keys.slice(),
    snaps: s.snaps.slice(),
  };
}

// ---------------------------------------------------------------------------------------------
// Effets

export function modsFromEffects(effects: Effect[]): Mods {
  const mods: Mods = {
    blocked: new Array(64).fill(false),
    frozen: new Set(),
    shielded: new Set(),
    range: { w: 7, b: 7 },
    leap: new Set(),
    phase: new Set(),
  };
  for (const e of effects) {
    switch (e.card) {
      case 'ice_wall': mods.blocked[e.square!] = true; break;
      case 'freeze': mods.frozen.add(e.pieceId!); break;
      case 'shield': mods.shielded.add(e.pieceId!); break;
      case 'gravity': mods.range[e.countsOn] = 3; break;
      case 'knight_leap': mods.leap.add(e.pieceId!); break;
      case 'phase': mods.phase.add(e.pieceId!); break;
    }
  }
  return mods;
}

/** Décompte les effets après un coup de `mover` et retire ceux qui expirent. */
export function tickEffects(effects: Effect[], mover: Color): Effect[] {
  return effects
    .map(e => (e.countsOn === mover ? { ...e, remaining: e.remaining - 1 } : e))
    .filter(e => e.remaining > 0);
}

/** Retire les effets liés à une pièce qui n'est plus sur l'échiquier. */
function dropOrphanEffects(effects: Effect[], pos: Position): Effect[] {
  const alive = new Set<number>();
  for (const p of pos.board) if (p) alive.add(p.id);
  return effects.filter(e => e.pieceId === undefined || alive.has(e.pieceId));
}

export function pieceSquare(pos: Position, id: number): number {
  return pos.board.findIndex(p => p?.id === id);
}

export function timeWarpOn(s: GameState, c: Color): boolean {
  return s.effects.some(e => e.card === 'time_warp' && e.countsOn === c);
}

// ---------------------------------------------------------------------------------------------
// Coups

export function legalMovesOf(s: GameState): Move[] {
  if (s.result) return [];
  const now = modsFromEffects(s.effects);
  const after = modsFromEffects(tickEffects(s.effects, s.pos.turn));
  let moves = legalMoves(s.pos, now, after);
  const f = s.forbidden;
  if (f) moves = moves.filter(m => !sameMove(m, f));
  return moves;
}

function hasLegal(s: GameState): boolean {
  const now = modsFromEffects(s.effects);
  const after = modsFromEffects(tickEffects(s.effects, s.pos.turn));
  const f = s.forbidden;
  return hasLegalMove(s.pos, now, after, f ? m => sameMove(m, f) : undefined);
}

function sameMove(m: MoveRef, f: MoveRef): boolean {
  return m.from === f.from && m.to === f.to && (m.promo ?? null) === (f.promo ?? null);
}

export function sideInCheck(s: GameState, c: Color = s.pos.turn): boolean {
  return inCheck(s.pos, c, modsFromEffects(s.effects));
}

export interface MoveInfo {
  san: string;
  move: Move;
  pieceId: number;
  capturedId: number | null;
  check: boolean;
}

export type Outcome<I> = { ok: true; state: GameState; info: I } | { ok: false; error: string };

export function playMove(s: GameState, from: number, to: number, promo?: PieceType): Outcome<MoveInfo> {
  if (s.result) return { ok: false, error: 'La partie est terminée.' };
  const legal = legalMovesOf(s);
  const candidates = legal.filter(m => m.from === from && m.to === to);
  if (!candidates.length) return { ok: false, error: 'Coup illégal.' };
  const m = candidates.find(c => !(c.flags & F_PROMO) || c.promo === (promo ?? 'q'));
  if (!m) return { ok: false, error: 'Promotion invalide.' };
  const mover = s.pos.turn;
  const san = toSan(s.pos, m, legal);
  const n = cloneState(s);
  n.snaps = [...s.snaps, {
    pos: clonePosition(s.pos),
    effects: s.effects,
    captured: { w: s.captured.w.slice(), b: s.captured.b.slice() },
    cardPlayed: s.cardPlayed,
    ply: s.ply,
    keysLen: s.keys.length,
    forbidden: s.forbidden,
    next: { from: m.from, to: m.to, promo: m.promo, log: s.log.length },
  }].slice(-2);
  const u = makeMove(n.pos, m);
  if (u.captured) n.captured[u.captured.c].push(u.captured.t);
  n.effects = dropOrphanEffects(tickEffects(n.effects, mover), n.pos);
  n.cardPlayed = false;
  n.forbidden = null;
  n.ply++;
  const check = inCheck(n.pos, opposite(mover), modsFromEffects(n.effects));
  n.log.push({ k: 'move', c: mover, san: san + (check ? '+' : ''), from: m.from, to: m.to, promo: m.promo });
  n.keys.push(positionKey(n));
  n.result = evaluateEnd(n);
  if (n.result?.reason === 'checkmate') {
    const last = n.log[n.log.length - 1] as Extract<LogEntry, { k: 'move' }>;
    n.log[n.log.length - 1] = { ...last, san: last.san.replace(/\+$/, '') + '#' };
  }
  return {
    ok: true,
    state: n,
    info: { san, move: m, pieceId: u.moved.id, capturedId: u.captured?.id ?? null, check },
  };
}

// ---------------------------------------------------------------------------------------------
// Cartes

export interface CardInfo {
  card: CardId;
  caster: Color;
  targets: number[];
  /** Identifiants des pièces concernées (gelée, foudroyée, ressuscitée…). */
  pieces: number[];
  skin: string;
}

/** Vérifications communes : tour du joueur, carte disponible, une seule carte par tour. */
function cardPrecheck(s: GameState, color: Color, index: number): string | null {
  if (s.result) return 'La partie est terminée.';
  if (s.pos.turn !== color) return "Ce n'est pas ton tour.";
  if (s.cardPlayed) return 'Une seule carte par tour.';
  const h = s.hands[color][index];
  if (!h || !h.card) return 'Carte inconnue.';
  if (h.used) return 'Carte déjà utilisée.';
  return null;
}

function bestRevivable(captured: PieceType[]): PieceType | null {
  for (const t of ['r', 'b', 'n'] as PieceType[]) if (captured.includes(t)) return t;
  return null;
}

/** Cases candidates pour la prochaine cible, avant le contrôle de validité complet. */
function rawCandidates(s: GameState, color: Color, card: CardId, partial: number[]): number[] {
  const b = s.pos.board;
  const mods = modsFromEffects(s.effects);
  const them = opposite(color);
  const out: number[] = [];
  const each = (pred: (p: Piece | null, i: number) => boolean) => {
    for (let i = 0; i < 64; i++) if (pred(b[i], i)) out.push(i);
  };
  switch (card) {
    case 'ice_wall':
      each((p, i) => !p && !mods.blocked[i]);
      break;
    case 'freeze':
      each(p => !!p && p.c === them && p.t !== 'k' && !mods.frozen.has(p.id) && !mods.shielded.has(p.id));
      break;
    case 'lightning':
      each(p => !!p && p.c === them && p.t === 'p' && !mods.shielded.has(p.id));
      break;
    case 'shield':
      each(p => !!p && p.c === color && p.t !== 'k' && !mods.shielded.has(p.id));
      break;
    case 'knight_leap':
    case 'phase':
      each(p => !!p && p.c === color && isSlider(p.t) && !mods.frozen.has(p.id));
      break;
    case 'swap': {
      const first = partial[0];
      each((p, i) => {
        if (!p || p.c !== color || p.t === 'k' || mods.frozen.has(p.id)) return false;
        if (first === undefined) return true;
        if (i === first) return false;
        const a = b[first]!;
        const lastRank = (x: number) => rankOf(x) === 0 || rankOf(x) === 7;
        if (a.t === 'p' && lastRank(i)) return false;
        if (p.t === 'p' && lastRank(first)) return false;
        return true;
      });
      break;
    }
    case 'revive': {
      const pieceRank = color === 'w' ? 0 : 7;
      const pawnRank = color === 'w' ? 1 : 6;
      const caps = s.captured[color];
      const canPiece = bestRevivable(caps) !== null;
      const canPawn = caps.includes('p');
      each((p, i) => !p && !mods.blocked[i] &&
        ((canPiece && rankOf(i) === pieceRank) || (canPawn && rankOf(i) === pawnRank)));
      break;
    }
    default:
      break;
  }
  return out;
}

/** Applique l'effet brut de la carte (sans les contrôles de fin). */
function applyCardRaw(s: GameState, color: Color, index: number, targets: number[], skin: string): { state: GameState; info: CardInfo } | string {
  const card = s.hands[color][index].card!;
  const def = CARDS[card];
  if (targets.length !== def.targets) return 'Cible manquante.';
  for (let k = 0; k < targets.length; k++) {
    if (!rawCandidates(s, color, card, targets.slice(0, k)).includes(targets[k])) return 'Cible invalide.';
  }
  const them = opposite(color);
  const n = cloneState(s);
  n.hands[color][index] = { card, used: true };
  n.cardPlayed = true;
  const info: CardInfo = { card, caster: color, targets, pieces: [], skin };
  const addEffect = (extra: Partial<Effect>) => {
    const turns = def.turns ?? 1;
    n.effects = [...n.effects, {
      id: n.nextEffectId++, card, caster: color, countsOn: def.countsOnOpponent ? them : color,
      remaining: turns, total: turns, skin, ...extra,
    }];
  };
  const b = n.pos.board;
  switch (card) {
    case 'time_warp':
      if (!s.timed) return 'Cette carte demande une partie avec pendule.';
      if (timeWarpOn(s, them)) return 'La pendule adverse est déjà accélérée.';
      addEffect({});
      break;
    case 'gravity':
      if (s.effects.some(e => e.card === 'gravity' && e.countsOn === them)) return 'Gravité déjà active.';
      if (!b.some(p => p && p.c === them && isSlider(p.t))) return "L'adversaire n'a ni tour, ni fou, ni dame.";
      addEffect({});
      break;
    case 'ice_wall':
      addEffect({ square: targets[0] });
      break;
    case 'freeze':
    case 'shield':
    case 'knight_leap':
    case 'phase': {
      const id = b[targets[0]]!.id;
      info.pieces.push(id);
      addEffect({ pieceId: id });
      break;
    }
    case 'lightning': {
      const victim = b[targets[0]]!;
      info.pieces.push(victim.id);
      b[targets[0]] = null;
      n.captured[them].push('p');
      if (n.pos.ep >= 0 && targets[0] === n.pos.ep + (them === 'w' ? 8 : -8)) n.pos.ep = -1;
      n.effects = dropOrphanEffects(n.effects, n.pos);
      break;
    }
    case 'swap': {
      const [a, c] = targets;
      info.pieces.push(b[a]!.id, b[c]!.id);
      [b[a], b[c]] = [b[c], b[a]];
      const bits: Record<number, number> = { 7: 1, 0: 2, 63: 4, 56: 8 };
      for (const x of targets) if (bits[x] !== undefined) n.pos.castling &= ~bits[x];
      break;
    }
    case 'revive': {
      const t = rankOf(targets[0]) === (color === 'w' ? 1 : 6) ? 'p' : bestRevivable(n.captured[color])!;
      const k = n.captured[color].indexOf(t);
      n.captured[color].splice(k, 1);
      const piece: Piece = { id: n.nextPieceId++, t, c: color };
      b[targets[0]] = piece;
      info.pieces.push(piece.id);
      break;
    }
    case 'rewind': {
      const snap = s.snaps[s.snaps.length - 1];
      if (!snap || snap.pos.turn !== them) return "Aucun coup adverse à annuler.";
      n.pos = clonePosition(snap.pos);
      n.effects = snap.effects;
      n.captured = { w: snap.captured.w.slice(), b: snap.captured.b.slice() };
      n.cardPlayed = snap.cardPlayed;
      n.ply = snap.ply;
      n.keys = s.keys.slice(0, snap.keysLen);
      n.snaps = s.snaps.slice(0, -1);
      n.forbidden = { from: snap.next.from, to: snap.next.to, promo: snap.next.promo };
      const entry = n.log[snap.next.log];
      if (entry && entry.k === 'move') n.log[snap.next.log] = { ...entry, undone: true };
      info.targets = [snap.next.from, snap.next.to];
      break;
    }
  }
  n.log.push({ k: 'card', c: color, card, targets: info.targets });
  return { state: n, info };
}

/** Une carte jouée doit laisser l'adversaire hors d'échec et au lanceur au moins un coup légal. */
function validateAfterCard(n: GameState, color: Color, card: CardId): string | null {
  if (card === 'rewind') {
    return hasLegal(n) ? null : "L'adversaire n'aurait aucun autre coup possible.";
  }
  const mods = modsFromEffects(n.effects);
  if (inCheck(n.pos, opposite(color), mods)) return "Une carte ne peut pas mettre le roi adverse en échec.";
  if (!hasLegal(n)) return 'Après cette carte, tu n’aurais plus aucun coup légal.';
  return null;
}

function tryCard(s: GameState, color: Color, index: number, targets: number[], skin: string): Outcome<CardInfo> {
  const pre = cardPrecheck(s, color, index);
  if (pre) return { ok: false, error: pre };
  const r = applyCardRaw(s, color, index, targets, skin);
  if (typeof r === 'string') return { ok: false, error: r };
  const err = validateAfterCard(r.state, color, s.hands[color][index].card!);
  if (err) return { ok: false, error: err };
  return { ok: true, state: r.state, info: r.info };
}

/** Cases valides pour la prochaine cible de la carte `index`, sachant les cibles déjà choisies. */
export function cardOptions(s: GameState, color: Color, index: number, partial: number[] = []): number[] {
  if (cardPrecheck(s, color, index)) return [];
  const card = s.hands[color][index].card!;
  const need = CARDS[card].targets;
  if (partial.length >= need) return [];
  return rawCandidates(s, color, card, partial).filter(t => {
    const chosen = [...partial, t];
    if (chosen.length === need) return tryCard(s, color, index, chosen, '').ok;
    return rawCandidates(s, color, card, chosen).some(t2 => tryCard(s, color, index, [...chosen, t2], '').ok);
  });
}

/** La carte peut-elle être jouée maintenant (avec au moins une cible valide) ? */
export function cardPlayable(s: GameState, color: Color, index: number): boolean {
  if (cardPrecheck(s, color, index)) return false;
  const card = s.hands[color][index].card!;
  if (CARDS[card].targets === 0) return tryCard(s, color, index, [], '').ok;
  return cardOptions(s, color, index).length > 0;
}

export function playCard(s: GameState, color: Color, index: number, targets: number[], skin: string): Outcome<CardInfo> {
  const r = tryCard(s, color, index, targets, skin);
  if (!r.ok) return r;
  r.state.result = evaluateEnd(r.state);
  return r;
}

function hasPlayableCard(s: GameState, color: Color): boolean {
  return s.hands[color].some((_, i) => cardPlayable(s, color, i));
}

// ---------------------------------------------------------------------------------------------
// Fins de partie

export function positionKey(s: GameState): string {
  let k = '';
  for (const p of s.pos.board) k += p ? (p.c === 'w' ? p.t.toUpperCase() : p.t) : '.';
  k += s.pos.turn + s.pos.castling + ':' + s.pos.ep;
  for (const e of s.effects) k += `|${e.card}${e.countsOn}${e.remaining}:${e.square ?? ''}:${e.pieceId ?? ''}`;
  k += '|' + s.hands.w.map(h => (h.used ? 1 : 0)).join('') + s.hands.b.map(h => (h.used ? 1 : 0)).join('');
  return k;
}

function insufficientMaterial(s: GameState): boolean {
  for (const c of ['w', 'b'] as Color[]) {
    const canRevive = s.hands[c].some(h => !h.used && h.card === 'revive') && s.captured[c].some(t => t !== 'q');
    if (canRevive) return false;
  }
  const minors: { t: PieceType; light: boolean }[] = [];
  for (let i = 0; i < 64; i++) {
    const p = s.pos.board[i];
    if (!p || p.t === 'k') continue;
    if (p.t === 'p' || p.t === 'r' || p.t === 'q') return false;
    minors.push({ t: p.t, light: isLightSquare(i) });
  }
  if (minors.length <= 1) return true;
  return minors.every(m => m.t === 'b' && m.light === minors[0].light);
}

/** Fin de partie éventuelle pour le camp au trait. */
export function evaluateEnd(s: GameState): Result | null {
  const turn = s.pos.turn;
  if (!hasLegal(s)) {
    if (!s.cardPlayed && hasPlayableCard(s, turn)) return null;
    return sideInCheck(s, turn) ? { winner: opposite(turn), reason: 'checkmate' } : { winner: null, reason: 'stalemate' };
  }
  if (s.pos.halfmove >= 100) return { winner: null, reason: 'fifty' };
  const key = s.keys[s.keys.length - 1];
  if (key && s.keys.filter(k => k === key).length >= 3) return { winner: null, reason: 'repetition' };
  if (insufficientMaterial(s)) return { winner: null, reason: 'insufficient' };
  return null;
}

/** Le camp `c` a-t-il assez de matériel pour mater (utile quand l'autre tombe au temps) ? */
export function canStillMate(s: GameState, c: Color): boolean {
  if (s.hands[c].some(h => !h.used && h.card === 'revive') && s.captured[c].some(t => t !== 'q')) return true;
  let minors = 0;
  for (const p of s.pos.board) {
    if (!p || p.c !== c || p.t === 'k') continue;
    if (p.t === 'p' || p.t === 'r' || p.t === 'q') return true;
    minors++;
  }
  return minors >= 2;
}

// ---------------------------------------------------------------------------------------------
// Affichage

export const RESULT_TEXT: Record<ResultReason, string> = {
  checkmate: 'Échec et mat',
  stalemate: 'Pat',
  resign: 'Abandon',
  timeout: 'Temps écoulé',
  repetition: 'Triple répétition',
  fifty: 'Règle des 50 coups',
  insufficient: 'Matériel insuffisant',
  agreement: 'Nulle par accord',
  abandon: 'Adversaire parti',
  aborted: 'Partie annulée',
};

export function describeCardPlay(card: CardId, targets: number[]): string {
  const name = CARDS[card].name;
  if (card === 'swap') return `${name} ${sqName(targets[0])}⇄${sqName(targets[1])}`;
  if (card === 'rewind') return `${name} (${sqName(targets[0])}-${sqName(targets[1])})`;
  if (targets.length === 1) return `${name} ${sqName(targets[0])}`;
  return name;
}

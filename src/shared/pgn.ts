// Notation : lecture et écriture de la notation algébrique (SAN), du FEN et du PGN.
// Extension Spellmate : une carte jouée s'écrit en commentaire avant le coup, `{[%spell freeze f6]}`,
// et une carte qui remplace le coup (Rituel) est suivie du coup nul `--`.
// Tout est pur et partagé : la page Analyse s'en sert, les tests aussi.

import {
  Color, F_CASTLE_K, F_CASTLE_Q, Move, PieceType, fromFen, inCheck, NO_MODS, opposite, rankOf,
  sqIndex, sqName, toFen,
} from './chess';
import { CARDS, CardId, Catalog, isCardId } from './cards';
import {
  GameState, LogEntry, createGame, createGameFromFen, legalMovesOf, playCard, playMove,
} from './game';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ---------------------------------------------------------------------------------------------
// FEN

/** Vérifie une chaîne FEN ; renvoie un message d'erreur en français, ou null si elle est valable. */
export function validateFen(fen: string): string | null {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) return 'Le FEN doit contenir au moins la position et le trait.';
  const rows = parts[0].split('/');
  if (rows.length !== 8) return 'La position doit compter 8 rangées séparées par « / ».';
  for (const row of rows) {
    let n = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) n += Number(ch);
      else if (/[prnbqkPRNBQK]/.test(ch)) n++;
      else return `Caractère inconnu dans la position : « ${ch} ».`;
    }
    if (n !== 8) return 'Chaque rangée doit compter exactement 8 cases.';
  }
  if (!/^[wb]$/.test(parts[1])) return 'Le trait doit être « w » (Blancs) ou « b » (Noirs).';
  if (parts[2] && !/^(-|K?Q?k?q?)$/.test(parts[2])) return 'Droits de roque invalides.';
  if (parts[3] && !/^(-|[a-h][36])$/.test(parts[3])) return 'Case de prise en passant invalide.';
  if (parts[4] && !/^\d+$/.test(parts[4])) return 'Compteur des 50 coups invalide.';
  if (parts[5] && !/^\d+$/.test(parts[5])) return 'Numéro de coup invalide.';
  const { pos } = fromFen(fen);
  const count = (t: PieceType, c: Color) => pos.board.filter(p => p && p.t === t && p.c === c).length;
  if (count('k', 'w') !== 1 || count('k', 'b') !== 1) return 'Il faut exactement un roi blanc et un roi noir.';
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (p && p.t === 'p' && (rankOf(i) === 0 || rankOf(i) === 7)) return 'Un pion ne peut pas se trouver sur la première ou la dernière rangée.';
  }
  if (count('p', 'w') > 8 || count('p', 'b') > 8) return 'Pas plus de 8 pions par camp.';
  if (inCheck(pos, opposite(pos.turn), NO_MODS)) return 'Le camp qui n’a pas le trait ne peut pas être en échec.';
  // Droits de roque cohérents avec la position
  const at = (s: string) => pos.board[sqIndex(s)];
  const is = (s: string, t: PieceType, c: Color) => at(s)?.t === t && at(s)?.c === c;
  if (pos.castling & 1 && !(is('e1', 'k', 'w') && is('h1', 'r', 'w'))) return 'Petit roque blanc impossible dans cette position.';
  if (pos.castling & 2 && !(is('e1', 'k', 'w') && is('a1', 'r', 'w'))) return 'Grand roque blanc impossible dans cette position.';
  if (pos.castling & 4 && !(is('e8', 'k', 'b') && is('h8', 'r', 'b'))) return 'Petit roque noir impossible dans cette position.';
  if (pos.castling & 8 && !(is('e8', 'k', 'b') && is('a8', 'r', 'b'))) return 'Grand roque noir impossible dans cette position.';
  return null;
}

/** Complète un FEN partiel (position et trait) avec les champs par défaut. */
export function normalizeFen(fen: string): string {
  const p = fen.trim().split(/\s+/);
  return [p[0], p[1] ?? 'w', p[2] ?? '-', p[3] ?? '-', p[4] ?? '0', p[5] ?? '1'].join(' ');
}

/** Partie sans cartes à partir d'un FEN (analyse libre). */
export function stateFromFen(fen: string, catalog: Catalog = 'aucune'): GameState {
  const s = createGameFromFen(normalizeFen(fen), { w: [], b: [] }, false);
  s.catalog = catalog;
  return s;
}

export function fenOf(s: GameState): string {
  return toFen(s.pos);
}

// ---------------------------------------------------------------------------------------------
// SAN

const EN: Record<string, PieceType> = { K: 'k', Q: 'q', R: 'r', B: 'b', N: 'n' };
const FR: Record<string, PieceType> = { R: 'k', D: 'q', T: 'r', F: 'b', C: 'n' };
const SAN_RE = /^([A-Z])?([a-h])?([1-8])?(x|:)?([a-h][1-8])(?:=?\(?([A-Z])\)?)?$/;

export type SanLang = 'en' | 'fr';

/** Nettoie un coup : suffixes d'échec, annotations, « e.p. », zéros du roque. */
export function cleanSan(raw: string): string {
  return raw
    .trim()
    .replace(/[+#‡†]+/g, '')
    .replace(/[!?]+$/g, '')
    .replace(/\s*e\.?p\.?$/i, '')
    .replace(/^0-0-0/, 'O-O-O')
    .replace(/^0-0/, 'O-O')
    .replace(/^o-o-o$/, 'O-O-O')
    .replace(/^o-o$/, 'O-O');
}

/** Trouve le coup légal décrit par `san` dans l'état (effets de cartes compris). null si inconnu ou ambigu. */
export function findSanMove(s: GameState, san: string, lang: SanLang = 'en'): Move | null {
  const legal = legalMovesOf(s);
  const t = cleanSan(san);
  if (t === 'O-O' || t === 'O-O-O') {
    const flag = t === 'O-O' ? F_CASTLE_K : F_CASTLE_Q;
    return legal.find(m => m.flags & flag) ?? null;
  }
  const m = SAN_RE.exec(t);
  if (!m) return null;
  const letters = lang === 'fr' ? FR : EN;
  const [, pieceL, file, rank, , dest, promoL] = m;
  let piece: PieceType = 'p';
  if (pieceL) {
    const p = letters[pieceL];
    if (!p) return null;
    piece = p;
  }
  let promo: PieceType | undefined;
  if (promoL) {
    const p = letters[promoL];
    if (!p || p === 'k' || p === 'p') return null;
    promo = p;
  }
  const to = sqIndex(dest);
  const cands = legal.filter(mv => {
    const p = s.pos.board[mv.from];
    if (!p || p.t !== piece || mv.to !== to) return false;
    if (file && 'abcdefgh'[mv.from & 7] !== file) return false;
    if (rank && String((mv.from >> 3) + 1) !== rank) return false;
    if (mv.promo) return mv.promo === (promo ?? 'q');
    return !promo;
  });
  return cands.length === 1 ? cands[0] : null;
}

/** Notation SAN complète (avec + ou #) d'un coup légal. */
export function sanOf(s: GameState, m: Move): string {
  const r = playMove(s, m.from, m.to, m.promo);
  if (!r.ok) return '?';
  const last = r.state.log[r.state.log.length - 1];
  return last.k === 'move' ? last.san : '?';
}

/** Notation UCI (e2e4, e7e8q). */
export function uciOf(m: { from: number; to: number; promo?: PieceType }): string {
  return sqName(m.from) + sqName(m.to) + (m.promo ?? '');
}

export function parseUci(uci: string): { from: number; to: number; promo?: PieceType } | null {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci.trim());
  if (!m) return null;
  return { from: sqIndex(m[1]), to: sqIndex(m[2]), promo: m[3] as PieceType | undefined };
}

// ---------------------------------------------------------------------------------------------
// Arbre de coups (partagé entre la lecture PGN, la relecture des parties et la page Analyse)

let nextNodeId = 1;

export interface TreeNode {
  id: number;
  /** Coup ou carte qui mène à cette position (null pour la racine). */
  entry: LogEntry | null;
  /** État après le coup. */
  state: GameState;
  parent: TreeNode | null;
  /** children[0] : suite principale ; les suivants sont des variantes. */
  children: TreeNode[];
  comment?: string;
  nags?: number[];
}

export function makeRoot(state: GameState): TreeNode {
  return { id: nextNodeId++, entry: null, state, parent: null, children: [] };
}

export function addChild(parent: TreeNode, entry: LogEntry, state: GameState): TreeNode {
  const n: TreeNode = { id: nextNodeId++, entry, state, parent, children: [] };
  parent.children.push(n);
  return n;
}

/** Joue un coup depuis un nœud : réutilise l'enfant existant, sinon crée une variante. */
export function playFrom(node: TreeNode, from: number, to: number, promo?: PieceType): TreeNode | null {
  const r = playMove(node.state, from, to, promo);
  if (!r.ok) return null;
  const entry = r.state.log[r.state.log.length - 1];
  const same = node.children.find(c => c.entry?.k === 'move' && c.entry.from === from && c.entry.to === to && (c.entry.promo ?? null) === (r.info.move.promo ?? null));
  if (same) return same;
  return addChild(node, entry, r.state);
}

/** Index de la carte `card` encore disponible dans la main de `c` (la carte est ajoutée si besoin). */
function ensureCard(s: GameState, c: Color, card: CardId): { state: GameState; index: number } {
  const i = s.hands[c].findIndex(h => h.card === card && !h.used);
  if (i >= 0) return { state: s, index: i };
  // Ancienne partie du Duel servie avec une main masquée : la carte prend la place d'une carte inconnue
  const hidden = s.hands[c].findIndex(h => h.card === null && !h.used);
  const hands = { w: s.hands.w.map(h => ({ ...h })), b: s.hands.b.map(h => ({ ...h })) };
  if (hidden >= 0) {
    hands[c][hidden] = { card, used: false };
    return { state: { ...s, hands }, index: hidden };
  }
  hands[c].push({ card, used: false });
  return { state: { ...s, hands }, index: hands[c].length - 1 };
}

/** Joue une carte (les cibles du journal peuvent différer de celles attendues dans une ancienne partie du Duel :
 *  Retour arrière…). Une carte retirée du jeu (Couronnement, Portails…) n'est pas rejouée : `null`. */
export function applyCard(s: GameState, c: Color, card: CardId, targets: number[]): GameState | null {
  if (!CARDS[card]) return null;
  const { state, index } = ensureCard(s, c, card);
  const need = CARDS[card].targets;
  const tries = [targets, targets.slice(0, need), []];
  for (const t of tries) {
    const r = playCard(state, c, index, t, '');
    if (r.ok) return r.state;
  }
  return null;
}

/** Relit le journal d'une partie du site depuis son état initial. */
export function treeFromLog(start: GameState, log: LogEntry[]): { root: TreeNode; complete: boolean } {
  const root = makeRoot(start);
  let node = root;
  for (const e of log) {
    const s = node.state;
    if (e.k === 'move') {
      const r = playMove(s, e.from, e.to, e.promo);
      if (!r.ok) return { root, complete: false };
      const last = r.state.log[r.state.log.length - 1];
      node = addChild(node, last.k === 'move' && e.undone ? { ...last, undone: true } : last, r.state);
    } else {
      if (s.pos.turn !== e.c) return { root, complete: false };
      const n = applyCard(s, e.c, e.card, e.targets);
      if (!n) return { root, complete: false };
      node = addChild(node, n.log[n.log.length - 1] ?? e, n);
    }
  }
  return { root, complete: true };
}

/** État initial d'une partie du site (mains visibles ; une carte retirée du jeu est écartée). */
export function initialStateOf(final: Pick<GameState, 'hands' | 'timed' | 'catalog'>): GameState {
  const hands = {
    w: final.hands.w.map(h => h.card).filter((c): c is CardId => !!c && isCardId(c)),
    b: final.hands.b.map(h => h.card).filter((c): c is CardId => !!c && isCardId(c)),
  };
  return createGame(hands, final.timed, final.catalog ?? 'duel');
}

/** Suite principale à partir d'un nœud (le nœud compris). */
export function mainline(node: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  let n: TreeNode | undefined = node;
  while (n) {
    out.push(n);
    n = n.children[0];
  }
  return out;
}

/** Chemin depuis la racine jusqu'au nœud (racine comprise). */
export function pathTo(node: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  for (let n: TreeNode | null = node; n; n = n.parent) out.unshift(n);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Lecture PGN

export type PgnToken =
  | { t: 'tag'; name: string; value: string }
  | { t: 'move'; text: string }
  | { t: 'comment'; text: string }
  | { t: 'nag'; n: number }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'result'; text: string };

export function tokenizePgn(text: string): PgnToken[] {
  const out: PgnToken[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '%' && (i === 0 || text[i - 1] === '\n')) {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '[') {
      const end = findTagEnd(text, i);
      const body = text.slice(i + 1, end);
      const m = /^\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*$/.exec(body);
      if (m) out.push({ t: 'tag', name: m[1], value: m[2].replace(/\\(.)/g, '$1') });
      i = end + 1;
      continue;
    }
    if (ch === '{') {
      const end = text.indexOf('}', i);
      const stop = end < 0 ? n : end;
      out.push({ t: 'comment', text: text.slice(i + 1, stop) });
      i = stop + 1;
      continue;
    }
    if (ch === ';') {
      const end = text.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      out.push({ t: 'comment', text: text.slice(i + 1, stop) });
      i = stop;
      continue;
    }
    if (ch === '(') { out.push({ t: 'open' }); i++; continue; }
    if (ch === ')') { out.push({ t: 'close' }); i++; continue; }
    if (ch === '$') {
      const m = /^\$(\d+)/.exec(text.slice(i));
      if (m) { out.push({ t: 'nag', n: Number(m[1]) }); i += m[0].length; continue; }
      i++;
      continue;
    }
    // Mot : numéro de coup, résultat ou coup
    let j = i;
    while (j < n && !/[\s{}();[\]]/.test(text[j])) j++;
    let word = text.slice(i, j);
    i = j;
    if (/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(word)) {
      out.push({ t: 'result', text: word === '½-½' ? '1/2-1/2' : word });
      continue;
    }
    // « 12. », « 12... », « 12.e4 »
    word = word.replace(/^\d+\.*(\.\.\.)?/, '').replace(/^…/, '');
    if (!word) continue;
    const nag: Record<string, number> = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };
    const ann = /([!?]{1,2})$/.exec(word);
    if (ann && word.length > ann[1].length) {
      out.push({ t: 'move', text: word.slice(0, -ann[1].length) });
      if (nag[ann[1]]) out.push({ t: 'nag', n: nag[ann[1]] });
      continue;
    }
    if (nag[word]) { out.push({ t: 'nag', n: nag[word] }); continue; }
    out.push({ t: 'move', text: word });
  }
  return out;
}

function findTagEnd(text: string, start: number): number {
  let inStr = false;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === ']') return i;
  }
  return text.length;
}

/** Entrées lues dans le texte, avant résolution des coups. */
export type PgnEntry =
  | { k: 'move'; san: string; comment?: string; nags?: number[]; vars: PgnEntry[][] }
  | { k: 'card'; card: CardId; targets: number[] };

export interface ParsedPgn {
  headers: Record<string, string>;
  entries: PgnEntry[];
  result: string;
  /** Commentaire placé avant le premier coup. */
  intro?: string;
}

const SPELL_RE = /\[%spell\s+([a-z_]+)((?:\s+[a-h][1-8])*)\s*\]/g;

export function parsePgnText(text: string): ParsedPgn {
  const tokens = tokenizePgn(text);
  const headers: Record<string, string> = {};
  let k = 0;
  while (k < tokens.length && tokens[k].t === 'tag') {
    const tk = tokens[k] as Extract<PgnToken, { t: 'tag' }>;
    headers[tk.name] = tk.value;
    k++;
  }
  let result = headers.Result ?? '*';
  let intro: string | undefined;
  const parseLine = (isTop: boolean): PgnEntry[] => {
    const line: PgnEntry[] = [];
    const lastMove = () => {
      for (let i = line.length - 1; i >= 0; i--) {
        const e = line[i];
        if (e.k === 'move') return e;
      }
      return null;
    };
    while (k < tokens.length) {
      const tk = tokens[k];
      if (tk.t === 'close') { k++; break; }
      if (tk.t === 'tag') break; // partie suivante
      k++;
      if (tk.t === 'result') {
        if (isTop) { result = tk.text; break; }
        continue;
      }
      if (tk.t === 'move') line.push({ k: 'move', san: tk.text, vars: [] });
      else if (tk.t === 'nag') {
        const m = lastMove();
        if (m) (m.nags ??= []).push(tk.n);
      } else if (tk.t === 'comment') {
        let rest = tk.text;
        for (const sp of tk.text.matchAll(SPELL_RE)) {
          rest = rest.replace(sp[0], '');
          if (!isCardId(sp[1])) continue;
          const targets = sp[2].trim() ? sp[2].trim().split(/\s+/).map(sqIndex) : [];
          line.push({ k: 'card', card: sp[1], targets });
        }
        rest = rest.replace(/\[%[^\]]*\]/g, '').trim();
        if (rest) {
          const m = lastMove();
          if (m) m.comment = m.comment ? `${m.comment} ${rest}` : rest;
          else if (isTop) intro = intro ? `${intro} ${rest}` : rest;
        }
      } else if (tk.t === 'open') {
        const target = lastMove();
        const sub = parseLine(false);
        if (target) target.vars.push(sub);
      }
    }
    return line;
  };
  const entries = parseLine(true);
  return { headers, entries, result, intro };
}

/** Détecte la notation française (R, D, T, F, C) dans une suite de coups. */
export function detectLang(entries: PgnEntry[]): SanLang {
  let fr = 0, en = 0;
  const walk = (list: PgnEntry[]) => {
    for (const e of list) {
      if (e.k !== 'move') continue;
      const c = e.san[0];
      if ('DTFC'.includes(c)) fr++;
      if ('QBN'.includes(c)) en++;
      if (/=[DTFC]/.test(e.san)) fr++;
      for (const v of e.vars) walk(v);
    }
  };
  walk(entries);
  return fr > en ? 'fr' : 'en';
}

export class PgnError extends Error {}

/** Résout une ligne d'entrées en nœuds de l'arbre, à partir de `parent`. */
function resolveInto(parent: TreeNode, entries: PgnEntry[], lang: SanLang) {
  let node = parent;
  for (const e of entries) {
    const s = node.state;
    if (e.k === 'card') {
      const c = s.pos.turn;
      const n = applyCard(s, c, e.card, e.targets);
      if (!n) throw new PgnError(`Carte impossible à jouer ici : ${CARDS[e.card]?.name ?? e.card} (coup ${s.pos.fullmove}).`);
      node = addChild(node, n.log[n.log.length - 1], n);
      continue;
    }
    if (e.san === '--' || e.san === 'Z0') {
      // Coup nul : seulement après un Rituel (la carte a déjà rendu la main à l'adversaire).
      const prev = node.entry;
      if (prev?.k === 'card' && prev.c !== s.pos.turn) continue;
      throw new PgnError(`Coup nul non pris en charge (coup ${s.pos.fullmove}).`);
    }
    const m = findSanMove(s, e.san, lang);
    if (!m) throw new PgnError(`Coup illégal ou ambigu : « ${e.san} » (${s.pos.fullmove}${s.pos.turn === 'w' ? '.' : '...'}).`);
    const before = node;
    const r = playMove(s, m.from, m.to, m.promo);
    if (!r.ok) throw new PgnError(`Coup refusé : « ${e.san} ».`);
    node = addChild(node, r.state.log[r.state.log.length - 1], r.state);
    if (e.comment) node.comment = e.comment;
    if (e.nags?.length) node.nags = e.nags;
    for (const v of e.vars) resolveInto(before, v, lang);
  }
}

export interface PgnGame {
  headers: Record<string, string>;
  root: TreeNode;
  result: string;
}

/** Lit un PGN (première partie du texte). Lève PgnError avec un message en français. */
export function readPgn(text: string): PgnGame {
  const parsed = parsePgnText(text);
  const h = parsed.headers;
  const fen = h.FEN ? normalizeFen(h.FEN) : START_FEN;
  if (h.FEN) {
    const err = validateFen(fen);
    if (err) throw new PgnError(`FEN de l'en-tête invalide : ${err}`);
  }
  const catalog = (['climats', 'duel', 'aucune'] as Catalog[]).find(c => c === h.Catalog) ?? 'aucune';
  const start = stateFromFen(fen, catalog);
  const root = makeRoot(start);
  if (parsed.intro) root.comment = parsed.intro;
  const lang = detectLang(parsed.entries);
  resolveInto(root, parsed.entries, lang);
  if (!root.children.length && !parsed.entries.length && !h.FEN && !Object.keys(h).length) {
    throw new PgnError('Aucun coup ni en-tête PGN reconnu.');
  }
  return { headers: h, root, result: parsed.result };
}

// ---------------------------------------------------------------------------------------------
// Écriture PGN

const TAG_ORDER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];

function escapeTag(v: string) {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function spellComment(e: Extract<LogEntry, { k: 'card' }>): string {
  const t = CARDS[e.card]?.targets ?? 0;
  const targets = e.targets.slice(0, t).map(sqName);
  return `{[%spell ${e.card}${targets.length ? ' ' + targets.join(' ') : ''}]}`;
}

/** Texte des coups à partir d'un nœud (le nœud lui-même n'est pas écrit). */
export function writeMovetext(from: TreeNode): string {
  const out: string[] = [];
  const writeLine = (start: TreeNode, first: TreeNode) => {
    let needNumber = true;
    let parent = start;
    let node: TreeNode | undefined = first;
    while (node) {
      const s = parent.state;
      const e = node.entry!;
      const num = `${s.pos.fullmove}${s.pos.turn === 'w' ? '.' : '...'}`;
      if (e.k === 'card') {
        out.push(spellComment(e));
        if (CARDS[e.card]?.ritual && node.state.pos.turn !== s.pos.turn) {
          // Rituel : la carte remplace le coup, écrit comme un coup nul.
          out.push(`${num} --`);
          needNumber = false;
        } else needNumber = true;
      } else {
        out.push(s.pos.turn === 'w' || needNumber ? `${num} ${e.san}` : e.san);
        needNumber = false;
        for (const n of node.nags ?? []) out.push(`$${n}`);
        if (node.comment) {
          out.push(`{${node.comment.replace(/[{}]/g, '')}}`);
          needNumber = true;
        }
      }
      if (parent.children[0] === node && parent.children.length > 1) {
        for (const v of parent.children.slice(1)) {
          out.push('(');
          writeLine(parent, v);
          out.push(')');
        }
        needNumber = true;
      }
      parent = node;
      node = node.children[0];
    }
  };
  if (from.comment && !from.parent) out.push(`{${from.comment.replace(/[{}]/g, '')}}`);
  if (from.children[0]) writeLine(from, from.children[0]);
  let text = '';
  for (const tk of out) {
    if (!text) text = tk;
    else if (tk === ')' || text.endsWith('(')) text += tk;
    else text += ' ' + tk;
  }
  return text;
}

function wrap(text: string, width = 80): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && cur.length + 1 + w.length > width) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

export function writePgn(headers: Record<string, string>, root: TreeNode, result = headers.Result ?? '*'): string {
  const h: Record<string, string> = { Event: '?', Site: '?', Date: '????.??.??', Round: '-', White: '?', Black: '?', ...headers, Result: result };
  const startFen = toFen(root.state.pos);
  if (startFen !== START_FEN) {
    h.SetUp = '1';
    h.FEN = startFen;
  }
  const hasCards = (n: TreeNode): boolean => n.entry?.k === 'card' || n.children.some(hasCards);
  if (hasCards(root)) {
    h.Variant = 'Spellmate';
    if (root.state.catalog) h.Catalog = root.state.catalog;
  }
  const keys = [...TAG_ORDER, ...Object.keys(h).filter(k => !TAG_ORDER.includes(k))];
  const tags = keys.map(k => `[${k} "${escapeTag(h[k])}"]`).join('\n');
  const moves = writeMovetext(root);
  return `${tags}\n\n${wrap(moves ? `${moves} ${result}` : result)}\n`;
}

/** Date au format PGN (AAAA.MM.JJ). */
export function pgnDate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/** Résultat PGN d'un état terminé. */
export function pgnResult(s: GameState): string {
  if (!s.result) return '*';
  if (s.result.winner === 'w') return '1-0';
  if (s.result.winner === 'b') return '0-1';
  return '1/2-1/2';
}

// ---------------------------------------------------------------------------------------------
// Divers

/** Matériel (en points) de chaque camp, pour les tests et les bilans. */
export function material(s: GameState): Record<Color, number> {
  const v: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const out: Record<Color, number> = { w: 0, b: 0 };
  for (const p of s.pos.board) if (p) out[p.c] += v[p.t];
  return out;
}

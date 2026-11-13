// Échiquier interactif : glisser-déposer, clic-clic, promotion, effets visibles, ciblage des cartes.
// Capturer en glissant (décision D4 du plan V2) : lâcher une pièce sur une pièce adverse la prend si le coup est
// légal ; pendant le glisser, la case et la pièce qui seront prises se signalent. Un lâcher refusé sur une pièce
// adverse (Trêve, Lune de sang, roi en échec…) s'explique en une ligne au lieu d'un retour muet.
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Color, F_CAPTURE, Move, Piece, PieceType, Position, isSlider, kingSquare } from '../../shared/chess';
import type { Effect } from '../../shared/game';
import { CARDS } from '../../shared/cards';
import type { CardId } from '../../shared/cards';
import { boardStyle } from '../../shared/catalog';
import { BOARD_MARKS, PIECE_MARKS, SQUARE_MARKS } from '../vfx/boardMarks';
import type { PieceMark, SquareMark } from '../vfx/boardMarks';
import { cellOf, squareAt, squareOfCell } from './boardGeometry';
import { boardTheme } from './boardTheme';
import { fallSide } from './mate';
import { PIECE_NAMES, pieceUrl } from './pieces';
import { fullmoveOf, premoveDests, virtualBoard } from './premoves';
import type { Premove } from './premoves';

export interface BoardHandle {
  el: HTMLDivElement | null;
  wrap: HTMLDivElement | null;
  /** Annule tous les pré-coups en attente. */
  clearPremoves: () => void;
}

interface Props {
  pos: Position;
  orientation: Color;
  theme?: string;
  /** Coups légaux du joueur (vide si ce n'est pas à lui de jouer). */
  legal?: Move[];
  onMove?: (from: number, to: number, promo?: PieceType) => void;
  lastMove?: { from: number; to: number } | null;
  check?: number | null;
  /**
   * Échec et mat : case du roi maté (mate.ts, matedKing). Il vacille, bascule et reste couché sur sa case, à l'opposé
   * de la pièce qui vient de jouer (fallSide) ; il se relève dès que la prop change (nouvelle partie, autre position).
   * Retourner l'échiquier ne rejoue pas la chute. Le roi couché n'a deux éléments de plus (.pi-fall, .pi-dust) que
   * pendant ce temps : rien ne change pour les autres pièces.
   */
  mated?: number | null;
  effects?: Effect[];
  /** Mode ciblage d'une carte : cases cliquables. */
  targets?: number[] | null;
  targetHue?: number;
  chosen?: number[];
  onTarget?: (sq: number) => void;
  /** Pièces masquées le temps d'une animation. */
  hidden?: Set<number>;
  locked?: boolean;
  coords?: boolean;
  /**
   * Pré-coups (premoves.ts) : camp du joueur. Pendant le tour adverse (échiquier verrouillé), il prépare ses coups
   * suivants, sans limite ; ils se jouent d'eux-mêmes à son tour. Absent : pas de pré-coups (spectateur, fin).
   */
  premove?: Color | null;
  /** Nombre de pré-coups en attente, à chaque changement. */
  onPremoves?: (n: number) => void;
  /**
   * Rois des deux camps (objets king:*). Deux chaînes et non un objet : Board est mémoïsé. Absent, Arcane ou inconnu :
   * le roi Arcane. Le roi maté tombe avec la même image.
   */
  kingW?: string;
  kingB?: string;
}

interface Shown {
  p: Piece;
  sq: number;
  state: 'idle' | 'vanish' | 'appear';
  /** Déflagration : la pièce éclate (celle qui a pris, après avoir glissé jusqu'à sa victime, et la victime). */
  blast?: boolean;
}

const moveKey = (m: { from: number; to: number } | null | undefined) => (m ? `${m.from}-${m.to}` : '');

/** Cellule affichée d'une case : colonne et ligne de l'échiquier dessiné (boardGeometry). */
const xy = cellOf;

/** Ajoute `v` à l'ensemble `k` de `m`. */
function mark<K, V>(m: Map<K, Set<V>>, k: K, v: V) {
  let set = m.get(k);
  if (!set) m.set(k, (set = new Set()));
  set.add(v);
}

export const Board = memo(forwardRef<BoardHandle, Props>(function Board(props, ref) {
  const {
    pos, orientation, theme, legal = [], onMove, lastMove, check, mated = null, effects = [], targets, targetHue = 200,
    chosen = [], onTarget, hidden, locked, coords = true, premove, onPremoves, kingW, kingB,
  } = props;
  /** Image d'une pièce : le roi de chaque camp peut porter un skin. */
  const art = (p: Piece) => pieceUrl(p.c, p.t, p.t === 'k' ? (p.c === 'w' ? kingW : kingB) : undefined);
  const boardRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [queue, setQueue] = useState<Premove[]>([]);
  useImperativeHandle(ref, () => ({ el: boardRef.current, wrap: wrapRef.current, clearPremoves: () => setQueue([]) }), []);

  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ sq: number; x: number; y: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  /** Explication brève d'un lâcher refusé (Trêve, Lune de sang…) ; `key` la rejoue. */
  const [note, setNote] = useState<{ text: string; key: number } | null>(null);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2600);
    return () => clearTimeout(t);
  }, [note]);

  // Pièces affichées, avec fondu de sortie pour les pièces capturées
  const [shown, setShown] = useState<Shown[]>(() => pos.board.flatMap((p, sq) => (p ? [{ p, sq, state: 'idle' as const }] : [])));
  const prevIds = useRef<Set<number>>(new Set(pos.board.filter(Boolean).map(p => p!.id)));
  const shownRef = useRef(shown);
  shownRef.current = shown;
  /** Pièces qui glissent vers leur nouvelle case (le temps de leur transition) : peintes au-dessus des autres. Une
   *  pièce en transition devient un calque ; si d'autres pièces étaient peintes après elle et la chevauchaient, elles
   *  deviendraient des calques à leur tour et le plateau serait redécoupé (puis retramé) à chaque coup. */
  const [moving, setMoving] = useState<Set<number>>(() => new Set());
  const movingTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(movingTimer.current), []);
  const lastKeyRef = useRef(moveKey(lastMove));
  useEffect(() => {
    const now: Shown[] = [];
    const ids = new Set<number>();
    pos.board.forEach((p, sq) => {
      if (!p) return;
      ids.add(p.id);
      now.push({ p, sq, state: prevIds.current.has(p.id) ? 'idle' : 'appear' });
    });
    let gone: Shown[] = shownRef.current.filter(s => !ids.has(s.p.id) && s.state !== 'vanish').map(s => ({ ...s, state: 'vanish' as const }));
    prevIds.current = ids;
    const before = new Map(shownRef.current.map(s => [s.p.id, s.sq]));
    const moved = new Set(now.filter(s => before.has(s.p.id) && before.get(s.p.id) !== s.sq).map(s => s.p.id));
    if (moved.size) {
      setMoving(moved);
      window.clearTimeout(movingTimer.current);
      // Transition de .piece : 0,18 s (board.css)
      movingTimer.current = window.setTimeout(() => setMoving(new Set()), 240);
    }
    // Déflagration : la pièce qui vient de jouer a disparu, elle a donc pris et explosé avec sa victime. Elle glisse
    // jusqu'à la case de la prise, puis les deux pièces éclatent ensemble.
    const key = moveKey(lastMove);
    const fresh = key !== lastKeyRef.current;
    lastKeyRef.current = key;
    const sacrifice = fresh && !!lastMove && gone.some(s => s.sq === lastMove.from);
    if (sacrifice && lastMove) {
      gone = gone.map(s => ({ ...s, sq: s.sq === lastMove.from ? lastMove.to : s.sq, blast: true }));
      setBurst({ sq: lastMove.to, key: Date.now() });
    }
    // Ordre stable (par pièce, pas par case) : si React déplaçait le nœud d'une pièce dans le DOM, le navigateur
    // annulerait la transition et la pièce sauterait d'un coup à sa case d'arrivée.
    setShown([...now, ...gone].sort((a, b) => a.p.id - b.p.id));
    if (gone.length) {
      const t = setTimeout(() => setShown(cur => cur.filter(s => s.state !== 'vanish' || ids.has(s.p.id))), sacrifice ? 760 : 420);
      return () => clearTimeout(t);
    }
    // lastMove change en même temps que pos (même état de partie)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);
  const [burst, setBurst] = useState<{ sq: number; key: number } | null>(null);
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), 900);
    return () => clearTimeout(t);
  }, [burst]);

  useEffect(() => {
    setSelected(null);
    setPromo(null);
    setDrag(null);
    setHover(null);
  }, [pos, locked]);

  const movesFrom = useMemo(() => {
    const m = new Map<number, Move[]>();
    for (const mv of legal) {
      const list = m.get(mv.from) ?? [];
      list.push(mv);
      m.set(mv.from, list);
    }
    return m;
  }, [legal]);

  /** Effets actifs : marques sur les cases et les pièces (BOARD_MARKS), Climat en cours. */
  const fx = useMemo(() => {
    const squares = new Map<SquareMark, Set<number>>();
    const pieces = new Map<PieceMark, Set<number>>();
    const sliders = new Map<PieceMark, Set<Color>>();
    let climate: CardId | null = null;
    for (const e of effects) {
      if (e.pending) continue;
      if (CARDS[e.card]?.family === 'climat') climate = e.card;
      const m = BOARD_MARKS[e.card];
      if (!m) continue;
      if (m.on === 'square') mark(squares, m.cls, e.square!);
      else if (m.on === 'squares') for (const q of e.squares ?? []) mark(squares, m.cls, q);
      else if (m.on === 'piece') mark(pieces, m.cls, e.pieceId!);
      else mark(sliders, m.cls, e.countsOn);
    }
    return { squares, pieces, sliders, climate };
  }, [effects]);

  const targetSet = useMemo(() => new Set(targets ?? []), [targets]);
  const targeting = !!targets;
  /** Tour adverse : le joueur prépare des pré-coups sur la position virtuelle (ses pré-coups déjà joués). */
  const premoving = !!locked && !!premove && !targeting && !!onMove;
  const interactive = (!locked || premoving) && !targeting && !!onMove;
  const vb = useMemo(() => (queue.length ? virtualBoard(pos.board, queue) : pos.board), [pos, queue]);
  /** Pièces fantômes : chaque pré-coup, à sa case d'arrivée, numéroté ; `live` : la pièce y est encore (virtuellement). */
  const ghosts = useMemo(() => {
    const out: { i: number; m: Premove; p: Piece; live: boolean }[] = [];
    let b = pos.board;
    queue.forEach((m, i) => {
      const king = b[m.from]?.t === 'k' && Math.abs(m.to - m.from) === 2;
      b = virtualBoard(b, [m]);
      const p = b[m.to];
      if (p) out.push({ i, m, p, live: false });
      // Roque : la tour a aussi son fantôme, même numéro
      if (king) {
        const side = m.to > m.from ? 1 : -1;
        const rook = b[m.from + side];
        if (rook) out.push({ i, m: { id: rook.id, from: side > 0 ? m.from + 3 : m.from - 4, to: m.from + side }, p: rook, live: false });
      }
    });
    for (const g of out) g.live = vb[g.m.to]?.id === g.p.id && !queue.some((m, j) => j > g.i && m.id === g.p.id);
    return out;
  }, [pos, queue, vb]);

  // Pas de pré-coups hors du jeu ; une partie nouvelle (ou un retour en arrière) les efface
  useEffect(() => {
    if (!premove) setQueue([]);
  }, [premove]);
  const fmRef = useRef(fullmoveOf(pos));
  useEffect(() => {
    const fm = fullmoveOf(pos);
    if (fm < fmRef.current) setQueue([]);
    fmRef.current = fm;
  }, [pos]);
  const onPremovesRef = useRef(onPremoves);
  onPremovesRef.current = onPremoves;
  useEffect(() => {
    onPremovesRef.current?.(queue.length);
  }, [queue.length]);

  // À son tour, le premier pré-coup se joue s'il est légal ; sinon, tous sont annulés
  const legalRef = useRef(legal);
  legalRef.current = legal;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const firedRef = useRef<Position | null>(null);
  useEffect(() => {
    if (!queue.length || locked || !premove || !legalRef.current.length || firedRef.current === pos) return;
    const t = setTimeout(() => {
      const [first, ...rest] = queue;
      const cands = legalRef.current.filter(m => m.from === first.from && m.to === first.to);
      if (pos.board[first.from]?.id !== first.id || !cands.length) {
        setQueue([]);
        setNote({ text: queue.length > 1 ? 'Pré-coup impossible : pré-coups annulés.' : 'Pré-coup impossible : annulé.', key: Date.now() });
        return;
      }
      firedRef.current = pos;
      setQueue(rest);
      onMoveRef.current?.(first.from, first.to, cands.find(m => m.promo === 'q')?.promo ?? cands[0].promo);
    }, 120);
    return () => clearTimeout(t);
  }, [pos, locked, premove, queue, legal.length]);

  const sqFromPoint = useCallback((cx: number, cy: number): number | null => {
    const el = boardRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return squareAt((cx - r.left) / r.width, (cy - r.top) / r.height, orientation);
  }, [orientation]);

  const tryMove = useCallback((from: number, to: number): boolean => {
    if (premoving) {
      const p = vb[from];
      if (!p || p.c !== premove || !premoveDests(vb, from, pos.castling, queue).includes(to)) return false;
      setQueue(q => [...q, { id: p.id, from, to }]);
      setSelected(null);
      return true;
    }
    const cands = (movesFrom.get(from) ?? []).filter(m => m.to === to);
    if (!cands.length) return false;
    if (cands.some(m => m.promo)) {
      setPromo({ from, to });
      return true;
    }
    onMove?.(from, to);
    setSelected(null);
    return true;
  }, [movesFrom, onMove, premoving, vb, premove, pos.castling, queue]);

  /** Pourquoi la pièce de `from` ne peut pas aller en `to` (lâcher refusé sur une pièce adverse, pièce bloquée). */
  const refusal = (from: number, to: number | null): string | null => {
    const mover = pos.board[from];
    if (!mover) return null;
    const victim = to !== null ? pos.board[to] : null;
    const capture = !!victim && victim.c !== mover.c;
    if (to !== null && !capture) {
      // Lune de sang : un coup tranquille alors qu'une prise existe
      if (fx.climate === 'blood_moon' && legal.some(m => m.flags & F_CAPTURE)) return `${CARDS.blood_moon.name} : vous devez capturer.`;
      return null;
    }
    if (to === null) {
      if (mover.t === 'p' && fx.climate === 'ice_age') return `${CARDS.ice_age.name} : les pions sont gelés.`;
      if (fx.pieces.get('frozen')?.has(mover.id)) return 'Cette pièce est gelée.';
      return null;
    }
    if (fx.climate === 'truce') return `${CARDS.truce.name} : aucune capture pendant ce Climat.`;
    if (mover.t === 'p' && fx.climate === 'ice_age') return `${CARDS.ice_age.name} : les pions ne capturent pas.`;
    if (fx.climate === 'blood_moon') return `${CARDS.blood_moon.name} : choisissez une des prises possibles.`;
    if (victim && fx.pieces.get('shielded')?.has(victim.id)) return 'Cette pièce est protégée.';
    if (victim?.t === 'k') return null;
    return legal.length ? 'Cette prise n’est pas permise ici.' : null;
  };

  const cancelPremoves = () => {
    setQueue([]);
    setSelected(null);
    setNote({ text: 'Pré-coups annulés.', key: Date.now() });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Clic droit : annule les pré-coups
    if (e.button === 2 && queue.length) {
      cancelPremoves();
      return;
    }
    if (e.button !== 0) return;
    if (e.pointerType === 'mouse') {
      // Pas de sélection de texte ni de glisser-déposer natif à la souris (voir board.css) : sinon, dès le troisième
      // glisser de suite, le navigateur part d'une sélection, envoie pointercancel et la pièce revient sans rien dire.
      // On garde l'effet normal d'un clic sur le focus : ce qui l'avait hors de l'échiquier le perd.
      e.preventDefault();
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && !e.currentTarget.contains(active)) active.blur();
    }
    const sq = sqFromPoint(e.clientX, e.clientY);
    if (sq === null) return;
    if (targeting) {
      if (targetSet.has(sq)) onTarget?.(sq);
      return;
    }
    if (!interactive || promo) return;
    if (selected !== null && selected !== sq && tryMove(selected, sq)) return;
    if (premoving) {
      if (vb[sq]?.c === premove) {
        setSelected(sq);
        setDrag({ sq, x: e.clientX, y: e.clientY, moved: false });
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else if (selected === null && queue.length) {
        // Appui hors de ses pièces, sans pièce choisie : les pré-coups s'annulent
        cancelPremoves();
      } else {
        setSelected(null);
      }
      return;
    }
    if (movesFrom.has(sq)) {
      setSelected(sq);
      setDrag({ sq, x: e.clientX, y: e.clientY, moved: false });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } else {
      // Pièce du camp au trait sans aucun coup (gelée…) : on dit pourquoi
      const p = pos.board[sq];
      const why = p && p.c === pos.turn && legal.length ? refusal(sq, null) : null;
      if (why) setNote({ text: why, key: Date.now() });
      setSelected(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, moved });
    setHover(sqFromPoint(e.clientX, e.clientY));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const sq = sqFromPoint(e.clientX, e.clientY);
    if (drag.moved && sq !== null && sq !== drag.sq && !tryMove(drag.sq, sq)) {
      const why = refusal(drag.sq, sq);
      if (why) setNote({ text: why, key: Date.now() });
    }
    setDrag(null);
    setHover(null);
  };

  const sel = selected;
  const dests = new Map<number, boolean>();
  if (premoving) {
    if (sel !== null) for (const to of premoveDests(vb, sel, pos.castling, queue)) dests.set(to, !!vb[to] && vb[to]!.c !== premove);
  } else {
    for (const m of sel !== null ? movesFrom.get(sel) ?? [] : []) dests.set(m.to, !!(m.flags & F_CAPTURE));
  }
  const preFrom = new Set(queue.map(m => m.from));
  const preTo = new Set(queue.map(m => m.to));

  const bs = boardStyle(theme);
  const bt = boardTheme(theme);
  const style = {
    '--light': bs.light,
    '--dark': bs.dark,
    '--frame': bs.frame,
    '--coords': bs.coords,
    '--th': targetHue,
    ...bt.vars,
  } as CSSProperties;

  const squares = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const sq = squareOfCell(x, y, orientation);
      const light = (x + y) % 2 === 0;
      const cls = ['sq', light ? 'l' : 'd'];
      if (lastMove && (lastMove.from === sq || lastMove.to === sq)) cls.push('last');
      if (sel === sq) cls.push('sel');
      if (preTo.has(sq)) cls.push('pm-to');
      else if (preFrom.has(sq)) cls.push('pm-from');
      if (check === sq) cls.push('check');
      for (const m of SQUARE_MARKS) if (fx.squares.get(m)?.has(sq)) cls.push(m);
      if (targeting && targetSet.has(sq)) cls.push('target');
      if (chosen.includes(sq)) cls.push('chosen');
      if (drag?.moved && hover === sq && dests.has(sq)) cls.push(dests.get(sq) ? 'hover hover-cap' : 'hover');
      squares.push(
        <div key={sq} className={cls.join(' ')} data-sq={sq}>
          {dests.has(sq) && <span className={dests.get(sq) ? 'hint cap' : 'hint'} />}
          {coords && y === 7 && <span className="co co-f">{'abcdefgh'[sq & 7]}</span>}
          {coords && x === 0 && <span className="co co-r">{(sq >> 3) + 1}</span>}
        </div>,
      );
    }
  }

  // Roi maté : côté de la chute à l'écran (+1 : vers la droite). fallSide raisonne en colonnes ; vus des Noirs, les
  // colonnes vont de droite à gauche. Figé à l'apparition du mat (clé : la case du roi) : retourner l'échiquier
  // ensuite changerait la classe fall-r / fall-l, donc le nom de l'animation, et le roi se relèverait pour retomber.
  // Couché, il garde son côté à l'écran ; que sa tête pointe alors vers l'autre colonne ne se remarque pas.
  const fallRef = useRef<{ sq: number; side: number } | null>(null);
  if (mated === null) fallRef.current = null;
  else if (fallRef.current?.sq !== mated) {
    fallRef.current = { sq: mated, side: fallSide(pos, mated, lastMove?.to) * (orientation === 'w' ? 1 : -1) };
  }
  const fall = fallRef.current?.side ?? 0;

  const boardEl = boardRef.current;
  const dragOffset = (() => {
    if (!drag?.moved || !boardEl) return null;
    const r = boardEl.getBoundingClientRect();
    const size = r.width / 8;
    return { x: drag.x - r.left - size / 2, y: drag.y - r.top - size / 2 };
  })();

  return (
    <div ref={wrapRef} className={`board-wrap ${bt.className}${fx.climate ? ` clim clim-${fx.climate}` : ''}`} style={style}>
      <div
        ref={boardRef}
        className={`board ${interactive ? 'interactive' : ''} ${targeting ? 'targeting' : ''} ${premoving ? 'is-premove' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { setDrag(null); setHover(null); }}
        onDragStart={e => e.preventDefault()}
        onContextMenu={e => e.preventDefault()}
      >
        <div className="squares">{squares}</div>
        <div className="pieces">
          {shown.map(({ p, sq, state, blast }) => {
            if (hidden?.has(p.id) && state !== 'vanish') return null;
            const { x, y } = xy(sq, orientation);
            // En pré-coup, on ne glisse la pièce réelle que si elle n'a pas déjà un pré-coup (sinon : son fantôme)
            const dragging = drag?.moved && drag.sq === sq && state === 'idle' && (!premoving || vb[sq]?.id === p.id);
            const cls = ['piece', state];
            if (blast) cls.push('is-blast');
            if (p.t === 'p') cls.push('pawn');
            if (p.t === 'p' && fx.climate === 'ice_age') cls.push('chilled');
            for (const m of PIECE_MARKS) if (fx.pieces.get(m)?.has(p.id) || (fx.sliders.get(m)?.has(p.c) && isSlider(p.t))) cls.push(m);
            if (dragging) cls.push('dragging');
            if (moving.has(p.id)) cls.push('is-moving');
            // Pièce qui sera prise si l'on lâche ici
            if (drag?.moved && hover === sq && !dragging && state === 'idle' && dests.get(sq)) cls.push('is-prey');
            // Roi maté : l'image passe dans un élément intérieur, qui tombe dans le plan de .pi. Ainsi la chute se
            // compose avec la rotation qui redresse .pi sur l'échiquier incliné (board.css, is-tilting) sans y toucher.
            // Une pièce cachée (sort en cours) tombe quand elle réapparaît.
            const fallen = mated === sq && p.t === 'k' && state !== 'vanish';
            if (fallen) cls.push('is-mated', fall > 0 ? 'fall-r' : 'fall-l');
            const transform = dragging && dragOffset
              ? `translate(${dragOffset.x}px, ${dragOffset.y}px)`
              : `translate(${x * 100}%, ${y * 100}%)`;
            const image = { backgroundImage: art(p) };
            return (
              <div key={p.id} className={cls.join(' ')} style={{ transform }} data-piece={p.id} data-at={sq}>
                {/* Poussière de la chute : hors de .pi, sinon le drop-shadow de .pi lui ferait une ombre sale (et le
                    filtre d'une pièce gelée la teinterait) ; placée avant, elle est peinte sous le roi */}
                {fallen && <span className="pi-dust" aria-hidden="true" />}
                <div className="pi" style={fallen ? undefined : image}>
                  {fallen && <div className="pi-fall" style={image} />}
                </div>
              </div>
            );
          })}
          {ghosts.map(({ i, m, p, live }) => {
            const { x, y } = xy(m.to, orientation);
            const dragging = live && premoving && drag?.moved && drag.sq === m.to && pos.board[m.to]?.id !== p.id;
            const transform = dragging && dragOffset ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : `translate(${x * 100}%, ${y * 100}%)`;
            return (
              <div key={`pm-${i}-${p.id}`} className={`piece ghost ${live ? 'is-live' : ''} ${dragging ? 'dragging' : ''}`} style={{ transform }} aria-hidden="true">
                <div className="pi" style={{ backgroundImage: art(p) }} />
                <span className="pm-n">{i + 1}</span>
              </div>
            );
          })}
          {burst && (() => {
            const { x, y } = xy(burst.sq, orientation);
            return <span key={burst.key} className="board-burst" style={{ transform: `translate(${x * 100}%, ${y * 100}%)` }} aria-hidden="true" />;
          })()}
        </div>
        {note && (
          <p key={note.key} className="board-note" role="status">
            {note.text}
          </p>
        )}
        {promo && (
          <PromotionPicker
            color={pos.board[promo.from]?.c ?? 'w'}
            x={xy(promo.to, orientation).x}
            top={xy(promo.to, orientation).y === 0}
            onPick={t => {
              onMove?.(promo.from, promo.to, t);
              setPromo(null);
              setSelected(null);
            }}
            onCancel={() => setPromo(null)}
          />
        )}
      </div>
    </div>
  );
}));

function PromotionPicker({ color, x, top, onPick, onCancel }: { color: Color; x: number; top: boolean; onPick: (t: PieceType) => void; onCancel: () => void }) {
  const types: PieceType[] = ['q', 'n', 'r', 'b'];
  return (
    <div className="promo-veil" onPointerDown={e => { e.stopPropagation(); onCancel(); }}>
      <div className="promo" style={{ left: `${x * 12.5}%`, [top ? 'top' : 'bottom']: 0 }} onPointerDown={e => e.stopPropagation()}>
        {types.map(t => (
          <button key={t} onClick={() => onPick(t)} style={{ backgroundImage: pieceUrl(color, t) }} aria-label={PIECE_NAMES[t]} />
        ))}
      </div>
    </div>
  );
}

/** Case du roi en échec, si besoin. */
export function checkSquare(pos: Position, inCheckColor: Color | null): number | null {
  if (!inCheckColor) return null;
  const k = kingSquare(pos, inCheckColor);
  return k >= 0 ? k : null;
}

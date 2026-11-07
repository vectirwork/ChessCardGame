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
import { pieceUrl } from './pieces';

export interface BoardHandle {
  el: HTMLDivElement | null;
  wrap: HTMLDivElement | null;
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
}

interface Shown {
  p: Piece;
  sq: number;
  state: 'idle' | 'vanish' | 'appear';
}

const textureClass = (theme: string | undefined) => `tex-${boardStyle(theme).texture}`;

function xy(sq: number, o: Color) {
  const f = sq & 7, r = sq >> 3;
  return o === 'w' ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
}

export const Board = memo(forwardRef<BoardHandle, Props>(function Board(props, ref) {
  const {
    pos, orientation, theme, legal = [], onMove, lastMove, check, effects = [], targets, targetHue = 200, chosen = [],
    onTarget, hidden, locked, coords = true,
  } = props;
  const boardRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ el: boardRef.current, wrap: wrapRef.current }), []);

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
  useEffect(() => {
    const now: Shown[] = [];
    const ids = new Set<number>();
    pos.board.forEach((p, sq) => {
      if (!p) return;
      ids.add(p.id);
      now.push({ p, sq, state: prevIds.current.has(p.id) ? 'idle' : 'appear' });
    });
    const gone = shownRef.current.filter(s => !ids.has(s.p.id) && s.state !== 'vanish').map(s => ({ ...s, state: 'vanish' as const }));
    prevIds.current = ids;
    // Ordre stable (par pièce, pas par case) : si React déplaçait le nœud d'une pièce dans le DOM, le navigateur
    // annulerait la transition et la pièce sauterait d'un coup à sa case d'arrivée.
    setShown([...now, ...gone].sort((a, b) => a.p.id - b.p.id));
    if (gone.length) {
      const t = setTimeout(() => setShown(cur => cur.filter(s => s.state !== 'vanish' || ids.has(s.p.id))), 420);
      return () => clearTimeout(t);
    }
  }, [pos]);

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

  const fx = useMemo(() => {
    const iced = new Set<number>();
    const frozen = new Set<number>();
    const shielded = new Set<number>();
    const leap = new Set<number>();
    const phase = new Set<number>();
    const weighted = new Set<Color>();
    const rift = new Set<number>();
    let climate: CardId | null = null;
    for (const e of effects) {
      if (e.pending) continue;
      if (CARDS[e.card]?.family === 'climat') climate = e.card;
      if (e.card === 'rift') for (const q of e.squares ?? []) rift.add(q);
      if (e.card === 'ice_wall') iced.add(e.square!);
      if (e.card === 'freeze') frozen.add(e.pieceId!);
      if (e.card === 'shield') shielded.add(e.pieceId!);
      if (e.card === 'knight_leap') leap.add(e.pieceId!);
      if (e.card === 'phase') phase.add(e.pieceId!);
      if (e.card === 'gravity') weighted.add(e.countsOn);
    }
    return { iced, frozen, shielded, leap, phase, weighted, rift, climate };
  }, [effects]);

  const targetSet = useMemo(() => new Set(targets ?? []), [targets]);
  const targeting = !!targets;
  const interactive = !locked && !targeting && !!onMove;

  const sqFromPoint = useCallback((cx: number, cy: number): number | null => {
    const el = boardRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = Math.floor(((cx - r.left) / r.width) * 8);
    const y = Math.floor(((cy - r.top) / r.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return orientation === 'w' ? (7 - y) * 8 + x : y * 8 + (7 - x);
  }, [orientation]);

  const tryMove = useCallback((from: number, to: number): boolean => {
    const cands = (movesFrom.get(from) ?? []).filter(m => m.to === to);
    if (!cands.length) return false;
    if (cands.some(m => m.promo)) {
      setPromo({ from, to });
      return true;
    }
    onMove?.(from, to);
    setSelected(null);
    return true;
  }, [movesFrom, onMove]);

  /** Pourquoi la pièce de `from` ne peut pas aller en `to` (lâcher refusé sur une pièce adverse, pièce bloquée). */
  const refusal = (from: number, to: number | null): string | null => {
    const mover = pos.board[from];
    if (!mover) return null;
    const victim = to !== null ? pos.board[to] : null;
    const capture = !!victim && victim.c !== mover.c;
    if (to !== null && !capture) {
      // Lune de sang : un coup tranquille alors qu'une prise existe
      if (fx.climate === 'blood_moon' && legal.some(m => m.flags & F_CAPTURE)) return 'Lune de sang : vous devez capturer.';
      return null;
    }
    if (to === null) {
      if (mover.t === 'p' && fx.climate === 'ice_age') return 'Ère glaciaire : les pions sont gelés.';
      if (fx.frozen.has(mover.id)) return 'Cette pièce est gelée.';
      return null;
    }
    if (fx.climate === 'truce') return 'Trêve : aucune capture pendant ce Climat.';
    if (mover.t === 'p' && fx.climate === 'ice_age') return 'Ère glaciaire : les pions ne capturent pas.';
    if (fx.climate === 'blood_moon') return 'Lune de sang : choisissez une des prises possibles.';
    if (victim && fx.shielded.has(victim.id)) return 'Cette pièce est protégée.';
    if (victim?.t === 'k') return null;
    return legal.length ? 'Cette prise n’est pas permise ici.' : null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
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
  const selMoves = sel !== null ? movesFrom.get(sel) ?? [] : [];
  const dests = new Map<number, boolean>();
  for (const m of selMoves) dests.set(m.to, !!(m.flags & F_CAPTURE));

  const bs = boardStyle(theme);
  const style = {
    '--light': bs.light,
    '--dark': bs.dark,
    '--frame': bs.frame,
    '--coords': bs.coords,
    '--th': targetHue,
  } as CSSProperties;

  const squares = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const sq = orientation === 'w' ? (7 - y) * 8 + x : y * 8 + (7 - x);
      const light = (x + y) % 2 === 0;
      const cls = ['sq', light ? 'l' : 'd'];
      if (lastMove && (lastMove.from === sq || lastMove.to === sq)) cls.push('last');
      if (sel === sq) cls.push('sel');
      if (check === sq) cls.push('check');
      if (fx.iced.has(sq)) cls.push('iced');
      if (fx.rift.has(sq)) cls.push('rift');
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

  const boardEl = boardRef.current;
  const dragOffset = (() => {
    if (!drag?.moved || !boardEl) return null;
    const r = boardEl.getBoundingClientRect();
    const size = r.width / 8;
    return { x: drag.x - r.left - size / 2, y: drag.y - r.top - size / 2 };
  })();

  return (
    <div ref={wrapRef} className={`board-wrap ${textureClass(theme)}${fx.climate ? ` clim clim-${fx.climate}` : ''}`} style={style}>
      <div
        ref={boardRef}
        className={`board ${interactive ? 'interactive' : ''} ${targeting ? 'targeting' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { setDrag(null); setHover(null); }}
        onDragStart={e => e.preventDefault()}
        onContextMenu={e => e.preventDefault()}
      >
        <div className="squares">{squares}</div>
        <div className="pieces">
          {shown.map(({ p, sq, state }) => {
            if (hidden?.has(p.id) && state !== 'vanish') return null;
            const { x, y } = xy(sq, orientation);
            const dragging = drag?.moved && drag.sq === sq && state === 'idle';
            const cls = ['piece', state];
            if (p.t === 'p') cls.push('pawn');
            if (p.t === 'p' && fx.climate === 'ice_age') cls.push('chilled');
            if (fx.frozen.has(p.id)) cls.push('frozen');
            if (fx.shielded.has(p.id)) cls.push('shielded');
            if (fx.leap.has(p.id)) cls.push('leaping');
            if (fx.phase.has(p.id)) cls.push('phasing');
            if (fx.weighted.has(p.c) && isSlider(p.t)) cls.push('weighted');
            if (dragging) cls.push('dragging');
            // Pièce qui sera prise si l'on lâche ici
            if (drag?.moved && hover === sq && !dragging && state === 'idle' && dests.get(sq)) cls.push('is-prey');
            const transform = dragging && dragOffset
              ? `translate(${dragOffset.x}px, ${dragOffset.y}px)`
              : `translate(${x * 100}%, ${y * 100}%)`;
            return (
              <div key={p.id} className={cls.join(' ')} style={{ transform }} data-piece={p.id} data-at={sq}>
                <div className="pi" style={{ backgroundImage: pieceUrl(p.c, p.t) }} />
              </div>
            );
          })}
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
          <button key={t} onClick={() => onPick(t)} style={{ backgroundImage: pieceUrl(color, t) }} aria-label={t} />
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

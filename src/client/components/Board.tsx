// Échiquier interactif : glisser-déposer, clic-clic, promotion, effets visibles, ciblage des cartes.
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Color, F_CAPTURE, Move, Piece, PieceType, Position, isSlider, kingSquare } from '../../shared/chess';
import type { Effect } from '../../shared/game';
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

  // Pièces affichées, avec fondu de sortie pour les pièces capturées
  const [shown, setShown] = useState<Shown[]>(() => pos.board.flatMap((p, sq) => (p ? [{ p, sq, state: 'idle' as const }] : [])));
  const prevIds = useRef<Set<number>>(new Set(pos.board.filter(Boolean).map(p => p!.id)));
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
    setShown([...now, ...gone]);
    if (gone.length) {
      const t = setTimeout(() => setShown(cur => cur.filter(s => s.state !== 'vanish' || ids.has(s.p.id))), 420);
      return () => clearTimeout(t);
    }
  }, [pos]);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    setSelected(null);
    setPromo(null);
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
    for (const e of effects) {
      if (e.card === 'ice_wall') iced.add(e.square!);
      if (e.card === 'freeze') frozen.add(e.pieceId!);
      if (e.card === 'shield') shielded.add(e.pieceId!);
      if (e.card === 'knight_leap') leap.add(e.pieceId!);
      if (e.card === 'phase') phase.add(e.pieceId!);
      if (e.card === 'gravity') weighted.add(e.countsOn);
    }
    return { iced, frozen, shielded, leap, phase, weighted };
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

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
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
    if (drag.moved && sq !== null && sq !== drag.sq) tryMove(drag.sq, sq);
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
      if (targeting && targetSet.has(sq)) cls.push('target');
      if (chosen.includes(sq)) cls.push('chosen');
      if (drag?.moved && hover === sq && dests.has(sq)) cls.push('hover');
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
    <div ref={wrapRef} className={`board-wrap ${textureClass(theme)}`} style={style}>
      <div
        ref={boardRef}
        className={`board ${interactive ? 'interactive' : ''} ${targeting ? 'targeting' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onContextMenu={e => e.preventDefault()}
      >
        <div className="squares">{squares}</div>
        <div className="pieces">
          {shown.map(({ p, sq, state }) => {
            if (hidden?.has(p.id) && state !== 'vanish') return null;
            const { x, y } = xy(sq, orientation);
            const dragging = drag?.moved && drag.sq === sq && state === 'idle';
            const cls = ['piece', state];
            if (fx.frozen.has(p.id)) cls.push('frozen');
            if (fx.shielded.has(p.id)) cls.push('shielded');
            if (fx.leap.has(p.id)) cls.push('leaping');
            if (fx.phase.has(p.id)) cls.push('phasing');
            if (fx.weighted.has(p.c) && isSlider(p.t)) cls.push('weighted');
            if (dragging) cls.push('dragging');
            const transform = dragging && dragOffset
              ? `translate(${dragOffset.x}px, ${dragOffset.y}px)`
              : `translate(${x * 100}%, ${y * 100}%)`;
            return (
              <div key={p.id} className={cls.join(' ')} style={{ transform }} data-piece={p.id}>
                <div className="pi" style={{ backgroundImage: pieceUrl(p.c, p.t) }} />
              </div>
            );
          })}
        </div>
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

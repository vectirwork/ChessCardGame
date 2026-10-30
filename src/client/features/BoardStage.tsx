// Échiquier des fonctions classiques : le composant Board du site, plus un calque d'illustration
// (flèches, étoiles à ramasser, cases marquées) et un retour visuel bref (coup juste ou faux).
import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Board, BoardHandle } from '../components/Board';
import type { Color, Move, PieceType } from '../../shared/chess';
import { kingSquare } from '../../shared/chess';
import { GameState, sideInCheck } from '../../shared/game';

export type ArrowTone = 'gold' | 'cyan' | 'green' | 'red';

export interface Arrow {
  from: number;
  to: number;
  tone?: ArrowTone;
}

interface Props {
  state: GameState;
  orientation: Color;
  legal?: Move[];
  onMove?: (from: number, to: number, promo?: PieceType) => void;
  lastMove?: { from: number; to: number } | null;
  arrows?: Arrow[];
  stars?: number[];
  marks?: number[];
  /** Case à faire briller brièvement (indice). */
  glow?: number | null;
  flash?: 'ok' | 'bad' | null;
  locked?: boolean;
  targets?: number[] | null;
  targetHue?: number;
  chosen?: number[];
  onTarget?: (sq: number) => void;
  /** Contenu à gauche de l'échiquier (barre d'évaluation). */
  aside?: ReactNode;
  label?: string;
}

const TONE: Record<ArrowTone, string> = {
  gold: 'rgba(243, 201, 105, 0.86)',
  cyan: 'rgba(127, 231, 255, 0.82)',
  green: 'rgba(95, 224, 168, 0.85)',
  red: 'rgba(255, 107, 129, 0.85)',
};

function center(sq: number, o: Color) {
  const f = sq & 7, r = sq >> 3;
  const x = o === 'w' ? f : 7 - f;
  const y = o === 'w' ? 7 - r : r;
  return { x: x * 100 + 50, y: y * 100 + 50 };
}

function ArrowShape({ a, o }: { a: Arrow; o: Color }) {
  const p = center(a.from, o), q = center(a.to, o);
  const dx = q.x - p.x, dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const head = 34, half = 22, w = 13;
  const sx = p.x + ux * 22, sy = p.y + uy * 22;
  const bx = q.x - ux * head, by = q.y - uy * head;
  const nx = -uy, ny = ux;
  const color = TONE[a.tone ?? 'gold'];
  return (
    <g>
      <line x1={sx} y1={sy} x2={bx} y2={by} stroke={color} strokeWidth={w} strokeLinecap="round" />
      <polygon points={`${q.x - ux * 6},${q.y - uy * 6} ${bx + nx * half},${by + ny * half} ${bx - nx * half},${by - ny * half}`} fill={color} />
    </g>
  );
}

const STAR = 'M0,-30 L8.8,-12.1 L28.5,-9.3 L14.3,4.6 L17.6,24.3 L0,15 L-17.6,24.3 L-14.3,4.6 L-28.5,-9.3 L-8.8,-12.1 Z';

/** Case du roi au trait en échec (positions d'étude sans roi comprises). */
export function checkOf(s: GameState): number | null {
  const k = kingSquare(s.pos, s.pos.turn);
  if (k < 0) return null;
  try {
    return sideInCheck(s) ? k : null;
  } catch {
    return null;
  }
}

export const BoardStage = forwardRef<BoardHandle, Props>(function BoardStage(props, ref) {
  const { state, orientation, arrows = [], stars = [], marks = [], glow = null, flash = null, aside, label } = props;
  return (
    <div className={`ft-stage ${aside ? 'has-aside' : ''}`}>
      {aside}
      <div className={`ft-board ${flash ? `flash-${flash}` : ''}`} aria-label={label ?? 'Échiquier'}>
        <Board
          ref={ref}
          pos={state.pos}
          orientation={orientation}
          legal={props.legal}
          onMove={props.onMove}
          lastMove={props.lastMove}
          check={checkOf(state)}
          effects={state.effects}
          targets={props.targets}
          targetHue={props.targetHue}
          chosen={props.chosen}
          onTarget={props.onTarget}
          locked={props.locked}
        />
        {(arrows.length > 0 || stars.length > 0 || marks.length > 0 || glow !== null) && (
          <svg className="ft-overlay" viewBox="0 0 800 800" aria-hidden="true">
            {marks.map(sq => {
              const c = center(sq, orientation);
              return <rect key={`m${sq}`} className="ft-mark" x={c.x - 46} y={c.y - 46} width={92} height={92} rx={10} />;
            })}
            {glow !== null && (() => {
              const c = center(glow, orientation);
              return <circle className="ft-glow" cx={c.x} cy={c.y} r={40} />;
            })()}
            {stars.map(sq => {
              const c = center(sq, orientation);
              return (
                <g key={`s${sq}`} className="ft-star" transform={`translate(${c.x} ${c.y})`}>
                  <circle r={34} className="ft-star-halo" />
                  <path d={STAR} />
                </g>
              );
            })}
            {arrows.map((a, i) => <ArrowShape key={`a${i}`} a={a} o={orientation} />)}
          </svg>
        )}
      </div>
    </div>
  );
});

/** Dernier coup de l'état, pour la surbrillance. */
export function lastMoveOf(s: GameState): { from: number; to: number } | null {
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i];
    if (e.k === 'move') return e.from >= 0 ? { from: e.from, to: e.to } : null;
  }
  return null;
}

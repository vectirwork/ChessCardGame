// Petit échiquier statique (vignettes des listes) ; sert aussi de plateau à l'éditeur de position.
import { memo } from 'react';
import type { CSSProperties } from 'react';
import { Color, Piece, fromFen } from '../../shared/chess';
import { boardStyle } from '../../shared/catalog';
import { pieceUrl } from '../components/pieces';

interface Props {
  fen?: string;
  board?: (Piece | null)[];
  orientation?: Color;
  coords?: boolean;
  onSquare?: (sq: number, e: React.PointerEvent) => void;
  highlight?: number[];
  className?: string;
  label?: string;
}

export const MiniBoard = memo(function MiniBoard({ fen, board, orientation = 'w', coords = false, onSquare, highlight = [], className = '', label }: Props) {
  const cells = board ?? (fen ? safeBoard(fen) : new Array(64).fill(null));
  const bs = boardStyle(undefined);
  const style = { '--light': bs.light, '--dark': bs.dark, '--coords': bs.coords } as CSSProperties;
  const out = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const sq = orientation === 'w' ? (7 - y) * 8 + x : y * 8 + (7 - x);
      const p = cells[sq];
      const light = (x + y) % 2 === 0;
      out.push(
        <div
          key={sq}
          className={`mb-sq ${light ? 'l' : 'd'} ${highlight.includes(sq) ? 'hl' : ''}`}
          data-sq={sq}
          onPointerDown={onSquare ? e => onSquare(sq, e) : undefined}
          onContextMenu={onSquare ? e => e.preventDefault() : undefined}
        >
          {p && <span className="mb-pc" style={{ backgroundImage: pieceUrl(p.c, p.t) }} />}
          {coords && y === 7 && <span className="mb-co f">{'abcdefgh'[sq & 7]}</span>}
          {coords && x === 0 && <span className="mb-co r">{(sq >> 3) + 1}</span>}
        </div>,
      );
    }
  }
  return (
    <div className={`mini-board ${onSquare ? 'editable' : ''} ${className}`} style={style} role="img" aria-label={label ?? 'Position'}>
      {out}
    </div>
  );
});

function safeBoard(fen: string): (Piece | null)[] {
  try {
    return fromFen(fen).pos.board;
  } catch {
    return new Array(64).fill(null);
  }
}

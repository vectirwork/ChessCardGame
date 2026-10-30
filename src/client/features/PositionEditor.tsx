// Éditeur de position sobre : une palette de pièces, un plateau, le trait et les roques.
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Color, Piece, PieceType, fromFen } from '../../shared/chess';
import { START_FEN, validateFen } from '../../shared/pgn';
import { pieceUrl } from '../components/pieces';
import { MiniBoard } from './MiniBoard';

type Tool = { c: Color; t: PieceType } | 'erase';

const TYPES: PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];
const NAMES: Record<PieceType, string> = { k: 'roi', q: 'dame', r: 'tour', b: 'fou', n: 'cavalier', p: 'pion' };

const LETTER: Record<PieceType, string> = { k: 'k', q: 'q', r: 'r', b: 'b', n: 'n', p: 'p' };

export function boardToFen(board: (Piece | null)[], turn: Color, castling: string): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r * 8 + f];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      const l = LETTER[p.t];
      row += p.c === 'w' ? l.toUpperCase() : l;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${turn} ${castling || '-'} - 0 1`;
}

/** Droits de roque encore cohérents avec la position (roi et tour à leur place). */
function possibleCastling(board: (Piece | null)[]): Record<'K' | 'Q' | 'k' | 'q', boolean> {
  const is = (sq: number, c: Color, t: PieceType) => board[sq]?.c === c && board[sq]?.t === t;
  return {
    K: is(4, 'w', 'k') && is(7, 'w', 'r'),
    Q: is(4, 'w', 'k') && is(0, 'w', 'r'),
    k: is(60, 'b', 'k') && is(63, 'b', 'r'),
    q: is(60, 'b', 'k') && is(56, 'b', 'r'),
  };
}

export function PositionEditor({ initialFen, onDone, onCancel }: { initialFen: string; onDone: (fen: string) => void; onCancel: () => void }) {
  const init = useMemo(() => {
    try {
      return fromFen(initialFen).pos;
    } catch {
      return fromFen(START_FEN).pos;
    }
  }, [initialFen]);
  const [board, setBoard] = useState<(Piece | null)[]>(() => init.board.map(p => (p ? { ...p } : null)));
  const [turn, setTurn] = useState<Color>(init.turn);
  const [rights, setRights] = useState({ K: !!(init.castling & 1), Q: !!(init.castling & 2), k: !!(init.castling & 4), q: !!(init.castling & 8) });
  const [tool, setTool] = useState<Tool>({ c: 'w', t: 'p' });
  const [orientation, setOrientation] = useState<Color>('w');
  const [error, setError] = useState<string | null>(null);
  const [nextId, setNextId] = useState(1000);

  const possible = possibleCastling(board);
  const castling = (['K', 'Q', 'k', 'q'] as const).filter(k => rights[k] && possible[k]).join('');
  const fen = boardToFen(board, turn, castling);

  const place = (sq: number, e: React.PointerEvent) => {
    setError(null);
    const erase = tool === 'erase' || e.button === 2;
    setBoard(b => {
      const next = b.slice();
      const cur = next[sq];
      if (erase || tool === 'erase') next[sq] = null;
      else {
        // Un second clic avec la même pièce la retire.
        if (cur && cur.c === tool.c && cur.t === tool.t) next[sq] = null;
        else {
          if (tool.t === 'k') next.forEach((p, i) => { if (p && p.t === 'k' && p.c === tool.c) next[i] = null; });
          next[sq] = { id: nextId, c: tool.c, t: tool.t } as Piece;
        }
      }
      return next;
    });
    setNextId(n => n + 1);
  };

  const load = (f: string) => {
    const p = fromFen(f).pos;
    setBoard(p.board.map(x => (x ? { ...x } : null)));
    setTurn(p.turn);
    setRights({ K: !!(p.castling & 1), Q: !!(p.castling & 2), k: !!(p.castling & 4), q: !!(p.castling & 8) });
    setError(null);
  };

  const submit = () => {
    const err = validateFen(fen);
    if (err) setError(err);
    else onDone(fen);
  };

  const sameTool = (c: Color, t: PieceType) => tool !== 'erase' && tool.c === c && tool.t === t;

  return (
    <div className="ft-editor">
      <div className="ft-editor-board">
        <Palette color={orientation === 'w' ? 'b' : 'w'} sameTool={sameTool} setTool={setTool} />
        <MiniBoard board={board} orientation={orientation} coords onSquare={place} className="ft-editor-mb" label="Éditeur de position : cliquez sur une case pour poser la pièce choisie" />
        <Palette color={orientation} sameTool={sameTool} setTool={setTool} erase={tool === 'erase'} onErase={() => setTool('erase')} />
      </div>
      <div className="ft-editor-side">
        <div className="ft-field">
          <span className="label">Trait</span>
          <div className="segmented" role="group" aria-label="Camp au trait">
            <button type="button" className={turn === 'w' ? 'on' : ''} aria-pressed={turn === 'w'} onClick={() => setTurn('w')}>Blancs</button>
            <button type="button" className={turn === 'b' ? 'on' : ''} aria-pressed={turn === 'b'} onClick={() => setTurn('b')}>Noirs</button>
          </div>
        </div>
        <div className="ft-field">
          <span className="label">Roques permis</span>
          <div className="ft-checks">
            {([['K', 'Blancs, petit'], ['Q', 'Blancs, grand'], ['k', 'Noirs, petit'], ['q', 'Noirs, grand']] as const).map(([k, label]) => (
              <label key={k} className={`check ${possible[k] ? '' : 'off'}`}>
                <input type="checkbox" checked={rights[k] && possible[k]} disabled={!possible[k]} onChange={e => setRights({ ...rights, [k]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="ft-actions">
          <button type="button" className="btn btn-sm" onClick={() => load(START_FEN)}>Position de départ</button>
          <button type="button" className="btn btn-sm" onClick={() => load('4k3/8/8/8/8/8/8/4K3 w - - 0 1')}>Deux rois</button>
          <button type="button" className="btn btn-sm" onClick={() => setBoard(new Array(64).fill(null))}>Vider</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOrientation(o => (o === 'w' ? 'b' : 'w'))}>Retourner</button>
        </div>
        <label className="ft-field">
          <span className="label">FEN</span>
          <input className="input ft-mono" value={fen} readOnly onFocus={e => e.currentTarget.select()} />
        </label>
        {error && <p className="ft-note bad" role="alert">{error}</p>}
        <div className="ft-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={submit}>Analyser cette position</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>Annuler</button>
        </div>
        <p className="ft-meta">Cliquez sur une case pour poser la pièce choisie ; un second clic (ou un clic droit) la retire.</p>
      </div>
    </div>
  );
}

function Palette({ color, sameTool, setTool, erase, onErase }: { color: Color; sameTool: (c: Color, t: PieceType) => boolean; setTool: (t: Tool) => void; erase?: boolean; onErase?: () => void }) {
  return (
    <div className="ft-palette" role="toolbar" aria-label={color === 'w' ? 'Pièces blanches' : 'Pièces noires'}>
      {TYPES.map(t => (
        <button
          key={t}
          type="button"
          className={sameTool(color, t) ? 'on' : ''}
          aria-pressed={sameTool(color, t)}
          aria-label={`${NAMES[t]} ${color === 'w' ? 'blanc' : 'noir'}`}
          style={{ backgroundImage: pieceUrl(color, t) } as CSSProperties}
          onClick={() => setTool({ c: color, t })}
        />
      ))}
      {onErase && (
        <button type="button" className={`erase ${erase ? 'on' : ''}`} aria-pressed={!!erase} aria-label="Gomme" onClick={onErase}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
        </button>
      )}
    </div>
  );
}

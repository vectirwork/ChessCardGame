// Géométrie de l'échiquier affiché (src/client/components/boardGeometry.ts) : égale aux calculs actuels de Board.tsx
// et de l'accueil, dans les deux orientations.
import { describe, expect, it } from 'vitest';
import { cellOf, squareAt, squareOfCell } from '../src/client/components/boardGeometry';
import type { Orientation } from '../src/client/components/boardGeometry';

// Copies actuelles (commit 7148547).
const boardXy = (sq: number, o: Orientation) => {
  const f = sq & 7, r = sq >> 3;
  return o === 'w' ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
};
const boardSq = (x: number, y: number, o: Orientation) => (o === 'w' ? (7 - y) * 8 + x : y * 8 + (7 - x));
const sqFromPoint = (cx: number, cy: number, r: { left: number; top: number; width: number; height: number }, o: Orientation) => {
  const x = Math.floor(((cx - r.left) / r.width) * 8);
  const y = Math.floor(((cy - r.top) / r.height) * 8);
  if (x < 0 || x > 7 || y < 0 || y > 7) return null;
  return o === 'w' ? (7 - y) * 8 + x : y * 8 + (7 - x);
};
/** HoverHalo de l'accueil (Blancs en bas) : position en pourcentage. */
const halo = (sq: number) => ({ left: (sq & 7) * 12.5, top: (7 - (sq >> 3)) * 12.5 });

const ORIENTATIONS: Orientation[] = ['w', 'b'];

describe('cellOf et squareOfCell', () => {
  it('égaux à Board.tsx (xy et boucle de rendu)', () => {
    for (const o of ORIENTATIONS) {
      for (let sq = 0; sq < 64; sq++) expect(cellOf(sq, o)).toEqual(boardXy(sq, o));
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expect(squareOfCell(x, y, o)).toBe(boardSq(x, y, o));
    }
  });
  it('réciproques', () => {
    for (const o of ORIENTATIONS) {
      for (let sq = 0; sq < 64; sq++) {
        const { x, y } = cellOf(sq, o);
        expect(squareOfCell(x, y, o)).toBe(sq);
      }
    }
  });
  it('repères : a1 en bas à gauche pour les Blancs, h8 pour les Noirs', () => {
    expect(cellOf(0, 'w')).toEqual({ x: 0, y: 7 });
    expect(cellOf(63, 'w')).toEqual({ x: 7, y: 0 });
    expect(cellOf(63, 'b')).toEqual({ x: 0, y: 7 });
    expect(cellOf(0, 'b')).toEqual({ x: 7, y: 0 });
  });
  it('halo de l’accueil (Blancs) : la même case', () => {
    for (let sq = 0; sq < 64; sq++) {
      const { x, y } = cellOf(sq, 'w');
      expect({ left: x * 12.5, top: y * 12.5 }).toEqual(halo(sq));
    }
  });
});

describe('squareAt', () => {
  const rect = { left: 37.5, top: 112.25, width: 503.7, height: 503.7 };
  it('égal à Board.sqFromPoint et à l’accueil (onAstreMove), points dedans, au bord et dehors', () => {
    for (const o of ORIENTATIONS) {
      for (let i = -3; i <= 67; i++) {
        for (let j = -3; j <= 67; j += 7) {
          const cx = rect.left + (i / 64) * rect.width;
          const cy = rect.top + (j / 64) * rect.height;
          const attendu = sqFromPoint(cx, cy, rect, o);
          expect(squareAt((cx - rect.left) / rect.width, (cy - rect.top) / rect.height, o), `${o} ${i} ${j}`).toBe(attendu);
        }
      }
    }
  });
  it('hors de l’échiquier, ou échiquier de taille nulle : null', () => {
    expect(squareAt(-0.01, 0.5, 'w')).toBeNull();
    expect(squareAt(1, 0.5, 'w')).toBeNull();
    expect(squareAt(Number.NaN, Number.NaN, 'b')).toBeNull();
  });
  it('coins', () => {
    expect(squareAt(0, 0.999, 'w')).toBe(0);
    expect(squareAt(0.999, 0, 'w')).toBe(63);
    expect(squareAt(0, 0.999, 'b')).toBe(63);
    expect(squareAt(0.999, 0, 'b')).toBe(0);
  });
});

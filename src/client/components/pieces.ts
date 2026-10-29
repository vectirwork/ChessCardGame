// Jeu de pièces « Arcane », dessiné pour Spellmate (aucune licence tierce).
// Chaque pièce est un SVG 100 × 100 converti en data URI, mis en cache.
import type { Color, PieceType } from '../../shared/chess';

const BASE = 'M22 90 Q22 82 30 81 L70 81 Q78 82 78 90 Z';

const SHAPES: Record<PieceType, { body: string; details: string }> = {
  p: {
    body: `${BASE}
      M34 81 C36 70 42 63 44.5 57 L55.5 57 C58 63 64 70 66 81 Z
      M38 57 Q38 52 50 52 Q62 52 62 57 Z
      M50 24 A13.5 13.5 0 1 1 49.99 24 Z`,
    details: 'M38 76 Q50 73 62 76',
  },
  r: {
    body: `${BASE}
      M31 81 L34.5 46 L65.5 46 L69 81 Z
      M29 46 L71 46 L71 40 L29 40 Z
      M28 40 L28 18 L37 18 L37 25 L45 25 L45 18 L55 18 L55 25 L63 25 L63 18 L72 18 L72 40 Z`,
    details: 'M33 50 L67 50 M32.4 74 L67.6 74 M45 25 L45 34 M55 25 L55 34',
  },
  n: {
    body: `${BASE}
      M31 81
      C30 71 34 63 41 57.5
      C36 58.5 30 59 25.5 57.5
      C19.5 55.5 16 50.5 17.5 45
      C19 40 24 36.5 29 32
      C32.5 28.5 34.5 24 36.5 19.5
      L38.5 10.5
      L44 17.5
      L48.5 12
      L51 19
      C64 21 74 33 74.5 50
      C75 62 71.5 72 70 81 Z`,
    details: `M21.5 50.5 Q24 49 26 51
      M51 19 C60 25 64.5 36 64 52 M56 24 C61 33 61 41 59.5 49`,
  },
  b: {
    body: `${BASE}
      M33 81 C35 72 40 66 43.5 61 L56.5 61 C60 66 65 72 67 81 Z
      M36.5 61 Q36.5 55.5 50 55.5 Q63.5 55.5 63.5 61 Z
      M50 17
      C59 25 64 33 63.5 41
      C63 48.5 57.5 53.5 50 53.5
      C42.5 53.5 37 48.5 36.5 41
      C36 33 41 25 50 17 Z
      M50 6.5 A5 5 0 1 1 49.99 6.5 Z`,
    details: 'M53 27 L45.5 40 M38 76 Q50 73 62 76',
  },
  q: {
    body: `${BASE}
      M31 81 C34 69 37.5 58 36.5 45 L63.5 45 C62.5 58 66 69 69 81 Z
      M33 45 L67 45 L67 39 L33 39 Z
      M32 39 L27 21 L38.5 31 L43 15.5 L50 28.5 L57 15.5 L61.5 31 L73 21 L68 39 Z
      M27 14 A4 4 0 1 1 26.99 14 Z
      M43 8.5 A4 4 0 1 1 42.99 8.5 Z
      M57 8.5 A4 4 0 1 1 56.99 8.5 Z
      M73 14 A4 4 0 1 1 72.99 14 Z
      M50 21 A4 4 0 1 1 49.99 21 Z`,
    details: 'M37.5 50 L62.5 50 M34 74 Q50 70.5 66 74',
  },
  k: {
    body: `${BASE}
      M31 81 C34 69 37.5 58 36.5 46 L63.5 46 C62.5 58 66 69 69 81 Z
      M33 46 L67 46 L67 40 L33 40 Z
      M33.5 40 C30 30 34 21.5 42 21.5 C46 21.5 48.5 24 50 27 C51.5 24 54 21.5 58 21.5 C66 21.5 70 30 66.5 40 Z
      M46.5 21 L46.5 15 L41 15 L41 9 L46.5 9 L46.5 3.5 L53.5 3.5 L53.5 9 L59 9 L59 15 L53.5 15 L53.5 21 Z`,
    details: 'M37.5 51 L62.5 51 M34 74 Q50 70.5 66 74 M50 27 L50 39',
  },
};

const PALETTE: Record<Color, { top: string; bottom: string; stroke: string; detail: string; rim: string }> = {
  w: { top: '#ffffff', bottom: '#ddd3bd', stroke: '#2b2230', detail: '#7d6e5f', rim: 'rgba(255,255,255,0.9)' },
  b: { top: '#5a536c', bottom: '#15121c', stroke: '#06050a', detail: '#a99ccc', rim: 'rgba(200,185,255,0.35)' },
};

const cache = new Map<string, string>();

export function pieceSvg(c: Color, t: PieceType): string {
  const { body, details } = SHAPES[t];
  const p = PALETTE[c];
  const id = `${c}${t}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>
<linearGradient id="g${id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${p.top}"/><stop offset="1" stop-color="${p.bottom}"/></linearGradient>
<linearGradient id="s${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.32"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/></linearGradient>
</defs>
<g stroke-linejoin="round" stroke-linecap="round" fill-rule="nonzero">
<path d="${body}" fill="url(#g${id})" stroke="${p.stroke}" stroke-width="3.2"/>
<path d="${body}" fill="url(#s${id})"/>
<path d="${details}" fill="none" stroke="${p.detail}" stroke-width="2.2" opacity="0.9"/>
${t === 'n' ? `<circle cx="33" cy="36" r="2.8" fill="${p.stroke}"/>` : ''}
</g>
</svg>`;
}

export function pieceUrl(c: Color, t: PieceType): string {
  const k = c + t;
  let u = cache.get(k);
  if (!u) {
    u = `url("data:image/svg+xml;utf8,${encodeURIComponent(pieceSvg(c, t).replace(/\s+/g, ' '))}")`;
    cache.set(k, u);
  }
  return u;
}

export const PIECE_NAMES: Record<PieceType, string> = {
  p: 'pion',
  n: 'cavalier',
  b: 'fou',
  r: 'tour',
  q: 'dame',
  k: 'roi',
};

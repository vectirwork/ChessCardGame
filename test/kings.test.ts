// Rois des skins (src/shared/skins/kings.ts, src/client/components/pieces.ts) :
// - le roi Arcane et tout identifiant inconnu donnent exactement la data URI d'avant les skins (empreintes figées) ;
// - le générateur reproduit les 14 SVG de référence de la direction artistique (test/fixtures/rois/), aux
//   identifiants près ;
// - gabarit de la chute du mat (boîte 22..78 × 3,5..90, pied commun), légèreté, luminances des deux camps ;
// - en partie : rois des sièges, préférence « Rois adverses classiques », rois de l'Oracle et de la descente.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Color, PieceType } from '../src/shared/chess';
import { BOT_LOOK, ITEMS, KING_ART, KING_BASE, ORACLE_LOOK, collectionOf, formatPrice, itemById, unitPrice } from '../src/shared/catalog';
import type { SeatView } from '../src/shared/protocol';
import { crestUrl, kingUrl, pieceSvg, pieceUrl } from '../src/client/components/pieces';
import { CLASSIC_KINGS_PREF, seatKings, shownKings } from '../src/client/features/history';
import { PACKS, PLACES, priceOf } from '../src/client/odyssee/data';

const COLORS: Color[] = ['w', 'b'];
const TYPES: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];
const KINGS = ITEMS.filter(i => i.kind === 'king').map(i => i.id);
const DRAWN = KINGS.filter(id => id !== 'king:arcane');

/**
 * Empreintes (sha256 et longueur) des data URI des 12 pièces Arcane, calculées sur le code d'avant les skins
 * (commit ee6fa2e). Elles ne doivent jamais changer : toute repeinte des pièces de tout le monde se verrait ici.
 */
const ARCANE: Record<string, string> = {
  wp: 'b9ea1894741fa7c39c5df54f10eb77b0fdfc6ca9758f111478b9e9c85a6f7e84 1784',
  wn: 'c52d1668dc27fd519e543a0bccd3201f767c39233e8092c6615199764bd7f801 2191',
  wb: '1f59c38950fbf0553588933ee97980933255b0c3039496cc47027f44e181bf7a 2142',
  wr: '9e40bbf7f630870a84dc939217d16b1ff9e2ca039796eba22fd52ae12d9170c7 1908',
  wq: 'dffcb038a16cf3e47a728b2ff5e26c4a96278e2801a130295609ad8f73a967e8 2416',
  wk: '7cace030e1308380eb5a5344a7d6813acaa09f50b9e4189e8d06ba30bc73b5a1 2332',
  bp: '2e26ac3d89984b6fddd968e4bd7fdf70822f4b5fd2e4b4a63ef4468d5d7b5091 1784',
  bn: 'bd98832b97a61405b5a3f892b33fd1b7a93a7773c8e184baae43e4a0a7f32626 2191',
  bb: '11f09ea21c4efa1cb3ec104ed9d3e1fbd20499c8b39dea449b045ef9ca5a3671 2142',
  br: '3358627204f7f085984a560729561846b5123d8097ab85554955a1b19f18a92d 1908',
  bq: '739c2703cce3be7dac531fb1c1deb86eb95fbd7f2b5452deeb0e2eceefddd536 2416',
  bk: '1e2bfa18f98c17fa605b55ac2bc84d838ddc29577835450b735a022c6d6e264d 2332',
};
const print = (u: string) => `${createHash('sha256').update(u).digest('hex')} ${u.length}`;

// ---------------------------------------------------------------------------------------------
// Lecture d'un SVG (les rois n'utilisent que <svg>, <defs>, <linearGradient>, <stop>, <g> et <path>)

const attrs = (s: string) => Object.fromEntries([...s.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const NUMERIC = new Set(['stroke-width', 'opacity', 'stroke-opacity']);

/** Forme canonique : dégradés résolus dans les attributs qui les citent, valeurs par défaut retirées, identifiants oubliés. */
function canon(svg: string) {
  const grads = new Map<string, string>();
  for (const m of svg.matchAll(/<linearGradient ([^>]*)>(.*?)<\/linearGradient>/gs)) {
    const a = attrs(m[1]);
    const stops = [...m[2].matchAll(/<stop ([^>]*)\/>/g)].map(x => attrs(x[1]));
    grads.set(
      a.id,
      JSON.stringify({
        units: a.gradientUnits ?? 'objectBoundingBox',
        v: [a.x1 ?? '0', a.y1 ?? '0', a.x2 ?? '1', a.y2 ?? '0'].map(Number),
        stops: stops.map(s => [Number(s.offset), s['stop-color'].toLowerCase(), Number(s['stop-opacity'] ?? 1)]),
      }),
    );
  }
  const g = attrs(svg.match(/<g ([^>]*)>/)![1]);
  if (g['fill-rule'] === 'nonzero') delete g['fill-rule'];
  const paths = [...svg.matchAll(/<path ([^>]*?)\/>/g)].map(m => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(attrs(m[1]))) {
      if (k === 'fill-rule' && v === 'nonzero') continue;
      if (k === 'stroke' && v === 'none') continue; // le groupe n'a pas de contour : « none » = absent
      if (k === 'd') out[k] = v.replace(/\s+/g, ' ').trim();
      else if (NUMERIC.has(k)) out[k] = String(Number(v));
      else out[k] = v.replace(/^url\(#(.+)\)$/, (_, id: string) => `dégradé ${grads.get(id)}`);
    }
    return out;
  });
  const tags = [...new Set([...svg.matchAll(/<([a-zA-Z]+)/g)].map(m => m[1]))].sort();
  return { svg: attrs(svg.match(/<svg ([^>]*)>/)![1]), g, paths, tags };
}

// ---------------------------------------------------------------------------------------------
// Géométrie : points d'un chemin SVG (commandes absolues et relatives), courbes et arcs échantillonnés

function pathPoints(d: string): [number, number][] {
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const pts: [number, number][] = [];
  let i = 0;
  let cmd = '';
  let x = 0, y = 0, sx = 0, sy = 0;
  const n = () => Number(toks[i++]);
  const N = 48;
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd !== cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        x = n() + ox;
        y = n() + oy;
        sx = x;
        sy = y;
        pts.push([x, y]);
        cmd = rel ? 'l' : 'L';
        break;
      case 'L':
        x = n() + ox;
        y = n() + oy;
        pts.push([x, y]);
        break;
      case 'H':
        x = n() + ox;
        pts.push([x, y]);
        break;
      case 'V':
        y = n() + oy;
        pts.push([x, y]);
        break;
      case 'Z':
        x = sx;
        y = sy;
        break;
      case 'Q': {
        const [x1, y1, x2, y2] = [n() + ox, n() + oy, n() + ox, n() + oy];
        for (let k = 1; k <= N; k++) {
          const t = k / N, u = 1 - t;
          pts.push([u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2]);
        }
        x = x2;
        y = y2;
        break;
      }
      case 'C': {
        const [x1, y1, x2, y2, x3, y3] = [n() + ox, n() + oy, n() + ox, n() + oy, n() + ox, n() + oy];
        for (let k = 1; k <= N; k++) {
          const t = k / N, u = 1 - t;
          pts.push([
            u ** 3 * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3,
            u ** 3 * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3,
          ]);
        }
        x = x3;
        y = y3;
        break;
      }
      case 'A': {
        let rx = Math.abs(n()), ry = Math.abs(n());
        const phi = (n() * Math.PI) / 180, large = n(), sweep = n();
        const ex = n() + ox, ey = n() + oy;
        // Centre de l'ellipse (SVG 1.1, annexe F.6.5)
        const cos = Math.cos(phi), sin = Math.sin(phi);
        const x1p = (cos * (x - ex)) / 2 + (sin * (y - ey)) / 2;
        const y1p = (-sin * (x - ex)) / 2 + (cos * (y - ey)) / 2;
        const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
        if (lam > 1) {
          rx *= Math.sqrt(lam);
          ry *= Math.sqrt(lam);
        }
        const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
        const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
        const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
        const cxp = (coef * rx * y1p) / ry, cyp = (-coef * ry * x1p) / rx;
        const cx = cos * cxp - sin * cyp + (x + ex) / 2, cy = sin * cxp + cos * cyp + (y + ey) / 2;
        const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
        const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
        let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
        if (!sweep && dt > 0) dt -= 2 * Math.PI;
        if (sweep && dt < 0) dt += 2 * Math.PI;
        for (let k = 1; k <= N * 2; k++) {
          const th = t1 + (dt * k) / (N * 2);
          pts.push([cx + rx * Math.cos(th) * cos - ry * Math.sin(th) * sin, cy + rx * Math.cos(th) * sin + ry * Math.sin(th) * cos]);
        }
        x = ex;
        y = ey;
        break;
      }
      default:
        throw new Error(`commande non prise en charge : ${cmd}`);
    }
  }
  return pts;
}

function bbox(svg: string) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of svg.matchAll(/<path [^>]*?d="([^"]*)"/g)) {
    for (const [x, y] of pathPoints(m[1])) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, x1, y1 };
}

/** Luminance relative (WCAG) d'une couleur #rrggbb. */
function lum(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map(k => parseInt(hex.slice(k, k + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ---------------------------------------------------------------------------------------------

describe('rois : le roi Arcane ne change pas', () => {
  it('les 12 pièces Arcane donnent exactement les data URI d’avant les skins', () => {
    for (const c of COLORS) for (const t of TYPES) expect(print(pieceUrl(c, t)), `${c}${t}`).toBe(ARCANE[c + t]);
  });

  it('roi absent, Arcane, inconnu ou piégé : la même chaîne, celle d’avant', () => {
    for (const c of COLORS) {
      const before = pieceUrl(c, 'k');
      for (const id of [undefined, '', 'king:arcane', 'king:inconnu', 'skin:inferno', 'board:ruby', '__proto__', 'constructor', 'toString']) {
        expect(pieceUrl(c, 'k', id), String(id)).toBe(before);
        expect(kingUrl(c, id), String(id)).toBe(before);
      }
      expect(print(before)).toBe(ARCANE[`${c}k`]);
    }
  });

  it('les autres pièces ignorent le roi demandé', () => {
    for (const c of COLORS) for (const t of TYPES.filter(t => t !== 'k')) expect(pieceUrl(c, t, 'king:braise')).toBe(pieceUrl(c, t));
  });
});

describe('rois : dessins (KING_ART)', () => {
  it('un dessin par roi payant, aucun pour le roi Arcane', () => {
    expect(Object.keys(KING_ART).sort()).toEqual([...DRAWN].sort());
    expect(DRAWN).toHaveLength(7);
    expect(Object.hasOwn(KING_ART, 'king:arcane')).toBe(false);
  });

  it('le générateur reproduit les 14 SVG de référence, aux identifiants près', () => {
    for (const id of DRAWN) {
      for (const c of COLORS) {
        const ref = readFileSync(new URL(`./fixtures/rois/king-${id.slice(5)}-${c}.svg`, import.meta.url), 'utf8');
        expect(canon(pieceSvg(c, 'k', id)), `${id} ${c}`).toEqual(canon(ref));
      }
    }
  });

  it('cache : même chaîne à chaque appel ; blanc ≠ noir ; roi skinné ≠ Arcane', () => {
    for (const id of DRAWN) {
      const w = pieceUrl('w', 'k', id);
      expect(pieceUrl('w', 'k', id)).toBe(w);
      expect(kingUrl('w', id)).toBe(w);
      expect(pieceUrl('b', 'k', id)).not.toBe(w);
      expect(w).not.toBe(pieceUrl('w', 'k'));
      expect(w.startsWith('url("data:image/svg+xml;utf8,')).toBe(true);
    }
  });

  it('gabarit de la chute du mat : pied commun, tracés dans x 22..78 et y 3,5..90', () => {
    for (const id of DRAWN) {
      const art = KING_ART[id];
      expect(art.body.startsWith(`${KING_BASE} `), id).toBe(true);
      for (const c of COLORS) {
        const b = bbox(pieceSvg(c, 'k', id));
        const eps = 0.02;
        expect(b.x0, `${id} x min`).toBeGreaterThanOrEqual(22 - eps);
        expect(b.x1, `${id} x max`).toBeLessThanOrEqual(78 + eps);
        expect(b.y0, `${id} y min`).toBeGreaterThanOrEqual(3.5 - eps);
        expect(b.y1, `${id} y max`).toBeLessThanOrEqual(90 + eps);
        // Le pied touche le bas et les côtés du gabarit, la croix touche (presque) le haut
        expect(b.y1).toBeCloseTo(90, 1);
        expect(b.y0).toBeLessThan(4);
      }
    }
  });

  it('légèreté : ≤ 7 chemins, ≤ 5 dégradés, aucun élément interdit, data URI ≤ 4,5 Ko', () => {
    for (const id of DRAWN) {
      for (const c of COLORS) {
        const svg = pieceSvg(c, 'k', id);
        expect((svg.match(/<path/g) ?? []).length, id).toBeLessThanOrEqual(7);
        expect((svg.match(/<linearGradient/g) ?? []).length, id).toBeLessThanOrEqual(5);
        expect(canon(svg).tags, id).toEqual(['defs', 'g', 'linearGradient', 'path', 'stop', 'svg']);
        for (const bad of ['<filter', '<image', '<text', '<style', '<animate', '<foreignObject', '<script']) expect(svg.includes(bad)).toBe(false);
        expect(pieceUrl(c, 'k', id).length, id).toBeLessThanOrEqual(4608);
      }
    }
  });

  it('luminances : le blanc reste clair, le noir sombre, et les deux camps se séparent', () => {
    for (const id of DRAWN) {
      const { w, b } = KING_ART[id].pal;
      expect(lum(w.top), `${id} blanc haut`).toBeGreaterThanOrEqual(0.9);
      expect(lum(w.bottom), `${id} blanc bas`).toBeGreaterThanOrEqual(0.6);
      expect(lum(b.top), `${id} noir haut`).toBeLessThanOrEqual(0.15);
      expect(lum(b.bottom), `${id} noir bas`).toBeLessThanOrEqual(0.02);
      expect((lum(w.bottom) + 0.05) / (lum(b.top) + 0.05), `${id} contraste`).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('rois : cimier (sceau de collection, avatar)', () => {
  it('le même dessin recadré sur la coiffe, mis en cache ; Arcane pour un roi inconnu', () => {
    const arcane = crestUrl();
    expect(decodeURIComponent(arcane)).toContain('viewBox="30 0 40 40"');
    expect(crestUrl('king:inconnu')).toBe(arcane);
    expect(crestUrl('king:arcane')).toBe(arcane);
    for (const id of DRAWN) {
      const u = crestUrl(id);
      expect(crestUrl(id)).toBe(u);
      expect(u).not.toBe(arcane);
      expect(decodeURIComponent(u)).toContain('viewBox="30 0 40 40"');
      expect(crestUrl(id, 'b')).not.toBe(u);
    }
  });
});

describe('rois en partie : qui porte quel roi (features/history.ts, odyssee/data.ts)', () => {
  const seat = (king?: string) => ({ kind: 'user', name: 'x', online: true, skin: 'skin:arcane', king }) as unknown as SeatView;

  it('rois des sièges : normalisés (siège vide, partie d’avant les rois, identifiant inconnu : Arcane)', () => {
    expect(seatKings(null)).toEqual({ w: 'king:arcane', b: 'king:arcane' });
    expect(seatKings({ w: null, b: null })).toEqual({ w: 'king:arcane', b: 'king:arcane' });
    expect(seatKings({ w: seat('king:braise'), b: seat(undefined) })).toEqual({ w: 'king:braise', b: 'king:arcane' });
    expect(seatKings({ w: seat('king:inconnu'), b: seat('skin:inferno') })).toEqual({ w: 'king:arcane', b: 'king:arcane' });
  });

  it('préférence « Rois adverses classiques » : seul son propre roi garde son skin ; un spectateur voit deux rois Arcane', () => {
    const kings = { w: 'king:braise', b: 'king:eclipse' };
    expect(shownKings(kings, 'w', false)).toEqual(kings);
    expect(shownKings(kings, null, false)).toEqual(kings);
    expect(shownKings(kings, 'w', true)).toEqual({ w: 'king:braise', b: 'king:arcane' });
    expect(shownKings(kings, 'b', true)).toEqual({ w: 'king:arcane', b: 'king:eclipse' });
    expect(shownKings(kings, null, true)).toEqual({ w: 'king:arcane', b: 'king:arcane' });
    expect(shownKings(undefined, 'w', false)).toEqual({ w: 'king:arcane', b: 'king:arcane' });
    expect(shownKings({ w: 'king:inconnu', b: 'king:rubis' }, 'b', false)).toEqual({ w: 'king:arcane', b: 'king:rubis' });
    expect(CLASSIC_KINGS_PREF).toBe('rois-classiques');
  });

  it("l'Oracle et les IA de niveau 2 et 3 portent des rois dessinés", () => {
    expect(Object.hasOwn(KING_ART, ORACLE_LOOK.king)).toBe(true);
    for (const l of [2, 3] as const) expect(Object.hasOwn(KING_ART, BOT_LOOK[l].king)).toBe(true);
  });

  it('descente : roi, échiquier et sorts de chaque lieu existent ; Pics, Sablier, Bazar et Seuil montrent chacun une collection', () => {
    for (const p of PLACES) {
      expect(itemById(p.king)?.kind, `${p.id} roi`).toBe('king');
      expect(itemById(p.theme)?.kind, `${p.id} échiquier`).toBe('board');
      expect(itemById(p.skin)?.kind, `${p.id} sorts`).toBe('skin');
    }
    const shown = new Set<string>();
    for (const id of ['pics', 'sablier', 'bazar', 'seuil']) {
      const p = PLACES.find(x => x.id === id)!;
      const c = collectionOf(p.king)!;
      expect(c.rarity, `${id} : collection premium`).not.toBe('offert');
      expect([c.king, c.board, c.skin], id).toEqual([p.king, p.theme, p.skin]);
      shown.add(c.id);
    }
    expect(shown.size, 'une collection différente par lieu').toBe(4);
  });

  it('Bazar de l’accueil : prix du catalogue (unitPrice), « Offert » pour les objets gratuits, packs en vente', () => {
    expect(priceOf('king:arcane')).toBe('Offert');
    for (const k of DRAWN) expect(priceOf(k)).toBe(formatPrice(unitPrice(k)));
    expect(priceOf('board:ruby')).toBe(formatPrice(199));
    expect(priceOf('skin:celestial')).toBe(formatPrice(399));
    expect(priceOf('inconnu')).toBe('');
    expect(PACKS.map(p => p.id).sort()).toEqual(['pack:skins', 'pack:tresor']);
  });
});

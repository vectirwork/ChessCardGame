// Échiquiers et leurs décors (src/shared/skins/boards.ts, src/client/components/boardTheme.ts, section « Habillage des
// échiquiers » de board.css) :
// - lisibilité : écart de luminance clair / sombre d'au moins 35 % ;
// - décors légers et inertes : SVG ≤ 2 Ko, bien formés, sans filtre, image, script, animation ni foreignObject ;
//   lueurs du cadre sans url() ; section CSS sans animation ni transition ;
// - géométrie des retouches du plan (§ 1) : pétales du jade hors des rangées de départ, craquelures d'Obsidienne qui
//   ne ressemblent jamais à la Faille, étoiles du ciel sur les cases sombres et hors des coordonnées, puits du Néant sur
//   les seules cases claires ;
// - boardTheme : classes et variables attendues, une seule construction par thème, images jamais passées par une
//   variable CSS (Chromium repeindrait l'échiquier à chaque recalcul de style) ;
// - ordre des calques (petite cascade sur board.css) : avec incrustation, tous les états de jeu passent au-dessus
//   d'elle et gardent entre eux, et avec les pièces, l'ordre des échiquiers sans incrustation (dernier coup + cible,
//   coordonnées sous les pièces, pièce prise, climat, glisser…).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ITEMS, boardStyle, collectionOf } from '../src/shared/catalog';
import type { BoardStyle } from '../src/shared/catalog';
import { SHEEN_SVG, boardTheme, cornerOffset, svgUrl, themeCss } from '../src/client/components/boardTheme';

const BOARDS = ITEMS.filter(i => i.kind === 'board');
const style = (id: string): BoardStyle => BOARDS.find(b => b.id === id)!.board!;
const PREMIUM = BOARDS.filter(b => !b.free).map(b => b.id);

/** Luminance relative (WCAG) d'une couleur #rrggbb. */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Tous les SVG d'un échiquier (incrustation et cadre). */
const svgsOf = (b: BoardStyle) => [b.inlay, b.frameArt?.svg].filter((s): s is string => !!s);

/** Vérifie l'équilibre des balises (XML simplifié : ni commentaires ni CDATA dans ces SVG). */
function wellFormed(svg: string): boolean {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== name) return false;
    } else stack.push(name);
  }
  return stack.length === 0;
}

/** Points d'un tracé fait de M et de paires de coordonnées (sous-tracés séparés). */
function subpaths(d: string): [number, number][][] {
  return d
    .split('M')
    .filter(Boolean)
    .map(s => {
      const n = s.trim().split(/[\s,]+/).map(Number);
      const pts: [number, number][] = [];
      for (let i = 0; i < n.length; i += 2) pts.push([n[i], n[i + 1]]);
      return pts;
    });
}
const isDark = (col: number, row: number) => (col + row) % 2 === 1;

describe('Échiquiers : données', () => {
  it('dix échiquiers, trois offerts sans décor, sept premium décorés', () => {
    expect(BOARDS.map(b => b.id)).toEqual([
      'board:arcane', 'board:wood', 'board:slate', 'board:marble', 'board:obsidian', 'board:jade', 'board:ruby',
      'board:grille', 'board:horizon', 'board:ciel',
    ]);
    for (const b of BOARDS) {
      const s = b.board!;
      if (b.free) {
        // Offerts : inchangés, sans décor ni halo (la boutique prend la couleur de la rareté « Offert »)
        expect([s.fillet, s.inlay, s.frameArt, s.frameGlow, s.gem], b.id).toEqual([undefined, undefined, undefined, undefined, undefined]);
      } else {
        expect(s.fillet, b.id).toMatch(/^#[0-9a-f]{6}$/);
        expect(s.inlay, b.id).toBeTruthy();
        expect(!!s.frameArt || !!s.frameGlow, b.id).toBe(true);
        // Halo des vignettes : la teinte de la collection
        expect(s.gem, b.id).toBe(collectionOf(b.id)!.gem);
      }
    }
  });

  it('les couleurs de base des échiquiers déjà vendus ne changent pas (sauf Obsidienne, éclaircie au lot 0)', () => {
    expect(style('board:arcane')).toMatchObject({ light: '#d8d3ee', dark: '#6f62ad', frame: '#1c1838', texture: 'grain', coords: '#3b3270' });
    expect(style('board:wood')).toMatchObject({ light: '#ecd5ae', dark: '#a9784f', frame: '#4a2f1d', texture: 'wood', coords: '#6b4428' });
    expect(style('board:slate')).toMatchObject({ light: '#dfe6ee', dark: '#7b8fa6', frame: '#1f2833', texture: 'none', coords: '#465568' });
    expect(style('board:marble')).toMatchObject({ light: '#f2f0ec', dark: '#8c8c94', frame: '#2b2b30', texture: 'marble', coords: '#55555c' });
    expect(style('board:obsidian')).toMatchObject({ light: '#c9b27a', dark: '#322d38', frame: '#0d0c10', texture: 'stone', coords: '#a68b4c' });
    expect(style('board:jade')).toMatchObject({ light: '#e9f1e3', dark: '#3f8a6b', frame: '#123326', texture: 'marble', coords: '#2c6650' });
    expect(style('board:ruby')).toMatchObject({ light: '#f3e1d6', dark: '#9e2f45', frame: '#2e0b14', texture: 'stone', coords: '#7a2234' });
  });

  it('écart de luminance clair / sombre d’au moins 35 %', () => {
    for (const b of BOARDS) {
      const s = b.board!;
      expect(luminance(s.light) - luminance(s.dark), b.id).toBeGreaterThanOrEqual(0.35);
    }
  });

  it('liserés du plan (§ 2)', () => {
    expect(Object.fromEntries(PREMIUM.map(id => [id, style(id).fillet]))).toEqual({
      'board:marble': '#d9b45a',
      'board:obsidian': '#c9a24e',
      'board:jade': '#d9b45a',
      'board:ruby': '#e2be62',
      'board:grille': '#ff3ec8',
      'board:horizon': '#8b3dff',
      'board:ciel': '#d9b45a',
    });
  });

  it('décors du cadre : frise pour Obsidienne, Marbre et Rubis ; coins pour Jade et Ciel ; lueurs pour Grille et Horizon', () => {
    const kinds = Object.fromEntries(PREMIUM.map(id => [id, style(id).frameArt?.kind ?? 'glow']));
    expect(kinds).toEqual({
      'board:marble': 'border', 'board:obsidian': 'border', 'board:ruby': 'border', 'board:jade': 'corners',
      'board:ciel': 'corners', 'board:grille': 'glow', 'board:horizon': 'glow',
    });
    expect(style('board:grille').frameGlow?.shadow).toMatch(/^inset /);
    expect(style('board:horizon').frameGlow?.background).toMatch(/^conic-gradient\(/);
  });
});

describe('Échiquiers : SVG légers et inertes', () => {
  it('incrustations et cadres ≤ 2 Ko, bien formés, sans élément interdit', () => {
    for (const id of PREMIUM) {
      for (const svg of svgsOf(style(id))) {
        expect(svg.length, id).toBeLessThanOrEqual(2048);
        expect(svg, id).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /);
        expect(svg, id).not.toMatch(/<(filter|image|script|animate|animateTransform|animateMotion|set|foreignObject)\b/i);
        expect(svg, id).not.toMatch(/\son[a-z]+=|href="(?!#)|url\((?!#)/i);
        expect(wellFormed(svg), id).toBe(true);
      }
    }
  });

  it('poids des réécritures du plan : Marbre ≤ 1 Ko, Rubis ≤ 1,5 Ko', () => {
    expect(style('board:marble').inlay!.length).toBeLessThanOrEqual(1024);
    expect(style('board:ruby').inlay!.length).toBeLessThanOrEqual(1536);
    expect(style('board:marble').inlay).toContain('<pattern');
    expect(style('board:ruby').inlay).toContain('<pattern');
  });

  it('incrustations : viewBox 800 × 800 étirée sur la grille', () => {
    for (const id of PREMIUM) {
      expect(style(id).inlay, id).toMatch(/^<svg [^>]*viewBox="0 0 800 800" preserveAspectRatio="none"/);
    }
  });

  it('frises : image carrée de n unités, tranche de 10, côtés non vides', () => {
    for (const id of PREMIUM) {
      const fa = style(id).frameArt;
      if (fa?.kind !== 'border') continue;
      const n = Number(fa.svg.match(/viewBox="0 0 (\d+) \1"/)?.[1]);
      expect(fa.svg, id).toContain(`width="${n}" height="${n}"`);
      expect(fa.slice, id).toBe(10);
      expect(n, id).toBeGreaterThan(2 * fa.slice);
    }
  });

  it('images d’angle : tiennent dans le cadre de 10 px', () => {
    for (const id of PREMIUM) {
      const fa = style(id).frameArt;
      if (fa?.kind !== 'corners') continue;
      expect(fa.size, id).toBeLessThanOrEqual(16);
      expect(cornerOffset(fa.size), id).toBeGreaterThanOrEqual(1);
      if (fa.mid) expect(fa.mid, id).toBeLessThanOrEqual(10);
    }
    expect(cornerOffset(11)).toBe(2);
    expect(cornerOffset(16)).toBe(1);
  });

  it('lueurs du cadre : calques CSS sans url() ni animation', () => {
    for (const id of PREMIUM) {
      const g = style(id).frameGlow;
      if (!g) continue;
      for (const v of [g.background, g.shadow]) {
        if (v) expect(v, id).not.toMatch(/url\(|animation|transition|var\(/i);
      }
    }
  });
});

describe('Échiquiers : géométrie des retouches (plan § 1)', () => {
  it('Palais de jade : sept pétales sur des cases sombres, aucun dans les rangées d’écran 1, 2, 7 et 8', () => {
    const at = [...style('board:jade').inlay!.matchAll(/translate\((\d+) (\d+)\)/g)].map(m => [Number(m[1]), Number(m[2])]);
    expect(at).toHaveLength(7);
    for (const [x, y] of at) {
      const col = Math.floor(x / 100), row = Math.floor(y / 100);
      expect(isDark(col, row), `${x} ${y}`).toBe(true);
      expect(row >= 2 && row <= 5, `${x} ${y}`).toBe(true);
      // Le pétale (≈ 11 unités de rayon) reste dans sa case
      expect(x % 100 >= 12 && x % 100 <= 88 && y % 100 >= 12 && y % 100 <= 88, `${x} ${y}`).toBe(true);
    }
  });

  it('Obsidienne : au plus 8 craquelures, d’un bord vers l’intérieur, jamais au centre d’une case (≠ Faille)', () => {
    const d = style('board:obsidian').inlay!.match(/<path id="c" d="([^"]+)"/)![1];
    expect(style('board:obsidian').inlay).toContain('stroke-opacity=".4"');
    expect(style('board:obsidian').inlay).toContain('stroke-opacity=".13"');
    const fissures: [number, number][][] = [];
    for (const p of subpaths(d)) {
      const [x0, y0] = p[0];
      const parent = fissures.find(f => f.some(([x, y]) => x === x0 && y === y0));
      if (parent) {
        // Branche : part d'un point de la fissure, reste dans la même case
        parent.push(...p.slice(1));
        continue;
      }
      fissures.push(p);
    }
    expect(fissures.length).toBeLessThanOrEqual(8);
    for (const f of fissures) {
      const [sx, sy] = f[0];
      // Case : celle qui contient le deuxième point (le départ est sur un bord)
      const col = Math.floor(f[1][0] / 100), row = Math.floor(f[1][1] / 100);
      expect(isDark(col, row), `fissure ${sx} ${sy}`).toBe(true);
      const local = f.map(([x, y]) => [x - col * 100, y - row * 100]);
      const [lx, ly] = local[0];
      // Départ sur un bord ou un coin de la case
      expect([lx, ly].some(v => v === 0 || v === 100), `fissure ${sx} ${sy}`).toBe(true);
      for (const [x, y] of local) {
        expect(x >= 0 && x <= 100 && y >= 0 && y <= 100, `fissure ${sx} ${sy} : ${x} ${y}`).toBe(true);
        // Jamais dans le carré central (30 à 70 % sur les deux axes)
        expect(x > 30 && x < 70 && y > 30 && y < 70, `fissure ${sx} ${sy} : ${x} ${y}`).toBe(false);
      }
      // S'arrête avant 35 % de la case, depuis son bord (depuis les deux bords, pour un départ en coin)
      const depth = (v: number, edge: number) => (edge === 0 ? v : 100 - v);
      const axes: [number, number][] = [];
      if (lx === 0 || lx === 100) axes.push([0, lx]);
      if (ly === 0 || ly === 100) axes.push([1, ly]);
      const reach = Math.max(...local.flatMap(pt => axes.map(([a, edge]) => depth(pt[a], edge))));
      expect(reach, `fissure ${sx} ${sy}`).toBeLessThan(35);
    }
  });

  it('Carte du ciel : étoiles dans les cases sombres, entières dans leur case, hors des coordonnées', () => {
    const svg = style('board:ciel').inlay!;
    const R: Record<string, number> = { a: 5, b: 7.5, c: 10 };
    let n = 0;
    for (const m of svg.matchAll(/<path d="M([^"]+)" style="marker:url\(#([abc])\)"/g)) {
      for (const [x, y] of subpaths(m[1])[0]) {
        n++;
        const r = R[m[2]];
        const col = Math.floor(x / 100), row = Math.floor(y / 100);
        expect(isDark(col, row), `${x} ${y}`).toBe(true);
        expect(x - r >= col * 100 && x + r <= col * 100 + 100 && y - r >= row * 100 && y + r <= row * 100 + 100, `${x} ${y}`).toBe(true);
        // Chiffres en haut à gauche de la colonne a (à l'écran), lettres en bas à droite de la rangée du bas
        if (col === 0) expect(x % 100 < 30 && y % 100 < 30, `${x} ${y}`).toBe(false);
        if (row === 7) expect(x % 100 > 70 && y % 100 > 70, `${x} ${y}`).toBe(false);
      }
    }
    expect(n).toBeGreaterThanOrEqual(32);
  });

  it('Horizon : le puits n’assombrit que les 32 cases claires ; puits retouché à 12 % au centre', () => {
    const svg = style('board:horizon').inlay!;
    const clip = svg.match(/<clipPath id="l"><path d="([^"]+)"/)![1];
    const squares = [...clip.matchAll(/M(\d+) (\d+)h100v100h-100z/g)].map(m => [Number(m[1]) / 100, Number(m[2]) / 100]);
    expect(squares).toHaveLength(32);
    for (const [c, r] of squares) expect(isDark(c, r), `${c} ${r}`).toBe(false);
    expect(svg).toContain('stop-color="#07050c" stop-opacity=".12"');
    expect(svg).toContain('stop-color="#07050c" stop-opacity=".05"');
  });
});

describe('boardTheme', () => {
  it('échiquiers offerts : la seule classe de texture, aucune variable, aucune règle d’image', () => {
    for (const id of ['board:arcane', 'board:wood', 'board:slate']) {
      expect(boardTheme(id)).toEqual({ className: `tex-${boardStyle(id).texture}`, vars: {} });
      expect(themeCss(id)).toBe('');
    }
    // Absent, inconnu ou d'un autre emplacement : Nuit arcane
    expect(boardTheme(undefined)).toEqual(boardTheme('board:arcane'));
    expect(boardTheme('board:inconnu')).toEqual(boardTheme('board:arcane'));
    expect(boardTheme('skin:inferno')).toEqual(boardTheme('board:arcane'));
  });

  it('classes et variables des échiquiers décorés', () => {
    expect(boardTheme('board:jade').className).toBe('tex-marble has-fillet has-inlay fa-corners bt-jade');
    expect(boardTheme('board:ciel').className).toBe('tex-grain has-fillet has-inlay fa-corners fa-mid bt-ciel');
    expect(boardTheme('board:obsidian').className).toBe('tex-stone has-fillet has-inlay fa-border bt-obsidian');
    expect(boardTheme('board:grille').className).toBe('tex-none has-fillet has-inlay has-glow bt-grille');
    expect(boardTheme('board:horizon').className).toBe('tex-grain has-fillet has-inlay has-glow bt-horizon');
    const v = boardTheme('board:ciel').vars as Record<string, string>;
    expect(v).toEqual({ '--fillet': '#d9b45a', '--fa-size': '16px', '--fa-at': '1px', '--fa-mid': '8px', '--fa-mid-at': '1px' });
    expect((boardTheme('board:jade').vars as Record<string, string>)['--fa-at']).toBe('2px');
    expect((boardTheme('board:ruby').vars as Record<string, string>)['--fa-slice']).toBe('10');
    const h = boardTheme('board:horizon').vars as Record<string, string>;
    expect(h['--frame-bg']).toBe(style('board:horizon').frameGlow!.background);
    expect(h['--frame-shadow']).toBe(style('board:horizon').frameGlow!.shadow);
    expect((boardTheme('board:grille').vars as Record<string, string>)['--frame-bg']).toBeUndefined();
  });

  it('aucune image dans les variables (une url() venue d’une var() est repeinte à chaque recalcul de style)', () => {
    for (const b of BOARDS) {
      for (const [k, v] of Object.entries(boardTheme(b.id).vars as Record<string, string>)) expect(v, `${b.id} ${k}`).not.toMatch(/url\(/);
    }
  });

  it('une seule construction par thème : le même objet à chaque appel (Board est mémoïsé)', () => {
    for (const b of BOARDS) expect(boardTheme(b.id)).toBe(boardTheme(b.id));
  });

  it('règles d’images : url() en toutes lettres, propriétés détaillées, jamais de var() ni de dégradé CSS avec une url()', () => {
    for (const id of PREMIUM) {
      const css = themeCss(id);
      const s = style(id);
      const sel = `.board-wrap.bt-${id.slice(6)}`;
      expect(css, id).not.toMatch(/var\(|animation|transition|gradient\(/);
      if (s.inlay) expect(css, id).toContain(`${sel} .squares::before{background-image:${svgUrl(s.inlay)}}`);
      if (s.frameArt?.kind === 'border') expect(css, id).toContain(`${sel} .board::before{border-image-source:${svgUrl(s.frameArt.svg)}}`);
      if (s.frameArt?.kind === 'corners') {
        const art = svgUrl(s.frameArt.svg);
        const n = s.frameArt.mid ? 8 : 4;
        expect(css, id).toContain(`${sel} .board::before{background-image:${Array(n).fill(art).join(',')},${svgUrl(SHEEN_SVG)}}`);
        // Avec des images d'angle, la lueur ne peut pas ajouter de dégradé CSS à la même liste
        expect(s.frameGlow?.background, id).toBeUndefined();
      }
      // Data URI encodées : aucun caractère qui casserait url("…")
      for (const m of css.matchAll(/url\("([^"]*)"\)/g)) expect(m[1], id).not.toMatch(/[\s#<>]/);
    }
  });
});

describe('board.css : section « Habillage des échiquiers »', () => {
  const css = readFileSync(new URL('../src/client/styles/board.css', import.meta.url), 'utf8');
  const at = css.indexOf('/* Habillage des échiquiers');
  const section = css.slice(at);
  const rules = section.replace(/\/\*[\s\S]*?\*\//g, '');

  it('en fin de fichier, sans animation ni transition', () => {
    expect(at).toBeGreaterThan(0);
    expect(rules).not.toMatch(/\b(animation|transition|will-change)\s*:/);
    expect(rules).not.toMatch(/@keyframes/);
    expect(rules).not.toMatch(/\bfilter\s*:/);
  });

  it('aucune image dans la section, et aucune var() dans un raccourci qui porterait une image', () => {
    expect(rules).not.toMatch(/url\(/);
    // Les seuls raccourcis background de la section sont ceux des lueurs : dégradés et couleur, sans url()
    for (const m of rules.matchAll(/(^|[\s;{])(background|border-image)\s*:([^;]*);/g)) expect(m[3]).not.toMatch(/url\(/);
    expect(rules).not.toMatch(/(^|[\s;{])border-image\s*:/);
  });

  it('une règle pour chaque classe posée par boardTheme', () => {
    for (const cls of ['has-fillet', 'has-inlay', 'fa-border', 'fa-corners', 'fa-mid', 'has-glow']) {
      expect(rules, cls).toContain(`.${cls}`);
    }
    for (const v of ['--fillet', '--fa-slice', '--fa-size', '--fa-at', '--fa-mid', '--fa-mid-at', '--frame-bg', '--frame-shadow']) {
      expect(rules, v).toContain(`var(${v}`);
    }
  });

  // Ordre de peinture dans .board (contexte d'empilement de l'échiquier) : z-index (auto compte pour 0), puis ordre de
  // l'arbre. Une petite cascade suffit : les règles de board.css qui posent un z-index n'emploient que des classes, des
  // balises, le descendant et ::before / ::after (les autres sélecteurs, :hover ou :nth-child, n'en posent pas).
  interface ZRule {
    parts: { tag?: string; classes: string[] }[];
    pseudo: string | null;
    spec: number;
    order: number;
    z: number;
  }
  const zRules = (sheet: string): ZRule[] => {
    const out: ZRule[] = [];
    let order = 0;
    for (const m of sheet.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      order++;
      const z = m[2].match(/(?:^|[;\s])z-index\s*:\s*(-?\d+|auto)\s*(?:;|$)/)?.[1];
      if (z === undefined) continue;
      for (const raw of m[1].split(',')) {
        const sel = raw.trim().match(/^((?:[a-z]+|[a-z]*(?:\.[\w-]+)+)(?:\s+(?:[a-z]+|[a-z]*(?:\.[\w-]+)+))*)(?:::(before|after))?$/);
        if (!sel) continue;
        const parts = sel[1].split(/\s+/).map(p => ({
          tag: p.match(/^[a-z]+/)?.[0],
          classes: [...p.matchAll(/\.([\w-]+)/g)].map(c => c[1]),
        }));
        const classes = parts.reduce((n, p) => n + p.classes.length, 0);
        const types = parts.filter(p => p.tag).length + (sel[2] ? 1 : 0);
        out.push({ parts, pseudo: sel[2] ?? null, spec: classes * 100 + types, order, z: z === 'auto' ? 0 : Number(z) });
      }
    }
    return out;
  };
  type Part = ZRule['parts'][number];
  const fits = (p: Part, n: Part) => (!p.tag || p.tag === n.tag) && p.classes.every(c => n.classes.includes(c));
  /** z-index calculé d'un élément décrit par son chemin depuis .board-wrap (« div.sq.d.last »), 0 pour auto. */
  const zOf = (rules: ZRule[], path: string[], pseudo: string | null) => {
    const nodes = path.map(s => ({ tag: s.split('.')[0], classes: s.split('.').slice(1) }));
    let best: ZRule | undefined;
    for (const r of rules) {
      if (r.pseudo !== pseudo) continue;
      let i = nodes.length - 1;
      if (!fits(r.parts[r.parts.length - 1], nodes[i])) continue;
      let ok = true;
      for (let k = r.parts.length - 2; k >= 0 && ok; k--) {
        do i--;
        while (i >= 0 && !fits(r.parts[k], nodes[i]));
        ok = i >= 0;
      }
      if (ok && (!best || r.spec > best.spec || (r.spec === best.spec && r.order >= best.order))) best = r;
    }
    return best?.z ?? 0;
  };

  // Les calques d'une case et des pièces, dans l'ordre de l'arbre de Board : ::before de la case, indice,
  // coordonnées, ::after de la case (voiles, cibles), climat (::after de .squares), pièces, fantômes, éclat. Calques
  // d'un même emplacement (« slot ») : des variantes d'un même élément, jamais comparées entre elles.
  const BOARD = 'div.board.interactive.targeting';
  const SQ = [BOARD, 'div.squares', 'div.sq.d'];
  const VOILES = [
    'last', 'sel', 'pm-from', 'pm-to', 'hover', 'hover.hover-cap', 'target', 'chosen', 'last.target', 'last.chosen',
    'sel.target', 'pm-from.target', 'pm-to.target', 'pm-to.chosen', 'last.hover', 'last.hover.hover-cap', 'sel.hover',
  ];
  const PIECES = ['', '.vanish', '.is-moving', '.vanish.is-blast', '.dragging', '.is-moving.dragging'];
  const LAYERS: { name: string; path: string[]; pseudo: string | null; tree: number; slot: string }[] = [
    ...['check', 'iced', 'rift'].map(c => ({
      name: c, path: [BOARD, 'div.squares', `div.sq.d.${c}`], pseudo: 'before', tree: 1, slot: 'sq::before',
    })),
    { name: 'indice', path: [...SQ, 'span.hint'], pseudo: null, tree: 2, slot: 'hint' },
    { name: 'indice de prise', path: [...SQ, 'span.hint.cap'], pseudo: null, tree: 2, slot: 'hint' },
    { name: 'coordonnées', path: [...SQ, 'span.co.co-f'], pseudo: null, tree: 3, slot: 'co' },
    ...VOILES.map(v => ({
      name: v, path: [BOARD, 'div.squares', `div.sq.d.${v}`], pseudo: 'after', tree: 4, slot: 'sq::after',
    })),
    { name: 'climat', path: [BOARD, 'div.squares'], pseudo: 'after', tree: 5, slot: 'climat' },
    ...PIECES.map(p => ({
      name: `pièce${p}`, path: [BOARD, 'div.pieces', `div.piece${p}`], pseudo: null, tree: 6, slot: 'pièce',
    })),
    { name: 'fantôme', path: [BOARD, 'div.pieces', 'div.piece.ghost'], pseudo: null, tree: 7, slot: 'pièce' },
    {
      name: 'fantôme glissé', path: [BOARD, 'div.pieces', 'div.piece.ghost.dragging'], pseudo: null, tree: 7, slot: 'pièce',
    },
    { name: 'éclat', path: [BOARD, 'div.pieces', 'span.board-burst'], pseudo: null, tree: 8, slot: 'éclat' },
  ];
  const WRAP = 'div.board-wrap.clim.clim-ice_age.tex-grain.has-fillet';
  const keys = (sheet: string, inlay: boolean) => {
    const rules = zRules(sheet);
    const wrap = inlay ? `${WRAP}.has-inlay` : WRAP;
    return LAYERS.map(l => zOf(rules, [wrap, ...l.path], l.pseudo) * 100 + l.tree);
  };

  it('la cascade du test lit board.css : z-index d’origine', () => {
    const base = keys(css, false).map(k => Math.floor(k / 100));
    const z = Object.fromEntries(LAYERS.map((l, i) => [l.name, base[i]]));
    expect(z).toMatchObject({
      check: 1, iced: 1, rift: 1, indice: 2, coordonnées: 1, last: 0, 'last.target': 2, 'pm-to.chosen': 2, climat: 3,
      pièce: 1, 'pièce.vanish': 0, 'pièce.is-moving': 2, 'pièce.vanish.is-blast': 2, 'pièce.dragging': 10,
      fantôme: 2, 'fantôme glissé': 10, éclat: 3,
    });
  });

  it('la section ne change rien aux échiquiers sans incrustation', () => {
    expect(keys(css, false)).toEqual(keys(css.slice(0, at), false));
  });

  it('avec incrustation : tous les états de jeu au-dessus d’elle, dans le même ordre que sans incrustation', () => {
    const rules = zRules(css);
    const inlay = zOf(rules, [`${WRAP}.has-inlay`, BOARD, 'div.squares'], 'before') * 100;
    expect(inlay).toBe(100);
    const sans = keys(css, false);
    const avec = keys(css, true);
    const ecarts: string[] = [];
    LAYERS.forEach((a, i) => {
      if (avec[i] <= inlay) ecarts.push(`${a.name} sous l'incrustation`);
      LAYERS.forEach((b, j) => {
        if (j <= i || a.slot === b.slot && a.slot !== 'pièce') return;
        if (Math.sign(sans[i] - sans[j]) !== Math.sign(avec[i] - avec[j])) ecarts.push(`${a.name} / ${b.name}`);
      });
    });
    expect(ecarts).toEqual([]);
  });

  it('survol du glisser : dessiné une seule fois avec incrustation (sur ::after, plus sur la case)', () => {
    expect(rules).toMatch(/\.has-inlay \.sq\.hover,\s*\.has-inlay \.sq\.hover-cap \{\s*box-shadow: none;/);
    expect(rules).toMatch(/\.has-inlay \.sq\.hover::after \{[^}]*content: '';/);
  });
});

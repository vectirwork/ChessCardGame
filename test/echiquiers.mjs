// Planches des échiquiers (lot C des skins) : le vrai composant Board et le vrai board.css, rendus dans Chromium.
//   node test/echiquiers.mjs [dossier de sortie] [--banc]
//
// Le composant est assemblé par esbuild (aucun serveur), avec les vrais rois des collections. Planches produites :
// - petits-dpr1.png, petits-dpr3.png : les 10 échiquiers à 36 px par case (taille téléphone), au départ et en milieu
//   de partie ;
// - grands.png : les 10 échiquiers à 64 px par case (ordinateur), au départ et en milieu de partie ;
// - retournes.png : les échiquiers décorés vus des Noirs (les motifs restent sur les cases sombres) ;
// - etats.png : dernier coup, sélection et indices, échec, Mur de glace, Faille, puis cibles d'une carte, au-dessus
//   de l'incrustation ;
// - faille-obsidienne.png : la Faille à côté des craquelures d'Obsidienne, à 64 px ;
// - coins.png : les coins des cadres (frises en border-image, images d'angle, lueurs) en densité 3, dans l'arrondi
//   de 14 px ;
// - inclinaison.png : l'échiquier incliné comme pendant un sort (is-tilting, --tilt), sans « dalle sombre ».
// Avec --banc : chaque échiquier seul (64 px par case, densité 2), avec ses décors puis sans (une feuille de style
// neutralise la section « Habillage des échiquiers ») : calques composés, coût du premier rendu (peinture,
// rastérisation, décodage d'images, médiane de 3 passages), repeintes et images pendant 2 s de repos, repeintes quand
// le style est recalculé sans rien changer (variable héritée, comme au défilement de l'accueil) et pendant une
// inclinaison de sort (is-tilting, --tilt à chaque image). Attendu : mêmes calques avec et sans décor, aucune repeinte
// ni image au repos ni au recalcul, autant de repeintes en sort avec et sans décor. Ne pas lancer pendant une autre
// mesure.
//
// Rien n'est vérifié automatiquement sur les images : elles se relisent à l'œil.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
function chargerPlaywright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try {
      return require(p);
    } catch {
      // essai suivant
    }
  }
  throw new Error('Playwright introuvable (ni dans node_modules, ni dans /opt/node-tools).');
}
const { chromium } = chargerPlaywright();

const args = process.argv.slice(2);
const BANC = args.includes('--banc');
const OUT = path.resolve(args.find(a => !a.startsWith('--')) ?? path.join(os.tmpdir(), 'echiquiers'));
mkdirSync(OUT, { recursive: true });
const TEST = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST, '..');

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// Roi blanc h1 (case claire), roi noir b8 (case sombre) ; le cavalier noir vient de g8 en f6.
const MID = '1k1r3r/ppp1qppp/2n1bn2/2bpp3/4P3/2NP1N2/PPPQBPPP/R4R1K w - - 0 1';

// Banc : rend une liste de cases (échiquier + légende) décrite par window.__PLANCHE.
const HARNESS = `
import { createRoot } from 'react-dom/client';
import { Board } from '../src/client/components/Board';
import { fromFen, legalMoves, sqIndex } from '../src/shared/chess';
import { collectionOf, itemById } from '../src/shared/catalog';
import type { Effect } from '../src/shared/game';

interface Cell {
  theme: string; fen: string; size: number; o?: 'w' | 'b'; label?: string;
  last?: [string, string]; check?: string; iced?: string[]; rift?: string[]; targets?: string[]; legal?: boolean;
}
const P = (window as any).__PLANCHE as { cols: number; gap?: number; cells: Cell[] };
const sq = (n: string) => sqIndex(n);
let id = 1;
const fx = (card: string, extra: Partial<Effect>): Effect =>
  ({ id: id++, card, caster: 'w', countsOn: 'w', remaining: 0, total: 0, skin: 'skin:arcane', global: true, permanent: true, ...extra }) as Effect;
const nameOf = (theme: string) => itemById(theme)?.name ?? theme;

function CellView({ c }: { c: Cell }) {
  const { pos } = fromFen(c.fen);
  const col = collectionOf(c.theme);
  const effects: Effect[] = [];
  for (const s of c.iced ?? []) effects.push(fx('ice_wall', { square: sq(s) }));
  if (c.rift?.length) effects.push(fx('rift', { squares: c.rift.map(sq) } as Partial<Effect>));
  return (
    <figure style={{ margin: 0, padding: 14 }}>
      <div style={{ width: c.size * 8, height: c.size * 8 }} data-theme={c.theme}>
        <Board
          pos={pos}
          orientation={c.o ?? 'w'}
          theme={c.theme}
          kingW={col?.king}
          kingB={col?.king}
          lastMove={c.last ? { from: sq(c.last[0]), to: sq(c.last[1]) } : null}
          check={c.check ? sq(c.check) : null}
          effects={effects}
          targets={c.targets ? c.targets.map(sq) : null}
          legal={c.legal ? legalMoves(pos) : []}
          onMove={c.legal ? () => {} : undefined}
        />
      </div>
      <figcaption style={{ font: '600 12px system-ui', color: '#b9b3d9', marginTop: 16, maxWidth: c.size * 8 }}>
        {c.label ?? nameOf(c.theme)}
      </figcaption>
    </figure>
  );
}
createRoot(document.getElementById('root')!).render(
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + P.cols + ', max-content)', gap: P.gap ?? 10, padding: 10 }}>
    {P.cells.map((c, i) => <CellView key={i} c={c} />)}
  </div>,
);
`;

const bundle = await build({
  stdin: { contents: HARNESS, resolveDir: TEST, sourcefile: 'echiquiers-banc.tsx', loader: 'tsx' },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'empty' },
  logLevel: 'error',
});
const JS = bundle.outputFiles[0].text;
const CSS = readFileSync(path.join(ROOT, 'src/client/styles/board.css'), 'utf8');
// Banc : retire les décors (liseré, incrustation, frise, images d'angle, lueurs) pour la mesure « sans décor ».
const NU = `.board-wrap .squares{box-shadow:none!important}.board-wrap .squares::before{content:none!important}
.board-wrap .board::before{border:0!important;border-image:none!important;
background:linear-gradient(145deg,rgba(255,255,255,.14),transparent 40%),var(--frame)!important;
box-shadow:0 30px 70px -20px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.06),inset 0 0 0 1px rgba(255,255,255,.08)!important}`;
const html = (planche, nu = false) => `<!doctype html><html lang="fr"><meta charset="utf-8">
<style>${CSS}${nu ? NU : ''}</style>
<style>body{margin:0;background:#0b0a1c;font-family:system-ui,sans-serif}</style>
<div id="root"></div>
<script>window.__PLANCHE=${JSON.stringify(planche)}</script>
<script>${JS.replace(/<\/script/g, '<\\/script')}</script></html>`;

const THEMES = ['board:arcane', 'board:wood', 'board:slate', 'board:jade', 'board:grille', 'board:obsidian', 'board:marble', 'board:ruby', 'board:horizon', 'board:ciel'];
const DECORES = THEMES.slice(3);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const pages = new Map();
async function pageFor(dpr) {
  if (!pages.has(dpr)) pages.set(dpr, await (await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: dpr })).newPage());
  return pages.get(dpr);
}
/** Rend une planche ; `prepare` agit sur la page avant la capture (clics, classes). */
async function render(planche, { dpr = 1, prepare } = {}) {
  const page = await pageFor(dpr);
  const width = planche.cols * (planche.cells[0].size * 8 + 28 + (planche.gap ?? 10)) + 40;
  await page.setViewportSize({ width: Math.max(400, width), height: 900 });
  await page.setContent(html(planche));
  await page.waitForSelector('.board-wrap');
  if (prepare) await prepare(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return page;
}
async function shoot(name, planche, opts = {}) {
  const page = await render(planche, opts);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
  return page;
}

const both = size => THEMES.flatMap(t => [
  { theme: t, fen: START, size, label: `${t.slice(6)} : départ` },
  { theme: t, fen: MID, size, last: ['g8', 'f6'], label: `${t.slice(6)} : milieu de partie` },
]);

if (!BANC) {
  await shoot('petits-dpr1.png', { cols: 6, cells: both(36) }, { dpr: 1 });
  await shoot('petits-dpr3.png', { cols: 6, cells: both(36) }, { dpr: 3 });
  await shoot('grands.png', { cols: 4, cells: both(64) }, { dpr: 1 });
  await shoot('retournes.png', {
    cols: 4,
    cells: DECORES.flatMap(t => [
      { theme: t, fen: MID, size: 44, label: `${t.slice(6)} : Blancs` },
      { theme: t, fen: MID, size: 44, o: 'b', label: `${t.slice(6)} : Noirs (retourné)` },
    ]),
  });
  // États de jeu : dernier coup g8-f6, sélection du cavalier f3 (indices, prise en e5), échec en h1, Mur de glace en
  // h3, Faille en a4 et b4 ; puis cibles d'une carte.
  const etats = THEMES.filter(t => t !== 'board:wood' && t !== 'board:slate').flatMap(t => [
    { theme: t, fen: MID, size: 48, last: ['g8', 'f6'], check: 'h1', iced: ['h3'], rift: ['a4', 'b4'], legal: true, label: `${t.slice(6)} : états` },
    { theme: t, fen: MID, size: 48, targets: ['c6', 'd5', 'e5', 'f6', 'd4', 'g5'], label: `${t.slice(6)} : cibles` },
  ]);
  await shoot('etats.png', { cols: 4, cells: etats }, {
    dpr: 2,
    prepare: async page => {
      for (const b of await page.$$('.board.interactive')) {
        const s = await b.$('.sq[data-sq="21"]');
        await s.click();
      }
      await page.mouse.move(0, 0);
    },
  });
  await shoot('faille-obsidienne.png', {
    cols: 2,
    cells: [
      { theme: 'board:obsidian', fen: '8/8/8/8/8/8/8/8 w - - 0 1', size: 64, label: 'Obsidienne : les huit craquelures' },
      { theme: 'board:obsidian', fen: '8/8/8/8/8/8/8/8 w - - 0 1', size: 64, rift: ['a4', 'b4', 'c4', 'e3', 'f4'], label: 'Faille en a4, b4, c4, e3, f4' },
    ],
  }, { dpr: 2 });

  // Coins des cadres, densité 3 : coin haut-gauche et coin bas-droit de chaque cadre décoré.
  {
    const page = await render({ cols: 7, cells: DECORES.map(t => ({ theme: t, fen: START, size: 36 })) }, { dpr: 3 });
    const shots = [];
    for (const t of DECORES) {
      const box = await page.locator(`[data-theme="${t}"]`).boundingBox();
      for (const [x, y] of [[box.x - 14, box.y - 14], [box.x + box.width - 30, box.y + box.height - 30]]) {
        const png = await page.screenshot({ clip: { x, y, width: 44, height: 44 } });
        shots.push({ t, src: `data:image/png;base64,${png.toString('base64')}` });
      }
    }
    const sheet = await (await browser.newContext({ viewport: { width: 1200, height: 400 }, deviceScaleFactor: 1 })).newPage();
    await sheet.setContent(`<body style="margin:0;background:#0b0a1c;color:#b9b3d9;font:600 12px system-ui">
      <div style="display:grid;grid-template-columns:repeat(7,150px);gap:10px;padding:12px">${DECORES.map(t => `<div>${shots
        .filter(s => s.t === t)
        .map(s => `<img src="${s.src}" style="width:132px;height:132px;image-rendering:pixelated;display:block;margin-bottom:6px">`)
        .join('')}${t.slice(6)}</div>`).join('')}</div></body>`);
    const file = path.join(OUT, 'coins.png');
    await sheet.screenshot({ path: file, fullPage: true });
    console.log(file);
  }

  // Pendant un sort : la scène 3D pose is-tilting et --tilt sur .board-wrap (stage.ts).
  await shoot('inclinaison.png', { cols: 4, cells: DECORES.map(t => ({ theme: t, fen: MID, size: 40 })) }, {
    dpr: 2,
    prepare: page => page.evaluate(() => {
      for (const w of document.querySelectorAll('.board-wrap')) {
        w.classList.add('is-tilting');
        w.style.setProperty('--tilt', '32deg');
      }
    }),
  });
} else {
  // Banc : un échiquier seul par page. Calques composés (LayerTree), puis deux traces : le premier rendu (peinture,
  // rastérisation et décodage des images, en ms cumulées) et 2 s de repos (repeintes Paint, images DrawFrame).
  const ctx = await browser.newContext({ viewport: { width: 700, height: 700 }, deviceScaleFactor: 2 });
  const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame'];
  const events = async () => JSON.parse((await browser.stopTracing()).toString()).traceEvents;
  const RENDER = new Set(['Paint', 'RasterTask', 'ImageDecodeTask', 'Decode Image']);
  async function measure(theme, nu) {
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    let layers = 0;
    cdp.on('LayerTree.layerTreeDidChange', e => {
      if (e.layers) layers = e.layers.filter(l => l.drawsContent).length;
    });
    await cdp.send('LayerTree.enable');
    await browser.startTracing(page, { categories: CATS });
    await page.setContent(html({ cols: 1, cells: [{ theme, fen: MID, size: 64 }] }, nu));
    await page.waitForSelector('.board-wrap');
    await page.waitForTimeout(800);
    const first = (await events()).filter(e => RENDER.has(e.name) && e.dur).reduce((s, e) => s + e.dur / 1000, 0);
    await browser.startTracing(page, { categories: CATS });
    await page.waitForTimeout(2000);
    const idle = await events();
    const rest = layers;
    // Recalcul de style sans effet visible, comme le défilement de l'accueil (--base-tilt, engine.ts) : une variable
    // héritée change toutes les 50 ms sur .board-wrap. Attendu : aucune repeinte.
    await browser.startTracing(page, { categories: CATS });
    await page.evaluate(() => new Promise(done => {
      const w = document.querySelector('.board-wrap');
      let i = 0;
      const t = setInterval(() => {
        w.style.setProperty('--recalc', String(i++));
        if (i > 30) { clearInterval(t); done(); }
      }, 50);
    }));
    const recalc = await events();
    // Pendant un sort (stage.ts) : is-tilting et --tilt à chaque image ; repeintes comparées à l'échiquier sans décor.
    await browser.startTracing(page, { categories: CATS });
    await page.evaluate(() => new Promise(done => {
      const w = document.querySelector('.board-wrap');
      w.classList.add('is-tilting');
      let i = 0;
      const step = () => {
        w.style.setProperty('--tilt', `${Math.sin(i / 10) * 25}deg`);
        if (++i < 60) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    }));
    const tilt = await events();
    await page.close();
    const paints = ev => ev.filter(e => e.name === 'Paint').length;
    return { layers: rest, first, paints: paints(idle), frames: idle.filter(e => e.name === 'DrawFrame').length, recalc: paints(recalc), tilt: paints(tilt) };
  }
  const median = a => [...a].sort((x, y) => x - y)[a.length >> 1];
  const rows = [];
  for (const t of THEMES) {
    const runs = { avec: [], sans: [] };
    for (let i = 0; i < 3; i++) for (const nu of [false, true]) runs[nu ? 'sans' : 'avec'].push(await measure(t, nu));
    const row = { theme: t };
    for (const k of ['avec', 'sans']) {
      row[`calques ${k}`] = Math.max(...runs[k].map(r => r.layers));
      row[`rendu ${k} (ms)`] = Math.round(median(runs[k].map(r => r.first)));
    }
    row['repeintes au repos'] = Math.max(...runs.avec.map(r => r.paints));
    row['images au repos'] = Math.max(...runs.avec.map(r => r.frames));
    row['repeintes, style recalculé'] = Math.max(...runs.avec.map(r => r.recalc));
    for (const k of ['avec', 'sans']) row[`repeintes, sort ${k}`] = median(runs[k].map(r => r.tilt));
    rows.push(row);
  }
  console.table(rows);
  writeFileSync(path.join(OUT, 'banc.json'), JSON.stringify(rows, null, 2));
}
await browser.close();

// Sorts des skins : planche, vrais sorts au banc des effets, coup de grâce, vitrine, banc de performance.
//   node test/sorts.mjs [--out=test-results/sorts] [--port=3541] [--only=planche,sorts,finale,banc]
//                       [--site=http://localhost:3643]
//
// Lance son propre serveur Vite (racine du dépôt, cache propre à cette copie du dépôt, hors de node_modules, sans
// rechargement à chaud), puis Chromium (Playwright, SwiftShader). Rien à construire avant. Produit dans le dossier de
// sortie :
// - planche.png : les 8 skins de sorts, chacun avec son motif et ses particules, teints et mêlés comme dans la scène
//   (motif additif teint à plat ; particules additives ou normales selon leur forme, leur couleur multipliant la
//   texture comme le fait le programme des particules), sur fond de nuit ; Laurier et Écarlate doivent se distinguer
//   d'un coup d'œil de Sakura, d'Inferno et d'Arcane. Une neuvième case montre Laurier avec la feuille proposée.
//   Contrôle : chaque texture dessine quelque chose et ne touche pas le bord de son carré (rien de coupé).
// - sorts.png (et sorts/*.png) : les vrais sorts au banc (test/vfx.html), image par image : l'arrivée du Sablier fou
//   (la grande mise en scène, motif au centre) pour chacun des 8 skins ; pour Laurier et Écarlate, le Mur de glace
//   (la couronne de laurier qui se referme), la Faille, la Grande Marée, l'annonce et l'arrivée de la Déflagration.
// - finale.png (et finale/*.png) : le coup de grâce (playFinale) pendant la chute du roi maté, en Laurier, Écarlate
//   et Inferno, et en Écarlate vu des noirs ; contrôle : plus aucune image demandée par la scène après la fin.
// - vitrine/*.png, avec --site (adresse d'un site construit et lancé) : les vrais sorts Laurier et Écarlate dans la
//   vitrine de la boutique (/boutique?objet=…), bureau 1440 × 900 et téléphone 412 × 915.
// - banc.json : coût du dessin de chaque texture (processeur ralenti 4 fois), et premier sort Écarlate comparé au
//   premier sort Inferno sur un téléphone simulé (412 × 915, densité 2, processeur ralenti 4 fois).
// Les mesures du banc sont faites en rendu logiciel (SwiftShader) : seules les comparaisons ont un sens, et pas pendant
// que d'autres processus lourds tournent.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const OUT = path.resolve(arg('out') ?? path.join(ROOT, 'test-results/sorts'));
const PORT = Number(arg('port') ?? 3541);
const SITE = arg('site')?.replace(/\/$/, '');
const ONLY = (arg('only') ?? `planche,sorts,finale,banc${SITE ? ',vitrine' : ''}`).split(',');
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------------------------
// Pages du banc, servies par Vite (modules virtuels : aucun fichier de plus dans le dépôt)

/** Animation pilotée image par image (comme test/vfx.html) : `__step(ms)`, `__pending()` (images demandées). */
const STEPPED = `<script>
  window.__t = 0;
  window.__frames = 0;
  const queue = [];
  window.requestAnimationFrame = cb => (queue.push(cb), queue.length);
  window.cancelAnimationFrame = () => {};
  performance.now = () => window.__t;
  window.__step = ms => {
    window.__t += ms;
    const run = queue.splice(0);
    window.__frames += run.length;
    run.forEach(cb => cb(window.__t));
  };
  window.__pending = () => queue.length;
</script>`;

const PAGES = {
  // Planche des 8 skins : les textures de la scène (particleTexture, flourishTexture : mêmes canevas), teintes comme
  // dans la scène : le motif (MeshBasicMaterial) prend flourishColor ; la particule (particles.ts) multiplie sa texture
  // par sa couleur, en valeurs linéaires écrites telles quelles (le programme ne réencode pas en sRGB). Une neuvième
  // case montre Laurier avec la feuille proposée (leafPainter, pas encore branchée : lot F).
  planche: {
    head: '',
    code: `
import { flourishTexture, particleTexture, leafPainter, FLOURISH_SIZE, PARTICLE_SIZE, PARTICLE_PAINTERS, FLOURISH_PAINTERS } from '/src/client/vfx/textures.ts';
import { flourishColor } from '/src/client/vfx/effects.ts';
import { SPELL_ITEMS } from '/src/shared/skins/spells.ts';

/** Motif : teinte à plat (texture blanche, couleur du matériau). */
const tint = (src, color) => {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
};
/** Particule : comme le programme de particles.ts, vColor * t.rgb en linéaire (texture sRGB décodée), alpha de la texture. */
const lin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const shade = (src, hex) => {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const col = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = Math.round(255 * col[k] * lin(d[i + k] / 255));
  g.putImageData(img, 0, 0);
  return c;
};
const leaf = document.createElement('canvas');
leaf.width = leaf.height = PARTICLE_SIZE;
leafPainter(leaf.getContext('2d'), PARTICLE_SIZE);
const normal = shape => shape === 'void' || shape === 'petal' || shape === 'leaf';
let seed = 7;
const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const root = document.getElementById('root');
root.style.cssText = 'display:grid;grid-template-columns:repeat(4,330px);gap:18px;padding:22px;font:13px Inter,system-ui,sans-serif;color:#e9e4ff';
const laurier = SPELL_ITEMS.find(i => i.id === 'skin:laurier');
const entries = [
  ...SPELL_ITEMS.map(item => ({ item, shape: item.skin.particle, tex: particleTexture(item.skin.particle).image })),
  { item: laurier, shape: 'leaf', tex: leaf, note: 'proposition : feuille (lot F)' },
];
for (const { item, shape, tex, note } of entries) {
  const s = item.skin;
  const fig = document.createElement('figure');
  fig.style.cssText = 'margin:0;background:#120f24;border-radius:14px;padding:10px;' + (note ? 'outline:2px dashed #8fc27a' : ['skin:laurier', 'skin:ecarlate'].includes(item.id) ? 'outline:2px solid #f3c969' : '');
  const cv = document.createElement('canvas');
  cv.width = cv.height = 620;
  cv.style.cssText = 'width:310px;height:310px;border-radius:10px;display:block';
  const g = cv.getContext('2d');
  const bg = g.createRadialGradient(310, 310, 0, 310, 310, 440);
  bg.addColorStop(0, '#2a2350'); bg.addColorStop(1, '#07060f');
  g.fillStyle = bg; g.fillRect(0, 0, 620, 620);
  // Motif : mélange additif, opacité de crête 0,95 (flourishDisk)
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.95;
  g.drawImage(tint(flourishTexture(s.flourish).image, '#' + flourishColor(s).getHexString()), 50, 50, 520, 520);
  // Particules : couleurs tirées comme pick() (½ principale, ³⁄₁₀ secondaire, ⅕ éclat)
  const cols = [s.primary, s.secondary, s.accent].map(c => shade(tex, c));
  g.globalCompositeOperation = normal(shape) ? 'source-over' : 'lighter';
  seed = 7;
  for (let k = 0; k < 34; k++) {
    const u = r();
    const col = u < 0.5 ? cols[0] : u < 0.8 ? cols[1] : cols[2];
    const z = 22 + r() * 34;
    g.save();
    g.translate(40 + r() * 540, 40 + r() * 540);
    g.rotate(r() * 6.28);
    g.globalAlpha = 0.65 + r() * 0.35;
    g.drawImage(col, -z / 2, -z / 2, z, z);
    g.restore();
  }
  fig.appendChild(cv);
  // Trois particules en gros : principale, secondaire, éclat
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:8px;align-items:center';
  for (const col of cols) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    c.style.cssText = 'width:64px;height:64px;background:#07060f;border-radius:8px';
    const cg = c.getContext('2d');
    cg.globalCompositeOperation = normal(shape) ? 'source-over' : 'lighter';
    cg.drawImage(col, 0, 0, 128, 128);
    row.appendChild(c);
  }
  const drift = s.drift > 0.1 ? 'montent' : s.drift < -0.1 ? 'retombent' : 'flottent';
  const cap = document.createElement('figcaption');
  cap.innerHTML = '<b style="font-size:16px">' + item.name + '</b><br>' + shape + ' · ' + s.flourish + '<br>' + (note ?? 'particules : ' + drift);
  cap.style.cssText = 'line-height:1.35';
  row.appendChild(cap);
  fig.appendChild(row);
  root.appendChild(fig);
}
// Contrôle : chaque texture dessine quelque chose, et rien ne touche le bord (motif coupé)
const report = {};
const measure = (canvas) => {
  const { width: W, height: H } = canvas;
  const d = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  let on = 0, edge = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = d[(y * W + x) * 4 + 3];
    if (a > 8) on++;
    if ((x < 1 || y < 1 || x >= W - 1 || y >= H - 1) && a > edge) edge = a;
  }
  return { couverture: +(on / (W * H)).toFixed(4), bord: edge };
};
for (const p of Object.keys(PARTICLE_PAINTERS)) report['particule ' + p] = measure(particleTexture(p).image);
for (const f of Object.keys(FLOURISH_PAINTERS)) report['motif ' + f] = measure(flourishTexture(f).image);
report['particule leaf (proposée)'] = measure(leaf);
window.__report = report;
window.ready = true;
`,
  },
  // Coup de grâce : mat du berger (le roi noir en e8, maté par la dame en f7), chute du roi et playFinale
  finale: {
    head: STEPPED,
    code: `
import '/src/client/styles/global.css';
import '/src/client/styles/board.css';
import { createElement as h, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Board } from '/src/client/components/Board.tsx';
import { fromFen, sqIndex } from '/src/shared/chess.ts';
import { skinStyle } from '/src/shared/catalog.ts';
import { VfxStage, playFinale } from '/src/client/vfx/index.ts';

const q = new URLSearchParams(location.search);
const FEN = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
const KING = sqIndex('e8');
function App() {
  const ref = useRef(null);
  const [mated, setMated] = useState(null);
  const pos = useMemo(() => fromFen(FEN).pos, []);
  useEffect(() => {
    const stage = new VfxStage(ref.current.wrap, q.get('o') ?? 'w');
    stage.guard = false;
    window.go = () => {
      flushSync(() => setMated(KING));
      const played = playFinale(stage, KING, skinStyle(q.get('skin') ?? 'skin:laurier'));
      for (const a of document.getAnimations()) a.pause();
      return played;
    };
    // Chute du roi (animations CSS) calée sur l'horloge de la scène
    window.seek = ms => {
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = ms;
      }
    };
    window.canvasShown = () => document.querySelector('.vfx-canvas')?.style.display !== 'none';
    window.ready = true;
  }, []);
  return h('div', { style: { width: 600, margin: '140px auto 40px' } },
    h(Board, { ref, pos, orientation: q.get('o') ?? 'w', mated, lastMove: { from: sqIndex('h5'), to: sqIndex('f7') },
      kingW: q.get('kw') ?? 'king:laure', kingB: q.get('kb') ?? 'king:braise', theme: q.get('theme') ?? undefined, locked: true }));
}
createRoot(document.getElementById('root')).render(h(App));
`,
  },
  // Banc : coût du dessin de chaque texture, sur un canevas neuf à chaque mesure
  banc: {
    head: '',
    code: `
import { FLOURISH_PAINTERS, PARTICLE_PAINTERS, FLOURISH_SIZE, PARTICLE_SIZE } from '/src/client/vfx/textures.ts';
window.bench = () => {
  const out = {};
  const one = (paint, S, flourish) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    if (flourish) { g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.shadowColor = '#fff'; g.shadowBlur = 10; }
    const t0 = performance.now();
    paint(g, S);
    g.getImageData(0, 0, 1, 1);
    return performance.now() - t0;
  };
  const med = xs => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  for (const [k, p] of Object.entries(FLOURISH_PAINTERS)) out['motif ' + k] = +med(Array.from({ length: 7 }, () => one(p, FLOURISH_SIZE, true))).toFixed(2);
  for (const [k, p] of Object.entries(PARTICLE_PAINTERS)) out['particule ' + k] = +med(Array.from({ length: 7 }, () => one(p, PARTICLE_SIZE, false))).toFixed(2);
  return out;
};
window.ready = true;
`,
  },
};

function pagesPlugin() {
  return {
    name: 'spellmate:sorts',
    resolveId(id) {
      if (id.startsWith('sorts:')) return '\0' + id;
    },
    load(id) {
      if (id.startsWith('\0sorts:')) return PAGES[id.slice(7)]?.code;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = /^\/__sorts\/(\w+)/.exec(req.url ?? '');
        if (!m || !PAGES[m[1]]) return next();
        const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Sorts : ${m[1]}</title>${PAGES[m[1]].head}</head>
<body style="margin:0;background:#07060f"><div id="root"></div><script type="module" src="/@id/__x00__sorts:${m[1]}"></script></body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(await server.transformIndexHtml(req.url, html));
      });
    },
  };
}

const server = await createServer({
  root: ROOT,
  // Un cache par copie du dépôt : deux copies qui lancent le banc en même temps ne se marchent pas dessus (node_modules
  // peut être un lien partagé entre copies : le cache n'y va pas)
  cacheDir: path.join(os.tmpdir(), 'spellmate-sorts-vite-' + createHash('sha1').update(ROOT).digest('hex').slice(0, 10)),
  logLevel: 'warn',
  // node_modules peut être un lien (copie de travail) : son vrai dossier doit être servi aussi (polices)
  server: { port: PORT, strictPort: false, hmr: false, fs: { allow: [ROOT, realpathSync(path.join(ROOT, 'node_modules'))] } },
  optimizeDeps: { entries: ['test/vfx.html'], include: ['react', 'react-dom', 'react-dom/client', 'three'] },
  plugins: [pagesPlugin()],
});
await server.listen();
const BASE = (server.resolvedUrls?.local[0] ?? `http://localhost:${PORT}/`).replace(/\/$/, '');
console.log('serveur', BASE);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const watch = (page, label) => {
  page.on('pageerror', e => errors.push(`${label} : ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`${label} : ${m.text()}`);
    if (process.env.SORTS_DEBUG) console.log(`[${label}] ${m.type()} ${m.text()}`);
  });
};
// Sondage par minuterie : les pages pilotées image par image remplacent requestAnimationFrame
const ready = page => page.waitForFunction(() => window.ready === true, null, { timeout: 60000, polling: 100 });
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Assemble des captures en une planche (images en data URI, légendes). */
async function montage(file, title, cells, columns, width) {
  const page = await browser.newPage({ viewport: { width: columns * (width + 12) + 40, height: 400 } });
  const fig = cells
    .map(c => `<figure style="margin:0"><img src="data:image/png;base64,${c.png.toString('base64')}" style="width:${width}px;display:block;border-radius:8px"><figcaption style="margin-top:4px">${c.caption}</figcaption></figure>`)
    .join('');
  await page.setContent(`<body style="margin:0;padding:20px;background:#0b0a16;color:#e9e4ff;font:13px system-ui,sans-serif">
<div style="font:italic 22px Georgia,serif;margin-bottom:12px">${title}</div>
<div style="display:grid;grid-template-columns:repeat(${columns},${width}px);gap:12px">${fig}</div></body>`);
  await page.waitForLoadState('load');
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  await page.close();
}

const SKINS = ['skin:arcane', 'skin:sakura', 'skin:neon', 'skin:inferno', 'skin:laurier', 'skin:ecarlate', 'skin:void', 'skin:celestial'];
const NAME = {
  'skin:arcane': 'Arcane', 'skin:sakura': 'Sakura', 'skin:neon': 'Néon 2084', 'skin:inferno': 'Inferno', 'skin:laurier': 'Laurier',
  'skin:ecarlate': 'Écarlate', 'skin:void': 'Néant', 'skin:celestial': 'Céleste',
};
const CARD = { hourglass: 'Sablier fou', ice_wall: 'Mur de glace', rift: 'Faille', tide: 'Grande Marée', blast: 'Déflagration' };
const results = {};

try {
  // -------------------------------------------------------------------------------------------
  if (ONLY.includes('planche')) {
    const page = await browser.newPage({ viewport: { width: 1450, height: 900 }, deviceScaleFactor: 1 });
    watch(page, 'planche');
    await page.goto(`${BASE}/__sorts/planche`);
    await ready(page);
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'planche.png'), fullPage: true });
    const report = await page.evaluate(() => window.__report);
    results.textures = report;
    for (const [k, v] of Object.entries(report)) {
      assert.ok(v.couverture > 0.004, `${k} : la texture ne dessine presque rien (${v.couverture})`);
      assert.ok(v.bord <= 8, `${k} : la texture touche le bord de son carré (alpha ${v.bord})`);
    }
    console.log('planche : 15 textures dessinées, aucune coupée');
    await page.close();
  }

  // -------------------------------------------------------------------------------------------
  if (ONLY.includes('sorts')) {
    mkdirSync(path.join(OUT, 'sorts'), { recursive: true });
    const page = await browser.newPage({ viewport: { width: 860, height: 860 } });
    watch(page, 'sorts');
    const step = ms => page.evaluate(ms => window.__step(ms), ms);
    // [carte, cibles, skin, instants (s), arrivée] : avec `arrivée`, deux coups sont joués après l'annonce du Présage et
    // les instants comptent depuis son arrivée (la grande mise en scène, au centre) ; sinon depuis le lancement.
    const CASTS = [
      ...SKINS.map(skin => ['hourglass', [], skin, [0.6, 1.2], true]),
      ['ice_wall', ['e5'], 'skin:laurier', [0.12, 0.24, 0.4, 0.9]],
      ['ice_wall', ['e5'], 'skin:ecarlate', [0.12, 0.24, 0.4, 0.9]],
      ['rift', ['a5'], 'skin:laurier', [0.95]],
      ['rift', ['a5'], 'skin:ecarlate', [0.95]],
      ['tide', [], 'skin:laurier', [1.05]],
      ['tide', [], 'skin:ecarlate', [1.05]],
      ['blast', [], 'skin:ecarlate', [0.45]],
      ['blast', [], 'skin:ecarlate', [1.15], true],
    ];
    const cells = [];
    const advance = async (from, to, ms = 33) => {
      let t = from;
      while (t < to - 1e-6) {
        await step(ms);
        t += ms / 1000;
      }
      return t;
    };
    for (const [card, targets, skin, times, arrival] of CASTS) {
      await page.goto(`${BASE}/test/vfx.html`);
      await ready(page);
      for (let i = 0; i < 3; i++) await step(16);
      const r = await page.evaluate(([c, t, s]) => window.cast(c, t, s), [card, targets, skin]);
      assert.equal(r, 'ok', `${card} ${skin} : ${r}`);
      if (arrival) {
        await advance(0, 3.4, 50);
        await sleep(600);
        assert.equal(await page.evaluate(() => window.castDone), true, `${card} ${skin} : annonce non terminée`);
        await page.evaluate(() => window.moves(2));
        // L'arrivée part 80 ms plus tard, en temps réel (VfxStage.syncMarkers)
        await sleep(250);
      }
      let t = 0;
      for (const at of times) {
        t = await advance(t, at);
        const file = `${skin.slice(5)}-${card}${arrival ? '-arrivee' : ''}-${Math.round(at * 100)}.png`;
        const png = await page.screenshot({ path: path.join(OUT, 'sorts', file), clip: { x: 80, y: 80, width: 700, height: 700 } });
        cells.push({ png, caption: `${NAME[skin]} · ${CARD[card]}${arrival ? ' (arrivée)' : ''} · ${at.toFixed(2)} s` });
      }
      await advance(t, 3.4, 50);
      // La fin du sort tombe 0,45 s après l'impact en temps réel (minuterie de playCast)
      await sleep(600);
      const end = await page.evaluate(() => [window.castDone, getComputedStyle(document.querySelector('.board-wrap')).getPropertyValue('--tilt').trim()]);
      assert.deepEqual(end, [true, '0deg'], `${card} ${skin} : sort non terminé ou échiquier resté incliné`);
    }
    await montage('sorts.png', 'Les vrais sorts au banc (test/vfx.html), image par image', cells, 4, 330);
    console.log(`sorts : ${CASTS.length} sorts joués jusqu'au bout, ${cells.length} captures`);
    await page.close();
  }

  // -------------------------------------------------------------------------------------------
  if (ONLY.includes('finale')) {
    mkdirSync(path.join(OUT, 'finale'), { recursive: true });
    const page = await browser.newPage({ viewport: { width: 700, height: 800 }, deviceScaleFactor: 2 });
    watch(page, 'finale');
    const step = ms => page.evaluate(ms => window.__step(ms), ms);
    const cells = [];
    // [skin du vainqueur, roi blanc, roi noir, orientation]
    const RUNS = [
      ['skin:laurier', 'king:laure', 'king:braise', 'w'],
      ['skin:ecarlate', 'king:rubis', 'king:eclipse', 'w'],
      ['skin:inferno', 'king:braise', 'king:laure', 'w'],
      ['skin:ecarlate', 'king:rubis', 'king:eclipse', 'b'],
    ];
    results.finale = {};
    for (const [skin, kw, kb, o] of RUNS) {
      const label = `${skin.slice(5)}${o === 'b' ? '-noirs' : ''}`;
      await page.goto(`${BASE}/__sorts/finale?skin=${skin}&kw=${kw}&kb=${kb}&o=${o}`);
      await ready(page);
      await sleep(200);
      for (let i = 0; i < 3; i++) await step(16);
      const framesBefore = await page.evaluate(() => window.__frames);
      assert.equal(await page.evaluate(() => window.go()), true, `${skin} : playFinale n'a rien joué`);
      // Cadre de 4 × 3 cases autour du roi maté (e8)
      const sq = await page.evaluate(() => {
        const r = document.querySelector('.sq[data-sq="60"]').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: r.width };
      });
      const clip = { x: sq.x - 2 * sq.s, y: sq.y - 1.5 * sq.s, width: 4 * sq.s, height: 3 * sq.s };
      let t = 0;
      for (const at of [0.2, 0.45, 0.65, 0.85, 1.05, 1.2]) {
        while (t < at - 1e-6) {
          await step(16);
          t += 0.016;
        }
        await page.evaluate(ms => window.seek(ms), t * 1000);
        const png = await page.screenshot({ path: path.join(OUT, 'finale', `${label}-${Math.round(at * 100)}.png`), clip });
        cells.push({ png, caption: `${NAME[skin]}${o === 'b' ? ' (vu des noirs)' : ''} · ${at.toFixed(2)} s` });
      }
      // Fin du coup de grâce (1,25 s) : quelques images de plus, puis plus rien
      while (t < 1.25 + 0.1) {
        await step(16);
        t += 0.016;
      }
      const after = await page.evaluate(() => ({ pending: window.__pending(), frames: window.__frames, shown: window.canvasShown() }));
      await step(16);
      await step(500);
      const later = await page.evaluate(() => window.__frames);
      results.finale[label] = { images: after.frames - framesBefore, imagesApres: later - after.frames, demandees: after.pending, calqueVisible: after.shown };
      assert.equal(after.pending, 0, `${label} : la scène demande encore des images après le coup de grâce`);
      assert.equal(later, after.frames, `${label} : des images après le coup de grâce`);
      assert.equal(after.shown, false, `${label} : calque WebGL encore affiché après le coup de grâce`);
    }
    // Mouvement réduit : rien n'est joué
    const reduced = await browser.newPage({ viewport: { width: 700, height: 700 }, reducedMotion: 'reduce' });
    watch(reduced, 'finale réduite');
    await reduced.goto(`${BASE}/__sorts/finale?skin=skin:ecarlate`);
    await ready(reduced);
    assert.equal(await reduced.evaluate(() => window.go()), false, 'mouvement réduit : playFinale ne doit rien jouer');
    await reduced.close();
    await montage('finale.png', 'Coup de grâce (playFinale) pendant la chute du roi maté (mat du berger, roi noir en e8), sans rien sur sa case', cells, 6, 230);
    console.log('finale :', JSON.stringify(results.finale));
    await page.close();
  }

  // -------------------------------------------------------------------------------------------
  if (ONLY.includes('vitrine')) {
    assert.ok(SITE, 'vitrine : --site=<adresse du site construit> manquant');
    mkdirSync(path.join(OUT, 'vitrine'), { recursive: true });
    const cells = [];
    for (const [label, opts] of [
      ['bureau', { viewport: { width: 1440, height: 900 } }],
      ['telephone', { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ]) {
      for (const skin of ['skin:laurier', 'skin:ecarlate']) {
        const ctx = await browser.newContext(opts);
        const page = await ctx.newPage();
        watch(page, `vitrine ${label} ${skin}`);
        await page.goto(`${SITE}/boutique?objet=${skin}`, { waitUntil: 'networkidle' });
        const stage = page.locator('.bz-stage').first();
        await stage.scrollIntoViewIfNeeded();
        // Attend un sort en cours (le bouton de lecture relance la démonstration si elle est en pause)
        const t0 = Date.now();
        let caption = '';
        while (Date.now() - t0 < 20000) {
          caption = ((await page.locator('.bz-caption').first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
          if (/Sort en cours/.test(caption) && caption.includes(NAME[skin])) break;
          const play = page.locator('.bz-cap-play');
          if (await play.count()) await play.first().click().catch(() => {});
          await sleep(100);
        }
        assert.match(caption, /Sort en cours/, `vitrine ${label} ${skin} : aucun sort joué (${caption})`);
        let last = 0;
        for (const at of [400, 1000]) {
          await sleep(at - last);
          last = at;
          const file = path.join(OUT, 'vitrine', `${label}-${skin.slice(5)}-${at}.png`);
          const png = label === 'bureau' ? await stage.screenshot({ path: file }) : await page.screenshot({ path: file });
          cells.push({ png, caption: `${NAME[skin]} · ${label} · ${at} ms` });
        }
        await ctx.close();
      }
    }
    await montage('vitrine.png', 'Les vrais sorts dans la vitrine de la boutique', cells, 4, 330);
    console.log(`vitrine : ${cells.length} captures`);
  }

  // -------------------------------------------------------------------------------------------
  if (ONLY.includes('banc')) {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    watch(page, 'banc');
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(`${BASE}/__sorts/banc`);
    await ready(page);
    results.dessin = await page.evaluate(() => window.bench());
    console.log('dessin des textures (ms, processeur ÷4) :', JSON.stringify(results.dessin));
    // Premier sort d'un skin dans une page neuve (textures dessinées pendant le sort), en temps réel
    results.premierSort = {};
    for (const skin of ['skin:inferno', 'skin:ecarlate', 'skin:inferno', 'skin:ecarlate']) {
      const p = await ctx.newPage();
      watch(p, 'banc ' + skin);
      const c = await ctx.newCDPSession(p);
      await c.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await p.goto(`${BASE}/test/vfx.html?live`);
      await ready(p);
      await sleep(1500);
      const r = await p.evaluate(async s => {
        const gaps = [];
        let long = 0;
        const obs = new PerformanceObserver(l => l.getEntries().forEach(e => (long += e.duration)));
        obs.observe({ type: 'longtask', buffered: false });
        let last = performance.now();
        let run = true;
        const loop = now => {
          gaps.push(now - last);
          last = now;
          if (run) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
        window.cast('hourglass', [], s);
        await new Promise(res => setTimeout(res, 2600));
        run = false;
        obs.disconnect();
        gaps.sort((a, b) => b - a);
        return { pireImage: Math.round(gaps[0]), images: gaps.length, imagesSup50: gaps.filter(g => g > 50).length, tachesLongues: Math.round(long) };
      }, skin);
      (results.premierSort[skin] ??= []).push(r);
      await p.close();
    }
    console.log('premier sort (téléphone simulé) :', JSON.stringify(results.premierSort));
    await ctx.close();
  }
} finally {
  writeFileSync(path.join(OUT, 'banc.json'), JSON.stringify(results, null, 2));
  await browser.close();
  await server.close();
}
if (errors.length) {
  console.log('Erreurs de la console :\n' + errors.slice(0, 30).join('\n'));
  process.exitCode = 1;
} else console.log('aucune erreur de console ; sorties dans', OUT);

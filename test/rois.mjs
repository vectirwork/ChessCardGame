// Planche des rois, avec le vrai échiquier du site (composant Board et board.css) : node test/rois.mjs [dossier]
//
// Produit, à relire à l'œil (rien n'est vérifié automatiquement ici : le gabarit, les luminances et le poids le sont
// dans test/kings.test.ts) :
// - rois-36px-dpr1.png et rois-36px-dpr3.png : les 8 rois à 36 px, blancs et noirs, sur case claire et sombre des 10
//   échiquiers, à côté de la dame et du fou Arcane (une fenêtre de 4 × 2 cases d'un vrai Board par roi et échiquier) ;
// - rois-300px.png : les 8 rois à 300 px, blancs sur case claire, noirs sur case sombre (Nuit arcane) ;
// - rois-mat.png : la chute du mat de chaque roi, blancs et noirs, vers la droite et vers la gauche, à l'impact
//   (0,84 s) puis couché (fin de la chute) : le roi ne sort jamais de sa case et reste couché dedans.
//
// Le code du site est assemblé à la volée par esbuild (aucune construction préalable) ; Chromium par Playwright
// (SwiftShader). Durée : une quinzaine de secondes. Dossier de sortie par défaut : <tmp>/spellmate-rois.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), 'spellmate-rois'));
mkdirSync(OUT, { recursive: true });

// Banc (TSX) : rendu par le vrai Board, selon window.PLANCHE
const BANC = `
import { createRoot } from 'react-dom/client';
import type { CSSProperties, ReactNode } from 'react';
import { Board } from './src/client/components/Board';
import { pieceUrl } from './src/client/components/pieces';
import { ITEMS, boardStyle } from './src/shared/catalog';
import { createGameFromFen } from './src/shared/game';
import './src/client/styles/global.css';
import './src/client/styles/board.css';

const KINGS = ITEMS.filter(i => i.kind === 'king');
const BOARDS = ITEMS.filter(i => i.kind === 'board');
const pos = (fen: string) => createGameFromFen(fen, { w: [], b: [] }, false, 'aucune').pos;
const sq = (s: string) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);

/** Fenêtre de cols × rows cases (de taille px) sur un vrai Board de 8 × 8, à partir de la colonne x et de la rangée
 *  d'écran y (0 en haut). */
function Window({ px, x, y, cols, rows, children }: { px: number; x: number; y: number; cols: number; rows: number; children: ReactNode }) {
  return (
    <div style={{ width: cols * px, height: rows * px, overflow: 'hidden', position: 'relative', flex: 'none' }}>
      <div style={{ position: 'absolute', width: 8 * px, height: 8 * px, left: -x * px, top: -y * px }}>{children}</div>
    </div>
  );
}
const cell: CSSProperties = { font: '600 11px system-ui', letterSpacing: '.06em', color: '#cfc8ea', alignSelf: 'center' };

function Lineup() {
  // Rangée 1 : roi blanc sur a1 (sombre) et b1 (claire), dame et fou blancs ; rangée 2 : roi noir sur a2 (claire) et
  // b2 (sombre), dame et fou noirs. Les deux rois d'un camp portent le même skin (kingW, kingB).
  const p = pos('8/8/8/8/8/8/kkqb4/KKQB4 w - - 0 1');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: \`120px repeat(\${KINGS.length}, auto)\`, gap: '6px 10px', padding: 12 }}>
      <span />
      {KINGS.map(k => <span key={k.id} style={cell}>{k.name}</span>)}
      {BOARDS.map(b => (
        <>
          <span key={b.id} style={cell}>{b.name}</span>
          {KINGS.map(k => (
            <Window key={b.id + k.id} px={36} x={0} y={6} cols={4} rows={2}>
              <Board pos={p} orientation="w" theme={b.id} coords={false} locked kingW={k.id} kingB={k.id} />
            </Window>
          ))}
        </>
      ))}
    </div>
  );
}

function Grand() {
  const a = boardStyle('board:arcane');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 300px)', gap: 10, padding: 12 }}>
      {(['w', 'b'] as const).flatMap(c =>
        KINGS.map(k => (
          <div key={c + k.id} style={{ width: 300, height: 300, background: c === 'w' ? a.light : a.dark, position: 'relative' }}>
            <div className="pi" style={{ position: 'absolute', inset: 0, backgroundImage: pieceUrl(c, 'k', k.id) }} />
            <span style={{ ...cell, position: 'absolute', left: 8, top: 6, color: c === 'w' ? '#3a2e5c' : '#e6e0ff' }}>{k.name}</span>
          </div>
        )),
      )}
    </div>
  );
}

function Mat() {
  // Roi maté en e1 (blancs) ou e8 (noirs) ; la dame adverse vient de jouer à côté : en d (chute vers la droite) ou
  // en f (vers la gauche). Fenêtre de 3 × 3 cases de 56 px autour du roi.
  const cases = [
    { c: 'w', side: 'droite', fen: '8/8/8/8/8/8/3q4/4K3 w - - 0 1', king: 'e1', by: 'd2', y: 5 },
    { c: 'w', side: 'gauche', fen: '8/8/8/8/8/8/5q2/4K3 w - - 0 1', king: 'e1', by: 'f2', y: 5 },
    { c: 'b', side: 'droite', fen: '4k3/3Q4/8/8/8/8/8/8 b - - 0 1', king: 'e8', by: 'd7', y: 0 },
    { c: 'b', side: 'gauche', fen: '4k3/5Q2/8/8/8/8/8/8 b - - 0 1', king: 'e8', by: 'f7', y: 0 },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: \`120px repeat(\${cases.length}, auto)\`, gap: '8px 14px', padding: 12 }}>
      <span />
      {cases.map(m => <span key={m.c + m.side} style={cell}>{m.c === 'w' ? 'Blancs' : 'Noirs'}, vers la {m.side}</span>)}
      {KINGS.map(k => (
        <>
          <span key={k.id} style={cell}>{k.name}</span>
          {cases.map(m => (
            <Window key={k.id + m.c + m.side} px={56} x={3} y={m.y} cols={3} rows={3}>
              <Board pos={pos(m.fen)} orientation="w" theme="board:arcane" coords={false} locked mated={sq(m.king)} lastMove={{ from: sq(m.by), to: sq(m.by) }} kingW={k.id} kingB={k.id} />
            </Window>
          ))}
        </>
      ))}
    </div>
  );
}

const PAGES: Record<string, () => JSX.Element> = { lineup: Lineup, grand: Grand, mat: Mat };
const Page = PAGES[(window as unknown as { PLANCHE: string }).PLANCHE];
document.body.style.cssText = 'margin:0;background:#0b0a1c;width:max-content';
createRoot(document.getElementById('root')!).render(<Page />);
`;

const out = await build({
  stdin: { contents: BANC, loader: 'tsx', resolveDir: ROOT, sourcefile: 'banc-rois.tsx' },
  bundle: true,
  write: false,
  format: 'esm',
  jsx: 'automatic',
  outdir: path.join(os.tmpdir(), 'spellmate-rois-banc'),
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl', '.svg': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'error',
});
const js = out.outputFiles.find(f => f.path.endsWith('.js')).text;
const css = out.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '';
const html = planche => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${css}</style>
<script>window.PLANCHE = ${JSON.stringify(planche)}</script></head><body><div id="root"></div>
<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script></body></html>`;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
async function shoot(planche, file, dpr, prepare) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: dpr });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.setContent(html(planche), { waitUntil: 'load' });
  await page.waitForSelector('#root > *', { timeout: 8000 }).catch(() => {
    throw new Error(`${file} : planche vide (${errors.join(' ; ') || 'aucune erreur'})`);
  });
  if (prepare) await prepare(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  if (errors.length) throw new Error(`${file} : ${errors.join(' ; ')}`);
  await page.close();
  console.log(path.join(OUT, file));
}

await shoot('lineup', 'rois-36px-dpr1.png', 1);
await shoot('lineup', 'rois-36px-dpr3.png', 3);
await shoot('grand', 'rois-300px.png', 1);
// Chute du mat : à l'impact (0,84 s, la tête au plus loin), puis couché (fin de la chute)
await shoot('mat', 'rois-mat-impact.png', 2, page =>
  page.evaluate(() => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = 840;
    }
  }),
);
await shoot('mat', 'rois-mat.png', 2, page => page.waitForTimeout(1700));
await browser.close();

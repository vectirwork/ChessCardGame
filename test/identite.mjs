// Banc d'identité visuelle (lot 0a) : captures, boîtes des éléments clés (getBoundingClientRect) et textes, pour
// prouver qu'au réglage par défaut l'image ne change pas. Références hors git : /home/user/spellmate-ref/captures.
//
//   npm run build && node test/identite.mjs            écrit les références (dossier ci-dessus, ou --sortie)
//   node test/identite.mjs --comparer                  relève tout dans un dossier temporaire et compare aux références :
//                                                      écarts listés, code 1 s'il y en a
//   node test/identite.mjs [BASE] [--sortie=<dossier>] [--comparer[=<réf>]] [--seulement=bancs,pages,accueil,partie]
//                          [--n=1,2,4,5,6]
//
// Quatre parties :
// - bancs (sans serveur) : test/coque.tsx assemblé par esbuild à la volée (comme test/rois.mjs), les vrais composants
//   rendus avec des vues figées : GameShell (partie, carte ouverte, salle d'attente), CardDraft (choix, choix partiel,
//   choix validé, mains révélées), mini-main de l'accueil ; en 1280 × 720, 1440 × 900, 375 × 667 et 360 × 640, N = 3.
//   --n=… ajoute d'autres nombres de cartes (revue des lots suivants). Comparaison : pixels, tolérance 0 ;
// - pages : /regles, /jouer, /apprendre, /problemes, /cartes, /boutique, /compte (invité), /mentions-legales, en
//   1280 × 720 et 375 × 667 (page entière) ; comparaison : boîtes et textes ;
// - accueil : 8 hauteurs de défilement, mêmes écrans ; comparaison : boîtes (celles de l'écran, sans l'échiquier-astre
//   que le moteur anime) et textes ;
// - partie : les quatre moments de test/textes-pages.mjs (attente, choix, en cours, fin) ; boîtes et textes.
// Les captures des pages, de l'accueil et de la partie se relisent à l'œil (animations figées à 4 s, canevas WebGL
// masqués) ; seules celles des bancs sont comparées au pixel.
// Sans BASE (ni SPELLMATE_BASE), pages, accueil et partie tournent sous scripts/serveur-jetable.mjs (npm run build
// avant). Stabilisation : celle de test/textes-pages.mjs (hasard figé, jour figé pour les pages, décomptes masqués).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { ECRANS, lancerChromium } from './lib/playwright.mjs';
import { sleep } from './lib/client.mjs';
import {
  ECRANS_TEXTES, JOUR, PAGES, comparerTextes, defile, lireOptions, lireTexte, optionsContexte, ouvrir,
  relancerSousServeurJetable, scenarioPartie, scriptInit,
} from './textes-pages.mjs';

const TEST = path.dirname(fileURLToPath(import.meta.url));
const REF = '/home/user/spellmate-ref/captures';

/** Écrans du banc de la coque (test/coque.tsx) et tailles. */
export const ECRANS_COQUE = ['partie', 'carte', 'attente', 'choix', 'choix-partiel', 'choix-valide', 'revelation', 'mini'];
export const TAILLES_COQUE = ['1280x720', '1440x900', '375x667', '360x640'];
/** Hauteurs de défilement de l'accueil (bornées par la hauteur de la page). */
const HAUTEURS_ACCUEIL = [0, 1200, 2300, 4300, 6800, 9200, 'bas-500', 'bas'];
/** Heure figée du banc (Date.now constant : compte à rebours du choix immobile). */
const HEURE_BANC = Date.UTC(2026, 10, 11, 12, 0, 0);

/** Éléments dont on relève la boîte (au plus 40 par sélecteur). */
const SELECTEURS = [
  'header', 'nav', 'main', 'footer', 'h1', 'h2', 'h3', 'button', 'a[href]', 'img', 'input',
  '.board', '.gs-fan-card', '.gs-fan-slot', '.gs-opp-fan', '.spell-card', '.gs-status', '.gs-top',
  '.cd-tile', '.cd-slot', '.cd-validate', '.cd-reveal', '.gp-waiting', '.o-hand-mini', '.o-hand-row',
];

// ---------------------------------------------------------------------------------------------
// Relevés

/** Fige les animations (à 4 s) et masque les canevas, pour une capture stable. */
async function figer(page) {
  await page.addStyleTag({ content: 'canvas, .o-falling-star { visibility: hidden !important } * { caret-color: transparent !important }' }).catch(() => undefined);
  await page.evaluate(() => document.getAnimations().forEach(a => {
    try {
      a.pause();
      a.currentTime = 4000;
    } catch {
      // animation sans durée
    }
  })).catch(() => undefined);
  await sleep(250);
}
async function relancer(page) {
  await page.evaluate(() => document.getAnimations().forEach(a => {
    try {
      a.play();
    } catch {
      // ignoré
    }
  })).catch(() => undefined);
}

/**
 * Boîtes des éléments clés, arrondies au dixième de pixel. `visibles` : seulement celles qui croisent l'écran ;
 * `horsDe` : sans les éléments contenus dans ce sélecteur.
 */
async function boites(page, { visibles = false, horsDe = null } = {}) {
  return page.evaluate(([selecteurs, visibles, horsDe]) => {
    const r1 = x => Math.round(x * 10) / 10;
    const out = [];
    for (const s of selecteurs) {
      const els = [...document.querySelectorAll(s)].filter(el => !horsDe || !el.closest(horsDe)).slice(0, 40);
      els.forEach((el, i) => {
        const b = el.getBoundingClientRect();
        if (visibles && (b.bottom <= 0 || b.top >= innerHeight || b.right <= 0 || b.left >= innerWidth)) return;
        const t = (el.innerText ?? el.getAttribute('alt') ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
        out.push({ s, i, x: r1(b.x), y: r1(b.y), w: r1(b.width), h: r1(b.height), t });
      });
    }
    return out;
  }, [SELECTEURS, visibles, horsDe]);
}

/** Capture, boîtes et texte d'un écran : <dossier>/<nom>.png, .json, .txt. */
async function relever(page, dossier, nom, { pleine = false, contexte = {}, filtre = {} } = {}) {
  mkdirSync(dossier, { recursive: true });
  await figer(page);
  await page.screenshot({ path: path.join(dossier, `${nom}.png`), fullPage: pleine });
  writeFileSync(path.join(dossier, `${nom}.json`), `${JSON.stringify(await boites(page, filtre))}\n`);
  writeFileSync(path.join(dossier, `${nom}.txt`), await lireTexte(page, contexte));
  await relancer(page);
}

// ---------------------------------------------------------------------------------------------
// Bancs de la coque

async function htmlCoque() {
  const out = await build({
    entryPoints: [path.join(TEST, 'coque.tsx')],
    bundle: true,
    write: false,
    format: 'esm',
    jsx: 'automatic',
    outdir: path.join(os.tmpdir(), 'spellmate-coque-banc'),
    loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl', '.svg': 'dataurl', '.jpg': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'error',
  });
  const js = out.outputFiles.find(f => f.path.endsWith('.js')).text;
  const css = out.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '';
  const gabarit = readFileSync(path.join(TEST, 'coque.html'), 'utf8');
  return conf => gabarit
    .replace('</head>', `<style>${css}</style>\n<script>window.__COQUE = ${JSON.stringify(conf)};</script>\n</head>`)
    .replace(/<script type="module" src="\.\/coque\.tsx"><\/script>/, () => `<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>`);
}

/** Heure figée dans le banc : Date.now et new Date() constants. */
const HEURE_FIGEE = `(() => {
  const VraieDate = Date;
  class DateFigee extends VraieDate {
    constructor(...a) { if (a.length) super(...a); else super(${HEURE_BANC}); }
    static now() { return ${HEURE_BANC}; }
  }
  globalThis.Date = DateFigee;
})();`;

async function bancs(browser, sortie, ns, erreurs) {
  const html = await htmlCoque();
  const dossier = path.join(sortie, 'coque');
  for (const n of ns) {
    for (const taille of TAILLES_COQUE) {
      const ctx = await browser.newContext({ ...ECRANS[taille], locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: 'no-preference' });
      await ctx.addInitScript(HEURE_FIGEE);
      for (const ecran of ECRANS_COQUE) {
        const page = await ctx.newPage();
        page.on('pageerror', e => erreurs.push(`coque ${ecran} n${n} ${taille} : ${e.message}`));
        page.on('console', m => m.type() === 'error' && erreurs.push(`coque ${ecran} n${n} ${taille} : ${m.text()}`));
        await page.setContent(html({ ecran, n }), { waitUntil: 'load' });
        await page.waitForSelector('#root > *', { timeout: 10000 });
        await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
        // Arrivée des cartes (gsap, 1,2 s), mains révélées (montées après 50 ms) : tout est au repos à 2,5 s.
        await sleep(2500);
        await relever(page, dossier, `${ecran}-n${n}-${taille}`);
        await page.close();
      }
      await ctx.close();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Pages, accueil, partie (serveur)

async function pages(browser, base, sortie, erreurs) {
  for (const ecran of ECRANS_TEXTES) {
    const ctx = await browser.newContext(optionsContexte(ecran));
    await ctx.addInitScript(scriptInit({ jour: JOUR }));
    const page = await ctx.newPage();
    page.on('pageerror', e => erreurs.push(`${ecran} ${page.url()} : ${e.message}`));
    for (const [nom, chemin] of PAGES.filter(([, c]) => defile(c))) {
      await ouvrir(page, base + chemin);
      await relever(page, path.join(sortie, 'pages'), `${nom}-${ecran}`, { pleine: true, contexte: { base } });
    }
    await ctx.close();
  }
}

async function accueil(browser, base, sortie, erreurs) {
  for (const ecran of ECRANS_TEXTES) {
    const ctx = await browser.newContext(optionsContexte(ecran));
    await ctx.addInitScript(scriptInit({ jour: JOUR }));
    const page = await ctx.newPage();
    page.on('pageerror', e => erreurs.push(`accueil ${ecran} : ${e.message}`));
    await ouvrir(page, base + '/', { defiler: false });
    if (!ECRANS[ecran].isMobile) await page.mouse.move(640, 360);
    const H = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    let i = 0;
    for (const h of HAUTEURS_ACCUEIL) {
      const y = Math.max(0, Math.min(H, h === 'bas' ? H : h === 'bas-500' ? H - 500 : h));
      await page.evaluate(async y => {
        const y0 = scrollY;
        for (let k = 1; k <= 12; k++) {
          scrollTo(0, y0 + ((y - y0) * k) / 12);
          await new Promise(r => requestAnimationFrame(r));
        }
      }, y);
      await sleep(1500);
      // Boîtes : seulement celles de l'écran (les chapitres déjà passés changent de hauteur selon le moment où le
      // défilement les a quittés), sans l'échiquier-astre, que le moteur déplace encore pendant le relevé.
      await relever(page, path.join(sortie, 'accueil'), `${ecran}-${String(i++).padStart(2, '0')}`, {
        contexte: { base }, filtre: { visibles: true, horsDe: '.board' },
      });
    }
    await ctx.close();
  }
}

async function partie(browser, base, sortie, erreurs) {
  for (const ecran of ECRANS_TEXTES) {
    await scenarioPartie(browser, base, ecran, async (moment, page, contexte) => {
      await relever(page, path.join(sortie, 'partie'), `${moment}-${ecran}`, { contexte });
    }, erreurs);
  }
}

// ---------------------------------------------------------------------------------------------
// Comparaison

const lister = d => (existsSync(d) ? readdirSync(d) : []);

/** Écart entre deux images (navigateur, canevas) : pixels différents et écart maximal. */
async function ecartImage(page, a, b) {
  const url = f => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
  return page.evaluate(async ([da, db]) => {
    const charger = src => new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
    const [ia, ib] = await Promise.all([charger(da), charger(db)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { taille: `${ia.width}×${ia.height} contre ${ib.width}×${ib.height}` };
    const c = document.createElement('canvas');
    c.width = ia.width;
    c.height = ia.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(ia, 0, 0);
    const pa = x.getImageData(0, 0, c.width, c.height).data;
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(ib, 0, 0);
    const pb = x.getImageData(0, 0, c.width, c.height).data;
    let pixels = 0;
    let max = 0;
    for (let k = 0; k < pa.length; k += 4) {
      const d = Math.max(Math.abs(pa[k] - pb[k]), Math.abs(pa[k + 1] - pb[k + 1]), Math.abs(pa[k + 2] - pb[k + 2]), Math.abs(pa[k + 3] - pb[k + 3]));
      if (d) {
        pixels++;
        max = Math.max(max, d);
      }
    }
    return { pixels, max };
  }, [url(a), url(b)]);
}

/** Boîtes : mêmes éléments, positions et tailles à 0,5 px près. */
function ecartBoites(fa, fb) {
  const a = JSON.parse(readFileSync(fa, 'utf8'));
  const b = JSON.parse(readFileSync(fb, 'utf8'));
  const cle = x => `${x.s}#${x.i}`;
  const mb = new Map(b.map(x => [cle(x), x]));
  const out = [];
  for (const x of a) {
    const y = mb.get(cle(x));
    if (!y) out.push(`${cle(x)} « ${x.t} » absent`);
    else if (['x', 'y', 'w', 'h'].some(k => Math.abs(x[k] - y[k]) > 0.5) || x.t !== y.t) {
      out.push(`${cle(x)} « ${x.t} » : ${x.x},${x.y} ${x.w}×${x.h} → ${y.x},${y.y} ${y.w}×${y.h}${x.t !== y.t ? ` « ${y.t} »` : ''}`);
    }
    mb.delete(cle(x));
  }
  for (const k of mb.keys()) out.push(`${k} en plus`);
  return out;
}

async function comparer(browser, ref, sortie, parties) {
  const ecarts = [];
  const page = await browser.newPage();
  for (const sous of ['coque', 'pages', 'accueil', 'partie']) {
    const dossier = path.join(sortie, sous);
    if (!existsSync(dossier)) continue;
    const dref = path.join(ref, sous);
    for (const n of lister(dossier).sort()) {
      const a = path.join(dref, n);
      const b = path.join(dossier, n);
      if (!existsSync(a)) {
        if (!n.endsWith('.txt') && !(sous === 'coque' && !/-n3-/.test(n))) ecarts.push(`${sous}/${n} : absent de la référence`);
        continue;
      }
      if (n.endsWith('.png') && sous === 'coque') {
        if (Buffer.compare(readFileSync(a), readFileSync(b)) === 0) continue;
        const e = await ecartImage(page, a, b);
        if (e.taille || e.pixels) ecarts.push(`${sous}/${n} : ${e.taille ?? `${e.pixels} pixel(s) différent(s), écart maximal ${e.max}`}`);
      } else if (n.endsWith('.json')) {
        const e = ecartBoites(a, b);
        if (e.length) ecarts.push(`${sous}/${n} : ${e.length} boîte(s) différente(s)\n      ${e.slice(0, 8).join('\n      ')}`);
      }
    }
    for (const e of comparerTextes(dref, dossier, { seulementReleves: true })) ecarts.push(`${sous}/${e}`);
    // Relevés de la référence que cette exécution n'a pas refaits (partie non demandée : ignorés)
    if (parties.includes(sous === 'coque' ? 'bancs' : sous)) {
      for (const n of lister(dref)) {
        if (!existsSync(path.join(dossier, n)) && (sous !== 'coque' || /-n3-/.test(n))) ecarts.push(`${sous}/${n} : pas relevé`);
      }
    }
  }
  await page.close();
  return ecarts;
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const o = lireOptions(argv, { ref: REF, prefixe: 'spellmate-identite-', tout: 'bancs,pages,accueil,partie' });
  const avecServeur = o.seulement.some(p => ['pages', 'accueil', 'partie'].includes(p));
  if (avecServeur && !o.base) relancerSousServeurJetable(fileURLToPath(import.meta.url), argv);
  const ns = [...new Set([3, ...(o.val('n') ?? '').split(',').filter(Boolean).map(Number)])];
  mkdirSync(o.sortie, { recursive: true });
  const erreurs = [];
  const browser = await lancerChromium();
  let ecarts = [];
  try {
    if (o.seulement.includes('bancs')) await bancs(browser, o.sortie, ns, erreurs);
    if (o.seulement.includes('pages')) await pages(browser, o.base, o.sortie, erreurs);
    if (o.seulement.includes('accueil')) await accueil(browser, o.base, o.sortie, erreurs);
    if (o.seulement.includes('partie')) await partie(browser, o.base, o.sortie, erreurs);
    if (o.comparer) ecarts = await comparer(browser, o.ref, o.sortie, o.seulement);
  } finally {
    await browser.close();
  }
  if (erreurs.length) {
    console.error(`Erreurs de page (${erreurs.length}) :\n  ${erreurs.slice(0, 12).join('\n  ')}`);
    process.exitCode = 1;
  }
  console.log(`Relevés dans ${o.sortie}`);
  if (!o.comparer) return;
  if (!ecarts.length) {
    console.log(`Identique à la référence (${o.ref}).`);
    return;
  }
  console.log(`${ecarts.length} écart(s) avec la référence (${o.ref}) :`);
  for (const e of ecarts) console.log(`  ${e}`);
  process.exitCode = 1;
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

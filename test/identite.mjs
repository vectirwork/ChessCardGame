// Banc d'identité visuelle (lot 0a) : captures, boîtes des éléments clés (getBoundingClientRect), structure du DOM des
// mains et textes, pour prouver qu'au réglage par défaut l'image ne change pas. Références hors git :
// /home/user/spellmate-ref/captures.
//
//   npm run build && npm run identite                 relève tout dans un dossier temporaire et compare aux références :
//                                                     écarts listés, code 1 s'il y en a (rien n'est écrit dans la référence)
//   node test/identite.mjs [BASE] [--comparer=<réf>] [--sortie=<dossier>] [--seulement=bancs,pages,accueil,main,partie]
//                          [--n=1,2,4,5,6] [--racine=<dossier contenant dist>] [--port=<n>] [--construire] [--hors-defaut]
//   node test/identite.mjs --ecrire [--ecraser] [--sortie=<dossier>] [--racine=…]     écrit des références
//   node test/identite.mjs --existantes=<dossier> [--comparer=<réf>]                 compare les captures existantes
//
// Sans option, le script COMPARE. Il n'écrit dans la référence qu'avec --ecrire, et refuse si un dossier visé
// (coque, pages, accueil, main, partie) n'est pas vide, sauf --ecraser : les références se prennent sur le code d'avant
// la polymorphie (site construit de /home/user/spellmate-ref : --racine=/home/user/spellmate-ref), et sur décision.
// Contrôles préalables (test/textes-pages.mjs, controlesPrealables) : en-tête avec le commit et l'état de la copie, site
// construit à jour (sinon refus, ou --construire), serveur au défaut (ni SPELLMATE_TEST_RULES, ni FEATURE_*, ni
// APP_NAME, ni LEGAL_*, ni .env ; --hors-defaut passe outre, comparaison marquée « hors défaut », --ecrire refusé).
//
// Cinq parties :
// - bancs (sans serveur) : test/coque.tsx assemblé par esbuild à la volée (comme test/rois.mjs), les vrais composants
//   rendus avec des vues figées : GameShell (partie, carte ouverte, salle d'attente), CardDraft (choix, choix partiel,
//   choix validé, mains révélées), et une copie de la mini-main de l'accueil (la vraie est relevée par « main ») ;
//   en 1280 × 720, 1440 × 900, 375 × 667 et 360 × 640, N = 3. --n=… ajoute d'autres nombres de cartes (images pour la
//   revue des lots suivants, jamais comparées). Comparaison (N = 3) : pixels, tolérance 0 ; boîtes ; DOM ; textes ;
// - pages : /regles, /jouer, /apprendre, /problemes, /cartes, /boutique, /compte (invité), /mentions-legales, en
//   1280 × 720 et 375 × 667 (page entière) ; comparaison : boîtes et textes ;
// - accueil : 8 hauteurs de défilement, mêmes écrans ; comparaison : boîtes (celles de l'écran, sans l'échiquier-astre
//   que le moteur anime) et textes ;
// - main : la vraie mini-main de l'accueil (OdysseeHome), amenée au milieu de l'écran sur les deux écrans : images de
//   .o-hand-row et de .o-hand-opp (pixels, tolérance 0) et leur DOM ;
// - partie : les quatre moments de test/textes-pages.mjs (attente, choix, en cours, fin) ; boîtes, DOM et textes.
// Les captures entières des pages, de l'accueil et de la partie se relisent à l'œil (animations figées à 4 s, canevas
// WebGL masqués) ; celles des bancs et de la vraie mini-main sont comparées au pixel.
//
// Boîtes (<nom>.json) : { n: nombre d'éléments par sélecteur, b: [{ s, i, x, y, w, h, t }] }, tous les éléments
// (seulement ceux de l'écran pour l'accueil). DOM (<nom>.dom.txt) : la structure normalisée de .o-hand-row, .o-hand-opp,
// .gs-fan, .gs-opp-fan et .cd (balises, attributs triés, style en ligne gardé, identifiants de React masqués, textes),
// comparée au caractère : elle fait respecter « pour N = 3, aucun attribut, variable CSS, classe ou nœud nouveau ».
//
// Captures existantes (--existantes=<dossier>) : <dossier> contient rois/, echiquiers/, sorts/ et boutique/ produits par
// les scripts existants (commandes : /home/user/spellmate-ref/LISEZMOI.md), comparés à
// /home/user/spellmate-ref/captures-existantes selon test/fixtures/v1/existantes.json : images stables au pixel près
// (tolérance 0, écart = échec), images bruitées (écart mesuré entre deux passes du même code) rapportées pour une
// relecture à l'œil, signalées si l'écart dépasse le bruit mesuré.
//
// Sans BASE (ni SPELLMATE_BASE), pages, accueil, main et partie tournent sous scripts/serveur-jetable.mjs (npm run
// build avant). Stabilisation : celle de test/textes-pages.mjs (hasard figé, jour figé pour les pages, décomptes masqués).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { ECRANS, lancerChromium } from './lib/playwright.mjs';
import { sleep } from './lib/client.mjs';
import {
  ECRANS_TEXTES, JOUR, PAGES, comparerTextes, controlesPrealables, defile, lireOptions, lireTexte, optionsContexte,
  ouvrir, relancerSousServeurJetable, scenarioPartie, scriptInit,
} from './textes-pages.mjs';

const TEST = path.dirname(fileURLToPath(import.meta.url));
const REF = '/home/user/spellmate-ref/captures';
const REF_EXISTANTES = '/home/user/spellmate-ref/captures-existantes';
const CLASSEMENT_EXISTANTES = path.join(TEST, 'fixtures/v1/existantes.json');

/** Écrans du banc de la coque (test/coque.tsx) et tailles. */
export const ECRANS_COQUE = ['partie', 'carte', 'attente', 'choix', 'choix-partiel', 'choix-valide', 'revelation', 'mini'];
export const TAILLES_COQUE = ['1280x720', '1440x900', '375x667', '360x640'];
/** Parties du relevé, et sous-dossier de chacune. */
const PARTIES = { bancs: 'coque', pages: 'pages', accueil: 'accueil', main: 'main', partie: 'partie' };
const AVEC_SERVEUR = ['pages', 'accueil', 'main', 'partie'];
/** Hauteurs de défilement de l'accueil (bornées par la hauteur de la page). */
const HAUTEURS_ACCUEIL = [0, 1200, 2300, 4300, 6800, 9200, 'bas-500', 'bas'];
/** Heure figée du banc (Date.now constant : compte à rebours du choix immobile). */
const HEURE_BANC = Date.UTC(2026, 10, 11, 12, 0, 0);

/** Éléments dont on relève la boîte (tous, et leur nombre par sélecteur). */
const SELECTEURS = [
  'header', 'nav', 'main', 'footer', 'h1', 'h2', 'h3', 'button', 'a[href]', 'img', 'input',
  '.board', '.gs-fan-card', '.gs-fan-slot', '.gs-opp-fan', '.spell-card', '.gs-status', '.gs-top',
  '.cd-tile', '.cd-slot', '.cd-validate', '.cd-reveal', '.gp-waiting', '.o-hand-mini', '.o-hand-row',
];
/** Éléments dont on relève la structure (DOM normalisé) : les mains, que les lots suivants adaptent à N. */
const SELECTEURS_DOM = ['.o-hand-row', '.o-hand-opp', '.gs-fan', '.gs-opp-fan', '.cd'];

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
 * Boîtes des éléments clés, arrondies au dixième de pixel, et nombre d'éléments par sélecteur. `visibles` : seulement
 * les boîtes qui croisent l'écran (le nombre compte tout) ; `horsDe` : sans les éléments contenus dans ce sélecteur ;
 * `decomptes` : le compte à rebours du choix (.cd-digits, qui suit l'heure réelle dans la partie) devient ‹n› dans les
 * débuts de texte.
 */
async function boites(page, { visibles = false, horsDe = null, decomptes = false } = {}) {
  return page.evaluate(([selecteurs, visibles, horsDe, decomptes]) => {
    const r1 = x => Math.round(x * 10) / 10;
    const chiffres = decomptes ? [...document.querySelectorAll('.cd-digits')].map(e => e.textContent.trim()).filter(Boolean) : [];
    const sansDecompte = t => chiffres.reduce((acc, c) => acc.split(c).join('‹n›'), t);
    const n = {};
    const b = [];
    for (const s of selecteurs) {
      const els = [...document.querySelectorAll(s)].filter(el => !horsDe || !el.closest(horsDe));
      n[s] = els.length;
      els.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (visibles && (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth)) return;
        const t = sansDecompte((el.innerText ?? el.getAttribute('alt') ?? '').trim().replace(/\s+/g, ' ')).slice(0, 24);
        b.push({ s, i, x: r1(r.x), y: r1(r.y), w: r1(r.width), h: r1(r.height), t });
      });
    }
    return { n, b };
  }, [SELECTEURS, visibles, horsDe, decomptes]);
}

/**
 * Structure normalisée des éléments : une ligne par nœud (balise et attributs triés, ou texte), indentée par la
 * profondeur. Le style en ligne est gardé, sauf l'inclinaison au pointeur de SpellCard (--rx, --ry, --mx, --my : posées
 * par les événements du pointeur, pas par le rendu) ; les identifiants de React (useId) et le compte à rebours du choix
 * sont masqués ; les nœuds de texte vides et les commentaires sont omis.
 */
async function domNormalise(page, selecteurs = SELECTEURS_DOM) {
  return page.evaluate(selecteurs => {
    const masquer = (k, v) => {
      const w = v.replace(/«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, '‹id›');
      return k === 'style' ? w.replace(/--(rx|ry|mx|my)\s*:[^;]*;?\s*/g, '').trim() : w;
    };
    const lignes = [];
    const visiter = (nd, prof) => {
      const pas = '  '.repeat(prof);
      if (nd.nodeType === Node.TEXT_NODE) {
        const t = nd.textContent.replace(/\s+/g, ' ').trim();
        if (t) lignes.push(`${pas}"${nd.parentElement?.closest('.cd-digits') ? '‹n›' : t}"`);
        return;
      }
      if (nd.nodeType !== Node.ELEMENT_NODE) return;
      const attrs = [...nd.attributes]
        .map(a => [a.name, a.value])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => ` ${k}="${masquer(k, v)}"`)
        .join('');
      lignes.push(`${pas}<${nd.tagName.toLowerCase()}${attrs}>`);
      for (const c of nd.childNodes) visiter(c, prof + 1);
    };
    for (const s of selecteurs) {
      const els = document.querySelectorAll(s);
      lignes.push(`# ${s} (${els.length})`);
      els.forEach(el => visiter(el, 0));
    }
    return `${lignes.join('\n')}\n`;
  }, selecteurs);
}

/** Capture, boîtes, texte (et DOM) d'un écran : <dossier>/<nom>.png, .json, .txt (et .dom.txt). */
async function relever(page, dossier, nom, { pleine = false, contexte = {}, filtre = {}, dom = false } = {}) {
  mkdirSync(dossier, { recursive: true });
  await figer(page);
  await page.screenshot({ path: path.join(dossier, `${nom}.png`), fullPage: pleine });
  writeFileSync(path.join(dossier, `${nom}.json`), `${JSON.stringify(await boites(page, filtre))}\n`);
  if (dom) writeFileSync(path.join(dossier, `${nom}.dom.txt`), await domNormalise(page));
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
        await relever(page, dossier, `${ecran}-n${n}-${taille}`, { dom: true });
        await page.close();
      }
      await ctx.close();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Pages, accueil, mini-main, partie (serveur)

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

/**
 * La vraie mini-main de l'accueil (OdysseeHome, partie contre l'Oracle au premier coup) : amenée au milieu de l'écran,
 * animations figées ; images de .o-hand-row (main-<écran>.png) et de .o-hand-opp (adverse-<écran>.png), au pixel, et
 * DOM normalisé (<écran>.dom.txt). Le pointeur n'entre jamais dans la page (le survol de la main réveille l'IA).
 */
async function mainAccueil(browser, base, sortie, erreurs) {
  const dossier = path.join(sortie, 'main');
  mkdirSync(dossier, { recursive: true });
  for (const ecran of ECRANS_TEXTES) {
    const ctx = await browser.newContext(optionsContexte(ecran));
    await ctx.addInitScript(scriptInit({ jour: JOUR }));
    const page = await ctx.newPage();
    page.on('pageerror', e => erreurs.push(`main ${ecran} : ${e.message}`));
    await ouvrir(page, base + '/', { defiler: false });
    const trouvee = await page.evaluate(() => {
      const el = document.querySelector('.o-hand-row');
      el?.scrollIntoView({ block: 'center' });
      return !!el;
    });
    if (!trouvee) {
      erreurs.push(`main ${ecran} : .o-hand-row introuvable sur l'accueil`);
      await ctx.close();
      continue;
    }
    await sleep(1500);
    await figer(page);
    writeFileSync(path.join(dossier, `${ecran}.dom.txt`), await domNormalise(page, ['.o-hand-row', '.o-hand-opp']));
    for (const [nom, s] of [['main', '.o-hand-row'], ['adverse', '.o-hand-opp']]) {
      const el = page.locator(s).first();
      if (await el.count()) await el.screenshot({ path: path.join(dossier, `${nom}-${ecran}.png`) });
      else erreurs.push(`main ${ecran} : ${s} introuvable`);
    }
    await ctx.close();
  }
}

async function partie(browser, base, sortie, erreurs) {
  for (const ecran of ECRANS_TEXTES) {
    await scenarioPartie(browser, base, ecran, async (moment, page, contexte) => {
      await relever(page, path.join(sortie, 'partie'), `${moment}-${ecran}`, { contexte, dom: true, filtre: { decomptes: true } });
    }, erreurs);
  }
}

// ---------------------------------------------------------------------------------------------
// Comparaison

const lister = d => (existsSync(d) ? readdirSync(d) : []);

/**
 * Écart entre deux images (navigateur, canevas) : pixels différents, pixels dont un canal diffère de plus de 16
 * (`forts`) et écart maximal sur un canal.
 */
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
    let forts = 0;
    let max = 0;
    for (let k = 0; k < pa.length; k += 4) {
      const d = Math.max(Math.abs(pa[k] - pb[k]), Math.abs(pa[k + 1] - pb[k + 1]), Math.abs(pa[k + 2] - pb[k + 2]), Math.abs(pa[k + 3] - pb[k + 3]));
      if (d) {
        pixels++;
        if (d > 16) forts++;
        max = Math.max(max, d);
      }
    }
    return { pixels, forts, max };
  }, [url(a), url(b)]);
}

/** Boîtes d'un relevé : { n, b } (l'ancien format, un tableau de boîtes, est lu sans les nombres). */
function lireBoites(f) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  return Array.isArray(j) ? { n: null, b: j } : j;
}

/**
 * Boîtes : mêmes nombres d'éléments, mêmes éléments, positions et tailles à 0,5 px près, mêmes débuts de texte. Contre
 * une référence à l'ancien format (40 premiers éléments par sélecteur, sans les nombres), seuls ces 40 se comparent.
 */
function ecartBoites(fa, fb) {
  const a = lireBoites(fa);
  const b = lireBoites(fb);
  if (!a.n) b.b = b.b.filter(x => x.i < 40);
  const out = [];
  if (a.n && b.n) {
    for (const s of new Set([...Object.keys(a.n), ...Object.keys(b.n)])) {
      if (a.n[s] !== b.n[s]) out.push(`${s} : ${a.n[s] ?? '∅'} élément(s) → ${b.n[s] ?? '∅'}`);
    }
  }
  const cle = x => `${x.s}#${x.i}`;
  const mb = new Map(b.b.map(x => [cle(x), x]));
  for (const x of a.b) {
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

/** Fichiers comparés : dans la coque, seulement N = 3 (les autres N servent à la revue des lots suivants). */
const compare = (sous, n) => sous !== 'coque' || /-n3-/.test(n);
/** Images comparées au pixel : la coque et la vraie mini-main de l'accueil. */
const auPixel = sous => sous === 'coque' || sous === 'main';

async function comparer(browser, ref, sortie, parties) {
  const ecarts = [];
  const page = await browser.newPage();
  for (const [partieDuReleve, sous] of Object.entries(PARTIES)) {
    const dossier = path.join(sortie, sous);
    if (!existsSync(dossier)) continue;
    const dref = path.join(ref, sous);
    for (const n of lister(dossier).sort()) {
      if (!compare(sous, n)) continue;
      const a = path.join(dref, n);
      const b = path.join(dossier, n);
      if (!existsSync(a)) {
        if (!n.endsWith('.txt')) ecarts.push(`${sous}/${n} : absent de la référence`);
        continue;
      }
      if (n.endsWith('.png') && auPixel(sous)) {
        if (Buffer.compare(readFileSync(a), readFileSync(b)) === 0) continue;
        const e = await ecartImage(page, a, b);
        if (e.taille || e.pixels) ecarts.push(`${sous}/${n} : ${e.taille ?? `${e.pixels} pixel(s) différent(s), écart maximal ${e.max}`}`);
      } else if (n.endsWith('.json')) {
        const e = ecartBoites(a, b);
        if (e.length) ecarts.push(`${sous}/${n} : ${e.length} boîte(s) ou nombre(s) différent(s)\n      ${e.slice(0, 8).join('\n      ')}`);
      }
    }
    // Textes et DOM (.txt, .dom.txt) : au caractère près
    for (const e of comparerTextes(dref, dossier, { seulementReleves: true, garder: n => compare(sous, n) })) ecarts.push(`${sous}/${e}`);
    // Relevés de la référence que cette exécution n'a pas refaits (partie non demandée : ignorés)
    if (parties.includes(partieDuReleve)) {
      for (const n of lister(dref)) {
        if (!existsSync(path.join(dossier, n)) && compare(sous, n)) ecarts.push(`${sous}/${n} : pas relevé`);
      }
    }
  }
  await page.close();
  return ecarts;
}

/** Liste récursive des images d'un dossier (chemins relatifs). */
function images(d, prefixe = '') {
  const out = [];
  for (const n of lister(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) out.push(...images(p, `${prefixe}${n}/`));
    else if (n.endsWith('.png')) out.push(`${prefixe}${n}`);
  }
  return out.sort();
}

/**
 * Captures des scripts existants (rois, echiquiers, sorts, boutique) contre leur référence : images stables au pixel
 * près ; images bruitées rapportées avec le bruit mesuré, signalées au-delà (plus de deux fois les pixels forts mesurés,
 * ou un écart maximal plus grand de 32). Seuls les sous-dossiers présents dans `dossier` sont comparés.
 */
async function comparerExistantes(browser, dossier, ref) {
  const classement = JSON.parse(readFileSync(CLASSEMENT_EXISTANTES, 'utf8'));
  const stables = new Set(classement.stables);
  const bruitees = classement.bruitees;
  const sous = lister(dossier).filter(n => ['rois', 'echiquiers', 'sorts', 'boutique'].includes(n));
  const ecarts = [];
  const aRelire = [];
  const page = await browser.newPage();
  for (const s of sous) {
    const nouvelles = images(path.join(dossier, s)).map(n => `${s}/${n}`);
    const anciennes = images(path.join(ref, s)).map(n => `${s}/${n}`);
    for (const n of anciennes) if (!nouvelles.includes(n)) ecarts.push(`${n} : pas relevée`);
    for (const n of nouvelles) {
      const a = path.join(ref, n);
      const b = path.join(dossier, n);
      if (!existsSync(a)) {
        ecarts.push(`${n} : absente de la référence`);
        continue;
      }
      if (!stables.has(n) && !bruitees[n]) {
        ecarts.push(`${n} : ni stable ni bruitée dans ${path.relative(process.cwd(), CLASSEMENT_EXISTANTES)}`);
        continue;
      }
      const memes = Buffer.compare(readFileSync(a), readFileSync(b)) === 0;
      const e = memes ? { pixels: 0, forts: 0, max: 0 } : await ecartImage(page, a, b);
      const texte = e.taille ?? `${e.pixels} pixel(s) différent(s), ${e.forts} de plus de 16, écart maximal ${e.max}`;
      if (stables.has(n)) {
        if (e.taille || e.pixels) ecarts.push(`${n} (stable) : ${texte}`);
        continue;
      }
      const bruit = bruitees[n];
      const auDela = e.taille || e.forts > 2 * bruit.forts || e.max > bruit.max + 32;
      const ligne = `${n} : ${texte} (bruit mesuré : ${bruit.forts} de plus de 16, écart maximal ${bruit.max})`;
      if (auDela) ecarts.push(`${ligne} : AU-DELÀ DU BRUIT`);
      else if (e.pixels) aRelire.push(ligne);
    }
  }
  await page.close();
  return { ecarts, aRelire, sous };
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const o = lireOptions(argv, { ref: REF, prefixe: 'spellmate-identite-', tout: Object.keys(PARTIES).join(',') });
  const inconnues = o.seulement.filter(p => !(p in PARTIES));
  if (inconnues.length) {
    console.error(`--seulement : partie inconnue ${inconnues.join(', ')} (parties : ${Object.keys(PARTIES).join(', ')}).`);
    process.exit(2);
  }

  if (o.opt('existantes')) {
    const dossier = path.resolve(o.val('existantes') ?? '.');
    const ref = path.resolve(o.val('comparer') ?? REF_EXISTANTES);
    const browser = await lancerChromium();
    let r;
    try {
      r = await comparerExistantes(browser, dossier, ref);
    } finally {
      await browser.close();
    }
    console.log(`Captures existantes (${r.sous.join(', ') || 'aucun sous-dossier reconnu'}) de ${dossier} contre ${ref}`);
    if (r.aRelire.length) {
      console.log(`${r.aRelire.length} image(s) bruitée(s) qui diffèrent, dans le bruit mesuré (à relire à l'œil) :`);
      for (const e of r.aRelire) console.log(`  ${e}`);
    }
    if (!r.sous.length || r.ecarts.length) {
      console.log(`${r.ecarts.length} écart(s) :`);
      for (const e of r.ecarts) console.log(`  ${e}`);
      process.exitCode = 1;
    } else console.log('Images stables identiques à la référence.');
    return;
  }

  const avecServeur = o.seulement.some(p => AVEC_SERVEUR.includes(p));
  if (!o.jetable) {
    const dossiers = o.ecrire ? o.seulement.map(p => path.join(o.sortie, PARTIES[p])) : [];
    controlesPrealables(o, { avecServeur, dossiers });
    if (avecServeur && !o.base) relancerSousServeurJetable(fileURLToPath(import.meta.url), argv, o.racine, o.port);
  }
  const ns = [...new Set([3, ...(o.val('n') ?? '').split(',').filter(Boolean).map(Number)])];
  o.preparerSortie();
  const erreurs = [];
  const browser = await lancerChromium();
  let ecarts = [];
  try {
    if (o.seulement.includes('bancs')) await bancs(browser, o.sortie, ns, erreurs);
    if (o.seulement.includes('pages')) await pages(browser, o.base, o.sortie, erreurs);
    if (o.seulement.includes('accueil')) await accueil(browser, o.base, o.sortie, erreurs);
    if (o.seulement.includes('main')) await mainAccueil(browser, o.base, o.sortie, erreurs);
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
  const hors = o.horsDefaut ? ' [HORS DÉFAUT]' : '';
  if (!ecarts.length) {
    console.log(`Identique à la référence (${o.ref})${hors}.`);
    return;
  }
  console.log(`${ecarts.length} écart(s) avec la référence (${o.ref})${hors} :`);
  for (const e of ecarts) console.log(`  ${e}`);
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}

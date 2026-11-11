// Relevé du texte des pages (témoin d'identité des textes, lot 0a) : document.body.innerText de chaque page, en
// 1280 × 720 et en 375 × 667, et d'une partie en ligne à quatre moments (attente d'une invitation, choix des cartes,
// partie en cours, fin), vue par la joueuse des Blancs ; l'adversaire est un client socket (test/lib/client.mjs).
//
//   npm run build && npm run textes-pages       compare au dépôt (test/fixtures/v1/textes) ; écarts listés, code 1
//   node test/textes-pages.mjs [BASE] [--comparer=<dossier de référence>] [--sortie=<dossier>] [--seulement=pages|partie]
//                              [--racine=<dossier contenant dist>] [--port=<n>] [--construire] [--hors-defaut]
//   node test/textes-pages.mjs --ecrire [--ecraser] [--sortie=<dossier>]       (re)écrit des références
//
// Sans option, le script COMPARE : les textes sont relevés dans un dossier temporaire (affiché) ou dans --sortie, puis
// comparés à la référence. Il n'écrit dans la référence qu'avec --ecrire, et refuse si le dossier visé n'est pas vide,
// sauf --ecraser (les références ne se réécrivent que sur le code d'avant la polymorphie, et sur décision).
//
// Sans BASE (ni SPELLMATE_BASE), le script se relance de lui-même sous scripts/serveur-jetable.mjs (site construit de
// --racine, par défaut la copie du dépôt ; base neuve ; port --port, sinon un port libre). Avant, il vérifie :
// - que le site construit est à jour : refus si un fichier de src/, public/, index.html, vite.config.ts ou
//   scripts/build-server.mjs est plus récent que dist/ (--construire lance d'abord npm run build) ;
// - que le serveur tournera au défaut : refus si SPELLMATE_TEST_RULES, une variable FEATURE_*, APP_NAME ou LEGAL_* est
//   définie (le serveur jetable hérite de l'environnement), ou si la racine contient un fichier .env (le serveur le
//   lirait). --hors-defaut passe outre pour regarder un autre réglage : la comparaison est alors marquée « hors défaut »
//   et --ecrire est refusé.
// Le rapport commence par le commit et l'état de la copie (git status). Avec BASE, le site servi n'est pas vérifié.
//
// Stabilisation (deux exécutions donnent les mêmes textes) :
// - Math.random remplacé par mulberry32, même graine à chaque document ; stockage vidé au premier chargement ;
//   introduction de l'accueil passée (sessionStorage sm:intro) ; pseudo d'invité fixé ;
// - pages : la date du navigateur est décalée au 11 novembre 2026 à midi (UTC), l'heure continue de s'écouler
//   (problème du jour, année du pied de page) ; fuseau Europe/Paris, langue fr-FR ;
// - partie : heure réelle (les échéances viennent du serveur) ; les décomptes sont remplacés par ‹n› (compte à
//   rebours du choix, « Premier coup avant … s », « Victoire réclamable dans … s ») et l'identifiant de la partie par
//   ‹partie› ;
// - chaque page est parcourue jusqu'en bas puis remise en haut avant le relevé (contenus chargés au défilement).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, sleep, sq } from './lib/client.mjs';
import { ECRANS, lancerChromium } from './lib/playwright.mjs';

const TEST = path.dirname(fileURLToPath(import.meta.url));
const DEPOT = path.resolve(TEST, '..');
export const REF_TEXTES = path.join(TEST, 'fixtures/v1/textes');

/** Pages relevées : [nom, chemin]. L'accueil n'est pas parcouru : son texte suit le défilement (lieux, altitude), il
 *  est relevé en haut de page, juste après le chargement (identite.mjs le relève aussi à plusieurs hauteurs). */
export const PAGES = [
  ['accueil', '/'],
  ['regles', '/regles'],
  ['jouer', '/jouer'],
  ['apprendre', '/apprendre'],
  ['problemes', '/problemes'],
  ['cartes', '/cartes'],
  ['boutique', '/boutique'],
  ['compte', '/compte'],
  ['mentions-legales', '/mentions-legales'],
];
/** Moments de la partie relevés, dans l'ordre. */
export const MOMENTS = ['attente', 'choix', 'en-cours', 'fin'];
export const ECRANS_TEXTES = ['1280x720', '375x667'];
/** Jour figé des pages : 11 novembre 2026, midi UTC. */
export const JOUR = Date.UTC(2026, 10, 11, 12, 0, 0);
export const GRAINE = 0x2545f491;

/** Options de contexte communes : taille d'écran, langue, fuseau. */
export function optionsContexte(ecran) {
  return { ...ECRANS[ecran], locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: 'no-preference' };
}

/**
 * Script injecté avant tout code de la page : hasard figé, stockage d'un contexte neuf, intro passée, pseudo, et (pages)
 * date décalée au JOUR.
 */
export function scriptInit({ nom = null, jour = null } = {}) {
  return `(() => {
    let a = ${GRAINE};
    Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    ${jour === null ? '' : `
    const VraieDate = Date;
    const vraiMaintenant = VraieDate.now.bind(VraieDate);
    const decalage = ${jour} - vraiMaintenant();
    class DateFigee extends VraieDate {
      constructor(...a) { if (a.length) super(...a); else super(vraiMaintenant() + decalage); }
      static now() { return vraiMaintenant() + decalage; }
    }
    globalThis.Date = DateFigee;`}
    try {
      if (!sessionStorage.getItem('id:init')) { localStorage.clear(); sessionStorage.setItem('id:init', '1'); }
      sessionStorage.setItem('sm:intro', '1');
      ${nom ? `localStorage.setItem('sm:guestName', ${JSON.stringify(nom)});` : ''}
    } catch {}
  })();`;
}

/** Parcourt la page jusqu'en bas (contenus chargés au défilement), puis revient en haut. */
export async function parcourir(page) {
  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(() => r()));
    const pas = Math.max(300, Math.floor(innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += pas) {
      scrollTo(0, y);
      await frame();
      await frame();
    }
    scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(r => setTimeout(r, 300));
    scrollTo(0, 0);
    await frame();
  }).catch(() => undefined);
  await sleep(700);
}

/** Ouvre une page, attend son chargement et ses polices, la parcourt (sauf l'accueil). */
export async function ouvrir(page, url, { defiler = true } = {}) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await sleep(defiler ? 1800 : 3500);
  if (defiler) await parcourir(page);
}

/** L'accueil (chemin « / ») suit le défilement : il n'est pas parcouru. */
export const defile = chemin => chemin !== '/';

/** Texte stabilisé : décomptes, adresse du site (port du serveur jetable) et identifiant de partie remplacés. */
export function normaliser(texte, { id, base } = {}) {
  let t = texte.replace(/\r\n/g, '\n');
  if (base) t = t.split(base).join('‹site›');
  if (id) t = t.split(id).join('‹partie›');
  return t
    .replace(/Premier coup avant \d+ s/g, 'Premier coup avant ‹n› s')
    .replace(/Victoire réclamable dans \d+ s/g, 'Victoire réclamable dans ‹n› s');
}

/** innerText du document, le compte à rebours du choix remplacé (il dépend du temps écoulé). */
export async function lireTexte(page, contexte = {}) {
  const brut = await page.evaluate(() => {
    for (const el of document.querySelectorAll('.cd-digits')) el.textContent = '‹n›';
    return document.body.innerText;
  });
  return normaliser(brut, contexte);
}

/** Relevé des pages pour un écran : `rappel(nom, page)` après l'ouverture de chacune. */
export async function relevePages(browser, base, ecran, rappel, erreurs) {
  const ctx = await browser.newContext(optionsContexte(ecran));
  await ctx.addInitScript(scriptInit({ jour: JOUR }));
  const page = await ctx.newPage();
  page.on('pageerror', e => erreurs.push(`${ecran} ${page.url()} : ${e.message}`));
  for (const [nom, chemin] of PAGES) {
    await ouvrir(page, base + chemin, { defiler: defile(chemin) });
    await rappel(nom, page, { base });
  }
  await ctx.close();
}

const tuile = (page, name) => page.locator('.cd-tile', { hasText: name }).first();

/**
 * Partie en ligne entre Aurore (navigateur, Blancs) et Basile (client socket) : `rappel(moment, page, { id })` à
 * chacun des MOMENTS. Aurore choisit Mur de glace, Faille et Grande Marée à la souris ; Basile choisit Déflagration,
 * Trêve et Lune de sang ; Aurore lance le Mur de glace en a3 puis joue e2-e4 ; Basile abandonne.
 */
export async function scenarioPartie(browser, base, ecran, rappel, erreurs) {
  const ctx = await browser.newContext(optionsContexte(ecran));
  await ctx.addInitScript(scriptInit({ nom: 'Aurore' }));
  const page = await ctx.newPage();
  page.on('pageerror', e => erreurs.push(`partie ${ecran} : ${e.message}`));
  await ctx.request.get(base + '/api/me');
  const r = await ctx.request.post(base + '/api/games', { data: { mode: 'invite', tc: '5+0', color: 'w', name: 'Aurore' } });
  if (!r.ok()) throw new Error(`Création de la partie refusée : ${r.status()} ${await r.text()}`);
  const { id } = await r.json();

  await page.goto(`${base}/partie/${id}`, { waitUntil: 'load' });
  await page.locator('.gp-waiting').waitFor({ timeout: 30000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await sleep(1500);
  await rappel('attente', page, { id, base });

  const basile = new Client(base);
  await basile.api('/me');
  await basile.connect();
  const join = await basile.emit('game:join', { id, name: 'Basile' });
  if (!join?.view?.draft) throw new Error(`Basile n'a pas rejoint le choix : ${JSON.stringify(join).slice(0, 200)}`);
  await page.locator('.cd').waitFor({ timeout: 30000 });
  await sleep(1600);
  await rappel('choix', page, { id, base });

  for (const nom of ['Mur de glace', 'Faille', 'Grande Marée']) {
    await tuile(page, nom).click();
    await sleep(250);
  }
  await page.locator('.cd-validate').click();
  await page.locator('.cd-wait').waitFor({ timeout: 10000 });
  const d = await basile.emit('game:draft', { id, cards: ['blast', 'truce', 'blood_moon'] });
  if (!d?.ok) throw new Error(`Choix de Basile refusé : ${JSON.stringify(d)}`);
  await page.locator('.cd-reveal').waitFor({ timeout: 10000 });
  if (await page.locator('.cd-reveal .btn-gold').count()) await page.locator('.cd-reveal .btn-gold').click().catch(() => undefined);
  await page.locator('.cd-reveal').waitFor({ state: 'detached', timeout: 15000 });
  // Le pointeur quitte la page : resté sur la barre de validation, il survolerait une carte de la main (bulle ouverte).
  await page.mouse.move(-5, -5);

  // Aurore joue par un second socket sous la même identité (cookies du navigateur).
  const aurore = new Client(base);
  for (const c of await ctx.cookies()) aurore.cookies.set(c.name, c.value);
  await aurore.connect();
  const vue = (await aurore.emit('game:join', { id })).view;
  const index = vue.state.hands.w.findIndex(h => h.card === 'ice_wall');
  const c = await aurore.emit('game:card', { id, index, targets: [sq('a3')] });
  if (!c?.ok) throw new Error(`Mur de glace refusé : ${JSON.stringify(c)}`);
  await sleep(1500);
  const m = await aurore.emit('game:move', { id, from: sq('e2'), to: sq('e4') });
  if (!m?.ok) throw new Error(`e2-e4 refusé : ${JSON.stringify(m)}`);
  await sleep(2500);
  await rappel('en-cours', page, { id, base });

  const f = await basile.emit('game:resign', { id });
  if (!f?.ok) throw new Error(`Abandon refusé : ${JSON.stringify(f)}`);
  await page.locator('.gs-result, .gp-end, [class*="result"]').first().waitFor({ timeout: 10000 }).catch(() => undefined);
  await sleep(2500);
  await rappel('fin', page, { id, base });

  aurore.close();
  basile.close();
  await ctx.close();
}

/**
 * Lit les options communes : BASE, --ecrire, --ecraser, --sortie, --comparer[=réf], --seulement, --racine, --construire,
 * --hors-defaut. Par défaut : comparaison (relevés dans un dossier temporaire créé par `preparerSortie`, ou --sortie).
 * --ecrire : relevés écrits dans la référence (ou --sortie), sans comparaison.
 */
export function lireOptions(argv, defauts) {
  const opt = name => argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  // Valeur de la dernière occurrence « --nom=valeur » (« --comparer » seul, venu du script npm, n'en a pas).
  const val = name => argv.filter(a => a.startsWith(`--${name}=`)).map(a => a.slice(name.length + 3)).pop() || null;
  const base = argv.find(a => !a.startsWith('--')) ?? process.env.SPELLMATE_BASE ?? null;
  const ecrire = !!opt('ecrire');
  if (ecrire && opt('comparer')) {
    console.error('--ecrire et --comparer s’excluent : --ecrire écrit des références sans comparer.');
    process.exit(2);
  }
  const ref = path.resolve(val('comparer') ?? defauts.ref);
  const sortie = val('sortie') ? path.resolve(val('sortie')) : ecrire ? path.resolve(defauts.ref) : null;
  const seulement = (val('seulement') ?? defauts.tout).split(',');
  const racine = path.resolve(val('racine') ?? DEPOT);
  return {
    base: base?.replace(/\/$/, '') ?? null,
    ecrire,
    comparer: !ecrire,
    ecraser: !!opt('ecraser'),
    horsDefaut: !!opt('hors-defaut'),
    construire: !!opt('construire'),
    /** Relancé par relancerSousServeurJetable : les contrôles préalables sont déjà faits. */
    jetable: !!opt('jetable'),
    ref,
    sortie,
    racine,
    /** Port imposé au serveur jetable (plages de ports des agents), sinon un port libre. */
    port: val('port'),
    seulement,
    opt,
    val,
    /** Dossier des relevés : --sortie, la référence (--ecrire), sinon un dossier temporaire créé à la demande. */
    preparerSortie() {
      this.sortie ??= mkdtempSync(path.join(os.tmpdir(), defauts.prefixe));
      mkdirSync(this.sortie, { recursive: true });
      return this.sortie;
    },
  };
}

/** Variables qui changeraient le site relevé : réglages des tests, interrupteurs, marque, mentions légales. */
const VARIABLES_HORS_DEFAUT = /^(SPELLMATE_TEST_RULES|FEATURE_.+|APP_NAME|LEGAL_.+)$/;

/**
 * Raisons pour lesquelles le serveur jetable ne tournerait pas au défaut : il hérite de l'environnement, et le serveur
 * lit le fichier .env de son dossier (src/server/config.ts).
 */
export function ecartsAuDefaut(racine = DEPOT, env = process.env) {
  const out = Object.keys(env).filter(k => VARIABLES_HORS_DEFAUT.test(k)).sort().map(k => `variable ${k} définie`);
  if (existsSync(path.join(racine, '.env'))) out.push(`fichier ${path.join(racine, '.env')} (le serveur le lirait)`);
  return out;
}

/** Ce dont dépend le site construit : un fichier plus récent que dist/ veut dire que dist/ est périmé. */
const SOURCES_DU_SITE = ['src', 'public', 'index.html', 'vite.config.ts', 'scripts/build-server.mjs'];

/** Fichiers des sources de `racine` plus récents que son dist/ (du plus récent au plus ancien). */
export function sourcesPlusRecentes(racine = DEPOT) {
  const cibles = ['dist/client/index.html', 'dist/server/index.js'].map(f => path.join(racine, f));
  if (cibles.some(f => !existsSync(f))) return [`${path.join(racine, 'dist')} incomplet`];
  const t = Math.min(...cibles.map(f => statSync(f).mtimeMs));
  const plus = [];
  const visiter = p => {
    if (!existsSync(p)) return;
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const n of readdirSync(p)) visiter(path.join(p, n));
    } else if (st.mtimeMs > t) plus.push([st.mtimeMs, path.relative(racine, p)]);
  };
  for (const s of SOURCES_DU_SITE) visiter(path.join(racine, s));
  return plus.sort((a, b) => b[0] - a[0]).map(([, f]) => f);
}

/** Commit et état de la copie du dépôt (et du site construit relevé, s'il vient d'ailleurs), pour l'en-tête du rapport. */
export function enteteCopie(racine = DEPOT) {
  const brut = (...a) => spawnSync('git', a, { cwd: DEPOT, encoding: 'utf8' }).stdout ?? '';
  const git = (...a) => brut(...a).trim();
  const etat = brut('status', '--short').split('\n').filter(Boolean);
  const lignes = [
    `Copie ${DEPOT} : commit ${git('rev-parse', '--short=10', 'HEAD') || '?'} (${git('branch', '--show-current') || 'détachée'}), ${
      etat.length ? `${etat.length} fichier(s) modifié(s) ou non suivi(s)` : 'propre'
    }`,
    ...etat.slice(0, 10).map(l => `  ${l}`),
    ...(etat.length > 10 ? [`  … et ${etat.length - 10} autre(s)`] : []),
  ];
  if (racine !== DEPOT) {
    const commit = existsSync(path.join(racine, 'COMMIT')) ? readFileSync(path.join(racine, 'COMMIT'), 'utf8').trim().slice(0, 10) : '?';
    lignes.push(`Site construit relevé : ${racine} (commit ${commit})`);
  }
  return lignes.join('\n');
}

/**
 * Contrôles avant un relevé (une seule fois, avant la relance sous le serveur jetable) : en-tête du rapport, réglages au
 * défaut, fraîcheur du site construit, dossiers de référence non écrasés. Sort du processus (code 2) en cas de refus.
 * `dossiers` : les dossiers que le relevé écrira (refus de --ecrire s'ils ne sont pas vides, sauf --ecraser).
 */
export function controlesPrealables(o, { avecServeur, dossiers }) {
  console.log(enteteCopie(o.racine));
  const refus = [];
  if (avecServeur) {
    const hors = ecartsAuDefaut(o.racine);
    if (hors.length && !o.horsDefaut) {
      refus.push(`le serveur ne tournerait pas au défaut : ${hors.join(', ')} (retirez-les, ou --hors-defaut pour regarder un autre réglage)`);
    } else if (hors.length) {
      console.log(`HORS DÉFAUT (--hors-defaut) : ${hors.join(', ')}. Ce relevé ne prouve pas l'identité au défaut.`);
      if (o.ecrire) refus.push('--ecrire refusé avec --hors-defaut : une référence se prend au défaut');
    }
    if (o.base) {
      console.log(`Serveur fourni (${o.base}) : le site qu'il sert n'est pas vérifié (fraîcheur, réglages).`);
    } else {
      if (o.construire && o.racine === DEPOT) {
        console.log('npm run build…');
        const r = spawnSync('npm', ['run', 'build'], { cwd: DEPOT, stdio: 'inherit' });
        if (r.status !== 0) refus.push('npm run build a échoué');
      }
      const recents = sourcesPlusRecentes(o.racine);
      if (recents.length) {
        refus.push(`site construit périmé (${path.join(o.racine, 'dist')}) : ${recents.slice(0, 5).join(', ')}${recents.length > 5 ? `… (${recents.length})` : ''} plus récent(s) ; lancez npm run build, ou --construire`);
      }
    }
  }
  if (o.ecrire) {
    for (const d of dossiers) {
      if (existsSync(d) && readdirSync(d).length && !o.ecraser) {
        refus.push(`${d} n'est pas vide : --ecrire ne remplace des références qu'avec --ecraser`);
      }
    }
  }
  if (refus.length) {
    console.error(`Refusé :\n  ${refus.join('\n  ')}`);
    process.exit(2);
  }
}

/** Sans serveur indiqué : relance le script sous le serveur jetable (site construit de `racine`, `port` s'il est donné). */
export function relancerSousServeurJetable(script, argv, racine = DEPOT, port = null) {
  const r = spawnSync(
    process.execPath,
    [
      path.join(DEPOT, 'scripts/serveur-jetable.mjs'), `--racine=${racine}`, ...(port ? [`--port=${port}`] : []),
      '--', process.execPath, script, '{base}', ...argv, '--jetable',
    ],
    { stdio: 'inherit' },
  );
  process.exit(r.status ?? 1);
}

/**
 * Compare deux dossiers de textes (.txt, au caractère près) : renvoie la liste des écarts lisibles. `seulementReleves` :
 * seuls les textes relevés cette fois sont comparés (ceux de la référence qui manquent ne sont pas signalés) ;
 * `garder(nom)` : filtre des fichiers comparés.
 */
export function comparerTextes(ref, sortie, { seulementReleves = false, garder = () => true } = {}) {
  const ecarts = [];
  const deRef = seulementReleves || !existsSync(ref) ? [] : readdirSync(ref);
  const noms = new Set([...deRef, ...readdirSync(sortie)].filter(n => n.endsWith('.txt') && garder(n)));
  for (const n of [...noms].sort()) {
    const a = path.join(ref, n);
    const b = path.join(sortie, n);
    if (!existsSync(a)) { ecarts.push(`${n} : absent de la référence`); continue; }
    if (!existsSync(b)) { ecarts.push(`${n} : pas relevé`); continue; }
    const la = readFileSync(a, 'utf8').split('\n');
    const lb = readFileSync(b, 'utf8').split('\n');
    if (la.join('\n') === lb.join('\n')) continue;
    const lignes = [];
    const max = Math.max(la.length, lb.length);
    for (let i = 0; i < max && lignes.length < 12; i++) {
      if (la[i] !== lb[i]) lignes.push(`    l.${i + 1} : « ${la[i] ?? '∅'} » → « ${lb[i] ?? '∅'} »`);
    }
    ecarts.push(`${n} : texte différent\n${lignes.join('\n')}`);
  }
  return ecarts;
}

async function main() {
  const argv = process.argv.slice(2);
  const o = lireOptions(argv, { ref: REF_TEXTES, prefixe: 'spellmate-textes-', tout: 'pages,partie' });
  if (!o.jetable) {
    controlesPrealables(o, { avecServeur: true, dossiers: [o.sortie ?? o.ref].filter(() => o.ecrire) });
    if (!o.base) relancerSousServeurJetable(fileURLToPath(import.meta.url), argv, o.racine, o.port);
  }
  o.preparerSortie();
  const erreurs = [];
  const browser = await lancerChromium();
  try {
    for (const ecran of ECRANS_TEXTES) {
      if (o.seulement.includes('pages')) {
        await relevePages(browser, o.base, ecran, async (nom, page, ctx) => {
          writeFileSync(path.join(o.sortie, `${nom}-${ecran}.txt`), await lireTexte(page, ctx));
        }, erreurs);
      }
      if (o.seulement.includes('partie')) {
        await scenarioPartie(browser, o.base, ecran, async (moment, page, ctx) => {
          writeFileSync(path.join(o.sortie, `partie-${moment}-${ecran}.txt`), await lireTexte(page, ctx));
        }, erreurs);
      }
    }
  } finally {
    await browser.close();
  }
  if (erreurs.length) console.error(`Erreurs de page (${erreurs.length}) :\n  ${erreurs.slice(0, 10).join('\n  ')}`);
  console.log(`Textes relevés dans ${o.sortie}`);
  if (!o.comparer) return;
  const ecarts = comparerTextes(o.ref, o.sortie, { seulementReleves: !!o.val('seulement') });
  const hors = o.horsDefaut ? ' [HORS DÉFAUT]' : '';
  if (!ecarts.length) {
    console.log(`Textes identiques à la référence (${o.ref})${hors}.`);
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

// Captures et parcours de la boutique (lot E des skins), contre un serveur lancé :
//   node test/boutique.mjs [BASE] [dossier de sortie] [--ferme=<BASE d'un serveur aux paiements fermés>]
//
// BASE (défaut http://localhost:3000) : un serveur en mode démo (PAYMENTS_MODE=demo). Avec --ferme, un second serveur
// (PAYMENTS_MODE=off) sert les captures « paiements bientôt disponibles ». Chaque passage crée 4 ou 5 comptes.
// Avec --banc, seulement la mesure de repos sur téléphone (412 × 915, densité 2) : images composées (DrawFrame) et
// repeintes (Paint) pendant 3 s, en portrait, après la série de sorts de la vue En partie, puis cabine hors de l'écran,
// le ciel commun des pages intérieures figé (ses animations, composées, ne repeignent rien).
// Ne pas lancer pendant une autre mesure ou une construction.
//
// Captures (relues à l'œil) :
// - invite-1440.png, invite-1280.png : visiteur, premier écran (le bouton d'achat de la cabine est visible sans défiler) ;
// - invite-1440-page.png : page entière ; rayon-echiquiers.png, rayon-sorts.png, rayon-collections.png ;
// - cabine-partie.png (échiquier essayé, vue En partie), cabine-sort.png (un sort Écarlate en cours) ;
// - tel-ecran.png, tel-portant.png, tel-collections.png, tel-bas.png, tel-partie.png : 412 × 915, densité 2 ;
// - connecte-1440.png, tel-connecte.png : compte sans achat ;
// - skins-1440.png, skins-ma-collection.png, compte-collection.png, tel-compte.png, compte-achats.png, profil.png :
//   compte avec des skins (collection Forge d'Inferno achetée, sorts Sakura) ;
// - ferme-1440.png, ferme-connecte.png, tel-ferme.png : paiements fermés (avec --ferme) ;
// - parcours démo : essai-2-skins.png, recapitulatif.png, caisse-demo.png, deballage.png, apres-achat.png,
//   partie-roi.png.
//
// Vérifié automatiquement (assert) :
// - à 1440 × 900, le bouton principal de la cabine est dans l'écran ; à 1280 × 720, après 100 px de défilement ;
// - sur téléphone, la boutique (au-dessus du pied de page commun) fait 2 200 px au plus ; la vue de la cabine et le
//   portant tiennent ensemble à l'écran au-dessus du dock ; le dock est fixe, se retire quand les boutons de la ligne
//   d'action sont à l'écran et, page défilée au bout, ne recouvre ni la dernière carte ni les engagements ;
// - onglets au clavier (flèches, Début, Fin), libellés des cartes, zone aria-live, cibles d'au moins 44 px ;
// - adresse ?essai= écrite, puis relue au rechargement ;
// - parcours démo : essai de 2 skins, « Acheter et équiper », retour, les deux sont équipés, le roi est vu en partie.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

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
const plain = args.filter(a => !a.startsWith('--'));
const BASE = (plain[0] ?? 'http://localhost:3000').replace(/\/$/, '');
const OUT = path.resolve(plain[1] ?? path.join(os.tmpdir(), 'boutique'));
const FERME = args.find(a => a.startsWith('--ferme='))?.slice('--ferme='.length).replace(/\/$/, '');
const BANC = args.includes('--banc');
mkdirSync(OUT, { recursive: true });

const stamp = Date.now().toString(36);
const step = name => console.log('✓', name);
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
/** Les sections en content-visibility: auto ne sont pas peintes hors de l'écran : forcées pour les pages entières. */
const SHOW_ALL = '.bz-colls, .tb, .sp { content-visibility: visible !important; }';

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const errors = [];

async function open(base, opts, url = '/boutique') {
  const ctx = await browser.newContext({ ...opts, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${url} : ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource|WebGL|GPU stall/.test(m.text())) errors.push(`${url} : ${m.text()}`);
  });
  if (url) await go(page, base + url);
  return { ctx, page };
}
async function go(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
}
const shot = (page, name, o = {}) => page.screenshot({ path: path.join(OUT, name), ...o });
async function fullShot(page, name) {
  await page.addStyleTag({ content: SHOW_ALL });
  await page.waitForTimeout(200);
  await shot(page, name, { fullPage: true });
}

/** Appel d'API depuis la page (les cookies de session sont ceux du navigateur). */
const api = (page, p, body) =>
  page.evaluate(
    async ([p, body]) => {
      const r = await fetch('/api' + p, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, data: await r.json().catch(() => null) };
    },
    [p, body],
  );

async function register(page, base, name) {
  if (!page.url().startsWith(base)) await go(page, base + '/');
  const username = `${name}_${stamp}`.slice(0, 20);
  const r = await api(page, '/auth/register', { email: `${username}@test.fr`, username, password: 'motdepasse123', acceptTerms: true });
  assert.equal(r.status, 200, `inscription de ${username} : ${JSON.stringify(r.data)}`);
  return username;
}

/** Achat simulé (mode démo) d'un produit ou d'un panier, sans passer par l'interface. */
async function demoBuy(page, body) {
  const r = await api(page, '/shop/checkout', { waiver: true, ...body });
  assert.equal(r.status, 200, `paiement : ${JSON.stringify(r.data)}`);
  const id = r.data.url.split('/').pop();
  const done = await api(page, `/shop/demo/${id}/complete`, {});
  assert.equal(done.status, 200);
  return done.data;
}

/** Espaces insécables des prix (toLocaleString) ramenées à des espaces simples. */
const norm = s => s?.replace(/[\u00a0\u202f]/g, ' ');
const box = (page, sel) => page.locator(sel).first().boundingBox();
const tryCard = (page, name) => page.locator('.rack .ic-hit', { hasText: name }).first().click();
const tab = (page, label) => page.getByRole('tab', { name: new RegExp(`^${label}`) }).click();

// ---------------------------------------------------------------------------------------------
// Banc de repos (téléphone)

/** Images composées et repeintes pendant `ms` (trace Chromium), page immobile. */
async function repos(page, ms = 3000) {
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame'] });
  await page.waitForTimeout(ms);
  const ev = JSON.parse((await browser.stopTracing()).toString()).traceEvents;
  const n = name => ev.filter(e => e.name === name).length;
  return { images: n('DrawFrame'), voulues: n('DrawFrame') + n('DroppedFrame'), repeintes: n('Paint') };
}

if (BANC) {
  const { ctx, page } = await open(BASE, PHONE);
  // Le ciel commun des pages intérieures (lanternes, nuages, étoiles) s'anime sans repeindre : figé pour isoler la
  // boutique
  await page.addStyleTag({ content: '.pg-sky, .pg-sky * { animation: none !important; }' });
  await page.waitForTimeout(3000);
  const portrait = await repos(page);
  await page.locator('.cab-top .seg button', { hasText: 'En partie' }).click();
  await tab(page, 'Sorts');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  // Sorts essayés : au plus 3 sorts à la suite, puis « Encore un sort » ; l'échiquier ne bouge plus
  await page.locator('.rack .ic-hit', { hasText: 'Inferno' }).first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForSelector('.cab-cast', { timeout: 40000, state: 'attached' });
  await page.waitForFunction(() => /Encore un sort/.test(document.querySelector('.cab-cast')?.textContent ?? ''), null, { timeout: 40000 });
  await page.waitForTimeout(1500);
  const apres = await repos(page);
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.tb').getBoundingClientRect().top + scrollY - 100));
  await page.waitForTimeout(1500);
  const loin = await repos(page);
  console.log('Repos sur téléphone (3 s, ciel figé) : images composées / voulues / repeintes');
  console.log(`  portrait du roi            ${portrait.images} / ${portrait.voulues} / ${portrait.repeintes}`);
  console.log(`  après la série de sorts    ${apres.images} / ${apres.voulues} / ${apres.repeintes}`);
  console.log(`  cabine hors de l'écran     ${loin.images} / ${loin.voulues} / ${loin.repeintes}`);
  await ctx.close();
  await browser.close();
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------
// Visiteur, ordinateur

{
  const { ctx, page } = await open(BASE, DESK);
  await page.waitForTimeout(1500);
  await shot(page, 'invite-1440.png');
  const main = await box(page, '.cab .ta-main');
  assert.ok(main && main.y + main.height <= 900, `bouton de la cabine visible à 1440 × 900 (bas à ${main && main.y + main.height})`);
  assert.match(await page.locator('.cab .ta-main').innerText(), /Créer un compte/i);
  step('1440 × 900 : bouton « Créer un compte pour l’acheter » visible sans défiler');

  // Libellés accessibles et zone aria-live
  const label = norm(await page.locator('.rack .ic-hit', { hasText: 'Roi de braise' }).getAttribute('aria-label'));
  assert.equal(label, 'Roi de braise, roi, rareté rare, 2,99 €, en essai');
  assert.match(await page.locator('.cab [aria-live]').innerText(), /Essai : .*2,99/);
  await tryCard(page, 'Roi astral');
  await page.waitForTimeout(200);
  assert.match(norm(await page.locator('.cab [aria-live]').innerText()), /^Roi astral en essai, 4,99 €\./);
  step('libellés des cartes et annonce aria-live');

  // Onglets au clavier
  await page.getByRole('tab', { name: /^Rois/ }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab', { selected: true }).getAttribute('id'), 'rt-echiquiers');
  await page.keyboard.press('End');
  assert.equal(await page.getByRole('tab', { selected: true }).getAttribute('id'), 'rt-collections');
  await page.keyboard.press('Home');
  assert.equal(await page.getByRole('tab', { selected: true }).getAttribute('id'), 'rt-rois');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'rt-rois');
  step('onglets au clavier');

  // Échiquier essayé : vue En partie
  await tab(page, 'Échiquiers');
  await page.waitForTimeout(300);
  await tryCard(page, 'Carte du ciel');
  await page.waitForTimeout(900);
  await shot(page, 'rayon-echiquiers.png');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shot(page, 'cabine-partie.png', { clip: (await box(page, '.cab')) ?? undefined });
  assert.equal(await page.locator('.cab-top .seg button.on').innerText(), 'En partie');
  // Sorts essayés : un sort part tout de suite
  await tab(page, 'Sorts');
  await page.waitForTimeout(300);
  await shot(page, 'rayon-sorts.png');
  await tryCard(page, 'Écarlate');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForSelector('.cab-cap-k', { timeout: 8000 });
  await page.waitForTimeout(900);
  await shot(page, 'cabine-sort.png', { clip: (await box(page, '.cab')) ?? undefined });
  step('vue En partie : échiquier essayé, sort lancé');

  // L'essai est dans l'adresse, et revient au rechargement
  await page.waitForTimeout(500);
  const essai = new URL(page.url()).searchParams.get('essai');
  assert.equal(essai, 'king:astral,board:ciel,skin:ecarlate');
  assert.equal(new URL(page.url()).searchParams.get('rayon'), 'sorts');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.pb .slot.is-trying').count(), 3);
  assert.equal(await page.getByRole('tab', { selected: true }).getAttribute('id'), 'rt-sorts');
  step('essai et rayon dans l’adresse (?essai=…&rayon=sorts), relus au rechargement');

  await tab(page, 'Collections');
  await page.waitForTimeout(300);
  await shot(page, 'rayon-collections.png');
  await page.locator('.pb .slot-x').first().click();
  await page.locator('.ta-revert').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.pb .slot.is-trying').count(), 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await fullShot(page, 'invite-1440-page.png');
  await ctx.close();
}

{
  const { ctx, page } = await open(BASE, { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.waitForTimeout(1200);
  await shot(page, 'invite-1280.png');
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(500);
  const main = await box(page, '.cab .ta-main');
  assert.ok(main && main.y >= 0 && main.y + main.height <= 720, `bouton de la cabine visible à 1280 × 720 après 100 px (${main?.y})`);
  await shot(page, 'invite-1280-defile.png');
  step('1280 × 720 : bouton de la cabine visible après 100 px de défilement');
  await ctx.close();
}

// ---------------------------------------------------------------------------------------------
// Visiteur, téléphone

{
  const { ctx, page } = await open(BASE, PHONE);
  await page.waitForTimeout(1200);
  await shot(page, 'tel-ecran.png');
  const m = await page.evaluate(() => ({
    total: document.documentElement.scrollHeight,
    footer: document.querySelector('.site-footer').getBoundingClientRect().top + scrollY,
  }));
  console.log(`  téléphone : boutique ${Math.round(m.footer)} px, page entière ${m.total} px (pied de page commun compris)`);
  assert.ok(m.footer <= 2200, `boutique sur téléphone ≤ 2 200 px (${m.footer})`);

  // Cibles tactiles
  const small = await page.evaluate(() => {
    const sel = '.seg button, .slot-hit, .rt-tabs button, .rt-chips button, .rt-surprise, .ta-main, .ta-revert, .cc-try, .cc-buy, .tb-buy button';
    return [...document.querySelectorAll(sel)]
      .filter(e => e.offsetParent)
      .map(e => ({ s: e.className + ' ' + e.textContent.trim().slice(0, 20), h: e.getBoundingClientRect().height }))
      .filter(x => x.h < 44);
  });
  assert.deepEqual(small, [], 'cibles tactiles d’au moins 44 px');
  step(`téléphone : boutique de ${Math.round(m.footer)} px, cibles d’au moins 44 px`);

  // Portant : on essaie sous le miroir. La vue de la cabine juste sous l'en-tête, la vue et le portant tiennent ensemble
  // au-dessus du dock ; la ligne d'action (sous le portant sur téléphone) est hors de l'écran, le dock porte son bouton
  const headerH = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64);
  const vt = await page.evaluate(() => document.querySelector('.cab-view').getBoundingClientRect().top + scrollY);
  await page.evaluate(y => window.scrollTo(0, y), vt - headerH);
  await page.waitForTimeout(700);
  await shot(page, 'tel-portant.png');
  assert.ok(await page.locator('.dock.on').count(), 'dock visible sous la cabine');
  const dock = await box(page, '.dock');
  assert.ok(Math.abs(dock.y + dock.height - 915) <= 1, 'dock collé au bas de l’écran');
  const vue = await box(page, '.cab-view');
  const portant = await box(page, '.rack-row');
  assert.ok(vue.y >= headerH - 1 && portant.y + portant.height <= dock.y, `vue (${vue.y}) et portant (bas à ${portant.y + portant.height}) à l’écran ensemble, au-dessus du dock (${dock.y})`);
  // Ligne d'action à l'écran : un seul bouton, le dock se retire
  const act = await box(page, '.bz-act .ta-btns');
  await page.evaluate(y => window.scrollTo(0, y), act.y + (await page.evaluate(() => scrollY)) - 400);
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.dock.on').count(), 0, 'dock retiré quand les boutons de la ligne d’action sont à l’écran');
  await page.evaluate(y => window.scrollTo(0, y), vt - headerH);
  await page.waitForTimeout(700);
  // Glisser dans le portant : essayer un autre roi
  await page.locator('.rack-row').evaluate(e => e.scrollBy({ left: 300 }));
  await page.waitForTimeout(400);
  await tryCard(page, 'Roi éclipse');
  await page.waitForTimeout(300);
  assert.match(await page.locator('.dock-txt').innerText(), /3,99/);
  step('téléphone : portant, dock fixe');

  // Bas de page : le dock ne masque ni les engagements (fin de la boutique) ni le pied de page
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.sp').getBoundingClientRect().bottom + scrollY - 915 + 100));
  await page.waitForTimeout(500);
  const sp = await box(page, '.sp');
  const dk = await box(page, '.dock');
  assert.ok(sp.y + sp.height <= dk.y, `les engagements finissent au-dessus du dock (${sp.y + sp.height} / ${dk.y})`);
  await shot(page, 'tel-bas.png');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(500);
  const foot = await page.evaluate(() => {
    const els = document.querySelectorAll('.site-footer *');
    const last = [...els].filter(e => e.children.length === 0 && e.textContent.trim()).pop();
    return last.getBoundingClientRect().bottom;
  });
  assert.ok(foot <= (await box(page, '.dock')).y + 1, 'au bout de la page, le pied de page finit au-dessus du dock');
  await shot(page, 'tel-fin.png');
  step('téléphone : le dock ne masque ni les engagements ni le pied de page');

  // Collections : cartes empilées
  await page.evaluate(() => window.scrollTo(0, 0));
  await tab(page, 'Collections');
  await page.waitForTimeout(400);
  const rr = await box(page, '#rayon-collections');
  await page.evaluate(y => window.scrollTo(0, y), rr.y - 110);
  await page.waitForTimeout(500);
  await shot(page, 'tel-collections.png');

  // Vue En partie sur téléphone
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.cab .seg button', { hasText: 'En partie' }).click();
  await page.waitForTimeout(900);
  await shot(page, 'tel-partie.png');
  await fullShot(page, 'tel-page.png');
  await ctx.close();
}

// ---------------------------------------------------------------------------------------------
// Connecté sans achat, puis avec des skins

{
  const { ctx, page } = await open(BASE, DESK, null);
  const user = await register(page, BASE, 'sans');
  await go(page, BASE + '/boutique');
  await page.waitForTimeout(1200);
  await shot(page, 'connecte-1440.png');
  assert.match(await page.locator('.bz-count').innerText(), /Ma collection : 5 sur 26/);
  assert.match(await page.locator('.cab .ta-main').innerText(), /Acheter et équiper · 2,99/i);
  step(`connecté sans achat (${user}) : « Ma collection : 5 sur 26 », « Acheter et équiper · 2,99 € »`);

  // Des skins : la collection Forge d'Inferno et les sorts Sakura
  await demoBuy(page, { productId: 'col:inferno' });
  await demoBuy(page, { itemIds: ['skin:sakura'], equip: true });
  await go(page, BASE + '/boutique');
  await page.waitForTimeout(1000);
  await shot(page, 'skins-1440.png');
  assert.match(await page.locator('.bz-count').innerText(), /9 sur 26/);
  // Le roi de braise (possédé) est en essai à l'arrivée : la cabine propose « Équiper », un seul appel
  const braise = page.locator('.ic', { hasText: 'Roi de braise' });
  assert.match(await braise.innerText(), /Possédé/i);
  assert.match(await braise.innerText(), /En essai/i);
  assert.match(await page.locator('.cab .ta-main').innerText(), /^Équiper$/i);
  await page.locator('.cab .ta-main').click();
  await page.waitForTimeout(800);
  let me = await api(page, '/me');
  assert.equal(me.data.user.equippedKing, 'king:braise');
  assert.match(await braise.innerText(), /Équipé/i);
  // Un objet possédé hors de l'essai s'équipe depuis sa carte
  await tab(page, 'Échiquiers');
  const obsidienne = page.locator('.ic', { hasText: 'Obsidienne' });
  await obsidienne.locator('.ic-equip').click();
  await page.waitForTimeout(800);
  me = await api(page, '/me');
  assert.equal(me.data.user.equippedBoard, 'board:obsidian');
  await tab(page, 'Rois');
  step('avec des skins : Possédé, Équiper d’un geste (cabine et carte)');
  await page.getByRole('button', { name: 'Ma collection' }).click();
  await page.waitForTimeout(300);
  await shot(page, 'skins-ma-collection.png');
  await tab(page, 'Collections');
  await page.waitForTimeout(300);
  assert.match(await page.locator('.rack .cc', { hasText: 'Forge d’Inferno' }).innerText(), /Collection complète/i);
  assert.match(await page.locator('.rack .cc', { hasText: 'Jardin de jade' }).innerText(), /Compléter la collection/i);
  step('collections : complète, à compléter');

  await go(page, BASE + '/compte?onglet=collection');
  await page.waitForTimeout(800);
  await fullShot(page, 'compte-collection.png');
  await page.getByRole('tab', { name: 'Achats' }).click();
  await page.waitForTimeout(800);
  await shot(page, 'compte-achats.png');
  await go(page, BASE + `/joueur/${user}`);
  await page.waitForTimeout(800);
  await shot(page, 'profil.png');
  await go(page, BASE + '/classement');
  await page.waitForTimeout(600);
  await shot(page, 'classement.png');
  await ctx.close();
}

{
  const { ctx, page } = await open(BASE, PHONE, null);
  await register(page, BASE, 'tel');
  await demoBuy(page, { itemIds: ['king:laure', 'board:marble'], equip: true });
  await go(page, BASE + '/boutique');
  await page.waitForTimeout(1200);
  await shot(page, 'tel-connecte.png');
  await go(page, BASE + '/compte?onglet=collection');
  await page.waitForTimeout(800);
  await fullShot(page, 'tel-compte.png');
  await ctx.close();
}

// ---------------------------------------------------------------------------------------------
// Paiements fermés (second serveur, PAYMENTS_MODE=off)

if (FERME) {
  const { ctx, page } = await open(FERME, DESK);
  await page.waitForTimeout(1200);
  assert.match(await page.locator('.cab-soon').innerText(), /Le Bazar ouvre bientôt/);
  // Visiteur : le roi mis en avant ne s'achète pas encore, avec ou sans compte
  assert.match(await page.locator('.cab .ta-main').innerText(), /Bientôt en vente/i);
  assert.ok(await page.locator('.cab .ta-main').isDisabled());
  await shot(page, 'ferme-1440.png');
  await register(page, FERME, 'ferme');
  await go(page, FERME + '/boutique');
  await page.waitForTimeout(1000);
  const btn = page.locator('.cab .ta-main');
  assert.match(await btn.innerText(), /Bientôt en vente/i);
  assert.ok(await btn.isDisabled(), 'achat désactivé');
  // L'équipement des objets offerts reste actif
  await tab(page, 'Échiquiers');
  await tryCard(page, 'Bois de chêne');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'ferme-connecte.png');
  // Essai mêlé (roi à acheter, échiquier offert) : « Équiper ce que je possède » reste actif
  const second = page.locator('.cab .ta-second');
  assert.match(await second.innerText(), /Équiper ce que je possède/);
  assert.ok(!(await second.isDisabled()));
  // Sans le roi : l'essai ne contient que de l'offert, « Équiper » est le bouton principal
  await page.locator('.pb .slot', { hasText: 'Roi' }).locator('.slot-x').click();
  await page.waitForTimeout(300);
  const eq = page.locator('.cab .ta-main');
  assert.match(await eq.innerText(), /^Équiper$/i);
  assert.ok(!(await eq.isDisabled()));
  step('paiements fermés : « Bientôt en vente » désactivé, l’équipement reste actif');
  await ctx.close();
  const tel = await open(FERME, PHONE);
  await tel.page.waitForTimeout(1000);
  await shot(tel.page, 'tel-ferme.png');
  await tel.ctx.close();
} else {
  console.log('  (paiements fermés non capturés : --ferme=<BASE> manquant)');
}

// ---------------------------------------------------------------------------------------------
// Parcours démo complet : essai de 2 skins, « Acheter et équiper », retour, équipés, roi vu en partie

{
  const { ctx, page } = await open(BASE, DESK, null);
  await register(page, BASE, 'demo');
  await go(page, BASE + '/boutique?essai=king:astral');
  await page.waitForTimeout(800);
  const expected = await page.locator('.kp-k').first().evaluate(e => getComputedStyle(e).backgroundImage);
  await tab(page, 'Échiquiers');
  await tryCard(page, 'Palais de jade');
  await page.waitForTimeout(600);
  await shot(page, 'essai-2-skins.png');
  assert.match(await page.locator('.cab .ta-main').innerText(), /Acheter et équiper · 6,98/i);
  await page.locator('.cab .ta-main').click();
  await page.waitForSelector('.co-box');
  await page.waitForTimeout(700);
  await shot(page, 'recapitulatif.png');
  assert.ok(await page.locator('.co-equip input').isChecked(), '« Les équiper dès la livraison » coché d’office');
  assert.ok(!(await page.locator('.co-waiver input').isChecked()), 'renoncement jamais coché d’office');
  await page.locator('.co-waiver input').check();
  await page.locator('.co-pay').click();
  await page.waitForURL(/\/boutique\/demo\//);
  await page.waitForTimeout(800);
  await shot(page, 'caisse-demo.png');
  await page.locator('.co-actions .btn-primary').click();
  await page.waitForURL(u => new URL(u).pathname === '/boutique');
  await page.waitForTimeout(450);
  await shot(page, 'deballage.png');
  await page.waitForTimeout(1600);
  await shot(page, 'apres-achat.png');
  const me = (await api(page, '/me')).data.user;
  assert.equal(me.equippedKing, 'king:astral');
  assert.equal(me.equippedBoard, 'board:jade');
  assert.equal(await page.locator('.pb .slot.is-trying').count(), 0, 'l’essai est devenu la panoplie');
  step('parcours démo : achat de 2 skins, les deux sont équipés');

  const g = await api(page, '/games', { mode: 'bot', tc: 'none', color: 'w', level: 1 });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  await go(page, `${BASE}/partie/${g.data.id}`);
  await page.waitForTimeout(1500);
  const seen = await page.evaluate(() => {
    for (const el of document.querySelectorAll('.piece .pi')) {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg.includes('url(')) {
        const at = el.closest('.piece')?.getAttribute('data-at');
        if (at === '4') return bg; // e1 : roi blanc au départ
      }
    }
    return null;
  });
  assert.equal(seen, expected, 'le roi astral est sur l’échiquier de la partie');
  // Trois cartes choisies : l'échiquier de la partie apparaît, avec le roi et l'échiquier achetés
  const tiles = page.locator('button.cd-tile');
  for (let i = 0; i < 3; i++) await tiles.nth(i).click();
  await page.locator('.cd-validate').click();
  await page.getByRole('button', { name: /^Jouer$/i }).click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await shot(page, 'partie-roi.png');
  step('le roi acheté est vu en partie');
  await ctx.close();
}

await browser.close();
if (errors.length) {
  console.log('Erreurs de la console :');
  for (const e of [...new Set(errors)]) console.log('  ', e);
}
assert.deepEqual(errors, [], 'aucune erreur dans la console');
console.log(`Captures dans ${OUT}`);

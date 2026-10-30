// Partie en ligne entre deux navigateurs, sans compte : invitation depuis /jouer (A, ordinateur), arrivée de l'invité
// sur mobile (B), coups, carte lancée, émote, proposition de nulle, spectateur (C), abandon, fin de partie, revanche.
// Usage : node concepts/site-partie/scenarios/duel.cjs [http://localhost:3000] [dossier de sortie]
// WebGL est rendu en logiciel dans ce bac à sable : la scène 3D des sorts y met plusieurs secondes à se créer.
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = process.argv[3] ?? path.join(__dirname, '..');
const sqIdx = n => (n.charCodeAt(1) - 49) * 8 + (n.charCodeAt(0) - 97);
const logs = [];

async function open(browser, label, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', e => logs.push(`${label} pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error') logs.push(`${label} console: ${m.text()}`);
  });
  // Le serveur de développement recharge la page quand un autre agent modifie un module partagé : on le note
  page.on('framenavigated', f => {
    if (f === page.mainFrame()) console.log(`${label} → ${f.url()}`);
  });
  return page;
}

/** Remplit le pseudo et crée la partie ; recommence si un rechargement à chaud a vidé le formulaire. */
async function createInvite(page) {
  for (let i = 0; i < 6; i++) {
    await page.waitForSelector('#pl-pseudo', { timeout: 60000 });
    await page.fill('#pl-pseudo', 'Aurore');
    await page.locator('.pl-field [role="radio"]', { hasText: /^Blancs$/ }).click();
    await page.waitForTimeout(400);
    if (i === 0) await shot(page, '01-jouer-inviter');
    const cta = page.locator('.pl-cta');
    if (await cta.isEnabled()) {
      await cta.click();
      const ok = await page.waitForURL(/\/partie\//, { timeout: 20000 }).then(() => true, () => false);
      if (ok) return;
    }
    console.log('formulaire vidé (rechargement ?), nouvel essai');
    await page.waitForTimeout(1500);
  }
  throw new Error('Impossible de créer la partie');
}

async function shot(page, name) {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, timeout: 60000 }).catch(e => console.log('capture ratée', name, e.message));
  console.log('capture :', file);
}

/** Attend que la scène 3D existe et que le fil principal réponde. */
async function calm(page, max = 60000) {
  return page.evaluate(async max => {
    const t0 = performance.now();
    const pause = ms => new Promise(r => setTimeout(r, ms));
    while (performance.now() - t0 < max) {
      const a = performance.now();
      await pause(150);
      if (document.querySelector('canvas.vfx-canvas') && performance.now() - a < 350) {
        await pause(400);
        return 'calme après ' + Math.round((performance.now() - t0) / 1000) + ' s';
      }
    }
    return 'délai dépassé (scène 3D absente ?)';
  }, max);
}

const title = page => page.locator('.gs-title').first().textContent({ timeout: 30000 });

async function move(page, from, to) {
  await page.locator(`.sq[data-sq="${sqIdx(from)}"]`).first().click({ timeout: 15000 });
  await page.waitForTimeout(250);
  await page.locator(`.sq[data-sq="${sqIdx(to)}"]`).first().click({ timeout: 15000 });
  await page.waitForTimeout(700);
}

async function waitTurn(page, max = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    if (/À vous de jouer|Échec au roi/.test(await title(page))) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

/** Joue le premier coup possible de la liste ; vérifie que le trait passe. */
async function playOne(page, list) {
  if (!(await waitTurn(page))) return 'pas le trait : ' + (await title(page));
  for (const [a, b] of list) {
    const before = await title(page);
    await move(page, a, b);
    const after = await title(page);
    if (after !== before && !/À vous de jouer|Échec au roi/.test(after)) return `${a}-${b}`;
  }
  return null;
}

/** Choisit une carte jouable et la lance (cibles comprises). Renvoie son nom. */
async function castFirst(page, onPicked) {
  const cards = page.locator('.gs-fan .spell-card:not(.disabled):not(.used)');
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    await cards.nth(i).click({ timeout: 10000 });
    await page.waitForTimeout(500);
    const prompt = page.locator('.gs-prompt');
    if (!(await prompt.count())) continue;
    const name = await page.locator('.gs-prompt .gs-spell').textContent();
    if (onPicked) await onPicked(name);
    const castBtn = page.locator('.gs-prompt .btn-gold');
    if (await castBtn.count()) {
      await castBtn.click();
      return name;
    }
    for (let k = 0; k < 3 && (await page.locator('.gs-prompt').count()); k++) {
      const t = page.locator('.sq.target');
      if (!(await t.count())) break;
      await t.first().click();
      await page.waitForTimeout(350);
    }
    if (!(await page.locator('.gs-prompt').count())) return name;
    await page.locator('.gs-prompt .btn-line').click();
  }
  return null;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const A = await open(browser, 'A', { viewport: { width: 1440, height: 900 } });
  const B = await open(browser, 'B', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  // A : page Jouer, « Défier un ami », Blancs, cartes Climats, 10 + 0
  await A.goto(`${BASE}/jouer?mode=invite`, { waitUntil: 'networkidle' });
  await createInvite(A);
  const url = A.url();
  console.log('partie :', url);
  await A.waitForTimeout(1800);
  await shot(A, '02-attente-lien');

  // B : arrive par le lien, sur mobile, sans compte
  await B.goto(url, { waitUntil: 'networkidle' });
  await B.waitForTimeout(1500);
  await shot(B, '03-mobile-invitation');
  await B.fill('#gp-guest-name', 'Basile');
  await B.click('.gp-join-btn');
  await B.waitForTimeout(2500);
  await shot(B, '04-mobile-partie-noirs');
  await A.waitForTimeout(800);
  await shot(A, '05-partie-commencee');

  // Ouverture
  console.log('A :', await playOne(A, [['e2', 'e4']]));
  console.log('B :', await playOne(B, [['e7', 'e5']]));
  console.log('A :', await playOne(A, [['g1', 'f3']]));
  console.log('B :', await playOne(B, [['b8', 'c6']]));
  console.log('A', await calm(A), '· B', await calm(B));

  // A lance une carte ; B la voit arriver
  const card = await castFirst(A, async () => {
    await shot(A, '06-carte-choisie');
  });
  console.log('carte lancée par A :', card);
  await A.waitForTimeout(900);
  await shot(A, '07-sort-lance');
  await shot(B, '08-mobile-sort-adverse');
  await A.waitForTimeout(5200);
  await shot(A, '09-sort-applique');
  // Si la carte n'a pas remplacé le coup, A joue encore
  if (/À vous de jouer|Échec au roi/.test(await title(A))) {
    console.log('A (après sort) :', await playOne(A, [['d2', 'd3'], ['b1', 'c3'], ['h2', 'h3'], ['a2', 'a3'], ['f1', 'c4']]));
  }
  await B.waitForTimeout(1500);
  await shot(B, '10-mobile-effets');

  // B : une carte choisie sur mobile (puis annulée), un coup, une émote
  if (/À vous de jouer|Échec au roi/.test(await title(B))) {
    const cards = B.locator('.gs-fan .spell-card:not(.disabled):not(.used)');
    if (await cards.count()) {
      await cards.first().click();
      await B.waitForTimeout(600);
      await shot(B, '11-mobile-carte-choisie');
      if (await B.locator('.gs-prompt .btn-line').count()) await B.locator('.gs-prompt .btn-line').click();
      await B.waitForTimeout(300);
    }
    console.log('B :', await playOne(B, [['d7', 'd6'], ['g8', 'f6'], ['h7', 'h6'], ['a7', 'a6'], ['f8', 'c5']]));
  }
  await B.locator('.gp-emote-btn').click();
  await B.waitForTimeout(300);
  await B.locator('.gp-emote-menu button').first().click();
  await A.waitForTimeout(700);
  await shot(A, '12-emote-recue');

  // A propose la nulle ; B la voit et refuse
  await A.locator('.gs-quiet', { hasText: 'Proposer la nulle' }).click();
  await B.waitForTimeout(1200);
  await shot(B, '13-mobile-nulle-proposee');
  await B.locator('.gp-offer button', { hasText: 'Refuser' }).click();
  await A.waitForTimeout(800);

  // C : spectateur
  const C = await open(browser, 'C', { viewport: { width: 1280, height: 720 } });
  await C.goto(url, { waitUntil: 'networkidle' });
  await C.waitForTimeout(2500);
  await shot(C, '14-spectateur');

  // A abandonne (double clic de confirmation)
  await A.locator('.gs-quiet', { hasText: 'Abandonner' }).click();
  await A.waitForTimeout(250);
  await A.locator('.gs-quiet', { hasText: "Confirmer l'abandon" }).click();
  await A.waitForTimeout(2200);
  await shot(A, '15-fin-defaite');
  await shot(B, '16-mobile-fin-victoire');
  await shot(C, '17-spectateur-fin');

  // Revanche : B la propose, A l'accepte, tout le monde part vers la nouvelle partie
  await B.locator('.gp-end .btn-gold').click();
  await A.waitForTimeout(1200);
  await shot(A, '18-revanche-proposee');
  await A.locator('.gp-end .btn-gold', { hasText: 'Accepter la revanche' }).click();
  await A.waitForURL(u => u.toString() !== url, { timeout: 15000 }).catch(() => {});
  await A.waitForTimeout(2000);
  console.log('revanche :', A.url(), B.url());
  await shot(A, '19-revanche');

  console.log(logs.length ? logs.slice(0, 30).join('\n') : 'aucune erreur console');
  await browser.close();
})().catch(async e => {
  console.error(e);
  console.log(logs.slice(0, 30).join('\n'));
  process.exit(1);
});

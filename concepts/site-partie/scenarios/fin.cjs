// Fin de partie par mat entre deux invités (invitation sans compte), avec un Présage annoncé en cours de route :
// A (ordinateur 1280 × 720, Blancs) crée l'invitation, B (mobile, Noirs) la rejoint ; 1. f3 e5 2. g4 Dh4#.
// A lance un Présage avant 2. g4 s'il en a un (sinon B avant 2… Dh4#) : l'effet annoncé s'affiche des deux côtés.
// À la fin : bilan des deux côtés, puis « Mes parties » des invités (rememberView, liste du navigateur).
// Usage : node concepts/site-partie/scenarios/fin.cjs [http://localhost:3000] [dossier de sortie]
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = process.argv[3] ?? path.join(__dirname, '..');
const sqIdx = n => (n.charCodeAt(1) - 49) * 8 + (n.charCodeAt(0) - 97);
const PRESAGES = ['Sablier fou', 'Trêve', 'Lune de sang', 'Ère glaciaire', 'Déflagration'];
const logs = [];

async function open(browser, label, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', e => logs.push(`${label} pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error') logs.push(`${label} console: ${m.text()}`);
  });
  page.on('framenavigated', f => {
    if (f === page.mainFrame()) console.log(`${label} → ${f.url()}`);
  });
  return page;
}

async function shot(page, name, fullPage = false) {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, fullPage, timeout: 60000 }).catch(e => console.log('capture ratée', name, e.message));
  console.log('capture :', file);
}

/** Attend que la scène 3D existe et que le fil principal réponde (sa création fige la page dans le bac à sable). */
async function calm(page, max = 35000) {
  return page.evaluate(async max => {
    const t0 = performance.now();
    const pause = ms => new Promise(r => setTimeout(r, ms));
    while (performance.now() - t0 < max) {
      const a = performance.now();
      await pause(150);
      if (document.querySelector('canvas.vfx-canvas') && performance.now() - a < 350) return 'calme après ' + Math.round((performance.now() - t0) / 1000) + ' s';
    }
    return 'délai dépassé';
  }, max);
}

const title = page => page.locator('.gs-title').first().textContent({ timeout: 30000 });

async function waitTurn(page, max = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    if (/À vous de jouer|Échec au roi/.test(await title(page))) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

async function move(page, from, to) {
  if (!(await waitTurn(page))) throw new Error('pas le trait : ' + (await title(page)));
  // Délais longs : la création de la scène 3D (WebGL logiciel du bac à sable) fige la page plusieurs secondes
  await page.locator(`.sq[data-sq="${sqIdx(from)}"]`).first().click({ timeout: 40000 });
  await page.waitForTimeout(250);
  await page.locator(`.sq[data-sq="${sqIdx(to)}"]`).first().click({ timeout: 40000 });
  await page.waitForTimeout(800);
}

/** Lance le premier Présage jouable de la main ; renvoie son nom (ou null). */
async function castPresage(page) {
  if (!(await waitTurn(page))) return null;
  const cards = page.locator('.gs-fan .spell-card:not(.disabled):not(.used)');
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    await cards.nth(i).click({ timeout: 10000 });
    await page.waitForTimeout(500);
    if (!(await page.locator('.gs-prompt').count())) continue;
    const name = ((await page.locator('.gs-prompt .gs-spell').textContent()) ?? '').trim();
    if (PRESAGES.includes(name) && (await page.locator('.gs-prompt .btn-gold').count())) {
      await page.locator('.gs-prompt .btn-gold').click();
      return name;
    }
    await page.locator('.gs-prompt .btn-line').click();
    await page.waitForTimeout(250);
  }
  return null;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const A = await open(browser, 'A', { viewport: { width: 1280, height: 720 } });
  const B = await open(browser, 'B', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  // A : invitation, Blancs, Pouvoirs, 10 + 0 (réessaie si un rechargement à chaud vide le formulaire)
  await A.goto(`${BASE}/jouer?mode=invite`, { waitUntil: 'networkidle' });
  for (let i = 0; i < 6 && !/\/partie\//.test(A.url()); i++) {
    await A.waitForSelector('#pl-pseudo', { timeout: 60000 });
    await A.fill('#pl-pseudo', 'Hélène');
    await A.locator('.pl-field [role="radio"]', { hasText: /^Blancs$/ }).click();
    await A.locator('.pl-cta').click();
    await A.waitForURL(/\/partie\//, { timeout: 20000 }).catch(() => {});
  }
  const url = A.url();
  console.log('partie :', url);
  await B.goto(url, { waitUntil: 'networkidle' });
  await B.waitForSelector('#gp-guest-name', { timeout: 30000 });
  await B.fill('#gp-guest-name', 'Ulysse');
  await B.click('.gp-join-btn');
  // Premier coup de chaque camp avant 45 s : on laisse d'abord les deux scènes 3D se créer
  console.log('A', ...(await Promise.all([calm(A), calm(B)])).map((x, i) => `${i ? '· B' : ''} ${x}`));

  await move(A, 'f2', 'f3');
  await move(B, 'e7', 'e5');
  let caster = null;
  let card = await castPresage(A);
  if (card) {
    caster = 'A';
    await A.waitForTimeout(6000); // animation du sort (ou garde-fou castSafely, 4,2 s)
    await shot(A, '40-presage-annonce');
  }
  await move(A, 'g2', 'g4');
  if (!card) {
    card = await castPresage(B);
    if (card) caster = 'B';
    await B.waitForTimeout(6000);
    await shot(A, '40-presage-annonce');
  }
  console.log('Présage :', card ?? 'aucun dans les mains', caster ? `(lancé par ${caster})` : '');
  await B.waitForTimeout(800);
  await shot(B, '41-mobile-presage-annonce');
  console.log('effets (A) :', (await A.locator('.gp-effects li').allTextContents()).join(' | '));
  console.log('effets (B) :', (await B.locator('.gp-effects li').allTextContents()).join(' | '));

  await move(B, 'd8', 'h4');
  await A.waitForTimeout(2500);
  console.log('titres :', await title(A), '/', await title(B));
  await shot(A, '42-fin-mat-defaite');
  await shot(B, '43-mobile-fin-mat-victoire');

  // « Mes parties » des invités : liste du navigateur (features/history, clé sm:parties)
  const id = url.split('/').pop();
  for (const [label, page] of [['A', A], ['B', B]]) {
    const list = await page.evaluate(() => JSON.parse(localStorage.getItem('sm:parties') || '[]'));
    const g = list.find(x => x.id === id);
    console.log(`Mes parties (${label}) :`, g ? `${g.white} – ${g.black}, vainqueur ${g.winner}, ${g.reason}, ${g.plies} demi-coups, ${g.catalog}` : 'ABSENTE');
  }
  await B.locator('.gp-end .btn-line', { hasText: "Voir l'échiquier" }).click().catch(() => {});
  await B.waitForTimeout(600);
  await shot(B, '44-mobile-fin-echiquier');
  await A.goto(`${BASE}/parties`, { waitUntil: 'networkidle' });
  await A.waitForTimeout(1200);
  await shot(A, '45-mes-parties-invite');

  console.log(logs.length ? logs.slice(0, 30).join('\n') : 'aucune erreur console');
  await browser.close();
})().catch(async e => {
  console.error(e);
  console.log(logs.slice(0, 30).join('\n'));
  process.exit(1);
});

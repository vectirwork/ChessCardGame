// Glisser-déposer à la souris, plusieurs fois de suite, sur les échiquiers du site (décision D4) :
//   node test/glisser.mjs [http://localhost:3000]
//
// Défaut corrigé (recette V2) : chaque glisser sélectionnait le texte des coordonnées de l'échiquier ; dès le troisième
// glisser de suite, le navigateur partait de cette sélection pour un glisser-déposer natif (dragstart puis
// pointercancel) et la pièce revenait sans rien dire. Ce script enchaîne cinq glissers sans aucun clic entre deux, sur
// une partie en ligne contre l'IA (sans cartes, sans pendule), sur l'accueil (partie en plein écran) et sur /analyse,
// et vérifie que chaque coup est joué, sans sélection de texte ni dragstart. Navigateur Chromium (Playwright).
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

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

const BASE = process.argv[2] ?? 'http://localhost:3000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SQ = n => (Number(n[1]) - 1) * 8 + 'abcdefgh'.indexOf(n[0]);
const LINE = [['e2', 'e4'], ['g1', 'f3'], ['f1', 'c4'], ['b1', 'c3'], ['d2', 'd3']];

async function center(page, sq) {
  const b = await page.locator(`.board .sq[data-sq="${sq}"]`).first().boundingBox();
  if (!b) throw new Error(`case ${sq} introuvable`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function myTurn(page, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const t = (await page.locator('.gs-title').first().textContent().catch(() => '')) ?? '';
    if (/À vous de jouer|Échec au roi/.test(t)) return true;
    await sleep(200);
  }
  return false;
}

/** Glisse la pièce de `from` à `to`, à la souris, par petits pas ; renvoie vrai si elle est arrivée. */
async function drag(page, from, to) {
  const a = await center(page, SQ(from));
  const b = await center(page, SQ(to));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12);
    await sleep(16);
  }
  await page.mouse.up();
  await sleep(900);
  return (await page.locator(`.board .piece[data-at="${SQ(to)}"]`).count()) > 0;
}

async function sequence(page, label, line, { waitTurn }) {
  await page.evaluate(() => {
    window.__natif = 0;
    document.addEventListener('dragstart', () => window.__natif++, true);
  });
  for (const [from, to] of line) {
    if (waitTurn) assert.ok(await myTurn(page), `${label} : le tour ne revient pas avant ${from}-${to}`);
    await sleep(300);
    assert.ok(await drag(page, from, to), `${label} : ${from}-${to} refusé au glisser`);
    const selection = await page.evaluate(() => String(window.getSelection()).trim());
    assert.equal(selection, '', `${label} : du texte est sélectionné après ${from}-${to} (« ${selection} »)`);
  }
  assert.equal(await page.evaluate(() => window.__natif), 0, `${label} : glisser-déposer natif déclenché`);
  console.log(`OK   ${label} : ${line.length} glissers de suite`);
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'fr-FR' });

  // 1. Partie en ligne contre l'IA, sans cartes (pas de choix des cartes), sans pendule
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/jouer?mode=bot`, { waitUntil: 'load' });
    await page.fill('#pl-pseudo', 'Glisseur');
    await page.locator('.pl-cat', { hasText: 'Sans cartes' }).click();
    await page.locator('.segmented button', { hasText: 'Sans limite' }).click();
    await page.locator('.segmented button', { hasText: 'Blancs' }).click();
    await page.locator('.pl-cta').click();
    await page.waitForURL(/\/partie\//);
    await sequence(page, 'partie contre l’IA', LINE, { waitTurn: true });
    await page.close();
  }

  // 2. Accueil : la partie en plein écran (on ouvre puis referme la bulle de la première carte)
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await sleep(3000);
    await page.locator('.o-hand-mini .spell-card').first().click();
    await page.waitForSelector('.gs-fan-card');
    await sleep(2500);
    await page.keyboard.press('Escape');
    await sleep(400);
    await sequence(page, 'accueil', LINE, { waitTurn: true });
    await page.close();
  }

  // 3. Analyse : les deux camps se jouent à la main
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/analyse`, { waitUntil: 'load' });
    await page.waitForSelector('.board .sq');
    await sleep(800);
    await sequence(page, '/analyse', [['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5'], ['d8', 'd5'], ['b1', 'c3']], { waitTurn: false });
    await page.close();
  }
  console.log('Glisser-déposer : aucun problème relevé.');
} finally {
  await browser.close();
}

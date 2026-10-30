// Page Jouer (/jouer) : quatre portes sur ordinateur et sur mobile, puis la file amicale ouverte aux invités (deux
// visiteurs sans compte appariés sur la même /partie/:id, badge « Partie amicale »), et une partie contre l'IA en
// 1280 × 720 (panneau de statut le plus court).
// Usage : node concepts/site-partie/scenarios/jouer.cjs [http://localhost:3000] [dossier de sortie]
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = process.argv[3] ?? path.join(__dirname, '..');
const logs = [];

async function open(browser, label, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', e => logs.push(`${label} pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error') logs.push(`${label} console: ${m.text()}`);
  });
  return page;
}

async function shot(page, name, fullPage = false) {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, fullPage, timeout: 60000 }).catch(e => console.log('capture ratée', name, e.message));
  console.log('capture :', file);
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const D = await open(browser, 'D', { viewport: { width: 1440, height: 900 } });
  await D.goto(`${BASE}/jouer`, { waitUntil: 'networkidle' });
  await D.waitForTimeout(1200);
  await shot(D, '30-jouer-ia');
  await D.locator('.pl-door', { hasText: 'Partie amicale' }).click();
  await D.waitForTimeout(500);
  await shot(D, '31-jouer-amicale');
  await D.locator('.pl-door', { hasText: 'Partie classée' }).click();
  await D.waitForTimeout(500);
  await shot(D, '32-jouer-classee-sans-compte');

  const M = await open(browser, 'M', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await M.goto(`${BASE}/jouer?mode=invite`, { waitUntil: 'networkidle' });
  await M.waitForTimeout(1200);
  await shot(M, '33-mobile-jouer', true);

  // File amicale : deux invités, même cadence et mêmes cartes
  await D.locator('.pl-door', { hasText: 'Partie amicale' }).click();
  await D.fill('#pl-pseudo', 'Céleste');
  await D.locator('.pl-cta').click();
  await D.waitForTimeout(1500);
  await shot(D, '34-file-amicale-attente');
  await M.goto(`${BASE}/jouer?mode=friendly`, { waitUntil: 'networkidle' });
  await M.fill('#pl-pseudo', 'Dorian');
  await M.locator('.pl-cta').click();
  await D.waitForURL(/\/partie\//, { timeout: 20000 }).catch(() => {});
  await M.waitForURL(/\/partie\//, { timeout: 20000 }).catch(() => {});
  console.log('appariés :', D.url(), M.url(), D.url() === M.url() ? '(même partie)' : '(DIFFÉRENTES)');
  await D.waitForTimeout(2500);
  console.log('badge :', await D.locator('.gs-badge').textContent().catch(() => '?'));
  await shot(D, '35-amicale-appariee');
  await shot(M, '36-mobile-amicale-appariee');
  // Fin propre : annulation (aucun coup joué)
  await D.locator('.gs-quiet', { hasText: 'Annuler la partie' }).click().catch(() => {});
  await D.locator('.gs-quiet', { hasText: "Confirmer l'annulation" }).click().catch(() => {});
  await D.waitForTimeout(1500);
  await shot(D, '37-amicale-annulee');

  // Partie contre l'IA en 1280 × 720
  const S = await open(browser, 'S', { viewport: { width: 1280, height: 720 } });
  await S.goto(`${BASE}/jouer?mode=bot`, { waitUntil: 'networkidle' });
  await S.fill('#pl-pseudo', 'Élise');
  await S.locator('.pl-cta').click();
  await S.waitForURL(/\/partie\//, { timeout: 20000 }).catch(() => {});
  // Attendre la scène 3D (WebGL logiciel du bac à sable : elle fige la page quelques secondes à sa création)
  console.log('S', await S.evaluate(async () => {
    const t0 = performance.now();
    const pause = ms => new Promise(r => setTimeout(r, ms));
    while (performance.now() - t0 < 60000) {
      const a = performance.now();
      await pause(150);
      if (document.querySelector('canvas.vfx-canvas') && performance.now() - a < 350) return 'calme';
    }
    return 'délai dépassé';
  }));
  await S.waitForTimeout(1500);
  await shot(S, '38-ia-1280x720');

  console.log(logs.length ? logs.slice(0, 30).join('\n') : 'aucune erreur console');
  await browser.close();
})().catch(e => {
  console.error(e);
  console.log(logs.slice(0, 30).join('\n'));
  process.exit(1);
});

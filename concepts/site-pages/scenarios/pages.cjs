// Captures des pages secondaires (bureau et mobile), avec un compte de test créé à la volée.
// Usage : node concepts/site-pages/scenarios/pages.cjs [base=http://localhost:3000] [outDir] [filtre,de,pages]
// Rien n'est acheté sur le serveur de base sauf le scénario « achat » (mode démo).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = process.argv[3] || path.join(__dirname, '..');
const ONLY = (process.argv[4] || '').split(',').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });

const want = k => !ONLY.length || ONLY.includes(k);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const logs = [];
  const mk = async (vp, dpr = 1) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    page.on('pageerror', e => logs.push(`[${vp.width}] pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') logs.push(`[${vp.width}] console: ${m.text()}`); });
    return { ctx, page };
  };
  const shot = async (page, name, full = false) => {
    const f = path.join(OUT, name + '.png');
    await page.screenshot({ path: f, fullPage: full });
    console.log('capture :', f);
  };
  const go = async (page, url, wait = 1200) => {
    await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(wait);
  };

  for (const [tag, vp, dpr] of [['bureau', { width: 1440, height: 900 }, 1], ['mobile', { width: 390, height: 844 }, 2]]) {
    const { ctx, page } = await mk(vp, dpr);
    const P = s => `${tag}-${s}`;
    if (want('boutique')) { await go(page, '/boutique', 2500); await shot(page, P('boutique'), true); }
    if (want('connexion')) { await go(page, '/connexion'); await shot(page, P('connexion')); }
    if (want('inscription')) { await go(page, '/inscription'); await shot(page, P('inscription')); }
    if (want('oubli')) { await go(page, '/mot-de-passe-oublie'); await shot(page, P('oubli')); }
    if (want('classement')) { await go(page, '/classement'); await shot(page, P('classement'), true); }
    if (want('legal')) { await go(page, '/cgv'); await shot(page, P('cgv')); }
    if (want('404')) { await go(page, '/nulle-part'); await shot(page, P('404')); }
    if (want('compte') || want('profil') || want('achat')) {
      const u = 'pg' + Date.now().toString(36).slice(-6) + tag[0];
      await go(page, '/inscription');
      await page.fill('#email', `${u}@exemple.fr`);
      await page.fill('#username', u);
      await page.fill('#password', 'motdepasse-solide-1');
      await page.check('input[type=checkbox]');
      await page.click('button.btn-primary');
      await page.waitForTimeout(1500);
      if (want('compte')) {
        await go(page, '/compte');
        await shot(page, P('compte-profil'));
        for (const [label, n] of [['Collection', 'compte-collection'], ['Achats', 'compte-achats'], ['Mes données', 'compte-donnees']]) {
          await page.getByRole('button', { name: label, exact: true }).first().click().catch(() => {});
          await page.waitForTimeout(700);
          await shot(page, P(n), true);
        }
      }
      if (want('profil')) { await go(page, `/joueur/${u}`); await shot(page, P('profil'), true); }
      if (want('achat')) { await go(page, '/boutique', 2500); await shot(page, P('boutique-connecte'), true); }
    }
    await ctx.close();
  }
  console.log(logs.length ? logs.slice(0, 30).join('\n') : 'aucune erreur console');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

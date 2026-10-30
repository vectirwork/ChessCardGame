// Captures des pages secondaires (bureau 1440×900 et mobile 390×844), avec un compte de test créé à la volée.
// Usage : node concepts/site-pages/scenarios/pages.cjs [base=http://localhost:3000] [outDir] [filtre,de,parcours] [bureau|mobile]
// Parcours : seuil, compte, achat, profil, classement, admin, legal, 404, fonctions.
// Classement, profil rempli et administration utilisent des réponses d'API simulées dans le navigateur (page.route) :
// le serveur n'est pas modifié. Le parcours « achat » fait un achat en mode démo pour le compte de test.
// Une capture à la fois : le WebGL logiciel du bac à sable ne supporte pas deux navigateurs en parallèle.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = process.argv[3] || path.join(__dirname, '..');
const ONLY = (process.argv[4] || '').split(',').filter(Boolean);
const SIZES = (process.argv[5] || 'bureau,mobile').split(',');
fs.mkdirSync(OUT, { recursive: true });
const want = k => !ONLY.length || ONLY.includes(k);

const NAMES = ['Morgane', 'Aldric', 'Sélène', 'Ysolde', 'Corvin', 'Elric', 'Isaure', 'Tancrède', 'Mélusine', 'Gauvain'];
const fakeBoard = NAMES.map((n, i) => ({ username: n, rating: 1912 - i * 47 - (i > 2 ? 30 : 0), games_played: 140 - i * 11, wins: 90 - i * 8, losses: 30 + i, draws: 20 - i }));
const fakeProfile = {
  profile: { username: 'Morgane', rating: 1912, gamesPlayed: 140, wins: 90, losses: 30, draws: 20, skin: 'skin:celestial', memberSince: '2026-03-02T10:00:00Z', rank: 1 },
  games: Array.from({ length: 6 }, (_, i) => ({
    id: 'demo' + i,
    white: i % 2 ? NAMES[i + 1] : 'Morgane',
    black: i % 2 ? 'Morgane' : NAMES[i + 1],
    winner: ['w', 'w', 'draw', 'b', 'b', 'w'][i],
    reason: ['checkmate', 'resign', 'agreement', 'timeout', 'checkmate', 'resign'][i],
    timeControl: ['5+0', '10+0', '3+2', '10+0', '5+0', '15+10'][i],
    rated: i !== 2,
    plies: 40 + i * 9,
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
  })),
};
const fakeAdmin = {
  counts: { revenue: 184230, revenue_30d: 41250, sales: 512, buyers: 318, users: 4210, users_7d: 168, active_24h: 392 },
  live: { active: 37, waiting: 4 },
  daily: Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, revenue: Math.round(800 + 900 * Math.abs(Math.sin(i * 0.7)) + i * 40), signups: Math.round(3 + 6 * Math.abs(Math.cos(i * 0.5)) + i / 4) })),
  products: [
    { product_id: 'pack:all', sales: 120, revenue: 155880 },
    { product_id: 'skin:inferno', sales: 96, revenue: 28704 },
    { product_id: 'skin:void', sales: 71, revenue: 28329 },
  ],
  recent: Array.from({ length: 5 }, (_, i) => ({ id: i, created_at: new Date().toISOString(), username: NAMES[i], product_id: ['pack:all', 'skin:inferno', 'board:jade', 'skin:void', 'pack:skins'][i], amount_cents: [1299, 299, 199, 399, 999][i], status: 'paid' })),
};
const fakeUsers = { users: NAMES.slice(0, 5).map((n, i) => ({ id: 'u' + i, username: n, email: `${n.toLowerCase()}@exemple.fr`, email_verified: i !== 3, rating: 1900 - i * 60, created_at: '2026-09-01T10:00:00Z', is_admin: i === 0, items: i % 2 ? ['skin:inferno'] : [] })) };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const logs = [];
  const shot = async (page, name, full = false) => {
    const f = path.join(OUT, name + '.png');
    for (let k = 0; k < 3; k++) {
      try {
        await page.screenshot({ path: f, fullPage: full, timeout: 60000, animations: k ? 'disabled' : 'allow' });
        console.log('capture :', f);
        return;
      } catch (e) {
        console.log(`capture ${name} : nouvel essai (${e.message.split('\n')[0]})`);
      }
    }
  };
  const go = async (page, url, wait = 1200) => {
    await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(wait);
  };
  const sizes = [
    ['bureau', { width: 1440, height: 900 }, 1],
    ['mobile', { width: 390, height: 844 }, 2],
  ].filter(([t]) => SIZES.includes(t));

  for (const [tag, vp, dpr] of sizes) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    page.on('pageerror', e => logs.push(`[${tag}] pageerror: ${e.message}`));
    page.on('console', m => {
      if (m.type() === 'error') logs.push(`[${tag}] console: ${m.text()}`);
    });
    const P = s => `${tag}-${s}`;

    if (want('seuil')) {
      await go(page, '/connexion');
      await shot(page, P('connexion'));
      await go(page, '/inscription');
      await shot(page, P('inscription'));
      await go(page, '/mot-de-passe-oublie');
      await shot(page, P('oubli'));
    }
    if (want('legal')) {
      await go(page, '/cgv');
      await shot(page, P('cgv'));
      if (tag === 'bureau') {
        await go(page, '/mentions-legales');
        await shot(page, P('mentions'));
      }
    }
    if (want('404')) {
      await go(page, '/nulle-part');
      await shot(page, P('404'));
    }
    if (want('classement')) {
      await go(page, '/classement');
      await shot(page, P('classement-vide'));
      await page.route('**/api/leaderboard', r => r.fulfill({ json: { players: fakeBoard } }));
      await go(page, '/classement');
      await shot(page, P('classement-podium'), true);
      await page.unroute('**/api/leaderboard');
    }
    if (want('profil')) {
      await page.route('**/api/users/Morgane', r => r.fulfill({ json: fakeProfile }));
      await go(page, '/joueur/Morgane');
      await shot(page, P('profil-rempli'), true);
      await page.unroute('**/api/users/Morgane');
      await go(page, '/joueur/personne-zz');
      await shot(page, P('profil-introuvable'));
    }
    if (want('fonctions')) {
      for (const [url, n] of [
        ['/apprendre', 'fonctions-apprendre'],
        ['/problemes', 'fonctions-problemes'],
        ['/analyse', 'fonctions-analyse'],
        ['/parties', 'fonctions-parties'],
        ['/direct', 'fonctions-direct'],
      ]) {
        await go(page, url, 1800);
        await shot(page, P(n));
      }
    }
    if (want('compte') || want('achat') || want('admin')) {
      const u = 'pg' + Date.now().toString(36).slice(-6) + tag[0];
      await go(page, '/inscription');
      await page.fill('#email', `${u}@exemple.fr`);
      await page.fill('#username', u);
      await page.fill('#password', 'motdepasse-solide-1');
      await page.check('input[type=checkbox]');
      await page.click('form button.btn-primary');
      await page.waitForTimeout(1500);
      if (want('compte')) {
        await go(page, '/compte');
        await shot(page, P('compte-profil'));
        for (const [label, n] of [
          ['Sécurité', 'compte-securite'],
          ['Achats', 'compte-achats'],
          ['Mes données', 'compte-donnees'],
        ]) {
          await page.getByRole('tab', { name: label, exact: true }).click();
          await page.waitForTimeout(700);
          await shot(page, P(n), tag === 'mobile');
        }
      }
      if (want('achat')) {
        // Récapitulatif depuis la fiche, puis caisse simulée, puis équipement
        await go(page, '/boutique?objet=skin:void', 800);
        await page.click('.bz-fiche .btn-gold');
        await page.waitForTimeout(700);
        await shot(page, P('boutique-recapitulatif'));
        await page.check('.bz-co-waiver input');
        await page.click('.bz-co-pay');
        await page.waitForURL('**/boutique/demo/**', { timeout: 60000 });
        await page.waitForTimeout(1000);
        await shot(page, P('caisse-demo'));
        await page.click('.co-actions .btn-primary');
        await page.waitForURL('**/boutique?objet=skin:void', { timeout: 60000 });
        await page.waitForTimeout(1200);
        await shot(page, P('boutique-achete'));
        await page.click('.bz-fiche .btn-gold');
        await page.waitForTimeout(1200);
        await shot(page, P('boutique-equipe'));
        console.log('fiche :', await page.locator('.bz-fiche-side').innerText());
        await go(page, '/compte?onglet=collection');
        await shot(page, P('compte-collection'), true);
        await go(page, '/compte?onglet=achats');
        await shot(page, P('compte-achats-1'));
      }
      if (want('admin')) {
        const me = await page.evaluate(() => fetch('/api/me').then(r => r.json()));
        await page.route('**/api/me', r => r.fulfill({ json: { ...me, user: { ...me.user, isAdmin: true } } }));
        await page.route('**/api/admin/overview', r => r.fulfill({ json: fakeAdmin }));
        await page.route('**/api/admin/users**', r => r.fulfill({ json: fakeUsers }));
        await go(page, '/admin');
        await shot(page, P('admin'), true);
        await page.unrouteAll();
      }
    }
    await ctx.close();
  }
  console.log(logs.length ? logs.slice(0, 30).join('\n') : 'aucune erreur console');
  await browser.close();
})().catch(e => {
  console.error(e);
  process.exit(1);
});

// Captures du banc d'essai des effets : node shots.cjs <outDir> [cartes...]
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:3000/test/vfx.html';
const out = process.argv[2];
const only = process.argv.slice(3);
fs.mkdirSync(out, { recursive: true });
const CASTS = [
  // carte, cibles, skin, instants (s) à capturer
  ['hourglass', [], 'skin:arcane', [0.7, 1.35]],
  ['truce', [], 'skin:celestial', [0.6, 1.2]],
  ['blood_moon', [], 'skin:void', [0.75, 1.3]],
  ['ice_age', [], 'skin:arcane', [0.7, 1.25]],
  ['blast', [], 'skin:inferno', [0.8, 1.15]],
  ['ice_wall', ['e5'], 'skin:arcane', [0.6, 1.2]],
  ['rift', ['a5'], 'skin:void', [0.6, 1.2]],
  ['tide', [], 'skin:sakura', [0.75, 1.3]],
  ['lightning', ['d5'], 'skin:neon', [0.95], '?catalog=duel'],
];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 860, height: 860 } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  if (!only.length || only.includes('cards')) {
    const g = await browser.newPage({ viewport: { width: 1900, height: 1200 } });
    g.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await g.goto(BASE + '?cards', { waitUntil: 'networkidle' });
    await g.waitForTimeout(800);
    await g.screenshot({ path: path.join(out, '00-cartes.png'), fullPage: true });
    await g.setViewportSize({ width: 380, height: 700 });
    await g.waitForTimeout(300);
    const box = await g.evaluate(() => {
      const a = document.querySelectorAll('.spell-chip');
      const r0 = a[0].getBoundingClientRect(), r1 = a[a.length - 1].getBoundingClientRect();
      return { x: 0, y: r0.top + scrollY - 10, width: 380, height: r1.bottom - r0.top + 20 };
    });
    await g.screenshot({ path: path.join(out, '00-cartes-mobile.png'), fullPage: true, clip: box });
    await g.close();
  }
  const step = async ms => page.evaluate(ms => window.__step(ms), ms);
  if (!only.length || only.includes('inconnue')) {
    // Carte inconnue : cas par défaut, impact et fin garantis, plateau remis à plat
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
    await page.evaluate(() => window.rawCast('carte_inconnue', ['e4']));
    for (let i = 0; i < 90; i++) await step(40);
    console.log('inconnue :', JSON.stringify(await page.evaluate(() => [window.rawImpact, window.rawDone, getComputedStyle(document.querySelector('.board-wrap')).getPropertyValue('--tilt')])));
  }
  for (const [card, targets, skin, times, query] of CASTS) {
    if (only.length && !only.includes(card)) continue;
    await page.goto(BASE + (query || ''), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
    for (let i = 0; i < 3; i++) await step(16);
    const r = await page.evaluate(([c, t, s]) => window.cast(c, t, s), [card, targets, skin]);
    if (r !== 'ok') { errors.push(`${card}: ${r}`); continue; }
    let t = 0;
    for (const at of times) {
      while (t < at) { await step(33); t += 0.033; }
      await page.screenshot({ path: path.join(out, `${card}-${String(Math.round(at * 100)).padStart(3, '0')}.png`) });
    }
    while (t < 3.2) { await step(50); t += 0.05; }
    const done = await page.evaluate(() => [window.castDone, getComputedStyle(document.querySelector('.board-wrap')).getPropertyValue('--tilt')]);
    console.log(card, 'fin :', JSON.stringify(done));
    if (['hourglass', 'truce', 'blood_moon', 'ice_age', 'blast'].includes(card)) {
      const fx = await page.evaluate(() => window.moves(2));
      let u = 0;
      while (u < 0.45) { await step(33); u += 0.033; }
      await page.screenshot({ path: path.join(out, `${card}-arrivee.png`) });
      while (u < 2.5) { await step(50); u += 0.05; }
      await page.screenshot({ path: path.join(out, `${card}-actif.png`) });
      console.log(card, 'effets :', fx);
    } else {
      await page.screenshot({ path: path.join(out, `${card}-pose.png`) });
    }
  }
  console.log(errors.length ? errors.slice(0, 30).join('\n') : 'aucune erreur console');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

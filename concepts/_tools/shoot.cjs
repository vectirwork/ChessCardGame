// Captures scénarisées des prototypes.
// Usage : node concepts/_tools/shoot.cjs scenario.json
// scenario.json : {
//   "url": "http://localhost:3000/concepts/odyssee/",
//   "outDir": "concepts/odyssee/shots",
//   "viewport": { "width": 1440, "height": 900 },
//   "steps": [
//     { "wait": 1500 },
//     { "shot": "01-hero" },
//     { "wheel": 900 },            // molette (déclenche Lenis / ScrollTrigger comme un vrai utilisateur)
//     { "scrollTo": 2400 },        // saut direct (window.scrollTo)
//     { "scrollToSelector": "#cartes" },
//     { "click": "button.play" },
//     { "clickSquare": "e2" },     // case de l'échiquier jouable (attribut data-sq)
//     { "eval": "window.scrollY" },
//     { "shot": "02-play", "fullPage": false }
//   ]
// }
// WebGL est rendu en logiciel dans ce bac à sable : les animations 3D y sont lentes, ce n'est pas le cas sur un vrai appareil.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  fs.mkdirSync(cfg.outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: cfg.viewport ?? { width: 1440, height: 900 }, deviceScaleFactor: cfg.dpr ?? 1 });
  const logs = [];
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') logs.push('console: ' + m.text()); });
  await page.goto(cfg.url, { waitUntil: 'networkidle', timeout: 60000 });
  const sqIdx = n => (n.charCodeAt(1) - 49) * 8 + (n.charCodeAt(0) - 97);
  for (const step of cfg.steps) {
    if (step.wait) await page.waitForTimeout(step.wait);
    if (step.wheel) {
      const n = Math.ceil(Math.abs(step.wheel) / 120);
      for (let i = 0; i < n; i++) { await page.mouse.wheel(0, Math.sign(step.wheel) * 120); await page.waitForTimeout(40); }
      await page.waitForTimeout(step.settle ?? 900);
    }
    if (step.scrollTo !== undefined) { await page.evaluate(y => window.scrollTo(0, y), step.scrollTo); await page.waitForTimeout(step.settle ?? 900); }
    if (step.scrollToSelector) { await page.locator(step.scrollToSelector).first().scrollIntoViewIfNeeded(); await page.waitForTimeout(step.settle ?? 900); }
    if (step.click) { await page.locator(step.click).first().click({ timeout: 15000 }); await page.waitForTimeout(step.settle ?? 600); }
    if (step.clickSquare) { await page.locator(`.sq[data-sq="${sqIdx(step.clickSquare)}"]`).first().click({ timeout: 15000 }); await page.waitForTimeout(step.settle ?? 300); }
    if (step.eval) console.log('eval:', JSON.stringify(await page.evaluate(step.eval)));
    if (step.shot) {
      const file = path.join(cfg.outDir, step.shot + '.png');
      await page.screenshot({ path: file, fullPage: !!step.fullPage });
      console.log('capture :', file);
    }
  }
  console.log(logs.length ? logs.slice(0, 20).join('\n') : 'aucune erreur console');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

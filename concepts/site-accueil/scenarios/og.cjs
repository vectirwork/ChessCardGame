// Image de partage (og.jpg) au style Odyssée : le vrai premier écran, sans en-tête ni options.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.setItem('sm:intro', '1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.addStyleTag({ content: `
    .site-header, .o-hand-row, .o-opts, .o-facts, .o-scroll-cue, .o-kbd-play, .o-altimeter, .o-astre-caption { display: none !important; }
    .ody .o-hero { padding-top: 40px !important; padding-bottom: 40px !important; }
    .ody .o-hero .o-display { font-size: 92px !important; }
    .ody .o-hero .o-lede { font-size: 19px !important; max-width: 470px !important; }
  ` });
  await page.evaluate(() => {
    const lede = document.querySelector('.o-hero .o-lede');
    if (lede) lede.textContent = "Une vraie partie d'échecs, trois cartes de pouvoir, un sort par tour. Gratuit, sans compte : jouez dès le premier écran.";
    const k = document.querySelector('.o-hero .o-kicker');
    if (k) k.innerHTML = '<span style="font-family:Cinzel;letter-spacing:.34em;font-size:15px;color:#f3c969">✦ SPELLMATE</span>';
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: process.argv[2], type: 'jpeg', quality: 88, timeout: 60000 });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

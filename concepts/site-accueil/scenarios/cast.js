(async () => {
  const cards = [...document.querySelectorAll('.gs-fan .spell-card:not(.disabled):not(.used)')];
  if (!cards.length) return 'aucune carte jouable';
  cards[0].click();
  await new Promise(r => setTimeout(r, 500));
  const name = document.querySelector('.gs-spell')?.textContent;
  for (let k = 0; k < 3; k++) {
    const btn = document.querySelector('.gs-prompt .btn-gold');
    if (btn) { btn.click(); return 'lancé ' + name; }
    const t = document.querySelector('.o-astre-game .sq.target');
    if (!t) return 'pas de cible ' + name;
    const r = t.getBoundingClientRect();
    const ev = new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true });
    document.querySelector('.o-astre-game .board').dispatchEvent(ev);
    await new Promise(r => setTimeout(r, 350));
    if (!document.querySelector('.gs-prompt')) return 'lancé ' + name;
  }
  return 'ciblage ' + name;
})()

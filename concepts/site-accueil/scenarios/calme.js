// Attend que la scène 3D de la partie soit prête et que le fil principal soit libre (WebGL logiciel du bac à sable :
// la création de la scène y bloque la page plusieurs secondes ; sur un vrai appareil, c'est l'affaire de 100 ms).
(async () => {
  const t0 = performance.now();
  const pause = ms => new Promise(r => setTimeout(r, ms));
  while (performance.now() - t0 < 90000) {
    if (document.querySelector('canvas.o-live-canvas')) {
      const a = performance.now();
      await pause(200);
      if (performance.now() - a < 400) {
        await pause(600);
        return 'calme après ' + Math.round((performance.now() - t0) / 1000) + ' s';
      }
    } else await pause(300);
  }
  return 'délai dépassé';
})()

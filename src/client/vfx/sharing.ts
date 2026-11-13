// Réglages du partage des scènes d'effets entre échiquiers (useVfx.ts) : délais, en ms. Aucun import.
// À part de config.ts : useVfx est chargé avec les échiquiers, config.ts avec le morceau des effets ; y importer ces
// délais entraînerait tout config.ts dans un morceau de l'accueil (+295 o gzip mesurés au lot 4).
// Chaque valeur est celle d'avant ce module.

/** Scène gardée sans échiquier au-delà de ce délai : elle est libérée (contexte WebGL rendu au navigateur). */
export const POOL_KEEP_MS = 20000;
/** Une scène n'est reprise à un échiquier qui cède (la partie de l'accueil) qu'après ce repos (voir useVfx.ts). */
export const IDLE_BEFORE_YIELD_MS = 1500;
/** Une scène libérée n'est rendue à l'échiquier qui l'attendait qu'au bout de ce délai (voir useVfx.ts). */
export const HANDOFF_MS = 900;

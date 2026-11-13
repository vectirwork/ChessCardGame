// Mouvement réduit (préférence du système, prefers-reduced-motion) : une seule MediaQueryList pour le client, créée à la
// première lecture, lue à chaque fois (une scène gardée longtemps suit un changement de réglage en cours de visite) et
// abonnable. Aucun import ; sans fenêtre (tests, serveur) : pas de mouvement réduit.

const QUERY = '(prefers-reduced-motion: reduce)';
let mql: MediaQueryList | null | undefined;

function list(): MediaQueryList | null {
  if (mql === undefined) mql = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
  return mql;
}

/** Le système demande moins de mouvement. */
export function reducedMotion(): boolean {
  return list()?.matches ?? false;
}

/** Appelle `fn` à chaque changement de la préférence ; renvoie de quoi se désabonner. */
export function onReducedMotion(fn: (reduced: boolean) => void): () => void {
  const m = list();
  if (!m) return () => undefined;
  const h = (e: MediaQueryListEvent) => fn(e.matches);
  m.addEventListener('change', h);
  return () => m.removeEventListener('change', h);
}

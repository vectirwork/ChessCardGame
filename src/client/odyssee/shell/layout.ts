// Géométrie partagée du mode immersif : l'accueil (échiquier-astre) et la page de partie en ligne
// placent l'échiquier exactement au même endroit, pour que le HUD (GameShell) tombe juste dans les deux cas.

/** Largeur sous laquelle l'interface passe en disposition mobile. */
export const MOBILE_MAX = 820;

export const isMobile = (vw: number) => vw < MOBILE_MAX;

export interface GameLayout {
  /** Côté de l'échiquier, en pixels. */
  G: number;
  /** Centre de l'échiquier dans la fenêtre. */
  x: number;
  y: number;
  mobile: boolean;
}

/** Disposition du mode jeu : taille de l'échiquier et centre. Une marge basse absorbe l'inclinaison des sorts. */
export function gameLayout(vw: number, vh: number): GameLayout {
  if (isMobile(vw)) {
    const G = Math.max(200, Math.min(vw - 16, vh * 0.5));
    return { G, x: vw / 2, y: 76 + G / 2, mobile: true };
  }
  const left = Math.max(400, vw * 0.3);
  const right = Math.max(150, vw * 0.11);
  const G = Math.max(240, Math.min(vh - 150, vw - left - right));
  return { G, x: left + (vw - left - right) / 2, y: (56 + vh - 94) / 2, mobile: false };
}

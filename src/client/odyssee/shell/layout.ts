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

/** Mobile : haut de l'échiquier, sous la barre du haut et la bande des cartes adverses (coque, .gs-opp-strip). */
export const MOBILE_BOARD_TOP = 118;

/**
 * Mobile : hauteur gardée sous l'échiquier, quoi qu'il arrive. Elle reprend les marges des règles CSS du panneau de
 * statut de la partie en ligne, le cas le plus serré (game.css : bandeau « vous + pendule » 56 px, puis éventail et
 * invite posée dessus 160 px), et y ajoute 40 px de statut au minimum : le titre (« À vous de jouer. ») reste lisible.
 * Sans invite, le statut a 54 px de plus ; sur un téléphone bas (≤ 700 px), l'éventail se resserre et le statut
 * gagne encore 18 à 23 px. Sur 375 × 667 ou 360 × 640, l'échiquier rapetisse donc un peu (293 et 266 px au lieu de
 * 333 et 320) plutôt que d'écraser le statut à 0 px.
 */
export const MOBILE_BELOW = 56 + 160 + 40;

/**
 * Ordinateur : la main adverse (3 cartes en éventail, GameShell) occupe 2,97 largeurs de carte + 8 px. On garde à
 * droite de l'échiquier de quoi lui donner des cartes de 68 px, plus les marges (34 + 20 px).
 */
export const OPP_FAN_SPAN = 2.97;
export const DESKTOP_OPP_ROOM = 54 + 8 + Math.ceil(OPP_FAN_SPAN * 66);

/**
 * Ordinateur large (≥ 1180 px) : abscisse minimale du bord gauche de l'échiquier, pour que la main du joueur (en bas
 * à gauche, 3 cartes de clamp(112px, 9vw, 138px), shell.css .gs-fan) ne touche pas son cadre (10 px) : la main
 * s'étend jusqu'à environ 3,1 largeurs de carte + 32 px (mesuré : 389 px en 1280, 436 px en 1440) ; 16 px d'air.
 */
export function desktopHandRight(vw: number): number {
  const w = Math.max(112, Math.min(138, vw * 0.09));
  return 3.1 * w + 32 + 16 + 10;
}

/** Disposition du mode jeu : taille de l'échiquier et centre. Une marge basse absorbe l'inclinaison des sorts. */
export function gameLayout(vw: number, vh: number): GameLayout {
  if (isMobile(vw)) {
    const G = Math.max(200, Math.min(vw - 16, vh * 0.5, vh - MOBILE_BOARD_TOP - MOBILE_BELOW));
    return { G, x: vw / 2, y: MOBILE_BOARD_TOP + G / 2, mobile: true };
  }
  const left = Math.max(400, vw * 0.3);
  const right = Math.max(150, vw * 0.11);
  const G0 = Math.max(240, Math.min(vh - 150, vw - left - right));
  // Main du joueur en bas à gauche : l'échiquier commence après elle (grand écran : cartes de 128 px)
  const minLeft = vw >= 1180 ? Math.max(left, desktopHandRight(vw)) : left;
  // À droite, la place de la main adverse (cartes lisibles, GameShell.oppCardWidth) : l'échiquier se décale vers la
  // gauche et, si cela suffit, rapetisse d'au plus 5 % (1440 × 900 : 750 → 721 px ; 1280 × 720 : inchangé). Sinon
  // (écran étroit), il garde sa taille et sa place d'avant. En 1536 × 864 ou 1920 × 1080, rien ne bouge.
  const fit = vw - minLeft - DESKTOP_OPP_ROOM;
  const G = fit >= G0 * 0.95 ? Math.min(G0, fit) : G0;
  const x = Math.max(minLeft + G / 2, Math.min(left + (vw - left - right) / 2, vw - DESKTOP_OPP_ROOM - G / 2));
  return { G, x, y: (56 + vh - 94) / 2, mobile: false };
}

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
 * Ordinateur : la main adverse (éventail de GameShell, réglée pour la main de référence de REF_HAND cartes) occupe
 * 2,97 largeurs de carte + 8 px (oppFanSpan). On garde à droite de l'échiquier de quoi lui donner des cartes de 66 px,
 * plus les marges (34 + 20 px). Cette place ne dépend pas du nombre de cartes : au-delà de REF_HAND, les cartes
 * rapetissent (oppCardWidth).
 */
export const OPP_FAN_SPAN = 2.97;
export const DESKTOP_OPP_ROOM = 54 + 8 + Math.ceil(OPP_FAN_SPAN * 66);

/**
 * Ordinateur large (≥ 1180 px) : abscisse minimale du bord gauche de l'échiquier, pour que la main du joueur (en bas
 * à gauche, REF_HAND cartes de clamp(112px, 9vw, 138px), shell.css .gs-fan) ne touche pas son cadre (10 px) : la main
 * s'étend jusqu'à environ 3,1 largeurs de carte + 32 px (mesuré : 389 px en 1280, 436 px en 1440) ; 16 px d'air.
 * Au-delà de REF_HAND cartes, la main rapetisse dans la même enveloppe (handCardWidth) : l'échiquier ne bouge pas.
 */
export function desktopHandRight(vw: number): number {
  const w = Math.max(112, Math.min(138, vw * 0.09));
  return 3.1 * w + 32 + 16 + 10;
}

// ---------------------------------------------------------------------------------------------
// Éventails selon le nombre de cartes (n)
//
// Les mises en page de la coque sont réglées pour une main de référence (REF_HAND cartes) : jusque-là, les cartes
// gardent leur taille et rien ne change dans le DOM (ni attribut, ni variable, ni classe). Au-delà, GameShell pose
// data-crowd et des variables en ligne (--hw, --ho), que lisent des règles CSS propres (shell.css) : les cartes
// rapetissent dans la place qu'occupait la main de référence. L'échiquier ne bouge jamais avec n.

/** Main de référence : les mises en page sont réglées pour elle (et identiques à l'existant jusqu'à elle). */
export const REF_HAND = 3;

/** Position d'une carte dans l'éventail, de -1 (à gauche) à 1 (à droite) ; 0 pour une carte seule. */
export function fanT(i: number, n: number): number {
  return n <= 1 ? 0 : (2 * i) / (n - 1) - 1;
}

/** Pose d'une carte de l'éventail : inclinaison (degrés) et descente (px). Main de référence : -7°/14, 0°/0, 7°/14. */
export function fanPose(i: number, n: number): { r: number; y: number } {
  const t = fanT(i, n);
  return { r: 7 * t, y: 14 * t * t };
}

/** Inclinaison de départ d'une carte à l'arrivée de la main (degrés) : -28, 0, 28 pour la main de référence. */
export function fanArrival(i: number, n: number): number {
  return 28 * fanT(i, n);
}

/**
 * Largeur de l'éventail adverse (ordinateur), en largeurs de carte, hors marges (8 px) : cartes chevauchées de 10 %
 * jusqu'à la main de référence (2,97 largeurs), de 30 % au-delà (shell.css, .gs-opp-fan[data-crowd]).
 */
export function oppFanSpan(n: number): number {
  return n <= REF_HAND ? (90 * n + 27) / 100 : (70 * n + 47) / 100;
}

/**
 * Largeur d'une carte adverse : l'éventail tient entre l'échiquier et le bord droit (ordinateur) ; 34 px sur mobile.
 * Bornes : 44 à 76 px (36 px au plus bas au-delà de la main de référence).
 */
export function oppCardWidth(l: GameLayout, vw: number, n: number = REF_HAND): number {
  if (l.mobile) return 34;
  const side = vw - (l.x + l.G / 2) - 34 - 20;
  return Math.floor(Math.max(n <= REF_HAND ? 44 : 36, Math.min(76, (side - 8) / oppFanSpan(n))));
}

/** Chevauchement des cartes de votre main (px, positif) : 18 sur ordinateur, 12 sur mobile (shell.css). */
export const HAND_OVERLAP = { desktop: 18, mobile: 12 } as const;

/**
 * Largeur des cartes de votre main pour la main de référence, comme shell.css la pose (.gs-fan .sc-hand) : 88 px sur
 * mobile (72 px sur un écran bas, ≤ 700 px), 104 px de 820 à 1180 px, clamp(112px, 9vw, 138px) au-delà.
 */
export function refHandCardWidth(vw: number, vh: number): number {
  if (isMobile(vw)) return vh <= 700 ? 72 : 88;
  if (vw <= 1180) return 104;
  return Math.max(112, Math.min(138, vw * 0.09));
}

/**
 * Votre main de n cartes : largeur d'une carte et chevauchement (px). Jusqu'à la main de référence, les valeurs de
 * shell.css. Au-delà :
 * - ordinateur : w = (3,1·w₃ + 18(n − 3)) / (n + 0,1), chevauchement inchangé (18 px) : la main garde l'enveloppe de
 *   la main de référence (desktopHandRight) ;
 * - mobile : w = max(60, min(88, (240 + 12(n − 1)) / n)) (72 et 49 au lieu de 88 et 60 sur un écran bas), et le
 *   chevauchement grandit si la main ne tient pas dans la largeur de la main de référence (3 × 88 − 2 × 12 = 240 px).
 */
export function handCardWidth(n: number, l: Pick<GameLayout, 'mobile'>, vw: number, vh: number): { w: number; overlap: number } {
  const base = refHandCardWidth(vw, vh);
  if (n <= REF_HAND) return { w: base, overlap: l.mobile ? HAND_OVERLAP.mobile : HAND_OVERLAP.desktop };
  if (!l.mobile) {
    const o = HAND_OVERLAP.desktop;
    return { w: (3.1 * base + o * (n - REF_HAND)) / (n + 0.1), overlap: o };
  }
  const o = HAND_OVERLAP.mobile;
  const span = REF_HAND * base - (REF_HAND - 1) * o;
  const min = Math.round((60 * base) / 88);
  const w = Math.max(min, Math.min(base, (span + o * (n - 1)) / n));
  return { w, overlap: Math.max(o, (n * w - span) / (n - 1)) };
}

/**
 * Ordinateur : haut de la colonne des coups de la partie en ligne (GamePage), sous le bloc de l'adversaire (nom,
 * pendule : 178 px), et, s'il y a des cartes, sous sa main : 122 px de plus, la hauteur de l'éventail adverse à sa
 * taille maximale (cartes de 76 px, oppCardWidth), quel que soit le nombre de cartes.
 */
export function railTop(hasCards: boolean): number {
  return hasCards ? 178 + 122 : 178;
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

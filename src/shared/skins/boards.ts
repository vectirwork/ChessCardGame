// Échiquiers (emplacement `board`). Identifiants `board:*` historiques, jamais renommés.
// Ordre : celui de la boutique d'origine, les nouveautés à la suite. Les décors (liseré, incrustation, cadre, halo)
// s'ajoutent dans `board` sans toucher aux identifiants ni aux noms.
//
// Décors (plan § 1 et § 4.3, rendus des artistes et retouches du DA). Tout est statique : rien ne bouge, rien n'est
// posé sur les 64 cases. Le site les applique par boardTheme (src/client/components/boardTheme.ts) et la section
// « Habillage des échiquiers » de board.css ; test/boards.test.ts vérifie les règles (poids, éléments interdits,
// géométrie), test/echiquiers.mjs en fait la planche.
// - Incrustation : un SVG 800 × 800 (une case = 100 unités, en coordonnées d'écran), étiré sur la grille. Les cases
//   sombres sont celles où colonne + rangée d'écran est impair ; a1 et h8 le restent échiquier retourné, les motifs
//   restent donc sur les cases sombres côté noirs.
// - Cadre (10 px) : frise en border-image (`border`) ou une même image aux coins, et aux milieux des côtés (`corners`).
import type { Item } from './types';

const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';
/** Incrustation : viewBox 0 0 800 800, étirée sur la grille. */
const inlay = (body: string, attrs = '') => `<svg ${XMLNS} viewBox="0 0 800 800" preserveAspectRatio="none"${attrs}>${body}</svg>`;
/** Frise d'un cadre `border` : image de n × n unités, tranche de 10 (coins de 10 × 10, côtés répétés). */
const frieze = (n: number, body: string) => `<svg ${XMLNS} viewBox="0 0 ${n} ${n}" width="${n}" height="${n}" preserveAspectRatio="none">${body}</svg>`;

/** Palais de jade : sept pétales de cerisier sur des cases sombres des rangées d'écran 3 à 6 (retouche du DA : aucun
 *  pétale sous les pièces de départ). */
const JADE_INLAY = inlay(
  '<defs><path id="p" d="M0 9C-4.1 6.8-7.5 0-6.2-5.8C-4.7-9.4-1.6-9.7 0-6.1C1.6-9.7 4.7-9.4 6.2-5.8C7.5 0 4.1 6.8 0 9Z"/></defs>' +
    '<g fill="#ffc4de" fill-opacity=".88">' +
    [
      'translate(752 262) rotate(-150) scale(.96)',
      'translate(565 240) rotate(-54) scale(.94)',
      'translate(655 352) rotate(-55) scale(1.19)',
      'translate(330 270) rotate(-99) scale(.93)',
      'translate(462 355) rotate(-136) scale(1.02)',
      'translate(165 460) rotate(-96) scale(1.1)',
      'translate(230 540) rotate(-93) scale(.99)',
    ]
      .map(t => `<use href="#p" transform="${t}"/>`)
      .join('') +
    '</g>',
);
/** Fleur de cerisier à cinq pétales, cœur d'or : aux quatre coins du cadre. */
const JADE_BLOSSOM =
  `<svg ${XMLNS} viewBox="-6 -6 12 12"><path fill="#ffc2dc" d="M0 0C-1.6-.7-2.9-2.8-2.4-4.6C-1.8-5.7-.6-5.8 0-4.5C.6-5.8 1.8-5.7 2.4-4.6C2.9-2.8 1.6-.7 0 0Z` +
  `M0 0C.1-1.7 1.8-3.6 3.6-3.7C4.9-3.5 5.3-2.4 4.3-1.4C5.7-1.2 6-.1 5.1.8C3.6 1.9 1.1 1.3 0 0Z` +
  `M0 0C1.7-.4 4 .6 4.6 2.3C4.8 3.6 3.9 4.3 2.6 3.6C2.9 5.1 1.9 5.7.8 5.1C-.7 4-.9 1.5 0 0Z` +
  `M0 0C.9 1.5.7 4-.8 5.1C-1.9 5.7-2.9 5.1-2.6 3.6C-3.9 4.3-4.8 3.6-4.6 2.3C-4 .6-1.7-.4 0 0Z` +
  `M0 0C-1.1 1.3-3.6 1.9-5.1.8C-6-.1-5.7-1.2-4.3-1.4C-5.3-2.4-4.9-3.5-3.6-3.7C-1.8-3.6-.1-1.7 0 0Z"/>` +
  `<circle r="1.4" fill="#d9b45a"/></svg>`;

/** Grille 2084 : grille cyan entre les cases (filet à 55 %, halo à 10 %), 49 nœuds aux croisements intérieurs, voile
 *  « crépuscule » (cyan en haut, magenta en bas, côté joueur). */
const GRID_LINES = Array.from({ length: 7 }, (_, i) => `M${(i + 1) * 100} 0V800M0 ${(i + 1) * 100}H800`).join('');
const GRILLE_INLAY = inlay(
  '<defs><linearGradient id="d" x2="0" y2="1"><stop stop-color="#38f2ff" stop-opacity=".07"/><stop offset=".35" stop-color="#38f2ff" stop-opacity="0"/>' +
    '<stop offset=".65" stop-color="#ff3ec8" stop-opacity="0"/><stop offset="1" stop-color="#ff3ec8" stop-opacity=".14"/></linearGradient>' +
    '<pattern id="n" x="50" y="50" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M47 47h6v6h-6z" fill="#bff9ff" fill-opacity=".9"/></pattern>' +
    `<path id="g" d="${GRID_LINES}"/></defs>` +
    '<rect width="800" height="800" fill="url(#d)"/>' +
    '<use href="#g" stroke="#38f2ff" stroke-width="7" stroke-opacity=".1"/>' +
    '<use href="#g" stroke="#38f2ff" stroke-width="2" stroke-opacity=".55"/>' +
    '<rect x="50" y="50" width="700" height="700" fill="url(#n)"/>',
);

/** Obsidienne & Or : huit veines de lave figées, redessinées pour ne jamais imiter la Faille (.sq.rift) : chacune part
 *  d'un bord ou d'un coin d'une case sombre des rangées d'écran 3 à 6, s'arrête avant 35 % de la case et n'entre
 *  jamais dans son carré central (30 à 70 %). Halo à 13 %, filet à 40 %. */
const OBSIDIAN_CRACKS =
  'M100 262 108 257 114 264 122 259 129 265M114 264 118 273' +
  'M324 200 319 208 326 214 322 222 327 230M326 214 334 219' +
  'M58 400 63 392 56 385 61 378 57 372M56 385 48 381' +
  'M700 340 692 345 686 338 679 344 672 340M686 338 683 330' +
  'M400 500 393 493 390 485 383 482 379 475M390 485 395 478' +
  'M566 400 570 407 564 413 569 420 565 427M564 413 556 416' +
  'M460 600 455 593 461 586 456 579 460 572M461 586 469 589' +
  'M600 500 606 507 612 509 616 517 624 521M612 509 620 505';
const OBSIDIAN_INLAY = inlay(
  `<defs><path id="c" d="${OBSIDIAN_CRACKS}"/></defs>` +
    '<g fill="none" stroke-linejoin="round" stroke-linecap="round">' +
    '<use href="#c" stroke="#ff5a1a" stroke-width="7" stroke-opacity=".13"/>' +
    '<use href="#c" stroke="#ffb347" stroke-width="2.2" stroke-opacity=".4"/></g>',
);
/** Huit rivets d'or forgés : aux coins et au milieu de chaque côté (un par longueur de frise). */
const OBSIDIAN_FRAME = frieze(
  90,
  '<defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#f6dc8c"/><stop offset="1" stop-color="#9a7428"/></linearGradient>' +
    '<g id="r"><circle r="2.3" fill="url(#g)" stroke="#000" stroke-opacity=".55" stroke-width=".6"/><circle cx="-.7" cy="-.7" r=".7" fill="#fff8dc" fill-opacity=".85"/></g></defs>' +
    [[7.2, 7.2], [82.8, 7.2], [7.2, 82.8], [82.8, 82.8], [45, 5], [45, 85], [5, 45], [85, 45]]
      .map(([x, y]) => `<use href="#r" x="${x}" y="${y}"/>`)
      .join(''),
);

/** Marbre de Carrare : cabochons d'or aux 49 croisements intérieurs des cases (un losange par motif de 100 × 100). */
const MARBLE_INLAY = inlay(
  '<defs><pattern id="c" x="50" y="50" width="100" height="100" patternUnits="userSpaceOnUse">' +
    '<path d="M50 44.2 55.8 50 50 55.8 44.2 50Z" fill="#d9b45a" stroke="#2b2b30" stroke-width="1.6" stroke-opacity=".5" opacity=".85"/></pattern></defs>' +
    '<rect x="50" y="50" width="700" height="700" fill="url(#c)"/>',
);
/** Frise grecque (méandres) d'or : un motif de 8 px par côté, un carré gravé à chaque coin. */
const MEANDER = 'M10 2.2H18M10 7.8H18M10.9 7.8V3.6H16.3V6.3H13.4V5';
const MARBLE_FRAME = frieze(
  28,
  '<g fill="none" stroke="#d9b45a" stroke-width=".9" stroke-linecap="square">' +
    [0, 90, 180, 270].map(a => `<path d="${MEANDER}"${a ? ` transform="rotate(${a} 14 14)"` : ''}/>`).join('') +
    '<path d="M4.5 4.5h4.8v4.8H4.5ZM6.1 6.1h1.6v1.6H6.1ZM18.7 4.5h4.8v4.8h-4.8ZM20.3 6.1h1.6v1.6h-1.6Z' +
    'M4.5 18.7h4.8v4.8H4.5ZM6.1 20.3h1.6v1.6H6.1ZM18.7 18.7h4.8v4.8h-4.8ZM20.3 20.3h1.6v1.6h-1.6Z"/></g>',
);

/** Rubis : chaque case sombre taillée en pierre (biseau de 22 unités : haut et gauche éclaircis, droite et bas
 *  assombris). Un motif de 200 × 200 couvre deux cases sombres, en (100, 0) et (0, 100). */
const RUBY_INLAY = inlay(
  '<defs><pattern id="f" width="200" height="200" patternUnits="userSpaceOnUse">' +
    '<path d="M100 0h100l-22 22h-56zM0 100h100l-22 22H22z" fill="#fff" fill-opacity=".1"/>' +
    '<path d="M100 0l22 22v56l-22 22zM0 100l22 22v56L0 200z" fill="#fff" fill-opacity=".045"/>' +
    '<path d="M200 0v100l-22-22V22zM100 100v100l-22-22v-56z" fill="#000" fill-opacity=".06"/>' +
    '<path d="M100 100h100l-22-22h-56zM0 200h100l-22-22H22z" fill="#000" fill-opacity=".1"/></pattern></defs>' +
    '<rect width="800" height="800" fill="url(#f)"/>',
);
/** Filigrane d'or : perles le long des côtés, un losange au milieu de chaque côté et à chaque coin. */
const RUBY_DOTS = [13.8, 21.3, 28.8, 51.3, 58.8, 66.3].map(v => `M${v} 5h0M${v} 75h0M5 ${v}h0M75 ${v}h0`).join('');
const RUBY_FRAME = frieze(
  80,
  `<path d="${RUBY_DOTS}" stroke="#e2be62" stroke-width="1.9" stroke-linecap="round"/>` +
    '<path fill="#e2be62" stroke="#000" stroke-opacity=".4" stroke-width=".5" d="' +
    'M40 1.6 42.7 5 40 8.4 37.3 5ZM40 71.6 42.7 75 40 78.4 37.3 75ZM5 36.6 7.7 40 5 43.4 2.3 40ZM75 36.6 77.7 40 75 43.4 72.3 40Z' +
    'M6.5 2.8 9.4 6.3 6.5 9.8 3.6 6.3ZM73.5 2.8 76.4 6.3 73.5 9.8 70.6 6.3ZM6.5 70.2 9.4 73.7 6.5 77.2 3.6 73.7ZM73.5 70.2 76.4 73.7 73.5 77.2 70.6 73.7Z"/>',
);

/** Horizon des événements (retouche du DA : puits de gravité à 12 % au centre, 5 % à mi-rayon) : puits sur les seules
 *  cases claires, disque d'accrétion incliné, singularité entre d4, e4, d5 et e5. Centré : identique retourné. */
const HORIZON_LIGHT = Array.from({ length: 32 }, (_, i) => {
  const r = i >> 2, c = ((i & 3) << 1) + (r & 1);
  return `M${c * 100} ${r * 100}h100v100h-100z`;
}).join('');
const HORIZON_INLAY = inlay(
  '<defs><radialGradient id="w" cx="400" cy="400" r="340" gradientUnits="userSpaceOnUse"><stop stop-color="#07050c" stop-opacity=".12"/>' +
    '<stop offset=".5" stop-color="#07050c" stop-opacity=".05"/><stop offset="1" stop-color="#07050c" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="d" gradientUnits="userSpaceOnUse" x1="60" x2="740"><stop stop-color="#d9b8ff"/><stop offset="1" stop-color="#8b3dff"/></linearGradient>' +
    `<clipPath id="l"><path d="${HORIZON_LIGHT}"/></clipPath></defs>` +
    '<rect width="800" height="800" fill="url(#w)" clip-path="url(#l)"/>' +
    '<g transform="rotate(-18 400 400)" fill="none" stroke="url(#d)">' +
    '<ellipse cx="400" cy="400" rx="255" ry="84" stroke-width="16" opacity=".1"/>' +
    '<ellipse cx="400" cy="400" rx="255" ry="84" stroke-width="3" opacity=".55"/>' +
    '<ellipse cx="400" cy="400" rx="455" ry="150" stroke-width="2" opacity=".3"/></g>' +
    '<circle cx="400" cy="400" r="17" fill="none" stroke="#b98bff" stroke-width="12" opacity=".14"/>' +
    '<circle cx="400" cy="400" r="11" fill="#07050c" fill-opacity=".6" stroke="#e4ccff" stroke-width="2.5" stroke-opacity=".85"/>',
);

/** Carte du ciel : une à trois étoiles d'or par case sombre, toujours aux mêmes places, dans les marges que les pièces
 *  laissent libres et hors des coordonnées. Une seule étoile dessinée (rayon 10), posée en marqueur à trois échelles
 *  (5, 7,5 et 10 unités) sur les sommets de neuf tracés invisibles, un par taille et par opacité (50, 65, 80 %). */
const STAR = 'M0-10Q.72-1 7.2 0Q.72 1 0 10Q-.72 1-7.2 0Q-.72-1 0-10Z';
const CIEL_STARS: [size: 'a' | 'b' | 'c', opacity: string, points: string][] = [
  ['a', '.5', '686 185 784 411 214 511 684 512 14 789 286 753'],
  ['b', '.5', '588 14 516 89 86 154 689 115 185 487 715 450 212 584 488 555 710 653 14 750'],
  ['c', '.5', '790 49 186 284 489 312 612 350 410 754 613 754 690 754'],
  ['a', '.65', '185 88 211 152 711 285 311 488 13 590'],
  ['b', '.65', '786 89 13 155 185 213 311 214 510 215 611 313 315 655 215 785 486 749 412 711'],
  ['c', '.65', '313 88 589 53 611 153 714 214 488 351 184 412 285 590 614 554 188 687 588 688 84 711'],
  ['a', '.8', '713 12 490 152 589 285'],
  ['b', '.8', '413 187 188 452 112 652 189 654 315 614 789 686 615 787'],
  ['c', '.8', '115 215 585 212 85 314 290 390 688 389 515 489 714 414 385 685 212 753'],
];
const CIEL_INLAY = inlay(
  `<defs><path id="s" d="${STAR}"/>` +
    [['a', ' transform="scale(.5)"'], ['b', ' transform="scale(.75)"'], ['c', '']]
      .map(([id, t]) => `<marker id="${id}" markerUnits="userSpaceOnUse" overflow="visible"><use href="#s"${t}/></marker>`)
      .join('') +
    '</defs><g fill="none">' +
    CIEL_STARS.map(([m, o, p]) => `<path d="M${p}" style="marker:url(#${m})" opacity="${o}"/>`).join('') +
    '</g>',
  ' fill="#ffd36b"',
);
/** Étoile d'or à quatre branches : 16 px aux coins du cadre, 8 px au milieu des côtés (une seule image). */
const CIEL_STAR = `<svg ${XMLNS} viewBox="0 0 20 20"><path fill="#e8c66a" d="M10 .5Q10.95 9.05 19.5 10 10.95 10.95 10 19.5 9.05 10.95.5 10 9.05 9.05 10 .5Z"/></svg>`;

export const BOARD_ITEMS: Item[] = [
  {
    id: 'board:arcane',
    kind: 'board',
    name: 'Nuit arcane',
    description: 'Le plateau d’origine, violet profond.',
    free: true,
    rarity: 'offert',
    board: { light: '#d8d3ee', dark: '#6f62ad', frame: '#1c1838', texture: 'grain', coords: '#3b3270' },
  },
  {
    id: 'board:wood',
    kind: 'board',
    name: 'Bois de chêne',
    description: 'L’élégance d’un échiquier de club.',
    free: true,
    rarity: 'offert',
    board: { light: '#ecd5ae', dark: '#a9784f', frame: '#4a2f1d', texture: 'wood', coords: '#6b4428' },
  },
  {
    id: 'board:slate',
    kind: 'board',
    name: 'Ardoise',
    description: 'Bleu-gris sobre, reposant pour les longues parties.',
    free: true,
    rarity: 'offert',
    board: { light: '#dfe6ee', dark: '#7b8fa6', frame: '#1f2833', texture: 'none', coords: '#465568' },
  },
  {
    id: 'board:marble',
    kind: 'board',
    name: 'Marbre de Carrare',
    description: 'Marbre blanc veiné, marbre gris et frise grecque d’or : l’échiquier des vainqueurs.',
    free: false,
    rarity: 'rare',
    board: {
      light: '#f2f0ec',
      dark: '#8c8c94',
      frame: '#2b2b30',
      texture: 'marble',
      coords: '#55555c',
      fillet: '#d9b45a',
      inlay: MARBLE_INLAY,
      frameArt: { kind: 'border', svg: MARBLE_FRAME, slice: 10 },
      gem: '#d9b45a',
    },
  },
  {
    id: 'board:obsidian',
    kind: 'board',
    name: 'Obsidienne & Or',
    description: 'Pierre volcanique sertie d’or, rivets forgés et veines de lave figées dans la roche.',
    free: false,
    rarity: 'rare',
    // Cases sombres éclaircies (#26232b → #322d38) : les pièces noires y deviennent lisibles.
    board: {
      light: '#c9b27a',
      dark: '#322d38',
      frame: '#0d0c10',
      texture: 'stone',
      coords: '#a68b4c',
      fillet: '#c9a24e',
      inlay: OBSIDIAN_INLAY,
      frameArt: { kind: 'border', svg: OBSIDIAN_FRAME, slice: 10 },
      gem: '#ff7a1a',
    },
  },
  {
    id: 'board:jade',
    kind: 'board',
    name: 'Palais de jade',
    description: 'Jade impérial et ivoire, liseré d’or ; des pétales de cerisier tombent sur l’échiquier.',
    free: false,
    rarity: 'rare',
    board: {
      light: '#e9f1e3',
      dark: '#3f8a6b',
      frame: '#123326',
      texture: 'marble',
      coords: '#2c6650',
      fillet: '#d9b45a',
      inlay: JADE_INLAY,
      frameArt: { kind: 'corners', svg: JADE_BLOSSOM, size: 11 },
      gem: '#ff8fc7',
    },
  },
  {
    id: 'board:ruby',
    kind: 'board',
    name: 'Rubis',
    description: 'Rubis taillé et crème, serti d’un filigrane d’or : taillé pour l’attaque.',
    free: false,
    rarity: 'epique',
    // Prix gardé : 1,99 € (la grille épique est à 2,49 €), un prix déjà pratiqué ne monte jamais.
    priceCents: 199,
    board: {
      light: '#f3e1d6',
      dark: '#9e2f45',
      frame: '#2e0b14',
      texture: 'stone',
      coords: '#7a2234',
      fillet: '#e2be62',
      inlay: RUBY_INLAY,
      frameArt: { kind: 'border', svg: RUBY_FRAME, slice: 10 },
      gem: '#ff3d5e',
    },
  },
  {
    id: 'board:grille',
    kind: 'board',
    name: 'Grille 2084',
    description: 'Cases indigo et lavande sous une grille cyan qui ne s’éteint jamais, cadre néon magenta.',
    free: false,
    rarity: 'rare',
    isNew: true,
    board: {
      light: '#cbbcf2',
      dark: '#46317e',
      frame: '#0b0614',
      texture: 'none',
      coords: '#46317e',
      fillet: '#ff3ec8',
      inlay: GRILLE_INLAY,
      // Filet néon magenta en ombres intérieures : il suit l'arrondi du cadre ; la lueur n'est qu'une couleur fixe.
      frameGlow: { shadow: 'inset 0 0 0 3px #0b0614, inset 0 0 0 4.6px #ff3ec8, inset 0 0 0 9px rgba(255, 62, 200, 0.18)' },
      gem: '#ff3ec8',
    },
  },
  {
    id: 'board:horizon',
    kind: 'board',
    name: 'Horizon des événements',
    description: 'Un ciel éteint : un disque d’accrétion violet tourne autour d’une singularité, au cœur de l’échiquier.',
    free: false,
    rarity: 'epique',
    isNew: true,
    board: {
      light: '#dcd8e4',
      dark: '#504372',
      frame: '#07050c',
      texture: 'grain',
      coords: '#504372',
      fillet: '#8b3dff',
      inlay: HORIZON_INLAY,
      // Deux arcs de lumière violette dans l'axe du disque (72° et 252°), comme si l'anneau sortait de l'échiquier, et
      // un halo fixe autour du cadre.
      frameGlow: {
        background:
          'conic-gradient(rgba(139, 61, 255, 0) 12deg, rgba(139, 61, 255, 0.6) 72deg, rgba(139, 61, 255, 0) 132deg, ' +
          'rgba(139, 61, 255, 0) 192deg, rgba(139, 61, 255, 0.6) 252deg, rgba(139, 61, 255, 0) 312deg)',
        shadow: '0 0 0 1px rgba(139, 61, 255, 0.28), 0 0 26px -6px rgba(139, 61, 255, 0.55)',
      },
      gem: '#8b3dff',
    },
  },
  {
    id: 'board:ciel',
    kind: 'board',
    name: 'Carte du ciel',
    description: 'Parchemin et bleu nuit, piqué d’étoiles d’or comme une carte des astronomes.',
    free: false,
    rarity: 'legendaire',
    isNew: true,
    board: {
      light: '#ede3c8',
      dark: '#2c3672',
      frame: '#0e1230',
      texture: 'grain',
      coords: '#2c3672',
      fillet: '#d9b45a',
      inlay: CIEL_INLAY,
      frameArt: { kind: 'corners', svg: CIEL_STAR, size: 16, mid: 8 },
      gem: '#ffd36b',
    },
  },
];

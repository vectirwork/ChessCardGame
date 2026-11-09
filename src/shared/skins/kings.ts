// Rois (emplacement `king`) : métadonnées (KING_ITEMS) et dessins (KING_ART).
// Le roi Arcane n'a pas de dessin ici : c'est le roi du jeu Arcane (src/client/components/pieces.ts), inchangé.
// Les dessins sont hors de Item pour ne pas alourdir /api/shop/catalog.
import type { Color } from '../chess';
import type { Item, KingArt } from './types';

export const KING_ITEMS: Item[] = [
  {
    id: 'king:arcane',
    kind: 'king',
    name: 'Roi Arcane',
    description: 'Le roi d’origine : coiffe à deux lobes et croix pleine, tel qu’on l’apprend à l’Observatoire.',
    free: true,
    rarity: 'offert',
    king: { gem: '#5ee7ff' },
  },
  {
    id: 'king:printemps',
    kind: 'king',
    name: 'Roi du printemps',
    description: 'Une couronne de lotus, une fleur de cerisier pour croix et un rameau en fleurs gravé sur la porcelaine.',
    free: false,
    rarity: 'rare',
    isNew: true,
    king: { gem: '#ff8fc7' },
  },
  {
    id: 'king:synthe',
    kind: 'king',
    name: 'Roi Synthé',
    description: 'Tout en angles : une visière néon et un pixel lumineux au cœur de la croix. Le roi du club de 2084.',
    free: false,
    rarity: 'rare',
    isNew: true,
    king: { gem: '#ff3ec8' },
  },
  {
    id: 'king:braise',
    kind: 'king',
    name: 'Roi de braise',
    description: 'Une couronne de flammes, une croix de feu et une veine de lave qui le fend de part en part.',
    free: false,
    rarity: 'rare',
    isNew: true,
    king: { gem: '#ff7a1a' },
  },
  {
    id: 'king:laure',
    kind: 'king',
    name: 'Roi lauré',
    description: 'Un dôme de marbre ceint d’une couronne de laurier d’or, une croix pattée, un fût cannelé de colonne grecque.',
    free: false,
    rarity: 'rare',
    isNew: true,
    king: { gem: '#d9b45a' },
  },
  {
    id: 'king:rubis',
    kind: 'king',
    name: 'Roi de rubis',
    description: 'La couronne impériale : arches perlées, coiffe de velours écarlate, globe d’or et croix, rubis au front.',
    free: false,
    rarity: 'epique',
    isNew: true,
    king: { gem: '#ff3d5e' },
  },
  {
    id: 'king:eclipse',
    kind: 'king',
    name: 'Roi éclipse',
    description: 'Un soleil noir ceint d’un anneau d’accrétion, et un œil de néant posé sur le bandeau.',
    free: false,
    rarity: 'epique',
    isNew: true,
    king: { gem: '#8b3dff' },
  },
  {
    id: 'king:astral',
    kind: 'king',
    name: 'Roi astral',
    description: 'Une couronne de rayons, une étoile d’or pour croix et un croissant de lune gravé : le roi de la carte du ciel.',
    free: false,
    rarity: 'legendaire',
    isNew: true,
    king: { gem: '#ffd36b' },
  },
];

/** Pied commun à toutes les pièces (pivot de la chute du roi maté). */
export const KING_BASE = 'M22 90 Q22 82 30 81 L70 81 Q78 82 78 90 Z';

const pal = (w: KingArt['pal']['w'], b: KingArt['pal']['b']): Record<Color, KingArt['pal']['w']> => ({ w, b });

/**
 * Dessins des rois (hors Arcane), par identifiant d'objet : transcription exacte des SVG de référence de la direction
 * artistique (retouches comprises), vérifiée par test/kings.test.ts contre test/fixtures/rois/.
 */
export const KING_ART: Record<string, KingArt> = {
  'king:printemps': {
    body: `${KING_BASE} M31 81 C34 69 37.5 58 36.5 46 L63.5 46 C62.5 58 66 69 69 81 Z M33 46 L67 46 L67 40 L33 40 Z M34 40 C30 36 29.5 30 32.5 24.5 C37 25 41 27.5 43 31.5 C44 27 46.5 23.5 50 20.5 C53.5 23.5 56 27 57 31.5 C59 27.5 63 25 67.5 24.5 C70.5 30 70 36 66 40 Z`,
    details: 'M37.5 51 L62.5 51 M34 74 Q50 70.5 66 74 M50 24 L50 39 M43 31.5 Q44.5 35.5 44.5 39.5 M57 31.5 Q55.5 35.5 55.5 39.5 M40 72 C43 65 48 60 57 55.5 M46 62 L43.5 58.5 M52.3 58.2 L53.4 54.2',
    pal: pal({ top: '#ffffff', bottom: '#e7eadf', stroke: '#1f2b24', detail: '#6d8a78' }, { top: '#3b4f45', bottom: '#0b120e', stroke: '#040806', detail: '#9cc4ae' }),
    ornaments: [
      { d: 'M50 12.5 C47.4 11.4 45.2 8 46.1 5.1 C47 3.3 48.9 3.1 50 4.8 C51.1 3.1 53 3.3 53.9 5.1 C54.8 8 52.6 11.4 50 12.5 Z M50 12.5 C51 10 54.3 7.9 57 8.7 C58.7 9.7 58.8 11.5 57.3 12.5 C58.8 13.5 58.7 15.3 57 16.3 C54.3 17.1 51 15 50 12.5 Z M50 12.5 C49 15 45.8 17.1 43 16.3 C41.3 15.3 41.2 13.5 42.7 12.5 C41.2 11.5 41.3 9.7 43 8.7 C45.8 7.9 49 10 50 12.5 Z M50 12.5 C52.4 13.4 54.4 16.3 53.6 18.6 C52.7 20.1 51 20.3 50 18.9 C49 20.3 47.3 20.1 46.4 18.6 C45.6 16.3 47.6 13.4 50 12.5 Z M43.2 55.7 A2.3 2.3 0 1 1 43.19 55.7 Z M53.5 51.1 A2.3 2.3 0 1 1 53.49 51.1 Z M58.6 53.3 A1.9 1.9 0 1 1 58.59 53.3 Z', fill: { w: { stops: [[0, '#ffe3ef'], [1, '#f4a3c6']], vector: [0, 4, 0, 20] }, b: { stops: [[0, '#f7a8cb'], [1, '#c2457e']], vector: [0, 4, 0, 20] } }, sw: 1.4 },
      { d: 'M50 10.2 A2.3 2.3 0 1 1 49.99 10.2 Z', fill: { w: '#f3c969', b: '#f3c969' }, sw: 1.2 },
      { d: 'M43 43 C43 40.6 57 40.6 57 43 C57 45.4 43 45.4 43 43 Z', fill: { w: { stops: [[0, '#8fd9b4'], [1, '#2f7a5a']] }, b: { stops: [[0, '#a6ecc8'], [1, '#3f9a72']] } }, sw: 1.2 },
    ],
  },
  'king:synthe': {
    body: `${KING_BASE} M31 81 L35.5 58 L36.5 46 L63.5 46 L64.5 58 L69 81 Z M33.5 46 L66.5 46 L68 44.5 L68 41.5 L66.5 40 L33.5 40 L32 41.5 L32 44.5 Z M33.5 40 L30.5 30 L36 22.5 L44 22.5 L50 28 L56 22.5 L64 22.5 L69.5 30 L66.5 40 Z M46.5 24.8 L46.5 15 L42.5 15 L42.5 16.5 L39.5 16.5 L39.5 6.5 L42.5 6.5 L42.5 8 L46.5 8 L46.5 6.5 L45 6.5 L45 3.5 L55 3.5 L55 6.5 L53.5 6.5 L53.5 8 L57.5 8 L57.5 6.5 L60.5 6.5 L60.5 16.5 L57.5 16.5 L57.5 15 L53.5 15 L53.5 24.8 L50 28 Z`,
    details: 'M37 57 L63 57 M35 63 L65 63 M33.5 71 L66.5 71 M45.5 57 L38 77 M50 57 L50 77 M54.5 57 L62 77',
    detailWidth: 1.6,
    pal: pal({ top: '#ffffff', bottom: '#e9e5f3', stroke: '#1b1030', detail: '#8f78c4' }, { top: '#40316a', bottom: '#0b0618', stroke: '#04020a', detail: '#5f86d8' }),
    ornaments: [
      { d: 'M35 32 L45 32 L50 36 L55 32 L65 32 M34.5 43 L65.5 43', fill: 'none', stroke: { w: '#ff3ec8', b: '#38f2ff' }, sw: 2.4 },
      { d: 'M48 9.5 L52 9.5 L52 13.5 L48 13.5 Z', fill: { w: '#ff3ec8', b: '#38f2ff' }, stroke: { w: '#ff3ec8', b: '#38f2ff' }, sw: 3, strokeOpacity: 0.4 },
      { d: 'M45.2 53.4 A6 6 0 0 1 54.8 53.4 Z M44.64 54.3 L55.36 54.3 L55.75 55.3 L44.25 55.3 Z M44.05 56.2 L55.95 56.2 L56 57 L44 57 Z', fill: { w: { stops: [[0, '#ffb13b'], [1, '#ff3ec8']], vector: [0, 51, 0, 57] }, b: { stops: [[0, '#fff36b'], [1, '#ff3ec8']], vector: [0, 51, 0, 57] } }, stroke: 'none' },
    ],
  },
  'king:braise': {
    body: `${KING_BASE} M31 81 C34 69 37.5 58 36.5 46 L63.5 46 C62.5 58 66 69 69 81 Z M33 46 L67 46 L67 40 L33 40 Z M33.5 40 C30.2 35.2 29.2 29.6 30.6 22.6 C32.4 26.4 35.4 28.4 38.4 28.8 C37 25 37.6 20.8 40.4 17.4 C41 21.4 43 24.8 46.4 26.6 L50 27.8 L53.6 26.6 C57 24.8 59 21.4 59.6 17.4 C62.4 20.8 63 25 61.6 28.8 C64.6 28.4 67.6 26.4 69.4 22.6 C70.8 29.6 69.8 35.2 66.5 40 Z`,
    details: 'M37.5 51 L62.5 51 M34 74 Q50 70.5 66 74 M35.6 37 C34.6 34.4 33.9 31.4 33.6 28.6 M64.4 37 C65.4 34.4 66.1 31.4 66.4 28.6 M42.9 31.6 C42.1 28.8 41.8 26 42 23.4 M57.1 31.6 C57.9 28.8 58.2 26 58 23.4 M48.6 52.5 L51.2 57 L48.2 61.5 L51.6 66.5 L49.6 70.6 M51.2 57 L54.6 59.2',
    pal: pal({ top: '#fffaf2', bottom: '#ebd2b2', stroke: '#2a1a12', detail: '#b5652e' }, { top: '#4d3b35', bottom: '#110a07', stroke: '#050302', detail: '#ff8a2a' }),
    ornaments: [
      { d: 'M46.6 26 L46.6 15.4 C44 15.4 41.5 13.8 39.2 11.6 C41.5 10.6 44 10 46.6 10 C46.6 7.6 48 5.6 50.4 3.5 C52.4 5.8 53.4 7.8 53.4 10 C56 10 58.5 10.6 60.8 11.6 C58.5 13.8 56 15.4 53.4 15.4 L53.4 26 Z', fill: { w: { stops: [[0, '#fff3b8'], [0.42, '#ffb22e'], [1, '#ff4a1c']] }, b: { stops: [[0, '#fff3b8'], [0.42, '#ffb22e'], [1, '#ff4a1c']] } }, sw: 1.8 },
      { d: 'M50 40.6 L52.6 43 L50 45.4 L47.4 43 Z', fill: { w: { stops: [[0, '#ffd36b'], [1, '#ff5a1a']] }, b: { stops: [[0, '#ffe08a'], [1, '#ff7a1a']] } }, sw: 1.4 },
      { d: 'M38.6 41.75 A1.25 1.25 0 1 1 38.59 41.75 Z M61.4 41.75 A1.25 1.25 0 1 1 61.39 41.75 Z', fill: { w: '#c9a24e', b: '#c9a24e' }, sw: 1 },
    ],
  },
  'king:laure': {
    body: `${KING_BASE} M31 81 C34 69 37.5 58 36.5 46 L63.5 46 C62.5 58 66 69 69 81 Z M33 46 L67 46 L67 40 L33 40 Z M35.5 40 C35.5 31 42 25.5 50 25.5 C58 25.5 64.5 31 64.5 40 Z M46.6 7.6 L45 3.5 L55 3.5 L53.4 7.6 L59 5.9 L59 16.1 L53.4 14.4 L54.4 26 L45.6 26 L46.6 14.4 L41 16.1 L41 5.9 Z`,
    details: 'M37.5 51 L62.5 51 M34 74 Q50 70.5 66 74 M43.5 55.5 L42.7 70 M50 55.5 L50 70 M56.5 55.5 L57.3 70',
    pal: pal({ top: '#ffffff', bottom: '#e3e1db', stroke: '#2b2b30', detail: '#8f8a7c' }, { top: '#64646d', bottom: '#18181d', stroke: '#060608', detail: '#cfc8b2' }),
    ornaments: [
      { d: 'M38.4 33.2q0.4 5.1 -4.6 6q-0.4 -5.1 4.6 -6zM61.6 33.2q5 1 4.6 6q-5 -1 -4.6 -6zM29.9 32.4q4.7 2 3.3 6.9q-4.7 -2 -3.3 -6.9zM70.1 32.4q1.4 4.9 -3.3 6.9q-1.4 -4.9 3.3 -6.9zM40.6 30.5q-1 5 -6 4.6q1 -5 6 -4.6zM59.4 30.5q5.1 -0.4 6 4.6q-5.1 0.4 -6 -4.6zM32.6 27.4q4 3.1 1.4 7.5q-4 -3.1 -1.4 -7.5zM67.4 27.4q2.6 4.3 -1.4 7.5q-2.6 -4.3 1.4 -7.5zM43.3 28.4q-2.2 4.6 -7 2.9q2.2 -4.6 7 -2.9zM56.7 28.4q4.8 -1.7 7 2.9q-4.8 1.7 -7 -2.9zM36.4 23.3q3.1 4.1 -0.6 7.6q-3.1 -4.1 0.6 -7.6zM63.6 23.3q3.6 3.5 0.6 7.6q-3.6 -3.5 -0.6 -7.6zM46.6 27q-3.3 3.8 -7.5 1q3.3 -3.8 7.5 -1zM53.4 27q4.2 -2.8 7.5 1q-4.2 2.8 -7.5 -1zM41.2 20.4q1.9 4.7 -2.5 7.2q-1.9 -4.7 2.5 -7.2zM58.8 20.4q4.4 2.5 2.5 7.2q-4.4 -2.5 -2.5 -7.2zM50.1 26.6q-4.2 2.8 -7.5 -1q4.2 -2.8 7.5 1zM49.9 26.6q3.3 -3.8 7.5 -1q-3.3 3.8 -7.5 1zM46.6 18.8q0.6 5 -4.3 6.3q-0.6 -5 4.3 -6.3zM53.4 18.8q4.9 1.2 4.3 6.3q-4.9 -1.2 -4.3 -6.3z', fill: { w: { stops: [[0, '#f6dd8e'], [1, '#c99a3a']] }, b: { stops: [[0, '#f8e39a'], [1, '#d4a548']] } }, sw: 1.2 },
      { d: 'M45.5 43 L50 41 L54.5 43 L50 45 Z', fill: { w: { stops: [[0, '#f6dd8e'], [1, '#c99a3a']] }, b: { stops: [[0, '#f8e39a'], [1, '#d4a548']] } }, sw: 1.2 },
    ],
  },
  'king:rubis': {
    body: `${KING_BASE} M31 81 C34 69 37.5 58 36.5 46 L63.5 46 C62.5 58 66 69 69 81 Z M32.5 46.5 L67.5 46.5 L67.5 39 L32.5 39 Z M33.5 39 C31 30.5 35 23.5 42.5 23 C46 22.8 48.5 24.5 50 26.5 C51.5 24.5 54 22.8 57.5 23 C65 23.5 69 30.5 66.5 39 Z M47.4 15.2 L47.4 11.8 L43.2 11.8 L43.2 7.4 L47.4 7.4 L47.4 3.5 L52.6 3.5 L52.6 7.4 L56.8 7.4 L56.8 11.8 L52.6 11.8 L52.6 15.2 Z`,
    details: 'M37.5 51.5 L62.5 51.5 M34 74 Q50 70.5 66 74 M50 57.5 L53.6 62.6 L50 67.7 L46.4 62.6 Z',
    pal: pal({ top: '#fff8f4', bottom: '#ecd6c9', stroke: '#2e0b14', detail: '#9e6b4a' }, { top: '#5c2833', bottom: '#130409', stroke: '#050102', detail: '#e0b25e' }),
    ornaments: [
      { d: 'M37.6 37 C36.2 31.2 38.6 27.2 43 26.8 C45.4 26.6 46.9 27.7 47.8 29 L47.8 37 Z M62.4 37 C63.8 31.2 61.4 27.2 57 26.8 C54.6 26.6 53.1 27.7 52.2 29 L52.2 37 Z M50 40.05 A2.7 2.7 0 1 1 49.99 40.05 Z', fill: { w: { stops: [[0, '#ff6b85'], [1, '#b3122f']] }, b: { stops: [[0, '#ff7a92'], [1, '#c4163a']] } }, sw: 1.5 },
      { d: 'M50 14.6 A5 5 0 1 1 49.99 14.6 Z', fill: { w: { stops: [[0, '#ffeaa6'], [1, '#c8902c']] }, b: { stops: [[0, '#ffeaa6'], [1, '#d29a34']] } } },
      { d: 'M35.3 30.15 A1.35 1.35 0 1 1 35.29 30.15 Z M39.2 24.55 A1.35 1.35 0 1 1 39.19 24.55 Z M64.7 30.15 A1.35 1.35 0 1 1 64.69 30.15 Z M60.8 24.55 A1.35 1.35 0 1 1 60.79 24.55 Z M40.6 41.25 A1.5 1.5 0 1 1 40.59 41.25 Z M59.4 41.25 A1.5 1.5 0 1 1 59.39 41.25 Z', fill: { w: '#fffdf8', b: '#f6ead6' }, sw: 1 },
    ],
  },
  'king:eclipse': {
    body: `${KING_BASE} M31 81 C34 69 37.5 58 36.5 46 L63.5 46 C62.5 58 66 69 69 81 Z M33 46 L67 46 L67 40 L33 40 Z M36 40 C36 30.5 42.3 24.5 50 24.5 C57.7 24.5 64 30.5 64 40 Z M46.5 25 L46.5 15 L41 15 L41 9 L46.5 9 L46.5 3.5 L53.5 3.5 L53.5 9 L59 9 L59 15 L53.5 15 L53.5 25 Z`,
    details: 'M37.5 51 L62.5 51 M34 74 Q50 70.5 66 74 M40.5 33.5 C42 29.8 45 27.6 49 27.2',
    pal: pal({ top: '#ffffff', bottom: '#e0dbe7', stroke: '#1d1530', detail: '#8b6fc2' }, { top: '#4a3d68', bottom: '#08050f', stroke: '#020104', detail: '#b88cff' }),
    ornaments: [
      { d: 'M70.45 26.36 A21.5 7 -18 1 1 29.55 39.64 A21.5 7 -18 1 1 70.45 26.36 Z M65.69 27.9 A16.5 3.8 -18 1 1 34.31 38.1 A16.5 3.8 -18 1 1 65.69 27.9 Z', fill: { w: { stops: [[0, '#b98bff'], [1, '#6a1fe0']], vector: [29, 0, 71, 0] }, b: { stops: [[0, '#f0e2ff'], [1, '#a46bff']], vector: [29, 0, 71, 0] } }, stroke: 'none', rule: 'evenodd', under: true },
      { d: 'M29.55 39.64 A21.5 7 -18 0 0 70.45 26.36 L65.69 27.9 A16.5 3.8 -18 0 1 34.31 38.1 Z', fill: { w: { stops: [[0, '#b98bff'], [1, '#6a1fe0']], vector: [29, 0, 71, 0] }, b: { stops: [[0, '#f0e2ff'], [1, '#a46bff']], vector: [29, 0, 71, 0] } }, stroke: 'none' },
      { d: 'M50 40.6 A2.4 2.4 0 1 1 49.99 40.6 Z', fill: { w: '#12001f', b: '#0a0012' }, stroke: { w: '#8b3dff', b: '#c9a2ff' }, sw: 1.5 },
    ],
  },
  'king:astral': {
    body: `${KING_BASE} M31 81 C34 69 37.5 58 36.5 46 L63.5 46 C62.5 58 66 69 69 81 Z M33 46 L67 46 L67 40 L33 40 Z M38.5 40 A11.5 11.5 0 0 1 61.5 40 Z`,
    details: 'M34.5 43 L65.5 43 M37.5 51 L62.5 51 M34 74 Q50 70.5 66 74',
    pal: pal({ top: '#ffffff', bottom: '#e8e0ca', stroke: '#1d2244', detail: '#b08c3e' }, { top: '#4f5170', bottom: '#0b0b18', stroke: '#03040e', detail: '#e8c66a' }),
    ornaments: [
      { d: 'M50 40 L36 40 L30.01 35.44 L37.39 33.93 L33.97 27.22 L41.27 29.05 L41.11 21.53 L46.88 26.35 L50 19.5 L53.12 26.35 L58.89 21.53 L58.73 29.05 L66.03 27.22 L62.61 33.93 L69.99 35.44 L64 40 Z', fill: { w: { stops: [[0, '#fff3c4'], [1, '#e9b23e']], vector: [0, 19.5, 0, 40] }, b: { stops: [[0, '#fff3c4'], [1, '#f3c969']], vector: [0, 19.5, 0, 40] } }, sw: 1.2, under: true },
      { d: 'M50 3.5 Q52.28 11.1 59.5 13.5 Q52.28 17.34 50 29.5 Q47.72 17.34 40.5 13.5 Q47.72 11.1 50 3.5 Z', fill: { w: { stops: [[0, '#fff3c4'], [1, '#e9b23e']], vector: [0, 3.5, 0, 29.5] }, b: { stops: [[0, '#fff3c4'], [1, '#f3c969']], vector: [0, 3.5, 0, 29.5] } }, sw: 1.5 },
      { d: 'M48.89 56.63 A6.4 6.4 0 1 0 55.67 64.71 A5.3 5.3 0 1 1 48.89 56.63 Z', fill: { w: '#e0a93a', b: '#f3c969' }, sw: 1.2 },
    ],
  },
};

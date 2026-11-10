// Textures procédurales (aucune image externe) : particules et ornements des skins.
// Chaque forme de particule et chaque motif a son peintre : tracé blanc (ou gris) sur fond transparent, teinté par le
// matériau. Les peintres sont rangés dans deux tables indexées par toutes les valeurs des unions ParticleShape et
// Flourish : une valeur ajoutée au catalogue sans son peintre ne compile pas, et test/textures.test.ts vérifie que
// chacun dessine quelque chose (et que les textures d'avant les skins n'ont pas changé d'un trait).
import * as THREE from 'three';
import type { Flourish, ParticleShape } from '../../shared/catalog';

/** Peintre d'une texture : dessine sur `g`, un carré de `S` pixels. */
export type Painter = (g: CanvasRenderingContext2D, S: number) => void;

/** Côté des textures de particules (pixels). */
export const PARTICLE_SIZE = 64;
/** Côté des textures d'ornements (pixels) ; les tracés sont écrits pour 512. */
export const FLOURISH_SIZE = 512;

/**
 * Couronne de laurier : rayon des deux rameaux, en pixels de la texture de 512. Ils partent du bas de ce cercle, où
 * le nœud les attache : c'est la charnière autour de laquelle la couronne se referme (effects.ts, laurelDisk).
 */
export const LAUREL_R = 182;

const cache = new Map<string, THREE.Texture>();

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Cercle centré (ornements de 512 px). */
function ring(g: CanvasRenderingContext2D, m: number, r: number, w: number, dash?: number[]) {
  g.lineWidth = w;
  g.setLineDash(dash ?? []);
  g.beginPath();
  g.arc(m, m, r, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
}

// ---------------------------------------------------------------------------------------------
// Particules (64 px)

const star: Painter = (g, S) => {
  const m = S / 2;
  const gr = g.createRadialGradient(m, m, 0, m, m, m * 0.6);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? m * 0.98 : m * 0.12;
    g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
};

/**
 * Éclat de gemme taillé (Écarlate) : losange allongé à quatre facettes, la plus claire en haut à gauche, la plus
 * sombre en bas à droite, sur un halo doux. Il tourne sur lui-même en retombant (spin des particules) : les facettes
 * accrochent la lumière tour à tour. Dessin d'art-b (atelier, textures-proposees.js).
 */
const shard: Painter = (g, S) => {
  const m = S / 2;
  const halo = g.createRadialGradient(m, m, 0, m, m, m * 0.7);
  halo.addColorStop(0, 'rgba(255,255,255,0.45)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);
  type P = readonly [number, number];
  const top: P = [m, m * 0.12], right: P = [m * 1.42, m * 0.86], bottom: P = [m, m * 1.9], left: P = [m * 0.58, m * 0.86];
  const mid: P = [m, m * 0.86];
  const facet = (a: P, b: P, c: P, alpha: number) => {
    g.fillStyle = `rgba(255,255,255,${alpha})`;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.lineTo(c[0], c[1]);
    g.closePath();
    g.fill();
  };
  facet(top, mid, left, 1);
  facet(top, right, mid, 0.78);
  facet(left, mid, bottom, 0.62);
  facet(mid, right, bottom, 0.4);
};

/**
 * Feuille de laurier, proposée pour Laurier à la place du pétale (plan, « plus tard », n° 5). La couleur d'une particule
 * multiplie sa texture (particles.ts) : le bas rose du pétale de Sakura rend l'or de Laurier orangé, sa crème rose et
 * son vert kaki. Ici, une amande blanche sans dégradé coloré : une moitié plus sombre que l'autre (la feuille pliée sur
 * sa nervure), nervure et pétiole gris. Hors de PARTICLE_PAINTERS tant que ParticleShape n'a pas la valeur 'leaf'
 * (types.ts, figé : lot F, après accord du fondateur) ; test/sorts.mjs la montre déjà sur la planche.
 */
export const leafPainter: Painter = (g, S) => {
  const m = S / 2;
  const tip = -m * 0.88, base = m * 0.66, W = m * 0.68, cy = (tip + base) / 2;
  g.translate(m, m);
  g.fillStyle = 'rgb(255,255,255)';
  g.beginPath();
  g.moveTo(0, tip);
  g.quadraticCurveTo(-W, cy, 0, base);
  g.quadraticCurveTo(W, cy, 0, tip);
  g.fill();
  // Moitié à l'ombre
  g.fillStyle = 'rgb(200,200,200)';
  g.beginPath();
  g.moveTo(0, tip);
  g.quadraticCurveTo(W, cy, 0, base);
  g.closePath();
  g.fill();
  // Nervure et pétiole
  g.strokeStyle = 'rgb(150,150,150)';
  g.lineWidth = S / 40;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, tip + m * 0.12);
  g.lineTo(0, m * 0.86);
  g.stroke();
};

export const PARTICLE_PAINTERS: Record<ParticleShape, Painter> = {
  glow: (g, S) => {
    const m = S / 2;
    const gr = g.createRadialGradient(m, m, 0, m, m, m);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.25)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  },
  ember: (g, S) => {
    const m = S / 2;
    const gr = g.createRadialGradient(m, m, 0, m, m, m);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.12, 'rgba(255,250,220,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(m, m, m * 0.55, m, 0, 0, Math.PI * 2);
    g.fill();
  },
  pixel: (g, S) => {
    const m = S / 2;
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(m - 22, m - 22, 44, 44);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.fillRect(m - 12, m - 12, 24, 24);
  },
  star,
  petal: (g, S) => {
    const m = S / 2;
    g.translate(m, m);
    const gr = g.createLinearGradient(0, -m, 0, m);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,200,225,1)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, m * 0.9);
    g.bezierCurveTo(m * 0.85, m * 0.3, m * 0.6, -m * 0.75, m * 0.12, -m * 0.82);
    g.lineTo(0, -m * 0.6);
    g.lineTo(-m * 0.12, -m * 0.82);
    g.bezierCurveTo(-m * 0.6, -m * 0.75, -m * 0.85, m * 0.3, 0, m * 0.9);
    g.fill();
  },
  void: (g, S) => {
    const m = S / 2;
    const gr = g.createRadialGradient(m, m, 0, m, m, m);
    gr.addColorStop(0, 'rgba(10,0,20,1)');
    gr.addColorStop(0.35, 'rgba(25,0,45,0.95)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  },
  shard,
};

// ---------------------------------------------------------------------------------------------
// Ornements (512 px), tracés après le réglage commun de flourishTexture (trait blanc arrondi, halo de 10 px)

const runes: Painter = (g, S) => {
  const m = S / 2;
  const rand = mulberry('runes'.length * 97);
  ring(g, m, 240, 5);
  ring(g, m, 222, 2);
  ring(g, m, 160, 3);
  ring(g, m, 150, 1.5, [6, 10]);
  g.lineWidth = 3;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.save();
    g.translate(m + Math.cos(a) * 191, m + Math.sin(a) * 191);
    g.rotate(a + Math.PI / 2);
    g.beginPath();
    const h = 13;
    const k = Math.floor(rand() * 4);
    g.moveTo(-6, -h);
    g.lineTo(-6, h);
    if (k === 0) { g.moveTo(-6, -h); g.lineTo(7, 0); g.lineTo(-6, h); }
    if (k === 1) { g.moveTo(-6, -2); g.lineTo(8, -h); g.moveTo(-6, 4); g.lineTo(8, h); }
    if (k === 2) { g.moveTo(6, -h); g.lineTo(6, h); g.moveTo(-6, 0); g.lineTo(6, 0); }
    if (k === 3) { g.moveTo(-6, -h); g.lineTo(8, -4); g.lineTo(-6, 4); }
    g.stroke();
    g.restore();
  }
  // étoile à six branches
  g.lineWidth = 2.5;
  g.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const b = a + Math.PI / 3 * 2;
    g.moveTo(m + Math.cos(a) * 150, m + Math.sin(a) * 150);
    g.lineTo(m + Math.cos(b) * 150, m + Math.sin(b) * 150);
  }
  g.stroke();
};

/**
 * Couronne de laurier (Laurier) : deux rameaux de feuilles en amande montent du nœud, en bas, et laissent une
 * ouverture en haut, dans un anneau fin doublé d'un perlé. Feuilles de plus en plus petites vers les pointes. Dessin
 * d'art-b (atelier, textures-proposees.js) ; chaque rameau reste dans sa moitié de la texture (x < 256 ou x > 256),
 * ce que la fermeture de la couronne demande.
 */
const laurel: Painter = (g, S) => {
  const m = S / 2;
  ring(g, m, 244, 2.5);
  ring(g, m, 232, 1, [2, 7]);
  const R = LAUREL_R;
  const leaf = (x: number, y: number, a: number, L: number, W: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.beginPath();
    g.moveTo(0, -L / 2);
    g.quadraticCurveTo(W * 2, 0, 0, L / 2);
    g.quadraticCurveTo(-W * 2, 0, 0, -L / 2);
    g.fill();
    g.restore();
  };
  // φ part du bas (0) et monte jusqu'à 2,8 rad de chaque côté ; s = −1 rameau gauche, +1 rameau droit
  for (const s of [-1, 1]) {
    g.lineWidth = 4;
    g.beginPath();
    g.arc(m, m, R, Math.PI / 2 - s * 0.15, Math.PI / 2 - s * 2.8, s > 0);
    g.stroke();
    for (let i = 0; i < 9; i++) {
      const phi = 0.32 + i * 0.29;
      const x = m + s * R * Math.sin(phi), y = m + R * Math.cos(phi);
      // tangente montante (0 = vers le haut)
      const a = Math.atan2(s * Math.cos(phi), Math.sin(phi));
      const L = 46 - i * 1.8, W = 9 - i * 0.3;
      for (const k of [-1, 1]) {
        // k = +1 : feuille extérieure, penchée vers l'extérieur ; k = −1 : intérieure
        const t = a + k * s * 0.55;
        const ox = x + k * 5 * s * Math.sin(phi), oy = y + k * 5 * Math.cos(phi);
        leaf(ox + Math.sin(t) * L * 0.42, oy - Math.cos(t) * L * 0.42, t, L, W);
      }
    }
  }
  // nœud
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(m - 16, m + R + 2, 16, 8, -0.3, 0, Math.PI * 2);
  g.ellipse(m + 16, m + R + 2, 16, 8, 0.3, 0, Math.PI * 2);
  g.stroke();
};

/**
 * Filigrane d'orfèvre (Écarlate) : anneau perlé, douze fleurons (lys stylisés, pointe vers l'extérieur) alternés de
 * douze losanges, double anneau intérieur et rosace de huit cercles entrelacés. Dessin d'art-b (atelier,
 * textures-proposees.js). Teint de l'or du skin, et non de sa couleur principale (effects.ts, flourishColor).
 */
const filigree: Painter = (g, S) => {
  const m = S / 2;
  g.lineJoin = 'round';
  ring(g, m, 240, 4);
  ring(g, m, 164, 2.5);
  ring(g, m, 150, 1.5);
  // perlé
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    g.beginPath();
    g.arc(m + Math.cos(a) * 226, m + Math.sin(a) * 226, 3.2, 0, Math.PI * 2);
    g.fill();
  }
  // fleurons et losanges, alternés
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.save();
    g.translate(m + Math.cos(a) * 190, m + Math.sin(a) * 190);
    g.rotate(a + Math.PI / 2);
    g.beginPath();
    if (i % 2 === 0) {
      // pétale central, pointe vers l'extérieur (−y)
      g.moveTo(0, 22);
      g.bezierCurveTo(10, 8, 9, -10, 0, -26);
      g.bezierCurveTo(-9, -10, -10, 8, 0, 22);
      g.fill();
      // deux volutes latérales
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(0, 18);
      g.bezierCurveTo(14, 16, 22, 4, 16, -6);
      g.moveTo(0, 18);
      g.bezierCurveTo(-14, 16, -22, 4, -16, -6);
      g.stroke();
    } else {
      g.moveTo(0, -12);
      g.lineTo(7, 0);
      g.lineTo(0, 12);
      g.lineTo(-7, 0);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  // rosace intérieure : huit cercles entrelacés
  g.lineWidth = 2.5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.arc(m + Math.cos(a) * 52, m + Math.sin(a) * 52, 52, 0, Math.PI * 2);
    g.stroke();
  }
};

export const FLOURISH_PAINTERS: Record<Flourish, Painter> = {
  runes,
  flames: (g, S) => {
    const m = S / 2;
    const rand = mulberry('flames'.length * 97);
    ring(g, m, 236, 6);
    ring(g, m, 210, 2, [3, 9]);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const len = 30 + rand() * 30;
      g.save();
      g.translate(m + Math.cos(a) * 205, m + Math.sin(a) * 205);
      g.rotate(a + Math.PI / 2);
      g.beginPath();
      g.moveTo(-9, 0);
      g.quadraticCurveTo(-6, len * 0.6, 0, len);
      g.quadraticCurveTo(6, len * 0.6, 9, 0);
      g.closePath();
      g.globalAlpha = 0.85;
      g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
    ring(g, m, 120, 3);
  },
  grid: (g, S) => {
    const m = S / 2;
    g.lineWidth = 3;
    g.strokeRect(24, 24, S - 48, S - 48);
    g.lineWidth = 1.5;
    for (let i = 1; i < 8; i++) {
      const p = 24 + ((S - 48) / 8) * i;
      g.beginPath();
      g.moveTo(p, 24);
      g.lineTo(p, S - 24);
      g.moveTo(24, p);
      g.lineTo(S - 24, p);
      g.stroke();
    }
    g.lineWidth = 4;
    g.strokeRect(m - 60, m - 60, 120, 120);
    ring(g, m, 100, 2, [4, 8]);
  },
  constellation: (g, S) => {
    const m = S / 2;
    const rand = mulberry('constellation'.length * 97);
    const pts: [number, number][] = [];
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2;
      const r = 60 + rand() * 170;
      pts.push([m + Math.cos(a) * r, m + Math.sin(a) * r]);
    }
    g.lineWidth = 1.6;
    g.globalAlpha = 0.7;
    g.beginPath();
    for (let i = 0; i < pts.length - 1; i++) {
      g.moveTo(...pts[i]);
      g.lineTo(...pts[(i + 1 + Math.floor(rand() * 2)) % pts.length]);
    }
    g.stroke();
    g.globalAlpha = 1;
    for (const [x, y] of pts) {
      g.beginPath();
      g.arc(x, y, 4 + rand() * 4, 0, Math.PI * 2);
      g.fill();
    }
    ring(g, m, 244, 2.5);
    ring(g, m, 232, 1, [2, 6]);
  },
  vortex: (g, S) => {
    const m = S / 2;
    g.lineWidth = 5;
    for (let arm = 0; arm < 5; arm++) {
      g.beginPath();
      for (let t = 0; t < 1; t += 0.01) {
        const a = arm * ((Math.PI * 2) / 5) + t * Math.PI * 2.4;
        const r = 30 + t * 210;
        const x = m + Math.cos(a) * r;
        const y = m + Math.sin(a) * r;
        if (t === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.globalAlpha = 0.8;
      g.stroke();
    }
    g.globalAlpha = 1;
    ring(g, m, 244, 3);
  },
  petals: (g, S) => {
    const m = S / 2;
    for (let ringIdx = 0; ringIdx < 2; ringIdx++) {
      const n = ringIdx ? 12 : 8;
      const r = ringIdx ? 170 : 95;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ringIdx * 0.2;
        g.save();
        g.translate(m + Math.cos(a) * r, m + Math.sin(a) * r);
        g.rotate(a + Math.PI / 2);
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse(0, 0, 18, 42, 0, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
    }
    ring(g, m, 238, 3);
    ring(g, m, 40, 3);
  },
  laurel,
  filigree,
};

// ---------------------------------------------------------------------------------------------
// Textures

export function particleTexture(shape: ParticleShape): THREE.Texture {
  const key = 'p:' + shape;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(PARTICLE_SIZE);
  // Forme inconnue (catalogue plus récent que ce code) : la lueur, plutôt qu'une texture vide
  (PARTICLE_PAINTERS[shape] ?? PARTICLE_PAINTERS.glow)(g, PARTICLE_SIZE);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Cercle d'ornement tracé en blanc, teinté par le matériau. */
export function flourishTexture(kind: Flourish): THREE.Texture {
  const key = 'f:' + kind;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(FLOURISH_SIZE);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.shadowColor = '#fff';
  g.shadowBlur = 10;
  // Motif inconnu : les runes d'Arcane
  (FLOURISH_PAINTERS[kind] ?? FLOURISH_PAINTERS.runes)(g, FLOURISH_SIZE);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Dégradé vertical pour les colonnes de lumière. */
export function beamTexture(): THREE.Texture {
  const hit = cache.get('beam');
  if (hit) return hit;
  const [c, g] = canvas(64);
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,0.6)');
  h.addColorStop(0.5, 'rgba(0,0,0,0)');
  h.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = h;
  g.fillRect(0, 0, 64, 64);
  const t = finish(c);
  cache.set('beam', t);
  return t;
}

/** Bande horizontale douce (transparente en haut et en bas) : vagues, balayages, lignes de Trêve. */
export function bandTexture(): THREE.Texture {
  const hit = cache.get('band');
  if (hit) return hit;
  const [c, g] = canvas(64);
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.42, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.5, 'rgba(255,255,255,1)');
  gr.addColorStop(0.58, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)');
  h.addColorStop(0.12, 'rgba(0,0,0,0)');
  h.addColorStop(0.88, 'rgba(0,0,0,0)');
  h.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = h;
  g.fillRect(0, 0, 64, 64);
  const t = finish(c);
  cache.set('band', t);
  return t;
}

/** Disque doux (halo) : lune, cœur d'explosion, lueur d'un gouffre. */
export function softDiskTexture(): THREE.Texture {
  const hit = cache.get('soft');
  if (hit) return hit;
  const [c, g] = canvas(128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = finish(c);
  cache.set('soft', t);
  return t;
}

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

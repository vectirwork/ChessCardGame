// Mise en scène de chaque carte. Toutes les couleurs, particules et ornements viennent du skin du lanceur ; ce qui
// distingue une carte (scène, impact, inclinaison, secousse, éclair, ambiance, teinte) est dans sa fiche (cardFx.ts).
// Ne jamais changer l'ordre des appels à Math.random ni des créations d'objets three.js (chacune en tire quatre pour
// son identifiant) : test/sorts.mjs et test/cardfx.test.ts comparent les images et les relevés au hasard semé.
import * as THREE from 'three';
import type { CardInfo, Effect } from '../../shared/game';
import type { SkinStyle } from '../../shared/catalog';
import { skinStyle } from '../../shared/catalog';
import { CARDS } from '../../shared/cards';
import type { CardId } from '../../shared/cards';
import { cardFx } from './cardFx';
import type { CardFx, Mood, SceneKey } from './cardFx';
import { CAST, HALF, N } from './config';
import { Particles } from './particles';
import { Cine, VfxStage, disposeObject, ease } from './stage';
import { FLOURISH_SIZE, FLOURISH_TRAITS, LAUREL_R, PARTICLE_TRAITS, bandTexture, beamTexture, flourishTexture, particleTexture, softDiskTexture } from './textures';

const C = (hex: string) => new THREE.Color(hex);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Palette {
  p: THREE.Color;
  s: THREE.Color;
  a: THREE.Color;
}
const palette = (skin: SkinStyle): Palette => ({ p: C(skin.primary), s: C(skin.secondary), a: C(skin.accent) });
const pick = (pal: Palette) => (Math.random() < 0.5 ? pal.p : Math.random() < 0.6 ? pal.s : pal.a);
/** Couleur visible même pour les skins sombres (Néant : PARTICLE_TRAITS, `glow`). */
const glowColor = (skin: SkinStyle) => (PARTICLE_TRAITS[skin.particle]?.glow === 'accent' ? C(skin.accent) : C(skin.primary));
/** Le motif prend la couleur secondaire du skin (FLOURISH_TRAITS, `color`). */
const secondaryFlourish = (skin: SkinStyle) => FLOURISH_TRAITS[skin.flourish]?.color === 'secondary';
/** Le motif est une couronne qui se referme, sans jamais tourner (FLOURISH_TRAITS, `motion`). */
const closingFlourish = (skin: SkinStyle) => FLOURISH_TRAITS[skin.flourish]?.motion === 'close';
/**
 * Teinte du motif d'ornement : celle des effets (glowColor), sauf le filigrane, un travail d'orfèvre, qui prend la
 * couleur secondaire du skin (l'or d'Écarlate : « des éclats de rubis […] sous un anneau de filigrane d'or »).
 */
export const flourishColor = (skin: SkinStyle) => (secondaryFlourish(skin) ? C(skin.secondary) : glowColor(skin));

function additive(color: THREE.Color, opts: Partial<THREE.MeshBasicMaterialParameters> = {}) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...opts,
  });
}

/** Objet temporaire ajouté au plateau, avec une fonction d'animation. */
function spawn(stage: VfxStage, obj: THREE.Object3D, life: number, anim: (k: number, t: number, dt: number) => void, delay = 0) {
  let t = -delay;
  let added = false;
  stage.add({
    update(dt) {
      t += dt;
      if (t < 0) return true;
      if (!added) {
        stage.board.add(obj);
        added = true;
      }
      const k = Math.min(1, t / life);
      anim(k, t, dt);
      return k < 1;
    },
    dispose() {
      disposeObject(obj);
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Briques

/**
 * Motif d'ornement du skin, posé à plat sous `at` : il s'ouvre (échelle), tourne (`spin`, radians par seconde) et
 * s'efface sur ses 30 derniers pour cent. `peak` : opacité au plus fort. La couronne de laurier ne tourne pas : elle se
 * referme (laurelDisk).
 */
export function flourishDisk(stage: VfxStage, skin: SkinStyle, at: THREE.Vector3, radius: number, life: number, delay = 0, spin = 0.8, peak = 0.95) {
  if (closingFlourish(skin)) {
    laurelDisk(stage, skin, at, radius, life, delay, peak);
    return;
  }
  const mat = additive(flourishColor(skin), { map: flourishTexture(skin.flourish), opacity: 0 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  m.position.set(at.x, at.y, 0.02);
  m.renderOrder = 2;
  spawn(stage, m, life, (k, t) => {
    const s = ease.outBack(Math.min(1, k * 4));
    m.scale.setScalar(Math.max(0.01, s));
    m.rotation.z = t * spin;
    mat.opacity = k < 0.7 ? Math.min(1, k * 6) * peak : (1 - (k - 0.7) / 0.3) * peak;
  }, delay);
}

/** Ouverture de la couronne de laurier au début de son animation (radians, chaque rameau). */
const LAUREL_OPEN = 0.5;

/**
 * Couronne de laurier (skin Laurier) : « une couronne de vainqueur qui se referme à chaque sort ». Les deux moitiés de
 * la texture, un rameau chacune, sont deux plans qui pivotent autour du nœud, en bas : écartées au départ, elles se
 * referment pendant les 40 premiers pour cent de la vie du motif (sans rebond, pour que les moitiés ne se chevauchent
 * pas), puis la couronne reste droite, ouverture en haut de l'écran, et s'efface comme les autres motifs. Elle ne
 * tourne jamais, ici comme dans la brûlure et la lune de sang.
 */
function laurelDisk(stage: VfxStage, skin: SkinStyle, at: THREE.Vector3, radius: number, life: number, delay: number, peak: number) {
  const mat = additive(flourishColor(skin), { map: flourishTexture(skin.flourish), opacity: 0 });
  // Nœud des rameaux (charnière), sous le centre : LAUREL_R pixels sur 256 de demi-texture
  const pivot = (LAUREL_R / (FLOURISH_SIZE / 2)) * radius;
  const group = new THREE.Group();
  group.position.set(at.x, at.y, 0.02);
  group.renderOrder = 2;
  const halves = ([-1, 1] as const).map(side => {
    const g = new THREE.PlaneGeometry(radius, radius * 2);
    // Moitié gauche (u de 0 à 0,5) ou droite (u de 0,5 à 1) de la texture
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + (side > 0 ? 0.5 : 0));
    // Origine du plan au nœud : il pivote autour
    g.translate((side * radius) / 2, pivot, 0);
    const half = new THREE.Mesh(g, mat);
    half.position.set(0, -pivot, 0);
    half.renderOrder = 2;
    group.add(half);
    return { half, side };
  });
  spawn(stage, group, life, k => {
    // La couronne est pleinement visible dès k ≈ 0,08, encore ouverte ; elle se referme ensuite sous les yeux, en
    // douceur aux deux bouts, et l'est tout à fait à 40 % de sa vie
    const close = ease.inOutCubic(Math.min(1, k * 2.5));
    for (const { half, side } of halves) half.rotation.z = -side * LAUREL_OPEN * (1 - close);
    group.scale.setScalar(0.72 + 0.28 * close);
    mat.opacity = k < 0.7 ? Math.min(1, k * 12) * peak : (1 - (k - 0.7) / 0.3) * peak;
  }, delay);
}

export function burst(stage: VfxStage, skin: SkinStyle, at: THREE.Vector3, n: number, speed: number, life: number, size: number, opts: { up?: number; gravity?: number; spread?: number } = {}) {
  const ps = stage.particles(skin);
  const pal = palette(skin);
  const up = opts.up ?? 0.6;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const el = Math.random() * up;
    const v = speed * rnd(0.35, 1);
    ps.emit({
      x: at.x + rnd(-0.1, 0.1), y: at.y + rnd(-0.1, 0.1), z: at.z + rnd(0, 0.15),
      vx: Math.cos(a) * v * (1 - el), vy: Math.sin(a) * v * (1 - el), vz: v * el * 1.8,
      color: pick(pal), size: size * rnd(0.6, 1.3), life: life * rnd(0.6, 1.2),
      gravity: (opts.gravity ?? -2.5) + skin.drift * 2.2, drag: 1.6, spin: rnd(-4, 4),
    });
  }
}

export function converge(stage: VfxStage, skin: SkinStyle, at: THREE.Vector3, n: number, radius: number, duration: number) {
  const ps = stage.particles(skin);
  const pal = palette(skin);
  let emitted = 0;
  let t = 0;
  stage.add({
    update(dt) {
      t += dt;
      const target = Math.min(n, Math.floor((t / duration) * n));
      for (; emitted < target; emitted++) {
        const a = Math.random() * Math.PI * 2;
        const r = radius * rnd(0.7, 1.2);
        const x = at.x + Math.cos(a) * r, y = at.y + Math.sin(a) * r, z = at.z + rnd(0.2, 1.6);
        ps.emit({
          x, y, z, vx: -Math.sin(a) * 2.2, vy: Math.cos(a) * 2.2, vz: 0,
          color: pick(pal), size: rnd(0.08, 0.2), life: rnd(0.45, 0.8),
          attract: { x: at.x, y: at.y, z: at.z + 0.4, k: 24 }, drag: 2.5, fadeIn: 0.15,
        });
      }
      return t < duration;
    },
  });
}

export function shockwave(stage: VfxStage, color: THREE.Color, at: THREE.Vector3, maxR: number, life: number, delay = 0, width = 0.08) {
  const mat = additive(color, { opacity: 0.9 });
  const m = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 96), mat);
  m.position.set(at.x, at.y, 0.03);
  spawn(stage, m, life, k => {
    m.scale.setScalar(0.05 + ease.outCubic(k) * maxR);
    mat.opacity = 0.95 * (1 - k);
  }, delay);
}

export function beam(stage: VfxStage, color: THREE.Color, at: THREE.Vector3, height: number, radius: number, life: number, delay = 0) {
  const mat = additive(color, { map: beamTexture(), opacity: 0 });
  const g = new THREE.CylinderGeometry(radius, radius * 1.15, height, 32, 1, true);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(at.x, at.y, height / 2);
  spawn(stage, m, life, (k, t) => {
    const env = k < 0.2 ? k / 0.2 : k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
    mat.opacity = env * 0.95;
    m.scale.set(0.3 + env * 0.9, 0.3 + env * 0.9, 1);
    m.rotation.z = t * 2;
  }, delay);
}

function lightningPath(from: THREE.Vector3, to: THREE.Vector3, segments: number, jitter: number): THREE.Vector3[] {
  const pts = [from.clone()];
  for (let i = 1; i < segments; i++) {
    const k = i / segments;
    const p = from.clone().lerp(to, k);
    const j = jitter * Math.sin(k * Math.PI);
    p.x += rnd(-j, j);
    p.y += rnd(-j, j);
    pts.push(p);
  }
  pts.push(to.clone());
  return pts;
}

function boltMesh(points: THREE.Vector3[], color: THREE.Color, radius: number) {
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < points.length - 1; i++) path.add(new THREE.LineCurve3(points[i], points[i + 1]));
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.TubeGeometry(path, points.length * 3, radius, 6, false), additive(C('#ffffff')));
  const glow = new THREE.Mesh(new THREE.TubeGeometry(path, points.length * 3, radius * 4, 8, false), additive(color, { opacity: 0.45 }));
  group.add(glow, core);
  return group;
}

export function lightning(stage: VfxStage, skin: SkinStyle, at: THREE.Vector3, life = 0.45) {
  const color = glowColor(skin);
  const top = new THREE.Vector3(at.x + rnd(-1.2, 1.2), at.y + rnd(1, 2.5), 11);
  const group = new THREE.Group();
  const main = lightningPath(top, new THREE.Vector3(at.x, at.y, 0.05), 16, 0.9);
  group.add(boltMesh(main, color, 0.035));
  for (let b = 0; b < 3; b++) {
    const start = main[3 + Math.floor(Math.random() * 9)];
    const end = start.clone().add(new THREE.Vector3(rnd(-1.6, 1.6), rnd(-1.6, 1.6), -rnd(1.5, 3.5)));
    group.add(boltMesh(lightningPath(start, end, 7, 0.5), color, 0.018));
  }
  spawn(stage, group, life, k => {
    group.visible = k < 0.15 || (k > 0.25 && k < 0.45) || (k > 0.55 && k < 0.8 && Math.random() > 0.3);
    group.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (m) m.opacity = (m.color.getHex() === 0xffffff ? 1 : 0.45) * (1 - k * 0.6);
    });
  });
}

function scorch(stage: VfxStage, skin: SkinStyle, at: THREE.Vector3) {
  const tex = flourishTexture(skin.flourish);
  const mat = new THREE.MeshBasicMaterial({ color: C('#000000'), transparent: true, opacity: 0.55, depthWrite: false, depthTest: false });
  const disk = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), mat);
  disk.position.set(at.x, at.y, 0.01);
  spawn(stage, disk, 1.8, k => {
    mat.opacity = 0.55 * (1 - k);
    disk.scale.setScalar(0.6 + ease.outCubic(Math.min(1, k * 3)) * 0.5);
  });
  const glow = additive(flourishColor(skin), { map: tex, opacity: 0.9 });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), glow);
  ring.position.set(at.x, at.y, 0.02);
  // La couronne de laurier ne tourne pas (laurelDisk)
  const spin = closingFlourish(skin) ? 0 : -3;
  spawn(stage, ring, 1.2, (k, t) => {
    glow.opacity = 0.9 * (1 - k);
    ring.rotation.z = t * spin;
    ring.scale.setScalar(0.5 + k * 0.8);
  });
}

/** Cristal hexagonal pointant vers le haut (z). */
function crystal(height: number, radius: number, skin: SkinStyle, tint = '#e8fbff') {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: C(tint).lerp(C(skin.primary), 0.55),
    emissive: C(skin.primary),
    emissiveIntensity: 0.7,
    roughness: 0.12,
    metalness: 0.25,
    transparent: true,
    opacity: 0.86,
    flatShading: true,
  });
  const body = new THREE.CylinderGeometry(radius * 0.86, radius, height * 0.72, 6);
  body.rotateX(Math.PI / 2);
  body.translate(0, 0, height * 0.36);
  const tip = new THREE.ConeGeometry(radius * 0.86, height * 0.28, 6);
  tip.rotateX(Math.PI / 2);
  tip.translate(0, 0, height * 0.86);
  const edgeMat = new THREE.LineBasicMaterial({ color: C(skin.accent), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const geo of [body, tip]) {
    g.add(new THREE.Mesh(geo, mat));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
  }
  return { group: g, mat };
}

function crystalCluster(skin: SkinStyle, scale = 1) {
  const g = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const specs: [number, number, number, number, number][] = [
    [0, 0.02, 1.55, 0.22, 0],
    [0.25, 0.12, 1.05, 0.16, 0.35],
    [-0.24, 0.16, 0.95, 0.15, -0.4],
    [0.08, -0.26, 0.8, 0.14, 0.3],
    [-0.22, -0.2, 0.7, 0.13, -0.25],
    [0.3, -0.18, 0.55, 0.11, 0.45],
  ];
  for (const [x, y, h, r, lean] of specs) {
    const c = crystal(h * scale, r * scale, skin);
    c.group.position.set(x * scale, y * scale, 0);
    c.group.rotation.set(lean * Math.sign(y || 1) * 0.6, lean, 0);
    g.add(c.group);
    mats.push(c.mat);
  }
  return { group: g, mats };
}

function iceCube(skin: SkinStyle) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.84, 0.84, 0.95);
  geo.translate(0, 0, 0.475);
  const mat = new THREE.MeshStandardMaterial({
    color: C('#d8f6ff').lerp(C(skin.primary), 0.3), emissive: C(skin.primary), emissiveIntensity: 0.25,
    transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.3, depthWrite: false,
  });
  g.add(new THREE.Mesh(geo, mat));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: C(skin.accent), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })));
  return { group: g, mat };
}

const DOME_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const DOME_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uAlpha;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main() {
  float fres = pow(1.0 - abs(dot(vN, vV)), 2.2);
  vec2 g = vec2(vUv.x * 18.0, vUv.y * 9.0);
  vec2 cell = abs(fract(g + vec2(0.5 * floor(g.y), 0.0)) - 0.5);
  float hex = smoothstep(0.42, 0.5, max(cell.x * 1.15, cell.y));
  float wave = 0.5 + 0.5 * sin(vUv.y * 14.0 - uTime * 4.0);
  float a = (0.12 + fres * 0.9 + hex * 0.35 * wave) * uAlpha;
  gl_FragColor = vec4(uColor * (0.6 + fres + hex * wave), a);
}`;

function shieldDome(skin: SkinStyle) {
  const geo = new THREE.SphereGeometry(0.62, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: DOME_VERT,
    fragmentShader: DOME_FRAG,
    uniforms: { uColor: { value: glowColor(skin) }, uTime: { value: 0 }, uAlpha: { value: 1 } },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const dome = new THREE.Mesh(geo, mat);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.64, 64), additive(glowColor(skin), { opacity: 0.8 }));
  ring.position.z = 0.02;
  const g = new THREE.Group();
  g.add(dome, ring);
  return { group: g, mat };
}

function clockFace(skin: SkinStyle) {
  const g = new THREE.Group();
  const c = glowColor(skin);
  g.add(new THREE.Mesh(new THREE.RingGeometry(1.45, 1.58, 96), additive(c)));
  g.add(new THREE.Mesh(new THREE.RingGeometry(1.2, 1.24, 96), additive(C(skin.accent), { opacity: 0.7 })));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.06, i % 3 === 0 ? 0.26 : 0.14), additive(C(skin.accent)));
    tick.position.set(Math.sin(a) * 1.33, Math.cos(a) * 1.33, 0);
    tick.rotation.z = -a;
    g.add(tick);
  }
  const hour = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.75).translate(0, 0.37, 0), additive(c));
  const minute = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 1.1).translate(0, 0.55, 0), additive(C(skin.accent)));
  g.add(hour, minute);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 64), additive(c, { opacity: 0.12 }));
  g.add(disc);
  return { group: g, hour, minute };
}

/** Tourne un objet pour qu'il fasse face à la caméra malgré l'inclinaison du plateau. */
const faceCamera = (stage: VfxStage, o: THREE.Object3D) => {
  o.rotation.x = stage.tilt;
};

// ---------------------------------------------------------------------------------------------
// Sorts

export interface CastHooks {
  /** Applique le nouvel état (au moment de l'impact). */
  impact: () => void;
  hide?: (ids: number[]) => void;
  show?: (ids: number[]) => void;
  /** Le camp dont la pendule est visée est-il en bas de l'écran ? */
  victimAtBottom?: boolean;
  /**
   * Main de l'adversaire cachée (rulesOf(state).handsVisible faux) : l'annonce d'un Présage ne prend pas la couleur de la
   * carte, qui la trahirait. Préparé : les mains sont toujours visibles aujourd'hui, personne ne le passe.
   */
  secret?: boolean;
}

/** Contexte d'une mise en scène. */
interface Scene {
  stage: VfxStage;
  info: CardInfo;
  skin: SkinStyle;
  pal: Palette;
  hooks: CastHooks;
  /** Fiche de la carte (cardFx.ts) : teinte, entre autres. */
  fx: Readonly<CardFx>;
  impactAt: number;
  /** Première cible (ou centre du plateau). */
  t0: THREE.Vector3;
  center: THREE.Vector3;
  /** Exécute `fn` à l'impact, puis applique l'état (toujours, même si `fn` échoue). */
  onImpact: (fn: () => void) => void;
}

/** Poses en cours de chaque ambiance, par échiquier : la classe n'est retirée qu'à la fin de la dernière. */
const moodCounts = new WeakMap<HTMLElement, Map<string, number>>();

/**
 * Ambiance de la carte (classe de board.css) sur l'échiquier `wrap`, capturé à la pose : retirée de cet échiquier-là au
 * bout de `ms`, en temps réel et quoi qu'il arrive, même si la scène est passée à un autre échiquier entre-temps
 * (partage des scènes, useVfx). Deux sorts qui posent la même ambiance la gardent jusqu'à la fin du dernier.
 */
function setMood(wrap: HTMLElement, cls: string, ms: number) {
  let counts = moodCounts.get(wrap);
  if (!counts) moodCounts.set(wrap, (counts = new Map()));
  const live = counts;
  live.set(cls, (live.get(cls) ?? 0) + 1);
  wrap.classList.add(cls);
  window.setTimeout(() => {
    const left = (live.get(cls) ?? 1) - 1;
    if (left > 0) {
      live.set(cls, left);
      return;
    }
    live.delete(cls);
    wrap.classList.remove(cls);
  }, ms);
}

/** Durée d'une ambiance (ms) pour un impact à `impactAt` secondes. */
const moodMs = (m: Mood, impactAt: number) => ('ms' in m ? m.ms : (impactAt + m.afterImpactS) * 1000);

/** Skin du lanceur teinté par la fiche de la carte (sans teinte : le skin tel quel). */
const cardTinted = ({ skin, fx }: Scene) => (fx.tint ? tinted(skin, fx.tint.color, fx.tint.mix) : skin);

/**
 * Joue la mise en scène d'une carte. Garanties, quelle que soit la carte (même inconnue) et même si la boucle
 * d'animation s'arrête (onglet caché) ou qu'un effet échoue :
 * - `hooks.impact` est appelé une fois, au plus tard ~1,2 s après l'instant prévu ;
 * - la promesse est résolue peu après l'impact ;
 * - l'inclinaison du sort est retirée et le plateau revient à plat ;
 * - les pièces masquées (`hooks.hide`) sont réaffichées.
 */
export function playCast(stage: VfxStage, info: CardInfo, skin: SkinStyle, hooks: CastHooks): Promise<void> {
  // Présage : à l'annonce, un sceau discret du côté du lanceur ; la vraie mise en scène se joue à son arrivée
  // (playArrival), quand le pouvoir devient actif. Jouer deux fois la grande animation déroutait (retour du 7 novembre).
  if (CARDS[info.card]?.presage) return runScene(stage, info, skin, hooks, { scene: announceScene, impactAt: CAST.announceImpactS, tilt: false, light: true });
  return runScene(stage, info, skin, hooks, {});
}

interface RunOpts {
  /** Mise en scène à jouer (par défaut, celle de la carte). */
  scene?: SceneFn;
  impactAt?: number;
  /** false : l'échiquier reste à plat (on peut jouer pendant l'animation). */
  tilt?: false;
  /** Flash atténué, sans secousse. */
  light?: boolean;
}

function runScene(stage: VfxStage, info: CardInfo, skin: SkinStyle, hooks: CastHooks, opts: RunOpts): Promise<void> {
  const reduced = stage.reduced || !stage.ok;
  const fx = cardFx(info.card);
  const impactAt = reduced ? CAST.reducedImpactS : opts.impactAt ?? fx.impactAt;
  // Famille de l'échiquier qui lance le sort (scène partagée de l'accueil, voir VfxStage.family)
  const family = stage.family;
  return new Promise(resolve => {
    let fired = false;
    let ended = false;
    let hidden: number[] | null = null;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    let cine: Cine | null = null;
    const safeHooks: CastHooks = {
      ...hooks,
      hide: ids => {
        hidden = ids;
        hooks.hide?.(ids);
      },
      show: ids => {
        hidden = null;
        hooks.show?.(ids);
      },
    };
    const end = () => {
      if (ended) return;
      ended = true;
      if (hidden) safeHooks.show?.(hidden);
      for (const t of timers) clearTimeout(t);
      // L'inclinaison finit d'elle-même (≈ 2,5 s) ; ce garde-fou la retire si la boucle s'est arrêtée
      const c = cine;
      if (c) stage.later(() => stage.release(c), CAST.releaseMs, family);
      resolve();
    };
    const fire = () => {
      if (fired) return;
      fired = true;
      try {
        hooks.impact();
      } catch (err) {
        console.error('[vfx] impact', err);
      }
      later(end, reduced ? CAST.reducedEndAfterImpactMs : CAST.endAfterImpactMs);
    };
    if (stage.guard || !stage.ok) {
      later(fire, stage.ok ? (impactAt + CAST.guardImpactS) * 1000 : CAST.noGlImpactMs);
      later(() => {
        fire();
        end();
      }, (impactAt + CAST.guardEndS) * 1000);
    }
    if (!stage.ok) return;

    try {
      cine = opts.tilt === false ? null : stage.cinematic(CAST.holdS, fx.tilt);
      const t0 = info.targets[0] !== undefined ? stage.local(info.targets[0]) : new THREE.Vector3(0, 0, 0);
      const sc: Scene = {
        stage, info, skin, pal: palette(skin), hooks: safeHooks, fx, impactAt, t0, center: new THREE.Vector3(0, 0, 0),
        onImpact: fn => {
          void stage.wait(impactAt).then(() => {
            try {
              fn();
            } catch (err) {
              console.error('[vfx]', err);
            }
            fire();
            stage.flash(skin.primary, skin.flash * fx.flash * (opts.light ? CAST.lightFlash : 1));
            if (!opts.light) stage.shake(skin.shake * fx.shake);
          });
        },
      };
      // Ambiance de la carte, pendant sa propre mise en scène (pas pendant l'annonce d'un Présage)
      if (!opts.scene && fx.mood) setMood(stage.wrap, fx.mood.cls, moodMs(fx.mood, impactAt));
      (opts.scene ?? SCENES[fx.scene])(sc);
    } catch (err) {
      console.error('[vfx]', err);
      fire();
    }
  });
}

/** Carte sans mise en scène dédiée : sceau, convergence, éclat. */
function genericScene({ stage, skin, t0, impactAt, onImpact }: Scene) {
  flourishDisk(stage, skin, t0, 1.2, 2.2);
  converge(stage, skin, t0, 60, 1.6, impactAt);
  onImpact(() => {
    burst(stage, skin, t0, 80, 2.6, 1, 0.14, { up: 0.8 });
    shockwave(stage, glowColor(skin), t0, 2.4, 0.8);
  });
}

type SceneFn = (sc: Scene) => void;

/** Cartes historiques (catalogue Duel), gardées pour relire les anciennes parties. */
function duelScene(sc: Scene) {
  const { stage, info, skin, pal, hooks, impactAt, t0, center } = sc;
  const onImpact = sc.onImpact;
    switch (info.card) {
      case 'ice_wall': {
        flourishDisk(stage, skin, t0, 1.1, 2.4);
        converge(stage, skin, t0, 70, 1.6, impactAt);
        onImpact(() => {
          const { group, mats } = crystalCluster(skin);
          group.position.copy(t0);
          spawn(stage, group, 1.6, k => {
            group.scale.set(1, 1, Math.max(0.01, ease.outBack(Math.min(1, k * 3.2))));
            for (const m of mats) m.opacity = k > 0.75 ? 0.86 * (1 - (k - 0.75) / 0.25) : 0.86;
          });
          burst(stage, skin, t0, 90, 3.2, 1.1, 0.16, { up: 0.8 });
          shockwave(stage, glowColor(skin), t0, 2.2, 0.8);
        });
        break;
      }
      case 'freeze': {
        flourishDisk(stage, skin, t0, 0.9, 2.2);
        converge(stage, skin, t0, 90, 1.8, impactAt);
        onImpact(() => {
          const { group, mat } = iceCube(skin);
          group.position.copy(t0);
          spawn(stage, group, 1.5, k => {
            group.scale.set(1, 1, Math.max(0.01, ease.outCubic(Math.min(1, k * 4))));
            mat.opacity = k > 0.7 ? 0.32 * (1 - (k - 0.7) / 0.3) : 0.32;
          });
          burst(stage, skin, t0, 60, 2.2, 0.9, 0.12, { up: 0.9 });
        });
        break;
      }
      case 'shield': {
        flourishDisk(stage, skin, t0, 1, 2.3, 0, -0.6);
        converge(stage, skin, t0, 50, 1.4, impactAt);
        onImpact(() => {
          const { group, mat } = shieldDome(skin);
          group.position.copy(t0);
          spawn(stage, group, 1.4, (k, t) => {
            group.scale.setScalar(Math.max(0.01, ease.outElastic(Math.min(1, k * 2))));
            mat.uniforms.uTime.value = t;
            mat.uniforms.uAlpha.value = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
          });
          shockwave(stage, glowColor(skin), t0, 1.8, 0.7);
          burst(stage, skin, t0, 50, 2, 1, 0.12, { up: 1 });
        });
        break;
      }
      case 'lightning': {
        // Ambiance vfx-storm : fiche de la carte (cardFx.ts)
        flourishDisk(stage, skin, t0, 0.9, 1.9);
        converge(stage, skin, t0, 40, 1.2, impactAt);
        onImpact(() => {
          lightning(stage, skin, t0);
          stage.later(() => lightning(stage, skin, t0, 0.25), 140);
          scorch(stage, skin, t0);
          burst(stage, skin, t0, 140, 4.5, 1.1, 0.14, { up: 0.95, gravity: -6 });
          shockwave(stage, C(skin.accent), t0, 2.6, 0.6, 0, 0.12);
        });
        break;
      }
      case 'revive': {
        flourishDisk(stage, skin, t0, 1.15, 2.6, 0, 1.2);
        beam(stage, glowColor(skin), t0, 7, 0.38, 1.9, 0.15);
        converge(stage, skin, t0, 60, 1.3, impactAt);
        onImpact(() => {
          burst(stage, skin, t0, 80, 2.2, 1.4, 0.14, { up: 1, gravity: 2.5 });
          shockwave(stage, glowColor(skin), t0, 1.6, 0.7);
        });
        break;
      }
      case 'swap': {
        const t1 = stage.local(info.targets[1]);
        flourishDisk(stage, skin, t0, 0.8, 2.2, 0, 2);
        flourishDisk(stage, skin, t1, 0.8, 2.2, 0, -2);
        beam(stage, glowColor(skin), t0, 3, 0.36, 1.2, 0.2);
        beam(stage, glowColor(skin), t1, 3, 0.36, 1.2, 0.2);
        hooks.hide?.(info.pieces);
        burst(stage, skin, t0.clone().setZ(0.4), 40, 1.4, 0.7, 0.12, { up: 1 });
        burst(stage, skin, t1.clone().setZ(0.4), 40, 1.4, 0.7, 0.12, { up: 1 });
        arcStream(stage, skin, t0, t1, impactAt);
        arcStream(stage, skin, t1, t0, impactAt);
        onImpact(() => {
          setTimeout(() => hooks.show?.(info.pieces), 280);
          burst(stage, skin, t0, 30, 1.6, 0.8, 0.12);
          burst(stage, skin, t1, 30, 1.6, 0.8, 0.12);
        });
        break;
      }
      case 'rewind': {
        // Ambiance vfx-rewind : fiche de la carte (cardFx.ts)
        const [from, to] = info.targets;
        const a = stage.local(to), b = stage.local(from);
        const { group, hour, minute } = clockFace(skin);
        group.position.set(0, 0, 1.6);
        group.scale.setScalar(0.01);
        spawn(stage, group, 2.1, (k, t) => {
          faceCamera(stage, group);
          group.scale.setScalar(Math.max(0.01, k < 0.2 ? ease.outBack(k / 0.2) : k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1));
          minute.rotation.z = t * 9;
          hour.rotation.z = t * 2.2;
        });
        arcStream(stage, skin, a, b, impactAt + 0.5, 1.4);
        flourishDisk(stage, skin, a, 0.8, 2, 0, 3);
        onImpact(() => {
          flourishDisk(stage, skin, b, 0.9, 1.4, 0, 3);
          burst(stage, skin, b, 60, 2, 0.9, 0.13);
        });
        break;
      }
      case 'time_warp': {
        const { group, hour, minute } = clockFace(skin);
        group.position.set(0, 0, 2.2);
        const dir = hooks.victimAtBottom ? -1 : 1;
        spawn(stage, group, 1.9, (k, t) => {
          faceCamera(stage, group);
          const ki = impactAt / 1.9;
          if (k < ki) {
            group.scale.setScalar(Math.max(0.01, ease.outBack(Math.min(1, k / 0.25))));
            minute.rotation.z = -t * t * 14;
            hour.rotation.z = -t * t * 3;
          } else {
            const q = (k - ki) / (1 - ki);
            group.scale.setScalar(Math.max(0.01, 1 - ease.inCubic(q)));
            group.position.set(0, dir * 5.5 * ease.inCubic(q), 2.2);
            minute.rotation.z -= 0.6;
          }
        });
        orbit(stage, skin, new THREE.Vector3(0, 0, 2.2), 1.9, impactAt);
        flourishDisk(stage, skin, center, 3.4, 2.4, 0, 0.6);
        onImpact(() => {
          burst(stage, skin, new THREE.Vector3(0, dir * 4.5, 1.5), 60, 2.5, 0.9, 0.14);
        });
        break;
      }
      case 'gravity': {
        flourishDisk(stage, skin, center, 3.6, 2.6, 0, -1.4);
        const hole = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 16),
          new THREE.MeshBasicMaterial({ color: C('#05010c'), transparent: true, opacity: 0.95, depthTest: false }));
        hole.position.set(0, 0, 1);
        const halo = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.4, 64), additive(glowColor(skin), { map: flourishTexture('vortex'), opacity: 0.9 }));
        halo.position.set(0, 0, 1);
        const g = new THREE.Group();
        g.add(halo, hole);
        spawn(stage, g, impactAt + 0.25, (k, t) => {
          faceCamera(stage, g);
          const s = k < 0.4 ? ease.outBack(k / 0.4) : k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1;
          g.scale.setScalar(Math.max(0.01, s));
          halo.rotation.z = -t * 6;
        });
        const ps = stage.particles(skin);
        for (let i = 0; i < 160; i++) {
          const a = Math.random() * Math.PI * 2, r = rnd(2.5, 5.5);
          ps.emit({
            x: Math.cos(a) * r, y: Math.sin(a) * r, z: rnd(0, 1.5), vx: -Math.sin(a) * 3, vy: Math.cos(a) * 3,
            color: pick(pal), size: rnd(0.08, 0.2), life: rnd(0.6, impactAt + 0.1), attract: { x: 0, y: 0, z: 1, k: 9 }, drag: 0.8, fadeIn: 0.2,
          });
        }
        onImpact(() => {
          for (let i = 0; i < 3; i++) shockwave(stage, i === 1 ? C(skin.accent) : glowColor(skin), center, 7, 1, i * 0.12, 0.05);
          burst(stage, skin, new THREE.Vector3(0, 0, 0.8), 120, 6, 1, 0.14, { up: 0.3 });
        });
        break;
      }
      case 'knight_leap': {
        flourishDisk(stage, skin, t0, 1, 2.3, 0, 1.6);
        converge(stage, skin, t0, 40, 1.2, impactAt * 0.8);
        onImpact(() => {
          const sq = info.targets[0];
          const f = sq & 7, r = sq >> 3;
          for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
            if (f + df < 0 || f + df > N - 1 || r + dr < 0 || r + dr > N - 1) continue;
            arcStream(stage, skin, t0, stage.local((r + dr) * N + f + df), 0.6, 1.1);
          }
          burst(stage, skin, t0, 40, 1.8, 0.8, 0.12, { up: 1 });
        });
        break;
      }
      case 'phase': {
        flourishDisk(stage, skin, t0, 1, 2.3, 0, -1);
        for (let i = 0; i < 4; i++) {
          const mat = additive(glowColor(skin), { opacity: 0 });
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.47, 64), mat);
          ring.position.copy(t0);
          spawn(stage, ring, 1.3, k => {
            ring.position.z = k * 1.6;
            ring.scale.setScalar(1 + k * 0.5);
            mat.opacity = Math.sin(k * Math.PI) * 0.9;
          }, 0.2 + i * 0.22);
        }
        converge(stage, skin, t0, 40, 1.2, impactAt);
        onImpact(() => burst(stage, skin, t0, 50, 1.4, 1.1, 0.14, { up: 1, gravity: 1.5 }));
        break;
      }
    }
}

/** Mises en scène (la fiche de chaque carte choisit la sienne, cardFx.ts). */
const SCENES: Record<SceneKey, SceneFn> = {
  generique: genericScene,
  duel: duelScene,
  hourglass: hourglassScene,
  truce: truceScene,
  blood_moon: bloodMoonScene,
  ice_age: iceAgeScene,
  blast: blastScene,
  rift: riftScene,
  tide: tideScene,
};

// ---------------------------------------------------------------------------------------------
// Pouvoirs : une mise en scène courte par carte, aux couleurs du skin du lanceur, avec un signe propre à la carte.

/** Teinte propre à la carte (lune rouge, glace, braise…), mêlée au skin. */
const cardColor = (card: CardId, l = 0.62) => new THREE.Color().setHSL(CARDS[card].hue / 360, 0.9, l);
/**
 * Skin du lanceur teinté par la carte : les particules gardent leur forme, la couleur dit la carte. Le motif suit la
 * même règle : le filigrane, teint de la couleur secondaire (flourishColor), voit donc celle-ci teinte aussi, sans quoi
 * Écarlate garderait un anneau d'or pur là où les autres skins prennent la couleur de la carte.
 */
export const tinted = (skin: SkinStyle, color: string, mix = 0.55): SkinStyle => ({
  ...skin,
  primary: '#' + C(skin.primary).lerp(C(color), mix).getHexString(),
  accent: '#' + C(skin.accent).lerp(C(color), mix * 0.5).getHexString(),
  ...(secondaryFlourish(skin) ? { secondary: '#' + C(skin.secondary).lerp(C(color), mix).getHexString() } : {}),
});

/** Bande lumineuse qui traverse le plateau (y : de `y0` à `y1`). */
function sweep(stage: VfxStage, color: THREE.Color, y0: number, y1: number, life: number, delay = 0, height = 1.2, opacity = 0.85) {
  const mat = additive(color, { map: bandTexture(), opacity: 0 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(8.6, height), mat);
  m.position.set(0, y0, 0.04);
  spawn(stage, m, life, k => {
    m.position.y = y0 + (y1 - y0) * ease.inOutCubic(k);
    mat.opacity = Math.sin(Math.PI * k) * opacity;
  }, delay);
  return m;
}

/** Nappe d'eau translucide (mélange normal : visible aussi sur les cases claires) qui avance avec la vague. */
function water(stage: VfxStage, color: THREE.Color, y0: number, y1: number, life: number) {
  const mat = new THREE.MeshBasicMaterial({ color, map: bandTexture(), transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 2.2), mat);
  m.position.set(0, y0, 0.03);
  m.renderOrder = 1;
  spawn(stage, m, life, k => {
    m.position.y = y0 + (y1 - y0) * ease.inOutCubic(k);
    mat.opacity = Math.sin(Math.PI * k) * 0.5;
  });
}

/** Neige ou poussière qui tombe sur tout le plateau. */
function fall(stage: VfxStage, skin: SkinStyle, n: number, duration: number, size = 0.12) {
  const ps = stage.particles(skin);
  const pal = palette(skin);
  let emitted = 0;
  let t = 0;
  stage.add({
    update(dt) {
      t += dt;
      const target = Math.min(n, Math.floor((t / duration) * n));
      for (; emitted < target; emitted++) {
        ps.emit({
          x: rnd(-4.2, 4.2), y: rnd(-4.2, 4.2), z: rnd(2.5, 4.5), vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), vz: -rnd(1.5, 3),
          color: pick(pal), size: size * rnd(0.6, 1.4), life: rnd(0.9, 1.5), drag: 0.4, spin: rnd(-2, 2), fadeIn: 0.15,
        });
      }
      return t < duration;
    },
  });
}

/** Cases des pions affichés (classe posée par l'échiquier) : l'Ère glaciaire les givre au lancement. */
function pawnSquares(stage: VfxStage): number[] {
  const out: number[] = [];
  stage.wrap.querySelectorAll<HTMLElement>('.piece.pawn[data-at]').forEach(el => {
    if (el.classList.contains('vanish')) return;
    const sq = Number(el.dataset.at);
    if (sq >= 0 && sq < N * N) out.push(sq);
  });
  return out;
}

/** Sablier fou : une horloge s'emballe au-dessus du plateau, puis éclate en onde. */
function hourglassScene({ stage, skin, impactAt, center, onImpact }: Scene) {
  const { group, hour, minute } = clockFace(skin);
  group.position.set(0, 0, 2.2);
  const life = impactAt + 0.5;
  spawn(stage, group, life, (k, t) => {
    faceCamera(stage, group);
    const ki = impactAt / life;
    if (k < ki) {
      group.scale.setScalar(Math.max(0.01, ease.outBack(Math.min(1, k / 0.3))));
      minute.rotation.z = -t * t * 16;
      hour.rotation.z = -t * t * 4;
    } else {
      const q = (k - ki) / (1 - ki);
      group.scale.setScalar(Math.max(0.01, 1 + q * 0.6));
      group.traverse(o => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m && 'opacity' in m) m.opacity = Math.min(m.opacity, 1 - q);
      });
    }
  });
  orbit(stage, skin, new THREE.Vector3(0, 0, 2.2), 1.9, impactAt);
  flourishDisk(stage, skin, center, 3.4, impactAt + 1.2, 0, 2.4);
  onImpact(() => {
    for (let i = 0; i < 2; i++) shockwave(stage, i ? C(skin.accent) : glowColor(skin), center, 6.5, 0.9, i * 0.12, 0.05);
    burst(stage, skin, new THREE.Vector3(0, 0, 2.2), 90, 3.2, 0.9, 0.13, { up: 0.4, gravity: -1 });
  });
}

/** Trêve : deux lignes de lumière avancent depuis chaque camp et se rejoignent au centre ; tout s'apaise. */
function truceScene(sc: Scene) {
  const { stage, impactAt, center, onImpact } = sc;
  const calm = cardTinted(sc);
  const color = glowColor(calm);
  flourishDisk(stage, calm, center, 3.2, impactAt + 1.3, 0, 0.35);
  sweep(stage, color, -4.4, 0, impactAt + 0.1, 0, 1.1);
  sweep(stage, color, 4.4, 0, impactAt + 0.1, 0, 1.1);
  onImpact(() => {
    // Ligne de paix au milieu du plateau, qui s'efface doucement
    const mat = additive(color, { map: bandTexture(), opacity: 0.9 });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 0.7), mat);
    line.position.set(0, 0, 0.05);
    spawn(stage, line, 1.4, k => {
      line.scale.set(1, 1 - k * 0.6, 1);
      mat.opacity = 0.9 * (1 - k);
    });
    shockwave(stage, color, center, 5.5, 1.1, 0, 0.04);
    const ps = stage.particles(calm);
    const pal = palette(calm);
    for (let i = 0; i < 70; i++) {
      ps.emit({
        x: rnd(-4, 4), y: rnd(-0.4, 0.4), z: 0.1, vx: rnd(-0.2, 0.2), vy: rnd(-0.4, 0.4), vz: rnd(0.6, 1.6),
        color: pick(pal), size: rnd(0.07, 0.16), life: rnd(0.9, 1.5), drag: 0.6, fadeIn: 0.1,
      });
    }
  });
}

/** Lune de sang : une éclipse se retire et révèle une lune rouge au-dessus du plateau. */
function bloodMoonScene(sc: Scene) {
  const { stage, skin, impactAt, center, onImpact } = sc;
  // Lune rouge : la teinte de la carte, pour le halo et l'onde aussi
  const red = sc.fx.tint?.color ?? '#ff2a3d';
  const blood = cardTinted(sc);
  const g = new THREE.Group();
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), additive(C(red), { map: softDiskTexture(), opacity: 0 }));
  const moonMat = new THREE.MeshBasicMaterial({ color: C('#ff4a4f').lerp(C(skin.primary), 0.12), transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.95, 64), moonMat);
  const shadeMat = new THREE.MeshBasicMaterial({ color: C('#12020a'), transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const shade = new THREE.Mesh(new THREE.CircleGeometry(0.97, 64), shadeMat);
  const ringMat = additive(glowColor(blood), { map: flourishTexture(skin.flourish), opacity: 0 });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 3.3), ringMat);
  halo.renderOrder = 3;
  ring.renderOrder = 4;
  moon.renderOrder = 5;
  shade.renderOrder = 6;
  ring.position.z = -0.01;
  shade.position.z = 0.01;
  g.add(halo, ring, moon, shade);
  const life = impactAt + 1.1;
  // La couronne de laurier ne tourne pas (laurelDisk)
  const ringSpin = closingFlourish(skin) ? 0 : 0.8;
  spawn(stage, g, life, (k, t) => {
    faceCamera(stage, g);
    const ki = impactAt / life;
    const rise = ease.outCubic(Math.min(1, k / ki));
    g.position.set(0, 0.6, 0.6 + rise * 2.1);
    const fadeOut = k > 0.78 ? 1 - (k - 0.78) / 0.22 : 1;
    moonMat.opacity = Math.min(1, k * 5) * fadeOut;
    // L'ombre glisse et révèle la lune rouge à l'impact, en s'effaçant hors du disque
    const slide = ease.inOutCubic(Math.min(1, Math.max(0, (k - ki * 0.35) / (ki * 0.65))));
    shade.position.x = -slide * 1.6;
    shadeMat.opacity = Math.min(1, k * 5) * (1 - slide) * fadeOut;
    (halo.material as THREE.MeshBasicMaterial).opacity = (k < ki ? 0.25 * rise : 0.25 + 0.5 * Math.sin(Math.min(1, (k - ki) / 0.2) * Math.PI / 2)) * fadeOut;
    ringMat.opacity = (k > ki ? 0.9 : 0.3 * rise) * fadeOut;
    ring.rotation.z = t * ringSpin;
  });
  converge(stage, blood, new THREE.Vector3(0, 0.6, 2.7), 50, 2.2, impactAt);
  onImpact(() => {
    shockwave(stage, C(red), center, 6.5, 1.1, 0, 0.06);
    shockwave(stage, glowColor(skin), center, 5, 0.9, 0.1, 0.04);
    burst(stage, blood, new THREE.Vector3(0, 0.6, 2.7), 70, 2.6, 1, 0.14, { up: 0.3, gravity: -3 });
  });
}

/** Ère glaciaire : la neige tombe, le givre gagne le plateau, chaque pion se couvre un instant de cristaux. */
function iceAgeScene(sc: Scene) {
  const { stage, impactAt, center, onImpact } = sc;
  const frost = cardTinted(sc);
  fall(stage, frost, 160, impactAt + 0.6, 0.11);
  flourishDisk(stage, frost, center, 3.6, impactAt + 1.2, 0, 0.5);
  onImpact(() => {
    shockwave(stage, glowColor(frost), center, 6.5, 1, 0, 0.05);
    shockwave(stage, C(frost.accent), center, 5.2, 0.9, 0.1, 0.03);
    for (const sq of pawnSquares(stage).slice(0, 16)) {
      const at = stage.local(sq);
      const { group, mat } = crystal(0.55, 0.13, frost);
      const shards = new THREE.Group();
      shards.add(group);
      const g2 = crystal(0.38, 0.09, frost);
      g2.group.position.set(0.16, -0.08, 0);
      g2.group.rotation.set(0.25, 0.35, 0);
      shards.add(g2.group);
      shards.position.copy(at);
      spawn(stage, shards, 1.3, k => {
        shards.scale.set(1, 1, Math.max(0.01, ease.outBack(Math.min(1, k * 4))));
        const o = k > 0.6 ? 0.86 * (1 - (k - 0.6) / 0.4) : 0.86;
        mat.opacity = o;
        g2.mat.opacity = o;
      }, Math.random() * 0.15);
    }
  });
}

/** Déflagration : l'énergie se concentre au centre puis souffle tout le plateau. */
function blastScene(sc: Scene) {
  const { stage, skin, impactAt, center, onImpact } = sc;
  const fire = cardTinted(sc);
  flourishDisk(stage, fire, center, 2.6, impactAt + 0.4, 0, -2.5);
  converge(stage, fire, new THREE.Vector3(0, 0, 0.4), 120, 3.6, impactAt);
  const coreMat = additive(C('#ffd08a').lerp(C(skin.primary), 0.3), { map: softDiskTexture(), opacity: 0 });
  const core = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), coreMat);
  core.position.set(0, 0, 0.6);
  core.renderOrder = 5;
  spawn(stage, core, impactAt + 0.45, k => {
    faceCamera(stage, core);
    const ki = impactAt / (impactAt + 0.45);
    if (k < ki) {
      const q = k / ki;
      core.scale.setScalar(0.2 + q * 0.6 + Math.sin(q * 40) * 0.04 * q);
      coreMat.opacity = q;
    } else {
      const q = (k - ki) / (1 - ki);
      core.scale.setScalar(0.8 + ease.outCubic(q) * 4.5);
      coreMat.opacity = 1 - q;
    }
  });
  onImpact(() => {
    for (let i = 0; i < 3; i++) shockwave(stage, i === 1 ? C(fire.accent) : glowColor(fire), center, 7.5, 1, i * 0.1, 0.06);
    burst(stage, fire, new THREE.Vector3(0, 0, 0.5), 170, 6.5, 1.1, 0.16, { up: 0.5, gravity: -5 });
    scorch(stage, fire, center);
    // Quelques cases soufflées à travers le plateau
    for (let i = 0; i < 5; i++) {
      const at = new THREE.Vector3(Math.floor(rnd(0, N)) - HALF, Math.floor(rnd(0, N)) - HALF, 0.1);
      stage.later(() => burst(stage, fire, at, 24, 2.4, 0.6, 0.12, { up: 0.9 }), 120 + i * 90);
    }
  });
}

/** Faille : une fissure court le long de la rangée choisie, la poussière tombe dans le gouffre. */
function riftScene(sc: Scene) {
  const { stage, info, impactAt, onImpact } = sc;
  const abyss = cardTinted(sc);
  const color = glowColor(abyss);
  const sq = info.targets[0] ?? 28;
  const y = stage.local(sq).y;
  const left = new THREE.Vector3(-4.1, y, 0.06);
  const right = new THREE.Vector3(4.1, y, 0.06);
  const crack = boltMesh(lightningPath(left, right, 22, 0.22), color, 0.03);
  crack.position.set(0, 0, 0);
  // La fissure se dessine de gauche à droite (échelle ancrée au bord gauche)
  const pivot = new THREE.Group();
  pivot.position.set(-4.1, 0, 0);
  crack.position.set(4.1, 0, 0);
  pivot.add(crack);
  spawn(stage, pivot, impactAt + 0.9, k => {
    const ki = impactAt / (impactAt + 0.9);
    pivot.scale.x = Math.max(0.01, ease.inOutCubic(Math.min(1, k / ki)));
    const o = k > ki ? 1 - (k - ki) / (1 - ki) : 1;
    crack.traverse(c => {
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (m) m.opacity = (m.color.getHex() === 0xffffff ? 1 : 0.45) * o;
    });
  });
  // Étincelles qui suivent la pointe de la fissure
  const ps = stage.particles(abyss);
  const pal = palette(abyss);
  let t = 0;
  stage.add({
    update(dt) {
      t += dt;
      const x = -4.1 + 8.2 * ease.inOutCubic(Math.min(1, t / impactAt));
      for (let i = 0; i < 3; i++) {
        ps.emit({ x, y: y + rnd(-0.15, 0.15), z: 0.1, vx: rnd(-0.6, 0.6), vy: rnd(-0.6, 0.6), vz: rnd(0.4, 1.4), color: pick(pal), size: rnd(0.07, 0.15), life: rnd(0.3, 0.6), gravity: -3 });
      }
      return t < impactAt;
    },
  });
  onImpact(() => {
    for (let f = 0; f < N; f++) {
      const at = new THREE.Vector3(f - HALF, y, 0.2);
      burst(stage, abyss, at, 14, 1.4, 0.7, 0.11, { up: 0.6, gravity: -6 });
    }
    shockwave(stage, color, new THREE.Vector3(0, y, 0), 4.8, 0.7, 0, 0.05);
  });
}

/** Grande Marée : deux vagues partent de chaque camp ; les pions avancent avec elles. */
function tideScene(sc: Scene) {
  const { stage, skin, info, impactAt, onImpact } = sc;
  const sea = cardTinted(sc);
  const color = glowColor(sea);
  // Les Blancs avancent vers le haut de leur écran, les Noirs vers le bas : une vague par camp
  const up = stage.orientation === 'w' ? 1 : -1;
  for (const dir of [1, -1]) {
    water(stage, C('#0f6f9a').lerp(C(skin.primary), 0.2), -4.6 * up * dir, 0.9 * up * dir, impactAt + 0.3);
    sweep(stage, color, -4.6 * up * dir, 1.2 * up * dir, impactAt + 0.35, 0, 0.9, 0.95);
  }
  flourishDisk(stage, sea, new THREE.Vector3(0, 0, 0), 3.4, impactAt + 1, 0, 0.6);
  onImpact(() => {
    for (const mv of (info.moves ?? []).slice(0, 16)) {
      const a = stage.local(mv.from), b = stage.local(mv.to);
      arcStream(stage, sea, a, b, 0.35, 0.45);
      burst(stage, sea, b, 10, 1.2, 0.6, 0.1, { up: 1, gravity: -4 });
    }
    shockwave(stage, color, new THREE.Vector3(0, 0, 0), 5.5, 0.9, 0, 0.05);
  });
}

/**
 * Arrivée d'un Présage (l'effet annoncé devient actif au début du tour du lanceur) : la vraie mise en scène de la
 * carte, celle que l'annonce a gardée pour ce moment. L'échiquier reste à plat : c'est le tour du lanceur, il peut
 * jouer pendant l'animation ; l'état de la partie est déjà à jour (rien à appliquer à l'impact).
 */
export function playArrival(stage: VfxStage, e: Effect, skin: SkinStyle) {
  if (!stage.ok) return;
  // Cibles de l'effet (aucune pour les Climats d'aujourd'hui) : une carte ciblée qui deviendrait un Présage serait
  // jouée sur ses cases, pas au centre
  const targets = e.squares?.length ? [...e.squares] : e.square !== undefined ? [e.square] : [];
  const info: CardInfo = { card: e.card, caster: e.caster, targets, pieces: e.pieceId !== undefined ? [e.pieceId] : [], skin: e.skin };
  void runScene(stage, info, skin, { impact: () => {} }, { tilt: false });
}

// ---------------------------------------------------------------------------------------------
// Coup de grâce

/**
 * Durée du coup de grâce (secondes) : celle de la chute du roi maté (mate.ts, MATE_FALL_MS), qu'il ne dépasse jamais.
 * La carte de fin de partie attend la fin de la chute : elle ne recouvre rien. Recopiée et non importée : mate.ts vit
 * dans le morceau de l'échiquier, que le module des effets, chargé à part, n'a pas à tirer. test/textures.test.ts
 * vérifie qu'elle suit MATE_FALL_MS et la durée des @keyframes pi-fall-* de board.css.
 */
export const FINALE_S = 1.25;
/**
 * Instants de la chute, en fractions de sa durée (board.css, @keyframes pi-fall-* ; test/textures.test.ts les relit) :
 * après son frisson, le roi bascule à 32 % et touche sa case à 67 %.
 */
export const FALL_AT = { topple: 0.32, impact: 0.67 } as const;

/**
 * Coup de grâce : pendant la chute du roi maté, une gerbe aux couleurs des sorts du vainqueur jaillit de sa case.
 * - Une gerbe de ses particules part du bord de la case quand le roi bascule, vers l'extérieur, et retombe (ou monte,
 *   selon le `drift` du skin).
 * - Une onde fine, de la couleur du motif du vainqueur (l'or du filigrane pour Écarlate), part du bord de la case quand
 *   le roi la touche.
 * Rien n'est posé sur la case elle-même : le calque WebGL passe au-dessus des pièces, et la chute du roi doit se lire,
 * sur un téléphone aussi. Pas de motif, donc (il traverserait la silhouette du roi).
 * Calé sur la chute CSS et non sur l'horloge de la scène (qui démarre au premier appel et ralentit sur les images de
 * plus de 0,1 s) : `elapsedMs` est le temps déjà écoulé de la chute à l'appel (animation de `.pi-fall`, getAnimations),
 * puis l'horloge murale avance. Ce qui est déjà passé est sauté ; la gerbe en retard part d'un coup.
 * Tout s'éteint avant FINALE_S : la scène s'arrête d'elle-même ensuite, rien ne tourne en boucle. Ni inclinaison, ni
 * secousse, ni éclair plein écran : l'échiquier ne bouge pas pendant la chute.
 * Renvoie false si rien n'est joué : scène sans WebGL, mouvement réduit (le roi est alors couché d'emblée), case hors
 * de l'échiquier, chute presque finie. L'appelant peut se rabattre sur l'éclat CSS `.board-burst`, que le mouvement
 * réduit coupe aussi. À appeler une fois, quand la case du roi maté (mate.ts, matedKing) passe de null à une case.
 */
export function playFinale(stage: VfxStage, square: number, skin: SkinStyle, elapsedMs = 0): boolean {
  const end = FINALE_S - 0.02;
  // En deçà, plus rien ne se lirait : la gerbe aurait moins de 0,2 s
  const late = end - 0.2;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) / 1000 : 0;
  if (!stage.ok || stage.reduced || !Number.isInteger(square) || square < 0 || square > N * N - 1 || elapsed >= late) return false;
  const at = stage.local(square);
  const topple = FALL_AT.topple * FINALE_S, impact = FALL_AT.impact * FINALE_S;
  const t0 = performance.now() / 1000 - elapsed;
  // Gerbe : 64 particules lancées en 0,14 s depuis le bord de la case, vers l'extérieur et un peu vers le haut (elles
  // s'écartent du roi au lieu de le couvrir), éteintes avant la fin de la chute
  const ps = stage.particles(skin);
  const pal = palette(skin);
  const n = 64, span = 0.14;
  let emitted = 0;
  // Onde : du bord de la case (rayon 0,5) à 1,3 case, sans jamais traverser le roi couché
  const mat = additive(flourishColor(skin), { opacity: 0 });
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 96), mat);
  wave.position.set(at.x, at.y, 0.03);
  stage.add({
    update() {
      const t = performance.now() / 1000 - t0;
      if (t >= end) return false;
      if (t >= topple && emitted < n) {
        if (t > late) emitted = n;
        for (const target = Math.min(n, Math.ceil(((t - topple) / span) * n)); emitted < target; emitted++) {
          const a = Math.random() * Math.PI * 2;
          const r = rnd(0.32, 0.48);
          const v = rnd(1.4, 2.8);
          const el = rnd(0.12, 0.42);
          ps.emit({
            x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r, z: 0.1,
            vx: Math.cos(a) * v * (1 - el), vy: Math.sin(a) * v * (1 - el), vz: v * el * 1.6,
            color: pick(pal), size: 0.13 * rnd(0.6, 1.3),
            life: Math.min(rnd(0.55, 0.8), end - t),
            gravity: -3 + skin.drift * 1.6, drag: 1.6, spin: rnd(-4, 4),
          });
        }
      }
      if (t >= impact) {
        if (!wave.parent) stage.board.add(wave);
        const k = (t - impact) / (end - impact);
        wave.scale.setScalar(0.5 + ease.outCubic(k) * 0.8);
        mat.opacity = 0.95 * (1 - k);
      }
      return true;
    },
    dispose() {
      disposeObject(wave);
    },
  });
  return true;
}

/** Annonce d'un Présage : un sceau s'allume du côté du lanceur, sans plus ; la carte agira à son prochain tour. */
function announceScene({ stage, skin, info, hooks, impactAt, onImpact }: Scene) {
  // Main cachée (hooks.secret) : teinte neutre, celle du skin seul, pour ne pas trahir la carte annoncée
  const s2 = hooks.secret ? skin : tinted(skin, '#' + cardColor(info.card, 0.66).getHexString(), 0.6);
  const at = new THREE.Vector3(0, (info.caster === stage.orientation ? -1 : 1) * 2.6, 0.2);
  flourishDisk(stage, s2, at, 1.3, impactAt + 1, 0, 0.8);
  converge(stage, s2, at, 36, 1.6, impactAt);
  onImpact(() => shockwave(stage, glowColor(s2), at, 2.2, 0.7, 0, 0.04));
}

/** Flot de particules qui s'élève en arc d'une case à l'autre. */
function arcStream(stage: VfxStage, skin: SkinStyle, a: THREE.Vector3, b: THREE.Vector3, duration: number, height = 1.4) {
  const ps = stage.particles(skin);
  const pal = palette(skin);
  let t = 0;
  stage.add({
    update(dt) {
      t += dt;
      const head = Math.min(1, t / duration);
      for (let i = 0; i < 4; i++) {
        const k = Math.max(0, head - Math.random() * 0.12);
        const x = a.x + (b.x - a.x) * k;
        const y = a.y + (b.y - a.y) * k;
        const z = Math.sin(k * Math.PI) * height + 0.2;
        ps.emit({ x, y, z, vx: rnd(-0.2, 0.2), vy: rnd(-0.2, 0.2), vz: rnd(-0.2, 0.3), color: pick(pal), size: rnd(0.07, 0.15), life: rnd(0.3, 0.6) });
      }
      return t < duration;
    },
  });
}

function orbit(stage: VfxStage, skin: SkinStyle, at: THREE.Vector3, radius: number, duration: number) {
  const ps = stage.particles(skin);
  const pal = palette(skin);
  let t = 0;
  stage.add({
    update(dt) {
      t += dt;
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = radius * rnd(0.9, 1.25);
        const local = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), stage.tilt);
        ps.emit({
          x: at.x + local.x, y: at.y + local.y, z: at.z + local.z,
          vx: -Math.sin(a) * 2, vy: Math.cos(a) * 2 * Math.cos(stage.tilt), vz: Math.cos(a) * 2 * Math.sin(stage.tilt),
          color: pick(pal), size: rnd(0.06, 0.14), life: rnd(0.3, 0.6),
        });
      }
      return t < duration;
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Préparation au repos (VfxStage.warm)

/**
 * Un objet témoin par programme de dessin des sorts des Pouvoirs (la partie, l'accueil) : three.js choisit le programme
 * d'après la classe du matériau, ses options (texture, double face, ombrage plat) et les attributs de la géométrie
 * (normales des maillages ; aucune pour les arêtes et les particules). Les témoins sont faits avec les mêmes briques
 * que les sorts, sans tirage aléatoire (les sorts gardent la même suite de hasard). Jamais affichés. Le dôme du
 * Bouclier et le bloc du Gel (cartes historiques du Duel) ne sont pas préparés : ils se compilent à leur premier sort.
 */
export function warmObjects(): THREE.Object3D[] {
  const plane = () => new THREE.PlaneGeometry(1, 1);
  const white = C('#ffffff');
  return [
    // Ornements, ondes, éclairs, horloge (mélange additif, double face, avec ou sans texture)
    new THREE.Mesh(plane(), additive(white)),
    new THREE.Mesh(plane(), additive(white, { map: bandTexture() })),
    // Brûlure, lune, gouffre (mélange normal, une face) ; nappe d'eau de la Marée (texture, double face)
    new THREE.Mesh(plane(), new THREE.MeshBasicMaterial({ color: white, transparent: true, depthWrite: false, depthTest: false })),
    new THREE.Mesh(plane(), new THREE.MeshBasicMaterial({ color: white, map: bandTexture(), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide })),
    // Cristaux de l'Ère glaciaire et du Mur de glace (ombrage plat éclairé, arêtes sans normales)
    crystal(0.5, 0.1, skinStyle(undefined)).group,
    // Particules (un seul programme pour toutes les formes et tous les mélanges)
    new Particles(1, particleTexture('glow'), THREE.AdditiveBlending).points,
  ];
}

/** Textures des `skins` (ornement, particule) et des bandes et halos communs, dessinées et envoyées au repos. */
export function warmTextures(skins: SkinStyle[]): (() => THREE.Texture)[] {
  const out: (() => THREE.Texture)[] = [];
  for (const f of new Set(skins.map(s => s.flourish))) out.push(() => flourishTexture(f));
  for (const p of new Set(skins.map(s => s.particle))) out.push(() => particleTexture(p));
  if (skins.length) out.push(bandTexture, softDiskTexture);
  return out;
}

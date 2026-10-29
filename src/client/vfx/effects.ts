// Mise en scène de chaque carte. Toutes les couleurs, particules et ornements viennent du skin du lanceur.
import * as THREE from 'three';
import type { CardInfo, Effect } from '../../shared/game';
import type { SkinStyle } from '../../shared/catalog';
import { Fx, Marker, VfxStage, disposeObject, ease } from './stage';
import { beamTexture, flourishTexture } from './textures';

const C = (hex: string) => new THREE.Color(hex);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Palette {
  p: THREE.Color;
  s: THREE.Color;
  a: THREE.Color;
}
const palette = (skin: SkinStyle): Palette => ({ p: C(skin.primary), s: C(skin.secondary), a: C(skin.accent) });
const pick = (pal: Palette) => (Math.random() < 0.5 ? pal.p : Math.random() < 0.6 ? pal.s : pal.a);
/** Couleur visible même pour les skins sombres (Néant). */
const glowColor = (skin: SkinStyle) => (skin.particle === 'void' ? C(skin.accent) : C(skin.primary));

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

export function flourishDisk(stage: VfxStage, skin: SkinStyle, at: THREE.Vector3, radius: number, life: number, delay = 0, spin = 0.8) {
  const mat = additive(glowColor(skin), { map: flourishTexture(skin.flourish), opacity: 0 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  m.position.set(at.x, at.y, 0.02);
  m.renderOrder = 2;
  spawn(stage, m, life, (k, t) => {
    const s = ease.outBack(Math.min(1, k * 4));
    m.scale.setScalar(Math.max(0.01, s));
    m.rotation.z = t * spin;
    mat.opacity = k < 0.7 ? Math.min(1, k * 6) * 0.95 : (1 - (k - 0.7) / 0.3) * 0.95;
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
  const glow = additive(glowColor(skin), { map: tex, opacity: 0.9 });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), glow);
  ring.position.set(at.x, at.y, 0.02);
  spawn(stage, ring, 1.2, (k, t) => {
    glow.opacity = 0.9 * (1 - k);
    ring.rotation.z = -t * 3;
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
}

/** Joue la mise en scène d'une carte. Résout la promesse peu après l'impact. */
export function playCast(stage: VfxStage, info: CardInfo, skin: SkinStyle, hooks: CastHooks): Promise<void> {
  const reduced = stage.reduced || !stage.ok;
  const impactAt = reduced ? 0.15 : info.card === 'time_warp' ? 1.15 : 0.85;
  return new Promise(resolve => {
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      hooks.impact();
      setTimeout(resolve, reduced ? 50 : 450);
    };
    if (!stage.ok) {
      setTimeout(fire, 150);
      return;
    }
    stage.cinematic(1.25, info.card === 'time_warp' || info.card === 'gravity' ? 0.62 : 0.52);
    const pal = palette(skin);
    const t0 = info.targets[0] !== undefined ? stage.local(info.targets[0]) : new THREE.Vector3(0, 0, 0);
    const center = new THREE.Vector3(0, 0, 0);
    const onImpact = (fn: () => void) => stage.wait(impactAt).then(() => {
      fn();
      fire();
      stage.flash(skin.primary, skin.flash * (info.card === 'lightning' ? 1 : 0.6));
      stage.shake(skin.shake * (info.card === 'lightning' || info.card === 'ice_wall' || info.card === 'gravity' ? 1.4 : 0.7));
    });

    switch (info.card) {
      case 'ice_wall': {
        flourishDisk(stage, skin, t0, 1.1, 2.4);
        converge(stage, skin, t0, 70, 1.6, impactAt);
        void onImpact(() => {
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
        void onImpact(() => {
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
        void onImpact(() => {
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
        stage.wrap.classList.add('vfx-storm');
        setTimeout(() => stage.wrap.classList.remove('vfx-storm'), 1700);
        flourishDisk(stage, skin, t0, 0.9, 1.9);
        converge(stage, skin, t0, 40, 1.2, impactAt);
        void onImpact(() => {
          lightning(stage, skin, t0);
          setTimeout(() => lightning(stage, skin, t0, 0.25), 140);
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
        void onImpact(() => {
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
        void onImpact(() => {
          setTimeout(() => hooks.show?.(info.pieces), 280);
          burst(stage, skin, t0, 30, 1.6, 0.8, 0.12);
          burst(stage, skin, t1, 30, 1.6, 0.8, 0.12);
        });
        break;
      }
      case 'rewind': {
        stage.wrap.classList.add('vfx-rewind');
        setTimeout(() => stage.wrap.classList.remove('vfx-rewind'), 1500);
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
        void onImpact(() => {
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
        void onImpact(() => {
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
        void onImpact(() => {
          for (let i = 0; i < 3; i++) shockwave(stage, i === 1 ? C(skin.accent) : glowColor(skin), center, 7, 1, i * 0.12, 0.05);
          burst(stage, skin, new THREE.Vector3(0, 0, 0.8), 120, 6, 1, 0.14, { up: 0.3 });
        });
        break;
      }
      case 'knight_leap': {
        flourishDisk(stage, skin, t0, 1, 2.3, 0, 1.6);
        converge(stage, skin, t0, 40, 1.2, impactAt * 0.8);
        void onImpact(() => {
          const sq = info.targets[0];
          const f = sq & 7, r = sq >> 3;
          for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
            if (f + df < 0 || f + df > 7 || r + dr < 0 || r + dr > 7) continue;
            arcStream(stage, skin, t0, stage.local((r + dr) * 8 + f + df), 0.6, 1.1);
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
        void onImpact(() => burst(stage, skin, t0, 50, 1.4, 1.1, 0.14, { up: 1, gravity: 1.5 }));
        break;
      }
    }
  });
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
// Objets persistants

export function createMarker(stage: VfxStage, e: Effect, skin: SkinStyle, square: number): Marker | null {
  const at = stage.local(square);
  if (e.card === 'ice_wall') {
    const { group, mats } = crystalCluster(skin, 0.85);
    group.position.copy(at);
    let k = 0;
    return {
      obj: group,
      square,
      update(dt, t) {
        k = Math.min(1, k + dt * 3);
        group.scale.set(1, 1, Math.max(0.01, ease.outCubic(k)));
        for (const m of mats) m.emissiveIntensity = 0.45 + Math.sin(t * 2.2) * 0.15;
      },
      despawn: () => shatter(stage, skin, group, at),
    };
  }
  if (e.card === 'freeze') {
    const { group, mat } = iceCube(skin);
    group.position.copy(at);
    let k = 0;
    return {
      obj: group,
      square,
      update(dt, t) {
        k = Math.min(1, k + dt * 3);
        group.scale.set(1, 1, Math.max(0.01, ease.outCubic(k)));
        mat.emissiveIntensity = 0.22 + Math.sin(t * 1.8) * 0.08;
      },
      despawn: () => shatter(stage, skin, group, at),
    };
  }
  if (e.card === 'shield') {
    const { group, mat } = shieldDome(skin);
    group.position.copy(at);
    let k = 0;
    return {
      obj: group,
      square,
      update(dt, t) {
        k = Math.min(1, k + dt * 3);
        group.scale.setScalar(Math.max(0.01, ease.outCubic(k)));
        mat.uniforms.uTime.value = t;
        mat.uniforms.uAlpha.value = 0.65 + Math.sin(t * 2.5) * 0.15;
      },
      despawn: () => {
        let t = 0;
        return {
          update(dt) {
            t += dt;
            const k2 = Math.min(1, t / 0.4);
            group.scale.setScalar(1 + k2 * 0.4);
            mat.uniforms.uAlpha.value = 0.7 * (1 - k2);
            return k2 < 1;
          },
          dispose: () => disposeObject(group),
        };
      },
    };
  }
  return null;
}

function shatter(stage: VfxStage, skin: SkinStyle, group: THREE.Object3D, at: THREE.Vector3): Fx {
  burst(stage, skin, at.clone().setZ(0.4), 50, 2.6, 0.9, 0.12, { up: 0.7, gravity: -5 });
  let t = 0;
  return {
    update(dt) {
      t += dt;
      const k = Math.min(1, t / 0.35);
      group.scale.set(1 + k * 0.3, 1 + k * 0.3, Math.max(0.01, 1 - k));
      return k < 1;
    },
    dispose: () => disposeObject(group),
  };
}

// Système de particules sur GPU (une seule géométrie, mise à jour sur le CPU).
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute float size;
attribute float alpha;
attribute float rot;
attribute vec3 pcolor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
varying float vRot;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, size * uScale / -mv.z);
  vAlpha = alpha;
  vColor = pcolor;
  vRot = rot;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
varying float vAlpha;
varying vec3 vColor;
varying float vRot;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  uv = mat2(c, -s, s, c) * uv + 0.5;
  vec4 t = texture2D(map, uv);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.004) discard;
}`;

export interface EmitOptions {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  color: THREE.Color;
  size: number;
  life: number;
  /** Accélération verticale (z). */
  gravity?: number;
  /** Amortissement de la vitesse par seconde (0 à 1). */
  drag?: number;
  spin?: number;
  /** Attraction vers un point (tourbillon). */
  attract?: { x: number; y: number; z: number; k: number };
  fadeIn?: number;
}

export class Particles {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private rot: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private baseSize: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private spin: Float32Array;
  private fadeIn: Float32Array;
  private attract: (EmitOptions['attract'] | null)[];
  private cursor = 0;
  private alive = 0;
  readonly material: THREE.ShaderMaterial;

  constructor(capacity: number, map: THREE.Texture, blending: THREE.Blending) {
    this.n = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.max = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.fadeIn = new Float32Array(capacity);
    this.attract = new Array(capacity).fill(null);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { map: { value: map }, uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  get count() {
    return this.alive;
  }

  emit(o: EmitOptions) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    if (this.life[i] <= 0) this.alive++;
    this.pos[i * 3] = o.x;
    this.pos[i * 3 + 1] = o.y;
    this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx ?? 0;
    this.vel[i * 3 + 1] = o.vy ?? 0;
    this.vel[i * 3 + 2] = o.vz ?? 0;
    this.col[i * 3] = o.color.r;
    this.col[i * 3 + 1] = o.color.g;
    this.col[i * 3 + 2] = o.color.b;
    this.baseSize[i] = o.size;
    this.size[i] = o.size;
    this.life[i] = o.life;
    this.max[i] = o.life;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.spin[i] = o.spin ?? 0;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.fadeIn[i] = o.fadeIn ?? 0.08;
    this.attract[i] = o.attract ?? null;
    this.alpha[i] = 0;
  }

  update(dt: number) {
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      alive++;
      const k = i * 3;
      const a = this.attract[i];
      if (a) {
        const dx = a.x - this.pos[k], dy = a.y - this.pos[k + 1], dz = a.z - this.pos[k + 2];
        this.vel[k] += dx * a.k * dt;
        this.vel[k + 1] += dy * a.k * dt;
        this.vel[k + 2] += dz * a.k * dt;
      }
      this.vel[k + 2] += this.grav[i] * dt;
      const damp = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= damp;
      this.vel[k + 1] *= damp;
      this.vel[k + 2] *= damp;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.rot[i] += this.spin[i] * dt;
      const age = this.max[i] - this.life[i];
      const t = this.life[i] / this.max[i];
      const fin = this.fadeIn[i] > 0 ? Math.min(1, age / this.fadeIn[i]) : 1;
      this.alpha[i] = fin * Math.min(1, t * 2.2);
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * Math.min(1, t * 1.6));
    }
    this.alive = alive;
    const g = this.points.geometry;
    for (const name of ['position', 'pcolor', 'size', 'alpha', 'rot']) (g.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

// Scène WebGL superposée à l'échiquier. La caméra reproduit exactement la perspective CSS du plateau,
// ce qui permet d'incliner l'échiquier en 3D pendant un sort tout en gardant les effets alignés sur les cases.
import * as THREE from 'three';
import type { Color, Position } from '../../shared/chess';
import type { Effect } from '../../shared/game';
import { pieceSquare } from '../../shared/game';
import type { SkinStyle } from '../../shared/catalog';
import { skinStyle } from '../../shared/catalog';
import { Particles } from './particles';
import { particleTexture } from './textures';

export interface Fx {
  /** Renvoie false quand l'effet est terminé. */
  update(dt: number, t: number): boolean;
  dispose?(): void;
}

export interface Marker {
  obj: THREE.Object3D;
  square: number;
  update(dt: number, t: number): void;
  /** Animation de disparition (renvoie l'effet à jouer). */
  despawn(): Fx | null;
}

export type MarkerFactory = (stage: VfxStage, e: Effect, skin: SkinStyle, square: number) => Marker | null;

interface Cine {
  start: number;
  hold: number;
  tilt: number;
  zoom: number;
}

export const ease = {
  outCubic: (k: number) => 1 - (1 - k) ** 3,
  inCubic: (k: number) => k ** 3,
  inOutCubic: (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
  outBack: (k: number) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2,
  outElastic: (k: number) => (k === 0 || k === 1 ? k : 2 ** (-10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

export class VfxStage {
  readonly ok: boolean;
  readonly scene = new THREE.Scene();
  /** Plan de l'échiquier : 1 unité = 1 case, x vers la droite, y vers le haut de l'écran, z vers le joueur. */
  readonly board = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.05, 2000);
  private renderer: THREE.WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private fx: Fx[] = [];
  private cines: Cine[] = [];
  private systems = new Map<string, Particles>();
  private markers = new Map<number, Marker>();
  private raf = 0;
  private last = 0;
  time = 0;
  tilt = 0;
  zoom = 1;
  private shakeAmp = 0;
  private shakeDecay = 0;
  private applied = { x: 0, y: 0 };
  private size = { w: 0, h: 0 };
  private perspective = 1400;
  private lastMarkerRender = 0;
  reduced = false;
  markerFactory: MarkerFactory | null = null;

  constructor(readonly wrap: HTMLElement, public orientation: Color) {
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    try {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'vfx-canvas';
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      document.body.appendChild(this.canvas);
      this.ok = true;
    } catch {
      this.renderer = null;
      this.canvas?.remove();
      this.canvas = null;
      this.ok = false;
    }
    const p = parseFloat(getComputedStyle(wrap).perspective);
    if (p > 0) this.perspective = p;
    this.scene.add(this.board);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-2, -4, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd7ff, 1.2);
    rim.position.set(3, 6, 3);
    this.scene.add(rim);
  }

  /** Centre d'une case dans le repère de l'échiquier. */
  local(sq: number, z = 0): THREE.Vector3 {
    const f = sq & 7, r = sq >> 3;
    return this.orientation === 'w' ? new THREE.Vector3(f - 3.5, r - 3.5, z) : new THREE.Vector3(3.5 - f, 3.5 - r, z);
  }

  particles(skin: SkinStyle, shape = skin.particle): Particles {
    const blending = shape === 'void' || shape === 'petal' ? THREE.NormalBlending : THREE.AdditiveBlending;
    const key = `${shape}:${blending}`;
    let ps = this.systems.get(key);
    if (!ps) {
      ps = new Particles(2600, particleTexture(shape), blending);
      this.systems.set(key, ps);
      this.board.add(ps.points);
    }
    return ps;
  }

  add(fx: Fx) {
    this.fx.push(fx);
    this.kick();
  }

  /** Appelle `fn(k)` avec k de 0 à 1 pendant `duration` secondes, après `delay`. */
  tween(duration: number, fn: (k: number) => void, delay = 0, done?: () => void) {
    let t = -delay;
    this.add({
      update: dt => {
        t += dt;
        if (t < 0) return true;
        const k = Math.min(1, t / duration);
        fn(k);
        if (k >= 1) {
          done?.();
          return false;
        }
        return true;
      },
    });
  }

  wait(seconds: number): Promise<void> {
    return new Promise(resolve => {
      let t = 0;
      this.add({
        update: dt => {
          t += dt;
          if (t >= seconds) {
            resolve();
            return false;
          }
          return true;
        },
      });
    });
  }

  /** Inclinaison cinématographique de l'échiquier. */
  cinematic(hold: number, tilt = 0.5, zoom = 1.04) {
    if (this.reduced) return;
    this.cines.push({ start: this.time, hold, tilt, zoom });
    this.kick();
  }

  shake(amount: number, duration = 0.45) {
    if (this.reduced || amount <= 0) return;
    this.shakeAmp = Math.max(this.shakeAmp, amount * 9);
    this.shakeDecay = this.shakeAmp / duration;
    this.kick();
  }

  /** Flash plein écran (DOM) dans la couleur du skin. */
  flash(color: string, intensity: number) {
    if (intensity <= 0) return;
    const el = document.createElement('div');
    el.className = 'vfx-flash';
    el.style.background = `radial-gradient(circle at 50% 50%, ${color}, transparent 70%)`;
    el.style.setProperty('--fi', String(Math.min(1, intensity)));
    this.wrap.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  private kick() {
    if (!this.ok || this.raf) return;
    if (this.canvas) this.canvas.style.display = 'block';
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    // Plafond de 0,1 s : sur un appareil lent, l’animation saute des images au lieu de ralentir
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;

    // Inclinaison : on prend la plus forte des cinématiques en cours
    let tilt = 0;
    let zoom = 1;
    this.cines = this.cines.filter(c => {
      const t = this.time - c.start;
      const up = 0.55, down = 0.7;
      let k: number;
      if (t < up) k = ease.outCubic(t / up);
      else if (t < up + c.hold) k = 1;
      else if (t < up + c.hold + down) k = 1 - ease.inOutCubic((t - up - c.hold) / down);
      else return false;
      tilt = Math.max(tilt, k * c.tilt);
      zoom = Math.max(zoom, 1 + k * (c.zoom - 1));
      return true;
    });
    this.tilt = tilt;
    this.zoom = zoom;

    let sx = 0, sy = 0;
    if (this.shakeAmp > 0) {
      sx = (Math.random() * 2 - 1) * this.shakeAmp;
      sy = (Math.random() * 2 - 1) * this.shakeAmp;
      this.shakeAmp = Math.max(0, this.shakeAmp - this.shakeDecay * dt);
    }

    // Position du plateau (hors secousse) puis application de la nouvelle secousse
    const r = this.wrap.getBoundingClientRect();
    const baseX = r.left - this.applied.x;
    const baseY = r.top - this.applied.y;
    this.wrap.style.setProperty('--tilt', `${(tilt * 180) / Math.PI}deg`);
    this.wrap.style.setProperty('--zoom', String(zoom));
    this.wrap.style.translate = sx || sy ? `${sx}px ${sy}px` : '';
    this.applied = { x: sx, y: sy };
    this.syncCamera(baseX + sx, baseY + sy, r.width, r.height);

    this.fx = this.fx.filter(f => {
      const alive = f.update(dt, this.time);
      if (!alive) f.dispose?.();
      return alive;
    });
    for (const m of this.markers.values()) m.update(dt, this.time);
    let particlesAlive = 0;
    for (const ps of this.systems.values()) {
      ps.update(dt);
      particlesAlive += ps.count;
    }

    const busy = this.fx.length > 0 || this.cines.length > 0 || particlesAlive > 0 || this.shakeAmp > 0;
    if (busy || now - this.lastMarkerRender > 45) {
      this.renderer!.render(this.scene, this.camera);
      this.lastMarkerRender = now;
    }
    if (busy || this.markers.size) {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      this.renderer!.clear();
      this.wrap.style.setProperty('--tilt', '0deg');
      this.wrap.style.setProperty('--zoom', '1');
      if (this.canvas) this.canvas.style.display = 'none';
    }
  };

  private syncCamera(left: number, top: number, w: number, h: number) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (W !== this.size.w || H !== this.size.h) {
      this.renderer!.setSize(W, H, false);
      this.size = { w: W, h: H };
    }
    const cx = left + w / 2;
    const cy = top + h / 2;
    const P = this.perspective;
    const fullW = 2 * Math.max(cx, W - cx, 1);
    const fullH = 2 * Math.max(cy, H - cy, 1);
    const cam = this.camera;
    cam.fov = (2 * Math.atan(fullH / 2 / P) * 180) / Math.PI;
    cam.aspect = fullW / fullH;
    cam.setViewOffset(fullW, fullH, fullW / 2 - cx, fullH / 2 - cy, W, H);
    cam.position.set(0, 0, (P * 8) / w);
    cam.updateProjectionMatrix();
    this.board.rotation.x = -this.tilt;
    this.board.scale.setScalar(this.zoom);
    const scale = cam.projectionMatrix.elements[5] * (H * this.renderer!.getPixelRatio()) * 0.5;
    for (const ps of this.systems.values()) ps.material.uniforms.uScale.value = scale;
  }

  /** Synchronise les objets persistants (cristaux, blocs de glace, boucliers) avec les effets actifs. */
  syncMarkers(effects: Effect[], pos: Position) {
    if (!this.ok || !this.markerFactory) return;
    const seen = new Set<number>();
    for (const e of effects) {
      const square = e.square ?? (e.pieceId !== undefined ? pieceSquare(pos, e.pieceId) : -1);
      if (square < 0) continue;
      const existing = this.markers.get(e.id);
      if (existing) {
        seen.add(e.id);
        if (existing.square !== square) {
          existing.square = square;
          existing.obj.position.copy(this.local(square));
        }
        continue;
      }
      const m = this.markerFactory(this, e, skinStyle(e.skin), square);
      if (!m) continue;
      seen.add(e.id);
      this.markers.set(e.id, m);
      this.board.add(m.obj);
    }
    for (const [id, m] of this.markers) {
      if (seen.has(id)) continue;
      this.markers.delete(id);
      const fx = m.despawn();
      if (fx) this.add(fx);
      else {
        this.board.remove(m.obj);
        disposeObject(m.obj);
      }
    }
    this.kick();
  }

  setOrientation(o: Color, effects: Effect[], pos: Position) {
    if (o === this.orientation) return;
    this.orientation = o;
    for (const m of this.markers.values()) m.obj.position.copy(this.local(m.square));
    this.syncMarkers(effects, pos);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const f of this.fx) f.dispose?.();
    for (const ps of this.systems.values()) ps.dispose();
    for (const m of this.markers.values()) disposeObject(m.obj);
    this.markers.clear();
    this.renderer?.dispose();
    this.canvas?.remove();
    this.wrap.style.translate = '';
    this.wrap.style.setProperty('--tilt', '0deg');
    this.wrap.style.setProperty('--zoom', '1');
  }
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse(c => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(x => x.dispose());
    else mat?.dispose();
  });
  o.removeFromParent();
}

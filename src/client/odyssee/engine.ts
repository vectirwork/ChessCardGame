// Moteur de la descente : un seul calcul par image pour tous les calques, l'échiquier et l'altimètre.
// Uniquement des transform et des opacity ; rien n'est lu dans le DOM pendant le défilement
// (toutes les positions sont relevées dans measure(), au chargement et au redimensionnement).
import gsap from 'gsap';
import Lenis from 'lenis';
import { PLACES } from './data';
import type { PoseKey } from './data';
import { gameLayout, isMobile } from './shell/layout';

export { gameLayout, isMobile };

export interface Pose {
  x: number;
  y: number;
  /** Largeur affichée de l'échiquier, en pixels. */
  s: number;
  /** Opacité des anneaux de l'astrolabe derrière l'échiquier. */
  orb: number;
  /** Opacité des anneaux qui passent devant l'échiquier. */
  front: number;
  /** Opacité de l'échiquier (il s'efface dans la nuée entre deux lieux). */
  o: number;
  /** Inclinaison du plateau, en radians. */
  tilt: number;
  /** Légende sous l'échiquier (1 : affichée). */
  cap: number;
}

/** Appareil sans survol (tactile) : l'échiquier jouable de l'accueil est presque à plat dès le départ. */
const noHover = () => window.matchMedia?.('(hover: none)').matches ?? false;

/** Perspective du plateau (board.css) : sert à estimer la largeur réelle du bord avant incliné. */
const PERSP = 1400;

export function poseFor(key: PoseKey, vw: number, vh: number): Pose {
  if (isMobile(vw)) {
    // Accueil : l'échiquier jouable en majesté ; ensuite, une vignette flottante en bas à droite
    const big = Math.min(vw * 0.86, vh * 0.44);
    const pip = Math.min(96, vw * 0.25);
    if (key === 'hero') return { x: vw / 2, y: 62 + big * 0.5, s: big, orb: 1, front: 1, o: 1, tilt: 0.2, cap: 1 };
    return { x: vw - pip / 2 - 14, y: vh - pip / 2 - 30, s: pip, orb: 0.4, front: 0, o: 0, tilt: 0.5, cap: 0 };
  }
  const size = (k: number, w: number) => Math.min(vh * k, vw * w);
  switch (key) {
    case 'hero':
      return { x: vw * 0.69, y: vh * 0.47, s: size(0.6, 0.37), orb: 1, front: 1, o: 1, tilt: noHover() ? 0.2 : 0.8, cap: 1 };
    case 'foret':
      return { x: vw * 0.7, y: vh * 0.53, s: size(0.62, 0.39), orb: 0.5, front: 0.55, o: 1, tilt: 0.66, cap: 1 };
    case 'pics':
      return { x: vw * 0.285, y: vh * 0.53, s: size(0.6, 0.37), orb: 0.5, front: 0.55, o: 1, tilt: 0.66, cap: 1 };
    case 'sablier':
      return { x: vw * 0.705, y: vh * 0.53, s: size(0.6, 0.38), orb: 0.7, front: 0.45, o: 1, tilt: 0.66, cap: 1 };
    case 'bazar':
      return { x: vw * 0.25, y: vh * 0.53, s: size(0.5, 0.3), orb: 0.45, front: 0.5, o: 1, tilt: 0.66, cap: 1 };
    case 'seuil':
      return { x: vw * 0.5, y: vh * 0.5, s: size(0.42, 0.27), orb: 1, front: 0.85, o: 1, tilt: 0.7, cap: 1 };
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  s: lerp(a.s, b.s, t),
  orb: lerp(a.orb, b.orb, t),
  front: lerp(a.front, b.front, t),
  o: lerp(a.o, b.o, t),
  tilt: lerp(a.tilt, b.tilt, t),
  cap: lerp(a.cap, b.cap, t),
});

interface Section {
  el: HTMLElement;
  pose: PoseKey;
  scene: number;
  place: number;
  start: number;
  end: number;
}

interface SceneRec {
  els: HTMLElement[];
  layers: { el: HTMLElement; d: number }[];
  start: number;
  end: number;
  shown: boolean;
}

interface Chapter {
  el: HTMLElement;
  key: string;
  top: number;
  bottom: number;
}

interface Head {
  els: HTMLElement[];
  at: number;
  done: boolean;
}

interface Slot {
  top: number;
  h: number;
  cx: number;
  w: number;
}

export interface EngineHooks {
  onPlace: (index: number) => void;
  onChapter: (key: string | null) => void;
  onTransit: (inTransit: boolean) => void;
  onDock: (docked: boolean) => void;
}

export class Engine {
  lenis: Lenis | null = null;
  reduced: boolean;
  private sections: Section[] = [];
  private scenes: SceneRec[] = [];
  private skies: HTMLElement[] = [];
  private chapters: Chapter[] = [];
  private heads: Head[] = [];
  private slots: Slot[] = [];
  private poses = new Map<PoseKey, Pose>();
  private vw = 0;
  private vh = 0;
  private lastY = -1;
  private dirty = true;
  private mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  private place = -1;
  private chapter: string | null | undefined = undefined;
  private transit = false;
  private docked = false;
  private alt = -1;
  private G = 0;
  private canvas: HTMLCanvasElement | null = null;
  private applied = { o: -1, co: -1, orb: -1, front: -1, tilt: -99, cap: -1, k: -1 };
  /** 0 : page, 1 : partie en plein écran. */
  gameMix = 0;
  private hover = false;
  /** Éveil de l'échiquier jouable (survol ou toucher) : il se redresse face au joueur. */
  private awake = 0;
  private awakeTarget = 0;
  private gameFrom: Pose | null = null;
  private lastT = 0;
  private tick = (time: number) => {
    this.lenis?.raf(time * 1000);
    this.frame();
  };
  private ro: ResizeObserver;

  constructor(
    private root: HTMLElement,
    private astre: HTMLElement,
    private els: {
      alt: HTMLElement | null;
      altRoot: HTMLElement | null;
      orbits: HTMLElement | null;
      front: HTMLElement | null;
      caption: HTMLElement | null;
      header: HTMLElement | null;
    },
    private hooks: EngineHooks,
  ) {
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!this.reduced) this.lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true });
    gsap.ticker.add(this.tick);
    gsap.ticker.lagSmoothing(0);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    window.addEventListener('resize', this.measure);
    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(root);
    this.measure();
  }

  destroy() {
    gsap.ticker.remove(this.tick);
    window.removeEventListener('pointermove', this.onPointer);
    window.removeEventListener('resize', this.measure);
    this.ro.disconnect();
    this.lenis?.destroy();
    this.els.header?.classList.remove('is-hidden', 'is-scrolled');
  }

  /** Calque WebGL de l'échiquier de démonstration : il suit l'opacité de l'échiquier. */
  setCanvas(c: HTMLCanvasElement | null) {
    this.canvas = c;
    this.applied.co = -1;
    this.dirty = true;
  }

  /** Survol de l'échiquier : la légende devient une invitation. */
  setHover(on: boolean) {
    this.hover = on;
    this.dirty = true;
  }

  /** Échiquier jouable éveillé : il se redresse (plus d'inclinaison) pour que le geste tombe juste. */
  setAwake(on: boolean, instant = false) {
    this.awakeTarget = on ? 1 : 0;
    if (instant || this.reduced) this.awake = this.awakeTarget;
    this.dirty = true;
  }

  /** L'échiquier est-il assez redressé pour qu'un clic tombe sur la bonne case ? */
  get isAwake() {
    return this.awake > 0.97;
  }

  private onPointer = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    this.mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    this.mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  };

  /** Pose d'un lieu, bornée pour que l'échiquier (inclinaison et perspective comprises) reste à 40 px de la colonne de texte. */
  pose(key: PoseKey): Pose {
    return this.poses.get(key) ?? poseFor(key, this.vw, this.vh);
  }

  measure = () => {
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    const { vw, vh } = this;
    const y = window.scrollY;
    this.G = gameLayout(vw, vh).G;
    const els = Array.from(this.root.querySelectorAll<HTMLElement>('[data-pose]'));
    this.sections = els.map(el => {
      const r = el.getBoundingClientRect();
      const top = r.top + y;
      return {
        el,
        pose: el.dataset.pose as PoseKey,
        scene: Number(el.dataset.scene),
        place: Number(el.dataset.place),
        start: top,
        end: Math.max(top, top + r.height - vh),
      };
    });

    // Poses bornées par la colonne de texte de chaque lieu
    this.poses.clear();
    for (const s of this.sections) {
      const p = poseFor(s.pose, vw, vh);
      const col = s.el.querySelector<HTMLElement>('[data-col]');
      if (col && !isMobile(vw)) {
        const r = col.getBoundingClientRect();
        const half = (z: number) => (z / 2) * (PERSP / (PERSP - (this.G / 2) * Math.sin(p.tilt))) * 1.08;
        const gap = 40;
        if (r.left + r.width / 2 > vw / 2) {
          if (p.x + half(p.s) > r.left - gap) p.x = r.left - gap - half(p.s);
          if (p.x - half(p.s) < 40) {
            const room = r.left - gap - 40;
            p.s = Math.min(p.s, room / 2 / half(1));
            p.x = 40 + half(p.s);
          }
        } else {
          if (p.x - half(p.s) < r.right + gap) p.x = r.right + gap + half(p.s);
          if (p.x + half(p.s) > vw - 90) {
            const room = vw - 90 - r.right - gap;
            p.s = Math.min(p.s, room / 2 / half(1));
            p.x = vw - 90 - half(p.s);
          }
        }
      }
      if (!this.poses.has(s.pose)) this.poses.set(s.pose, p);
    }

    const sceneEls = Array.from(this.root.querySelectorAll<HTMLElement>('[data-scene-layer]'));
    const sceneCount = Math.max(0, ...sceneEls.map(e => Number(e.dataset.sceneLayer) + 1));
    this.scenes = Array.from({ length: sceneCount }, (_, i) => {
      const own = this.sections.filter(s => s.scene === i);
      const containers = sceneEls.filter(e => Number(e.dataset.sceneLayer) === i);
      return {
        els: containers,
        layers: containers.flatMap(c => Array.from(c.querySelectorAll<HTMLElement>(':scope > .o-layer')).map(el => ({ el, d: Number(el.dataset.d) }))),
        start: own.length ? Math.min(...own.map(s => s.start)) : 0,
        end: own.length ? Math.max(...own.map(s => s.end)) : 0,
        shown: true,
      };
    });
    this.skies = Array.from(this.root.querySelectorAll<HTMLElement>('.o-sky-layer'));
    this.chapters = Array.from(this.root.querySelectorAll<HTMLElement>('[data-chapter]')).map(el => {
      const r = el.getBoundingClientRect();
      return { el, key: el.dataset.chapter!, top: r.top + y, bottom: r.bottom + y };
    });
    // Titres de lieu : révélés seulement à la fin du trajet de l'échiquier
    this.heads = this.sections
      .map((s, i) => {
        const head = s.el.querySelector<HTMLElement>('.o-place-head');
        if (!head || i === 0) return null;
        const prev = this.sections[i - 1];
        const at = s.start - 0.2 * Math.max(1, s.start - prev.end) - (isMobile(vw) ? vh * 0.4 : 0);
        const done = this.heads.find(h => h.els[0] === head)?.done ?? false;
        return { els: [head, ...Array.from(head.querySelectorAll<HTMLElement>('.o-rv, .o-rv-lines'))], at, done };
      })
      .filter((h): h is Head => h !== null);
    // Emplacements de l'échiquier dans le texte (mobile)
    this.slots = Array.from(this.root.querySelectorAll<HTMLElement>('[data-slot]'))
      .map(el => {
        const r = el.getBoundingClientRect();
        return { top: r.top + y, h: r.height, cx: r.left + r.width / 2, w: r.width };
      })
      .filter(s => s.h > 0);
    this.astre.style.width = `${this.G}px`;
    this.astre.style.height = `${this.G}px`;
    this.applied = { o: -1, co: -1, orb: -1, front: -1, tilt: -99, cap: -1, k: -1 };
    this.dirty = true;
  };

  scrollTo(target: string | number, done?: () => void) {
    const el = typeof target === 'string' ? this.root.querySelector<HTMLElement>(target) : null;
    if (this.lenis) {
      this.lenis.scrollTo(el ?? (typeof target === 'number' ? target : 0), { duration: 2.2, easing: (t: number) => 1 - Math.pow(1 - t, 4), onComplete: () => done?.() });
    } else {
      if (typeof target === 'number') window.scrollTo(0, target);
      else el?.scrollIntoView();
      done?.();
    }
  }

  lock(on: boolean) {
    if (on) this.lenis?.stop();
    else this.lenis?.start();
  }

  /** Fige la pose de départ (ou d'arrivée) de la transition vers la partie. */
  captureGameFrom() {
    this.gameFrom = this.pagePose(window.scrollY);
  }

  markDirty() {
    this.dirty = true;
  }

  private travel(y: number, start: number, end: number, d: number) {
    // Mouvement réduit : chaque calque reste à sa position de repos dans son lieu
    if (this.reduced) return 0;
    const drift = 0.1;
    if (y < start) return (start - y) * d;
    if (y <= end) return -(y - start) * d * drift;
    return -(end - start) * d * drift - (y - end) * d;
  }

  /** Mobile : l'échiquier vient se poser dans l'emplacement le plus proche du centre de l'écran. */
  private dock(y: number, base: Pose): { p: Pose; w: number } {
    let best: Slot | null = null;
    let bestW = 0;
    for (const s of this.slots) {
      const cy = s.top + s.h / 2 - y;
      const dist = Math.abs(cy - this.vh * 0.5);
      const w = 1 - smooth(clamp01((dist - this.vh * 0.2) / (this.vh * 0.28)));
      if (w > bestW) {
        bestW = w;
        best = s;
      }
    }
    if (!best || bestW <= 0) return { p: base, w: 0 };
    const k = smooth(bestW);
    const target: Pose = { x: best.cx, y: best.top + best.h / 2 - y, s: best.w * 0.86 * (0.82 + 0.18 * k), orb: 0.75 * k, front: 0.8 * k, o: k, tilt: 0.62, cap: 0 };
    return { p: base.o > k ? lerpPose(target, base, base.o) : target, w: bestW };
  }

  scrollPose(y: number): Pose {
    const { vw, vh } = this;
    const secs = this.sections;
    if (!secs.length) return poseFor('hero', vw, vh);
    let p: Pose | null = null;
    for (let i = 0; i < secs.length && !p; i++) {
      const s = secs[i];
      if (y <= s.end) {
        if (y >= s.start || i === 0) {
          p = { ...this.pose(s.pose) };
          break;
        }
        const prev = secs[i - 1];
        const a = this.pose(prev.pose);
        const b = this.pose(s.pose);
        if (prev.pose === s.pose) {
          p = { ...b };
          break;
        }
        const lin = clamp01((y - prev.end) / Math.max(1, s.start - prev.end));
        const t = smooth(lin);
        p = lerpPose(a, b, t);
        // L'échiquier traverse la nuée : il rapetisse et s'efface à mi-chemin, sans jamais passer sur les textes
        const k = Math.sin(lin * Math.PI);
        const crossing = Math.abs(a.x - b.x) > vw * 0.2;
        p.s *= 1 - (crossing ? 0.42 : 0.14) * k;
        p.o = 1 - 0.86 * k;
        p.orb *= 1 - 0.7 * k;
        p.front *= 1 - k;
        p.y += k * vh * 0.05;
      }
    }
    if (!p) {
      // Après le Seuil : l'échiquier entre dans la porte et s'éteint dans sa lumière
      const last = secs[secs.length - 1];
      const base = this.pose(last.pose);
      const u = smooth(clamp01((y - last.end) / (vh * 0.6)));
      p = { ...base, y: lerp(base.y, vh * 0.56, u) - (y - last.end) * (this.reduced ? 1 : 0.14), s: base.s * (1 - 0.88 * u), o: base.o * (1 - u), front: base.front * (1 - u), orb: base.orb * (1 - u) };
    }
    if (isMobile(vw) && this.slots.length) {
      const hero = secs[0];
      if (y > hero.end + vh * 0.05) {
        const d = this.dock(y, p);
        p = d.p;
        if ((d.w > 0.5) !== this.docked) {
          this.docked = d.w > 0.5;
          this.astre.classList.toggle('is-docked', this.docked);
          this.hooks.onDock(this.docked);
        }
      }
    }
    if (this.reduced) p.tilt = 0;
    return p;
  }

  /** Pose de la page à ce défilement, éveil de l'échiquier compris. */
  private pagePose(y: number): Pose {
    const p = this.scrollPose(y);
    if (this.awake > 0) {
      const a = smooth(this.awake);
      p.tilt *= 1 - a;
      p.s *= 1 + 0.025 * a;
    }
    return p;
  }

  private frame() {
    const y = window.scrollY;
    const m = this.mouse;
    const mdx = m.tx - m.x, mdy = m.ty - m.y;
    const moving = Math.abs(mdx) > 0.001 || Math.abs(mdy) > 0.001;
    if (moving) {
      m.x += mdx * 0.06;
      m.y += mdy * 0.06;
    }
    // Éveil : approche exponentielle indépendante de la cadence (≈ 0,35 s pour se redresser)
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - (this.lastT || now)) / 1000));
    this.lastT = now;
    const da = this.awakeTarget - this.awake;
    const waking = Math.abs(da) > 0.001;
    if (waking) this.awake = Math.abs(da) < 0.01 ? this.awakeTarget : this.awake + da * (1 - Math.exp(-dt / 0.1));
    if (y === this.lastY && !moving && !waking && !this.dirty) return;
    if (this.els.header && this.gameMix === 0) {
      const dy = y - this.lastY;
      if (dy > 3 && y > 240) this.els.header.classList.add('is-hidden');
      else if (dy < -3 || y < 240) this.els.header.classList.remove('is-hidden');
      this.els.header.classList.toggle('is-scrolled', y > 40);
    }
    this.lastY = y;
    this.dirty = false;
    const { vh } = this;
    const mobile = isMobile(this.vw);
    const mx = this.reduced || mobile ? 0 : m.x;
    const my = this.reduced || mobile ? 0 : m.y;

    // Calques des lieux
    for (const sc of this.scenes) {
      const visible = y > sc.start - vh * 1.6 && y < sc.end + vh * 1.6;
      if (visible !== sc.shown) {
        sc.shown = visible;
        for (const el of sc.els) el.style.visibility = visible ? 'visible' : 'hidden';
      }
      if (!visible) continue;
      const fadeIn = smooth(clamp01((y - (sc.start - vh * 1.05)) / (vh * 0.75)));
      const fadeOut = 1 - smooth(clamp01((y - (sc.end + vh * 0.2)) / (vh * 0.5)));
      const op = sc.start === 0 ? fadeOut : fadeIn * fadeOut;
      for (const el of sc.els) {
        if (el.dataset.part !== 'back') continue;
        el.style.opacity = op.toFixed(3);
        // Un décor transparent n'est pas peint (ses animations ne coûtent rien)
        el.style.visibility = op < 0.004 ? 'hidden' : 'visible';
      }
      for (const l of sc.layers) {
        const ty = this.travel(y, sc.start, sc.end, l.d);
        const k = Math.min(l.d, 1.2);
        l.el.style.transform = `translate3d(${(-mx * k * 18).toFixed(2)}px, ${(ty - my * k * 10).toFixed(2)}px, 0)`;
      }
    }

    // Ciel : fondu enchaîné d'une teinte à l'autre
    for (let i = 1; i < this.skies.length; i++) {
      const sc = this.scenes[i];
      if (!sc) continue;
      const k = smooth(clamp01((y - (sc.start - vh * 1.0)) / (vh * 0.9)));
      this.skies[i].style.opacity = k.toFixed(3);
    }

    // Échiquier
    const pose = this.pagePose(y);
    let p = pose;
    if (this.gameMix > 0) {
      const g = gameLayout(this.vw, this.vh);
      const from = this.gameFrom ?? pose;
      p = lerpPose(from, { x: g.x, y: g.y, s: g.G, orb: 1, front: 0, o: 1, tilt: 0, cap: 0 }, this.gameMix);
    }
    const k = p.s / this.G;
    this.astre.style.transform = `translate3d(${(p.x - this.G / 2).toFixed(2)}px, ${(p.y - this.G / 2).toFixed(2)}px, 0) scale(${k.toFixed(4)})`;
    const a = this.applied;
    const kr = Math.round(k * 1000) / 1000;
    if (kr !== a.k) {
      // Échelle de l'échiquier : la pièce glissée la compense pour rester sous le doigt
      a.k = kr;
      this.astre.style.setProperty('--k', String(kr));
      this.astre.style.setProperty('--inv-k', String(Math.round((1 / Math.max(0.05, kr)) * 1000) / 1000));
    }
    const o = Math.round(p.o * 1000) / 1000;
    const co = Math.round(o * Math.max(0, 1 - this.gameMix * 5) * 1000) / 1000;
    if (o !== a.o || co !== a.co) {
      a.o = o;
      a.co = co;
      this.astre.style.opacity = String(o);
      if (this.canvas) this.canvas.style.opacity = String(co);
    }
    const orb = Math.round(p.orb * 1000) / 1000;
    if (orb !== a.orb && this.els.orbits) {
      a.orb = orb;
      this.els.orbits.style.opacity = String(orb);
    }
    const front = Math.round(p.front * 1000) / 1000;
    if (front !== a.front && this.els.front) {
      a.front = front;
      this.els.front.style.opacity = String(front);
    }
    const tilt = Math.round(((p.tilt * 180) / Math.PI) * 10) / 10;
    if (tilt !== a.tilt) {
      a.tilt = tilt;
      this.astre.style.setProperty('--base-tilt', `${tilt}deg`);
    }
    if (this.els.caption) {
      const show = this.gameMix === 0 && p.s > 200 && p.o > 0.9 && (p.cap > 0.5 || this.hover) ? 1 : 0;
      const below = mobile ? p.s * 0.5 * Math.cos(p.tilt) + 22 : p.s * 0.5 + 34;
      this.els.caption.style.transform = `translate3d(${p.x.toFixed(1)}px, ${(p.y + below).toFixed(1)}px, 0) translateX(-50%)`;
      if (show !== a.cap) {
        a.cap = show;
        this.els.caption.style.opacity = String(show);
        this.els.caption.style.visibility = show ? 'visible' : 'hidden';
      }
    }
    const inTransit = p.o < 0.75 && this.gameMix === 0;
    if (inTransit !== this.transit) {
      this.transit = inTransit;
      this.hooks.onTransit(inTransit);
    }

    // Titres de lieu révélés à la fin du trajet
    for (const h of this.heads) {
      if (!h.done && y >= h.at) {
        h.done = true;
        for (const el of h.els) el.classList.add('in');
      }
    }

    // Lieu courant, chapitre actif, altimètre
    let place = 0;
    for (const s of this.sections) if (y >= s.start - vh * 0.5) place = s.place;
    if (place !== this.place) {
      this.place = place;
      this.hooks.onPlace(place);
    }
    const mid = y + vh * 0.5;
    let chapter: string | null = null;
    for (const c of this.chapters) if (mid >= c.top && mid < c.bottom) chapter = c.key;
    if (chapter !== this.chapter) {
      this.chapter = chapter;
      this.hooks.onChapter(chapter);
    }
    if (this.els.alt) {
      const firsts = PLACES.map((_, i) => this.sections.find(s => s.place === i)?.start ?? 0);
      let alt = PLACES[0].alt;
      for (let i = 0; i < PLACES.length - 1; i++) {
        if (y >= firsts[i]) {
          const t = clamp01((y - firsts[i]) / Math.max(1, firsts[i + 1] - firsts[i]));
          alt = lerp(PLACES[i].alt, PLACES[i + 1].alt, t);
        }
      }
      const rounded = Math.round(alt / 10) * 10;
      if (rounded !== this.alt) {
        this.alt = rounded;
        this.els.alt.textContent = rounded.toLocaleString('fr-FR');
      }
      const total = firsts[firsts.length - 1] || 1;
      this.els.altRoot?.style.setProperty('--descent', clamp01(y / total).toFixed(4));
    }
  }
}

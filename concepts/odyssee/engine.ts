// Moteur de la descente : un seul calcul par image pour tous les calques, l'échiquier et l'altimètre.
// Uniquement des transform et des opacity ; rien n'est lu dans le DOM pendant le défilement
// (toutes les positions sont relevées dans measure(), au chargement et au redimensionnement).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { PLACES } from './data';
import type { PoseKey } from './data';

gsap.registerPlugin(ScrollTrigger);

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
  /** Légende sous l'échiquier (1 : affichée). Masquée à l'accueil, où l'observatoire occupe cette place. */
  cap: number;
}

export const isMobile = (vw: number) => vw < 820;

/** Perspective du plateau (board.css) : sert à estimer la largeur réelle du bord avant incliné. */
const PERSP = 1400;

export function poseFor(key: PoseKey, vw: number, vh: number): Pose {
  if (isMobile(vw)) {
    // Accueil : l'échiquier en majesté ; ensuite, une vignette flottante en bas à droite qui lance la partie
    const big = Math.min(vw * 0.8, vh * 0.42);
    const pip = Math.min(96, vw * 0.25);
    if (key === 'hero') return { x: vw / 2, y: 58 + big * 0.46 + 8, s: big, orb: 1, front: 1, o: 1, tilt: 0.74, cap: 0 };
    // Ailleurs, l'échiquier se cache près de la pastille « Jouer » et ne réapparaît que posé dans le texte
    return { x: vw - pip / 2 - 14, y: vh - pip / 2 - 30, s: pip, orb: 0.4, front: 0, o: 0, tilt: 0.5, cap: 0 };
  }
  const size = (k: number, w: number) => Math.min(vh * k, vw * w);
  switch (key) {
    case 'hero':
      return { x: vw * 0.69, y: vh * 0.47, s: size(0.6, 0.37), orb: 1, front: 1, o: 1, tilt: 0.8, cap: 0 };
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

/** Disposition du mode jeu : taille de l'échiquier et centre. Une marge basse absorbe l'inclinaison des sorts. */
export function gameLayout(vw: number, vh: number) {
  if (isMobile(vw)) {
    const G = Math.min(vw - 16, vh * 0.5);
    return { G, x: vw / 2, y: 92 + G / 2, mobile: true };
  }
  const left = Math.max(400, vw * 0.3);
  const right = Math.max(150, vw * 0.11);
  const G = Math.min(vh - 150, vw - left - right);
  return { G, x: left + (vw - left - right) / 2, y: (56 + vh - 94) / 2, mobile: false };
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
  private applied = { o: -1, co: -1, orb: -1, front: -1, tilt: -99, cap: -1 };
  /** 0 : page, 1 : partie en plein écran. */
  gameMix = 0;
  private hover = false;
  private gameFrom: Pose | null = null;
  private tick = (time: number) => {
    this.lenis?.raf(time * 1000);
    this.frame();
  };
  private ro: ResizeObserver;

  constructor(
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
    if (!this.reduced) {
      this.lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true });
      this.lenis.on('scroll', ScrollTrigger.update);
    }
    gsap.ticker.add(this.tick);
    gsap.ticker.lagSmoothing(0);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    window.addEventListener('resize', this.measure);
    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(document.body);
    this.measure();
  }

  destroy() {
    gsap.ticker.remove(this.tick);
    window.removeEventListener('pointermove', this.onPointer);
    window.removeEventListener('resize', this.measure);
    this.ro.disconnect();
    this.lenis?.destroy();
  }

  /** Calque WebGL de l'échiquier de démonstration : il suit l'opacité de l'échiquier. */
  setCanvas(c: HTMLCanvasElement | null) {
    this.canvas = c;
    this.applied.co = -1;
    this.dirty = true;
  }

  /** Survol de l'échiquier : la légende devient une invitation à jouer, même à l'accueil. */
  setHover(on: boolean) {
    this.hover = on;
    this.dirty = true;
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
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-pose]'));
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
        // Demi-largeur du bord avant de l'échiquier incliné, cadre compris
        const half = (z: number) => (z / 2) * (PERSP / (PERSP - (this.G / 2) * Math.sin(p.tilt))) * 1.08;
        const gap = 40;
        if (r.left + r.width / 2 > vw / 2) {
          // Texte à droite
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

    const sceneEls = Array.from(document.querySelectorAll<HTMLElement>('[data-scene-layer]'));
    const sceneCount = Math.max(0, ...sceneEls.map(e => Number(e.dataset.sceneLayer) + 1));
    this.scenes = Array.from({ length: sceneCount }, (_, i) => {
      const own = this.sections.filter(s => s.scene === i);
      const containers = sceneEls.filter(e => Number(e.dataset.sceneLayer) === i);
      return {
        els: containers,
        layers: containers.flatMap(c => Array.from(c.querySelectorAll<HTMLElement>(':scope > .layer')).map(el => ({ el, d: Number(el.dataset.d) }))),
        start: own.length ? Math.min(...own.map(s => s.start)) : 0,
        end: own.length ? Math.max(...own.map(s => s.end)) : 0,
        shown: true,
      };
    });
    this.skies = Array.from(document.querySelectorAll<HTMLElement>('.sky-layer'));
    this.chapters = Array.from(document.querySelectorAll<HTMLElement>('[data-chapter]')).map(el => {
      const r = el.getBoundingClientRect();
      return { el, key: el.dataset.chapter!, top: r.top + y, bottom: r.bottom + y };
    });
    // Titres de lieu : révélés seulement à la fin du trajet de l'échiquier (t > 0,8)
    this.heads = this.sections
      .map((s, i) => {
        const head = s.el.querySelector<HTMLElement>('.place-head');
        if (!head || i === 0) return null;
        const prev = this.sections[i - 1];
        const at = s.start - 0.2 * Math.max(1, s.start - prev.end) - (isMobile(vw) ? vh * 0.4 : 0);
        const done = this.heads.find(h => h.els[0] === head)?.done ?? false;
        return { els: [head, ...Array.from(head.querySelectorAll<HTMLElement>('.rv, .rv-lines'))], at, done };
      })
      .filter((h): h is Head => h !== null);
    // Emplacements de l'échiquier dans le texte (mobile)
    this.slots = Array.from(document.querySelectorAll<HTMLElement>('[data-slot]'))
      .map(el => {
        const r = el.getBoundingClientRect();
        return { top: r.top + y, h: r.height, cx: r.left + r.width / 2, w: r.width };
      })
      .filter(s => s.h > 0);
    this.astre.style.width = `${this.G}px`;
    this.astre.style.height = `${this.G}px`;
    this.applied = { o: -1, co: -1, orb: -1, front: -1, tilt: -99, cap: -1 };
    this.dirty = true;
    ScrollTrigger.refresh();
  };

  scrollTo(target: string | number, done?: () => void) {
    if (this.lenis) this.lenis.scrollTo(target, { duration: 2.2, easing: (t: number) => 1 - Math.pow(1 - t, 4), onComplete: () => done?.() });
    else {
      if (typeof target === 'number') window.scrollTo(0, target);
      else document.querySelector(target)?.scrollIntoView();
      done?.();
    }
  }

  lock(on: boolean) {
    if (on) this.lenis?.stop();
    else this.lenis?.start();
  }

  /** Fige la pose de départ de la transition vers la partie. */
  captureGameFrom() {
    this.gameFrom = this.scrollPose(window.scrollY);
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
    // L'échiquier naît sur place (fondu et léger grossissement) et défile avec le texte
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
        // Légère plongée, comme porté par la chute
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

  private frame() {
    const y = window.scrollY;
    const m = this.mouse;
    const mdx = m.tx - m.x, mdy = m.ty - m.y;
    const moving = Math.abs(mdx) > 0.001 || Math.abs(mdy) > 0.001;
    if (moving) {
      m.x += mdx * 0.06;
      m.y += mdy * 0.06;
    }
    if (y === this.lastY && !moving && !this.dirty) return;
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
    const pose = this.scrollPose(y);
    let p = pose;
    if (this.gameMix > 0) {
      const g = gameLayout(this.vw, this.vh);
      const from = this.gameFrom ?? pose;
      p = lerpPose(from, { x: g.x, y: g.y, s: g.G, orb: 1, front: 0, o: 1, tilt: 0, cap: 0 }, this.gameMix);
    }
    const k = p.s / this.G;
    this.astre.style.transform = `translate3d(${(p.x - this.G / 2).toFixed(2)}px, ${(p.y - this.G / 2).toFixed(2)}px, 0) scale(${k.toFixed(4)})`;
    const a = this.applied;
    const o = Math.round(p.o * 1000) / 1000;
    // Les effets de la démonstration s'éteignent dès que l'échiquier part vers la partie
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
      const show = this.gameMix === 0 && p.s > 260 && p.o > 0.9 && (p.cap > 0.5 || this.hover) ? 1 : 0;
      this.els.caption.style.transform = `translate3d(${p.x.toFixed(1)}px, ${(p.y + p.s * 0.5 + 34).toFixed(1)}px, 0) translateX(-50%)`;
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

// Boucle de rendu du monde : lit le défilement (Lenis), place la caméra, règle la présence des monuments,
// affiche le panneau de texte du lieu où la caméra est arrêtée et pilote le HUD.
// Aucune mise à jour React au défilement : écritures DOM directes, seulement transform et opacity.
import Lenis from 'lenis';
import { LIEUX } from './data';
import {
  Cam, camAt, camTransform, clamp, depthOf, gameCam, gameRect, horizonY, introCam, isMobile, keyframes, lerp, nearestStation,
  perspectiveFor, project, smooth, sqZ, stationPresence, stationRamps, stations,
} from './engine';
import type { Key } from './engine';
import { PAWN, PROMO_PAWN, monTransform } from './world';

interface MonRec {
  el: HTMLElement;
  x: number;
  z: number;
  a: number;
  b: number;
  far: number;
  soft: number;
  /** Hauteur réelle dans le monde (pour le garde-fou de taille à l'écran). */
  tall: number;
  /** Distance de début d'effacement près de la caméra. */
  near: number;
  op: number;
  vis: boolean;
  /** Cartes de l'Allée : elles s'ouvrent comme des battants quand la caméra approche. */
  swing: null | { y: number; w: number; h: number; ry: number; side: number; last: number; k: number };
}

interface FadeRec {
  el: HTMLElement;
  a: number;
  b: number;
  op: number;
}

interface PanelRec {
  sec: HTMLElement;
  panel: HTMLElement;
  veil: HTMLElement | null;
  op: number;
  ty: number;
  on: boolean;
}

const RANK_OF_S = [1, 3, 4.5, 6, 7, 8, 8];
const q = (v: number, n = 100) => Math.round(v * n) / n;

export class Scene {
  W = window.innerWidth;
  H = window.innerHeight;
  P = perspectiveFor(this.W, this.H);
  keys: Key[] = keyframes(this.W, this.H);
  sts = stations(this.W);
  ramps = stationRamps(this.sts);
  /** Distance à laquelle les cartes de l'Allée commencent à pivoter (plus courte sur mobile, plus étroit). */
  swingAt = isMobile(this.W) ? 1150 : 1560;
  tops: number[] = [];
  maxScroll = 1;
  lenis: Lenis | null = null;
  driver: 'scroll' | 'tween' = 'scroll';
  /** Caméra pilotée par GSAP (ouverture, plongée vers le jeu). */
  tcam: Cam = { ...introCam(this.W) };
  /** 1 = monuments visibles, 0 = effacés (mode jeu). */
  worldFade = 1;
  /** Les monuments s'enfoncent dans le sol pendant la plongée (1 = debout, 0 = à plat). */
  sink = 1;
  /** Sol, grille et marquages : atténués en mode jeu (fond du plateau). */
  floorDim = 1;
  /** Couleurs de jeu sur le sol (0 à 1). */
  lit = 0;
  reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** En partie : la caméra reste calée sur l'échiquier jouable (recalculée au redimensionnement). */
  inGame = false;
  s = 0;
  private mons: MonRec[] = [];
  private fades: FadeRec[] = [];
  private panels: PanelRec[] = [];
  private raf = 0;
  private dirty = true;
  private lastY = -1;
  private active = -1;
  private nearest = -1;
  private focus = -1;
  private rig: HTMLElement;
  private floor: HTMLElement | null;
  private rail: HTMLElement | null;
  private sky: HTMLElement | null;
  private fog: HTMLElement | null;
  private pawn: HTMLElement | null;
  private ppawn: HTMLElement | null;
  private risers: HTMLElement[];
  private rankEl: HTMLElement | null;
  private nameEl: HTMLElement | null;
  private shortEl: HTMLElement | null;
  private codexRect = { l: 0, t: 0, r: 0, b: 0 };
  private fine = false;
  /** Parallaxe à la souris (bureau) : cible et valeur lissée. */
  private mouse = { tx: 0, ty: 0, x: 0, y: 0 };
  private lastRise = -1;
  private foot: HTMLElement | null = null;
  private footTop = 1e9;
  private lastRank = '';
  private lastCamKey = '';
  private lastSink = -1;
  private lastFog = -1;
  onFocus: ((k: number) => void) | null = null;
  onLieu: ((i: number) => void) | null = null;

  constructor(private root: HTMLElement) {
    this.rig = root.querySelector<HTMLElement>('#rig')!;
    this.floor = root.querySelector<HTMLElement>('.floor');
    this.rail = root.querySelector<HTMLElement>('.rail');
    this.sky = root.querySelector<HTMLElement>('#skyMove');
    this.fog = root.querySelector<HTMLElement>('.fog');
    this.pawn = root.querySelector<HTMLElement>('#pawn');
    this.ppawn = root.querySelector<HTMLElement>('#ppawn');
    this.risers = Array.from(root.querySelectorAll<HTMLElement>('.mon-black, #queen, #ppawn, .mon-beam'));
    this.rankEl = root.querySelector<HTMLElement>('#hudRank');
    this.foot = root.querySelector<HTMLElement>('.foot');
    this.nameEl = root.querySelector<HTMLElement>('#hudName');
    this.shortEl = root.querySelector<HTMLElement>('#hudShort');
    this.fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (this.fine && !this.reduced) window.addEventListener('pointermove', this.onPointer, { passive: true });
    this.scan();
    const veils = Array.from(root.querySelectorAll<HTMLElement>('.veil'));
    this.panels = Array.from(root.querySelectorAll<HTMLElement>('.lieu')).map((sec, i) => ({
      sec,
      panel: sec.querySelector<HTMLElement>('.panel')!,
      veil: veils[i] ?? null,
      op: -1,
      ty: -999,
      on: false,
    }));
    this.measure();
    if (!this.reduced) {
      this.lenis = new Lenis({ autoRaf: false, lerp: 0.085, wheelMultiplier: 0.9 });
    }
    window.addEventListener('resize', this.onResize);
    this.raf = requestAnimationFrame(this.frame);
  }

  /** (Re)lit les monuments et les marquages du monde (après un changement de disposition). */
  scan() {
    this.mons = Array.from(this.root.querySelectorAll<HTMLElement>('.mon')).map(el => {
      const d = el.dataset;
      return {
        el,
        x: +d.x!,
        z: +d.z!,
        a: +d.a!,
        b: +d.b!,
        far: +d.far!,
        soft: +(d.soft ?? 0),
        tall: +(d.tall ?? 0),
        near: d.near ? +d.near : 600,
        op: -1,
        vis: true,
        swing: d.swing ? { y: +d.y!, w: +d.w!, h: +d.h!, ry: +d.ry!, side: +d.swing, last: -999, k: 0 } : null,
      };
    });
    this.fades = Array.from(this.root.querySelectorAll<HTMLElement>('[data-fa]')).map(el => ({
      el,
      a: +el.dataset.fa!,
      b: +el.dataset.fb!,
      op: -1,
    }));
    this.focus = -1;
    this.lastCamKey = '';
    this.dirty = true;
  }

  private onPointer = (e: PointerEvent) => {
    this.mouse.tx = (e.clientX / this.W) * 2 - 1;
    this.mouse.ty = (e.clientY / this.H) * 2 - 1;
  };

  private onResize = () => {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.P = perspectiveFor(this.W, this.H);
    this.keys = keyframes(this.W, this.H);
    this.sts = stations(this.W);
    this.ramps = stationRamps(this.sts);
    this.swingAt = isMobile(this.W) ? 1150 : 1560;
    this.measure();
    if (this.inGame) Object.assign(this.tcam, gameCam(this.W, this.H, this.P, gameRect(this.W, this.H)));
    this.dirty = true;
    this.lastCamKey = '';
  };

  measure() {
    const y = window.scrollY;
    this.tops = this.panels.map(p => p.sec.getBoundingClientRect().top + y);
    this.maxScroll = Math.max(1, document.documentElement.scrollHeight - this.H);
    if (this.foot) this.footTop = this.foot.getBoundingClientRect().top + y;
    this.root.style.setProperty('--P', `${this.P}px`);
    const codex = this.root.querySelector<HTMLElement>('.codex');
    if (codex) {
      // offset* ignore les transformations : position de repos du codex dans son panneau fixe
      const l = codex.offsetLeft, t = codex.offsetTop;
      this.codexRect = { l: l - 16, t: t - 16, r: l + codex.offsetWidth + 16, b: t + codex.offsetHeight };
    }
    this.lastCamKey = '';
    this.dirty = true;
  }

  /** Coordonnée de section : i + avancement dans le lieu i. */
  sectionCoord(y: number) {
    const t = this.tops;
    const n = t.length;
    for (let i = n - 1; i >= 0; i--) {
      if (y >= t[i] || i === 0) {
        const end = i < n - 1 ? t[i + 1] : this.maxScroll;
        return i + clamp((y - t[i]) / Math.max(1, end - t[i]), 0, 1);
      }
    }
    return 0;
  }

  scrollCam(): Cam {
    return camAt(this.s, this.keys);
  }

  markDirty = () => {
    this.dirty = true;
  };

  scrollTo(target: number | HTMLElement, immediate = false) {
    if (this.lenis) this.lenis.scrollTo(target, { immediate, duration: immediate ? 0 : 2.2 });
    else {
      const y = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: y, behavior: 'auto' });
    }
  }

  /** Défilement (en px) correspondant à la coordonnée de section s. */
  yOf(s: number) {
    const i = Math.max(0, Math.min(this.tops.length - 1, Math.floor(s)));
    const end = i < this.tops.length - 1 ? this.tops[i + 1] : this.maxScroll;
    return this.tops[i] + (s - i) * (end - this.tops[i]);
  }

  /** Défilement immédiat jusqu'à la coordonnée de section s (outil de capture). */
  gotoS(s: number) {
    const y = this.yOf(s);
    if (this.lenis) this.lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
    this.dirty = true;
    return Math.round(y);
  }

  /** Coordonnée de défilement d'un lieu : le milieu de sa station, là où la caméra est arrêtée. */
  stationY(i: number) {
    const st = this.sts[i];
    const a = Math.max(i, st[0]);
    const b = Math.min(i + 0.98, st[1]);
    return this.yOf(i === 0 ? 0 : a + (b - a) * 0.25);
  }

  lock(on: boolean) {
    if (on) this.lenis?.stop();
    else this.lenis?.start();
    document.documentElement.classList.toggle('locked', on);
  }

  private frame = (t: number) => {
    this.raf = requestAnimationFrame(this.frame);
    this.lenis?.raf(t);
    const y = this.lenis ? this.lenis.animatedScroll : window.scrollY;
    if (y !== this.lastY) {
      this.lastY = y;
      this.dirty = true;
    }
    if (this.driver === 'tween') this.dirty = true;
    const m = this.mouse;
    if (Math.abs(m.tx - m.x) > 0.001 || Math.abs(m.ty - m.y) > 0.001) {
      m.x += (m.tx - m.x) * 0.05;
      m.y += (m.ty - m.y) * 0.05;
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.s = this.sectionCoord(y);
    this.render(y);
  };

  private render(y: number) {
    const s = this.s;
    const { P, W, H } = this;
    let cam = this.driver === 'scroll' ? this.scrollCam() : this.tcam;
    if (this.driver === 'scroll' && this.fine) {
      cam = { ...cam, yaw: cam.yaw + this.mouse.x * 1.6, pitch: cam.pitch + this.mouse.y * 0.9 };
    }
    const key = `${this.driver}|${cam.x.toFixed(1)}|${cam.h.toFixed(1)}|${cam.z.toFixed(1)}|${cam.pitch.toFixed(2)}|${cam.yaw.toFixed(2)}|${this.worldFade.toFixed(3)}|${this.lit.toFixed(3)}|${this.sink.toFixed(3)}|${this.floorDim.toFixed(3)}|${s.toFixed(4)}`;
    if (key === this.lastCamKey) return;
    this.lastCamKey = key;
    this.rig.style.transform = camTransform(cam, P);
    if (this.floor) {
      this.floor.style.setProperty('--lit', this.lit.toFixed(3));
      this.floor.style.setProperty('--wf', this.worldFade.toFixed(3));
      this.floor.style.setProperty('--fd', this.floorDim.toFixed(3));
    }
    const sink = q(this.sink, 200);
    if (sink !== this.lastSink) {
      this.lastSink = sink;
      this.rig.style.setProperty('--sink', String(Math.max(0.001, sink)));
    }

    // Ciel : l'horizon suit la plongée, le décor glisse avec le lacet
    const hy = horizonY(cam, P, H);
    const yawShift = -Math.tan((clamp(cam.yaw, -75, 75) * Math.PI) / 180) * P * 0.85;
    const dy = (hy - H / 2).toFixed(1);
    if (this.sky) this.sky.style.transform = `translate3d(${yawShift.toFixed(1)}px, ${dy}px, 0)`;
    if (this.fog) {
      this.fog.style.transform = `translate3d(0, ${dy}px, 0)`;
      // Aux Portes, la brume d'horizon passerait sur les titres des arches : elle s'efface
      const fo = q(1 - 0.85 * stationPresence(s, this.sts[4], 0.3).p, 50);
      if (fo !== this.lastFog) {
        this.lastFog = fo;
        this.fog.style.opacity = String(fo);
      }
    }

    // Le pion avance de c2 à c3 pendant la Règle ; le pion de la Promotion arrive sur d8
    if (this.pawn) {
      const k = smooth(clamp((s - 0.95) / 0.6));
      const z = lerp(sqZ(2), sqZ(3), k);
      this.pawn.style.transform = monTransform(PAWN.x, -PAWN.box * PAWN.scale * 0.1, z, PAWN.box, PAWN.box, 0, PAWN.scale);
      const rec = this.mons.find(mm => mm.el === this.pawn);
      if (rec) rec.z = z;
    }
    if (this.ppawn) {
      const k = smooth(clamp((s - 4.72) / 0.4));
      const z = lerp(sqZ(7), sqZ(8), k);
      this.ppawn.style.transform = monTransform(PROMO_PAWN.x, -PROMO_PAWN.box * PROMO_PAWN.scale * 0.1, z, PROMO_PAWN.box, PROMO_PAWN.box, 0, PROMO_PAWN.scale);
    }

    // Monuments : présence par lieu × proximité × taille à l'écran × brouillard × effacement du mode jeu
    for (const m of this.mons) {
      const d = depthOf(m.x, m.z, cam);
      const pres = clamp(1 - Math.max(m.a - s, s - m.b, 0) / 0.15);
      const near = m.swing ? clamp((d - 420) / 260) : clamp((d - m.near) / 600);
      const far = clamp((m.far - d) / 1400);
      const soft = m.soft ? 0.25 + 0.75 * clamp((d - (m.soft - 650)) / 650) : 1;
      // Garde-fou : un monument qui occuperait presque tout l'écran disparaît au lieu de le traverser
      const proj = m.tall ? (m.tall * P) / Math.max(1, d) : 0;
      const guard = m.tall ? clamp((H * 0.95 - proj) / (H * 0.18)) : 1;
      const op = pres * near * far * soft * guard * this.worldFade;
      const qo = Math.round(op * 50) / 50;
      if (qo !== m.op) {
        m.op = qo;
        m.el.style.opacity = String(qo);
        const vis = qo > 0;
        if (vis !== m.vis) {
          m.vis = vis;
          m.el.style.visibility = vis ? '' : 'hidden';
        }
      }
      // Allée : à l'approche de la caméra, la carte pivote jusqu'à lui présenter la tranche puis le dos (masqué) :
      // elle s'amincit et disparaît au lieu de traverser l'écran
      if (m.swing && m.vis) {
        const k = smooth(clamp((this.swingAt - d) / (this.swingAt * 0.53)));
        const phi = (Math.atan2(cam.x - m.x, cam.z - m.z) * 180) / Math.PI;
        const ry = m.swing.ry + (phi + m.swing.side * 100 - m.swing.ry) * k;
        m.swing.k = k;
        const rq = Math.round(ry * 4) / 4;
        if (rq !== m.swing.last) {
          m.swing.last = rq;
          m.el.style.transform = monTransform(m.x, m.swing.y, m.z, m.swing.w, m.swing.h, rq);
        }
      }
    }

    // Marquages au sol et décors liés à un lieu
    for (const f of this.fades) {
      const qo = Math.round(clamp(1 - Math.max(f.a - s, s - f.b, 0) / 0.25) * 20) / 20;
      if (qo !== f.op) {
        f.op = qo;
        f.el.style.opacity = String(qo);
      }
    }

    // La reine se lève sur d8, le pion s'efface, l'armée noire s'incline
    const rise = Math.round(smooth(clamp((s - 5.08) / 0.42)) * 200) / 200;
    if (rise !== this.lastRise) {
      this.lastRise = rise;
      for (const el of this.risers) el.style.setProperty('--rise', String(rise));
    }

    // Le pied de page prend le relais du dernier panneau
    // (fondu calé sur la position du pied de page dans l'écran : de 78 % à 52 % de la hauteur)
    const footFade = clamp((y - (this.footTop - this.H * 0.78)) / (this.H * 0.26));

    // Panneaux de texte : présents seulement quand la caméra est arrêtée dans leur lieu
    let act = -1;
    let best = 0;
    this.panels.forEach((pr, i) => {
      const { p, dir } = stationPresence(s, this.sts[i], this.ramps[i][0], this.ramps[i][1]);
      const op = q(i === this.panels.length - 1 ? p * (1 - footFade) : p);
      const ty = Math.round(dir * (1 - p) * 36);
      if (op > best) {
        best = op;
        act = i;
      }
      if (op !== pr.op) {
        pr.op = op;
        pr.panel.style.opacity = String(op);
        pr.panel.style.visibility = op > 0 ? 'visible' : 'hidden';
        if (pr.veil) pr.veil.style.opacity = String(op);
      }
      if (ty !== pr.ty) {
        pr.ty = ty;
        pr.panel.style.transform = ty ? `translate3d(0, ${ty}px, 0)` : '';
      }
      const on = pr.on ? op > 0.02 : op > 0.35;
      if (on !== pr.on) {
        pr.on = on;
        pr.sec.classList.toggle('on', on);
      }
    });
    if (act !== this.active) {
      this.active = act;
      this.onLieu?.(act);
    }

    // Allée : carte mise en avant, choisie parmi celles entièrement visibles hors du codex
    if (s > 1.75 && s < 2.93) {
      const cr = this.codexRect;
      let pick = -1;
      let bestH = 0;
      this.mons.forEach(m => {
        if (!m.swing || m.op < 0.96 || m.swing.k > 0.35) return;
        const k = +(m.el.dataset.k ?? -1);
        const half = m.swing.w / 2;
        const bot = project(m.x, 0, m.z, cam, P, W, H);
        const top = project(m.x, m.swing.h, m.z, cam, P, W, H);
        if (bot.dist < 300) return;
        const l = bot.x - half * bot.k, r = bot.x + half * bot.k;
        const inView = l > -10 && r < W - 40 && top.y > 60 && bot.y < H;
        const hitsCodex = r > cr.l && l < cr.r && bot.y > cr.t && top.y < cr.b;
        const hgt = bot.y - top.y;
        if (inView && !hitsCodex && hgt > bestH) {
          bestH = hgt;
          pick = k;
        }
      });
      if (pick >= 0 && pick !== this.focus) {
        this.focus = pick;
        this.root.querySelectorAll('.av-card').forEach((el, k) => el.classList.toggle('on', k === pick));
        this.onFocus?.(pick);
      }
    }

    // Rail des rangées et pastille du HUD, depuis le même lieu que le panneau
    const rank = interpRank(s);
    this.rail?.style.setProperty('--rank', rank.toFixed(3));
    const near = nearestStation(s, this.sts);
    const label = String(near);
    if (label !== this.lastRank) {
      this.lastRank = label;
      const r = LIEUX[near].id === 'allee' ? '4–5' : String(LIEUX[near].rank);
      if (this.rankEl) this.rankEl.textContent = `Rangée${r.length > 1 ? 's' : ''} ${r}`;
      if (this.nameEl) this.nameEl.textContent = LIEUX[near].name;
      if (this.shortEl) this.shortEl.textContent = `R${r} · ${LIEUX[near].short}`;
      if (near !== this.nearest) {
        this.nearest = near;
        this.rail?.querySelectorAll('.rail-r').forEach(b => b.classList.toggle('cur', (b as HTMLElement).dataset.l === String(near)));
      }
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointer);
    this.lenis?.destroy();
  }
}

function interpRank(s: number) {
  const i = Math.floor(clamp(s, 0, 5.999));
  const k = s - i;
  return lerp(RANK_OF_S[i], RANK_OF_S[i + 1], smooth(clamp(k * 1.4 - 0.2)));
}

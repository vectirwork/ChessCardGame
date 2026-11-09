// Scène WebGL superposée à l'échiquier. La caméra reproduit exactement la perspective CSS du plateau,
// ce qui permet d'incliner l'échiquier en 3D pendant un sort tout en gardant les effets alignés sur les cases.
// Sobriété (D6) : la boucle d'images ne tourne que pendant un sort ; un objet persistant immobile (Mur de glace,
// Faille) ne la garde pas allumée (elle se réveille au défilement, au redimensionnement, et vérifie la position de
// l'échiquier deux fois par seconde) ; un objet qui scintille (Gel, Bouclier) est redessiné à ≈ 22 images/s sans
// réveiller le fil principal entre deux. Densité de pixels bornée sur les appareils modestes.
import * as THREE from 'three';
import type { Color, Position } from '../../shared/chess';
import type { Effect } from '../../shared/game';
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
  /** Signature des cases couvertes (Faille) : un changement reconstruit l'objet. */
  sig?: string;
  /** Renvoie true tant que l'objet s'anime (sinon la scène ne le redessine que si le plateau bouge). */
  update(dt: number, t: number): boolean | void;
  /** Animation de disparition (renvoie l'effet à jouer). */
  despawn(): Fx | null;
}

export type MarkerFactory = (stage: VfxStage, e: Effect, skin: SkinStyle, square: number) => Marker | null;
/** Arrivée d'un Présage (effet annoncé qui devient actif). */
export type ArrivalFactory = (stage: VfxStage, e: Effect, skin: SkinStyle) => void;

export interface Cine {
  start: number;
  hold: number;
  tilt: number;
  zoom: number;
}

/** Suite de la boucle d'images : arrêt, image suivante, image dans ≈ 45 ms (scintillement), veille (objets immobiles). */
const enum Next {
  Stop,
  Frame,
  Slow,
  Park,
}

/** Appareil modeste (peu de cœurs ou de mémoire) : on dessine moins de pixels. */
function modestDevice() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
}

/**
 * Densité de pixels du rendu WebGL : 2 au plus, 1,5 sur un appareil modeste (44 % de pixels en moins à dessiner).
 * L'anticrénelage reste partout : sans lui, les arêtes fines des cristaux et des éclairs crénellent visiblement, même
 * à haute densité (vérifié sur les captures mobiles).
 */
export function renderQuality(dpr = window.devicePixelRatio || 1, modest = modestDevice()) {
  return { ratio: Math.min(dpr, modest ? 1.5 : 2), antialias: true };
}

/** Dernier défilement (horloge murale : le banc d'essai remplace performance.now). */
let lastScroll = 0;
let calmWaiters = 0;
const onScrollMark = () => {
  lastScroll = Date.now();
};
const SCROLL_EVENTS = ['scroll', 'wheel', 'touchmove'] as const;

/**
 * Attend un moment calme : fil principal libre (requestIdleCallback, sans délai maximal : sur un fil toujours occupé,
 * la préparation attend) et aucun défilement depuis 400 ms. Les sorts attendent déjà la fin du défilement pour partir ;
 * leur préparation aussi, pour ne rien disputer au geste du pouce.
 */
function calm(): Promise<void> {
  if (calmWaiters++ === 0) for (const e of SCROLL_EVENTS) window.addEventListener(e, onScrollMark, { capture: true, passive: true });
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
  const idle = (cb: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(cb) : window.setTimeout(cb, 60));
  return new Promise(resolve => {
    const check = () => {
      if (Date.now() - lastScroll < 400) {
        window.setTimeout(() => idle(check), 200);
        return;
      }
      if (--calmWaiters === 0) for (const e of SCROLL_EVENTS) window.removeEventListener(e, onScrollMark, { capture: true });
      resolve();
    };
    idle(check);
  });
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
  /** Scène libérée : plus rien à y jouer (une arrivée de Présage différée, par exemple). */
  private disposed = false;
  /** Échiquier suivi (changé par attach() quand la scène passe à un autre échiquier). */
  wrap: HTMLElement;
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
  /** Minuterie de la boucle ralentie (scintillement) ou de la veille (objets immobiles). */
  private timer = 0;
  /** Images consécutives sans mouvement ni sort, avec des objets immobiles. */
  private still = 0;
  private last = 0;
  time = 0;
  tilt = 0;
  zoom = 1;
  private shakeAmp = 0;
  private shakeDecay = 0;
  private applied = { x: 0, y: 0 };
  private size = { w: 0, h: 0 };
  /** Calque placé dans le document (anchor) : état appliqué, et décalage écrit. */
  private anchored: boolean | null = null;
  /** Échiquier de l'accueil à position fixe (ordinateur) : le seul dont la boîte est relevée après l'image. */
  private fixedHost = false;
  private anchoredAt = '';
  /**
   * Boîte de l'échiquier relevée juste après l'image précédente (mise en page à jour, lecture gratuite), pour l'image
   * suivante. Lue en début d'image, au milieu des écritures du moteur de l'accueil (calques, échiquier), elle forçait
   * le navigateur à refaire tout de suite style et mise en page (mesuré à l'ordinateur pendant la descente : 0,7 s
   * sur une glissade). Échiquier fixe seulement : placé dans le document (téléphone), il suit le défilement.
   */
  private rect: DOMRect | null = null;
  private rectAt = 0;
  /** Dernière image qui a lu la boîte (relevée ou mise en cache). */
  private usedAt = 0;
  private rectTimer = 0;
  private readRect = () => {
    this.rectTimer = 0;
    if (this.disposed) return;
    this.rect = this.wrap.getBoundingClientRect();
    this.rectAt = performance.now();
  };
  private perspective = 1400;
  private lastMarkerRender = 0;
  private lastLayout = '';
  private applyTilt = '';
  private pendingIds = new Set<number>();
  /** Objets témoins de warm() : gardés avec la scène, jamais ajoutés à la scène ni dessinés. */
  private witnesses: THREE.Object3D[] = [];
  private warmedPrograms = false;
  private warmedTextures = new Set<THREE.Texture>();
  /** Arrêt de la dernière boucle d'images (horloge murale). */
  private stoppedAt = 0;
  reduced = false;
  /**
   * Famille de l'échiquier qui tient la scène quand elle est partagée (useVfx : vrai pour la partie de l'accueil, faux
   * pour la démonstration), null sinon. Ce qu'un sort a programmé pour plus tard (later) ne vise la scène que si sa
   * famille la tient encore : avant le partage, chaque famille avait sa scène, et ces restes ne tombaient jamais sur
   * l'autre.
   */
  family: boolean | null = null;
  /**
   * Garde-fous en temps réel des sorts (impact et fin forcés si la boucle d'animation s'arrête, onglet caché par
   * exemple). Le banc d'essai, qui avance la scène image par image, les coupe.
   */
  guard = true;
  markerFactory: MarkerFactory | null = null;
  arrivalFactory: ArrivalFactory | null = null;

  constructor(wrap: HTMLElement, public orientation: Color) {
    this.wrap = wrap;
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    try {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'vfx-canvas';
      const q = renderQuality();
      // Processeur graphique par défaut : « high-performance » allumerait la carte dédiée d'un portable pour des
      // effets de quelques secondes
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: q.antialias, powerPreference: 'default' });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setPixelRatio(q.ratio);
      // Tampon réduit dès la création, comme après chaque sort (shrink) : sinon il garde sa taille par défaut
      // (300 × 150, anticrénelé) jusqu'au premier sort, que la scène attende ou non. Le calque est caché d'ici là.
      this.renderer.setSize(1, 1, false);
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
    if (this.ok) {
      // L'échiquier peut bouger sous des objets immobiles : on se réveille pour les recaler
      window.addEventListener('scroll', this.onMove, { capture: true, passive: true });
      window.addEventListener('resize', this.onMove);
    }
  }

  private onMove = () => {
    if (this.markers.size && !this.raf) this.kick();
  };

  /**
   * Rattache la scène à un autre échiquier (la démonstration de l'accueil change d'échiquier à chaque lieu) : le
   * contexte WebGL et les programmes déjà compilés sont gardés.
   */
  attach(wrap: HTMLElement, orientation: Color) {
    this.detach();
    this.wrap = wrap;
    this.rect = null;
    this.orientation = orientation;
    const p = parseFloat(getComputedStyle(wrap).perspective);
    this.perspective = p > 0 ? p : 1400;
  }

  /** Vide la scène (effets, objets, particules) et la met en sommeil, sans libérer le contexte WebGL. */
  detach() {
    this.halt();
    for (const f of this.fx) {
      try {
        f.dispose?.();
      } catch {
        /* déjà libéré */
      }
    }
    this.fx = [];
    this.cines = [];
    this.shakeAmp = 0;
    for (const m of this.markers.values()) disposeObject(m.obj);
    this.markers.clear();
    this.pendingIds = new Set();
    const keep = new Set<THREE.Object3D>([...this.systems.values()].map(ps => ps.points));
    for (const c of [...this.board.children]) if (!keep.has(c)) disposeObject(c);
    for (const ps of this.systems.values()) ps.clear();
    this.renderer?.clear();
    if (this.canvas) {
      this.canvas.style.display = 'none';
      // Le calque change d'échiquier (useVfx) : les classes et l'opacité posées par le précédent ne le suivent pas
      // (« o-live-canvas » le cacherait hors mode immersif ; l'opacité vient du moteur de l'accueil, qui la repose)
      this.canvas.className = 'vfx-canvas';
      this.canvas.style.opacity = '';
      // Ni placement dans le document (anchor) ni taille imposée : le prochain rendu les repose pour son échiquier
      this.canvas.style.position = '';
      this.canvas.style.inset = '';
      this.canvas.style.maxWidth = '';
      this.canvas.style.transform = '';
      this.anchored = null;
      this.anchoredAt = '';
    }
    this.shrink();
    this.tilt = 0;
    this.zoom = 1;
    this.wrap.style.translate = '';
    this.wrap.style.setProperty('--tilt', '0deg');
    this.wrap.style.setProperty('--zoom', '1');
    this.wrap.classList.remove('is-tilting');
    this.applyTilt = '';
    this.applied = { x: 0, y: 0 };
    this.lastLayout = '';
  }

  /** Arrête la boucle d'images et ses minuteries. */
  private halt() {
    // Daté seulement si une boucle tournait : attach() et detach() passent ici à chaque changement d'échiquier, et une
    // scène déjà au repos ne doit pas sembler venir de s'arrêter (useVfx attend qu'elle soit au repos pour la passer)
    if (this.raf || this.timer) this.stoppedAt = Date.now();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.clearTimeout(this.timer);
    this.timer = 0;
    this.forgetRect();
  }

  /** Boucle arrêtée : la boîte relevée n'est plus à jour (la prochaine boucle la relit dès sa première image). */
  private forgetRect() {
    window.clearTimeout(this.rectTimer);
    this.rectTimer = 0;
    this.rect = null;
  }

  /** Depuis combien de temps (ms) la scène n'anime plus rien ; 0 tant que sa boucle tourne. */
  get idleMs() {
    return this.raf || this.timer ? 0 : Date.now() - this.stoppedAt;
  }

  /** La scène a animé quelque chose depuis `t` (horloge murale), ou anime encore. */
  ranSince(t: number) {
    return !!(this.raf || this.timer) || this.stoppedAt > t;
  }

  /**
   * `fn` dans `ms` millisecondes, en temps réel (éclats différés de la Déflagration, second éclair, arrivée d'un
   * Présage, garde-fou de l'inclinaison), seulement si la famille `family` (celle qui tient la scène maintenant, par
   * défaut) la tient encore à ce moment-là. Entre échiquiers d'une même famille (un lieu puis le suivant), rien ne
   * change ; sans partage, la famille ne change jamais.
   */
  later(fn: () => void, ms: number, family = this.family) {
    window.setTimeout(() => {
      if (family === this.family) fn();
    }, ms);
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

  /** Inclinaison cinématographique de l'échiquier (montée 0,55 s, maintien `hold`, retour à plat 0,7 s). */
  cinematic(hold: number, tilt = 0.5, zoom = 1.04): Cine | null {
    if (this.reduced) return null;
    const c = { start: this.time, hold, tilt, zoom };
    this.cines.push(c);
    this.kick();
    return c;
  }

  /**
   * Garde-fou : retire une inclinaison qui aurait dû finir. Si plus rien n'incline le plateau, il est remis à plat
   * tout de suite, même si la boucle d'animation est arrêtée.
   */
  release(c: Cine | null) {
    if (!c) return;
    this.cines = this.cines.filter(x => x !== c);
    if (!this.cines.length) {
      this.tilt = 0;
      this.zoom = 1;
      this.setTilt(0, 1);
    }
    this.kick();
  }

  private setTilt(tilt: number, zoom: number) {
    const key = `${tilt.toFixed(5)}|${zoom.toFixed(5)}`;
    if (key === this.applyTilt) return;
    this.applyTilt = key;
    this.wrap.style.setProperty('--tilt', `${(tilt * 180) / Math.PI}deg`);
    this.wrap.style.setProperty('--zoom', String(zoom));
    // La 3D de l'échiquier (pièces debout) n'existe que pendant l'inclinaison : au repos, l'échiquier est un seul
    // calque plat (board.css), bien moins coûteux et sans scintillement sur les GPU de téléphone.
    this.wrap.classList.toggle('is-tilting', tilt !== 0 || zoom !== 1);
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

  /** Relance la boucle d'images (`poll` : simple vérification depuis la veille, sans compter comme un mouvement). */
  private kick(poll = false) {
    if (!this.ok) return;
    if (!poll) this.still = 0;
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = 0;
    }
    if (this.raf) return;
    if (this.canvas) this.canvas.style.display = 'block';
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    let next = Next.Stop;
    try {
      next = this.step(now);
    } catch (err) {
      // Un effet en erreur ne doit jamais figer la scène (ni laisser l'échiquier incliné) : on le jette.
      console.error('[vfx]', err);
      this.fx = [];
      this.cines = [];
      next = this.markers.size > 0 ? Next.Frame : Next.Stop;
    }
    if (next === Next.Frame) {
      this.raf = requestAnimationFrame(this.frame);
    } else if (next === Next.Slow) {
      // Objets qui scintillent, rien d'autre : une image toutes les ≈ 45 ms (cadence de leur rendu), le fil
      // principal reste libre entre deux. L'horloge continue (pas de remise à zéro de `last`).
      this.timer = window.setTimeout(() => {
        this.timer = 0;
        this.raf = requestAnimationFrame(this.frame);
      }, 30);
    } else if (next === Next.Park) {
      // Plus d'image avant 0,5 s : la boîte relevée sera périmée
      this.forgetRect();
      // Objets immobiles déjà dessinés : la scène reste affichée telle quelle ; deux vérifications par seconde au cas
      // où l'échiquier aurait bougé sans défilement ni redimensionnement (mise en page de la page)
      this.timer = window.setTimeout(() => {
        this.timer = 0;
        this.kick(true);
      }, 500);
    } else {
      this.stoppedAt = Date.now();
      this.forgetRect();
      this.renderer?.clear();
      this.tilt = 0;
      this.zoom = 1;
      this.setTilt(0, 1);
      this.wrap.style.translate = '';
      this.applied = { x: 0, y: 0 };
      if (this.canvas) this.canvas.style.display = 'none';
      this.shrink();
    }
  };

  /**
   * Plus rien à dessiner : le tampon de dessin (plein écran, densité 2, anticrénelé : ≈ 12 à 25 Mo de mémoire
   * graphique) est réduit à un pixel, au lieu de rester alloué jusqu'au sort suivant (syncCamera le remet à la taille
   * de la fenêtre au premier rendu, ≈ 1 ms ; le calque est en display: none entre-temps, rien ne se voit).
   */
  private shrink() {
    if (!this.renderer || !this.size.w) return;
    this.renderer.setSize(1, 1, false);
    this.size = { w: 0, h: 0 };
  }

  /**
   * Prépare au repos ce que le premier sort ferait au milieu de son animation : compilation et liaison des programmes
   * de dessin des effets (en parallèle si le navigateur le permet, KHR_parallel_shader_compile), leur première
   * utilisation (lecture de leurs variables, bloquante, mais la compilation est alors finie), puis le dessin et l'envoi
   * des textures au processeur graphique. Une étape par moment calme, jamais pendant un sort ; rien n'est dessiné ni
   * affiché.
   * Les objets témoins (effects.ts, warmObjects) restent en vie avec la scène : three.js libère un programme dès que
   * plus aucun matériau ne s'en sert, et chaque sort recompilait alors les siens (mesuré sur l'accueil : 2 à 6
   * liaisons de programmes par sort, le fil principal attendant la fin de chacune).
   */
  async warm(objects: THREE.Object3D[], textures: (() => THREE.Texture)[] = []) {
    const r = this.renderer;
    if (!r || this.disposed) return;
    // Moment calme, et la scène n'anime rien (pendant un sort, on repasse un peu plus tard au lieu de demander un
    // moment libre à chaque image)
    const quiet = async () => {
      for (;;) {
        await calm();
        if (this.disposed || this.idleMs) return;
        await new Promise(res => window.setTimeout(res, 250));
      }
    };
    try {
      if (!this.warmedPrograms && objects.length) {
        this.warmedPrograms = true;
        for (const o of objects) {
          await quiet();
          if (this.disposed) return;
          this.witnesses.push(o);
          await r.compileAsync(o, this.camera, this.scene);
          if (this.disposed) return;
          for (const p of r.info.programs ?? []) {
            p.getUniforms();
            p.getAttributes();
          }
        }
      }
      for (const make of textures) {
        await quiet();
        if (this.disposed) return;
        const t = make();
        if (this.warmedTextures.has(t)) continue;
        this.warmedTextures.add(t);
        r.initTexture(t);
      }
    } catch {
      // Contexte perdu ou programme refusé : rien de préparé, le premier sort compilera comme avant
    }
  }

  /** Une image. Renvoie la suite de la boucle. */
  private step(now: number): Next {
    // Plafond de 0,1 s : sur un appareil lent, l’animation saute des images au lieu de ralentir
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
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
    // Boîte relevée après l'image précédente (si la lecture a eu lieu depuis), sinon lue maintenant
    const fresh = this.fixedHost && this.rect && this.rectAt > this.usedAt;
    const r = fresh ? this.rect! : this.wrap.getBoundingClientRect();
    this.usedAt = performance.now();
    if (this.fixedHost && !this.rectTimer) this.rectTimer = window.setTimeout(this.readRect, 0);
    this.anchor();
    const baseX = r.left - this.applied.x;
    const baseY = r.top - this.applied.y;
    this.setTilt(tilt, zoom);
    if (sx || sy || this.applied.x || this.applied.y) this.wrap.style.translate = sx || sy ? `${sx}px ${sy}px` : '';
    this.applied = { x: sx, y: sy };
    this.syncCamera(baseX + sx, baseY + sy, r.width, r.height);

    this.fx = this.fx.filter(f => {
      let alive = false;
      try {
        alive = f.update(dt, this.time);
      } catch (err) {
        console.error('[vfx]', err);
      }
      if (!alive) {
        try {
          f.dispose?.();
        } catch {
          /* déjà libéré */
        }
      }
      return alive;
    });
    let animating = false;
    for (const m of this.markers.values()) {
      try {
        if (m.update(dt, this.time)) animating = true;
      } catch (err) {
        console.error('[vfx]', err);
      }
    }
    let particlesAlive = 0;
    for (const ps of this.systems.values()) {
      ps.update(dt);
      particlesAlive += ps.count;
    }

    const busy = this.fx.length > 0 || this.cines.length > 0 || particlesAlive > 0 || this.shakeAmp > 0;
    // Objets persistants immobiles (Mur de glace permanent, Faille) : on ne redessine que si le plateau a bougé
    const layout = `${Math.round(baseX)},${Math.round(baseY)},${Math.round(r.width)},${Math.round(r.height)},${window.innerWidth},${window.innerHeight}`;
    const moved = layout !== this.lastLayout;
    this.lastLayout = layout;
    if (busy || moved || (animating && now - this.lastMarkerRender > 45) || now - this.lastMarkerRender > 1000) {
      this.renderer!.render(this.scene, this.camera);
      this.lastMarkerRender = now;
    }
    if (busy || (moved && this.markers.size > 0)) {
      this.still = 0;
      return Next.Frame;
    }
    if (!this.markers.size) return Next.Stop;
    if (animating) return Next.Slow;
    // Quelques images de plus avant la veille : l'échiquier peut finir de se déplacer (défilement doux)
    return ++this.still < 12 ? Next.Frame : Next.Park;
  }

  /**
   * Accueil sur téléphone (mode natif, engine.ts) : l'échiquier est placé dans le document et défile sur le
   * compositeur, avec le doigt. Le calque le suit : placé lui aussi dans le document, recalé sur la fenêtre à chaque
   * rendu (même image que la position lue du plateau), il défile entre deux rendus exactement comme l'échiquier, au lieu
   * de rester fixe à l'écran en attendant le rendu suivant (effets décalés d'une ou deux images pendant le geste).
   */
  private anchor() {
    const c = this.canvas;
    if (!c) return;
    const host = this.wrap.closest<HTMLElement>('.o-astre');
    // Le moteur de l'accueil place l'échiquier dans le document par son style en ligne (setFlow) : lu sans calculer
    // de style (getComputedStyle, à chaque image, refaisait le style de la page au milieu des écritures du moteur)
    const on = !!host && host.style.position === 'absolute';
    this.fixedHost = !!host && !on;
    if (on !== this.anchored) {
      this.anchored = on;
      c.style.position = on ? 'absolute' : '';
      c.style.inset = on ? '0 auto auto 0' : '';
      // Placé dans le document, le calque compte dans la largeur de la page : après une rotation, il garderait la
      // largeur de l'ancienne fenêtre jusqu'au rendu suivant, la page s'élargirait, le navigateur la dézoomerait, et
      // innerWidth (qui fixe la taille du calque) resterait à cette largeur : page bloquée en paysage. Jamais plus
      // large que la fenêtre (100vw : la largeur de mise en page, que le contenu ne change pas).
      c.style.maxWidth = on ? '100vw' : '';
      c.style.transform = '';
      this.anchoredAt = '';
    }
    if (on) {
      const at = `translate3d(${window.scrollX}px, ${window.scrollY}px, 0)`;
      if (at !== this.anchoredAt) {
        this.anchoredAt = at;
        c.style.transform = at;
      }
    }
  }

  private syncCamera(left: number, top: number, w: number, h: number) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (W !== this.size.w || H !== this.size.h) {
      this.renderer!.setSize(W, H, false);
      this.size = { w: W, h: H };
      // Taille affichée = taille du tampon et de la caméra (la fenêtre visible) : avec 100vw × 100vh (board.css), un
      // téléphone dont la barre d'adresse est visible étirait les effets et les décalait vers le bas
      if (this.canvas) {
        this.canvas.style.width = `${W}px`;
        this.canvas.style.height = `${H}px`;
      }
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

  /**
   * Synchronise les objets persistants (Mur de glace, Faille, blocs et boucliers du Duel) avec les effets actifs,
   * et joue l'arrivée d'un Présage (effet annoncé qui devient actif).
   */
  syncMarkers(effects: Effect[], _pos: Position) {
    if (!this.ok) return;
    // Seule l'arrivée d'un Présage s'anime en 3D. Les effets durables (Mur de glace, Faille, givre…) sont dessinés
    // par l'échiquier lui-même (cases givrées, gouffre) : une scène WebGL laissée affichée au-dessus de l'échiquier
    // entre deux sorts le noircissait par endroits sur les téléphones (Chrome Android, vidéos du fondateur). La
    // couche 3D n'existe donc que pendant une animation, puis elle disparaît.
    const pending = new Set<number>();
    for (const e of effects) {
      if (e.pending) {
        pending.add(e.id);
        continue;
      }
      if (this.pendingIds.has(e.id) && this.arrivalFactory) {
        // Un peu plus tard : l'échiquier prend d'abord la teinte du Climat qui arrive (React réécrit alors ses classes,
        // ce qui effacerait l'ambiance posée par la mise en scène)
        const factory = this.arrivalFactory;
        this.later(() => {
          if (!this.ok || this.disposed) return;
          try {
            factory(this, e, skinStyle(e.skin));
          } catch (err) {
            console.error('[vfx]', err);
          }
        }, 80);
      }
    }
    this.pendingIds = pending;
    if (this.markers.size) {
      for (const m of this.markers.values()) {
        this.board.remove(m.obj);
        disposeObject(m.obj);
      }
      this.markers.clear();
    }
  }


  setOrientation(o: Color, effects: Effect[], pos: Position) {
    if (o === this.orientation) return;
    this.orientation = o;
    // Les objets à plusieurs cases (Faille) sont reconstruits ; les autres sont simplement replacés
    for (const [id, m] of this.markers) {
      if (m.sig) {
        this.markers.delete(id);
        disposeObject(m.obj);
      } else m.obj.position.copy(this.local(m.square));
    }
    this.syncMarkers(effects, pos);
  }

  dispose() {
    this.halt();
    this.disposed = true;
    window.removeEventListener('scroll', this.onMove, { capture: true });
    window.removeEventListener('resize', this.onMove);
    for (const f of this.fx) f.dispose?.();
    for (const ps of this.systems.values()) ps.dispose();
    for (const m of this.markers.values()) disposeObject(m.obj);
    this.markers.clear();
    for (const o of this.witnesses) disposeObject(o);
    this.witnesses = [];
    this.renderer?.dispose();
    // Libère le contexte WebGL tout de suite (le navigateur en limite le nombre ; sinon il attend le ramasse-miettes)
    try {
      this.renderer?.forceContextLoss();
    } catch {
      /* contexte déjà perdu */
    }
    this.canvas?.remove();
    this.wrap.style.translate = '';
    this.wrap.style.setProperty('--tilt', '0deg');
    this.wrap.style.setProperty('--zoom', '1');
    this.wrap.classList.remove('is-tilting');
    this.applyTilt = '';
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

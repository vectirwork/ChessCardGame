// Moteur de la descente : un seul calcul par image pour tous les calques, l'échiquier et l'altimètre.
// Uniquement des transform et des opacity ; rien n'est lu dans le DOM pendant le défilement
// (toutes les positions sont relevées dans measure(), au chargement et au redimensionnement).
// Sobriété (D6) : la boucle d'images ne tourne que pendant un mouvement (défilement, souris, éveil, transition) et
// s'arrête d'elle-même au repos ; les décors cachés ou sortis de l'écran ont leurs animations CSS en pause
// (classe `o-paused`), et les nuées ne chargent leur image qu'à l'approche de leur lieu.
// Téléphone (mode « natif », voir buildNative) : le défilement est natif (le doigt), et un script qui le suit a
// toujours une image de retard. Décor, ciels et échiquier y sont donc liés au défilement par des animations
// ScrollTimeline, jouées par le compositeur avec le défilement lui-même ; le script ne gère plus que les bascules
// (lieu, chapitre, calques montrés ou cachés, emplacement de l'échiquier).
import gsap from 'gsap';
import type Lenis from 'lenis';
import { PLACES } from './data';
import type { PoseKey } from './data';
import { gameLayout, isMobile } from './shell/layout';

export { gameLayout, isMobile };

/**
 * Lenis ne sert qu'à adoucir la molette d'une souris. Sur un écran tactile, il ne ferait rien d'utile et ses écouteurs
 * touchstart/touchmove non passifs (sur window) feraient attendre le fil principal à chaque début de geste : il n'y est
 * ni créé ni téléchargé (≈ 19 Ko de moins sur le chemin critique d'un téléphone). Avec un pointeur fin, son module est
 * demandé dès l'évaluation de ce module, en parallèle du rendu de l'accueil ; le moteur fonctionne sans lui (défilement
 * natif) le temps qu'il arrive.
 */
const lenisModule: Promise<typeof import('lenis') | null> | null =
  typeof window !== 'undefined' &&
  !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) &&
  (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true)
    ? import('lenis').catch(() => null)
    : null;

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

/** Chronologie liée au défilement (Chrome 115+, Safari 26+) : absente des types DOM de TypeScript. */
type ScrollTimelineCtor = new (o: { source: Element; axis: 'block' }) => AnimationTimeline;
const scrollTimelineCtor = () => (globalThis as { ScrollTimeline?: ScrollTimelineCtor }).ScrollTimeline;
/** La courbe smooth (3t² − 2t³) est exactement cubic-bezier(1/3, 0, 2/3, 1) : un fondu natif identique au script. */
const SMOOTH = 'cubic-bezier(0.33333, 0, 0.66667, 1)';
/** Point d'une animation liée au défilement : position de défilement (px) et valeurs CSS à cette position. */
type ScrollPoint = { y: number; easing?: string } & Record<string, string | number | undefined>;

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
  /** État appliqué à chaque conteneur : 2 peint et animé, 1 mis en page mais ni peint ni animé (mode natif), 0 éteint
   *  (ni stylé, ni mis en page, ni peint), null à écrire. */
  live: (0 | 1 | 2 | null)[];
  /** `clip` : calque qui coupe son contenu (overflow: hidden) ; hors de l'écran, ses animations sont en pause. */
  layers: { el: HTMLElement; d: number; clip: boolean; off: boolean; ci: number }[];
  start: number;
  end: number;
  shown: boolean;
  /** Images des nuées déjà demandées. */
  loaded: boolean;
}

/** Inclinaison de l'échiquier posé dans le texte (mobile), en radians. */
const SLOT_TILT = 0.62;
/** Les images d'un lieu (nuées) sont demandées quand il reste moins de ce nombre d'écrans à parcourir. */
const PRELOAD_SCREENS = 2.4;
/** Boucle d'images arrêtée après ce temps sans aucun changement (ms). */
const SLEEP_AFTER = 250;

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
  /** Téléphone, premier écran : l'échiquier est placé dans le document (position absolue) et défile nativement. */
  private flow = false;
  private flowTop = 0;
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
  /** Boucle d'images branchée sur gsap.ticker (seulement pendant un mouvement). */
  private running = false;
  /** La prochaine image recale l'horloge de Lenis (sinon son premier pas après un arrêt sauterait au but). */
  private resync = false;
  private quietSince = 0;
  /** Nuées autorisées : après le premier affichage (chargement terminé) ou dès que le visiteur défile. */
  private imagesOk = false;
  private imagesTimer = 0;
  /** Mode natif (téléphone) : animations liées au défilement, voir buildNative. */
  private native = false;
  private timeline: AnimationTimeline | null = null;
  /** Mode natif : animations de chaque lieu, créées quand il est peint (une animation créée sur un élément caché
   *  n'est pas confiée au compositeur), supprimées quand il s'éteint. */
  private sceneAnims: (Animation[] | null)[] = [];
  private skyAnims: (Animation | null)[] = [];
  private astreAnims: Animation[] = [];
  /** Poses de l'échiquier relevées pour le mode natif (positions de défilement et valeurs). */
  private astrePts: { y: number; x: number; ty: number; k: number; o: number; orb: number; front: number }[] = [];
  /** Hauteur de la grande fenêtre (100lvh, barre d'adresse masquée) : ne bouge pas quand la barre apparaît. */
  private lvhProbe: HTMLElement | null = null;
  private docH = 0;
  private rootW = -1;
  private rootH = -1;
  /** Mode natif : ciels montrés (les autres sont cachés : ni peints ni composés). */
  private skyShown: (boolean | null)[] = [];
  private touchable = true;
  /** Défilement figé (feuille ouverte, partie) : repris par Lenis s'il arrive après. */
  private locked = false;
  private destroyed = false;
  private tick = (time: number) => {
    if (this.lenis) {
      if (this.resync) this.lenis.time = time * 1000;
      this.lenis.raf(time * 1000);
    }
    this.resync = false;
    const busy = this.frame() || this.lenis?.isScrolling === 'smooth';
    const now = performance.now();
    if (busy || !this.quietSince) this.quietSince = now;
    else if (now - this.quietSince > SLEEP_AFTER) this.sleep();
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
    // Lenis (pointeur fin seulement, voir lenisModule) : créé dès que son module est là
    void lenisModule?.then(m => {
      if (m && !this.destroyed && !this.reduced) this.attachLenis(m.default);
    });
    gsap.ticker.lagSmoothing(0);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    window.addEventListener('resize', this.onResize);
    // Tout ce qui peut faire défiler la page réveille la boucle : la molette (Lenis anime alors le défilement), et le
    // défilement natif (doigt, clavier, barre de défilement, ancre)
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('wheel', this.onScroll, { passive: true });
    if (document.readyState === 'complete') this.onLoad();
    else window.addEventListener('load', this.onLoad);
    // Seul un vrai changement de taille de la page remesure (le premier rapport, à l'observation, n'en est pas un)
    this.ro = new ResizeObserver(entries => {
      const r = entries[entries.length - 1]?.contentRect;
      if (r && Math.abs(r.width - this.rootW) < 1 && Math.abs(r.height - this.rootH) < 1) return;
      if (r) {
        this.rootW = r.width;
        this.rootH = r.height;
      }
      this.measure();
    });
    this.measure();
    // Taille au moment de cette première mesure : le rapport initial de l'observateur ne la refait pas
    const r0 = root.getBoundingClientRect();
    const cs = getComputedStyle(root);
    this.rootW = r0.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
    this.rootH = r0.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
    this.ro.observe(root);
  }

  private onScroll = () => {
    this.imagesOk = true;
    this.wake();
  };

  /** Lenis arrivé (pointeur fin) : il prend la molette, dans l'état de verrouillage où se trouve la page. */
  private attachLenis(L: typeof Lenis) {
    // autoResize: false : Lenis ne relit plus la hauteur de la page à chaque changement de taille du contenu (mise
    // en page forcée, ≈ 120 ms au chargement) ; measure() la lui donne, au moment où la mise en page est déjà faite
    const lenis = new L({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true, autoResize: false });
    this.lenis = lenis;
    if (this.locked) {
      // Verrou posé avant son arrivée : il passe de la classe de repli à celle de Lenis (même règle)
      lenis.stop();
      document.documentElement.classList.remove('o-locked');
    }
    this.resync = true;
    this.markDirty();
  }

  /** Les nuées du lieu suivant ne passent qu'après le premier affichage (elles ne servent qu'à la descente). */
  private onLoad = () => {
    this.imagesTimer = window.setTimeout(() => {
      this.imagesOk = true;
      this.markDirty();
    }, 1200);
  };

  /** Réveille la boucle d'images (elle se rendort seule quand plus rien ne bouge). */
  wake = () => {
    this.quietSince = 0;
    if (this.running) return;
    this.running = true;
    this.resync = true;
    // Premier pas après un arrêt : durée nulle (pas de saut de la parallaxe ni de l'éveil)
    this.lastT = 0;
    gsap.ticker.add(this.tick);
  };

  private sleep() {
    if (!this.running) return;
    this.running = false;
    gsap.ticker.remove(this.tick);
    // gsap ne s'endort de lui-même qu'après 120 images sans animation : s'il n'a plus rien à jouer (aucune animation
    // en cours ni en attente), on l'endort tout de suite ; il se réveille seul à la prochaine animation
    if (!gsap.globalTimeline.getChildren(false).some(c => !c.paused())) gsap.ticker.sleep();
  }

  destroy() {
    this.destroyed = true;
    this.sleep();
    window.removeEventListener('pointermove', this.onPointer);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('wheel', this.onScroll);
    window.removeEventListener('load', this.onLoad);
    window.clearTimeout(this.imagesTimer);
    this.ro.disconnect();
    this.dropNative();
    this.lvhProbe?.remove();
    this.lenis?.destroy();
    document.documentElement.classList.remove('o-locked');
    this.els.header?.classList.remove('is-hidden', 'is-scrolled');
  }

  /** Calque WebGL de l'échiquier de démonstration : il suit l'opacité de l'échiquier. */
  setCanvas(c: HTMLCanvasElement | null) {
    this.canvas = c;
    this.applied.co = -1;
    this.markDirty();
  }

  /** Survol de l'échiquier : la légende devient une invitation. */
  setHover(on: boolean) {
    this.hover = on;
    this.markDirty();
  }

  /** Échiquier jouable éveillé : il se redresse (plus d'inclinaison) pour que le geste tombe juste. */
  setAwake(on: boolean, instant = false) {
    this.awakeTarget = on ? 1 : 0;
    if (instant || this.reduced) this.awake = this.awakeTarget;
    this.markDirty();
  }

  /** L'échiquier est-il assez redressé pour qu'un clic tombe sur la bonne case ? */
  get isAwake() {
    return this.awake > 0.97;
  }

  private onPointer = (e: PointerEvent) => {
    // Parallaxe à la souris : ni au doigt, ni sur mobile, ni en mouvement réduit, ni pendant la partie (décor caché)
    if (e.pointerType === 'touch' || this.reduced || isMobile(this.vw) || this.gameMix >= 1) return;
    this.mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    this.mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    this.wake();
  };

  /** Pose d'un lieu, bornée pour que l'échiquier (inclinaison et perspective comprises) reste à 40 px de la colonne de texte. */
  pose(key: PoseKey): Pose {
    return this.poses.get(key) ?? poseFor(key, this.vw, this.vh);
  }

  /** Téléphone : hauteur de la grande fenêtre (100lvh), celle du monde fixe (odyssee.css). */
  private largeViewportHeight() {
    if (!this.lvhProbe) {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100vh;height:100lvh;visibility:hidden;pointer-events:none';
      document.body.appendChild(el);
      this.lvhProbe = el;
    }
    return this.lvhProbe.offsetHeight || window.innerHeight;
  }

  /**
   * Téléphone : la barre d'adresse qui apparaît ou disparaît au défilement ne change que la hauteur de la fenêtre.
   * La mise en page n'en dépend pas, ni le monde (100lvh) : rien à remesurer, sinon toutes les poses et tous les
   * calques sauteraient de la hauteur de la barre, en plein geste. Seule une autre largeur, ou un échiquier de partie
   * d'une autre taille, relance la mesure.
   */
  private onResize = () => {
    const vw = document.documentElement.clientWidth || window.innerWidth;
    if (this.native && vw === this.vw && gameLayout(vw, window.innerHeight).G === this.G && this.largeViewportHeight() === this.vh) {
      this.markDirty();
      return;
    }
    this.measure();
  };

  measure = () => {
    // Largeur de la page, pas de la fenêtre : si la page était dézoomée (téléphone), innerWidth serait gonflé
    this.vw = document.documentElement.clientWidth || window.innerWidth;
    // Téléphone : la grande fenêtre, stable quand la barre d'adresse va et vient (voir onResize)
    this.vh = isMobile(this.vw) ? this.largeViewportHeight() : window.innerHeight;
    const { vw, vh } = this;
    const y = window.scrollY;
    this.G = gameLayout(vw, window.innerHeight).G;
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
      const prev = this.scenes[i];
      return {
        els: containers,
        // Remesure : l'état déjà appliqué est oublié, la prochaine image le réécrit
        live: containers.map(() => null),
        layers: containers.flatMap((c, ci) =>
          Array.from(c.querySelectorAll<HTMLElement>(':scope > .o-layer'))
            // Calque non affiché (second banc de nuées sur mobile) : rien à animer ni à écrire
            .filter(el => getComputedStyle(el).display !== 'none')
            .map(el => {
            el.classList.remove('o-paused');
            // Calque qui coupe son contenu en hauteur (neige, pluie…) : hors de l'écran, ses animations sont en pause
            return { el, d: Number(el.dataset.d), clip: getComputedStyle(el).overflowY !== 'visible', off: false, ci };
          }),
        ),
        start: own.length ? Math.min(...own.map(s => s.start)) : 0,
        end: own.length ? Math.max(...own.map(s => s.end)) : 0,
        shown: true,
        loaded: prev?.loaded ?? false,
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
    this.lenis?.resize();
    this.docH = document.documentElement.scrollHeight;
    this.astre.style.width = `${this.G}px`;
    this.astre.style.height = `${this.G}px`;
    this.applied = { o: -1, co: -1, orb: -1, front: -1, tilt: -99, cap: -1, k: -1 };
    if (this.flow) this.flowTop = this.flowOrigin();
    this.buildNative();
    this.markDirty();
    // Mode natif : les animations des lieux viennent d'être annulées ; elles sont recréées tout de suite, dans le même
    // rendu (sinon une image passerait avec le décor à sa position de repos et les fonds pleinement opaques)
    if (this.native) this.frame();
  };

  /** Haut du parent de positionnement de l'échiquier, dans le document (échiquier placé dans le document). */
  private flowOrigin() {
    const parent = this.astre.offsetParent as HTMLElement | null;
    return parent && parent !== document.body ? parent.getBoundingClientRect().top + window.scrollY : 0;
  }

  // ------------------------------------------------------------------------------------------------------------
  // Mode natif (téléphone)

  /** Arrête toutes les animations liées au défilement (le script reprend la main). */
  private dropNative() {
    for (const list of this.sceneAnims) list?.forEach(a => a.cancel());
    this.sceneAnims = [];
    for (const a of this.skyAnims) a?.cancel();
    this.skyAnims = [];
    this.dropAstreNative();
    this.native = false;
    for (const el of this.skies) el.style.visibility = '';
    this.skyShown = [];
  }

  /** Ciel montré (mode natif) : son fondu est une animation, créée quand il apparaît. */
  private showSky(i: number, on: boolean) {
    if (this.skyShown[i] === on) return;
    this.skyShown[i] = on;
    this.skies[i].style.visibility = on ? '' : 'hidden';
    this.skyAnims[i]?.cancel();
    this.skyAnims[i] = null;
    const sc = this.scenes[i];
    if (on && i > 0 && sc) {
      const a = Math.max(0, sc.start - this.vh * 0.6);
      this.skyAnims[i] = this.scrollAnim(this.skies[i], a, sc.start, [{ y: a, opacity: 0, easing: SMOOTH }, { y: sc.start, opacity: 1 }]);
    }
  }

  /** Animations d'un conteneur de lieu (mode natif) : ses calques en parallaxe et, pour un fond, son fondu. */
  private attachScene(i: number, ci: number) {
    const sc = this.scenes[i];
    const key = i * 2 + ci;
    if (!sc || this.sceneAnims[key]) return;
    const { vh } = this;
    const list: Animation[] = [];
    const add = (a: Animation | null) => a && list.push(a);
    // Au-delà de cette fenêtre, le lieu est éteint (frame) : ses valeurs n'importent plus
    const a = Math.max(0, sc.start - vh * 2);
    const b = sc.end + vh * 2;
    const ys = [a, sc.start, sc.end, b].filter((v, k, arr) => v >= a && v <= b && arr.indexOf(v) === k).sort((m, n) => m - n);
    for (const l of sc.layers) {
      if (l.ci !== ci) continue;
      add(this.scrollAnim(l.el, a, b, ys.map(y => ({ y, transform: `translate3d(0px, ${this.travel(y, sc.start, sc.end, l.d).toFixed(2)}px, 0px)` }))));
    }
    // Fondu des fonds : entrée sur un demi-écran (0,6 à 0,1 écran avant le lieu), sortie après lui
    const inA = sc.start - vh * 0.6;
    const inB = sc.start - vh * 0.1;
    const outA = sc.end + vh * 0.2;
    const outB = sc.end + vh * 0.7;
    const fade: ScrollPoint[] =
      sc.start === 0
        ? [{ y: 0, opacity: 1 }, { y: outA, opacity: 1, easing: SMOOTH }, { y: outB, opacity: 0 }, { y: b, opacity: 0 }]
        : [{ y: a, opacity: 0 }, { y: inA, opacity: 0, easing: SMOOTH }, { y: inB, opacity: 1 }, { y: outA, opacity: 1, easing: SMOOTH }, { y: outB, opacity: 0 }, { y: b, opacity: 0 }];
    const el = sc.els[ci];
    if (el?.dataset.part === 'back') add(this.scrollAnim(el, sc.start === 0 ? 0 : a, b, fade));
    this.sceneAnims[key] = list;
  }

  private detachScene(i: number, ci: number) {
    const key = i * 2 + ci;
    this.sceneAnims[key]?.forEach(a => a.cancel());
    this.sceneAnims[key] = null;
  }

  private dropAstreNative() {
    for (const a of this.astreAnims) a.cancel();
    this.astreAnims = [];
  }

  /** Animation liée au défilement, de `a` à `b` (positions de défilement en px), par points successifs. */
  private scrollAnim(el: Element, a: number, b: number, pts: ScrollPoint[]): Animation | null {
    if (!this.timeline || !pts.length) return null;
    const span = Math.max(1, b - a);
    let last = 0;
    const kf = pts.map(({ y, ...rest }, i) => {
      // Premier point à 0, dernier à 1, jamais en arrière : sinon le navigateur inventerait les extrémités
      let offset = i === 0 ? 0 : i === pts.length - 1 ? 1 : Math.min(1, Math.max(0, (y - a) / span));
      if (offset < last) offset = last;
      last = offset;
      const k: Keyframe = { offset };
      for (const [key, v] of Object.entries(rest)) if (v !== undefined) k[key] = v;
      return k;
    });
    if (kf.length === 1) kf.push({ ...kf[0], offset: 1 });
    const opts = { timeline: this.timeline, fill: 'both', rangeStart: `${Math.round(a)}px`, rangeEnd: `${Math.round(Math.max(a + 1, b))}px` };
    return el.animate(kf, opts as KeyframeAnimationOptions);
  }

  /**
   * Téléphone : décor (calques en parallaxe, fondus des lieux), ciels et échiquier liés au défilement sur le
   * compositeur. Les valeurs sont celles du script (travel, fondus, poses), relevées aux mêmes positions : le rendu
   * est le même, sans retard sur le doigt ni travail du fil principal à chaque image. Reconstruit à chaque mesure.
   */
  private buildNative() {
    this.dropNative();
    const Ctor = scrollTimelineCtor();
    if (!Ctor || this.reduced || !isMobile(this.vw) || !this.sections.length) return;
    this.native = true;
    this.timeline = new Ctor({ source: document.documentElement, axis: 'block' });
    // Lieux et ciels : leurs animations sont créées au moment où ils sont peints (frame, showSky)
    if (this.flow) this.buildAstreNative();
  }

  /**
   * Échiquier en mode natif : placé dans le document (position absolue), il défile avec le texte ; sa taille et son
   * opacité (et celles des anneaux, du calque 3D) suivent le défilement par une animation. Les poses sont relevées
   * tous les 12 px sur toute la page, puis réduites aux points où la courbe change d'allure.
   */
  private buildAstreNative() {
    this.dropAstreNative();
    if (!this.native || !this.timeline) return;
    const { G } = this;
    const maxY = Math.max(1, this.docH - window.innerHeight);
    const STEP = 12;
    const raw: typeof this.astrePts = [];
    for (let y = 0; ; y += STEP) {
      const yy = Math.min(y, maxY);
      const { p } = this.poseAt(yy);
      raw.push({ y: yy, x: p.x - G / 2, ty: p.y + yy - this.flowTop - G / 2, k: p.s / G, o: p.o, orb: p.orb, front: p.front });
      if (yy >= maxY) break;
    }
    // Réduction : on garde un point quand l'interpolation linéaire depuis le dernier point gardé s'écarte de plus
    // d'un tiers de pixel (ou de 0,004 en opacité) d'un point intermédiaire. Échiquier invisible : rien à garder.
    const tol = { x: 0.35, ty: 0.35, k: 0.0008, o: 0.004, orb: 0.004, front: 0.004 } as const;
    const keys = Object.keys(tol) as (keyof typeof tol)[];
    const kept = [raw[0]];
    let a = 0;
    for (let b = 2; b < raw.length; b++) {
      const A = raw[a];
      const B = raw[b];
      let ok = true;
      for (let i = a + 1; i < b && ok; i++) {
        const P = raw[i];
        const t = (P.y - A.y) / Math.max(1e-6, B.y - A.y);
        const hidden = P.o < 0.002 && A.o < 0.002 && B.o < 0.002;
        for (const key of keys) {
          if (hidden && key !== 'o') continue;
          if (Math.abs(A[key] + (B[key] - A[key]) * t - P[key]) > tol[key]) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) {
        a = b - 1;
        kept.push(raw[a]);
      }
    }
    if (kept[kept.length - 1] !== raw[raw.length - 1]) kept.push(raw[raw.length - 1]);
    this.astrePts = kept;
    const end = kept[kept.length - 1].y;
    const add = (el: Element | null, pts: ScrollPoint[]) => {
      if (!el) return;
      const anim = this.scrollAnim(el, 0, end, pts);
      if (anim) this.astreAnims.push(anim);
    };
    add(
      this.astre,
      kept.map(r => ({ y: r.y, transform: `translate3d(${r.x.toFixed(2)}px, ${r.ty.toFixed(2)}px, 0px) scale(${r.k.toFixed(4)})`, opacity: Number(r.o.toFixed(4)) })),
    );
    add(this.els.orbits, kept.map(r => ({ y: r.y, opacity: Number(r.orb.toFixed(4)) })));
    add(this.els.front, kept.map(r => ({ y: r.y, opacity: Number(r.front.toFixed(4)) })));
    // Le calque 3D des sorts (souvent en display:none, que le compositeur refuserait) : écrit par frame, voir là
  }

  scrollTo(target: string | number, done?: () => void) {
    const el = typeof target === 'string' ? this.root.querySelector<HTMLElement>(target) : null;
    if (this.lenis) {
      // Défilement animé par Lenis : il a besoin de la boucle d'images
      this.wake();
      this.lenis.scrollTo(el ?? (typeof target === 'number' ? target : 0), { duration: 2.2, easing: (t: number) => 1 - Math.pow(1 - t, 4), onComplete: () => done?.() });
    } else if (this.reduced) {
      if (typeof target === 'number') window.scrollTo(0, target);
      else el?.scrollIntoView();
      done?.();
    } else {
      // Écran tactile (sans Lenis) : défilement doux du navigateur ; la suite attend sa fin (scrollend)
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        window.removeEventListener('scrollend', finish);
        done?.();
      };
      window.addEventListener('scrollend', finish);
      window.setTimeout(finish, 2400);
      if (typeof target === 'number') window.scrollTo({ top: target, behavior: 'smooth' });
      else el?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  lock(on: boolean) {
    this.locked = on;
    if (this.lenis) {
      if (on) this.lenis.stop();
      else this.lenis.start();
    } else {
      // Sans Lenis : la même règle que sa classe lenis-stopped (overflow: hidden sur la page)
      document.documentElement.classList.toggle('o-locked', on);
    }
  }

  /** Fige la pose de départ (ou d'arrivée) de la transition vers la partie. */
  captureGameFrom() {
    this.gameFrom = this.pagePose(window.scrollY);
  }

  markDirty() {
    this.dirty = true;
    this.wake();
  }

  /** Nuées d'un lieu : l'image n'est demandée qu'à l'approche du lieu (et tout de suite : la scène encore cachée
   *  n'est pas rendue, son fond ne serait pas chargé avant qu'elle apparaisse). */
  private loadImages(sc: SceneRec) {
    sc.loaded = true;
    for (const c of sc.els) {
      c.querySelectorAll<HTMLElement>('[data-bg]').forEach(el => {
        const url = el.dataset.bg!;
        el.removeAttribute('data-bg');
        // Décodée d'avance, hors du tramage (le premier tramage de la nuée la trouve prête) ; posée une fois prête,
        // ou tout de suite si le décodage échoue
        const img = new Image();
        img.src = url;
        const put = () => {
          el.style.backgroundImage = `url(${url})`;
        };
        img.decode().then(put, put);
      });
    }
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
    const target: Pose = { x: best.cx, y: best.top + best.h / 2 - y, s: best.w * 0.86 * (0.82 + 0.18 * k), orb: 0.75 * k, front: 0.8 * k, o: k, tilt: SLOT_TILT, cap: 0 };
    return { p: base.o > k ? lerpPose(target, base, base.o) : target, w: bestW };
  }

  scrollPose(y: number): Pose {
    const { p, dock } = this.poseAt(y);
    if (dock !== null && dock > 0.5 !== this.docked) {
      this.docked = dock > 0.5;
      this.astre.classList.toggle('is-docked', this.docked);
      this.hooks.onDock(this.docked);
    }
    return p;
  }

  /** Pose de l'échiquier à ce défilement, sans effet de bord ; `dock` : poids de l'emplacement (mobile), ou null. */
  private poseAt(y: number): { p: Pose; dock: number | null } {
    const { vw, vh } = this;
    const secs = this.sections;
    if (!secs.length) return { p: poseFor('hero', vw, vh), dock: null };
    let p: Pose | null = null;
    // Mobile : le premier écran est plus haut que la fenêtre ; l'échiquier défile avec son texte au lieu de rester
    // posé dessus, puis traverse la nuée depuis l'endroit où on l'a laissé
    const hero0 = secs[0];
    const heroShift = isMobile(vw) ? clamp01((y - hero0.start) / Math.max(1, hero0.end - hero0.start)) * (hero0.end - hero0.start) : 0;
    for (let i = 0; i < secs.length && !p; i++) {
      const s = secs[i];
      if (y <= s.end) {
        if (y >= s.start || i === 0) {
          p = { ...this.pose(s.pose) };
          if (i === 0) p.y -= heroShift;
          break;
        }
        const prev = secs[i - 1];
        const a = { ...this.pose(prev.pose) };
        if (i === 1) a.y -= heroShift;
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
        // Téléphone : l'échiquier s'efface en un tiers d'écran de défilement au lieu de flotter à demi transparent
        // au-dessus des textes jusqu'au lieu suivant (où il se pose de nouveau, voir dock)
        p.o = isMobile(vw) ? Math.max(0, 1 - (y - prev.end) / (vh * 0.35)) : 1 - 0.86 * k;
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
    let dock: number | null = null;
    if (isMobile(vw) && this.slots.length) {
      const hero = secs[0];
      // Entre deux emplacements, l'échiquier s'efface en un tiers d'écran au lieu de flotter à demi transparent
      // au-dessus des textes ; il réapparaît en se posant dans l'emplacement suivant (dock)
      if (y > hero.end) p = { ...p, o: p.o * Math.max(0, 1 - (y - hero.end) / (vh * 0.35)) };
      if (y > hero.end + vh * 0.05) {
        const d = this.dock(y, p);
        p = d.p;
        dock = d.w;
      }
    }
    if (this.reduced) p.tilt = 0;
    return { p, dock };
  }

  /** Pose de la page à ce défilement, éveil de l'échiquier compris. */
  private pagePose(y: number): Pose {
    const p = this.scrollPose(y);
    if (this.awake > 0) {
      const a = smooth(this.awake);
      p.tilt *= 1 - a;
      // Mode natif : la taille vient de l'animation liée au défilement, sans cet agrandissement (même pose partout)
      if (!this.native) p.s *= 1 + 0.025 * a;
    }
    return p;
  }

  /** Une image ; renvoie false quand rien n'a changé (la boucle peut alors s'arrêter). */
  private frame(): boolean {
    // Position de défilement : celle que Lenis vient d'appliquer (lue sans forcer de mise en page) ; sans Lenis
    // (mouvement réduit), celle de la fenêtre
    const y = this.lenis ? this.lenis.scroll : window.scrollY;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - (this.lastT || now)) / 1000));
    this.lastT = now;
    // Parallaxe : le décor rattrape la souris (constante de temps 0,27 s, soit 6 % par image à 60 Hz) ; à moins d'un
    // vingtième de pixel du but, il s'y pose et la boucle peut s'arrêter
    const m = this.mouse;
    const mdx = m.tx - m.x, mdy = m.ty - m.y;
    const moving = Math.abs(mdx) > 0.002 || Math.abs(mdy) > 0.002;
    if (moving) {
      const f = 1 - Math.exp(-dt / 0.27);
      m.x += mdx * f;
      m.y += mdy * f;
    } else if (mdx || mdy) {
      m.x = m.tx;
      m.y = m.ty;
    }
    // Éveil : approche exponentielle indépendante de la cadence (≈ 0,35 s pour se redresser)
    const da = this.awakeTarget - this.awake;
    const waking = Math.abs(da) > 0.001;
    if (waking) this.awake = Math.abs(da) < 0.01 ? this.awakeTarget : this.awake + da * (1 - Math.exp(-dt / 0.1));
    if (y === this.lastY && !moving && !waking && !this.dirty) return false;
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

    // Calques des lieux (en partie, le décor est caché sous le rideau : rien à recalculer)
    const native = this.native;
    for (const sc of this.scenes) {
      if (this.gameMix >= 1) break;
      if (!sc.loaded && this.imagesOk && y > sc.start - vh * PRELOAD_SCREENS && y < sc.end + vh * PRELOAD_SCREENS) this.loadImages(sc);
      // Mode natif : le lieu est monté (peint, tramé) dès 1,7 écran avant lui, encore transparent, pendant la
      // traversée de la nuée ; il reste monté jusqu'à 2 écrans (pas de bascule à chaque pixel au retour)
      const margin = native ? (sc.shown ? 2 : 1.7) : 1.6;
      const visible = y > sc.start - vh * margin && y < sc.end + vh * margin;
      if (visible !== sc.shown) sc.shown = visible;
      let op = 1;
      if (!native) {
        // Mobile : le premier écran est plus haut que la fenêtre ; le lieu suivant n'arrive qu'une fois le texte lu
        const fadeIn = mobile ? smooth(clamp01((y - (sc.start - vh * 0.6)) / (vh * 0.5))) : smooth(clamp01((y - (sc.start - vh * 1.05)) / (vh * 0.75)));
        const fadeOut = 1 - smooth(clamp01((y - (sc.end + vh * 0.2)) / (vh * 0.5)));
        op = sc.start === 0 ? fadeOut : fadeIn * fadeOut;
      }
      for (let i = 0; i < sc.els.length; i++) {
        const el = sc.els[i];
        const back = el.dataset.part === 'back';
        if (!native && visible && back) el.style.opacity = op.toFixed(3);
        // Un décor transparent ou lointain n'est pas peint, et ses animations sont en pause : elles ne coûtent rien
        let state: 0 | 1 | 2 = visible && (native || !back || op >= 0.004) ? 2 : 0;
        if (native && back && visible) {
          // Mode natif, fonds : mis en page pendant la traversée de la nuée (le plus lourd du réveil, sans mémoire
          // graphique), peints juste avant leur fondu d'entrée (0,6 écran avant le lieu), éteints dès leur fondu de
          // sortie fini. Au plus deux lieux peints, et seulement le temps du fondu enchaîné.
          const was = sc.live[i] === 2;
          // Peint un demi-écran avant son fondu (0,6 écran avant le lieu) : le temps de le tramer, encore transparent
          const from = sc.start === 0 ? -Infinity : sc.start - vh * (was ? 1.15 : 1.1);
          const to = sc.end + vh * (was ? 0.75 : 0.7);
          state = y > from && y < to ? 2 : 1;
        }
        if (state !== sc.live[i]) {
          sc.live[i] = state;
          el.style.visibility = state === 2 ? 'visible' : 'hidden';
          el.classList.toggle('o-paused', state !== 2);
          el.classList.toggle('o-laid', state === 1);
        }
      }
      if (native) {
        // Après les changements de visibilité ci-dessus : les animations sont créées sur un conteneur visible
        const si = this.scenes.indexOf(sc);
        for (let ci = 0; ci < sc.els.length; ci++) {
          const painted = sc.live[ci] === 2;
          const has = !!this.sceneAnims[si * 2 + ci];
          if (painted && !has) this.attachScene(si, ci);
          else if (!painted && has) this.detachScene(si, ci);
        }
      }
      if (!visible) continue;
      for (const l of sc.layers) {
        const ty = this.travel(y, sc.start, sc.end, l.d);
        const k = Math.min(l.d, 1.2);
        const dy = ty - my * k * 10;
        if (!native) l.el.style.transform = `translate3d(${(-mx * k * 18).toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
        // Calque qui coupe son contenu, entièrement hors de l'écran : neige, pluie, sable, lanternes en pause
        const off = l.clip && Math.abs(dy) > vh + 24;
        if (off !== l.off) {
          l.off = off;
          l.el.classList.toggle('o-paused', off);
        }
      }
    }

    // Ciel : fondu enchaîné d'une teinte à l'autre. Mode natif : les fondus sont des animations ; le script ne
    // montre que les ciels utiles (celui qui apparaît et celui qu'il recouvre), les autres ne sont ni peints ni composés
    let covered = false;
    for (let i = this.skies.length - 1; i >= 1; i--) {
      const sc = this.scenes[i];
      if (!sc) continue;
      const k = mobile ? smooth(clamp01((y - (sc.start - vh * 0.6)) / (vh * 0.6))) : smooth(clamp01((y - (sc.start - vh * 1.0)) / (vh * 0.9)));
      if (!native) this.skies[i].style.opacity = k.toFixed(3);
      else this.showSky(i, k > 0 && !covered);
      if (k >= 1) covered = true;
    }
    if (native) this.showSky(0, !covered);

    // Échiquier
    const pose = this.pagePose(y);
    let p = pose;
    if (this.gameMix > 0) {
      const g = gameLayout(this.vw, window.innerHeight);
      const from = this.gameFrom ?? pose;
      p = lerpPose(from, { x: g.x, y: g.y, s: g.G, orb: 1, front: 0, o: 1, tilt: 0, cap: 0 }, this.gameMix);
    }
    const k = p.s / this.G;
    // Téléphone, premier écran : l'échiquier (et sa légende) défilent avec la page, placés dans le document, au lieu
    // d'être replacés par le script à chaque image : le défilement natif va plus vite que le script, l'échiquier
    // sautait (vidéo du fondateur, Pixel 7). Dans ce lieu, sa position dans le document ne change pas. Mode natif :
    // sur toute la page (hors partie), ses poses étant jouées par une animation liée au défilement.
    const hero = this.sections[0];
    const flow = mobile && this.gameMix === 0 && !!hero && (native || y <= hero.end);
    if (flow !== this.flow) {
      this.flow = flow;
      this.astre.style.position = flow ? 'absolute' : '';
      if (this.els.caption) this.els.caption.style.position = flow ? 'absolute' : '';
      this.flowTop = flow ? this.flowOrigin() : 0;
      if (flow && native) this.buildAstreNative();
      else this.dropAstreNative();
      // Le script reprend (ou rend) la main : tout est réécrit à la prochaine image
      this.applied = { o: -1, co: -1, orb: -1, front: -1, tilt: -99, cap: -1, k: -1 };
    }
    const docY = this.flow ? y - this.flowTop : 0;
    const anim = this.flow && this.astreAnims.length > 0;
    const inHero = !!hero && y <= hero.end + vh * 0.36;
    if (!anim) this.astre.style.transform = `translate3d(${(p.x - this.G / 2).toFixed(2)}px, ${(p.y + docY - this.G / 2).toFixed(2)}px, 0) scale(${k.toFixed(4)})`;
    const a = this.applied;
    const kr = Math.round(k * 1000) / 1000;
    // Échelle de l'échiquier : la pièce glissée la compense pour rester sous le doigt. Mode natif : seule la partie
    // du héros se joue sur la page, à taille fixe ; ailleurs, rien à écrire (le style de tout l'astre serait recalculé)
    if (kr !== a.k && (!anim || y <= (hero?.end ?? 0))) {
      a.k = kr;
      this.astre.style.setProperty('--k', String(kr));
      this.astre.style.setProperty('--inv-k', String(Math.round((1 / Math.max(0.05, kr)) * 1000) / 1000));
    }
    if (anim) {
      // Calque 3D des sorts : visible seulement pendant un sort, échiquier posé ; son opacité suit celle de l'échiquier
      const co = Math.round(p.o * 100) / 100;
      if (co !== a.co && this.canvas) {
        a.co = co;
        this.canvas.style.opacity = String(co);
      }
    } else {
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
    }
    // Inclinaison. Mode natif : elle ne change pas pendant que l'échiquier est visible (tout l'astre serait restylé à
    // chaque image) : celle du héros jusqu'à la fin de son fondu, puis celle des emplacements (le héros fini,
    // l'échiquier n'est plus visible que posé dans le texte). Elle ne dépend que de la zone, jamais d'une opacité
    // qu'un geste rapide pourrait sauter
    let tiltRad = p.tilt;
    if (anim) tiltRad = inHero ? this.pose('hero').tilt * (1 - smooth(this.awake)) : SLOT_TILT;
    const tilt = Math.round(((tiltRad * 180) / Math.PI) * 10) / 10;
    if (tilt !== a.tilt) {
      a.tilt = tilt;
      this.astre.style.setProperty('--base-tilt', `${tilt}deg`);
    }
    if (this.els.caption) {
      const show = this.gameMix === 0 && p.s > 200 && p.o > 0.9 && (p.cap > 0.5 || this.hover) ? 1 : 0;
      // Mobile : la perspective agrandit le bas du cadre ; la légende garde un peu d'air dessous
      const below = mobile ? p.s * 0.5 * Math.cos(p.tilt) + 36 : p.s * 0.5 + 34;
      // Légende cachée : elle ne bouge pas (rien à écrire)
      if (show || a.cap !== 0 || !anim) this.els.caption.style.transform = `translate3d(${p.x.toFixed(1)}px, ${(p.y + below + docY).toFixed(1)}px, 0) translateX(-50%)`;
      if (show !== a.cap) {
        a.cap = show;
        this.els.caption.style.opacity = String(show);
        this.els.caption.style.visibility = show ? 'visible' : 'hidden';
      }
    }
    // Échiquier effacé (entre deux emplacements, ou dans la nuée) : il ne capte plus les touchers, qui vont au texte
    // dessous (sinon toucher un lien par-dessus l'échiquier invisible ouvrirait la partie)
    const touchable = p.o > 0.05 || this.gameMix > 0;
    if (touchable !== this.touchable) {
      this.touchable = touchable;
      this.astre.style.pointerEvents = touchable ? '' : 'none';
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
    return true;
  }
}
